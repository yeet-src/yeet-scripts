// proctop / render.js
//
// A small, top(1)-like process viewer. The whole layout is driven by the
// COLUMNS array below — to add a field, append one entry. Nothing else
// in this file needs to change.
//
// Modes:
//   --once       print one snapshot and exit (pipe-safe; no PTY needed)
//   (default)    live: alt-screen, redraw on each tick
//
// Flags:
//   --interval 1500   poll cadence (ms)
//   --rows N          max process rows to show (default: fit terminal)
//   --sort cpu|mem|pid   sort key (default: cpu)

import { watch } from "./data.js";

const intervalMs = Number(yeet.args.interval) || 1500;
const once = yeet.args.once === true;
const rowOverride = Number(yeet.args.rows) || null;
const sortKey = yeet.args.sort || "cpu";

/* ------------------------------------------------------------------ */
/* COLUMNS — the single extension point.                              */
/*                                                                     */
/* Each entry describes one column:                                    */
/*   header   text shown in the header row                             */
/*   width    visible character width (COMMAND uses the leftover)      */
/*   align    'left' | 'right'                                         */
/*   get(p)   returns the cell string (already formatted)              */
/*   color?(p, str)   optional style wrapper for the cell              */
/*                                                                     */
/* To add a column: append an entry, fetch the field in data.js, and   */
/* you're done.                                                         */
/* ------------------------------------------------------------------ */

const COLUMNS = [
  {
    header: "PID",
    width: 7,
    align: "right",
    get: (p) => String(p.pid),
    color: (_, s) => style.dim(s),
  },
  {
    header: "%CPU",
    width: 6,
    align: "right",
    get: (p) => p.cpuPct.toFixed(1),
    color: (p, s) =>
      p.cpuPct >= 50 ? style.red(s) : p.cpuPct >= 10 ? style.yellow(s) : s,
  },
  {
    header: "RES",
    width: 8,
    align: "right",
    get: (p) => fmtBytes(p.rssBytes),
  },
  {
    header: "COMMAND",
    width: 0, /* 0 = take remaining width */
    align: "left",
    get: (p) =>
      p.cmdline.length > 0
        ? p.cmdline.join(" ").replace(/(?:\\\s|\s)+/g, " ").trim()
        : `[${p.comm}]`,
    color: (p, s) => (p.cmdline.length === 0 ? style.dim(s) : s),
  },
];

/* ------------------------------------------------------------------ */
/* Sorting                                                             */
/* ------------------------------------------------------------------ */

const SORTS = {
  cpu: (a, b) => b.cpuPct - a.cpuPct,
  mem: (a, b) => b.rssBytes - a.rssBytes,
  pid: (a, b) => a.pid - b.pid,
};

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

function fmtBytes(n) {
  if (!n) return "0";
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(1)}G`;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}M`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)}K`;
  return `${n}B`;
}

function pad(s, n, align) {
  if (s.length >= n) return s.slice(0, n);
  const fill = " ".repeat(n - s.length);
  return align === "right" ? fill + s : s + fill;
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

function termSize() {
  try {
    return tty.size();
  } catch {
    return { rows: 24, cols: 100 };
  }
}

function resolveColumnWidths(totalCols) {
  /* Fixed columns + single spaces between them; remainder goes to the
   * lone width:0 (flex) column. */
  const gaps = COLUMNS.length - 1;
  let fixed = gaps;
  for (const c of COLUMNS) if (c.width > 0) fixed += c.width;
  const flex = Math.max(10, totalCols - fixed);
  return COLUMNS.map((c) => (c.width > 0 ? c.width : flex));
}

function renderHeader(widths) {
  const cells = COLUMNS.map((c, i) => pad(c.header, widths[i], c.align));
  return style.bold(style.reversed(cells.join(" ")));
}

function renderRow(p, widths) {
  const cells = COLUMNS.map((c, i) => {
    const raw = c.get(p);
    const padded = pad(raw, widths[i], c.align);
    return c.color ? c.color(p, padded) : padded;
  });
  return cells.join(" ");
}

function summary(pids) {
  const total = pids.length;
  const running = pids.filter((p) => p.cpuPct > 0).length;
  const totCpu = pids.reduce((s, p) => s + p.cpuPct, 0);
  const totMem = pids.reduce((s, p) => s + p.rssBytes, 0);
  return (
    `${style.bold("proctop")}  ` +
    style.dim(
      `${total} procs · ${running} active · ` +
        `${totCpu.toFixed(1)}% cpu · ${fmtBytes(totMem)} rss · ` +
        `sort=${sortKey} · ${new Date().toISOString().slice(11, 19)}`,
    )
  );
}

function renderFrame(pids, size) {
  const widths = resolveColumnWidths(size.cols);
  const sortFn = SORTS[sortKey] ?? SORTS.cpu;
  const sorted = pids.slice().sort(sortFn);
  const maxRows = rowOverride ?? Math.max(5, size.rows - 3);

  const out = [summary(pids), renderHeader(widths)];
  for (const p of sorted.slice(0, maxRows)) out.push(renderRow(p, widths));
  return out;
}

/* ------------------------------------------------------------------ */
/* Entry                                                               */
/* ------------------------------------------------------------------ */

if (once) {
  /* Wait for one tick, print, exit. */
  const handle = watch({ intervalMs }, (ev) => {
    if (ev.kind === "error") {
      console.error(`proctop: ${ev.error}`);
      handle.stop();
      yeet.exit();
      return;
    }
    if (ev.kind !== "tick") return;
    for (const line of renderFrame(ev.pids, termSize())) console.log(line);
    handle.stop();
    yeet.exit();
  });
} else {
  let hasTty = true;
  try { tty.write(""); } catch { hasTty = false; }
  if (!hasTty) {
    console.error("proctop: live mode needs a PTY. Use --once or dump.js.");
    yeet.exit();
  }

  tty.alt();
  tty.hideCursor();
  tty.clear();

  const CURSOR_HOME = "\x1b[H";
  const ERASE_TO_EOL = "\x1b[K";
  const ERASE_TO_EOS = "\x1b[J";
  let lastLineCount = 0;

  function paint(lines) {
    let buf = CURSOR_HOME;
    for (const line of lines) buf += line + ERASE_TO_EOL + "\n";
    if (lines.length < lastLineCount) buf += ERASE_TO_EOS;
    tty.write(buf);
    lastLineCount = lines.length;
  }

  watch({ intervalMs }, (ev) => {
    if (ev.kind === "error") {
      paint([style.red(`error: ${ev.error}`)]);
      return;
    }
    if (ev.kind !== "tick") return;
    paint(renderFrame(ev.pids, termSize()));
  });
}
