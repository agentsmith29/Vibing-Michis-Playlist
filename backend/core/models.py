import hashlib
import secrets

from django.conf import settings
from django.db import models
from django.utils import timezone

TOKEN_PREFIX = "mp_"


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


class DeviceToken(models.Model):
    """Login of a native app installation. Only a hash of the token is stored."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="device_tokens")
    name = models.CharField(max_length=100)
    key_hash = models.CharField(max_length=64, unique=True)
    hint = models.CharField(max_length=12)  # first characters, to tell tokens apart in the UI
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-last_used_at", "-created_at"]

    def __str__(self) -> str:
        return f"{self.name} ({self.user})"

    @classmethod
    def issue(cls, user, name: str) -> tuple["DeviceToken", str]:
        raw = TOKEN_PREFIX + secrets.token_urlsafe(32)
        token = cls.objects.create(user=user, name=name[:100] or "App", key_hash=hash_token(raw), hint=raw[:10])
        return token, raw

    def touch(self) -> None:
        """Record usage, at most every few minutes to avoid a write per request."""
        now = timezone.now()
        if self.last_used_at is None or now - self.last_used_at > timezone.timedelta(minutes=5):
            self.last_used_at = now
            DeviceToken.objects.filter(pk=self.pk).update(last_used_at=now)
