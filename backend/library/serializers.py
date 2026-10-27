from django.db.models import Count
from rest_framework import serializers

from library.models import Album, Artist, Playlist, PlaylistEntry, Track
from library.services.metadata import is_allowed_artwork_url


class TrackSerializer(serializers.ModelSerializer):
    artist = serializers.CharField(source="artist.name", read_only=True)
    file_version = serializers.CharField(read_only=True)
    album = serializers.CharField(source="album.title", read_only=True, default=None)
    artwork = serializers.CharField(source="artwork.sha1", read_only=True, default=None)

    class Meta:
        model = Track
        fields = [
            "id", "title", "artist", "artist_id", "album", "album_id", "genre", "year", "track_number",
            "disc_number", "duration", "bitrate", "artwork", "file_path", "file_version", "added_at",
        ]
        read_only_fields = fields


class AlbumSerializer(serializers.ModelSerializer):
    artist = serializers.CharField(source="artist.name", read_only=True)
    artwork = serializers.CharField(source="artwork.sha1", read_only=True, default=None)
    track_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Album
        fields = ["id", "title", "artist", "artist_id", "year", "artwork", "track_count"]
        read_only_fields = fields


class AlbumDetailSerializer(AlbumSerializer):
    tracks = serializers.SerializerMethodField()

    class Meta(AlbumSerializer.Meta):
        fields = AlbumSerializer.Meta.fields + ["tracks"]
        read_only_fields = fields

    def get_tracks(self, album):
        tracks = album.tracks.select_related("artist", "album", "artwork").order_by(
            "disc_number", "track_number", "title"
        )
        return TrackSerializer(tracks, many=True).data


class ArtistSerializer(serializers.ModelSerializer):
    track_count = serializers.IntegerField(read_only=True, default=0)
    album_count = serializers.IntegerField(read_only=True, default=0)
    artwork = serializers.CharField(read_only=True, default=None)

    class Meta:
        model = Artist
        fields = ["id", "name", "track_count", "album_count", "artwork"]
        read_only_fields = fields


class ArtistDetailSerializer(ArtistSerializer):
    albums = serializers.SerializerMethodField()
    tracks = serializers.SerializerMethodField()

    class Meta(ArtistSerializer.Meta):
        fields = ArtistSerializer.Meta.fields + ["albums", "tracks"]
        read_only_fields = fields

    def get_albums(self, artist):
        albums = artist.albums.select_related("artist", "artwork").annotate(track_count=Count("tracks"))
        return AlbumSerializer(albums.order_by("-year", "title"), many=True).data

    def get_tracks(self, artist):
        tracks = artist.tracks.select_related("artist", "album", "artwork").order_by("title")
        return TrackSerializer(tracks, many=True).data


class PlaylistSerializer(serializers.ModelSerializer):
    track_count = serializers.IntegerField(read_only=True, default=0)
    duration = serializers.FloatField(read_only=True, default=0)
    artworks = serializers.SerializerMethodField()

    class Meta:
        model = Playlist
        fields = ["id", "name", "description", "track_count", "duration", "artworks", "created_at", "updated_at"]
        read_only_fields = ["id", "track_count", "duration", "artworks", "created_at", "updated_at"]

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Please enter a name")
        return value

    def get_artworks(self, playlist) -> list[str]:
        """Up to four distinct covers for the playlist mosaic."""
        covers: list[str] = []
        for sha1 in (
            playlist.entries.exclude(track__artwork=None)
            .order_by("position")
            .values_list("track__artwork__sha1", flat=True)[:60]
        ):
            if sha1 not in covers:
                covers.append(sha1)
                if len(covers) == 4:
                    break
        return covers


class PlaylistEntrySerializer(serializers.ModelSerializer):
    track = TrackSerializer(read_only=True)

    class Meta:
        model = PlaylistEntry
        fields = ["id", "position", "added_at", "track"]
        read_only_fields = fields


class PlaylistDetailSerializer(PlaylistSerializer):
    entries = serializers.SerializerMethodField()

    class Meta(PlaylistSerializer.Meta):
        fields = PlaylistSerializer.Meta.fields + ["entries"]

    def get_entries(self, playlist):
        entries = playlist.entries.select_related("track__artist", "track__album", "track__artwork")
        return PlaylistEntrySerializer(entries, many=True).data


class MetadataSerializer(serializers.Serializer):
    """Tags a user can edit (track editor, YouTube review)."""

    title = serializers.CharField(max_length=500)
    artist = serializers.CharField(max_length=255)
    album = serializers.CharField(max_length=255, allow_blank=True, required=False, default="")
    album_artist = serializers.CharField(max_length=255, allow_blank=True, required=False, default="")
    genre = serializers.CharField(max_length=100, allow_blank=True, required=False, default="")
    year = serializers.IntegerField(min_value=1000, max_value=9999, allow_null=True, required=False, default=None)
    track_number = serializers.IntegerField(min_value=1, max_value=999, allow_null=True, required=False, default=None)
    artwork_url = serializers.URLField(allow_blank=True, required=False, default="")

    def validate_artwork_url(self, value):
        if value and not is_allowed_artwork_url(value):
            raise serializers.ValidationError("Artwork must come from the online metadata search")
        return value


class TrackUpdateSerializer(MetadataSerializer):
    """Partial updates must not reset omitted fields to their defaults."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field in self.fields.values():
            field.default = serializers.empty
            field.required = False


class YouTubeImportSerializer(serializers.Serializer):
    url = serializers.CharField(max_length=500)
    query = serializers.CharField(max_length=200, allow_blank=True, required=False, default="")
    auto_accept = serializers.BooleanField(required=False, default=False)
    playlist_id = serializers.IntegerField(required=False, allow_null=True, default=None)


class YouTubeFinalizeSerializer(MetadataSerializer):
    playlist_id = serializers.IntegerField(required=False, allow_null=True, default=None)
