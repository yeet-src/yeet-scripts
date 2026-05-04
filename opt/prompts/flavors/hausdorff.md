**Flavor: hausdorff.** A math gallery, not a dashboard. Drop the
observability framing — no process tables, no per-core utilization,
no top-N rankings. Each pane is a *named mathematical object* rendered
live, the kind of thing you'd see plated in a math visualization
museum or on the wall of a number-theorist's office.

The wall should range across mathematics — no single-branch walls. Aim
for at least 5 of the paradigm groups below in any 6–8 pane plan, and
no two panes from the same group:

- **Fractals** — Mandelbrot zoom, Julia-set drift, Koch snowflake,
  Sierpinski gasket / carpet, Apollonian gasket, dragon curve, Hilbert
  / Peano space-filling curves, Cantor set & Devil's staircase, Newton
  fractal. Braille for sub-cell resolution; slow parameter drift via
  `setInterval`.
- **Strange attractors & flows** — Lorenz, Rössler, Halvorsen, Chen,
  Thomas, Aizawa, Sprott. Long trail of points in Braille; color by
  velocity or trajectory age.
- **Cellular automata** — Conway's Life, Wolfram Rule 30 / 90 / 110,
  Langton's ant, falling-sand, hexagonal CAs, snowflake CAs. Half-block
  rows for double vertical resolution.
- **Tilings & tessellations** — Penrose (P2 / P3), Voronoi with
  jittering sites, Delaunay, Truchet, hexagonal mosaics, hyperbolic
  Poincaré-disk tilings (M.C. Escher style). Box-drawing for clean
  edges.
- **Curves & dynamics** — Lissajous, harmonograph, rose curves,
  cardioid / lemniscate / limaçon (polar), spirograph epicycles,
  pursuit curves, 2D wave equation with point sources,
  reaction-diffusion (gray-Scott, Belousov–Zhabotinsky).
- **3D & topology** — rotating Platonic solids (all five), tesseract /
  4D-cube projection, torus and double-torus, Möbius strip, Klein
  bottle, Boy's surface, trefoil / figure-eight / Hopf-link knots.
  Depth-sorted Braille line draw.
- **Number theory** — Ulam spiral of primes, Stern-Brocot tree, Farey
  sequence, Gaussian primes plot, Euler totient function, continued
  fraction expansions, Chinese remainder lattices.
- **Probability & stochastic** — random walks (1D and 2D), Brownian
  motion, percolation at the critical threshold, Galton board (bean
  machine) building a binomial, branching processes,
  Markov-chain convergence to stationary, self-avoiding walks.
- **Graph theory & combinatorics** — Erdős–Rényi random graphs growing
  past the giant-component threshold, Cayley graphs of small groups,
  force-directed layouts settling, Pascal's triangle mod p (becomes a
  Sierpinski), Young tableaux, the Petersen graph, random matchings.
- **Complex analysis** — Riemann sphere stereographic projection,
  domain coloring of `f(z)` (hue = arg, brightness = |z|), zeros of
  the Riemann zeta function on the critical line, Cauchy contour
  integrals, Möbius transformations of the disk.
- **Discrete bifurcations** — logistic map bifurcation diagram (period
  doubling cascade), cobweb plots, Feigenbaum constant emerging,
  Lyapunov fractals, Arnold's cat map iterations, Hénon map.

Label each pane with the *name* of the structure it shows ("Lorenz
attractor", "Penrose P3", "Rule 110", "Apollonian gasket", "Hopf
link") in the title bar — half the value is recognition. Footer can
carry the defining parameters (`r = 28, σ = 10, β = 8/3` for Lorenz,
`c = -0.7269 + 0.1889i` for the Julia, `r = 3.7` for the logistic).

Tie panes to the system *only* if it adds something — Mandelbrot pan
rate driven by load average, Lorenz time-step by CPU%, CA seed events
on TCP connect, percolation threshold drifting on memory pressure.
Default is no tie; the math runs on its own clock and the wall
doesn't care what your processes are doing.

Apply the **graphics ambition** techniques full-tilt — sub-cell
glyphs, eased motion, density gradients, atomic frames — so each
pane looks like a textbook plate brought to life rather than a
calculator tracing an equation.
