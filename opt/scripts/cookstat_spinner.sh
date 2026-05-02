#!/usr/bin/env bash
# Sidecar for the wheel session — drives the bottom status-left at
# sub-second rate. tmux's status-interval is integer (min 1s) and
# refresh-client -S reuses the cached #() output, so the spinner can't
# animate smoothly via #() substitution. Instead we loop here and write
# status-left directly via `tmux set-option`.
#
# Usage:
#   /opt/scripts/cookstat_spinner.sh <session-name>
#
# Reads /tmp/cookstat.txt's first line. If empty or missing, leaves
# status-left blank. Exits when the target session disappears.

set -u

SESSION="${1:?usage: cookstat_spinner.sh <session-name>}"
COOK_STATUS_FILE=/tmp/cookstat.txt
STRESS_FILE=/tmp/stress.modes
TICK=0.12   # ~8 Hz

FRAMES=(⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏)
n=${#FRAMES[@]}

last=''
i=0
while tmux has-session -t "$SESSION" 2>/dev/null; do
    if [ -s "$COOK_STATUS_FILE" ]; then
        msg=$(head -n 1 "$COOK_STATUS_FILE" 2>/dev/null)
    else
        msg=''
    fi

    # Active stressors (one mode per line) → space-joined badge string.
    if [ -s "$STRESS_FILE" ]; then
        stress_modes=$(tr '\n' ' ' < "$STRESS_FILE" | sed -e 's/^ *//' -e 's/ *$//')
    else
        stress_modes=''
    fi

    if [ -n "$stress_modes" ]; then
        stress_part=" #[bg=colour196,fg=colour231,bold] STRESS #[bg=colour16,fg=colour208,nobold]  ${stress_modes} "
    else
        stress_part=''
    fi

    if [ -n "$msg" ]; then
        frame=${FRAMES[$(( i % n ))]}
        out=" #[fg=colour201,bold]${frame} #[fg=colour231]${msg} ${stress_part}"
    elif [ -n "$stress_part" ]; then
        out="${stress_part}"
    else
        out=''
    fi

    # Skip the set when going from empty → empty (no need to fork tmux
    # if there's nothing to show). Otherwise always set, since the
    # spinner frame changes every tick.
    if [ -n "$out" ] || [ -n "$last" ]; then
        tmux set-option -t "$SESSION" status-left "$out" 2>/dev/null
        last=$out
    fi

    i=$(( i + 1 ))
    sleep "$TICK"
done
