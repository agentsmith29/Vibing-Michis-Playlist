"""Keeps the database in sync with the music folder."""

import logging
import os
from collections.abc import Callable, Iterator
from pathlib import Path

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Q

from library.models import Album, Artist, Track
from library.services.artwork import prune_artwork, store_artwork
from library.services.paths import is_audio_file, relative_to_root
from library.services.tagging import read_tags

logger = logging.getLogger(__name__)

UNKNOWN_ARTIST = "Unknown Artist"

ProgressCallback = Callable[[int, str], None]


def iter_audio_files(root: Path) -> Iterator[Path]:
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        dirnames[:] = sorted(d for d in dirnames if not d.startswith("."))
        for filename in sorted(filenames):
            path = Path(dirpath) / filename
            if is_audio_file(path):
                yield path


def get_or_create_artist(name: str) -> Artist:
    name = (name or UNKNOWN_ARTIST).strip()[:255] or UNKNOWN_ARTIST
    artist = Artist.objects.filter(name__iexact=name).first()
    if artist:
        return artist
    try:
        with transaction.atomic():
            return Artist.objects.create(name=name)
    except IntegrityError:
        return Artist.objects.get(name__iexact=name)


def get_or_create_album(title: str, artist: Artist, year: int | None) -> Album:
    title = title.strip()[:255]
    album = Album.objects.filter(title__iexact=title, artist=artist).first()
    if album is None:
        try:
            with transaction.atomic():
                album = Album.objects.create(title=title, artist=artist, year=year)
        except IntegrityError:
            album = Album.objects.get(title__iexact=title, artist=artist)
    elif year and not album.year:
        album.year = year
        album.save(update_fields=["year"])
    return album


def index_file(path: Path) -> Track:
    """Read the tags of ``path`` and create or update its Track row."""
    root = settings.MUSIC_ROOT
    meta = read_tags(path)
    stat = path.stat()

    artist = get_or_create_artist(meta.artist)
    album = None
    if meta.album:
        album_artist = get_or_create_artist(meta.album_artist) if meta.album_artist else artist
        album = get_or_create_album(meta.album, album_artist, meta.year)

    artwork = store_artwork(meta.picture)
    if album is not None and artwork is not None and album.artwork_id is None:
        album.artwork = artwork
        album.save(update_fields=["artwork"])

    track, _ = Track.objects.update_or_create(
        file_path=relative_to_root(root, path),
        defaults={
            "title": (meta.title or path.stem)[:500],
            "artist": artist,
            "album": album,
            "genre": meta.genre[:100],
            "year": meta.year,
            "track_number": meta.track_number,
            "disc_number": meta.disc_number,
            "duration": meta.duration,
            "bitrate": meta.bitrate,
            "artwork": artwork,
            "file_size": stat.st_size,
            "file_mtime": stat.st_mtime,
        },
    )
    return track


def prune_orphans() -> None:
    """Remove albums, artists and cover art that no longer have any tracks."""
    Album.objects.filter(tracks__isnull=True).delete()
    Artist.objects.filter(Q(tracks__isnull=True) & Q(albums__isnull=True)).delete()
    prune_artwork()


def scan_library(progress: ProgressCallback | None = None) -> dict:
    """Index new/changed files and drop tracks whose files disappeared."""
    root = settings.MUSIC_ROOT
    if not root.is_dir():
        raise FileNotFoundError(f"Music folder {root} does not exist")

    known = {path: (size, mtime) for path, size, mtime in Track.objects.values_list("file_path", "file_size", "file_mtime")}
    files = list(iter_audio_files(root))
    total = len(files)
    seen: set[str] = set()
    stats = {"total": total, "added": 0, "updated": 0, "removed": 0, "errors": 0}

    for number, path in enumerate(files, start=1):
        relative = relative_to_root(root, path)
        seen.add(relative)
        try:
            stat = path.stat()
            previous = known.get(relative)
            if previous and previous[0] == stat.st_size and abs(previous[1] - stat.st_mtime) < 0.001:
                continue
            index_file(path)
            stats["updated" if previous else "added"] += 1
        except Exception as exc:  # one broken file must not abort the scan
            stats["errors"] += 1
            logger.warning("Could not index %s: %s", relative, exc)
        if progress and (number % 25 == 0 or number == total):
            progress(int(number / max(total, 1) * 95), f"Scanned {number} of {total} files")

    missing = [path for path in known if path not in seen]
    if missing and not files:
        # An empty folder while the database has tracks almost always means the
        # volume is not mounted. Refuse to wipe the library (and its playlists).
        logger.error("Music folder %s is empty; skipping removal of %d tracks", root, len(missing))
        stats["errors"] += 1
    elif missing:
        for start in range(0, len(missing), 500):
            stats["removed"] += Track.objects.filter(file_path__in=missing[start : start + 500]).delete()[1].get(
                "library.Track", 0
            )

    prune_orphans()
    return stats
