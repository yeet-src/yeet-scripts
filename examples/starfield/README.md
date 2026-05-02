# starfield

**Warp speed.** You're flying through stars and they're streaking past.

Each star has a 3D position `(x, y, z)`. Every frame `z` decreases — the
star gets closer. Its projected screen position grows outward from
center, its glyph gets fancier (`·` → `•` → `✶` → `✦`), and its color
brightens. When `z` crosses zero, the star respawns at the back of the
scene. ~240 stars maintained at all times.

## why it's a banger

Pure 80s-arcade vibe. There's no message, no metric, no point — it's
just *forward motion*, the most reassuring direction in computing.

## the math

```
k = 50 / z              # perspective divisor
sx = cx + x · k         # screen x
sy = cy + y · k · 0.5   # screen y (halved because chars are ~2× taller than wide)
```

Color and glyph density are functions of **closeness** = `1 − z / FAR`,
mapped through a step function so the front-rank stars really pop.

## controls

- **Esc**          back to the picker
- **←/→**          prev / next banger
- **Space**        toggle this readme
- **Ctrl+C**       interrupt the script
