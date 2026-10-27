"""Changing and removing tracks. Tags are written to the file so the folder stays the source of truth."""

from django.conf import settings
from django.db import transaction

from library.models import Track
from library.services.importers import apply_metadata
from library.services.indexer import index_file, prune_orphans
from library.services.paths import resolve_within


def track_path(track: Track):
    return resolve_within(settings.MUSIC_ROOT, track.file_path)


def update_track_metadata(track: Track, data: dict) -> Track:
    current = {
        "title": track.title,
        "artist": track.artist.name,
        "album": track.album.title if track.album else "",
        "album_artist": track.album.artist.name if track.album and track.album.artist_id != track.artist_id else "",
        "genre": track.genre,
        "year": track.year,
        "track_number": track.track_number,
    }
    path = track_path(track)
    # Without a new artwork_url the cover embedded in the file is kept.
    apply_metadata(path, current | data)
    track = index_file(path)
    prune_orphans()
    return track


def delete_track(track: Track) -> None:
    path = track_path(track)
    with transaction.atomic():
        track.delete()
        path.unlink(missing_ok=True)
    prune_orphans()
