#!/bin/sh
# Prepare the music library, then run the bot as an unprivileged user.
#
# The library lives on a mounted volume, and bind mounts arrive owned by the
# host's user. Starting as root lets us fix ownership before dropping
# privileges, so /upload can write without any manual chown on the host.
set -e

MUSIC_DIR="${MUSIC_DIR:-/app/music}"
APP_UID=1001
APP_GID=1001

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$MUSIC_DIR" 2>/dev/null || true
  # Best-effort: a read-only mount is a valid setup (playback still works), so
  # don't fail the container if we can't take ownership.
  chown -R "$APP_UID:$APP_GID" "$MUSIC_DIR" 2>/dev/null || true
  exec setpriv --reuid="$APP_UID" --regid="$APP_GID" --clear-groups "$@"
fi

# Already unprivileged (e.g. `docker run --user`): run as-is.
exec "$@"
