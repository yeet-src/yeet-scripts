#!/usr/bin/env bash
# "let claude cook." — render a copy-pasteable driver prompt, then drop the
# user into a tmux session that an external claude code instance can target
# via `docker exec ... tmux send-keys`.

set -u
cd ~

THIS_HOST=$(hostname)
SESSION=wheel

clear

# Clean any stale state from a previous session before claude has a
# chance to write to /tmp. (Claude is instructed to touch /tmp/yeet-cooking
# and write /tmp/cookstat.txt as soon as it's received the prompt — those
# writes happen during the gum confirm window, so we must NOT rm those
# files later.)
rm -f /tmp/yeet-cooking /tmp/cookstat.txt /tmp/yeet-go /tmp/stress.modes

# Sidecar process whose sole job is to handle SIGUSR1. Claude can
# auto-confirm the gum prompt by sending USR1 to this PID — its trap
# touches a sentinel and kills gum. We use a sidecar because SIGUSR1
# to ai_drive.sh itself wouldn't interrupt the foreground gum confirm
# (bash queues traps until the foreground command returns).
( trap 'touch /tmp/yeet-go; pkill -TERM -f "gum confirm" 2>/dev/null; exit 0' USR1
  while true; do sleep 3600 & wait $!; done ) &
USR1_PID=$!
SPINNER_PID=
STRESS_PID=
cleanup_pids() {
    [ -n "$USR1_PID" ] && kill "$USR1_PID" 2>/dev/null
    [ -n "$SPINNER_PID" ] && kill "$SPINNER_PID" 2>/dev/null
    [ -n "$STRESS_PID" ] && kill -TERM "$STRESS_PID" 2>/dev/null
    true
}
trap cleanup_pids EXIT

prompt_text=$(sed \
    -e "s|__HOSTNAME__|$THIS_HOST|g" \
    -e "s|__SESSION__|$SESSION|g" \
    -e "s|__USR1_PID__|$USR1_PID|g" \
    -e "/__FLAVOR_BRIEF__/r /opt/prompts/flavors/observability.md" \
    -e "/__FLAVOR_BRIEF__/d" \
    /opt/prompts/DRIVE.md)

# Center a card on the terminal. Args: top_margin content_width padding_h [lines...]
_card() {
    local mv=$1 cw=$2 ph=$3
    shift 3
    local mh
    mh=$(( ( $(tput cols 2>/dev/null || echo 80) - cw - ph*2 - 2 ) / 2 ))
    [ "$mh" -lt 0 ] && mh=0
    gum style \
        --border rounded \
        --border-foreground 165 \
        --padding "1 $ph" \
        --margin "$mv $mh" \
        --width "$cw" \
        --align center \
        "$@"
}

_cols=$(tput cols 2>/dev/null || echo 80)
_lines=$(tput lines 2>/dev/null || echo 24)
_cw=46   # content width inside the card
_ph=5    # horizontal padding inside the card

# ── Step 1 ──────────────────────────────────────────────────────────────────
clear
_mv=$(( (_lines - 16) / 2 ))
[ "$_mv" -lt 0 ] && _mv=0

_card "$_mv" "$_cw" "$_ph" \
    "$(gum style --foreground 165 --bold 'Step 1.  Prepare your coding agent')" \
    "" \
    "$(gum style --foreground 250 'Launch Claude Code on your host')" \
    "" \
    "$(gum style --foreground 46 --align left 'claude')" \
    "" \
    "$(gum style --foreground 240 'The next screen will give you a prompt to get the agent started')" \
    "" \
    "$(gum style --foreground 240 --italic 'Press enter to continue')"

read -rs < /dev/tty

# ── Step 2 ──────────────────────────────────────────────────────────────────
clear
_card 2 "$_cw" "$_ph" \
    "$(gum style --foreground 165 --bold 'step 2 / 2')" \
    "" \
    "$(gum style --foreground 250 'paste this prompt into claude code')"
echo

printf '%s\n' "$prompt_text" | bat -l md --style=plain --paging=never

# Copy prompt to host clipboard via OSC 52 escape sequence. Modern terminals
# (iTerm2, Alacritty, WezTerm, Kitty, foot, Windows Terminal) intercept this
# and write to the system clipboard. Older terminals ignore the sequence
# silently — the prompt is still on screen for manual copy.
printf '\033]52;c;%s\a' "$(printf '%s' "$prompt_text" | base64 -w 0)"

echo
gum style --foreground 165 --italic "prompt copied to clipboard — paste into claude code on your host (or copy from above if it didn't land)."
echo
gum style --foreground 240 --italic 'Press enter to continue'
read -rs < /dev/tty

# ── Waiting for Claude to connect ────────────────────────────────────────────
clear
_bw=50; _ph=4
_mh=$(( (_cols - _bw - _ph*2 - 2) / 2 )); [ "$_mh" -lt 0 ] && _mh=0
_mv=$(( (_lines - 10) / 2 ));              [ "$_mv" -lt 0 ] && _mv=0

gum style \
    --border rounded --border-foreground 165 \
    --padding "1 $_ph" --margin "$_mv $_mh" \
    --width "$_bw" --align center \
    "$(gum style --foreground 165 --bold 'Waiting for Claude to connect...')" \
    "" \
    "$(gum style --foreground 250 'Paste the prompt into Claude Code.')" \
    "$(gum style --foreground 250 'Claude will connect automatically.')"

rm -f /tmp/yeet-go
while [ ! -f /tmp/yeet-go ]; do sleep 0.1; done
rm -f /tmp/yeet-go

# ── Spin up the wheel session and hand control to Claude ─────────────────────
tmux kill-session -t "$SESSION" 2>/dev/null || true

tmux source-file /opt/scripts/wheel_tmux.conf \; \
     new-session -d -s "$SESSION" -c "$HOME" /opt/scripts/wait_for_driver.sh

/opt/scripts/cookstat_spinner.sh "$SESSION" >/dev/null 2>&1 &
SPINNER_PID=$!

/opt/scripts/stress_runner.sh >/dev/null 2>&1 &
STRESS_PID=$!

tmux rename-window -t "$SESSION":0 'demos'
tmux new-window -t "$SESSION":1 -n 'spy' -c "$HOME"
tmux select-window -t "$SESSION":0

tmux attach-session -t "$SESSION"

exec /opt/scripts/banger/pick.sh
