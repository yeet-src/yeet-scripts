#!/usr/bin/env bash
# proctop activity — spawns CPU-burning workers under realistic-sounding
# names. We write the worker body once and symlink it under each name so
# /proc/PID/comm and /proc/PID/cmdline both read clean.

set -u

PIDFILE=${PIDFILE:-/tmp/proctop-activity.pids}
WORKER=/tmp/.proctop-worker
WORKDIR=/tmp/proctop-bin

NAMES=(transcoder shader-compile pdf-render index-build sync-worker llm-fwd ffmpeg cargo-build)

write_worker() {
    cat > "$WORKER" <<'EOF'
#!/bin/bash
while true; do
    end=$((SECONDS + 1 + RANDOM % 5))
    while [ "$SECONDS" -lt "$end" ]; do : ; done
    sleep "0.$((1 + RANDOM % 8))"
done
EOF
    chmod +x "$WORKER"
}

case "${1:-}" in
    start)
        [ -s "$PIDFILE" ] && exit 0
        write_worker
        mkdir -p "$WORKDIR"
        : > "$PIDFILE"
        for name in "${NAMES[@]}"; do
            link="$WORKDIR/$name"
            ln -sf "$WORKER" "$link"
            "$link" &
            echo $! >> "$PIDFILE"
        done
        ;;
    stop)
        if [ -f "$PIDFILE" ]; then
            while read -r pid; do
                [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
            done < "$PIDFILE"
            rm -f "$PIDFILE"
        fi
        rm -rf "$WORKDIR"
        rm -f "$WORKER"
        ;;
    *)
        echo "usage: $(basename "$0") {start|stop}" >&2
        exit 1
        ;;
esac
