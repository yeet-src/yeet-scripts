#!/usr/bin/env bash
# Pin the readme pane back to its fixed width whenever the terminal resizes.
# Triggered by tmux hooks. Always exits 0 — failures here must not bubble
# up to tmux or break the user's flow when the readme is being closed.

WIDTH=${README_WIDTH:-72}

pane=$(tmux show-option -gqv @readme-pane 2>/dev/null) || exit 0
[ -n "$pane" ] || exit 0

# is the pane still alive?
if tmux list-panes -F '#{pane_id}' 2>/dev/null | grep -qx "$pane"; then
    tmux resize-pane -t "$pane" -x "$WIDTH" 2>/dev/null || true
else
    # pane is gone — clear the stale option so future hooks short-circuit
    tmux set-option -gu @readme-pane 2>/dev/null || true
fi

exit 0
