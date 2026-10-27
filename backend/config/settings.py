"""Django settings for Michi-Playlist.

Everything that differs between environments is read from environment
variables (see ``.env.example`` in the repository root). The defaults are
suitable for local development: SQLite database and data inside ``backend/var``.
"""

import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name)
    return value if value not in (None, "") else default


def env_bool(name: str, default: bool = False) -> bool:
    value = env(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_int(name: str, default: int) -> int:
    value = env(name)
    return int(value) if value is not None else default


def env_list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in (env(name, default) or "").split(",") if item.strip()]


# --- Paths -----------------------------------------------------------------

# Persistent application data (artwork cache, staging area, secret key, ...).
DATA_DIR = Path(env("DATA_DIR", str(BASE_DIR / "var")))
# The music library: a plain folder of mp3 files that is scanned for changes.
MUSIC_ROOT = Path(env("MUSIC_ROOT", str(BASE_DIR.parent / "music")))
MEDIA_ROOT = DATA_DIR / "media"
STAGING_ROOT = DATA_DIR / "staging"
# Newer yt-dlp versions installed at runtime from the settings page.
YTDLP_OVERLAY_DIR = DATA_DIR / "pylib"

for _directory in (DATA_DIR, MEDIA_ROOT, STAGING_ROOT):
    _directory.mkdir(parents=True, exist_ok=True)


def _load_secret_key() -> str:
    key = env("DJANGO_SECRET_KEY")
    if key:
        return key
    # Generate a key once and persist it so sessions survive restarts.
    path = DATA_DIR / "secret_key"
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        return path.read_text().strip()
    with os.fdopen(fd, "w") as handle:
        key = secrets.token_urlsafe(50)
        handle.write(key)
    return key


# --- Core ------------------------------------------------------------------

SECRET_KEY = _load_secret_key()
DEBUG = env_bool("DJANGO_DEBUG", False)
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "core",
    "jobs",
    "library",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# --- Database --------------------------------------------------------------

if env("POSTGRES_HOST"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "HOST": env("POSTGRES_HOST"),
            "PORT": env("POSTGRES_PORT", "5432"),
            "NAME": env("POSTGRES_DB", "michi"),
            "USER": env("POSTGRES_USER", "michi"),
            "PASSWORD": env("POSTGRES_PASSWORD", ""),
            "CONN_MAX_AGE": 60,
            "CONN_HEALTH_CHECKS": True,
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": DATA_DIR / "db.sqlite3",
            "OPTIONS": {
                "init_command": "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;",
                "transaction_mode": "IMMEDIATE",
            },
        }
    }

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- Auth & security -------------------------------------------------------

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

SESSION_COOKIE_AGE = 60 * 60 * 24 * 30
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"
# Only enable when the app is served via HTTPS (e.g. behind a reverse proxy).
SESSION_COOKIE_SECURE = env_bool("SECURE_COOKIES", False)
CSRF_COOKIE_SECURE = SESSION_COOKIE_SECURE
if env_bool("TRUST_PROXY_HEADERS", False):
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"

# --- REST framework --------------------------------------------------------

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PAGINATION_CLASS": "library.pagination.DefaultPagination",
    "DEFAULT_THROTTLE_RATES": {"login": "10/minute"},
    "UNAUTHENTICATED_USER": None,
}
if DEBUG:
    REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"].append("rest_framework.renderers.BrowsableAPIRenderer")

# --- Static files, uploads -------------------------------------------------

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

FILE_UPLOAD_TEMP_DIR = STAGING_ROOT
FILE_UPLOAD_PERMISSIONS = 0o644
MAX_UPLOAD_FILE_SIZE = env_int("MAX_UPLOAD_FILE_MB", 300) * 1024 * 1024
MAX_ZIP_UNCOMPRESSED_SIZE = env_int("MAX_ZIP_UNCOMPRESSED_MB", 8192) * 1024 * 1024

# When running behind nginx, files are handed off via X-Accel-Redirect so that
# nginx streams them (with HTTP range support) instead of a Python worker.
USE_X_ACCEL_REDIRECT = env_bool("USE_X_ACCEL_REDIRECT", False)

# --- Background worker -----------------------------------------------------

LIBRARY_SCAN_INTERVAL = env_int("LIBRARY_SCAN_INTERVAL", 300)  # seconds, 0 disables
WORKER_POLL_INTERVAL = 1.0
STAGING_MAX_AGE = 60 * 60 * 24  # unreviewed downloads are removed after a day

# --- i18n ------------------------------------------------------------------

LANGUAGE_CODE = "en-us"
TIME_ZONE = env("TZ", "UTC")
USE_I18N = True
USE_TZ = True

# --- Logging ---------------------------------------------------------------

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"simple": {"format": "%(asctime)s %(levelname)s %(name)s: %(message)s"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "simple"}},
    "root": {"handlers": ["console"], "level": env("LOG_LEVEL", "INFO")},
    "loggers": {"django": {"handlers": ["console"], "level": "INFO", "propagate": False}},
}
