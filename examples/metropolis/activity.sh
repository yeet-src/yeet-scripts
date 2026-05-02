#!/usr/bin/env bash
# metropolis activity — spawns "citizens" in a mix of process states
# under realistic names so the boulevard sees R / S / T processes.

set -u

PIDFILE=${PIDFILE:-/tmp/metropolis-activity.pids}
RUN_WORKER=/tmp/.metropolis-run-worker
SLEEP_WORKER=/tmp/.metropolis-sleep-worker
WORKDIR=/tmp/metropolis-bin

NAMES_RUNNING=(transcoder shader-compile cargo-build llm-fwd ffmpeg)
NAMES_SLEEPING=(idle-tab background-sync wallpaper-daemon spotlight)
NAMES_STOPPED=(parked-job paused-render)

write_workers() {
    cat > "$RUN_WORKER" <<'EOF'
#!/bin/bash
while true; do
    end=$((SECONDS + 1 + RANDOM % 5))
    while [ "$SECONDS" -lt "$end" ]; do : ; done
    sleep "0.$((1 + RANDOM % 8))"
done
EOF
    cat > "$SLEEP_WORKER" <<'EOF'
#!/bin/bash
while true; do sleep $((30 + RANDOM % 60)); done
EOF
    chmod +x "$RUN_WORKER" "$SLEEP_WORKER"
}

spawn() {
    src=$1; name=$2; freeze=${3:-no}
    link="$WORKDIR/$name"
    ln -sf "$src" "$link"
    "$link" &
    pid=$!
    echo "$pid" >> "$PIDFILE"
    if [ "$freeze" = yes ]; then
        sleep 0.2
        kill -STOP "$pid" 2>/dev/null || true
    fi
}

case "${1:-}" in
    start)
        [ -s "$PIDFILE" ] && exit 0
        write_workers
        mkdir -p "$WORKDIR"
        : > "$PIDFILE"
        for n in "${NAMES_RUNNING[@]}";  do spawn "$RUN_WORKER"   "$n"; done
        for n in "${NAMES_SLEEPING[@]}"; do spawn "$SLEEP_WORKER" "$n"; done
        for n in "${NAMES_STOPPED[@]}";  do spawn "$SLEEP_WORKER" "$n" yes; done
        ;;
    stop)
        if [ -f "$PIDFILE" ]; then
            while read -r pid; do
                [ -n "$pid" ] && kill -CONT "$pid" 2>/dev/null || true
                [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
            done < "$PIDFILE"
            rm -f "$PIDFILE"
        fi
        rm -rf "$WORKDIR"
        rm -f "$RUN_WORKER" "$SLEEP_WORKER"
        ;;
    *)
        echo "usage: $(basename "$0") {start|stop}" >&2
        exit 1
        ;;
esac
