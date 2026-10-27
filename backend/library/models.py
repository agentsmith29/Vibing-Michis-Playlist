from django.conf import settings
from django.db import models
from django.db.models.functions import Lower
from django.utils import timezone


class Artwork(models.Model):
    """Cover art extracted from audio files, de-duplicated by content hash."""

    sha1 = models.CharField(max_length=40, unique=True)
    width = models.PositiveIntegerField(default=0)
    height = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    THUMB_SIZE = 300

    def relative_path(self, size: str = "full") -> str:
        suffix = f"_{self.THUMB_SIZE}" if size == "thumb" else ""
        return f"artwork/{self.sha1[:2]}/{self.sha1}{suffix}.jpg"

    def __str__(self) -> str:
        return self.sha1


class Artist(models.Model):
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        constraints = [models.UniqueConstraint(Lower("name"), name="uniq_artist_name_ci")]

    def __str__(self) -> str:
        return self.name


class Album(models.Model):
    title = models.CharField(max_length=255)
    artist = models.ForeignKey(Artist, on_delete=models.CASCADE, related_name="albums")
    year = models.PositiveSmallIntegerField(null=True, blank=True)
    artwork = models.ForeignKey(Artwork, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["title"]
        constraints = [
            models.UniqueConstraint(Lower("title"), "artist", name="uniq_album_title_per_artist_ci"),
        ]

    def __str__(self) -> str:
        return f"{self.title} – {self.artist}"


class Track(models.Model):
    """A single audio file in the music folder.

    The file's ID3 tags are the source of truth; this row is an index that the
    library scanner keeps in sync with the folder.
    """

    title = models.CharField(max_length=500)
    artist = models.ForeignKey(Artist, on_delete=models.CASCADE, related_name="tracks")
    album = models.ForeignKey(Album, on_delete=models.SET_NULL, null=True, blank=True, related_name="tracks")
    genre = models.CharField(max_length=100, blank=True)
    year = models.PositiveSmallIntegerField(null=True, blank=True)
    track_number = models.PositiveSmallIntegerField(null=True, blank=True)
    disc_number = models.PositiveSmallIntegerField(null=True, blank=True)
    duration = models.FloatField(default=0)
    bitrate = models.PositiveIntegerField(null=True, blank=True)
    artwork = models.ForeignKey(Artwork, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")

    # Location relative to MUSIC_ROOT (POSIX separators) plus change detection.
    file_path = models.CharField(max_length=1024, unique=True)
    file_size = models.BigIntegerField(default=0)
    file_mtime = models.FloatField(default=0)

    added_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["title"]
        indexes = [models.Index(fields=["title"])]

    def __str__(self) -> str:
        return f"{self.artist} – {self.title}"


class Playlist(models.Model):
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    tracks = models.ManyToManyField(Track, through="PlaylistEntry", related_name="playlists")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class PlaylistEntry(models.Model):
    playlist = models.ForeignKey(Playlist, on_delete=models.CASCADE, related_name="entries")
    track = models.ForeignKey(Track, on_delete=models.CASCADE, related_name="playlist_entries")
    position = models.PositiveIntegerField()
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["position", "id"]
        indexes = [models.Index(fields=["playlist", "position"])]


class PlayEvent(models.Model):
    """One playback of a track, used for the "recently played" sections."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="play_events")
    track = models.ForeignKey(Track, on_delete=models.CASCADE, related_name="play_events")
    playlist = models.ForeignKey(Playlist, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    played_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ["-played_at"]
