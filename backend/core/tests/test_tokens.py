from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import DeviceToken
from library.models import PlayEvent, Track
from library.services.indexer import scan_library
from library.tests.utils import TempLibraryMixin


class DeviceTokenTests(TempLibraryMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.user = get_user_model().objects.create_user("michi", password="secret-pass-123")
        self.client = APIClient(enforce_csrf_checks=True)

    def login(self, name="Pixel 9") -> str:
        response = self.client.post(
            "/api/auth/token/", {"username": "michi", "password": "secret-pass-123", "device_name": name}, format="json"
        )
        self.assertEqual(response.status_code, 201, response.content)
        return response.data["token"]

    def test_health_identifies_server(self):
        data = self.client.get("/api/health/").data
        self.assertEqual((data["app"], data["api_version"]), ("michi-playlist", 1))

    def test_wrong_password(self):
        response = self.client.post("/api/auth/token/", {"username": "michi", "password": "nope"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(DeviceToken.objects.exists())

    def test_token_grants_access_without_csrf(self):
        token = self.login()
        self.assertTrue(token.startswith("mp_"))
        self.assertNotIn(token, DeviceToken.objects.values_list("key_hash", flat=True), "only a hash is stored")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        self.assertEqual(self.client.get("/api/tracks/").status_code, 200)
        # Unsafe methods work without a CSRF token for bearer requests.
        self.assertEqual(self.client.post("/api/playlists/", {"name": "On the go"}, format="json").status_code, 201)
        self.assertIsNotNone(DeviceToken.objects.get().last_used_at)

    def test_invalid_and_revoked_tokens_are_rejected(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer mp_invalid")
        self.assertEqual(self.client.get("/api/tracks/").status_code, 403)

        token = self.login()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        devices = self.client.get("/api/auth/devices/").data
        self.assertEqual([(d["name"], d["current"]) for d in devices], [("Pixel 9", True)])
        self.assertEqual(self.client.delete(f"/api/auth/devices/{devices[0]['id']}/").status_code, 204)
        self.assertEqual(self.client.get("/api/tracks/").status_code, 403)

    def test_app_logout_deletes_only_its_token(self):
        first, second = self.login("Phone"), self.login("Tablet")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {first}")
        self.assertEqual(self.client.post("/api/auth/token/logout/").status_code, 204)
        self.assertEqual(list(DeviceToken.objects.values_list("name", flat=True)), ["Tablet"])
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {second}")
        self.assertEqual(self.client.get("/api/home/").status_code, 200)

    def test_sync_reports_changed_and_missing_tracks(self):
        self.make_mp3("a.mp3", title="A", artist="Band")
        scan_library()
        track = Track.objects.get()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.login()}")
        data = self.client.post("/api/sync/tracks/", {"ids": [track.id, 999]}, format="json").data
        self.assertEqual([t["title"] for t in data["tracks"]], ["A"])
        self.assertEqual(data["missing"], [999])

        # Editing the song rewrites the file, so its version changes and apps re-download it.
        before = data["tracks"][0]["file_version"]
        self.client.patch(f"/api/tracks/{track.id}/", {"title": "A (remastered)"}, format="json")
        after = self.client.post("/api/sync/tracks/", {"ids": [track.id]}, format="json").data["tracks"][0]
        self.assertNotEqual(after["file_version"], before)
        self.assertEqual(self.client.post("/api/sync/tracks/", {"ids": "1"}, format="json").status_code, 400)

    def test_offline_history_batch(self):
        self.make_mp3("a.mp3", title="A", artist="Band")
        scan_library()
        track = Track.objects.get()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.login()}")
        yesterday = (timezone.now() - timezone.timedelta(days=1)).isoformat()
        future = (timezone.now() + timezone.timedelta(days=3)).isoformat()
        events = [
            {"track_id": track.id, "played_at": yesterday},
            {"track_id": track.id, "played_at": future},
            {"track_id": 999, "played_at": yesterday},
            "garbage",
        ]
        self.assertEqual(self.client.post("/api/history/", {"events": events}, format="json").status_code, 204)
        played = list(PlayEvent.objects.order_by("played_at").values_list("played_at", flat=True))
        self.assertEqual(len(played), 2)
        self.assertLess(played[0], timezone.now() - timezone.timedelta(hours=23))
        self.assertLessEqual(played[1], timezone.now(), "future timestamps are clamped")

    def test_signed_stream_urls(self):
        self.make_mp3("a.mp3", title="A", artist="Band")
        self.make_mp3("b.mp3", title="B", artist="Band")
        scan_library()
        first, second = Track.objects.order_by("title")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.login()}")
        data = self.client.post("/api/tracks/stream-urls/", {"ids": [first.id, 999]}, format="json").data
        self.assertEqual(list(data["urls"]), [str(first.id)])
        url = data["urls"][str(first.id)]

        anonymous = APIClient()
        self.assertEqual(anonymous.get(url, HTTP_RANGE="bytes=0-9").status_code, 206)
        self.assertEqual(anonymous.get(f"/api/tracks/{first.id}/stream/").status_code, 403)
        signature = url.split("sig=")[1]
        self.assertEqual(anonymous.get(f"/api/tracks/{second.id}/stream/?sig={signature}").status_code, 403)
        self.assertEqual(anonymous.get(url[:-2] + "xx").status_code, 403)
        with mock.patch("library.services.signing.MAX_AGE", -1):
            self.assertEqual(anonymous.get(url).status_code, 403, "expired links are rejected")

        self.user.is_active = False
        self.user.save()
        self.assertEqual(anonymous.get(url).status_code, 403, "links die with the user")
