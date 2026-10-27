import logging
import uuid
from datetime import timedelta
from urllib.parse import urlencode

from django.conf import settings
from django.db import transaction
from django.db.models import Count, Max, OuterRef, Q, Subquery, Sum
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from jobs.models import Job
from jobs.serializers import JobSerializer
from jobs.worker import enqueue
from library.models import Album, Artist, Artwork, Playlist, PlayEvent, Track
from library.serializers import (
    AlbumDetailSerializer,
    AlbumSerializer,
    ArtistDetailSerializer,
    ArtistSerializer,
    PlaylistDetailSerializer,
    PlaylistSerializer,
    TrackSerializer,
    TrackUpdateSerializer,
    YouTubeFinalizeSerializer,
    YouTubeImportSerializer,
)
from library.services import youtube
from library.services.editing import delete_track, update_track_metadata
from library.services.files import protected_file
from library.services.importers import ImportFailed, append_to_playlist, save_uploaded_file
from library.services.metadata import MetadataError, search_itunes
from library.services.paths import safe_filename
from library.services.signing import MAX_AGE as STREAM_URL_MAX_AGE
from library.services.signing import sign_stream, verify_stream
from library.services.tagging import InvalidAudioFile
from library.tasks import finalize_youtube_job

logger = logging.getLogger(__name__)

TRACK_ORDERINGS = {
    "title": ("title",),
    "-title": ("-title",),
    "artist": ("artist__name", "album__title", "disc_number", "track_number"),
    "album": ("album__title", "disc_number", "track_number"),
    "year": ("year", "title"),
    "-year": ("-year", "title"),
    "duration": ("duration",),
    "-duration": ("-duration",),
    "added": ("added_at",),
    "-added": ("-added_at",),
}


def tracks_qs():
    return Track.objects.select_related("artist", "album", "artwork")


def text_filter(query: str, *fields: str) -> Q:
    """Every word of ``query`` must appear in at least one of ``fields``."""
    condition = Q()
    for word in query.split():
        word_condition = Q()
        for field in fields:
            word_condition |= Q(**{f"{field}__icontains": word})
        condition &= word_condition
    return condition


def albums_qs():
    return Album.objects.select_related("artist", "artwork").annotate(
        track_count=Count("tracks"), latest=Max("tracks__added_at")
    )


def artists_qs():
    cover = Track.objects.filter(artist=OuterRef("pk"), artwork__isnull=False).order_by("-year")
    return Artist.objects.annotate(
        track_count=Count("tracks", distinct=True),
        album_count=Count("albums", distinct=True),
        artwork=Subquery(cover.values("artwork__sha1")[:1]),
    ).filter(track_count__gt=0)


def playlists_qs():
    return Playlist.objects.annotate(
        track_count=Count("entries"), duration=Coalesce(Sum("entries__track__duration"), 0.0)
    )


class TrackViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = TrackSerializer

    def get_queryset(self):
        params = self.request.query_params
        queryset = tracks_qs()
        if query := params.get("q", "").strip():
            queryset = queryset.filter(text_filter(query, "title", "artist__name", "album__title"))
        if artist := params.get("artist"):
            queryset = queryset.filter(artist_id=artist)
        if album := params.get("album"):
            queryset = queryset.filter(album_id=album)
        ordering = TRACK_ORDERINGS.get(params.get("ordering", "title"), ("title",))
        return queryset.order_by(*ordering, "id")

    def update(self, request, *args, **kwargs):
        track = self.get_object()
        serializer = TrackUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            track = update_track_metadata(track, serializer.validated_data)
        except (InvalidAudioFile, OSError) as exc:
            raise ValidationError({"detail": f"Could not write tags: {exc}"})
        return Response(TrackSerializer(tracks_qs().get(pk=track.pk)).data)

    def perform_destroy(self, instance):
        delete_track(instance)

    @action(detail=True, permission_classes=[AllowAny])
    def stream(self, request, pk=None):
        """Audio file; needs a login (session/token) or a signed link from ``stream_urls``."""
        track = get_object_or_404(Track, pk=pk)
        authorized = request.user is not None and request.user.is_authenticated
        if not authorized and request.query_params.get("sig"):
            authorized = verify_stream(request.query_params["sig"], track.pk) is not None
        if not authorized:
            raise PermissionDenied("Authentication credentials were not provided.")
        return protected_file(request, "music", track.file_path, content_type="audio/mpeg")

    @action(detail=False, methods=["post"], url_path="stream-urls")
    def stream_urls(self, request):
        """Signed stream links for the native app, e.g. ``{"ids": [1, 2]}``."""
        ids = request.data.get("ids")
        if not isinstance(ids, list) or not all(isinstance(i, int) for i in ids) or len(ids) > 2000:
            raise ValidationError({"ids": "Expected a list of track ids"})
        existing = Track.objects.filter(pk__in=ids).values_list("pk", flat=True)
        urls = {
            str(pk): f"/api/tracks/{pk}/stream/?{urlencode({'sig': sign_stream(pk, request.user.pk)})}" for pk in existing
        }
        return Response({"urls": urls, "expires_in": STREAM_URL_MAX_AGE})


class AlbumViewSet(viewsets.ReadOnlyModelViewSet):
    def get_serializer_class(self):
        return AlbumDetailSerializer if self.action == "retrieve" else AlbumSerializer

    def get_queryset(self):
        params = self.request.query_params
        queryset = albums_qs()
        if query := params.get("q", "").strip():
            queryset = queryset.filter(text_filter(query, "title", "artist__name"))
        if artist := params.get("artist"):
            queryset = queryset.filter(artist_id=artist)
        if params.get("ordering") == "recent":
            return queryset.order_by("-latest", "title")
        return queryset.order_by("title", "id")


class ArtistViewSet(viewsets.ReadOnlyModelViewSet):
    def get_serializer_class(self):
        return ArtistDetailSerializer if self.action == "retrieve" else ArtistSerializer

    def get_queryset(self):
        queryset = artists_qs()
        if query := self.request.query_params.get("q", "").strip():
            queryset = queryset.filter(text_filter(query, "name"))
        return queryset.order_by("name")


class PlaylistViewSet(viewsets.ModelViewSet):
    pagination_class = None

    def get_queryset(self):
        return playlists_qs().order_by("name", "id")

    def get_serializer_class(self):
        return PlaylistDetailSerializer if self.action == "retrieve" else PlaylistSerializer

    def _detail(self, playlist_id, status_code=status.HTTP_200_OK):
        playlist = playlists_qs().get(pk=playlist_id)
        return Response(PlaylistDetailSerializer(playlist).data, status=status_code)

    def create(self, request, *args, **kwargs):
        serializer = PlaylistSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        playlist = serializer.save()
        if track_ids := request.data.get("track_ids"):
            append_to_playlist(playlist, self._tracks(track_ids))
        return self._detail(playlist.pk, status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        serializer = PlaylistSerializer(self.get_object(), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return self._detail(serializer.instance.pk)

    @staticmethod
    def _tracks(track_ids) -> list[Track]:
        if not isinstance(track_ids, list) or not all(isinstance(i, int) for i in track_ids):
            raise ValidationError({"track_ids": "Expected a list of track ids"})
        found = Track.objects.in_bulk(track_ids)
        return [found[i] for i in track_ids if i in found]

    @action(detail=True, methods=["post"], url_path="tracks")
    def add_tracks(self, request, pk=None):
        playlist = self.get_object()
        added = append_to_playlist(playlist, self._tracks(request.data.get("track_ids")))
        response = self._detail(playlist.pk)
        response.data["added"] = added
        return response

    @action(detail=True, methods=["delete"], url_path=r"entries/(?P<entry_id>\d+)")
    def remove_entry(self, request, pk=None, entry_id=None):
        playlist = self.get_object()
        deleted, _ = playlist.entries.filter(pk=entry_id).delete()
        if not deleted:
            return Response(status=status.HTTP_404_NOT_FOUND)
        playlist.save(update_fields=["updated_at"])
        return self._detail(playlist.pk)

    @action(detail=True, methods=["post"])
    def reorder(self, request, pk=None):
        playlist = self.get_object()
        entry_ids = request.data.get("entry_ids")
        with transaction.atomic():
            entries = {entry.pk: entry for entry in playlist.entries.select_for_update()}
            if not isinstance(entry_ids, list) or sorted(entry_ids) != sorted(entries):
                raise ValidationError({"entry_ids": "Must contain every entry of the playlist exactly once"})
            for position, entry_id in enumerate(entry_ids, start=1):
                entries[entry_id].position = position
            playlist.entries.model.objects.bulk_update(entries.values(), ["position"])
            playlist.save(update_fields=["updated_at"])
        return self._detail(playlist.pk)


class HistoryView(APIView):
    def get(self, request):
        events = PlayEvent.objects.filter(user=request.user).select_related(
            "track__artist", "track__album", "track__artwork"
        )[:50]
        return Response(
            [{"played_at": e.played_at, "playlist_id": e.playlist_id, "track": TrackSerializer(e.track).data} for e in events]
        )

    def post(self, request):
        """Record one play, or a batch ``{"events": [...]}`` collected by the app while offline."""
        if isinstance(request.data.get("events"), list):
            self._record_batch(request.user, request.data["events"][:1000])
            return Response(status=status.HTTP_204_NO_CONTENT)
        track = get_object_or_404(Track, pk=request.data.get("track_id"))
        playlist_id = request.data.get("playlist_id")
        playlist = Playlist.objects.filter(pk=playlist_id).first() if playlist_id else None
        last = PlayEvent.objects.filter(user=request.user).first()
        # Ignore duplicates caused by quickly re-triggering the same song.
        if not (last and last.track_id == track.pk and timezone.now() - last.played_at < timedelta(seconds=30)):
            PlayEvent.objects.create(user=request.user, track=track, playlist=playlist)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @staticmethod
    def _record_batch(user, events: list) -> None:
        track_ids = {e.get("track_id") for e in events if isinstance(e, dict)}
        playlist_ids = {e.get("playlist_id") for e in events if isinstance(e, dict) and e.get("playlist_id")}
        tracks = set(Track.objects.filter(pk__in=[i for i in track_ids if isinstance(i, int)]).values_list("pk", flat=True))
        playlists = set(
            Playlist.objects.filter(pk__in=[i for i in playlist_ids if isinstance(i, int)]).values_list("pk", flat=True)
        )
        now = timezone.now()
        rows = []
        for event in events:
            if not isinstance(event, dict) or event.get("track_id") not in tracks:
                continue
            played_at = parse_datetime(str(event.get("played_at") or "")) or now
            if timezone.is_naive(played_at):
                played_at = timezone.make_aware(played_at)
            rows.append(
                PlayEvent(
                    user=user,
                    track_id=event["track_id"],
                    playlist_id=event.get("playlist_id") if event.get("playlist_id") in playlists else None,
                    played_at=min(played_at, now),
                )
            )
        PlayEvent.objects.bulk_create(rows)


class SyncTracksView(APIView):
    """Current metadata for tracks the app has downloaded; ids that no longer exist are reported as missing."""

    def post(self, request):
        ids = request.data.get("ids")
        if not isinstance(ids, list) or not all(isinstance(i, int) for i in ids) or len(ids) > 20_000:
            raise ValidationError({"ids": "Expected a list of track ids"})
        tracks = list(tracks_qs().filter(pk__in=ids))
        found = {t.pk for t in tracks}
        return Response(
            {"tracks": TrackSerializer(tracks, many=True).data, "missing": [i for i in ids if i not in found]}
        )


class HomeView(APIView):
    def get(self, request):
        events = list(
            PlayEvent.objects.filter(user=request.user)
            .select_related("track__artist", "track__album", "track__artwork")
            .order_by("-played_at")[:300]
        )
        recent_tracks, seen_tracks, playlist_ids = [], set(), []
        for event in events:
            if event.track_id not in seen_tracks and len(recent_tracks) < 12:
                seen_tracks.add(event.track_id)
                recent_tracks.append(event.track)
            if event.playlist_id and event.playlist_id not in playlist_ids:
                playlist_ids.append(event.playlist_id)
        playlists = playlists_qs().in_bulk(playlist_ids[:10])
        return Response(
            {
                "recent_tracks": TrackSerializer(recent_tracks, many=True).data,
                "recent_playlists": PlaylistSerializer([playlists[i] for i in playlist_ids[:10] if i in playlists], many=True).data,
                "recently_added": TrackSerializer(tracks_qs().order_by("-added_at", "-id")[:12], many=True).data,
                "recent_albums": AlbumSerializer(albums_qs().order_by("-latest")[:12], many=True).data,
                "playlists": PlaylistSerializer(playlists_qs().order_by("-updated_at")[:12], many=True).data,
                "track_count": Track.objects.count(),
            }
        )


class SearchView(APIView):
    def get(self, request):
        query = request.query_params.get("q", "").strip()
        if not query:
            return Response({"tracks": [], "artists": [], "albums": [], "playlists": []})
        tracks = tracks_qs().filter(text_filter(query, "title", "artist__name", "album__title"))
        return Response(
            {
                "tracks": TrackSerializer(tracks.order_by("title")[:50], many=True).data,
                "artists": ArtistSerializer(artists_qs().filter(text_filter(query, "name"))[:12], many=True).data,
                "albums": AlbumSerializer(albums_qs().filter(text_filter(query, "title", "artist__name"))[:12], many=True).data,
                "playlists": PlaylistSerializer(playlists_qs().filter(text_filter(query, "name", "description"))[:12], many=True).data,
            }
        )


class ArtworkView(APIView):
    def get(self, request, sha1):
        size = "thumb" if request.query_params.get("size") == "thumb" else "full"
        return protected_file(
            request, "media", Artwork(sha1=sha1).relative_path(size), content_type="image/jpeg", cache_seconds=31_536_000
        )


class MetadataSearchView(APIView):
    def get(self, request):
        try:
            return Response(search_itunes(request.query_params.get("q", "")[:200]))
        except MetadataError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)


class LibraryStatsView(APIView):
    def get(self, request):
        totals = Track.objects.aggregate(duration=Coalesce(Sum("duration"), 0.0), size=Coalesce(Sum("file_size"), 0))
        return Response(
            {
                "tracks": Track.objects.count(),
                "artists": Artist.objects.count(),
                "albums": Album.objects.count(),
                "playlists": Playlist.objects.count(),
                "duration": totals["duration"],
                "size": totals["size"],
                "music_root": str(settings.MUSIC_ROOT),
                "scan_interval": settings.LIBRARY_SCAN_INTERVAL,
            }
        )


class ScanView(APIView):
    def post(self, request):
        job = enqueue(Job.Kind.SCAN, user=request.user, unique=True)
        return Response(JobSerializer(job).data, status=status.HTTP_202_ACCEPTED)


class UploadView(APIView):
    parser_classes = [MultiPartParser]

    def post(self, request):
        files = request.FILES.getlist("files")
        if not files:
            raise ValidationError({"files": "No files uploaded"})
        playlist = None
        if playlist_id := request.data.get("playlist_id"):
            playlist = get_object_or_404(Playlist, pk=playlist_id)

        tracks, errors = [], []
        for upload in files:
            try:
                tracks.append(save_uploaded_file(upload))
            except (ImportFailed, InvalidAudioFile, OSError) as exc:
                errors.append(str(exc))
        if playlist and tracks:
            append_to_playlist(playlist, tracks)
        return Response(
            {"tracks": TrackSerializer(tracks, many=True).data, "errors": errors},
            status=status.HTTP_201_CREATED if tracks else status.HTTP_400_BAD_REQUEST,
        )


class ZipImportView(APIView):
    parser_classes = [MultiPartParser]

    def post(self, request):
        upload = request.FILES.get("file")
        if upload is None or not upload.name.lower().endswith(".zip"):
            raise ValidationError({"file": "Please upload a .zip file"})
        stem = safe_filename(upload.name.rsplit(".", 1)[0], default="Imported")
        playlist_name = request.data.get("playlist_name", "").strip()[:200]
        create_playlist = request.data.get("create_playlist", "true").lower() != "false"

        # Store the archive first and only then create the job, so the worker never sees a half-written file.
        job_id = uuid.uuid4()
        target = settings.STAGING_ROOT / "jobs" / str(job_id)
        target.mkdir(parents=True)
        with (target / "upload.zip").open("wb") as handle:
            for chunk in upload.chunks():
                handle.write(chunk)
        job = Job.objects.create(
            id=job_id,
            kind=Job.Kind.ZIP_IMPORT,
            created_by=request.user,
            payload={
                "filename": upload.name[:255],
                "folder_name": playlist_name or stem,
                "playlist_name": (playlist_name or stem) if create_playlist else None,
            },
        )
        return Response(JobSerializer(job).data, status=status.HTTP_202_ACCEPTED)


class YouTubeImportView(APIView):
    def post(self, request):
        serializer = YouTubeImportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            url = youtube.normalize_url(data["url"])
        except youtube.YouTubeError as exc:
            raise ValidationError({"url": str(exc)})
        job = enqueue(
            Job.Kind.YOUTUBE,
            user=request.user,
            payload={
                "url": url,
                "query": data["query"].strip(),
                "auto_accept": data["auto_accept"],
                "playlist_id": data["playlist_id"],
            },
        )
        return Response(JobSerializer(job).data, status=status.HTTP_202_ACCEPTED)


class YouTubeFinalizeView(APIView):
    def post(self, request, job_id):
        serializer = YouTubeFinalizeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            job = get_object_or_404(
                Job.objects.select_for_update(), pk=job_id, kind=Job.Kind.YOUTUBE, status=Job.Status.REVIEW
            )
            job.status = Job.Status.RUNNING  # guards against double submission
            job.save(update_fields=["status", "updated_at"])
        try:
            finalize_youtube_job(job, serializer.validated_data)
        except Exception as exc:  # put the job back so the user can retry
            logger.exception("Finalizing download %s failed", job.pk)
            job.status = Job.Status.REVIEW
            job.error = str(exc)
            job.save(update_fields=["status", "error", "updated_at"])
            raise ValidationError({"detail": f"Could not save the song: {exc}"})
        return Response(JobSerializer(job).data)


class YouTubeDiscardView(APIView):
    def post(self, request, job_id):
        job = get_object_or_404(
            Job, pk=job_id, kind=Job.Kind.YOUTUBE, status__in=(Job.Status.REVIEW, Job.Status.QUEUED)
        )
        job.remove_staging()
        job.finish(Job.Status.CANCELLED, message="Discarded")
        return Response(JobSerializer(job).data)
