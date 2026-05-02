#!/usr/bin/env bash
# Watch a yeet script path. When the file exists, run it. When it doesn't,
# show a centered placeholder. Loops forever until the pane closes.
#
# Usage:
#   /opt/scripts/pane_watcher.sh /home/you/demos/pane0.js
#
# Designed to be the long-running command in a Bloomberg-grid pane: AI
# tests scripts off-screen via direct `docker exec` calls, then publishes
# the verified version to this watcher's path. The next iteration picks
# it up. No error flood, no pane-state management.

set -u

SCRIPT="${1:?usage: pane_watcher.sh <script-path>}"

source /opt/scripts/common.sh

# Hide the cursor for this pane's lifetime — it flickers as yeet scripts
# call tty.move/tty.write. Restored on exit so the pane closes cleanly.
tput civis 2>/dev/null
trap 'tput cnorm 2>/dev/null' EXIT

draw_placeholder() {
    local rows cols msg pad_x pad_y i
    rows=$(tput lines 2>/dev/null || echo 24)
    cols=$(tput cols 2>/dev/null || echo 80)
    msg='preparing...'
    pad_x=$(( (cols - ${#msg}) / 2 ))
    pad_y=$(( rows / 2 ))
    (( pad_x < 0 )) && pad_x=0
    (( pad_y < 0 )) && pad_y=0

    clear
    for (( i = 0; i < pad_y; i++ )); do echo; done
    printf '%*s' "$pad_x" ''
    cprintf 'italic yellow' '%s' "$msg"
    printf '\n'
}

while true; do
    if [ -f "$SCRIPT" ]; then
        yeet run "$SCRIPT" 2>&1
    else
        draw_placeholder
    fi
    sleep 0.5
done
