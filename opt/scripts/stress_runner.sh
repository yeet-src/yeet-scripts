#!/usr/bin/env bash
# Sidecar — watches /tmp/stress.modes (one mode per line) and runs the
# matching synthetic workloads as background children. Started by
# ai_drive.sh alongside cookstat_spinner.sh; killed on session exit.
#
# Each stressor is a wrapper subshell (PID tracked in $PIDS[mode]) that
# loops the actual workload. Stopping a mode kills the wrapper AND its
# children via pkill -P, so curl/dd/sha256sum jobs don't outlive the
# toggle.
#
# Intensity targets ~70-80% saturation on the relevant subsystem so the
# demos can still render — a fully-pegged box starves the rendering
# itself.

set -u

STATE=/tmp/stress.modes
declare -A PIDS=()

NPROC=$(nproc 2>/dev/null || echo 4)
CPU_WORKERS=$(( NPROC * 3 / 4 ))
(( CPU_WORKERS < 1 )) && CPU_WORKERS=1

DISK_FILE="$HOME/.yeet-stress-disk.dat"

NET_TARGETS=(
    "https://icanhazdadjoke.com/"
    "https://api.chucknorris.io/jokes/random"
    "https://yesno.wtf/api"
    "https://catfact.ninja/fact"
    "https://uselessfacts.jsph.pl/random.json?language=en"
    "https://api.adviceslip.com/advice"
)

start_cpu() {
    (
        while true; do
            for (( w = 0; w < CPU_WORKERS; w++ )); do
                ( sha256sum /usr/bin/* >/dev/null 2>&1 ) &
            done
            wait
        done
    ) &
    PIDS[cpu]=$!
}

start_mem() {
    # Allocate ~512MB in chunks, hold ~20s, release, repeat. Visible in
    # MemAvailable / MemFree timeseries; not aggressive enough to OOM.
    (
        while true; do
            python3 -u -c '
import time
chunks = []
for _ in range(8):
    chunks.append(bytearray(64 * 1024 * 1024))
    time.sleep(0.4)
time.sleep(20)
del chunks
' >/dev/null 2>&1
            sleep 3
        done
    ) &
    PIDS[mem]=$!
}

start_net() {
    (
        while true; do
            burst=$(( RANDOM % 8 + 8 ))
            for (( i = 0; i < burst; i++ )); do
                target="${NET_TARGETS[$(( RANDOM % ${#NET_TARGETS[@]} ))]}"
                curl -s --max-time 5 "$target" >/dev/null 2>&1 &
            done
            wait
            sleep 0.2
        done
    ) &
    PIDS[net]=$!
}

start_disk() {
    # 128MB writes with conv=fsync — flushes to disk so I/O actually
    # registers in iostat / blockstat. Followed by a re-read to drive
    # read I/O too. Container overlayfs may swallow some of this in
    # tmpfs-backed paths; $HOME is the most likely real-disk location.
    (
        while true; do
            dd if=/dev/zero of="$DISK_FILE" bs=1M count=128 conv=fsync \
                >/dev/null 2>&1
            cat "$DISK_FILE" >/dev/null 2>&1
            rm -f "$DISK_FILE"
            sleep 0.2
        done
    ) &
    PIDS[disk]=$!
}

start_procs() {
    # Fork burst — 5–15 short-lived sleeps per cycle. Drives proc count
    # churn and fork-rate visible in any process panel.
    (
        while true; do
            n=$(( RANDOM % 11 + 5 ))
            for (( i = 0; i < n; i++ )); do
                ( exec -a yeet-stress-burst sleep $(( RANDOM % 3 + 1 )) ) &
            done
            wait
            sleep 0.4
        done
    ) &
    PIDS[procs]=$!
}

start_mode() {
    case "$1" in
        cpu)   start_cpu   ;;
        mem)   start_mem   ;;
        net)   start_net   ;;
        disk)  start_disk  ;;
        procs) start_procs ;;
    esac
}

stop_mode() {
    local mode=$1
    local pid=${PIDS[$mode]:-}
    [ -z "$pid" ] && return
    # Kill children first (curl/dd/sha256sum/python loops), then the
    # wrapper. Without -P, the wrapper dies but its inner work outlives.
    pkill -TERM -P "$pid" 2>/dev/null
    kill -TERM "$pid" 2>/dev/null
    unset "PIDS[$mode]"
}

cleanup() {
    for mode in "${!PIDS[@]}"; do
        stop_mode "$mode"
    done
    rm -f "$DISK_FILE"
}
trap cleanup EXIT INT TERM

# Reconcile loop: read desired modes, diff against running, start/stop.
declare -A wanted

while true; do
    wanted=()
    if [ -s "$STATE" ]; then
        while IFS= read -r line; do
            [ -n "$line" ] && wanted[$line]=1
        done < "$STATE"
    fi

    for mode in "${!PIDS[@]}"; do
        [ -z "${wanted[$mode]:-}" ] && stop_mode "$mode"
    done

    for mode in "${!wanted[@]}"; do
        [ -z "${PIDS[$mode]:-}" ] && start_mode "$mode"
    done

    sleep 1
done
