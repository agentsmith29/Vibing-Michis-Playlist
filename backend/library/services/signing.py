"""Short-lived signed stream URLs.

Native audio players cannot always send an ``Authorization`` header (expo-audio's
playlist on Android drops them), so the app asks for signed links instead. A link
is valid for one track, one user and a limited time; the device token itself
never appears in a URL or an access log.
"""

from django.contrib.auth import get_user_model
from django.core import signing

SALT = "michi-playlist.stream"
MAX_AGE = 60 * 60 * 24  # seconds


def sign_stream(track_id: int, user_id: int) -> str:
    return signing.TimestampSigner(salt=SALT).sign(f"{track_id}:{user_id}")


def verify_stream(signature: str, track_id: int):
    """Return the user the link was issued for, or ``None`` if it is invalid or expired."""
    try:
        value = signing.TimestampSigner(salt=SALT).unsign(signature, max_age=MAX_AGE)
    except signing.BadSignature:
        return None
    signed_track, _, user_id = value.partition(":")
    if signed_track != str(track_id) or not user_id.isdigit():
        return None
    return get_user_model().objects.filter(pk=int(user_id), is_active=True).first()
