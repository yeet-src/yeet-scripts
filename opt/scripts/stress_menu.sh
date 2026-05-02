#!/usr/bin/env bash
# Multi-select stress toggle menu — invoked by F5 via tmux display-popup.
#
# Reads currently-active stressors from /tmp/stress.modes, opens a gum
# check-menu pre-selected to those, writes the new selection back. The
# stress_runner sidecar watches /tmp/stress.modes and starts/stops the
# matching workloads so the demos visibly respond.

set -u

STATE=/tmp/stress.modes
MODES=("cpu" "mem" "net" "disk" "procs")

# Read current selection (one mode per line) into a comma-separated
# string for `gum choose --selected=`.
preselect=""
if [ -s "$STATE" ]; then
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        if [ -z "$preselect" ]; then
            preselect="$line"
        else
            preselect="$preselect,$line"
        fi
    done < "$STATE"
fi

selected=$(gum choose --no-limit \
    --header "stressors — space toggles, enter confirms" \
    --header.foreground 196 \
    --header.bold \
    --header.border rounded \
    --header.border-foreground 196 \
    --header.padding "0 2" \
    --cursor.foreground 213 \
    --selected.foreground 213 \
    --selected="$preselect" \
    "${MODES[@]}")

# Cancel (Esc / Ctrl+C) leaves state untouched.
[ "$?" -ne 0 ] && exit 0

# Write new selection — empty selected => empty file => runner stops all.
printf '%s\n' "$selected" > "$STATE"
