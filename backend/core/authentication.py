from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed

from core.models import DeviceToken, hash_token


class DeviceTokenAuthentication(BaseAuthentication):
    """``Authorization: Bearer <token>`` for the native app.

    Bearer tokens cannot be attached by other websites, so these requests need no CSRF check.
    """

    def authenticate(self, request):
        header = get_authorization_header(request).decode("latin-1")
        scheme, _, raw = header.partition(" ")
        if scheme.lower() != "bearer" or not raw.strip():
            return None
        token = DeviceToken.objects.select_related("user").filter(key_hash=hash_token(raw.strip())).first()
        if token is None or not token.user.is_active:
            raise AuthenticationFailed("Invalid or revoked token")
        token.touch()
        return token.user, token
