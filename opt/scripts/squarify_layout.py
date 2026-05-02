#!/usr/bin/env python3
"""Squarified-treemap layout for the active tmux window.

Bound to F4 in the wheel session. The viewer wants to recompute the
demo wall into rectangles that are as close to square as possible
(easier to read at a glance) while preserving each pane's relative
importance (so a feature spectrogram stays bigger than a tiny uptime
widget).

Algorithm: Bruls, Huijsen, van Wijk (2000) — squarified treemap.
At each step:
  1. Pick the shorter side of the remaining rectangle (call it `short`).
  2. Greedily extend the current "strip" with sorted-descending weights
     while the worst aspect ratio in the strip doesn't increase.
  3. Lay the strip along `short`; recurse on the remaining rectangle
     with the remaining weights.

The output is a binary-split tree (strip vs rest at every level, plus
each strip is itself a sequence of siblings). That maps cleanly onto
tmux's layout-string format: `{...}` for siblings laid out
horizontally, `[...]` for siblings laid out vertically.

Weighting: each pane's CURRENT area (`width * height`) is its weight.
This means F4 doesn't flatten an intentional "big + small" layout into
an equal grid — it just makes every rectangle squarer while keeping
the proportions Claude built. Pass `--equal` for equal weights (clean
grid).

Fallback: if anything fails (rounding, tmux rejects the layout
string, etc.), fall back to tmux's built-in `tiled` so F4 always does
*something* visible.
"""

import subprocess
import sys


def tmux(*args):
    return subprocess.run(['tmux'] + list(args), capture_output=True, text=True)


def tmux_get(*args):
    r = tmux(*args)
    if r.returncode != 0:
        die(f"tmux {' '.join(args)} failed: {r.stderr.strip()}")
    return r.stdout


def die(msg):
    # tmux's run-shell surfaces stderr as a popup. Keep it short.
    print(msg, file=sys.stderr)
    sys.exit(1)


# ── squarify core ────────────────────────────────────────────────────

def worst_aspect(values, side):
    """Worst aspect ratio for items packed into a strip with given short side."""
    s = sum(values)
    if s <= 0 or side <= 0:
        return float('inf')
    mx, mn = max(values), min(values)
    a = side * side * mx / (s * s)
    b = (s * s) / (side * side * mn)
    return max(a, b)


def layout_recursive(items, x, y, w, h):
    """Build the layout tree for sorted-desc `items` in rectangle (x,y,w,h)."""
    if len(items) == 1:
        return ('leaf', items[0][0], x, y, w, h)

    short = min(w, h)
    strip, rest = [], list(items)

    while rest:
        cur = [v for _, v in strip]
        cand = cur + [rest[0][1]]
        if not strip or worst_aspect(cand, short) <= worst_aspect(cur, short):
            strip.append(rest.pop(0))
        else:
            break

    if not rest:
        # All remaining items fit in this strip; lay out along the longer axis.
        return arrangement(strip, x, y, w, h, horizontal=(w >= h))

    strip_sum = sum(v for _, v in strip)
    total = strip_sum + sum(v for _, v in rest)

    if w <= h:
        # Strip on top: container is a vertical stack [strip, rest] with one
        # divider row between them.
        avail = h - 1
        strip_h = clamp_thickness(strip_sum, total, avail)
        rest_h = avail - strip_h
        strip_node = arrangement(strip, x, y, w, strip_h, horizontal=True)
        rest_node = layout_recursive(rest, x, y + strip_h + 1, w, rest_h)
        return ('vsplit', x, y, w, h, [strip_node, rest_node])
    else:
        # Strip on left: container is horizontal {strip, rest} with one divider column.
        avail = w - 1
        strip_w = clamp_thickness(strip_sum, total, avail)
        rest_w = avail - strip_w
        strip_node = arrangement(strip, x, y, strip_w, h, horizontal=False)
        rest_node = layout_recursive(rest, x + strip_w + 1, y, rest_w, h)
        return ('hsplit', x, y, w, h, [strip_node, rest_node])


def clamp_thickness(strip_sum, total, avail):
    """Strip thickness in cells, with at least 1 cell each side."""
    raw = round(strip_sum / total * avail)
    return max(1, min(raw, avail - 1))


def arrangement(items, x, y, w, h, horizontal):
    """Lay `items` out as siblings; horizontal=True -> side-by-side, else stacked.

    n items in size W include n-1 cells for dividers, so distribute (W - (n-1))
    cells across the items, proportional to weight. Last item absorbs the
    rounding residue so the children sum exactly to W.
    """
    n = len(items)
    if n == 1:
        return ('leaf', items[0][0], x, y, w, h)

    parent = w if horizontal else h
    avail = parent - (n - 1)
    total = sum(v for _, v in items)
    children, used, cursor = [], 0, (x if horizontal else y)

    for i, (pid, val) in enumerate(items):
        remaining_after = n - i - 1
        if i == n - 1:
            size = avail - used
        else:
            size = max(1, round(val / total * avail))
            size = min(size, avail - used - remaining_after)
        if horizontal:
            children.append(('leaf', pid, cursor, y, size, h))
        else:
            children.append(('leaf', pid, x, cursor, w, size))
        cursor += size + 1   # +1 for the divider following this child
        used += size

    return (('hsplit' if horizontal else 'vsplit'), x, y, w, h, children)


# ── tmux layout-string serialization ─────────────────────────────────

def render(node):
    """Serialize the layout tree to tmux's layout-string body (no checksum)."""
    typ = node[0]
    if typ == 'leaf':
        _, pid, x, y, w, h = node
        return f"{w}x{h},{x},{y},{pid.lstrip('%')}"
    _, x, y, w, h, children = node
    inner = ','.join(render(c) for c in children)
    open_, close_ = ('{', '}') if typ == 'hsplit' else ('[', ']')
    return f"{w}x{h},{x},{y}{open_}{inner}{close_}"


def checksum(s):
    """Tmux's layout-string checksum (4-hex-digit, rotate-and-add over bytes)."""
    csum = 0
    for c in s:
        csum = ((csum >> 1) | ((csum & 1) << 15)) & 0xFFFF
        csum = (csum + ord(c)) & 0xFFFF
    return f"{csum:04x}"


# ── main ─────────────────────────────────────────────────────────────

def main():
    equal = '--equal' in sys.argv

    # Unzoom first; select-layout is a no-op against a zoomed window.
    if tmux_get('display-message', '-p', '#{window_zoomed_flag}').strip() == '1':
        tmux('resize-pane', '-Z')

    win_w, win_h = map(int, tmux_get('display-message', '-p', '#{window_width} #{window_height}').split())

    panes = []
    for line in tmux_get('list-panes', '-F', '#{pane_id} #{pane_width} #{pane_height}').splitlines():
        parts = line.split()
        if len(parts) == 3:
            panes.append((parts[0], int(parts[1]), int(parts[2])))

    if len(panes) < 2:
        return  # nothing to recompute

    if equal:
        items = [(pid, 1) for pid, _, _ in panes]
    else:
        items = [(pid, max(1, w * h)) for pid, w, h in panes]
    items.sort(key=lambda p: -p[1])

    tree = layout_recursive(items, 0, 0, win_w, win_h)
    body = render(tree)
    layout = f"{checksum(body)},{body}"

    r = tmux('select-layout', layout)
    if r.returncode != 0:
        # Don't leave the user with whatever broken state we set; fall back.
        tmux('select-layout', 'tiled')
        die(f"squarify rejected by tmux ({r.stderr.strip()}); fell back to tiled")


if __name__ == '__main__':
    main()
