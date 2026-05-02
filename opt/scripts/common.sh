#!/usr/bin/env bash
# Shared helpers sourced by other scripts in /opt/scripts/.
# Not meant to be executed directly.

# cprintf "<style words>" <printf-fmt> [args...]
#   style is space-separated keywords. accepted:
#     colors:    black red green yellow blue magenta cyan white
#                pink purple orange
#     modifiers: bold dim italic underline blink reverse strikethrough
#     anything else passes through as a raw ANSI code (e.g. "38;5;196")
cprintf() {
    local style=$1
    shift
    local codes=() word
    for word in $style; do
        case "$word" in
            black)         codes+=(30) ;;
            red)           codes+=(31) ;;
            green)         codes+=(32) ;;
            yellow)        codes+=(33) ;;
            blue)          codes+=(34) ;;
            magenta)       codes+=(35) ;;
            cyan)          codes+=(36) ;;
            white)         codes+=(37) ;;
            pink)          codes+=("38;5;213") ;;
            purple)        codes+=("38;5;129") ;;
            orange)        codes+=("38;5;208") ;;
            bold)          codes+=(1) ;;
            dim|faint)     codes+=(2) ;;
            italic)        codes+=(3) ;;
            underline)     codes+=(4) ;;
            blink)         codes+=(5) ;;
            reverse)       codes+=(7) ;;
            strikethrough) codes+=(9) ;;
            *)             codes+=("$word") ;;
        esac
    done
    local IFS=';'
    printf '\033[%sm' "${codes[*]}"
    printf "$@"
    printf '\033[0m'
}

# urlprintf <style> <url> [text]
#   Writes an OSC 8 hyperlink wrapping styled text. If [text] is omitted,
#   <url> is used as the visible text. No trailing newline.
urlprintf() {
    local style=$1 url=$2 text=${3:-$2}
    printf '\033]8;;%s\a' "$url"
    cprintf "$style" '%s' "$text"
    printf '\033]8;;\a'
}
