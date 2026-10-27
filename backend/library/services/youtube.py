"""Downloading audio from YouTube as mp3 (via yt-dlp + ffmpeg)."""

import importlib.metadata
import re
from collections.abc import Callable
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse

from django.conf import settings

ALLOWED_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"}
MAX_FILESIZE = 600 * 1024 * 1024

_NOISE = re.compile(
    r"\((?:[^)]*)\)|\[(?:[^\]]*)\]|\b(official|music|lyrics?|video|audio|hd|hq|4k|remastered|visualizer)\b",
    re.IGNORECASE,
)


class YouTubeError(Exception):
    pass


def normalize_url(url: str) -> str:
    """Validate that ``url`` points to a single YouTube video and strip extra parameters."""
    parsed = urlparse(url.strip())
    host = (parsed.hostname or "").lower()
    if parsed.scheme not in ("http", "https") or host not in ALLOWED_HOSTS:
        raise YouTubeError("Please enter a valid YouTube link")
    if host == "youtu.be":
        video_id = parsed.path.strip("/").split("/")[0]
    elif parsed.path.startswith(("/shorts/", "/live/")):
        video_id = parsed.path.split("/")[2]
    else:
        video_id = (parse_qs(parsed.query).get("v") or [""])[0]
    if not re.fullmatch(r"[A-Za-z0-9_-]{6,20}", video_id or ""):
        raise YouTubeError("The link does not contain a YouTube video id")
    return "https://www.youtube.com/watch?" + urlencode({"v": video_id})


def clean_title(title: str) -> str:
    """Remove the typical YouTube noise ("(Official Video)", "[HD]", ...) from a title."""
    title = _NOISE.sub(" ", title)
    title = re.sub(r"\s*[|•]\s*.*$", "", title)
    title = re.sub(r"\s+-\s+", " ", title)
    return re.sub(r"\s+", " ", title).strip(" -")


def suggest_query(info: dict) -> str:
    if info.get("artist") and info.get("track"):
        return f"{info['artist'].split(',')[0]} {info['track']}"
    return clean_title(info.get("title") or "")


def fallback_metadata(info: dict) -> dict:
    """Best-effort tags from the video itself, used when no online match exists."""
    title = info.get("track") or info.get("title") or "Unknown Title"
    artist = info.get("artist") or (info.get("uploader") or "").removesuffix(" - Topic") or "Unknown Artist"
    if not info.get("track") and " - " in title:
        artist, _, title = title.partition(" - ")
    upload_date = info.get("release_year") or (info.get("upload_date") or "")[:4]
    thumbnail = info.get("thumbnail") or ""
    return {
        "title": clean_title(title) or title,
        "artist": artist.split(",")[0].strip(),
        "album": info.get("album") or "",
        "album_artist": "",
        "genre": "",
        "year": int(upload_date) if str(upload_date).isdigit() else None,
        "track_number": None,
        "duration": info.get("duration") or 0,
        "artwork_url": thumbnail,
        "artwork_preview": thumbnail,
        "score": 0.0,
    }


def download_audio(url: str, target_dir: Path, progress: Callable[[float], None] | None = None) -> tuple[Path, dict]:
    """Download ``url`` into ``target_dir`` as mp3. Returns the file path and video info."""
    import yt_dlp  # imported lazily: heavy, and may be replaced by a newer version at runtime

    target_dir.mkdir(parents=True, exist_ok=True)

    def hook(status: dict) -> None:
        if progress and status.get("status") == "downloading":
            total = status.get("total_bytes") or status.get("total_bytes_estimate") or 0
            if total:
                progress(status.get("downloaded_bytes", 0) / total)

    options = {
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "noplaylist": True,
        "format": "bestaudio/best",
        "outtmpl": str(target_dir / "%(id)s.%(ext)s"),
        "max_filesize": MAX_FILESIZE,
        "cachedir": str(settings.DATA_DIR / "cache" / "yt-dlp"),
        "progress_hooks": [hook],
        "postprocessors": [{"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "192"}],
    }
    try:
        with yt_dlp.YoutubeDL(options) as ydl:
            info = ydl.extract_info(url, download=True)
    except Exception as exc:
        message = re.sub(r"\x1b\[[0-9;]*m", "", str(exc))
        raise YouTubeError(f"Download failed: {message}") from exc

    path = target_dir / f"{info['id']}.mp3"
    if not path.exists():
        raise YouTubeError("Download finished but no mp3 file was produced (is ffmpeg installed?)")
    keys = ("id", "title", "uploader", "duration", "thumbnail", "artist", "track", "album", "release_year", "upload_date")
    return path, {key: info.get(key) for key in keys}


def ytdlp_version() -> dict:
    """Version of yt-dlp that the worker will use (runtime update overrides the bundled one)."""
    bundled = importlib.metadata.version("yt-dlp")
    overlay = settings.YTDLP_OVERLAY_DIR
    updated = None
    if overlay.is_dir():
        for dist in importlib.metadata.distributions(path=[str(overlay)]):
            if dist.metadata["Name"].lower() == "yt-dlp":
                updated = dist.version
    return {"bundled": bundled, "updated": updated, "active": updated or bundled}
