#!/usr/bin/env -S yeet run
//
// METROPOLIS — an art-deco city that breathes your system.
//
// The city takes over the screen: layered skyscrapers, the Tower of
// Babel in the middle, a neon Tux billboard on a rooftop, twinkling
// windows, blinking rooftop lights, and elevated roadways.
//
// The top CPU-spending processes walk the boulevard below as citizens:
//   • R (running)   — walk with animated legs, speed scales with CPU
//   • S (sleeping)  — stand quietly
//   • D (iowait)    — frozen, stuck
//   • Z (zombie)    — ✕ in red
//   • T (stopped)   — faded
//
// A thin footer shows CPU, MEM, LOAD, NET, and UP.
//
// Usage:
//   yeet run examples/metropolis.js
//   yeet run examples/metropolis.js -- --interval 300
//

const { interval = 100 } = yeet.args;

const unwrap = (r) => r.data ?? r;

const MAX_CITIZENS = 12;

/* ── State ─────────────────────────────────────────────────────────── */

let tick = 0;

let prev_total = null;
let total_cpu_pct = 0;
let cores = 1;

let mem = null;
let load = null;
let uptime_s = 0;

let prev_net = null;
let prev_net_ts = null;
let rx_bps = 0;
let tx_bps = 0;

let prev_procs = new Map();   /* pid → cpu_ticks last sample */
let citizens = [];            /* ordered by rank; each walks its lane */

let city_cache = null;

/* ── Frame buffer (double buffering to eliminate flicker) ──────────────
 *
 * All draws during a render append to `frame` instead of writing to the
 * TTY directly. At the end of render(), the entire frame is flushed in
 * a single tty.write() call. We never tty.clear() between frames — the
 * city layer fully repaints the sky region, and sparse rows (street,
 * stats, footer) emit \x1b[K (erase-to-end-of-line) before their content
 * so prior-frame residue is removed without a flash. */
let frame = "";
const ERASE_EOL = "\x1b[K";
function fmove(row, col) { frame += `\x1b[${row + 1};${col + 1}H`; }
function fwrite(s) { frame += s; }
function ferase_line(row) { frame += `\x1b[${row + 1};1H${ERASE_EOL}`; }

/* ── Formatting helpers ─────────────────────────────────────────────── */

function pct_color(p) {
  return p > 90 ? style.brightRed : p > 60 ? style.brightYellow : style.brightGreen;
}

function bar(pct, width) {
  const filled = Math.round((pct / 100) * width);
  const empty = Math.max(0, width - filled);
  return pct_color(pct)("█".repeat(Math.max(0, filled))) + style.dim("░".repeat(empty));
}

function human_bytes(n) {
  const u = ["B ", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return (n.toFixed(i === 0 ? 0 : 1) + " " + u[i]).padStart(9);
}

function uptime_str(s) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d}d ${pad(h)}:${pad(m)}:${pad(ss)}`;
}

function cpu_delta(prev, cur) {
  const busy = (cur.user_ms - prev.user_ms) + (cur.nice_ms - prev.nice_ms)
    + (cur.system_ms - prev.system_ms) + ((cur.irq_ms || 0) - (prev.irq_ms || 0))
    + ((cur.softirq_ms || 0) - (prev.softirq_ms || 0))
    + ((cur.steal_ms || 0) - (prev.steal_ms || 0));
  const idle = (cur.idle_ms - prev.idle_ms) + ((cur.iowait_ms || 0) - (prev.iowait_ms || 0));
  const total = busy + idle;
  return total > 0 ? (busy / total) * 100 : 0;
}

function neon(s) {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === " ") { out += c; continue; }
    out += ((i + Math.floor(tick / 3)) % 2 === 0 ? style.brightMagenta : style.brightCyan)(c);
  }
  return out;
}

/* ── Tux billboard ──────────────────────────────────────────────────── */

const TUX = [
  " .--. ",
  "|o_o |",
  "|:_/ |",
  "(|  |)",
  "/`--`\\",
];

/* ── Cityscape ─────────────────────────────────────────────────────── */

function build_city(cols, H) {
  if (city_cache && city_cache.cols === cols && city_cache.H === H) return city_cache;

  const grid = [];
  for (let r = 0; r < H; r++) grid.push(new Array(cols).fill(" "));

  /* Seeded RNG so the skyline is deterministic per size. */
  let s = (20260422 ^ (cols * 31) ^ (H * 131)) >>> 0;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };

  const ground = H - 1;

  const WINDOWS = {
    checker: (i, j) => ((i + j) % 2 === 0) ? "▪" : "▫",
    grid:    (i, j) => (j % 2 === 0 ? ((i % 2 === 1) ? "▪" : " ") : ((i % 2 === 0) ? "▫" : " ")),
    stripe:  (_i, j) => (j % 2 === 0 ? "▪" : "▫"),
    vbars:   (i, _j) => (i % 2 === 0 ? "│" : "▪"),
  };

  function paint(x, y, w, h, pattern = "checker") {
    if (w < 2 || h < 2 || x < 0 || x + w > cols || y < 0 || y + h > H) return null;
    const winfn = WINDOWS[pattern] || WINDOWS.checker;
    grid[y][x] = "╔"; grid[y][x + w - 1] = "╗";
    for (let i = 1; i < w - 1; i++) grid[y][x + i] = "═";
    for (let j = 1; j < h; j++) {
      grid[y + j][x] = "║";
      grid[y + j][x + w - 1] = "║";
      for (let i = 1; i < w - 1; i++) grid[y + j][x + i] = winfn(i, j);
    }
    return { x, y, w, h };
  }

  function antenna(x, y_top, length) {
    if (x < 0 || x >= cols) return;
    for (let i = 0; i < length; i++) {
      if (y_top - i >= 0) grid[y_top - i][x] = "│";
    }
  }

  function dome(cx, y) {
    if (cx < 1 || cx + 1 >= cols || y < 1 || y >= H) return;
    grid[y - 1][cx - 1] = "╭";
    grid[y - 1][cx] = "═";
    grid[y - 1][cx + 1] = "╮";
    grid[y][cx] = "◉";
  }

  function paste(x, y, text) {
    for (let i = 0; i < text.length; i++) {
      const cx = x + i, cy = y;
      if (cx >= 0 && cx < cols && cy >= 0 && cy < H) grid[cy][cx] = text[i];
    }
  }

  /* Back layer: tall, distant towers — deterministic, densely packed. */
  let x = 0;
  while (x < cols) {
    const w = 3 + Math.floor(rnd() * 4);
    const h = Math.max(4, Math.floor(H * 0.55) + Math.floor(rnd() * 5));
    paint(x, ground - h, w, h, "checker");
    if (rnd() < 0.45) antenna(x + Math.floor(w / 2), ground - h - 1, 1 + Math.floor(rnd() * 3));
    if (rnd() < 0.25) dome(x + Math.floor(w / 2), ground - h);
    x += w + Math.floor(rnd() * 3);
  }

  /* Mid layer. */
  x = 1;
  while (x < cols) {
    const w = 4 + Math.floor(rnd() * 5);
    const h = Math.max(4, Math.floor(H * 0.4) + Math.floor(rnd() * 5));
    const pat = rnd() < 0.5 ? "grid" : "stripe";
    paint(x, ground - h, w, h, pat);
    if (rnd() < 0.3) antenna(x + Math.floor(w / 2), ground - h - 1, 1 + Math.floor(rnd() * 2));
    x += w + Math.floor(rnd() * 3);
  }

  /* Front layer: shorter, chunkier — bright, closer. */
  x = 0;
  while (x < cols) {
    const w = 4 + Math.floor(rnd() * 5);
    const h = 4 + Math.floor(rnd() * Math.max(1, Math.floor(H * 0.25)));
    paint(x, ground - h, w, h, "vbars");
    x += w + Math.floor(rnd() * 2);
  }

  /* Elevated roadways sweeping across, behind the front towers. */
  const roads = [Math.floor(H * 0.32), Math.floor(H * 0.52)];
  for (const ry of roads) {
    if (ry <= 0 || ry >= H - 1) continue;
    for (let c = 1; c < cols - 1; c++) {
      if (grid[ry][c] === " ") grid[ry][c] = "┄";
    }
  }

  /* Central Tower of Babel — stepped ziggurat, widest base to slim spire. */
  const cx = Math.floor(cols / 2);
  const tiers = [
    { w: Math.min(21, cols - 4), h: Math.max(3, Math.floor(H * 0.18)) },
    { w: Math.min(17, cols - 6), h: Math.max(3, Math.floor(H * 0.14)) },
    { w: Math.min(13, cols - 8), h: Math.max(3, Math.floor(H * 0.14)) },
    { w: Math.min(9,  cols - 10), h: Math.max(2, Math.floor(H * 0.10)) },
    { w: 3, h: 2 },
  ];
  let ty = ground;
  let top_y = ty;
  for (const t of tiers) {
    if (t.w < 3 || ty - t.h < 0) continue;
    ty -= t.h;
    paint(cx - Math.floor(t.w / 2), ty, t.w, t.h, "grid");
    top_y = ty;
  }
  antenna(cx, top_y - 1, Math.min(5, top_y));
  dome(cx, top_y);

  /* Tux billboard on a rooftop in the right-third of the skyline. */
  if (cols > 40 && H > 10) {
    const bx = Math.max(2, Math.floor(cols * 0.78) - 4);
    const by = Math.max(2, Math.floor(H * 0.40));
    /* Frame */
    paste(bx - 1, by - 1,   "┌" + "─".repeat(TUX[0].length) + "┐");
    for (let i = 0; i < TUX.length; i++) {
      paste(bx - 1, by + i, "│");
      paste(bx, by + i, TUX[i]);
      paste(bx + TUX[0].length, by + i, "│");
    }
    paste(bx - 1, by + TUX.length, "└" + "─".repeat(TUX[0].length) + "┘");
    /* "TUX" marquee above the frame */
    paste(bx + 1, by - 2, "TUX");
  }

  /* Rooftop signs on the front. */
  if (cols > 60) paste(Math.floor(cols * 0.14), Math.floor(H * 0.50), " NEUE ");
  if (cols > 80) paste(Math.floor(cols * 0.42), Math.floor(H * 0.25), " POLIS ");
  if (cols > 110) paste(Math.floor(cols * 0.06), Math.floor(H * 0.28), " YOSHIWARA ");

  /* Street-level strip: solid illuminated facade at ground. */
  for (let c = 0; c < cols; c++) {
    if (grid[ground][c] === " ") grid[ground][c] = "▄";
  }

  city_cache = { cols, H, grid };
  return city_cache;
}

function is_letter(ch) { return (ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z"); }

function city_char_style(r, c, ch, H) {
  if (ch === " ") return " ";
  if (ch === "│" && (r % H) < H / 3) return style.brightRed(ch);  /* antennas */
  if (ch === "┄") return style.dim(ch);
  if (ch === "◉") return ((tick + c + r) % 2 === 0) ? style.brightYellow(ch) : style.yellow(ch);
  if (ch === "▄") return style.brightBlack(ch);

  /* Twinkling windows. */
  if (ch === "▪") {
    const lit = ((r * 7 + c * 3 + Math.floor(tick / 2)) % 7) < 5;
    return lit ? style.brightYellow(ch) : style.dim(ch);
  }
  if (ch === "▫") {
    const lit = ((r * 11 + c * 5 + Math.floor(tick / 2)) % 11) < 2;
    return lit ? style.yellow(ch) : style.dim(ch);
  }

  /* Rooftop sign letters — cycle neon. */
  if (is_letter(ch)) {
    return ((c + Math.floor(tick / 2)) % 2 === 0) ? style.brightCyan(ch) : style.brightMagenta(ch);
  }

  /* Tux glyphs — bright white on dark background. */
  if (".-_|o:(\\)`/".includes(ch)) return style.brightWhite(ch);

  /* Billboard frame — yellow */
  if ("┌┐└┘─".includes(ch)) return style.brightYellow(ch);

  /* Walls / corners / edges — depth-cue by row: higher = dimmer/farther. */
  const depth = r / H;
  if (depth < 0.25) return style.magenta(ch);
  if (depth < 0.55) return style.brightMagenta(ch);
  return style.brightCyan(ch);
}

/* ── Citizens (top processes walking the street) ────────────────────── */

function update_citizens(procs) {
  const now_samples = new Map();
  for (const p of procs) {
    if (!p || !p.stat) continue;
    now_samples.set(p.pid, {
      comm: p.stat.comm,
      state: p.stat.state,
      cpu_ticks: p.stat.utime + p.stat.stime,
      rss: p.stat.rss_bytes || 0,
    });
  }

  const ranked = [];
  for (const [pid, cur] of now_samples) {
    const prev = prev_procs.get(pid);
    const delta = prev ? Math.max(0, cur.cpu_ticks - prev.cpu_ticks) : 0;
    ranked.push({ pid, delta, rss: cur.rss, comm: cur.comm, state: cur.state });
  }

  ranked.sort((a, b) => (b.delta - a.delta) || (b.rss - a.rss));
  const top = ranked.slice(0, MAX_CITIZENS);

  const existing = new Map(citizens.map((c) => [c.pid, c]));
  citizens = top.map((t) => {
    const prev = existing.get(t.pid);
    if (prev) {
      prev.comm = t.comm; prev.state = t.state; prev.delta = t.delta;
      return prev;
    }
    return {
      pid: t.pid, comm: t.comm, state: t.state, delta: t.delta,
      x: Math.random(),
      dir: Math.random() < 0.5 ? -1 : 1,
    };
  });

  prev_procs = now_samples;
}

function state_style(state) {
  switch (state) {
    case "R": return { head: "◉", color: style.brightGreen };
    case "S": return { head: "○", color: style.cyan };
    case "D": return { head: "◉", color: style.brightYellow };
    case "Z": return { head: "✕", color: style.brightRed };
    case "T": return { head: "◌", color: style.dim };
    default:  return { head: "●", color: style.white };
  }
}

function state_body(state, phase) {
  if (state === "R")      return phase === 0 ? "╱│╲" : "╲│╱";
  if (state === "D")      return "│││";
  if (state === "Z")      return " ⚰ ";
  if (state === "T")      return "═╪═";
  /* Sleeping / default — gentle sway. */
  return phase === 0 ? "·│·" : " │ ";
}

function state_speed(state, delta) {
  if (state === "R") return Math.min(1.2, 0.25 + delta * 0.03);
  if (state === "S") return 0.04;
  return 0;
}

function draw_street(top, cols) {
  /* Erase sparse rows so moving citizens don't leave a trail. */
  for (let dy = 1; dy <= 4; dy++) ferase_line(top + dy);

  /* Sidewalk line — the boulevard. */
  fmove(top, 0);
  fwrite(style.brightBlack("═".repeat(cols)));

  const n = citizens.length;
  if (n === 0) {
    fmove(top + 2, 2);
    fwrite(style.dim("( the streets are empty — collecting citizens... )"));
    return;
  }

  const slot_w = Math.max(10, Math.floor(cols / n));
  const inner = slot_w - 4;

  for (let i = 0; i < n; i++) {
    const cit = citizens[i];
    const v = state_speed(cit.state, cit.delta);
    cit.x += cit.dir * v * 0.12;
    if (cit.x < 0) { cit.x = 0; cit.dir = 1; }
    if (cit.x > 1) { cit.x = 1; cit.dir = -1; }

    const slot_x = i * slot_w;
    const sprite_x = slot_x + 1 + Math.floor(cit.x * Math.max(1, inner));
    const st = state_style(cit.state);
    const body = state_body(cit.state, tick % 2);

    /* Head */
    fmove(top + 1, sprite_x + 1);
    fwrite(st.color(st.head));

    /* Body / legs */
    fmove(top + 2, sprite_x);
    fwrite(st.color(body));

    /* Direction arrow over head when running */
    if (cit.state === "R") {
      fmove(top + 1, sprite_x + (cit.dir > 0 ? 3 : -1));
      fwrite(style.dim(cit.dir > 0 ? "›" : "‹"));
    }

    /* Name label */
    const comm = (cit.comm || "?").slice(0, slot_w - 1);
    fmove(top + 3, slot_x);
    fwrite(style.dim(comm.padEnd(slot_w)));

    /* Tiny CPU intensity dots under name */
    const pips = Math.min(slot_w - 2, Math.max(0, Math.round(v * (slot_w - 2))));
    fmove(top + 4, slot_x);
    const dots = st.color("•".repeat(pips)) + style.dim("·".repeat(Math.max(0, slot_w - 2 - pips)));
    fwrite(" " + dots + " ");
  }
}

/* ── Stats footer ───────────────────────────────────────────────────── */

function draw_stats(top, cols) {
  let mem_pct = 0;
  if (mem && mem.mem_total) {
    mem_pct = ((mem.mem_total - mem.mem_available) / mem.mem_total) * 100;
  }
  const bar_w = Math.max(10, Math.min(24, Math.floor((cols - 64) / 2)));

  ferase_line(top);
  ferase_line(top + 1);

  fmove(top, 0);
  const cpu = style.dim(" CPU ") + "[" + bar(total_cpu_pct, bar_w) + "] "
    + pct_color(total_cpu_pct)(total_cpu_pct.toFixed(1).padStart(5) + "%");
  const memS = style.dim("   MEM ") + "[" + bar(mem_pct, bar_w) + "] "
    + pct_color(mem_pct)(mem_pct.toFixed(1).padStart(5) + "%");
  fwrite(cpu + memS);

  fmove(top + 1, 0);
  let line2 = style.dim(" LOAD ");
  if (load) {
    const c1 = load.one > 4 ? style.brightRed : load.one > 2 ? style.brightYellow : style.brightGreen;
    line2 += c1(load.one.toFixed(2)) + "  " + load.five.toFixed(2) + "  " + style.dim(load.fifteen.toFixed(2));
  } else {
    line2 += style.dim("...");
  }
  line2 += style.dim("   NET ")
    + style.brightGreen("rx ") + human_bytes(rx_bps) + style.dim("/s")
    + "  " + style.brightMagenta("tx ") + human_bytes(tx_bps) + style.dim("/s");
  line2 += style.dim("   UP ") + style.brightWhite(uptime_str(uptime_s));
  line2 += style.dim("   CITIZENS ") + style.brightWhite(String(citizens.length));
  fwrite(line2);
}

/* ── Banner ─────────────────────────────────────────────────────────── */

function draw_banner(cols, top) {
  const title = "M E T R O P O L I S   ·   S Y S T E M   M O N I T O R";
  fmove(top, 0);
  fwrite(style.brightCyan("╔" + "═".repeat(Math.max(0, cols - 2)) + "╗"));
  fmove(top + 1, 0);
  const pl = Math.max(0, Math.floor((cols - 2 - title.length) / 2));
  const pr = Math.max(0, cols - 2 - title.length - pl);
  fwrite(
    style.brightCyan("║") + " ".repeat(pl) + style.bold(neon(title))
      + " ".repeat(pr) + style.brightCyan("║")
  );
  fmove(top + 2, 0);
  fwrite(style.brightCyan("╚" + "═".repeat(Math.max(0, cols - 2)) + "╝"));
}

/* ── Render ─────────────────────────────────────────────────────────── */

function render() {
  tick += 1;

  const { rows, cols } = tty.size();
  frame = "";

  const banner_h = 3;
  const street_h = 5;   /* sidewalk + head + body + label + pips */
  const stats_h  = 2;
  const footer_h = 1;
  const sky_h = rows - banner_h - street_h - stats_h - footer_h;

  if (sky_h < 6 || cols < 40) {
    tty.clear();
    tty.move(0, 0);
    tty.write(style.brightRed("Terminal too small — need at least 40x20"));
    return;
  }

  let row = 0;

  draw_banner(cols, row); row += banner_h;

  const city = build_city(cols, sky_h);
  for (let i = 0; i < city.grid.length; i++) {
    fmove(row + i, 0);
    let out = "";
    for (let c = 0; c < city.grid[i].length; c++) {
      out += city_char_style(i, c, city.grid[i][c], city.grid.length);
    }
    fwrite(out);
  }
  row += sky_h;

  draw_street(row, cols); row += street_h;

  draw_stats(row, cols); row += stats_h;

  fmove(rows - 1, 0);
  fwrite(
    style.dim(" interval " + interval + "ms  ·  ")
    + style.brightBlack("Mediator between head and hands must be the heart.")
    + ERASE_EOL
  );

  /* Single flush — the whole frame lands in one write. */
  tty.write(frame);
}

/* ── Subscriptions ──────────────────────────────────────────────────── */

tty.alt();
tty.hideCursor();
tty.title("Metropolis");
tty.clear();
tty.move(0, 0);
tty.write(style.dim(" loading the city..."));

yeet.graph.subscribe(
  `subscription {
    kernel_stats(interval_ms: ${interval}) {
      total { user_ms nice_ms system_ms idle_ms iowait_ms irq_ms softirq_ms steal_ms }
      cpu_time { user_ms }
    }
  }`,
  (r) => {
    const ks = unwrap(r).kernel_stats;
    cores = ks.cpu_time.length || 1;
    if (prev_total) total_cpu_pct = cpu_delta(prev_total, ks.total);
    prev_total = ks.total;
    render();
  },
);

yeet.graph.subscribe(
  `subscription { meminfo(interval_ms: ${interval}) { mem_total mem_available } }`,
  (r) => { mem = unwrap(r).meminfo; },
);

yeet.graph.subscribe(
  `subscription { load_average(interval_ms: ${interval}) { one five fifteen } }`,
  (r) => { load = unwrap(r).load_average; },
);

yeet.graph.subscribe(
  `subscription { host(interval_ms: ${interval}) { uptime { uptime } } }`,
  (r) => { uptime_s = unwrap(r).host.uptime.uptime; },
);

yeet.graph.subscribe(
  `subscription { network_interface_stats(interval_ms: ${interval}) { name recv_bytes sent_bytes } }`,
  (r) => {
    const stats = unwrap(r).network_interface_stats;
    const ifs = Array.isArray(stats) ? stats : [stats];
    let rx = 0, tx = 0;
    for (const i of ifs) {
      if (!i || i.name === "lo") continue;
      rx += i.recv_bytes || 0;
      tx += i.sent_bytes || 0;
    }
    const now = Date.now();
    if (prev_net !== null && prev_net_ts !== null) {
      const dt = (now - prev_net_ts) / 1000;
      if (dt > 0) {
        rx_bps = Math.max(0, (rx - prev_net.rx) / dt);
        tx_bps = Math.max(0, (tx - prev_net.tx) / dt);
      }
    }
    prev_net = { rx, tx };
    prev_net_ts = now;
  },
);

yeet.graph.subscribe(
  `subscription {
    procs(interval_ms: ${interval}) {
      pid
      stat { comm state utime stime rss_bytes }
    }
  }`,
  (r) => {
    const procs = unwrap(r).procs;
    if (Array.isArray(procs)) update_citizens(procs);
  },
);
