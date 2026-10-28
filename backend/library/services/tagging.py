"""Reading and writing metadata of mp3 (ID3), m4a (MP4 atoms) and FLAC (Vorbis comments) files via mutagen."""

import re
from dataclasses import dataclass
from pathlib import Path

from mutagen.flac import FLAC, Picture
from mutagen.id3 import APIC, ID3, TALB, TCON, TDRC, TIT2, TPE1, TPE2, TRCK, ID3NoHeaderError
from mutagen.mp3 import MP3, HeaderNotFoundError
from mutagen.mp4 import MP4, MP4Cover


class InvalidAudioFile(Exception):
    pass


@dataclass
class TrackMeta:
    title: str = ""
    artist: str = ""
    album: str = ""
    album_artist: str = ""
    genre: str = ""
    year: int | None = None
    track_number: int | None = None
    disc_number: int | None = None
    duration: float = 0.0
    bitrate: int | None = None
    picture: bytes | None = None
    # "mp3", "aac", "alac" or "flac"
    codec: str = ""


def _leading_int(value: str) -> int | None:
    match = re.match(r"\s*(\d+)", value or "")
    return int(match.group(1)) if match else None


def _year(value: str) -> int | None:
    match = re.search(r"(\d{4})", value or "")
    if not match:
        return None
    year = int(match.group(1))
    return year if 1000 <= year <= 9999 else None


def image_mime(data: bytes) -> str:
    return "image/png" if data.startswith(b"\x89PNG") else "image/jpeg"


_LOADERS = {".mp3": MP3, ".m4a": MP4, ".flac": FLAC}


def load_audio(path: Path) -> MP3 | MP4 | FLAC:
    loader = _LOADERS.get(path.suffix.lower())
    if loader is None:
        raise InvalidAudioFile(f"{path.name}: unsupported file type")
    kind = path.suffix.lower().lstrip(".")
    try:
        audio = loader(path)
    except HeaderNotFoundError as exc:
        raise InvalidAudioFile(f"{path.name}: no mp3 audio frames found") from exc
    except Exception as exc:  # mutagen raises a variety of parser errors
        raise InvalidAudioFile(f"{path.name}: not a valid {kind} file ({exc})") from exc
    if isinstance(audio, MP4) and not audio.info.codec:
        raise InvalidAudioFile(f"{path.name}: the file contains no audio track")
    return audio


def _codec(audio) -> str:
    if isinstance(audio, MP4):
        return "alac" if audio.info.codec == "alac" else "aac"
    return "flac" if isinstance(audio, FLAC) else "mp3"


def _read_id3(tags) -> dict:
    def text(frame_id: str) -> str:
        frame = tags.get(frame_id) if tags is not None else None
        if frame is None or not getattr(frame, "text", None):
            return ""
        return str(frame.text[0]).strip()

    picture = None
    if tags is not None:
        pictures = tags.getall("APIC")
        front = [p for p in pictures if p.type == 3]
        chosen = (front or pictures or [None])[0]
        picture = chosen.data if chosen is not None and chosen.data else None

    return {
        "title": text("TIT2"),
        "artist": text("TPE1"),
        "album": text("TALB"),
        "album_artist": text("TPE2"),
        "genre": text("TCON"),
        "year": _year(text("TDRC") or text("TYER")),
        "track_number": _leading_int(text("TRCK")),
        "disc_number": _leading_int(text("TPOS")),
        "picture": picture,
    }


def _read_mp4(tags) -> dict:
    tags = tags or {}

    def text(key: str) -> str:
        values = tags.get(key) or [""]
        return str(values[0]).strip()

    def number(key: str) -> int | None:
        values = tags.get(key)
        if not values or not values[0]:
            return None
        return values[0][0] or None

    covers = tags.get("covr") or []
    return {
        "title": text("\xa9nam"),
        "artist": text("\xa9ART"),
        "album": text("\xa9alb"),
        "album_artist": text("aART"),
        "genre": text("\xa9gen"),
        "year": _year(text("\xa9day")),
        "track_number": number("trkn"),
        "disc_number": number("disk"),
        "picture": bytes(covers[0]) if covers else None,
    }


def _read_flac(audio: FLAC) -> dict:
    tags = audio.tags

    def text(key: str) -> str:
        values = tags.get(key) if tags is not None else None
        return str(values[0]).strip() if values else ""

    front = [p for p in audio.pictures if p.type == 3]
    chosen = (front or audio.pictures or [None])[0]
    return {
        "title": text("title"),
        "artist": text("artist"),
        "album": text("album"),
        "album_artist": text("albumartist"),
        "genre": text("genre"),
        "year": _year(text("date")),
        "track_number": _leading_int(text("tracknumber")),
        "disc_number": _leading_int(text("discnumber")),
        "picture": chosen.data if chosen is not None and chosen.data else None,
    }


def read_tags(path: Path) -> TrackMeta:
    audio = load_audio(path)
    if isinstance(audio, MP4):
        fields = _read_mp4(audio.tags)
    elif isinstance(audio, FLAC):
        fields = _read_flac(audio)
    else:
        fields = _read_id3(audio.tags)
    return TrackMeta(
        **fields,
        duration=float(audio.info.length or 0),
        bitrate=int(getattr(audio.info, "bitrate", 0) or 0) or None,
        codec=_codec(audio),
    )


def _write_id3(path: Path, values: dict, picture: tuple[bytes, str] | None) -> None:
    try:
        tags = ID3(path)
    except ID3NoHeaderError:
        tags = ID3()

    frames = {
        "TIT2": (TIT2, values["title"]),
        "TPE1": (TPE1, values["artist"]),
        "TALB": (TALB, values["album"]),
        "TPE2": (TPE2, values["album_artist"]),
        "TCON": (TCON, values["genre"]),
        "TDRC": (TDRC, values["year"]),
        "TRCK": (TRCK, values["track_number"]),
    }
    for frame_id, (frame_cls, value) in frames.items():
        tags.delall(frame_id)
        if frame_id == "TDRC":
            tags.delall("TYER")
        if value:
            tags.add(frame_cls(encoding=3, text=[value]))

    if picture is not None:
        data, mime = picture
        tags.delall("APIC")
        tags.add(APIC(encoding=3, mime=mime, type=3, desc="cover", data=data))

    # ID3v2.3 is what most players (and the previous version of this app) understand.
    tags.save(path, v2_version=3)


def _write_mp4(audio: MP4, values: dict, picture: tuple[bytes, str] | None) -> None:
    if audio.tags is None:
        audio.add_tags()
    tags = audio.tags
    keys = {
        "\xa9nam": values["title"],
        "\xa9ART": values["artist"],
        "\xa9alb": values["album"],
        "aART": values["album_artist"],
        "\xa9gen": values["genre"],
        "\xa9day": values["year"],
    }
    for key, value in keys.items():
        if value:
            tags[key] = [value]
        else:
            tags.pop(key, None)
    if values["track_number"]:
        tags["trkn"] = [(int(values["track_number"]), 0)]
    else:
        tags.pop("trkn", None)

    if picture is not None:
        data, mime = picture
        image_format = MP4Cover.FORMAT_PNG if mime == "image/png" else MP4Cover.FORMAT_JPEG
        tags["covr"] = [MP4Cover(data, imageformat=image_format)]
    audio.save()


def _write_flac(audio: FLAC, values: dict, picture: tuple[bytes, str] | None) -> None:
    if audio.tags is None:
        audio.add_tags()
    keys = {
        "title": values["title"],
        "artist": values["artist"],
        "album": values["album"],
        "albumartist": values["album_artist"],
        "genre": values["genre"],
        "date": values["year"],
        "tracknumber": values["track_number"],
    }
    for key, value in keys.items():
        if value:
            audio.tags[key] = [value]
        elif key in audio.tags:
            del audio.tags[key]

    if picture is not None:
        data, mime = picture
        cover = Picture()
        cover.type = 3
        cover.mime = mime
        cover.desc = "cover"
        cover.data = data
        audio.clear_pictures()
        audio.add_picture(cover)
    audio.save()


def write_tags(
    path: Path,
    *,
    title: str,
    artist: str,
    album: str = "",
    album_artist: str = "",
    genre: str = "",
    year: int | None = None,
    track_number: int | None = None,
    picture: tuple[bytes, str] | None = None,
) -> None:
    """Write the common tags. Empty values remove the tag; ``picture`` replaces the cover."""
    audio = load_audio(path)  # validate before touching the file
    values = {
        "title": title,
        "artist": artist,
        "album": album,
        "album_artist": album_artist,
        "genre": genre,
        "year": str(year) if year else "",
        "track_number": str(track_number) if track_number else "",
    }
    if isinstance(audio, MP4):
        _write_mp4(audio, values, picture)
    elif isinstance(audio, FLAC):
        _write_flac(audio, values, picture)
    else:
        _write_id3(path, values, picture)


def write_picture(path: Path, data: bytes) -> None:
    """Embed ``data`` as the front cover, keeping all other tags."""
    meta = read_tags(path)
    write_tags(
        path,
        title=meta.title,
        artist=meta.artist,
        album=meta.album,
        album_artist=meta.album_artist,
        genre=meta.genre,
        year=meta.year,
        track_number=meta.track_number,
        picture=(data, image_mime(data)),
    )
