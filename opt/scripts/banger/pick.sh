#!/usr/bin/env bash
# "bangers only." — pick a banger, run it via its Makefile.
#
# Convention:
#   /opt/bangers/NNN-name          → symlink to a banger directory
#   <banger-dir>/Makefile          → must define a `run` target
#   <banger-dir>/README.md         → shown in fzf preview pane and on Space (frogmouth)
#
# The numeric prefix orders the picker but is stripped from display.

set -u
cd ~

BANGERS_DIR=/opt/bangers
TMUX_CONF=/opt/scripts/banger/tmux.conf

mapfile -t SLUGS < <(cd "$BANGERS_DIR" 2>/dev/null && ls -1 | grep -E '^[0-9]+-' | sort)

DISPLAYS=()
for s in "${SLUGS[@]}"; do
    DISPLAYS+=("${s#*-}")     # strip leading "NNN-"
done

if [ ${#SLUGS[@]} -eq 0 ]; then
    gum style --foreground 196 "no bangers in $BANGERS_DIR"
    exec /bin/zsh
fi

run_in_tmux() {
    local idx=$1
    local slug=${SLUGS[$idx]}
    local name=${DISPLAYS[$idx]}
    local dir=$BANGERS_DIR/$slug
    local session=bangers

    tmux kill-session -t "$session" 2>/dev/null || true
    tmux -f "$TMUX_CONF" new-session -d -s "$session" -c "$dir" "make -s -C $dir run"
    local pane
    pane=$(tmux list-panes -t "$session" -F '#{pane_id}' | head -1)
    tmux set-option -t "$session" -g @banger-idx  "$idx"
    tmux set-option -t "$session" -g @banger-slug "$slug"
    tmux set-option -t "$session" -g @banger-name "$name"
    tmux set-option -t "$session" -g @banger-pane "$pane"
    tmux attach-session -t "$session"
}

# Numbered menu: " 01  matrix" / " ··  exit". The trailing token is the name.
build_menu() {
    printf ' ·λ  Build with AI\n'
    local i=1
    for name in "${DISPLAYS[@]}"; do
        printf ' %02d  %s\n' "$i" "$name"
        i=$((i + 1))
    done
    printf ' ··  exit\n'
}

# Preview command — fzf substitutes {} with the highlighted line, single-quoted.
preview_cmd='
name=$(printf "%s" {} | awk "{print \$NF}")
if [ "$name" = "exit" ]; then
    printf "\n  \033[2m← back to the shell\033[0m\n"
elif [ "$name" = "AI" ]; then
    printf "\n"
    gum style \
        --border rounded \
        --border-foreground 165 \
        --align center \
        --padding "0 3" \
        --margin "0 2" \
        "Build with AI"
    printf "\n  Use Claude Code to build a custom live\n  terminal visualization — you describe it,\n  the agent writes and runs it.\n"
else
    md=$(ls -1 '"$BANGERS_DIR"'/*-"$name"/README.md 2>/dev/null | head -1)
    if [ -n "$md" ]; then
        /opt/scripts/banger/render_readme.py "$md"
    else
        printf "\n  \033[2m(no readme)\033[0m\n"
    fi
fi
'

while true; do
    clear

    choice=$(build_menu | fzf \
        --ansi --no-multi --no-sort --reverse --cycle \
        --height=100% \
        --margin=1,2 \
        --padding=0,1 \
        --border=rounded \
        --border-label=' Explore Demos ' \
        --border-label-pos=3 \
        --prompt=' ❯ ' \
        --pointer='▌' \
        --marker=' ' \
        --info=hidden \
        --header='enter ▸ play   esc ▸ bail   ↑↓ ▸ browse' \
        --bind='ctrl-u:preview-half-page-up,ctrl-d:preview-half-page-down' \
        --bind='shift-up:preview-up,shift-down:preview-down' \
        --bind='pgup:preview-page-up,pgdn:preview-page-down' \
        --bind='resize:refresh-preview' \
        --preview="$preview_cmd" \
        --preview-window='right,60%,wrap,border-rounded' \
        --preview-label=' ctrl-u/d ▸ scroll ' \
        --preview-label-pos=-3 \
        --color='border:46,label:46:bold,header:240:italic,prompt:213:bold,pointer:213,fg+:213:bold,hl:46,hl+:46:bold,gutter:-1,preview-border:226,preview-label:226:bold') || break

    name=$(printf '%s' "$choice" | awk '{print $NF}')

    case "$name" in
        exit|"") break ;;
        "AI") exec /opt/scripts/ai_drive.sh ;;
        *)
            for i in "${!DISPLAYS[@]}"; do
                if [ "${DISPLAYS[$i]}" = "$name" ]; then
                    run_in_tmux "$i"
                    break
                fi
            done
            ;;
    esac
done

exec /opt/scripts/entry.sh
