#!/usr/bin/env bash
# Source this from the tmux 'wheel' pane shell. Spawns light ambient
# activity (network traffic, named workers, CPU pulses) so the yeet
# graph has visible movement to render in any demo claude builds.
#
# Lifecycle: the spawned processes are children of the calling shell.
# When that shell exits — pane closed, session killed, container down —
# zsh's HUP option (and tty close from the kernel) sends SIGHUP and they
# die. DO NOT execute this script (./spawn_ambient_activity.sh); it must
# be sourced so the lifecycle ties to the calling shell rather than a
# transient subshell that vanishes on its own.
#
# Variance: sleep durations and per-tick workload sizes are randomized
# inside fixed bounds so the resulting graph reads as organic noise
# rather than a metronome. Occasional spikes are weighted in (~5%) so
# any sparkline rendering shows visible outliers.

# Suppress "[1] 12345" job-control output for the backgrounded jobs below.
set +m 2>/dev/null

# Network targets — randomly chosen per request. Mix of joke/fact APIs,
# retro-web landmarks, and a weather endpoint. Response sizes vary so
# rx_bytes deltas don't all look identical, and any user spotting these
# in tcpdump or process listings gets a small grin.
TARGETS=(
    "https://icanhazdadjoke.com/"
    "https://api.chucknorris.io/jokes/random"
    "https://yesno.wtf/api"
    "https://catfact.ninja/fact"
    "https://uselessfacts.jsph.pl/random.json?language=en"
    "https://api.adviceslip.com/advice"
    "https://zenquotes.io/api/random"
    "https://wttr.in/?format=3"
    "https://www.spacejam.com/1996/"
    "https://www.berkshirehathaway.com/"
)

# Stable named workers — anchor points for any process-tree render.
(exec -a yeet-worker-stable-1 sleep 86400) &
(exec -a yeet-worker-stable-2 sleep 86400) &
(exec -a yeet-worker-stable-3 sleep 86400) &

# Ephemeral worker — lives 30–90s, respawns. Process count fluctuates.
(while true; do
    (exec -a yeet-worker-ephemeral sleep $((RANDOM % 60 + 30))) &
    wait
done) &

# Network: bursts of 1–3 concurrent requests, occasional spike of 5–12.
# 1–5s rest between bursts. rx/tx bytes climb in irregular bumps.
(while true; do
    if (( RANDOM % 20 == 0 )); then
        burst=$((RANDOM % 8 + 5))    # spike
    else
        burst=$((RANDOM % 3 + 1))    # normal
    fi
    for (( i = 0; i < burst; i++ )); do
        target="${TARGETS[$((RANDOM % ${#TARGETS[@]}))]}"
        curl -s "$target" >/dev/null 2>&1 &
    done
    wait
    sleep $((RANDOM % 5 + 1))
done) &

# CPU: parallel hash workers, occasional spikes. Multiple cores get used,
# load average and CPU% wander noticeably. Each worker hashes every file
# in /usr/bin (substantial work — many small files = lots of syscalls +
# hashing). Spike fans out across all available cores.
(while true; do
    if (( RANDOM % 12 == 0 )); then
        # spike: fan out across all cores, sustained burst
        workers=$(nproc 2>/dev/null || echo 4)
        passes=12
    else
        # normal: 1–3 parallel workers, moderate rounds
        workers=$((RANDOM % 3 + 1))
        passes=$((RANDOM % 6 + 2))
    fi
    for (( w = 0; w < workers; w++ )); do
        (
            for (( p = 0; p < passes; p++ )); do
                sha256sum /usr/bin/* >/dev/null 2>&1
            done
        ) &
    done
    wait
    sleep $((RANDOM % 3 + 1))
done) &
