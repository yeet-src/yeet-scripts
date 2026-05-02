**Flavor: observability.** This is the default angle — "I'd actually
use this." Lead with visualizations someone would want to look at to
understand their system, rendered at the graphical ceiling. Process
tables, per-core utilization, network throughput, memory pressure,
spectrograms — htop-genre stuff, but made dense and beautiful with
the techniques in **graphics ambition**. Save the fully artistic /
cursed stuff for one or two flourish slots out of 6–8 panes; the rest
of the wall is serious tooling.

**The system graph is the bedrock.** Discover it before writing any
queries — every useful pane reads from `yeet.graph.*`:

```bash
docker exec -u you "$CID" yeet graph dump
```

(Update cookstat: `echo "reading the menu" > /tmp/cookstat.txt`.)

**CPU% normalization rule.** Display CPU% as % of *total system*, not
per-core. Divide the kernel's per-core number by `nproc` (or by the
CPU count reported in the graph). One full core on an 8-core box reads
as `12.5%`, not `100%`; four cores pegged reads as `50%`, not `400%`.
The native per-core convention is what `top` ships, but it scares
non-ops viewers ("why is sha256sum at 475%??"). Total-system % keeps
every value in `0–100` and looks calm. Apply to all process tables,
trees, sparklines, spotlights.

### Plan the wall before writing any code

Write out your full 4–8 pane plan with viz paradigm AND palette per
pane *before publishing a single demo*. Diversity comes from
pre-commitment, not from in-the-moment choices that drift toward
defaults. Example:

```
pane 1: top processes            paradigm=table          palette=brightYellow + white
pane 2: per-core utilization     paradigm=horizontal-bars palette=green→yellow→red threshold
pane 3: process tree             paradigm=ascii-tree     palette=brightWhite + brightBlack
pane 4: network throughput       paradigm=sparkline      palette=brightBlue + brightCyan, red spikes
pane 5: memory breakdown         paradigm=stacked-bar    palette=brightMagenta + yellow
pane 6: cpu spectrogram          paradigm=spectrogram    palette=blue→cyan→white intensity
pane 7: status board             paradigm=status-grid    palette=stoplight green/yellow/red
pane 8: personality (particles)  paradigm=particle-system palette=uncommon (magenta+blue)
```

Two rules: **no paradigm twice**, **no palette twice**. Hit at least
5 distinct paradigm groups in any 8-pane plan. Groups available:

- **table** (top-N rankings, status boards)
- **bar chart** (horizontal, stacked, per-core utilization)
- **tree** (process tree, cgroup hierarchy)
- **time series** (sparklines, latency bands, request rate)
- **2D heatmap / spectrogram** (CPU per-core, latency, network)
- **scalar / numeric** (big-number, gauge, uptime panel)
- **distribution** (histogram, box plot)
- **personality** (particle system, 3D wireframe, fluid sim)

If the plan has 4 sparklines or 4 tables or 4 cursed visuals, swap
something out before publishing.

### Useful (lead with these — 80% of the wall)

**Process & resource** — top processes (PID/name/CPU%/RSS/state with
inline bars), process tree (`├─` `└─` with CPU% overlay; the ambient
`yeet-worker-*` cluster appears here), process churn (started/exited
in last 30s, diff display), process state breakdown (running /
sleeping / zombie / D, stacked bar).

**Process deep-dives (high signal — use these).** A wall that drills
into specific interesting processes beats one that shows generic
stats — it's the move from "this looks like htop" to "this is showing
me something I couldn't easily see otherwise." Pick processes *doing
things* and build a panel around them. Threads are fair game: when a
`python` is at 380% CPU and you can't tell what it's doing, drill to
per-thread CPU%, state, scheduling stats, page faults — the graph
exposes them and a thread-level panel reads as serious tooling
because nobody else surfaces it. Variants:

- **process spotlight** — one PID, *everything* about it: cmdline,
  parent, children, RSS / VMS / swap, CPU% sparkline, open FDs,
  network sockets, age. Whole pane. Reassign when the PID exits.
- **process biography** — résumé view: spawn time, total CPU
  consumed, peak RSS, state, children ever spawned vs. current.
- **process leaderboard with drill** — top-3 by CPU, each row
  expanding to open files / connections / thread count.
- **fan-out tracker** — pick a parent, watch descendants flash by
  with PID + lifetime as they appear and exit.
- **threads view** — TID / state / CPU% per thread / sched stats for
  one multithreaded process.
- **named-worker watcher** — the `yeet-worker-*` family: start time,
  age, CPU consumed, RSS. The ephemeral one cycles every 30–90s.
- **process compare** — 2–3 PIDs side-by-side, same metrics.
- **process activity feed** — append-only log per PID: spawn, exec,
  fork, wait, exit.

Heuristics for "interesting": highest CPU% over 5–10s, most recently
spawned, `yeet-worker-` prefix, has open network connections, most
children, growing RSS, state = D for any duration. Pick one or two
per demo — be specific about the angle, don't try to surface
"interesting" generically.

**CPU & load** — per-core utilization (use Braille or eighth-block
fill, animate toward target each tick, warm-on-high, drive through
`lib/bar.js`; the temptation is to ship this boring because the data
is simple — don't), load-average sparkline (1m / 5m / 15m, current
value bigger on the right), CPU usage breakdown (user/sys/iowait/idle
stacked).

**Memory** — memory breakdown (used / buffers / cache / free / swap
stacked), memory pressure over time (MemAvailable falling toward
dashed threshold lines).

**Network** — per-interface throughput (rx / tx with totals, color by
absolute bandwidth), connection table (top-N TCP, local→remote,
state, age), bytes-in/out by process.

**Disk** — per-mount usage (% full per mountpoint, color over 80%),
disk I/O per device (read/write rates, latency if available).

**Services / status** — status board (OK / WARN / FAIL badges per
tracked subsystem), uptime + boot info (uptime, last boot, kernel).

**Distributions** (when there's enough data) — latency histogram
(bucket the ambient curl loop's response times), request rate
sparkline, top-N bar charts (CPU consumers, bandwidth users, fd
holders).

**Spectrograms / 2D temporal heatmaps.** Y = discrete categories,
X = time (newest column right), color = intensity. Reveal patterns
sparklines hide. Render with half-blocks (`▀` with fg/bg → 2 vertical
pixels per cell) or quad-cells. Scroll left each tick:
`columns = [...columns.slice(1), newColumn]`. Color via the 16-color
palette + density gradients (`░▒▓█`). Variants: CPU per-core (cores
on Y), process activity (top-20 PIDs on Y), network throughput
(interfaces or per-target hostnames on Y), latency (latency buckets
on Y), memory pressure (regions/cgroup tiers on Y), fd activity (fd
categories on Y).

### Personality (max 1–2 panes — go all out)

Reserved slots where you flex the graphics ceiling. Not "matrix rain
because it's easy" — "I built a real-time particle system in 100
lines of yeet." If you ship one, **commit**: 30fps, full pane, dense
color, real math driving real animation. Each should make a viewer
say **"wait, that's running in a terminal?"** Options:

- **Particle system on network bursts** — Braille dots, gravity, drag,
  age-colored fade.
- **3D wireframe** — rotating tetrahedron / cube / sphere, depth-
  sorted Braille. Rotation speed on CPU load.
- **Fluid sim / smoke plume** — 2D Navier-Stokes-lite, density × color.
- **Mandelbrot zoom** — Braille = 1280×640 effective in an 80×40 pane.
  Pan/zoom drift on load average.
- **Reaction-diffusion** — gray-Scott, half-block render, rate
  constants on system metrics.
- **Boids flock** — cluster on traffic.
- **Audio-style spectrum bars** — 32 bars, smooth attack/decay, per-
  CPU drive.
- **Vintage waterfall spectrogram** — SDR-style rainbow palette,
  Braille Y, intensity off any multi-channel data.
- **Wave equation 2D** — water surface with raindrops on TCP connect.
- **Raycaster** — DOOM-style first-person, walls colored by ambient
  process activity.

**Tie the fun back to the system whenever you can.** A pure-aesthetic
particle system is fine; one that fires on curl bursts is *better*.
Boids cluster on traffic, the Mandelbrot pans on load, the wave
equation gets a raindrop on every TCP connect, the audio bars are
driven by per-core CPU, the raycaster colors walls by ambient
process activity. The personality slot is where graphical ambition
meets observability — the data is the soundtrack the visuals dance
to. If you can't think of a tie, ship it anyway, but spend a minute
trying first.
