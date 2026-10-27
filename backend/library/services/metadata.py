"""Online metadata lookup (iTunes Search API) and cover download."""

import io
import logging
from difflib import SequenceMatcher
from urllib.parse import urlparse

import requests
from PIL import Image

logger = logging.getLogger(__name__)

ITUNES_SEARCH_URL = "https://itunes.apple.com/search"
ARTWORK_SIZE = 1000
MAX_ARTWORK_BYTES = 15 * 1024 * 1024
USER_AGENT = "Michi-Playlist/2.0"

# Cover images are only fetched from these hosts (prevents server-side request forgery).
ARTWORK_HOST_SUFFIXES = (".mzstatic.com", ".ytimg.com")


class MetadataError(Exception):
    pass


def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def search_itunes(query: str, limit: int = 8, country: str = "us") -> list[dict]:
    """Return candidate tags for ``query``, best match first."""
    query = query.strip()
    if not query:
        return []
    try:
        response = requests.get(
            ITUNES_SEARCH_URL,
            params={"term": query, "country": country, "entity": "song", "limit": limit},
            headers={"User-Agent": USER_AGENT},
            timeout=10,
        )
        response.raise_for_status()
        results = response.json().get("results", [])
    except (requests.RequestException, ValueError) as exc:
        raise MetadataError(f"Metadata lookup failed: {exc}") from exc

    scored = []
    for item in results:
        artist = item.get("artistName", "")
        title = item.get("trackName", "")
        album = item.get("collectionName", "")
        score = max(
            (_similarity(query, artist) + _similarity(query, title)) / 2,
            _similarity(query, f"{artist} {title}"),
            _similarity(query, f"{title} {artist}"),
        )
        # Prefer original releases over remixes and singles.
        if "remix" in album.lower() or "mix" in album.lower():
            score *= 0.8
        if "single" in album.lower():
            score *= 0.95
        artwork = item.get("artworkUrl100", "")
        release = item.get("releaseDate") or ""
        scored.append(
            (
                score,
                {
                    "title": title,
                    "artist": artist,
                    "album": album.removesuffix(" - Single").removesuffix(" - EP"),
                    "album_artist": item.get("collectionArtistName") or "",
                    "genre": item.get("primaryGenreName", ""),
                    "year": int(release[:4]) if release[:4].isdigit() else None,
                    "track_number": item.get("trackNumber"),
                    "duration": (item.get("trackTimeMillis") or 0) / 1000,
                    "artwork_url": artwork.replace("100x100", f"{ARTWORK_SIZE}x{ARTWORK_SIZE}"),
                    "artwork_preview": artwork.replace("100x100", "300x300"),
                    "score": 0.0,
                },
            )
        )
    scored.sort(key=lambda pair: pair[0], reverse=True)
    for score, candidate in scored:
        candidate["score"] = round(score, 3)
    return [candidate for _, candidate in scored]


def is_allowed_artwork_url(url: str) -> bool:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    return parsed.scheme == "https" and any(host.endswith(suffix) for suffix in ARTWORK_HOST_SUFFIXES)


def fetch_artwork(url: str) -> tuple[bytes, str]:
    """Download a cover image from an allow-listed host. Returns ``(data, mime)``."""
    if not is_allowed_artwork_url(url):
        raise MetadataError("Artwork URL is not from an allowed host")
    try:
        with requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=15, stream=True) as response:
            response.raise_for_status()
            mime = response.headers.get("Content-Type", "image/jpeg").split(";")[0].strip().lower()
            if not mime.startswith("image/"):
                raise MetadataError("Artwork URL did not return an image")
            data = bytearray()
            for chunk in response.iter_content(64 * 1024):
                data.extend(chunk)
                if len(data) > MAX_ARTWORK_BYTES:
                    raise MetadataError("Artwork image is too large")
    except requests.RequestException as exc:
        raise MetadataError(f"Artwork download failed: {exc}") from exc
    if mime not in ("image/jpeg", "image/png"):
        data, mime = _convert_to_jpeg(bytes(data)), "image/jpeg"
    return bytes(data), mime


def _convert_to_jpeg(data: bytes) -> bytes:
    with Image.open(io.BytesIO(data)) as image:
        output = io.BytesIO()
        image.convert("RGB").save(output, "JPEG", quality=92)
    return output.getvalue()
