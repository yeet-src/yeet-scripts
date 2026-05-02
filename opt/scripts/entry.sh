#!/usr/bin/env bash

/opt/supervisor/spawn.sh

splash() {
    clear
    fastfetch
    source /opt/scripts/welcome.sh
}

# Re-render the splash whenever the terminal is resized.
trap 'splash' WINCH

splash

echo
choice=$(gum choose \
    --header "vibe check" \
    --header.foreground 46 \
    --header.bold \
    --header.border rounded \
    --header.border-foreground 46 \
    --header.padding "0 2" \
    --cursor.foreground 213 \
    --selected.foreground 213 \
    "bangers only." \
    "let claude cook." \
    "boring stuff first, cool shit after." \
    "fuck around and find out." \
    "i'm out.")
choose_exit=$?
echo

# Ctrl+C on the vibe-check menu → exit the container. gum exits 130 on
# SIGINT; without this, the empty $choice would fall through to the *)
# fallback below and drop the user into zsh instead of leaving.
if [ "$choose_exit" -eq 130 ]; then
    exit 0
fi

# Done with the splash phase; let zsh handle its own resizes from here.
trap - WINCH

case "$choice" in
    "bangers only.")
        gum style --foreground 213 --italic "hopefully these are less cooked than your attention span."
        echo
        exec /opt/scripts/banger/pick.sh
        ;;
    "boring stuff first, cool shit after.")
        gum style --foreground 51 --italic "story time, then the fun stuff."
        echo
        gum style --foreground 226 --bold "Tour coming soon."
        echo
        exec /bin/zsh
        ;;
    "fuck around and find out.")
        gum style --foreground 196 --bold "may god have mercy on your prompt."
        echo
        sleep 0.4
        exec /bin/zsh
        ;;
    "let claude cook.")
        gum style --foreground 165 --italic "acceptance is the first step."
        echo
        sleep 0.4
        exec /opt/scripts/ai_drive.sh
        ;;
    "i'm out.")
        gum style --foreground 245 --italic "see ya."
        exit 0
        ;;
    *)
        exec /bin/zsh
        ;;
esac
