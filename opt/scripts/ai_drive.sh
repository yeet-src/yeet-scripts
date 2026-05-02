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

# Flavor picker — sets the angle for the wall. Each choice maps to a
# brief in /opt/prompts/flavors/ that gets injected into DRIVE.md at
# the __FLAVOR_BRIEF__ placeholder.
flavor=$(gum choose \
    --header "what's the angle" \
    --header.foreground 165 \
    --header.bold \
    --header.border rounded \
    --header.border-foreground 165 \
    --header.padding "0 2" \
    --cursor.foreground 213 \
    --selected.foreground 213 \
    "useful stuff first" \
    "i ALSO like to live dangerously" \
    "random" \
    "paint my /dev/tty like one of your french girls" \
    "take me to another hausdorff dimension" \
    "detective mode" \
    "1970s mission control" \
    "ready to have a seizure?" \
    "take me back")
flavor_exit=$?

# Ctrl+C or "take me back" → bounce to the vibe-check menu.
if [ "$flavor_exit" -eq 130 ] || [ "$flavor" = "take me back" ]; then
    exec /opt/scripts/entry.sh
fi

case "$flavor" in
    "useful stuff first")                       flavor_file=/opt/prompts/flavors/observability.md ;;
    "i ALSO like to live dangerously")          flavor_file=/opt/prompts/flavors/chaos.md ;;
    "random")                                   flavor_file=/opt/prompts/flavors/surprise.md ;;
    "paint my /dev/tty like one of your french girls")   flavor_file=/opt/prompts/flavors/aesthetic.md ;;
    "take me to another hausdorff dimension")   flavor_file=/opt/prompts/flavors/hausdorff.md ;;
    "detective mode")                           flavor_file=/opt/prompts/flavors/forensic.md ;;
    "1970s mission control")                    flavor_file=/opt/prompts/flavors/retro.md ;;
    "ready to have a seizure?")                 flavor_file=/opt/prompts/flavors/epilepsy.md ;;
    *)                                          flavor_file=/opt/prompts/flavors/observability.md ;;
esac

# sed `r` reads to end of script-line for its filename argument; combining
# it with other commands via `-e` confuses GNU sed's parser, so feed the
# whole script via stdin where `r ${flavor_file}` lives on its own line.
prompt_text=$(printf '%s\n' \
    "s|__HOSTNAME__|$THIS_HOST|g" \
    "s|__SESSION__|$SESSION|g" \
    "s|__USR1_PID__|$USR1_PID|g" \
    "/__FLAVOR_BRIEF__/{" \
    "r ${flavor_file}" \
    "d" \
    "}" \
    | sed -f - /opt/prompts/DRIVE.md)

printf '%s\n' "$prompt_text" | bat -l md --style=plain --paging=never

# Copy prompt to host clipboard via OSC 52 escape sequence. Modern terminals
# (iTerm2, Alacritty, WezTerm, Kitty, foot, Windows Terminal) intercept this
# and write to the system clipboard. Older terminals ignore the sequence
# silently — the prompt is still on screen for manual copy.
printf '\033]52;c;%s\a' "$(printf '%s' "$prompt_text" | base64 -w 0)"

echo
gum style --foreground 165 --italic "prompt sent to your clipboard — paste into claude code on your host (or copy from above if it didn't land)."
echo

rm -f /tmp/yeet-go
gum confirm "ready to hand over the wheel?"
gum_exit=$?

if [ -f /tmp/yeet-go ]; then
    # Claude auto-confirmed via SIGUSR1 → sidecar sentinel.
    rm -f /tmp/yeet-go
elif [ "$gum_exit" -ne 0 ]; then
    exec /opt/scripts/entry.sh
fi

echo
gum style --foreground 165 --bold "buckle up."
echo
sleep 0.3

tmux kill-session -t "$SESSION" 2>/dev/null || true

# Source the wheel config BEFORE creating the session, in one tmux
# invocation so the server doesn't exit between calls. Otherwise
# new-session runs first and locks in tmux's built-in defaults for
# session-scoped options (status-interval, status-left, status-style,
# etc.); set -g afterwards doesn't reliably propagate to that session,
# so the bottom status bar ends up showing stale defaults instead of the
# cookstat spinner.
tmux source-file /opt/scripts/wheel_tmux.conf \; \
     new-session -d -s "$SESSION" -c "$HOME" /opt/scripts/wait_for_driver.sh

# Sidecar that writes status-left at sub-second rate. tmux's
# status-interval is integer-only, so #() can't drive a smooth spinner;
# this loop calls `tmux set-option` directly. Killed via EXIT trap.
/opt/scripts/cookstat_spinner.sh "$SESSION" >/dev/null 2>&1 &
SPINNER_PID=$!

# Stress sidecar — watches /tmp/stress.modes and runs/kills synthetic
# workloads (cpu/mem/net/disk/procs) the user toggles via F5's check
# menu. Killed via EXIT trap; its own trap handles its child workloads.
/opt/scripts/stress_runner.sh >/dev/null 2>&1 &
STRESS_PID=$!

tmux rename-window -t "$SESSION":0 'demos'

# Window 1: spy window. Claude runs visible commands here (validations,
# inspections, cat-of-draft-files) so the user can watch its work.
# Press F2 to switch over (F1 to switch back to demos).
tmux new-window -t "$SESSION":1 -n 'spy' -c "$HOME"
tmux select-window -t "$SESSION":0

tmux attach-session -t "$SESSION"

exec /opt/scripts/entry.sh
