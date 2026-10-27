import shutil
import uuid
from pathlib import Path

from django.conf import settings
from django.db import models
from django.utils import timezone


class Job(models.Model):
    """A long-running task executed by the background worker."""

    class Kind(models.TextChoices):
        SCAN = "scan", "Library scan"
        YOUTUBE = "youtube", "YouTube download"
        ZIP_IMPORT = "zip_import", "Zip import"
        UPDATE_YTDLP = "update_ytdlp", "yt-dlp update"

    class Status(models.TextChoices):
        QUEUED = "queued"
        RUNNING = "running"
        REVIEW = "review"  # waiting for the user (e.g. confirm YouTube metadata)
        DONE = "done"
        FAILED = "failed"
        CANCELLED = "cancelled"

    ACTIVE_STATUSES = (Status.QUEUED, Status.RUNNING, Status.REVIEW)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.CharField(max_length=32, choices=Kind.choices)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.QUEUED, db_index=True)
    progress = models.PositiveSmallIntegerField(default=0)
    message = models.CharField(max_length=500, blank=True)
    payload = models.JSONField(default=dict, blank=True)
    result = models.JSONField(default=dict, blank=True)
    error = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.get_kind_display()} ({self.status})"

    @property
    def staging_dir(self) -> Path:
        return settings.STAGING_ROOT / "jobs" / str(self.id)

    def report(self, progress: int, message: str | None = None) -> None:
        """Persist progress without touching other fields (cheap, called often)."""
        self.progress = max(0, min(100, int(progress)))
        fields = {"progress": self.progress, "updated_at": timezone.now()}
        if message is not None:
            self.message = message[:500]
            fields["message"] = self.message
        Job.objects.filter(pk=self.pk).update(**fields)

    def finish(self, status: str, message: str = "", error: str = "") -> None:
        self.status = status
        self.message = message[:500]
        self.error = error
        self.finished_at = timezone.now()
        if status == self.Status.DONE:
            self.progress = 100
        self.save()

    def remove_staging(self) -> None:
        shutil.rmtree(self.staging_dir, ignore_errors=True)
