"""A small database-backed job queue.

The API creates ``Job`` rows; the ``run_worker`` management command claims and
executes them one at a time. Handlers are registered by other apps with
``@handler(kind)``.
"""

import logging
import time
from collections.abc import Callable

from django.db import close_old_connections, transaction
from django.utils import timezone

from jobs.models import Job

logger = logging.getLogger(__name__)

HANDLERS: dict[str, Callable[[Job], None]] = {}


def handler(kind: str):
    def register(func: Callable[[Job], None]):
        HANDLERS[kind] = func
        return func

    return register


def enqueue(kind: str, *, payload: dict | None = None, user=None, unique: bool = False) -> Job:
    """Create a job. With ``unique``, return an existing queued/running job of the same kind instead."""
    if unique:
        existing = Job.objects.filter(kind=kind, status__in=(Job.Status.QUEUED, Job.Status.RUNNING)).first()
        if existing:
            return existing
    return Job.objects.create(kind=kind, payload=payload or {}, created_by=user)


def claim_next() -> Job | None:
    with transaction.atomic():
        job = (
            Job.objects.select_for_update(skip_locked=True)
            .filter(status=Job.Status.QUEUED)
            .order_by("created_at")
            .first()
        )
        if job is None:
            return None
        job.status = Job.Status.RUNNING
        job.started_at = timezone.now()
        job.save(update_fields=["status", "started_at", "updated_at"])
    return job


def run(job: Job) -> None:
    func = HANDLERS.get(job.kind)
    started = time.monotonic()
    try:
        if func is None:
            raise RuntimeError(f"No handler registered for job kind {job.kind!r}")
        func(job)
    except Exception as exc:
        logger.exception("Job %s (%s) failed", job.id, job.kind)
        job.remove_staging()
        job.finish(Job.Status.FAILED, message="Failed", error=str(exc)[:4000])
    else:
        # Handlers may leave the job in REVIEW (waiting for the user) or finish it themselves.
        if job.status == Job.Status.RUNNING:
            job.finish(Job.Status.DONE, message=job.message)
    logger.info("Job %s (%s) -> %s in %.1fs", job.id, job.kind, job.status, time.monotonic() - started)
    close_old_connections()


def recover_interrupted() -> int:
    """Mark jobs that were running when the worker stopped as failed."""
    return Job.objects.filter(status=Job.Status.RUNNING).update(
        status=Job.Status.FAILED, error="Interrupted by a worker restart", finished_at=timezone.now()
    )
