# life

**Conway's Game of Life**, rendered into braille pixels for 8× density.

## the rules (1970)

For every cell, count its 8 neighbors. Then:

| state | neighbors | becomes |
|------:|----------:|--------:|
| alive |       2,3 |   alive |
| alive |     other |    dead |
|  dead |         3 |   alive |

That's it. Three lines. From this, you get gliders, spaceships, oscillators,
guns, and (if you're patient) Turing-complete computation.

## the rendering trick

A single braille character holds an 8-dot grid (2 cols × 4 rows). So one
terminal cell paints 8 pixels of life. The screen runs at `(cols × 2) ×
(rows × 4)` resolution — typically several thousand cells.

## the aging trick

Each living cell tracks how long it's been alive. We use that to color
it:

```
< 3   → white     (just born, energetic)
< 8   → cyan
< 15  → bright blue
< 30  → blue
≥ 30  → deep blue (the elders)
```

Watch the colonies: brand-new gliders flash white at the front, the old
oscillators burn cyan in the back.

## why it's a banger

Life is the canonical reminder that **simple rules → endless complexity**.
You'll see structures emerge that nobody designed. When the colony goes
quiet, the script reseeds — but if you watch long enough you'll catch
gliders escaping into the void anyway.

## controls

- **Esc**          back to the picker
- **←/→**          prev / next banger
- **Space**        toggle this readme
- **Ctrl+C**       interrupt the script
