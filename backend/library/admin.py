from django.contrib import admin

from library.models import Album, Artist, Playlist, PlaylistEntry, PlayEvent, Track


@admin.register(Track)
class TrackAdmin(admin.ModelAdmin):
    list_display = ("title", "artist", "album", "year", "duration", "added_at")
    search_fields = ("title", "artist__name", "album__title", "file_path")
    list_select_related = ("artist", "album")
    raw_id_fields = ("artist", "album", "artwork")


@admin.register(Album)
class AlbumAdmin(admin.ModelAdmin):
    list_display = ("title", "artist", "year")
    search_fields = ("title", "artist__name")
    raw_id_fields = ("artist", "artwork")


@admin.register(Artist)
class ArtistAdmin(admin.ModelAdmin):
    search_fields = ("name",)


class PlaylistEntryInline(admin.TabularInline):
    model = PlaylistEntry
    raw_id_fields = ("track",)
    extra = 0


@admin.register(Playlist)
class PlaylistAdmin(admin.ModelAdmin):
    list_display = ("name", "updated_at")
    inlines = [PlaylistEntryInline]


@admin.register(PlayEvent)
class PlayEventAdmin(admin.ModelAdmin):
    list_display = ("track", "user", "played_at")
    raw_id_fields = ("track", "playlist")
