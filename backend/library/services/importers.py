"""Adding music to the library: file uploads, zip archives and YouTube downloads."""

import logging
import os
import re
import shutil
import tempfile
import zipfile
from collections.abc import Callable, Iterable
from typing import BinaryIO
from pathlib import Path, PurePosixPath

from django.conf import settings
from django.core.files.uploadedfile import UploadedFile
from django.db import transaction
from django.db.models import Max

from library.models import Playlist, PlaylistEntry, Track
from library.services.audio import ConversionError, prepare_upload
from library.services.indexer import index_file
from library.services.metadata import MetadataError, fetch_artwork
from library.services.paths import UPLOAD_EXTENSIONS, safe_filename, unique_path
from library.services.tagging import write_tags

logger = logging.getLogger(__name__)

MAX_ZIP_MEMBERS = 5000
PLAYLIST_EXTENSIONS = {".m3u", ".m3u8"}


class ImportFailed(Exception):
    """Raised for user-facing import problems (bad file, too large, ...)."""


def append_to_playlist(playlist: Playlist, tracks: Iterable[Track]) -> int:
    with transaction.atomic():
        Playlist.objects.select_for_update().filter(pk=playlist.pk).first()
        start = (playlist.entries.aggregate(m=Max("position"))["m"] or 0) + 1
        entries = [PlaylistEntry(playlist=playlist, track=t, position=start + i) for i, t in enumerate(tracks)]
        PlaylistEntry.objects.bulk_create(entries)
        playlist.save(update_fields=["updated_at"])
    return len(entries)


def _install_file(write: Callable[[BinaryIO], None], destination: Path) -> Track:
    """Write a file via ``write(handle)`` next to ``destination``, validate (and maybe convert) it,
    move it in place and index it. Converted files get the extension of their new format.

    Temporary names start with a dot so a concurrent library scan ignores them.
    """
    destination.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(dir=destination.parent, prefix=".upload-", suffix=destination.suffix.lower())
    tmp = stored = Path(tmp_name)
    try:
        with os.fdopen(fd, "wb") as handle:
            write(handle)
        stored = prepare_upload(tmp)
        os.chmod(stored, 0o644)
        final = unique_path(destination.with_suffix(stored.suffix))
        os.replace(stored, final)
    except BaseException:
        stored.unlink(missing_ok=True)
        raise
    finally:
        tmp.unlink(missing_ok=True)
    return index_file(final)


def save_uploaded_file(upload: UploadedFile) -> Track:
    name = safe_filename(upload.name or "upload.mp3")
    if Path(name).suffix.lower() not in UPLOAD_EXTENSIONS:
        raise ImportFailed(f"{upload.name}: only mp3, m4a, flac, wav and aiff files are supported")
    if upload.size and upload.size > settings.MAX_UPLOAD_FILE_SIZE:
        raise ImportFailed(f"{upload.name}: file is too large")

    def write(handle):
        for chunk in upload.chunks():
            handle.write(chunk)

    try:
        return _install_file(write, settings.MUSIC_ROOT / name)
    except ConversionError as exc:
        raise ImportFailed(f"{upload.name}: {exc}") from exc


def _natural_key(text: str) -> list:
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", text)]


def _playlist_order(archive: zipfile.ZipFile, members: list[zipfile.ZipInfo]) -> list[str]:
    """File names in the order given by an m3u playlist inside the archive (if any)."""
    for member in members:
        if PurePosixPath(member.filename).suffix.lower() in PLAYLIST_EXTENSIONS and member.file_size < 1024 * 1024:
            raw = archive.read(member)
            text = raw.decode("utf-8", errors="replace")
            return [
                PurePosixPath(line.strip().replace("\\", "/")).name
                for line in text.splitlines()
                if line.strip() and not line.startswith("#")
            ]
    return []


def import_zip(
    archive_path: Path,
    *,
    folder_name: str,
    playlist_name: str | None,
    source_name: str = "",
    progress: Callable[[int, str], None] | None = None,
) -> dict:
    """Extract all audio files of a zip archive into a new library folder.

    Only audio members are extracted, every member is flattened to its base name
    (no path traversal possible) and sizes are enforced while extracting.
    """
    try:
        archive = zipfile.ZipFile(archive_path)
    except zipfile.BadZipFile as exc:
        raise ImportFailed("The uploaded file is not a valid zip archive") from exc

    with archive:
        members = [
            m
            for m in archive.infolist()
            if not m.is_dir()
            and "__MACOSX" not in m.filename
            and not PurePosixPath(m.filename).name.startswith(".")
        ]
        audio = [m for m in members if PurePosixPath(m.filename).suffix.lower() in UPLOAD_EXTENSIONS]
        if not audio:
            raise ImportFailed("The archive does not contain any audio files")
        if len(audio) > MAX_ZIP_MEMBERS:
            raise ImportFailed(f"The archive contains more than {MAX_ZIP_MEMBERS} files")
        if sum(m.file_size for m in audio) > settings.MAX_ZIP_UNCOMPRESSED_SIZE:
            raise ImportFailed("The archive is too large once extracted")

        order = _playlist_order(archive, members)
        audio.sort(key=lambda m: _natural_key(m.filename))
        if order:
            rank = {name.lower(): index for index, name in enumerate(order)}
            audio.sort(key=lambda m: rank.get(PurePosixPath(m.filename).name.lower(), len(rank)))

        folder = unique_path(settings.MUSIC_ROOT / safe_filename(folder_name, default="Imported"))
        folder.mkdir(parents=True)

        budget = settings.MAX_ZIP_UNCOMPRESSED_SIZE
        tracks: list[Track] = []
        errors: list[str] = []
        for number, member in enumerate(audio, start=1):
            name = safe_filename(PurePosixPath(member.filename.replace("\\", "/")).name)

            def write(handle, member=member):
                nonlocal budget
                with archive.open(member) as source:
                    while chunk := source.read(1024 * 1024):
                        budget -= len(chunk)
                        if budget < 0:
                            raise ImportFailed("The archive is too large once extracted")
                        handle.write(chunk)

            try:
                tracks.append(_install_file(write, folder / name))
            except ImportFailed:
                raise
            except Exception as exc:
                errors.append(f"{name}: {exc}")
                logger.warning("Skipping %s from zip: %s", name, exc)
            if progress:
                progress(int(number / len(audio) * 95), f"Imported {number} of {len(audio)} files")

    if not tracks:
        shutil.rmtree(folder, ignore_errors=True)
        raise ImportFailed("None of the files in the archive could be imported")

    playlist = None
    if playlist_name:
        playlist = Playlist.objects.create(
            name=playlist_name[:200], description=f"Imported from {source_name or archive_path.name}"
        )
        append_to_playlist(playlist, tracks)

    return {
        "imported": len(tracks),
        "errors": errors,
        "folder": folder.name,
        "playlist_id": playlist.id if playlist else None,
        "track_ids": [t.id for t in tracks],
    }


def apply_metadata(path: Path, data: dict) -> None:
    """Write user-confirmed metadata (and optionally a cover from ``artwork_url``) to ``path``."""
    picture = None
    if data.get("artwork_url"):
        try:
            picture = fetch_artwork(data["artwork_url"])
        except MetadataError as exc:
            logger.warning("Could not fetch artwork: %s", exc)
    write_tags(
        path,
        title=data["title"],
        artist=data["artist"],
        album=data.get("album") or "",
        album_artist=data.get("album_artist") or "",
        genre=data.get("genre") or "",
        year=data.get("year"),
        track_number=data.get("track_number"),
        picture=picture,
    )


def finalize_download(source: Path, data: dict) -> Track:
    """Tag a downloaded file and move it into the library root (flat, named after the title)."""
    apply_metadata(source, data)
    destination = unique_path(settings.MUSIC_ROOT / safe_filename(f"{data['title']}{source.suffix.lower()}"))
    tmp = destination.with_name(f".incoming-{destination.name}")
    shutil.move(source, tmp)  # may cross file systems: copy to a hidden name first
    os.chmod(tmp, 0o644)
    os.replace(tmp, destination)
    return index_file(destination)
