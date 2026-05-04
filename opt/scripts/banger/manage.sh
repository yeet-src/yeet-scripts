#!/usr/bin/env bash
# Banger management TUI. Operates on the source-tree paths.
#
#   opt/bangers/   — numbered symlinks (the order)
#   examples/      — banger source directories
#
# Run via `make banger`.

set -u

# repo root: this script lives at <repo>/opt/scripts/banger/manage.sh
REPO=$(cd "$(dirname "$0")/../../.." && pwd)
BANGERS=$REPO/opt/bangers
EXAMPLES=$REPO/examples

list_slugs() {
    (cd "$BANGERS" 2>/dev/null && ls -1 | grep -E '^[0-9]+-' | sort)
}

list_names() {
    list_slugs | sed 's|^[0-9]*-||'
}

# Renumber all symlinks 001, 002, ... preserving current sort order.
renumber_all() {
    local tmp; tmp=$(mktemp -d)
    local i=1
    while IFS= read -r slug; do
        [ -z "$slug" ] && continue
        local name=${slug#*-}
        local target; target=$(readlink "$BANGERS/$slug")
        rm "$BANGERS/$slug"
        ln -s "$target" "$tmp/$(printf '%03d-%s' "$i" "$name")"
        i=$((i + 1))
    done < <(list_slugs)
    if compgen -G "$tmp/*" >/dev/null; then
        mv "$tmp"/* "$BANGERS/"
    fi
    rmdir "$tmp"
}

action_list() {
    clear
    gum style --foreground 46 --bold "current bangers"
    echo
    local i=1
    while IFS= read -r slug; do
        printf "  %2d. %s\n" "$i" "${slug#*-}"
        i=$((i + 1))
    done < <(list_slugs)
    echo
    gum input --placeholder "(enter to continue)" >/dev/null || true
}

action_add() {
    local name
    name=$(gum input --placeholder "new banger name (lowercase, no spaces)")
    [ -z "$name" ] && return
    name=${name// /-}

    if [ -e "$EXAMPLES/$name" ]; then
        gum style --foreground 196 "examples/$name already exists"
        sleep 1
        return
    fi

    mkdir -p "$EXAMPLES/$name"

    cat > "$EXAMPLES/$name/index.js" <<EOF
#!/usr/bin/env -S yeet run
//
// $name — describe what this does.
//

const { interval = 100 } = yeet.args;

let { rows, cols } = tty.size();

tty.alt();
tty.hideCursor();
tty.title("$name");
tty.clear();

setInterval(() => {
    const sz = tty.size();
    if (sz.rows !== rows || sz.cols !== cols) {
        rows = sz.rows; cols = sz.cols;
        tty.clear();
    }
    tty.move(Math.floor(rows / 2), Math.floor(cols / 2) - 4);
    tty.write("$name");
}, interval);
EOF

    cat > "$EXAMPLES/$name/Makefile" <<'EOF'
.PHONY: run info

run:
	yeet run ./index.js

info:
	@head -10 ./index.js | sed -n 's|^// \?||p'
EOF

    cat > "$EXAMPLES/$name/README.md" <<EOF
# $name

describe the banger.

## why it's a banger

tell us.

## controls

- **Esc**          back to the picker
- **←/→**          prev / next banger
- **Space**        toggle this readme
- **Ctrl+C**       interrupt the script
EOF

    # next available index, then renumber to keep things tight
    local count; count=$(list_slugs | wc -l | tr -d ' ')
    local nextn; nextn=$(printf '%03d' $((count + 1)))
    ln -sf "/home/you/examples/$name" "$BANGERS/$nextn-$name"
    renumber_all

    gum style --foreground 46 "added $name (now at position $((count + 1)))"
    sleep 1
}

action_remove() {
    local slug
    slug=$(list_slugs | gum choose \
        --header "remove which?" \
        --header.foreground 196 --header.bold) || return
    [ -z "$slug" ] && return

    local name=${slug#*-}
    if gum confirm "also delete examples/$name?"; then
        rm -rf "$EXAMPLES/$name"
    fi
    rm -f "$BANGERS/$slug"
    renumber_all

    gum style --foreground 46 "removed $name"
    sleep 1
}

action_reorder() {
    local slug
    slug=$(list_slugs | gum choose \
        --header "move which?" \
        --header.foreground 213 --header.bold) || return
    [ -z "$slug" ] && return

    local count; count=$(list_slugs | wc -l | tr -d ' ')
    local positions=()
    for i in $(seq 1 "$count"); do positions+=("$i"); done

    local newpos
    newpos=$(printf '%s\n' "${positions[@]}" | gum choose \
        --header "to position (1-$count)") || return
    [ -z "$newpos" ] && return

    # collect ordering (skip the moved one, then insert at newpos)
    local rest=()
    while IFS= read -r s; do
        [ "$s" = "$slug" ] && continue
        rest+=("$s")
    done < <(list_slugs)

    local final=()
    for ((i = 0; i < count; i++)); do
        if [ $((i + 1)) -eq "$newpos" ]; then
            final+=("$slug")
            final+=("${rest[$i]:-}")
        else
            final+=("${rest[$i]:-}")
        fi
    done
    # if newpos > count, append
    if [ "$newpos" -gt "${#final[@]}" ]; then
        final+=("$slug")
    fi
    # drop empties from out-of-bounds
    local cleaned=()
    for s in "${final[@]}"; do
        [ -n "$s" ] && cleaned+=("$s")
    done

    # rewrite symlinks in the new order
    local tmp; tmp=$(mktemp -d)
    local i=1
    for s in "${cleaned[@]}"; do
        local name=${s#*-}
        local target; target=$(readlink "$BANGERS/$s")
        rm "$BANGERS/$s"
        ln -s "$target" "$tmp/$(printf '%03d-%s' "$i" "$name")"
        i=$((i + 1))
    done
    mv "$tmp"/* "$BANGERS/"
    rmdir "$tmp"

    gum style --foreground 46 "moved ${slug#*-} → position $newpos"
    sleep 1
}

while true; do
    clear
    gum style --foreground 46 --bold --border rounded --padding "0 2" \
        "banger management"
    echo

    action=$(gum choose \
        --header "what?" \
        --header.foreground 46 --header.bold \
        --cursor.foreground 213 \
        --selected.foreground 213 \
        "list" "add" "reorder" "remove" "exit") || break

    case "$action" in
        list)    action_list ;;
        add)     action_add ;;
        reorder) action_reorder ;;
        remove)  action_remove ;;
        exit|"") break ;;
    esac
done
