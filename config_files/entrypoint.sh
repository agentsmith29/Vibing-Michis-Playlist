#!/bin/sh

# Finde die UID des Benutzers, der den Dienst ausführen soll (z.B. www-data)
# und setze die Berechtigungen des Volume-Ordners passend
chmod -R go+rw /var/www/html
chown -R $PUID:$PGID /var/www/html

# Führe den ursprünglichen Startbefehl aus (z.B. den Nginx-Dienst)

# PHP-FPM im Hintergrund starten
/usr/sbin/php-fpm* --daemonize

# Nginx im Vordergrund starten
exec nginx -g "daemon off;"
# exec "$@"
