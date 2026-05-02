# plasma

A **smooth flowing organic gradient** that morphs forever. The terminal
turns into a lava lamp.

## the recipe

For each pixel `(x, y)` at time `t`:

```
v = sin(x/10 + t)
  + sin(y/8  − 1.3·t)
  + sin((x+y)/14 + 0.7·t)
  + sin(hypot(x − cx, y − cy)/6 − t)
```

That's four sines: two axis-aligned, one diagonal, and one radial. Their
sum is normalized to `[0, 1]` and fed through an HSV→RGB conversion to
produce truecolor escape codes.

## why it's a banger

Plasma effects were the demoscene's way of showing off in the 90s and
they still feel like magic in a terminal. No data, no inputs — just
a closed-form math expression that happens to be beautiful in motion.

## tricks

- We render with the `▀` half-block character. Foreground = top pixel
  row, background = bottom pixel row. So one terminal cell encodes two
  pixels of vertical resolution.
- Truecolor (`\x1b[38;2;r;g;b`) so we get the full ~16M color space, not
  the 256-color palette.

## controls

- **Esc**          back to the picker
- **←/→**          prev / next banger
- **Space**        toggle this readme
- **Ctrl+C**       interrupt the script
