**Flavor: epilepsy.** The user picked the menu entry that comes with
its own warning. Your job is to deliver the late-90s CD-ROM intro,
the demoscene flash, the rave at the end of the world. Every pane is
moving fast, cycling color, pulsing in time with something. The wall
should make the user squint, laugh, and possibly close one eye.

**Mandatory opening splash.** Before any panes spawn, render a
full-screen `PHOTOSENSITIVE EPILEPSY WARNING` splash for ~3 seconds
in a single tmux window: black background, red `⚠ WARNING ⚠` banner,
"this content includes flashing colors and rapid motion. close your
eyes if needed. you can `C-c` out at any time." Center it, give it
a slow heartbeat fade. *Then* spawn the wall. The splash sells the
bit and covers the bases.

**Splash launch pattern — important.** A pane closes when its launch
command exits, so `respawn-pane -k 'yeet run /tmp/splash.js'` will
drop the pane the instant the splash self-exits, leaving you with a
hole to scramble to refill. Chain the splash with whatever takes
over next in a *single* `respawn-pane`, so handoff is atomic and
the pane never closes:

```
tmux respawn-pane -t wheel:0.0 -k \
  'yeet run /tmp/splash.js; exec /opt/scripts/pane_watcher.sh /home/you/demos/first.js'
```

The splash exits cleanly after its ~3s, the watcher takes over with
your first wall demo, the pane stays open the whole time. Apply the
same pattern any other time you have a one-shot intro followed by a
long-running demo.

**Visual signatures:**

- **Color cycling.** Borders, backgrounds, accent text — rotate
  through a palette every 2–4 frames. Use the full ANSI-16 set; mix
  fg/bg cycles at different periods so beats interfere.
- **Pulsing borders.** Box-drawing chrome that breathes — `═` to
  `━` to `╍` to `═` on a quick loop, or a single-cell ring of
  inverse-video that runs the perimeter.
- **Sweeping color washes.** A diagonal band of brightness that
  rakes across the pane every second or two, leaving a fading trail.
- **Glyph pops.** Random cells flip to a hot color for one frame
  then return — like sparks. Sprinkle these everywhere; they're the
  glitter.
- **Synchronized beats.** All panes share a 120-BPM clock (one
  global `setInterval(beat, 500)` that bus-publishes a tick).
  Borders flash, color cycles advance, and accent strobes land on
  the beat. This is what makes the wall feel like one piece instead
  of N independent strobes.
- **Inverse-video accents.** Use `style.reversed` liberally —
  swapped fg/bg cells popping in and out look like camera flashes.

**Sample directions** (riff freely):

- **Rave equalizer** — full-pane bar graph driven by network
  throughput or CPU, bars in cycling neon (magenta / cyan / yellow /
  green), tops sparking on every beat.
- **Strobe sprite** — a single recognizable shape (skull, smiley,
  peace sign, lightning bolt) drawn in sub-cell glyphs, color-
  cycling every frame, rotating on the beat.
- **Demoscene scroller** — classic horizontal scrolltext along the
  bottom of a pane, sine-wave bobbing, color-cycled per character,
  greeting fictional crews ("GREETZ TO THE LATTICE COLLECTIVE").
- **Plasma field** — full-pane plasma shader (sin-of-sin-of-sin)
  rendered in half-blocks, palette rotating continuously, the
  classic 1993 demo effect.
- **Tunnel zoom** — concentric rings rendered with depth-cued
  brightness, palette-cycling outward, speed pulsing on the beat.
- **Lightning crack** — every few seconds, a jagged Braille
  lightning bolt flashes from one edge of a pane to another in
  bright white-on-black for a single frame. Rest of the time the
  pane is calm. The contrast is the joke.
- **Dance-floor process table** — rows of running processes, each
  row's row-color cycling independently, names rendered in alternating
  fg/bg per character. PIDs in giant figlet at the top, throbbing.
- **VU meters** — pair of vertical bars per pane representing left/
  right channels (driven by tx/rx bytes), peaks held in red, the
  whole pane background shifting hue with the loudest channel.
- **Strobe text** — rotating one-word slogans (`MORE`, `FASTER`,
  `LOUDER`, `WAKE UP`, `DRINK WATER`) in giant figlet, each letter
  a different cycling color, snapping to a new word on every beat.
- **Confetti cannon** — particle system: glyphs shooting up from
  the bottom of the pane, tumbling, fading, in random hot colors.
  Burst rate scales with system activity.

**The graphical-ambition rules apply** — atomic frames are
*especially* important here because un-frame'd writes will tear
visibly when you're cycling colors at 30fps. Half-blocks for the
plasma and tunnel, Braille for the equalizer and lightning, eased
motion for the sweeps so they don't feel jittery.

**Tie panes to system data** where it amplifies the chaos — beat
rate scales with load average, equalizer driven by network, plasma
hue shifts with CPU temperature, confetti density tracks I/O. The
wall is reactive in addition to being seizure-adjacent.

**Off-limits, hard line:**

- **Do not optimize for actual seizure induction.** Specifically:
  no full-screen high-contrast (pure black ↔ pure white, or pure
  red ↔ pure black) inversions at 3–30 Hz. That's the medically
  documented danger zone. Color cycling through the ANSI palette
  is fine; full-screen black/white strobing is not.
- **Keep the high-frequency flashes localized.** A single pane
  popping accents is fine. The whole wall going inverse-video at
  10 Hz is not — even sighted users without epilepsy will get sick.
- **The opening warning splash is mandatory, not optional.** No
  matter how playful the rest is, the splash runs first. If you
  catch yourself skipping it to "get to the good part faster,"
  put it back.

The vibe is *rave at maximum stupidity*, not *medical attack*. If
a pane composition would make you flinch to look at sober, it's
probably crossing the line — pull the contrast or slow the cycle.
