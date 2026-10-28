"""Background job handlers for the library (executed by the worker)."""

import logging
import subprocess
import sys

from django.conf import settings

from jobs.models import Job
from jobs.worker import handler
from library.models import Playlist
from library.services import audio, youtube
from library.services.importers import append_to_playlist, finalize_download, import_zip
from library.services.indexer import scan_library
from library.services.metadata import MetadataError, search_itunes

logger = logging.getLogger(__name__)


@handler(Job.Kind.SCAN)
def run_scan(job: Job) -> None:
    stats = scan_library(progress=job.report)
    job.result = stats
    job.message = (
        f"{stats['total']} files: {stats['added']} added, {stats['updated']} updated, "
        f"{stats['removed']} removed, {stats['errors']} errors"
    )


@handler(Job.Kind.ZIP_IMPORT)
def run_zip_import(job: Job) -> None:
    archive = job.staging_dir / "upload.zip"
    try:
        job.report(1, "Extracting archive…")
        job.result = import_zip(
            archive,
            folder_name=job.payload.get("folder_name") or job.payload.get("filename", "Imported").rsplit(".", 1)[0],
            playlist_name=job.payload.get("playlist_name"),
            source_name=job.payload.get("filename", ""),
            progress=job.report,
        )
    finally:
        job.remove_staging()
    job.message = f"Imported {job.result['imported']} songs"
    if job.result["errors"]:
        job.message += f" ({len(job.result['errors'])} skipped)"


@handler(Job.Kind.YOUTUBE)
def run_youtube(job: Job) -> None:
    job.report(2, "Downloading audio…")
    source, info = youtube.download_audio(
        job.payload["url"],
        job.staging_dir,
        format_id=job.payload.get("format_id") or None,
        progress=lambda fraction: job.report(2 + int(fraction * 76), "Downloading audio…"),
    )
    codec = audio.normalize_codec(info.get("acodec") or "")
    requested = job.payload.get("storage_format")
    storage = audio.STORAGE_FORMATS[requested] if requested else audio.default_storage(audio.is_lossless(codec))
    copied = codec == storage.codec
    job.report(80, "Saving audio…" if copied else f"Converting to {storage.label}…")
    path = audio.convert(source, storage, job.staging_dir / "track", codec)
    source.unlink(missing_ok=True)

    job.report(85, "Looking up metadata…")
    query = job.payload.get("query") or youtube.suggest_query(info)
    try:
        candidates = search_itunes(query)
    except MetadataError as exc:
        logger.warning("Metadata lookup failed for %r: %s", query, exc)
        candidates = []
    fallback = youtube.fallback_metadata(info)
    job.result = {
        "file": path.name,
        "format": {
            "source": audio.CODEC_LABELS.get(codec, codec.upper()),
            "bitrate": round(info.get("abr") or 0),
            "storage": storage.key,
            "converted": not copied,
        },
        "video": info,
        "query": query,
        "candidates": candidates,
        "fallback": fallback,
        "suggested": candidates[0] if candidates else fallback,
    }

    if job.payload.get("auto_accept"):
        finalize_youtube_job(job, job.result["suggested"])
    else:
        job.status = Job.Status.REVIEW
        job.progress = 100
        job.message = "Ready for review"
        job.save()


def finalize_youtube_job(job: Job, metadata: dict) -> None:
    track = finalize_download(job.staging_dir / job.result["file"], metadata)
    job.remove_staging()
    playlist_id = metadata.get("playlist_id") or job.payload.get("playlist_id")
    if playlist_id:
        playlist = Playlist.objects.filter(pk=playlist_id).first()
        if playlist:
            append_to_playlist(playlist, [track])
    job.result = job.result | {"track_id": track.id}
    job.finish(Job.Status.DONE, message=f"Added “{track.title}” by {track.artist.name}")


@handler(Job.Kind.UPDATE_YTDLP)
def run_update_ytdlp(job: Job) -> None:
    job.report(10, "Installing the latest yt-dlp…")
    target = settings.YTDLP_OVERLAY_DIR
    target.mkdir(parents=True, exist_ok=True)
    process = subprocess.run(
        [
            sys.executable, "-m", "pip", "install", "--upgrade", "--no-deps", "--no-cache-dir",
            "--disable-pip-version-check", "--target", str(target), "yt-dlp", "yt-dlp-ejs",
        ],
        capture_output=True,
        text=True,
        timeout=600,
    )
    if process.returncode != 0:
        raise RuntimeError(process.stderr[-2000:] or "pip failed")
    version = youtube.ytdlp_version()["active"]
    job.result = {"version": version, "restart_worker": True}
    job.message = f"yt-dlp {version} installed"
