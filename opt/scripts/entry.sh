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
    --header "Get started" \
    --header.foreground 46 \
    --header.bold \
    --header.border rounded \
    --header.border-foreground 46 \
    --header.padding "0 2" \
    --cursor.foreground 213 \
    --selected.foreground 213 \
    "Explore demos" \
    "Exit")
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
    "Explore demos")
        exec /opt/scripts/banger/pick.sh
        ;;
    "Exit")
        exit 0
        ;;
    *)
        exec /bin/zsh
        ;;
esac
