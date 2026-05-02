#!/usr/bin/env bash
# tmux-driven navigation for the bangers session.
# Usage: nav.sh {next|prev|readme|quit}

set -u

action=$1
BANGERS_DIR=/opt/bangers

mapfile -t SLUGS < <(cd "$BANGERS_DIR" 2>/dev/null && ls -1 | grep -E '^[0-9]+-' | sort)
n=${#SLUGS[@]}

idx=$(tmux show-option -gqv @banger-idx)
[ -z "$idx" ] && idx=0

# Explicit `make stop` for the current banger before any switch/quit, so
# its activity.sh-spawned workers always die.
stop_current() {
    local cur; cur=$(tmux show-option -gqv @banger-slug)
    [ -z "$cur" ] && return 0
    make -s -C "$BANGERS_DIR/$cur" stop 2>/dev/null || true
}

case "$action" in
    next) idx=$(( (idx + 1) % n )) ;;
    prev) idx=$(( (idx - 1 + n) % n )) ;;
    readme)
        slug=${SLUGS[$idx]}
        md=$BANGERS_DIR/$slug/README.md

        existing=$(tmux show-option -gqv @readme-pane)
        if [ -n "$existing" ] && tmux list-panes -F '#{pane_id}' | grep -qx "$existing"; then
            tmux kill-pane -t "$existing"
            tmux set-option -gu @readme-pane
            exit 0
        fi

        if [ -f "$md" ]; then
            new=$(tmux split-window -h -l 72 -P -F '#{pane_id}' "frogmouth '$md'")
            tmux set-option -g @readme-pane "$new"
        else
            tmux display-message "no readme: $md"
        fi
        exit 0
        ;;
    quit)
        stop_current
        tmux kill-session
        exit 0
        ;;
    *)
        tmux display-message "banger-nav: unknown action $action"
        exit 1
        ;;
esac

# About to switch — kill the outgoing banger's activity.
stop_current

slug=${SLUGS[$idx]}
name=${slug#*-}
dir=$BANGERS_DIR/$slug
banger_pane=$(tmux show-option -gqv @banger-pane)

# close readme on banger switch
readme_pane=$(tmux show-option -gqv @readme-pane)
if [ -n "$readme_pane" ] && tmux list-panes -F '#{pane_id}' | grep -qx "$readme_pane"; then
    tmux kill-pane -t "$readme_pane"
    tmux set-option -gu @readme-pane
fi

tmux set-option -g @banger-idx  "$idx"
tmux set-option -g @banger-slug "$slug"
tmux set-option -g @banger-name "$name"
tmux respawn-pane -k -t "${banger_pane:-}" -c "$dir" "make -s -C $dir run"
