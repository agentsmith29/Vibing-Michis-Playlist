from django.urls import path, re_path
from rest_framework.routers import SimpleRouter

from library import views

router = SimpleRouter()
router.register("tracks", views.TrackViewSet, basename="track")
router.register("albums", views.AlbumViewSet, basename="album")
router.register("artists", views.ArtistViewSet, basename="artist")
router.register("playlists", views.PlaylistViewSet, basename="playlist")

urlpatterns = router.urls + [
    path("home/", views.HomeView.as_view()),
    path("search/", views.SearchView.as_view()),
    path("history/", views.HistoryView.as_view()),
    path("sync/tracks/", views.SyncTracksView.as_view()),
    re_path(r"^artwork/(?P<sha1>[0-9a-f]{40})/$", views.ArtworkView.as_view(), name="artwork"),
    path("metadata/search/", views.MetadataSearchView.as_view()),
    path("library/stats/", views.LibraryStatsView.as_view()),
    path("library/scan/", views.ScanView.as_view()),
    path("import/upload/", views.UploadView.as_view()),
    path("import/zip/", views.ZipImportView.as_view()),
    path("import/settings/", views.ImportSettingsView.as_view()),
    path("import/youtube/", views.YouTubeImportView.as_view()),
    path("import/youtube/formats/", views.YouTubeFormatsView.as_view()),
    path("import/youtube/<uuid:job_id>/finalize/", views.YouTubeFinalizeView.as_view()),
    path("import/youtube/<uuid:job_id>/discard/", views.YouTubeDiscardView.as_view()),
]
