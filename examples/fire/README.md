# fire

**Doom's flame effect**, in your terminal. Originally Fabien Sanglard's
1993 algorithm — runs on anything, looks like nothing else.

## how it works

Keep a 2D buffer of "intensity" values (0–31). The bottom row is fixed
at 31 — pure white-hot. Then each frame:

1. For every pixel `(x, y)`, look at the pixel **below** it (with random
   ±1 horizontal jitter for the swirl effect).
2. Subtract a small random amount (0–2) so it cools as it rises.
3. Write that value into `(x, y)`.

Result: heat propagates upward and dissipates. The horizontal jitter
gives the flames their licking, organic motion. The random cool-down
amount gives the texture.

## why it's a banger

It's a perfect tiny algorithm — 4 lines of math, infinite visual depth.
And it teaches you something fundamental: **complex behavior from local
rules** is the entire story of cellular automata, fluid sims, neural
nets, even cities.

## palette

A 32-step ramp from black, through deep red, to orange, to yellow, to
white. Truecolor again, half-block double resolution again.

## controls

- **Esc**          back to the picker
- **←/→**          prev / next banger
- **Space**        toggle this readme
- **Ctrl+C**       interrupt the script
