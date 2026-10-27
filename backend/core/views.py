import importlib.metadata
import shutil

from django.conf import settings
from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import connection
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from core.models import DeviceToken
from jobs.models import Job
from jobs.serializers import JobSerializer
from jobs.worker import enqueue
from library.services.youtube import ytdlp_version


API_VERSION = 1


def user_data(user):
    return {"id": user.pk, "username": user.get_username(), "is_staff": user.is_staff}


class HealthView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        # "app" + "api_version" let the native app recognise a Michi Playlist server.
        return Response({"status": "ok", "app": "michi-playlist", "api_version": API_VERSION})


@method_decorator(ensure_csrf_cookie, name="dispatch")
class SessionView(APIView):
    """Tells the SPA who is logged in and makes sure it has a CSRF cookie."""

    permission_classes = [AllowAny]

    def get(self, request):
        if request.user and request.user.is_authenticated:
            return Response({"authenticated": True, "user": user_data(request.user)})
        return Response({"authenticated": False, "user": None})


@method_decorator(csrf_protect, name="dispatch")
class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        user = authenticate(
            request, username=request.data.get("username", ""), password=request.data.get("password", "")
        )
        if user is None:
            return Response({"detail": "Wrong username or password"}, status=status.HTTP_400_BAD_REQUEST)
        login(request, user)
        return Response({"authenticated": True, "user": user_data(user)})


class LogoutView(APIView):
    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordView(APIView):
    def post(self, request):
        user = request.user
        if not user.check_password(request.data.get("current_password", "")):
            raise ValidationError({"current_password": "The current password is wrong"})
        new_password = request.data.get("new_password", "")
        try:
            validate_password(new_password, user)
        except DjangoValidationError as exc:
            raise ValidationError({"new_password": list(exc.messages)})
        user.set_password(new_password)
        user.save()
        update_session_auth_hash(request, user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class SystemView(APIView):
    def get(self, request):
        last_update = Job.objects.filter(kind=Job.Kind.UPDATE_YTDLP).first()
        return Response(
            {
                "version": "2.0.0",
                "django": importlib.metadata.version("django"),
                "ytdlp": ytdlp_version(),
                "ffmpeg": shutil.which("ffmpeg") is not None,
                "deno": shutil.which("deno") is not None,
                "music_root": str(settings.MUSIC_ROOT),
                "scan_interval": settings.LIBRARY_SCAN_INTERVAL,
                "last_ytdlp_update": JobSerializer(last_update).data if last_update else None,
            }
        )


class UpdateYtDlpView(APIView):
    def post(self, request):
        job = enqueue(Job.Kind.UPDATE_YTDLP, user=request.user, unique=True)
        return Response(JobSerializer(job).data, status=status.HTTP_202_ACCEPTED)


class TokenLoginView(APIView):
    """Login for the native app: returns a device token (shown only once)."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        user = authenticate(
            request, username=request.data.get("username", ""), password=request.data.get("password", "")
        )
        if user is None:
            return Response({"detail": "Wrong username or password"}, status=status.HTTP_400_BAD_REQUEST)
        token, raw = DeviceToken.issue(user, str(request.data.get("device_name", "")).strip())
        return Response({"token": raw, "device_id": token.pk, "user": user_data(user)}, status=status.HTTP_201_CREATED)


class TokenLogoutView(APIView):
    def post(self, request):
        if isinstance(request.auth, DeviceToken):
            request.auth.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def device_data(token: DeviceToken, current=None):
    return {
        "id": token.pk,
        "name": token.name,
        "hint": token.hint,
        "created_at": token.created_at,
        "last_used_at": token.last_used_at,
        "current": current is not None and token.pk == current.pk,
    }


class DeviceListView(APIView):
    def get(self, request):
        current = request.auth if isinstance(request.auth, DeviceToken) else None
        return Response([device_data(t, current) for t in request.user.device_tokens.all()])


class DeviceDetailView(APIView):
    def delete(self, request, pk):
        get_object_or_404(DeviceToken, pk=pk, user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
