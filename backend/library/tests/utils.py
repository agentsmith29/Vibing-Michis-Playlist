import io
import shutil
import tempfile
from pathlib import Path

from django.test import override_settings
from PIL import Image

# One MPEG-1 Layer III frame header: 128 kbit/s, 44.1 kHz, stereo -> 417 bytes per frame.
_FRAME = b"\xff\xfb\x90\x00" + b"\x00" * 413


def silent_mp3_bytes(frames: int = 60) -> bytes:
    return _FRAME * frames


def cover_bytes(color=(200, 40, 40)) -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (64, 64), color).save(output, "JPEG")
    return output.getvalue()


class TempLibraryMixin:
    """Points MUSIC_ROOT, MEDIA_ROOT and STAGING_ROOT at fresh temporary folders."""

    def setUp(self):
        super().setUp()
        self._tmp = Path(tempfile.mkdtemp(prefix="michi-test-"))
        self.music_root = self._tmp / "music"
        self.music_root.mkdir()
        (self._tmp / "media").mkdir()
        (self._tmp / "staging").mkdir()
        self._override = override_settings(
            MUSIC_ROOT=self.music_root,
            MEDIA_ROOT=self._tmp / "media",
            STAGING_ROOT=self._tmp / "staging",
            FILE_UPLOAD_TEMP_DIR=self._tmp / "staging",
            USE_X_ACCEL_REDIRECT=False,
        )
        self._override.enable()

    def tearDown(self):
        self._override.disable()
        shutil.rmtree(self._tmp, ignore_errors=True)
        super().tearDown()

    def make_mp3(self, relative: str, **tags) -> Path:
        from library.services.tagging import write_tags

        path = self.music_root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(silent_mp3_bytes())
        if tags:
            picture = tags.pop("picture", None)
            write_tags(path, picture=(picture, "image/jpeg") if picture else None, **tags)
        return path
