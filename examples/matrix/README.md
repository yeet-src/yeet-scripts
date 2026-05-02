# matrix

The classic. **Green code rain falling forever.**

Every column is a "drop": a bright leading glyph trailing into shades of
green that fade out at the back. Drops respawn at random intervals, run
at random speeds, and pick characters from the original Matrix katakana
plus a sprinkle of ASCII punctuation.

## why it's a banger

Because *of course* the rain made it in. Every terminal demo reel from
1999 to now has had this. It's the visual equivalent of a screensaver
saying "this machine is alive, and very sure of itself."

## inside

- ~50 ms tick rate (override with `--interval N`)
- Heads draw at color 231 (bright white) for the leading glyph
- Trails ramp through 46 → 40 → 22 → 235
- We never `clear` between frames — only the cell that just left the
  trail is overwritten with a space, so the rain is buttery smooth

## controls

- **Esc**          back to the picker
- **←/→**          prev / next banger
- **Space**        toggle this readme
- **Ctrl+C**       interrupt the script
