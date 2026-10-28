"""Downloading audio from YouTube (via yt-dlp)."""

import importlib.metadata
import json
import os
import re
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse

from django.conf import settings

from library.services.audio import CODEC_LABELS, is_lossless, normalize_codec

ALLOWED_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"}
MAX_FILESIZE = 600 * 1024 * 1024
FORMAT_ID = re.compile(r"[A-Za-z0-9_.-]{1,40}")
# Without a choice: the best AAC stream (kept unchanged as .m4a), otherwise the best audio there is.
DEFAULT_FORMAT = "bestaudio[acodec^=mp4a]/bestaudio/best"

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


def _strip_ansi(text: str) -> str:
    return re.sub(r"\x1b\[[0-9;]*m", "", text)


def fetch_info(url: str) -> dict:
    """Video details and available formats, without downloading.

    Runs yt-dlp in a separate process so the API always uses the newest installed
    version (see ``ytdlp_version``) without having to be restarted.
    """
    env = dict(os.environ)
    if settings.YTDLP_OVERLAY_DIR.is_dir():
        env["PYTHONPATH"] = os.pathsep.join(filter(None, [str(settings.YTDLP_OVERLAY_DIR), env.get("PYTHONPATH")]))
    command = [
        sys.executable, "-m", "yt_dlp", "--dump-single-json", "--no-playlist", "--no-warnings",
        "--cache-dir", str(settings.DATA_DIR / "cache" / "yt-dlp"), url,
    ]
    try:
        process = subprocess.run(command, capture_output=True, text=True, timeout=90, env=env)
    except subprocess.TimeoutExpired as exc:
        raise YouTubeError("YouTube took too long to answer") from exc
    if process.returncode != 0:
        lines = _strip_ansi(process.stderr).strip().splitlines()
        raise YouTubeError(lines[-1].removeprefix("ERROR: ") if lines else "Could not read the video")
    return json.loads(process.stdout)


def audio_formats(info: dict) -> list[dict]:
    """The audio-only streams of a video, best first (lossless, then by bitrate; AAC wins ties since it is kept as is)."""
    formats = []
    for item in info.get("formats") or []:
        format_id = str(item.get("format_id") or "")
        if item.get("vcodec") not in (None, "none") or item.get("acodec") in (None, "none"):
            continue
        # HLS variants duplicate the https streams; "drc" streams have compressed dynamics.
        if not str(item.get("protocol", "")).startswith("http") or "drc" in format_id.lower():
            continue
        if not FORMAT_ID.fullmatch(format_id):
            continue
        codec = normalize_codec(item["acodec"])
        formats.append(
            {
                "id": format_id,
                "codec": codec,
                "label": CODEC_LABELS.get(codec, codec.upper()),
                "bitrate": round(item.get("abr") or item.get("tbr") or 0),
                "sample_rate": item.get("asr"),
                "size": item.get("filesize") or item.get("filesize_approx"),
                "ext": item.get("ext") or "",
                "language": item.get("language"),
                "lossless": is_lossless(codec),
            }
        )
    formats.sort(key=lambda f: (f["lossless"], f["bitrate"], f["codec"] == "aac"), reverse=True)
    return formats


def default_format(formats: list[dict]) -> dict | None:
    """Lossless if available, otherwise the best AAC stream (256 kbit/s when offered), otherwise the best stream."""
    return (
        next((f for f in formats if f["lossless"]), None)
        or next((f for f in formats if f["codec"] == "aac"), None)
        or (formats[0] if formats else None)
    )


def download_audio(
    url: str, target_dir: Path, format_id: str | None = None, progress: Callable[[float], None] | None = None
) -> tuple[Path, dict]:
    """Download one audio stream of ``url`` into ``target_dir`` as it is. Returns the file path and video info."""
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
        "format": format_id or DEFAULT_FORMAT,
        "outtmpl": str(target_dir / "source.%(ext)s"),
        "max_filesize": MAX_FILESIZE,
        "cachedir": str(settings.DATA_DIR / "cache" / "yt-dlp"),
        "progress_hooks": [hook],
    }
    try:
        with yt_dlp.YoutubeDL(options) as ydl:
            info = ydl.extract_info(url, download=True)
    except Exception as exc:
        raise YouTubeError(f"Download failed: {_strip_ansi(str(exc))}") from exc

    downloads = info.get("requested_downloads") or [{}]
    path = Path(downloads[0].get("filepath") or "")
    if not path.is_file():
        raise YouTubeError("Download finished but no audio file was produced")
    keys = (
        "id", "title", "uploader", "duration", "thumbnail", "artist", "track", "album", "release_year", "upload_date",
        "format_id", "acodec", "abr",
    )
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
