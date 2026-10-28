import io
import zipfile
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from jobs.models import Job
from jobs.worker import claim_next, run
from library.models import Album, Artist, Artwork, ImportSettings, Playlist, Track
from library.services.indexer import scan_library
from library.services.paths import safe_filename
from library.services.tagging import read_tags, write_tags
from library.services.youtube import YouTubeError, audio_formats, clean_title, default_format, normalize_url
from library.tests.utils import TempLibraryMixin, cover_bytes, encode_silence, requires_ffmpeg, silent_mp3_bytes


class TaggingAndScanTests(TempLibraryMixin, TestCase):
    def test_tags_round_trip(self):
        path = self.make_mp3(
            "song.mp3", title="Ünïcødé Song", artist="Artist", album="Album", year=1999, track_number=3,
            picture=cover_bytes(),
        )
        meta = read_tags(path)
        self.assertEqual((meta.title, meta.artist, meta.album, meta.year, meta.track_number),
                         ("Ünïcødé Song", "Artist", "Album", 1999, 3))
        self.assertIsNotNone(meta.picture)
        self.assertGreater(meta.duration, 1)

    def test_scan_adds_updates_and_removes(self):
        self.make_mp3("a.mp3", title="A", artist="Band", album="First", picture=cover_bytes())
        self.make_mp3("sub/b.mp3", title="B", artist="band", album="First")
        self.make_mp3("c.mp3", title="C", artist="Solo", album="Other", picture=cover_bytes((0, 0, 255)))
        self.make_mp3(".hidden.mp3", title="Hidden", artist="X")
        (self.music_root / "notes.txt").write_text("not music")

        stats = scan_library()
        self.assertEqual((stats["added"], stats["errors"]), (3, 0))
        self.assertEqual(Artist.objects.count(), 2, "artist names are matched case-insensitively")
        album = Album.objects.get(title="First")
        self.assertEqual(album.tracks.count(), 2)
        self.assertIsNotNone(album.artwork)

        self.assertEqual(scan_library()["updated"], 0, "unchanged files are skipped")

        (self.music_root / "c.mp3").unlink()
        stats = scan_library()
        self.assertEqual(stats["removed"], 1)
        self.assertFalse(Artist.objects.filter(name="Solo").exists())
        self.assertEqual(Artwork.objects.count(), 1, "unused artwork is pruned")

    def test_scan_never_wipes_library_when_folder_is_empty(self):
        self.make_mp3("a.mp3", title="A", artist="Band")
        scan_library()
        (self.music_root / "a.mp3").unlink()
        scan_library()
        self.assertEqual(Track.objects.count(), 1)

    def test_broken_file_does_not_abort_scan(self):
        (self.music_root / "broken.mp3").write_bytes(b"definitely not audio")
        self.make_mp3("ok.mp3", title="OK", artist="Band")
        stats = scan_library()
        self.assertEqual((stats["added"], stats["errors"]), (1, 1))


class HelperTests(TestCase):
    def test_safe_filename(self):
        self.assertEqual(safe_filename("../../etc/passwd"), "etcpasswd")
        self.assertEqual(safe_filename('AC/DC: "Back" <In> Black?.mp3'), "ACDC Back In Black.mp3")
        self.assertEqual(safe_filename("   "), "untitled")

    def test_youtube_url_validation(self):
        self.assertEqual(normalize_url("https://youtu.be/dQw4w9WgXcQ?si=x"), "https://www.youtube.com/watch?v=dQw4w9WgXcQ")
        self.assertEqual(
            normalize_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&index=2"),
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        )
        for bad in ("https://evil.com/watch?v=dQw4w9WgXcQ", "file:///etc/passwd", "https://youtube.com/watch"):
            with self.assertRaises(YouTubeError):
                normalize_url(bad)

    def test_clean_title(self):
        self.assertEqual(clean_title("Phil Collins - In The Air Tonight (Official Music Video) [HD]"),
                         "Phil Collins In The Air Tonight")

    def test_audio_formats_prefer_aac(self):
        info = {"formats": [
            {"format_id": "251", "acodec": "opus", "vcodec": "none", "abr": 129.5, "protocol": "https", "ext": "webm"},
            {"format_id": "140", "acodec": "mp4a.40.2", "vcodec": "none", "abr": 130, "protocol": "https", "ext": "m4a"},
            {"format_id": "141", "acodec": "mp4a.40.2", "vcodec": "none", "abr": 256, "protocol": "https", "ext": "m4a"},
            {"format_id": "251-drc", "acodec": "opus", "vcodec": "none", "abr": 129, "protocol": "https"},
            {"format_id": "234", "acodec": "mp4a.40.2", "vcodec": "none", "protocol": "m3u8_native"},
            {"format_id": "18", "acodec": "mp4a.40.2", "vcodec": "avc1", "abr": 96, "protocol": "https"},
        ]}
        formats = audio_formats(info)
        self.assertEqual([f["id"] for f in formats], ["141", "140", "251"])
        self.assertEqual((formats[0]["label"], formats[0]["lossless"]), ("AAC", False))
        self.assertEqual(default_format(formats)["id"], "141")
        self.assertEqual(default_format([f for f in formats if f["id"] == "251"])["id"], "251")


class ApiTests(TempLibraryMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.user = get_user_model().objects.create_user("michi", password="secret-pass-123")
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_authentication_required(self):
        anonymous = APIClient()
        for url in ("/api/tracks/", "/api/playlists/", "/api/home/", "/api/jobs/"):
            self.assertEqual(anonymous.get(url).status_code, 403, url)

    def test_stream_supports_ranges(self):
        self.make_mp3("a.mp3", title="A", artist="Band")
        scan_library()
        track = Track.objects.get()
        response = self.client.get(f"/api/tracks/{track.id}/stream/", HTTP_RANGE="bytes=0-9")
        self.assertEqual(response.status_code, 206)
        self.assertEqual(len(b"".join(response.streaming_content)), 10)

    def test_edit_track_writes_tags_to_file(self):
        path = self.make_mp3("a.mp3", title="Old", artist="Band", album="LP")
        scan_library()
        track = Track.objects.get()
        response = self.client.patch(f"/api/tracks/{track.id}/", {"title": "New", "year": 2001}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data["title"], "New")
        meta = read_tags(path)
        self.assertEqual((meta.title, meta.artist, meta.album, meta.year), ("New", "Band", "LP", 2001))

    def test_edit_rejects_foreign_artwork_url(self):
        self.make_mp3("a.mp3", title="A", artist="Band")
        scan_library()
        track = Track.objects.get()
        response = self.client.patch(
            f"/api/tracks/{track.id}/", {"artwork_url": "https://169.254.169.254/latest"}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_delete_track_removes_file(self):
        path = self.make_mp3("a.mp3", title="A", artist="Band")
        scan_library()
        track = Track.objects.get()
        self.assertEqual(self.client.delete(f"/api/tracks/{track.id}/").status_code, 204)
        self.assertFalse(path.exists())
        self.assertFalse(Artist.objects.exists())

    def test_playlist_lifecycle(self):
        for name in ("a", "b", "c"):
            self.make_mp3(f"{name}.mp3", title=name.upper(), artist="Band")
        scan_library()
        ids = list(Track.objects.order_by("title").values_list("id", flat=True))

        response = self.client.post("/api/playlists/", {"name": "Mix", "track_ids": ids[:2]}, format="json")
        self.assertEqual(response.status_code, 201)
        playlist_id = response.data["id"]
        response = self.client.post(f"/api/playlists/{playlist_id}/tracks/", {"track_ids": [ids[2]]}, format="json")
        entries = [e["id"] for e in response.data["entries"]]
        self.assertEqual([e["track"]["title"] for e in response.data["entries"]], ["A", "B", "C"])

        response = self.client.post(
            f"/api/playlists/{playlist_id}/reorder/", {"entry_ids": entries[::-1]}, format="json"
        )
        self.assertEqual([e["track"]["title"] for e in response.data["entries"]], ["C", "B", "A"])
        bad = self.client.post(f"/api/playlists/{playlist_id}/reorder/", {"entry_ids": entries[:1]}, format="json")
        self.assertEqual(bad.status_code, 400)

        response = self.client.delete(f"/api/playlists/{playlist_id}/entries/{entries[0]}/")
        self.assertEqual(response.data["track_count"], 2)
        self.assertEqual(self.client.patch(f"/api/playlists/{playlist_id}/", {"name": "  "}, format="json").status_code, 400)
        self.assertEqual(self.client.delete(f"/api/playlists/{playlist_id}/").status_code, 204)

    def test_history_feeds_home(self):
        self.make_mp3("a.mp3", title="A", artist="Band")
        scan_library()
        track = Track.objects.get()
        playlist = Playlist.objects.create(name="P")
        self.client.post("/api/history/", {"track_id": track.id, "playlist_id": playlist.id}, format="json")
        self.client.post("/api/history/", {"track_id": track.id}, format="json")  # duplicate within 30s
        home = self.client.get("/api/home/").data
        self.assertEqual([t["id"] for t in home["recent_tracks"]], [track.id])
        self.assertEqual([p["id"] for p in home["recent_playlists"]], [playlist.id])
        self.assertEqual(self.user.play_events.count(), 1)

    def test_search(self):
        self.make_mp3("a.mp3", title="In The Air Tonight", artist="Phil Collins", album="Face Value")
        self.make_mp3("b.mp3", title="Other", artist="Someone")
        scan_library()
        data = self.client.get("/api/search/", {"q": "collins air"}).data
        self.assertEqual([t["title"] for t in data["tracks"]], ["In The Air Tonight"])
        self.assertEqual([a["title"] for a in data["albums"]], [])
        self.assertEqual([a["name"] for a in self.client.get("/api/search/", {"q": "phil"}).data["artists"]],
                         ["Phil Collins"])

    def test_upload_mp3_files(self):
        good = SimpleUploadedFile("My Song.mp3", silent_mp3_bytes(), content_type="audio/mpeg")
        bad = SimpleUploadedFile("evil.mp3", b"<?php echo 1; ?>", content_type="audio/mpeg")
        wrong = SimpleUploadedFile("script.sh", b"rm -rf /", content_type="text/plain")
        response = self.client.post("/api/import/upload/", {"files": [good, bad, wrong]}, format="multipart")
        self.assertEqual(response.status_code, 201)
        self.assertEqual([t["title"] for t in response.data["tracks"]], ["My Song"])
        self.assertEqual(len(response.data["errors"]), 2)
        self.assertEqual(sorted(p.name for p in self.music_root.iterdir()), ["My Song.mp3"])

    def _zip(self, members: dict[str, bytes]) -> SimpleUploadedFile:
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            for name, data in members.items():
                archive.writestr(name, data)
        return SimpleUploadedFile("Road Trip.zip", buffer.getvalue(), content_type="application/zip")

    def test_zip_import_creates_playlist_in_m3u_order(self):
        upload = self._zip({
            "Road Trip/02 second.mp3": silent_mp3_bytes(),
            "Road Trip/01 first.mp3": silent_mp3_bytes(),
            "../../escape.mp3": silent_mp3_bytes(),
            "Road Trip/readme.txt": b"hello",
            "__MACOSX/._01 first.mp3": b"junk",
            "Road Trip/list.m3u": b"#EXTM3U\n02 second.mp3\n01 first.mp3\n",
        })
        response = self.client.post("/api/import/zip/", {"file": upload}, format="multipart")
        self.assertEqual(response.status_code, 202)
        job = claim_next()
        run(job)
        job.refresh_from_db()
        self.assertEqual(job.status, Job.Status.DONE, job.error)
        self.assertEqual(job.result["imported"], 3)

        folder = self.music_root / "Road Trip"
        self.assertEqual(sorted(p.name for p in folder.iterdir()), ["01 first.mp3", "02 second.mp3", "escape.mp3"])
        self.assertEqual(sorted(p.name for p in self.music_root.iterdir()), ["Road Trip"])
        playlist = Playlist.objects.get(pk=job.result["playlist_id"])
        self.assertEqual(playlist.name, "Road Trip")
        titles = [e.track.title for e in playlist.entries.select_related("track")]
        self.assertEqual(titles, ["02 second", "01 first", "escape"])
        self.assertFalse(job.staging_dir.exists())

    def test_zip_without_mp3_fails_cleanly(self):
        response = self.client.post("/api/import/zip/", {"file": self._zip({"a.txt": b"x"})}, format="multipart")
        job = claim_next()
        run(job)
        job.refresh_from_db()
        self.assertEqual(job.status, Job.Status.FAILED)
        self.assertIn("does not contain any audio", job.error)
        self.assertEqual(list(self.music_root.iterdir()), [])
        self.assertEqual(response.status_code, 202)

    def test_youtube_review_and_finalize(self):
        job = Job.objects.create(kind=Job.Kind.YOUTUBE, status=Job.Status.REVIEW, payload={"url": "x"})
        job.staging_dir.mkdir(parents=True)
        (job.staging_dir / "abc.mp3").write_bytes(silent_mp3_bytes())
        job.result = {"file": "abc.mp3"}
        job.save()
        playlist = Playlist.objects.create(name="Fresh")

        data = {"title": "Song: Part 1", "artist": "Band", "album": "LP", "year": 2020, "playlist_id": playlist.id}
        response = self.client.post(f"/api/import/youtube/{job.id}/finalize/", data, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data["status"], "done")
        self.assertTrue((self.music_root / "Song Part 1.mp3").exists())
        self.assertEqual(playlist.entries.get().track.title, "Song: Part 1")
        again = self.client.post(f"/api/import/youtube/{job.id}/finalize/", data, format="json")
        self.assertEqual(again.status_code, 404, "a job can only be finalized once")


@requires_ffmpeg
class FormatTests(TempLibraryMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.user = get_user_model().objects.create_user("michi", password="secret-pass-123")
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def _upload(self, name: str, data: bytes):
        upload = SimpleUploadedFile(name, data, content_type="application/octet-stream")
        return self.client.post("/api/import/upload/", {"files": [upload]}, format="multipart")

    def test_tags_round_trip_m4a_and_flac(self):
        for name, codec_args, codec in (
            ("a.m4a", ("-c:a", "aac"), "aac"),
            ("b.m4a", ("-c:a", "alac"), "alac"),
            ("c.flac", ("-c:a", "flac"), "flac"),
        ):
            path = encode_silence(self.music_root / name, *codec_args)
            write_tags(path, title="Ünï", artist="Band", album="LP", year=1999, track_number=4,
                       picture=(cover_bytes(), "image/jpeg"))
            meta = read_tags(path)
            self.assertEqual((meta.title, meta.artist, meta.album, meta.year, meta.track_number, meta.codec),
                             ("Ünï", "Band", "LP", 1999, 4, codec), name)
            self.assertEqual(meta.picture, cover_bytes(), name)
            write_tags(path, title="Ünï", artist="Band")
            self.assertEqual((read_tags(path).album, read_tags(path).track_number), ("", None), name)
        self.assertEqual(scan_library()["added"], 3)

    def test_lossless_uploads_use_the_lossless_default(self):
        wav = encode_silence(self._tmp / "Take One.wav", "-c:a", "pcm_s16le").read_bytes()
        response = self._upload("Take One.wav", wav)
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.data["tracks"][0]["file_path"], "Take One.flac")
        self.assertEqual(read_tags(self.music_root / "Take One.flac").codec, "flac")

        ImportSettings.objects.update_or_create(pk=1, defaults={"lossless_format": "alac"})
        flac = encode_silence(self._tmp / "src.flac", "-c:a", "flac")
        write_tags(flac, title="Tagged", artist="Band", picture=(cover_bytes(), "image/jpeg"))
        response = self._upload("Take Two.flac", flac.read_bytes())
        self.assertEqual(response.data["tracks"][0]["file_path"], "Take Two.m4a")
        meta = read_tags(self.music_root / "Take Two.m4a")
        self.assertEqual((meta.codec, meta.title, meta.picture), ("alac", "Tagged", cover_bytes()))
        self.assertEqual(sorted(p.name for p in self.music_root.iterdir()), ["Take One.flac", "Take Two.m4a"])

    def test_lossy_uploads_are_kept_unchanged(self):
        data = encode_silence(self._tmp / "x.m4a", "-c:a", "aac").read_bytes()
        ImportSettings.objects.update_or_create(pk=1, defaults={"lossy_format": "mp3"})
        response = self._upload("Song.m4a", data)
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual((self.music_root / "Song.m4a").read_bytes(), data)

    def test_stream_content_type_matches_format(self):
        encode_silence(self.music_root / "a.flac", "-c:a", "flac")
        scan_library()
        response = self.client.get(f"/api/tracks/{Track.objects.get().id}/stream/")
        self.assertEqual(response["Content-Type"], "audio/flac")

    def test_import_settings_api(self):
        data = self.client.get("/api/import/settings/").data
        self.assertEqual((data["lossy_format"], data["lossless_format"]), ("aac", "flac"))
        self.assertEqual([f["key"] for f in data["formats"] if f["lossless"]], ["flac", "alac"])
        response = self.client.put("/api/import/settings/", {"lossless_format": "alac"}, format="json")
        self.assertEqual(response.data["lossless_format"], "alac")
        bad = self.client.put("/api/import/settings/", {"lossy_format": "flac"}, format="json")
        self.assertEqual(bad.status_code, 400, "lossy sources cannot default to a lossless format")

    def _run_youtube(self, **payload):
        def fake_download(url, target_dir, format_id=None, progress=None):
            source = encode_silence(target_dir / "source.m4a", "-c:a", "aac")
            return source, {"id": "abc", "title": "Band - Song", "acodec": "mp4a.40.2", "abr": 130, "format_id": format_id}

        job = Job.objects.create(kind=Job.Kind.YOUTUBE, payload={"url": "https://www.youtube.com/watch?v=abc"} | payload)
        with mock.patch("library.tasks.youtube.download_audio", fake_download), \
                mock.patch("library.tasks.search_itunes", return_value=[]):
            run(claim_next())
        job.refresh_from_db()
        self.assertEqual(job.status, Job.Status.REVIEW, job.error)
        return job

    def test_youtube_keeps_aac_and_converts_on_request(self):
        job = self._run_youtube(format_id="140")
        self.assertEqual(job.result["file"], "track.m4a")
        self.assertEqual(job.result["format"], {"source": "AAC", "bitrate": 130, "storage": "aac", "converted": False})
        self.assertEqual(sorted(p.name for p in job.staging_dir.iterdir()), ["track.m4a"])

        response = self.client.post(
            f"/api/import/youtube/{job.id}/finalize/", {"title": "Song", "artist": "Band"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(read_tags(self.music_root / "Song.m4a").title, "Song")

        job = self._run_youtube(storage_format="flac")
        self.assertEqual((job.result["file"], job.result["format"]["converted"]), ("track.flac", True))
        self.assertEqual(read_tags(job.staging_dir / "track.flac").codec, "flac")
