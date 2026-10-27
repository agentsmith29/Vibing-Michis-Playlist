#!/bin/sh
set -e

case "$1" in
  web)
    python manage.py migrate --noinput
    python manage.py ensure_admin
    exec gunicorn config.wsgi:application \
      --bind 0.0.0.0:8000 \
      --workers "${GUNICORN_WORKERS:-3}" \
      --threads 4 \
      --timeout 600 \
      --worker-tmp-dir /dev/shm \
      --forwarded-allow-ips "*" \
      --access-logfile -
    ;;
  worker)
    exec python manage.py run_worker
    ;;
  *)
    exec "$@"
    ;;
esac
