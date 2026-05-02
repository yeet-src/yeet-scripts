#!/usr/bin/env bash
# Status spinner shown in the tmux 'wheel' pane (pane 0). Two states:
#
#   waiting — initial. Spinner says 'any day now...'. User has just opened
#             the demo and pasted the prompt into claude.
#   cooking — claude has taken the wheel. Spinner says 'cooking...'.
#             Pane 0 stays in this state for the rest of the session;
#             claude does all real work via direct docker exec and other
#             panes that it splits.
#
# Transition trigger: claude `touch`es a sentinel file at $COOKING_SENTINEL.
# The main loop polls for it every tick. We use a sentinel rather than a
# signal because tmux send-keys C-c would propagate SIGINT to the pane's
# entire process group, killing ambient activity subshells.
#
# Sources spawn_ambient_activity.sh at startup, so backgrounded processes
# (named workers, network bursts, CPU pulses) become children of THIS
# script. They share its lifecycle: tmux pane close → kernel SIGHUPs the
# process group → ambient activity dies along with this script.
#
# Re-renders on SIGWINCH. Ctrl-C from the user exits cleanly (back to the
# menu via ai_drive.sh's exec entry.sh).
set -u

source /opt/scripts/common.sh
source /opt/scripts/spawn_ambient_activity.sh

# Set the pane title via OSC 2. Tmux's pane-border-format renders
# #{pane_title}, so this shows up at the top of the cooking pane.
# Demo panes claude opens later get their own titles via select-pane -T.
printf '\033]2;self driving mode\007'

LOGO=/opt/logos/logo-block.txt
LOGO_W=30
LOGO_H=15
TICK_SECONDS=0.1
COOKING_SENTINEL=/tmp/yeet-cooking
COOK_STATUS_FILE=/tmp/cookstat.txt

FRAMES=(⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏)

state=waiting

cleanup() {
    tput cnorm 2>/dev/null
    tput sgr0 2>/dev/null
    clear
}
# Note: do NOT rm $COOKING_SENTINEL or $COOK_STATUS_FILE here. The EXIT
# trap fires when pane 0 is respawned with the first demo (respawn-pane
# -k SIGHUPs us), and the status bar reads cookstat.txt from that point
# on — wiping it mid-session leaves the bar blank until claude rewrites.
# ai_drive.sh wipes both files at the start of each wheel session, so
# end-of-session cleanup is already covered.

trap cleanup EXIT
trap 'exit 0' INT
trap 'exit 0' TERM
trap 'redraw=1' WINCH

draw_logo() {
    local cols rows pad_x pad_y url_pad yeet_pad line j logo_h=0
    cols=$(tput cols 2>/dev/null || echo 80)
    rows=$(tput lines 2>/dev/null || echo 24)
    [ -f "$LOGO" ] && logo_h=$LOGO_H

    pad_x=$(( (cols - LOGO_W) / 2 ))
    pad_y=$(( (rows - logo_h - 6) / 2 ))   # -6: gap + yeet + blank + url + gap + spinner
    url_pad=$(( (cols - 31) / 2 ))         # 31 = 'come blame us @ ' (16) + 'https://yeet.cx' (15)
    yeet_pad=$(( (cols - 4) / 2 ))         # 4 = visible width of 'yeet'
    (( pad_x < 0 )) && pad_x=0
    (( pad_y < 0 )) && pad_y=0
    (( url_pad < 0 )) && url_pad=0
    (( yeet_pad < 0 )) && yeet_pad=0

    clear
    for (( j = 0; j < pad_y; j++ )); do echo; done
    if [ -f "$LOGO" ]; then
        while IFS= read -r line; do
            printf '%*s%s\n' "$pad_x" '' "$line"
        done < "$LOGO"
    fi
    echo
    printf '%*s' "$yeet_pad" ''
    cprintf 'bold red' 'yeet'
    printf '\n'
    echo
    printf '%*s' "$url_pad" ''
    cprintf 'italic yellow' 'come blame us '
    cprintf 'bold purple' '@'
    printf ' '
    urlprintf 'bold underline cyan' 'https://yeet.cx?utm_source=demo&utm_medium=cli&utm_content=wait' 'https://yeet.cx'
    printf '\n'
    echo
}

draw_spinner() {
    local msg cols pad frame
    case "$state" in
        cooking)
            # Claude can narrate by writing the current step to
            # /tmp/cookstat.txt; the spinner picks up the first line.
            if [ -s "$COOK_STATUS_FILE" ]; then
                msg=$(head -n 1 "$COOK_STATUS_FILE" 2>/dev/null)
                [ -z "$msg" ] && msg='cooking...'
            else
                msg='cooking...'
            fi
            ;;
        *)
            msg='any day now...'
            ;;
    esac
    frame=${FRAMES[$((i % ${#FRAMES[@]}))]}
    cols=$(tput cols 2>/dev/null || echo 80)
    # Truncate so we never overflow the pane width.
    local max_msg=$(( cols - 6 ))
    (( max_msg > 0 && ${#msg} > max_msg )) && msg="${msg:0:$max_msg}"
    pad=$(( (cols - ${#msg} - 3) / 2 ))   # 3 = glyph (1) + 2 spaces
    (( pad < 0 )) && pad=0
    printf '\r\033[K%*s' "$pad" ''
    cprintf 'magenta' '%s' "$frame"
    printf '  '
    cprintf 'bold 97' '%s' "$msg"
}

tput civis 2>/dev/null
redraw=1
i=0

while true; do
    if [ "$state" = 'waiting' ] && [ -e "$COOKING_SENTINEL" ]; then
        state=cooking
        redraw=1
    fi
    if (( redraw )); then
        draw_logo
        redraw=0
    fi
    draw_spinner
    sleep "$TICK_SECONDS" &
    wait $! 2>/dev/null
    i=$((i + 1))
done
