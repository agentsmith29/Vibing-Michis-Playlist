"""Reading and writing ID3 metadata of mp3 files (via mutagen)."""

import re
from dataclasses import dataclass
from pathlib import Path

from mutagen.id3 import APIC, ID3, TALB, TCON, TDRC, TIT2, TPE1, TPE2, TRCK, ID3NoHeaderError
from mutagen.mp3 import MP3, HeaderNotFoundError


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


def _leading_int(value: str) -> int | None:
    match = re.match(r"\s*(\d+)", value or "")
    return int(match.group(1)) if match else None


def _year(value: str) -> int | None:
    match = re.search(r"(\d{4})", value or "")
    if not match:
        return None
    year = int(match.group(1))
    return year if 1000 <= year <= 9999 else None


def load_mp3(path: Path) -> MP3:
    try:
        return MP3(path)
    except HeaderNotFoundError as exc:
        raise InvalidAudioFile(f"{path.name}: no mp3 audio frames found") from exc
    except Exception as exc:  # mutagen raises a variety of parser errors
        raise InvalidAudioFile(f"{path.name}: not a valid mp3 file ({exc})") from exc


def read_tags(path: Path) -> TrackMeta:
    audio = load_mp3(path)
    tags = audio.tags

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

    return TrackMeta(
        title=text("TIT2"),
        artist=text("TPE1"),
        album=text("TALB"),
        album_artist=text("TPE2"),
        genre=text("TCON"),
        year=_year(text("TDRC") or text("TYER")),
        track_number=_leading_int(text("TRCK")),
        disc_number=_leading_int(text("TPOS")),
        duration=float(audio.info.length or 0),
        bitrate=int(audio.info.bitrate or 0) or None,
        picture=picture,
    )


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
    """Write the common tags. Empty values remove the frame; ``picture`` replaces the cover."""
    load_mp3(path)  # validate before touching the file
    try:
        tags = ID3(path)
    except ID3NoHeaderError:
        tags = ID3()

    frames = {
        "TIT2": (TIT2, title),
        "TPE1": (TPE1, artist),
        "TALB": (TALB, album),
        "TPE2": (TPE2, album_artist),
        "TCON": (TCON, genre),
        "TDRC": (TDRC, str(year) if year else ""),
        "TRCK": (TRCK, str(track_number) if track_number else ""),
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
