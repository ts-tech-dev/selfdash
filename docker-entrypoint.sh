#!/bin/sh
# Fix ownership of the (possibly bind-mounted) data dir, then drop privileges.
#
# When ./data is bind-mounted and doesn't exist yet, the Docker daemon creates it
# as root:root — an unprivileged process in the container then can't create the
# SQLite file ("unable to open database file"). Starting as root lets us chown the
# dir to PUID:PGID (default 1000:1000) and re-exec the app as that user.
set -e

DATA_DIR="${DATA_DIR:-/data}"
PUID="${PUID:-1000}"
PGID="${PGID:-1000}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  # Only recurse if the top-level owner is wrong, to avoid a slow chown every boot.
  if [ "$(stat -c '%u:%g' "$DATA_DIR")" != "${PUID}:${PGID}" ]; then
    chown -R "${PUID}:${PGID}" "$DATA_DIR"
  fi
  exec su-exec "${PUID}:${PGID}" "$@"
fi

# Already unprivileged (e.g. `docker run --user ...`): run as-is.
exec "$@"
