#!/usr/bin/env bash
# Supervisor loop for yeetd: relaunches it whenever it exits.
# Designed to be invoked via `setsid` so it owns its own session,
# meaning the entry shell can leave and the supervisor keeps running.

set -u

YEETD_BIN=${YEETD_BIN:-/usr/sbin/yeetd}
YEETD_LOG=${YEETD_LOG:-/var/log/yeetd.log}
RESTART_DELAY=${RESTART_DELAY:-1}

[ -x "$YEETD_BIN" ] || {
    printf '[%s] supervisor/yeetd: %s not found or not executable; exiting\n' \
        "$(date '+%Y-%m-%d %H:%M:%S')" "$YEETD_BIN" >>"$YEETD_LOG"
    exit 1
}

# Forward SIGTERM to the running yeetd so the container can shut down cleanly.
yeetd_pid=
trap '[ -n "$yeetd_pid" ] && kill -TERM "$yeetd_pid" 2>/dev/null; exit 0' TERM INT

while true; do
    "$YEETD_BIN" >>"$YEETD_LOG" 2>&1 &
    yeetd_pid=$!
    wait "$yeetd_pid"
    status=$?
    printf '[%s] supervisor/yeetd: yeetd exited (status %d); restarting in %ss\n' \
        "$(date '+%Y-%m-%d %H:%M:%S')" "$status" "$RESTART_DELAY" >>"$YEETD_LOG"
    sleep "$RESTART_DELAY"
done
