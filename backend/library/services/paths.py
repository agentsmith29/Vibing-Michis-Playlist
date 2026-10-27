"""Filesystem helpers: safe file names and paths confined to a root folder."""

import re
import unicodedata
from pathlib import Path

AUDIO_EXTENSIONS = {".mp3"}

_FORBIDDEN = re.compile(r'[\x00-\x1f\x7f/\\:*?"<>|]')
_MAX_NAME_LENGTH = 180


def safe_filename(name: str, default: str = "untitled") -> str:
    """Turn arbitrary user/tag input into a file name that is safe on all platforms."""
    name = unicodedata.normalize("NFC", name)
    name = _FORBIDDEN.sub("", name)
    name = re.sub(r"\s+", " ", name).strip(" .")
    if not name:
        return default
    stem, dot, ext = name.rpartition(".")
    if dot and len(ext) <= 5 and stem:
        return stem[: _MAX_NAME_LENGTH - len(ext) - 1].rstrip(" .") + "." + ext
    return name[:_MAX_NAME_LENGTH].rstrip(" .") or default


def unique_path(path: Path) -> Path:
    """Return ``path`` or ``path (2)``, ``path (3)``... whichever does not exist yet."""
    if not path.exists():
        return path
    for counter in range(2, 10_000):
        candidate = path.with_name(f"{path.stem} ({counter}){path.suffix}")
        if not candidate.exists():
            return candidate
    raise FileExistsError(f"No free file name for {path}")


def resolve_within(root: Path, relative: str) -> Path:
    """Join ``relative`` onto ``root`` and refuse anything that escapes ``root``."""
    root = root.resolve()
    candidate = (root / relative).resolve()
    if not candidate.is_relative_to(root):
        raise ValueError("Path escapes the library root")
    return candidate


def relative_to_root(root: Path, path: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def is_audio_file(path: Path) -> bool:
    return path.suffix.lower() in AUDIO_EXTENSIONS and not path.name.startswith(".")
