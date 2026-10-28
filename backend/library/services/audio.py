"""Storage formats of the library and converting audio into them (via ffmpeg)."""

import subprocess
from dataclasses import dataclass
from pathlib import Path

from library.models import ImportSettings
from library.services.paths import AUDIO_EXTENSIONS
from library.services.tagging import read_tags, write_picture

CONVERT_TIMEOUT = 30 * 60

CODEC_LABELS = {"aac": "AAC", "alac": "ALAC", "flac": "FLAC", "mp3": "MP3", "opus": "Opus", "vorbis": "Vorbis", "pcm": "PCM"}
LOSSLESS_CODECS = {"alac", "flac", "pcm", "wavpack", "ape", "tta", "truehd", "mlp"}


class ConversionError(Exception):
    pass


@dataclass(frozen=True)
class StorageFormat:
    key: str
    label: str
    description: str
    extension: str
    codec: str
    lossless: bool
    encoder: tuple[str, ...]

    def as_dict(self) -> dict:
        return {
            "key": self.key,
            "label": self.label,
            "description": self.description,
            "extension": self.extension,
            "lossless": self.lossless,
        }


STORAGE_FORMATS = {
    f.key: f
    for f in (
        StorageFormat("aac", "AAC", "AAC streams are kept as they are, others are encoded at 256 kbit/s", ".m4a", "aac", False, ("-c:a", "aac", "-b:a", "256k")),
        StorageFormat("mp3", "MP3", "MP3 streams are kept as they are, others are encoded at 320 kbit/s", ".mp3", "mp3", False, ("-c:a", "libmp3lame", "-b:a", "320k")),
        StorageFormat("flac", "FLAC", "Lossless, plays everywhere", ".flac", "flac", True, ("-c:a", "flac", "-compression_level", "8")),
        StorageFormat("alac", "ALAC", "Apple Lossless; plays in Safari and on iPhone, not in Chrome or Firefox", ".m4a", "alac", True, ("-c:a", "alac")),
    )
}


def normalize_codec(codec: str) -> str:
    """Map codec names from yt-dlp/ffmpeg ("mp4a.40.2", "pcm_s16le", ...) to the short names used here."""
    codec = (codec or "").lower()
    if codec.startswith("mp4a") or codec == "aac":
        return "aac"
    if codec.startswith("pcm"):
        return "pcm"
    return codec


def is_lossless(codec: str) -> bool:
    return normalize_codec(codec) in LOSSLESS_CODECS


def default_storage(lossless: bool) -> StorageFormat:
    settings = ImportSettings.load()
    return STORAGE_FORMATS[settings.lossless_format if lossless else settings.lossy_format]


def convert(source: Path, storage: StorageFormat, target: Path, source_codec: str) -> Path:
    """Write the first audio stream of ``source`` to ``target`` + extension in ``storage`` format.

    The stream is copied unchanged when it already has the right codec, so no quality is lost.
    Text tags are carried over; cover art is not (ffmpeg cannot convert it between containers).
    """
    target = target.with_name(target.name + storage.extension)
    if target == source:
        raise ValueError("Source and target are the same file")
    codec_args = ("-c:a", "copy") if normalize_codec(source_codec) == storage.codec else storage.encoder
    command = [
        "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(source),
        "-map", "0:a:0", "-map_metadata", "0",
        *codec_args,
    ]
    if storage.extension == ".m4a":
        command += ["-movflags", "+faststart"]  # lets players start before the whole file is loaded
    command.append(str(target))
    try:
        process = subprocess.run(command, capture_output=True, text=True, timeout=CONVERT_TIMEOUT)
    except FileNotFoundError as exc:
        raise ConversionError("ffmpeg is not installed") from exc
    except subprocess.TimeoutExpired as exc:
        target.unlink(missing_ok=True)
        raise ConversionError("Converting the audio took too long") from exc
    if process.returncode != 0:
        target.unlink(missing_ok=True)
        lines = process.stderr.strip().splitlines()
        raise ConversionError(f"Could not convert the audio: {lines[-1] if lines else 'ffmpeg failed'}")
    return target


def prepare_upload(path: Path) -> Path:
    """Validate an uploaded file and return the file to store.

    Lossy files (MP3, AAC) are kept unchanged: converting them would only lose quality.
    Lossless files (FLAC, ALAC, WAV, AIFF) are stored in the lossless format from the settings.
    """
    if path.suffix.lower() in AUDIO_EXTENSIONS:
        meta = read_tags(path)  # also validates the file
        codec, picture = meta.codec, meta.picture
    else:
        codec, picture = "pcm", None  # WAV/AIFF: ffmpeg validates it while converting
    if not is_lossless(codec):
        return path
    storage = default_storage(lossless=True)
    if codec == storage.codec and path.suffix.lower() == storage.extension:
        return path
    converted = convert(path, storage, path.with_name(f"{path.stem}.stored"), codec)
    try:
        if picture:
            write_picture(converted, picture)
    except BaseException:
        converted.unlink(missing_ok=True)
        raise
    return converted
