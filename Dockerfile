# syntax=docker/dockerfile:1

# --- Frontend build -------------------------------------------------------------
FROM node:24-alpine AS frontend-build
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# --- Reverse proxy + static frontend ----------------------------------------------
FROM nginxinc/nginx-unprivileged:1.29-alpine AS proxy
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-build /src/dist /usr/share/nginx/html

# --- Django API + background worker ------------------------------------------------
FROM python:3.13-slim-trixie AS app

ARG APP_UID=1000
ARG APP_GID=1000

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DATA_DIR=/data \
    MUSIC_ROOT=/music \
    XDG_CACHE_HOME=/data/cache \
    DENO_DIR=/data/cache/deno

# ffmpeg converts downloads to mp3; deno is the JavaScript runtime yt-dlp needs for YouTube.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=denoland/deno:bin-2.5.6 /deno /usr/local/bin/deno

RUN groupadd --gid "${APP_GID}" app \
    && useradd --uid "${APP_UID}" --gid app --home-dir /app --shell /usr/sbin/nologin app \
    && mkdir -p /data /music \
    && chown app:app /data /music

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install -r requirements.txt

COPY backend/ .
RUN DJANGO_SECRET_KEY=build-only DATA_DIR=/tmp/build python manage.py collectstatic --noinput \
    && rm -rf /tmp/build
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/entrypoint.sh

USER app
EXPOSE 8000
ENTRYPOINT ["entrypoint.sh"]
CMD ["web"]
