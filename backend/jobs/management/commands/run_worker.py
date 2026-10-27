import logging
import shutil
import signal
import sys
import threading
import time

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import close_old_connections
from django.utils import timezone

from jobs import worker
from jobs.models import Job

logger = logging.getLogger("jobs.worker")


class Command(BaseCommand):
    help = "Run the background worker (job queue + periodic library scan)."

    def handle(self, *args, **options):
        # A yt-dlp version installed from the settings page takes precedence over the bundled one.
        if settings.YTDLP_OVERLAY_DIR.is_dir():
            sys.path.insert(0, str(settings.YTDLP_OVERLAY_DIR))

        stop = threading.Event()
        for sig in (signal.SIGINT, signal.SIGTERM):
            signal.signal(sig, lambda *_: stop.set())

        if recovered := worker.recover_interrupted():
            logger.warning("Marked %d interrupted job(s) as failed", recovered)

        interval = settings.LIBRARY_SCAN_INTERVAL
        next_scan = time.monotonic()  # scan once right after start
        next_cleanup = time.monotonic()
        logger.info("Worker started (scan interval: %ss)", interval or "disabled")

        while not stop.is_set():
            close_old_connections()
            job = worker.claim_next()
            if job is not None:
                worker.run(job)
                if job.result.get("restart_worker"):
                    logger.info("Restarting worker to load updated components")
                    return
                continue

            now = time.monotonic()
            if interval and now >= next_scan:
                next_scan = now + interval
                self.periodic_scan()
            elif now >= next_cleanup:
                next_cleanup = now + 3600
                self.cleanup_staging()
            else:
                stop.wait(settings.WORKER_POLL_INTERVAL)
        logger.info("Worker stopped")

    def periodic_scan(self):
        from library.services.indexer import scan_library

        if Job.objects.filter(kind=Job.Kind.SCAN, status=Job.Status.RUNNING).exists():
            return
        try:
            stats = scan_library()
        except Exception:
            logger.exception("Periodic library scan failed")
            return
        if stats["added"] or stats["updated"] or stats["removed"]:
            logger.info("Library scan: %s", stats)

    def cleanup_staging(self):
        """Discard downloads nobody reviewed and leftovers of failed jobs."""
        cutoff = timezone.now() - timezone.timedelta(seconds=settings.STAGING_MAX_AGE)
        stale = Job.objects.filter(status=Job.Status.REVIEW, updated_at__lt=cutoff)
        for job in stale:
            job.remove_staging()
            job.finish(Job.Status.CANCELLED, message="Expired without review")
        jobs_dir = settings.STAGING_ROOT / "jobs"
        if jobs_dir.is_dir():
            active = {str(pk) for pk in Job.objects.filter(status__in=Job.ACTIVE_STATUSES).values_list("pk", flat=True)}
            for path in jobs_dir.iterdir():
                if path.name not in active and path.stat().st_mtime < cutoff.timestamp():
                    shutil.rmtree(path, ignore_errors=True)
