import importlib.metadata
import shutil

from django.conf import settings
from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import connection
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from jobs.models import Job
from jobs.serializers import JobSerializer
from jobs.worker import enqueue
from library.services.youtube import ytdlp_version


def user_data(user):
    return {"id": user.pk, "username": user.get_username(), "is_staff": user.is_staff}


class HealthView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        return Response({"status": "ok"})


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
