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
# ANSI color shortcuts (global so $() subshells can see them)
_CM='\033[38;5;165m'   # magenta — border / accent
_CG='\033[38;5;46m'    # green — command
_CW='\033[38;5;250m'   # white-ish — body text
_CD='\033[38;5;240m'   # dim gray — notes
_CB='\033[1m'           # bold
_CI='\033[3m'           # italic
_CR='\033[0m'           # reset

# Center styled text (with ANSI) inside a box of inner width $1.
# $2 = styled string, $3 = visible character count (no ANSI).
_ctr() {
    local w="$1" s="$2" vl="$3" lp rp
    lp=$(( (w - vl) / 2 )); [ "$lp" -lt 0 ] && lp=0
    rp=$(( w - vl - lp ));  [ "$rp" -lt 0 ] && rp=0
    printf '%*s%b%*s' "$lp" '' "$s" "$rp" ''
}

_draw_step1() {
    local cols lines iw bw bh pad_y pad_x lpad hbar
    cols=$(tput cols 2>/dev/null || echo 80)
    lines=$(tput lines 2>/dev/null || echo 24)
    iw=54; bh=14; bw=$(( iw + 2 ))
    pad_y=$(( (lines - bh) / 2 )); [ "$pad_y" -lt 0 ] && pad_y=0
    pad_x=$(( (cols  - bw) / 2 )); [ "$pad_x" -lt 0 ] && pad_x=0
    lpad=$(printf '%*s' "$pad_x" '')
    hbar=$(printf '%*s' "$iw"   '' | tr ' ' '─')

    _brow()  { printf '%s%b│%b%s%b│%b\n' "$lpad" "$_CM" "$_CR" "$1" "$_CM" "$_CR"; }
    _bempty(){ printf '%s%b│%*s│%b\n'    "$lpad" "$_CM" "$iw" '' "$_CR"; }

    clear
    local i; for (( i = 0; i < pad_y; i++ )); do printf '\n'; done
    printf '%s%b╭%s╮%b\n' "$lpad" "$_CM" "$hbar" "$_CR"
    _bempty
    _brow "$(_ctr $iw "${_CB}${_CM}Step 1.  Prepare your coding agent${_CR}" 35)"
    _bempty
    _brow "$(_ctr $iw "${_CW}Launch any coding agent on your host${_CR}" 36)"
    _bempty
    _brow "$(_ctr $iw "${_CG}claude / cursor / windsurf / opencode / codex / pi${_CR}" 50)"
    _bempty
    _brow "$(_ctr $iw "${_CD}The next screen will give you a prompt${_CR}" 38)"
    _brow "$(_ctr $iw "${_CD}to get the agent started${_CR}" 24)"
    _bempty
    _brow "$(_ctr $iw "${_CD}${_CI}Press enter to continue${_CR}" 23)"
    _bempty
    printf '%s%b╰%s╯%b\n' "$lpad" "$_CM" "$hbar" "$_CR"
}

_draw_step2() {
    local cols iw bw pad_x lpad hbar
    cols=$(tput cols 2>/dev/null || echo 80)
    iw=54; bw=$(( iw + 2 ))
    pad_x=$(( (cols - bw) / 2 )); [ "$pad_x" -lt 0 ] && pad_x=0
    lpad=$(printf '%*s' "$pad_x" '')
    hbar=$(printf '%*s' "$iw"   '' | tr ' ' '─')

    _brow2()  { printf '%s%b│%b%s%b│%b\n' "$lpad" "$_CM" "$_CR" "$1" "$_CM" "$_CR"; }
    _bempty2(){ printf '%s%b│%*s│%b\n'    "$lpad" "$_CM" "$iw" '' "$_CR"; }

    clear
    printf '%s%b╭%s╮%b\n' "$lpad" "$_CM" "$hbar" "$_CR"
    _bempty2
    _brow2 "$(_ctr $iw "${_CB}${_CM}step 2 / 2${_CR}" 10)"
    _bempty2
    _brow2 "$(_ctr $iw "${_CW}paste this prompt into your coding agent${_CR}" 40)"
    _bempty2
    printf '%s%b╰%s╯%b\n' "$lpad" "$_CM" "$hbar" "$_CR"
    echo

    printf '%s\n' "$prompt_text" | bat -l md --style=plain --paging=never
    printf '\033]52;c;%s\a' "$(printf '%s' "$prompt_text" | base64 -w 0)"

    echo
    printf '%b\n' "${_CM}${_CI}prompt copied to clipboard — paste into your agent on the host (or copy from above if it didn't land).${_CR}"
    echo
}

# ── Step 1 ──────────────────────────────────────────────────────────────────
_redraw=1
trap '_redraw=1' WINCH
while true; do
    (( _redraw )) && { _draw_step1; _redraw=0; }
    read -rs -t 0.1 < /dev/tty && break
done
trap - WINCH

# ── Step 2 — show prompt, spin until agent connects ──────────────────────────
_SPIN_FRAMES=(⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏)
_spin_i=0
_redraw=1
trap '_redraw=1' WINCH
while true; do
    if (( _redraw )); then
        _draw_step2
        _redraw=0
    fi
    [ -f /tmp/yeet-go ] && break
    printf '\r%b%s%b  waiting for agent to connect...\033[K' \
        "$_CM" "${_SPIN_FRAMES[$(( _spin_i % 10 ))]}" "$_CR"
    _spin_i=$(( _spin_i + 1 ))
    sleep 0.1
done
trap - WINCH
printf '\r\033[K'
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
