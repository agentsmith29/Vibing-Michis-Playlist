"""Cover art cache: images are stored once per content hash as full size + thumbnail."""

import hashlib
import io
import logging
import os
import tempfile
from pathlib import Path

from django.conf import settings
from django.db import IntegrityError
from PIL import Image, ImageOps, UnidentifiedImageError

from library.models import Album, Artwork, Track

logger = logging.getLogger(__name__)

FULL_MAX_SIZE = 1000


def _save_jpeg(image: Image.Image, path: Path, quality: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".tmp-", suffix=".jpg")
    try:
        with os.fdopen(fd, "wb") as handle:
            image.save(handle, "JPEG", quality=quality, optimize=True, progressive=True)
        os.chmod(tmp, 0o644)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def store_artwork(data: bytes | None) -> Artwork | None:
    """Store image bytes in the cache and return the (possibly existing) Artwork row."""
    if not data:
        return None
    sha1 = hashlib.sha1(data).hexdigest()
    existing = Artwork.objects.filter(sha1=sha1).first()
    if existing and (settings.MEDIA_ROOT / existing.relative_path("thumb")).exists():
        return existing

    try:
        with Image.open(io.BytesIO(data)) as source:
            image = ImageOps.exif_transpose(source).convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        logger.warning("Ignoring unreadable cover art: %s", exc)
        return None

    artwork = existing or Artwork(sha1=sha1)
    artwork.width, artwork.height = image.size

    full = image.copy()
    full.thumbnail((FULL_MAX_SIZE, FULL_MAX_SIZE), Image.Resampling.LANCZOS)
    _save_jpeg(full, settings.MEDIA_ROOT / artwork.relative_path("full"), quality=90)
    thumb = image.copy()
    thumb.thumbnail((Artwork.THUMB_SIZE, Artwork.THUMB_SIZE), Image.Resampling.LANCZOS)
    _save_jpeg(thumb, settings.MEDIA_ROOT / artwork.relative_path("thumb"), quality=85)

    try:
        artwork.save()
    except IntegrityError:  # created concurrently by another process
        artwork = Artwork.objects.get(sha1=sha1)
    return artwork


def prune_artwork() -> int:
    """Delete cached images that are no longer referenced by any track or album."""
    used = set(Track.objects.exclude(artwork=None).values_list("artwork_id", flat=True))
    used |= set(Album.objects.exclude(artwork=None).values_list("artwork_id", flat=True))
    orphans = list(Artwork.objects.exclude(id__in=used))
    for artwork in orphans:
        for size in ("full", "thumb"):
            (settings.MEDIA_ROOT / artwork.relative_path(size)).unlink(missing_ok=True)
    Artwork.objects.filter(id__in=[a.id for a in orphans]).delete()
    return len(orphans)
