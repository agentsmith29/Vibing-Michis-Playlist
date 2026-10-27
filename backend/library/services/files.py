"""Serving protected files (audio, artwork) to authenticated users."""

import mimetypes
import re
from pathlib import Path
from urllib.parse import quote

from django.conf import settings
from django.http import FileResponse, Http404, HttpResponse, StreamingHttpResponse

from library.services.paths import resolve_within

_RANGE = re.compile(r"bytes=(\d*)-(\d*)$")


def _iter_file(path: Path, start: int, length: int, chunk_size: int = 64 * 1024):
    with path.open("rb") as handle:
        handle.seek(start)
        remaining = length
        while remaining > 0:
            chunk = handle.read(min(chunk_size, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


def _ranged_response(request, path: Path, content_type: str):
    """Minimal HTTP range support so seeking works without nginx (development)."""
    size = path.stat().st_size
    match = _RANGE.match(request.headers.get("Range", "").strip())
    if not match or not any(match.groups()):
        response = FileResponse(path.open("rb"), content_type=content_type)
        response["Accept-Ranges"] = "bytes"
        return response
    first, last = match.groups()
    if first == "":
        start, end = max(0, size - int(last)), size - 1
    else:
        start, end = int(first), min(int(last) if last else size - 1, size - 1)
    if start >= size or start > end:
        response = HttpResponse(status=416)
        response["Content-Range"] = f"bytes */{size}"
        return response
    response = StreamingHttpResponse(_iter_file(path, start, end - start + 1), status=206, content_type=content_type)
    response["Content-Length"] = str(end - start + 1)
    response["Content-Range"] = f"bytes {start}-{end}/{size}"
    response["Accept-Ranges"] = "bytes"
    return response


def protected_file(request, area: str, relative: str, *, content_type: str | None = None, cache_seconds: int = 0):
    """Return a response for ``relative`` inside ``area`` ("music" or "media")."""
    root = settings.MUSIC_ROOT if area == "music" else settings.MEDIA_ROOT
    try:
        path = resolve_within(root, relative)
    except ValueError:
        raise Http404
    if not path.is_file():
        raise Http404
    content_type = content_type or mimetypes.guess_type(path.name)[0] or "application/octet-stream"

    if settings.USE_X_ACCEL_REDIRECT:
        response = HttpResponse(content_type=content_type)
        response["X-Accel-Redirect"] = f"/_protected/{area}/" + quote(path.relative_to(root.resolve()).as_posix())
    else:
        response = _ranged_response(request, path, content_type)
    if cache_seconds:
        response["Cache-Control"] = f"private, max-age={cache_seconds}, immutable"
    else:
        response["Cache-Control"] = "private, no-cache"
    return response
