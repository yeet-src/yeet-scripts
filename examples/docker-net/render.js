// docker-net / render.js
//
// Spatial view of docker networking: an outer HOST box contains every
// host-network-mode container plus a sub-box for each bridge network
// living on the host; isolated (`--network=none`) containers render as
// a separate ISOLATED box outside the host (since they have their own
// netns and can't reach anything).
//
// Modes:
//   --once       print one snapshot to stdout and exit (pipe-safe)
//   (default)    live: redraw in alt-screen on each interval
//
// Other flags:
//   --interval 2000   poll cadence (ms) for live mode
//   --width <n>       force outer width (default: terminal width or 100)
//
// Usage:
//   yeet run examples/docker-net/render.js --once
//   yeet run examples/docker-net/render.js --interval 1000

import { watch, snapshot } from "./data.js";

const intervalMs = Number(yeet.args.interval) || 2000;
const once = yeet.args.once === true;
const widthOverride = Number(yeet.args.width) || null;

/* ------------------------------------------------------------------ */
/* ANSI-aware string utilities                                         */
/* ------------------------------------------------------------------ */

const ANSI_RE = /\x1b\[[0-9;]*m/g;

const visibleLen = (s) => s.replace(ANSI_RE, "").length;

function truncateVisible(s, n) {
  let out = "";
  let visible = 0;
  let i = 0;
  while (i < s.length && visible < n) {
    if (s[i] === "\x1b" && s[i + 1] === "[") {
      const end = s.indexOf("m", i);
      if (end < 0) break;
      out += s.slice(i, end + 1);
      i = end + 1;
    } else {
      out += s[i++];
      visible++;
    }
  }
  return out;
}

function padRight(s, n) {
  const len = visibleLen(s);
  if (len >= n) return truncateVisible(s, n);
  return s + " ".repeat(n - len);
}

/* ------------------------------------------------------------------ */
/* Box drawing                                                         */
/* ------------------------------------------------------------------ */

const SINGLE = { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│" };
const DOUBLE = { tl: "╔", tr: "╗", bl: "╚", br: "╝", h: "═", v: "║" };

/* Wrap content lines in a titled box of given inner width.
 * `lines`: array of strings (may contain ANSI codes).
 * `title`: short label rendered into the top border.
 * Returns a new array of lines representing the boxed content. */
function box({ title, lines, color, double = false, innerWidth }) {
  const c = double ? DOUBLE : SINGLE;
  const paint = color ?? ((x) => x);

  const titleSegment = title ? ` ${title} ` : "";
  const titleVisible = visibleLen(titleSegment);
  const dashesAfterTitle = Math.max(0, innerWidth - 2 - titleVisible);
  const top =
    paint(`${c.tl}${c.h}${c.h}`) +
    paint(titleSegment) +
    paint(c.h.repeat(dashesAfterTitle)) +
    paint(c.tr);

  const bottom = paint(c.bl + c.h.repeat(innerWidth) + c.br);

  const out = [top];
  for (const line of lines) {
    /* Each interior line: vertical bar + 1 space pad + content padded
     * to (innerWidth - 2) + 1 space pad + vertical bar. */
    const content = padRight(line, innerWidth - 2);
    out.push(paint(c.v) + " " + content + " " + paint(c.v));
  }
  out.push(bottom);
  return out;
}

/* ------------------------------------------------------------------ */
/* Container rendering                                                 */
/* ------------------------------------------------------------------ */

const STATE_COLOR = {
  RUNNING: style.green,
  RESTARTING: style.yellow,
  PAUSED: style.yellow,
  CREATED: style.cyan,
  EXITED: style.red,
  DEAD: style.red,
  REMOVING: style.dim,
  EMPTY: style.dim,
};

const stateGlyph = (s) => (STATE_COLOR[s] ?? ((x) => x))("●");

const ts = (t = Date.now()) =>
  new Date(t).toISOString().replace("T", " ").slice(0, 19);

function fmtPort(p) {
  const proto = (p.proto || "TCP").toLowerCase();
  if (p.publicPort == null) return style.dim(`${p.privatePort}/${proto}`);
  if (p.exposed)
    return style.red(`${p.publicPort}→${p.privatePort}/${proto}`);
  const ipPrefix = p.ip ? `${p.ip}:` : "";
  return style.dim(`${ipPrefix}${p.publicPort}→${p.privatePort}/${proto}`);
}

function uniqPortStrings(c) {
  const seen = new Set();
  const out = [];
  for (const p of c.ports) {
    const s = fmtPort(p);
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function fmtBytes(n) {
  if (n == null) return "--";
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(1)}G`;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}M`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)}K`;
  return `${n}B`;
}

function fmtRate(bps) {
  if (bps == null) return "--/s";
  if (bps < 1) return "0/s";
  if (bps >= 1024 * 1024) return `${(bps / 1024 / 1024).toFixed(1)}M/s`;
  if (bps >= 1024) return `${(bps / 1024).toFixed(1)}K/s`;
  return `${Math.round(bps)}B/s`;
}

function cpuColor(pct) {
  if (pct == null) return style.dim;
  if (pct >= 80) return style.red;
  if (pct >= 40) return style.yellow;
  return style.dim;
}

function memColor(usage, limit) {
  if (usage == null || !limit) return style.dim;
  const ratio = usage / limit;
  if (ratio >= 0.85) return style.red;
  if (ratio >= 0.6) return style.yellow;
  return style.dim;
}

function statsLine(stats) {
  if (!stats) return null;

  const cpuStr =
    stats.cpuPct != null
      ? cpuColor(stats.cpuPct)(`${stats.cpuPct.toFixed(1)}%`)
      : style.dim("--%");

  const memStr = memColor(stats.memBytes, stats.memLimit)(
    fmtBytes(stats.memBytes),
  );

  const netStr = `${style.dim("↓")}${style.dim(fmtRate(stats.rxBps))} ${style.dim("↑")}${style.dim(fmtRate(stats.txBps))}`;

  return `  ${style.dim("cpu")} ${cpuStr}  ${style.dim("mem")} ${memStr}  ${netStr}`;
}

/* Render a container as a small array of inline lines (no box).
 * If `suppressAlsoOn` is true the "also on: …" annotation is omitted
 * (the renderer is drawing a connector line for this container instead). */
function containerLines(c, currentNet, suppressAlsoOn = false) {
  const head = [
    stateGlyph(c.state),
    style.bold(c.name),
    c.service && c.project
      ? style.dim(`[${c.project}.${c.service}]`)
      : c.service
        ? style.dim(`[${c.service}]`)
        : "",
    c.multiNet ? style.yellow("★") : "",
    style.dim(c.image ?? "?"),
  ]
    .filter(Boolean)
    .join(" ");

  const lines = [head];
  const ports = uniqPortStrings(c);
  if (ports.length > 0) lines.push(`  ${ports.join("  ")}`);
  const sl = statsLine(c.stats);
  if (sl) lines.push(sl);
  if (c.multiNet && !suppressAlsoOn) {
    const others = c.networks.filter((n) => n !== currentNet);
    if (others.length > 0) {
      lines.push(
        `  ${style.yellow("also on:")} ${style.dim(others.join(", "))}`,
      );
    }
  }
  return lines;
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

const SPECIAL_NETS = ["host", "none", "(no network)"];

function bridgeOrder(byNetwork) {
  const all = Object.keys(byNetwork);
  const user = all.filter((n) => !SPECIAL_NETS.includes(n)).sort();
  /* Conventionally render the default `bridge` last among user nets if
   * present (it's the catch-all). */
  const idx = user.indexOf("bridge");
  if (idx >= 0) {
    user.splice(idx, 1);
    user.push("bridge");
  }
  return user;
}

function sortContainers(arr) {
  return arr.slice().sort((a, b) => {
    if ((a.state === "RUNNING") !== (b.state === "RUNNING")) {
      return a.state === "RUNNING" ? -1 : 1;
    }
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
}

function renderModel(model, outerWidth) {
  const out = [];

  /* Header. */
  const stamp = ts();
  const cCount = model.containers.length;
  const nCount = Object.keys(model.byNetwork).length;
  out.push(
    `${style.bold("docker-net")}  ${style.dim(`${cCount} container(s) across ${nCount} network(s) — ${stamp}`)}`,
  );
  out.push(
    `${style.dim("legend:")} ${style.red("●")}${style.dim(" port public  ")}${style.dim("●")}${style.dim(" port loopback  ")}${style.yellow("★")}${style.dim(" multi-network bridge")}`,
  );
  if (model.projects) {
    const parts = Object.entries(model.projects).map(
      ([p, info]) =>
        `${style.bold(p)} ${style.dim(`[${info.services.join(", ")}]`)}`,
    );
    out.push(`${style.dim("compose:")} ${parts.join("  ·  ")}`);
  }
  out.push("");

  /* HOST box content. */
  const hostShared =
    (model.byNetwork["host"]?.containers ?? []).filter((c) =>
      c.networks.includes("host"),
    ) ?? [];

  const hostInnerLines = [];

  if (hostShared.length > 0) {
    hostInnerLines.push(
      style.dim(
        "share host's network namespace (host ports are theirs):",
      ),
    );
    for (const c of sortContainers(hostShared)) {
      for (const line of containerLines(c, "host")) {
        hostInnerLines.push("  " + line);
      }
    }
    hostInnerLines.push("");
  }

  const bridges = bridgeOrder(model.byNetwork);

  /* Pick up to 4 multi-network containers (in exactly 2 bridges) to
   * draw as connectors. Anything beyond keeps the "also on:" annotation. */
  const eligibleBridges = new Set(bridges);
  const slots = [];
  const MAX_SLOTS = 4;
  for (const c of model.containers) {
    const inBridges = c.networks.filter((n) => eligibleBridges.has(n));
    if (inBridges.length === 2 && slots.length < MAX_SLOTS) {
      slots.push({ container: c, bridges: inBridges });
    }
  }
  const channelWidth = slots.length === 0 ? 0 : slots.length + 1;
  const connectedIds = new Set(slots.map((s) => s.container.id));

  /* Sub-box width leaves room for the connector channel on the right. */
  const subInner = Math.max(20, outerWidth - 6 - channelWidth);

  if (bridges.length === 0 && hostShared.length === 0) {
    hostInnerLines.push(style.dim("(no containers attached to the host)"));
  }

  /* containerId → { net → absolute hostInnerLines row of header line } */
  const headerRows = new Map();

  for (let i = 0; i < bridges.length; i++) {
    const net = bridges[i];
    const containers = sortContainers(
      model.byNetwork[net].containers,
    );
    const bridgeLines = [];
    const offsets = []; /* {containerId, lineIdx} per container */
    for (const c of containers) {
      const cLines = containerLines(c, net, connectedIds.has(c.id));
      offsets.push({ containerId: c.id, lineIdx: bridgeLines.length });
      for (const line of cLines) bridgeLines.push(line);
      bridgeLines.push("");
    }
    /* Drop trailing blank inside box. */
    if (bridgeLines[bridgeLines.length - 1] === "") bridgeLines.pop();

    const subBoxLines = box({
      title: `${style.cyan(style.bold(net))} ${style.dim(`(${containers.length})`)}`,
      lines: bridgeLines,
      color: style.cyan,
      innerWidth: subInner,
    });
    const startRow = hostInnerLines.length;
    for (const line of subBoxLines) hostInnerLines.push(line);

    /* Header row in hostInnerLines = startRow + 1 (top border) + offset. */
    for (const o of offsets) {
      let m = headerRows.get(o.containerId);
      if (!m) {
        m = {};
        headerRows.set(o.containerId, m);
      }
      m[net] = startRow + 1 + o.lineIdx;
    }

    if (i < bridges.length - 1) hostInnerLines.push("");
  }

  /* Channel post-pass: append connector chars to each hostInner line. */
  if (channelWidth > 0) {
    const slotChars = [];
    for (let r = 0; r < hostInnerLines.length; r++) {
      slotChars.push(new Array(channelWidth).fill(" "));
    }

    const placements = [];
    for (let s = 0; s < slots.length; s++) {
      const m = headerRows.get(slots[s].container.id);
      if (!m) continue;
      const rs = slots[s].bridges
        .map((b) => m[b])
        .filter((r) => r !== undefined);
      if (rs.length !== 2) continue;
      rs.sort((a, b) => a - b);
      placements.push({ slot: s, top: rs[0], bottom: rs[1] });
    }

    /* Pass 1: verticals (intermediate rows). */
    for (const p of placements) {
      const col = p.slot + 1;
      for (let r = p.top + 1; r < p.bottom; r++) {
        if (slotChars[r][col] === " ") slotChars[r][col] = "│";
      }
    }
    /* Pass 2: stubs at top/bottom rows (only into empty cells). */
    for (const p of placements) {
      for (let c = 0; c <= p.slot; c++) {
        if (slotChars[p.top][c] === " ") slotChars[p.top][c] = "─";
        if (slotChars[p.bottom][c] === " ") slotChars[p.bottom][c] = "─";
      }
    }
    /* Pass 3: corners (always overwrite). */
    for (const p of placements) {
      const col = p.slot + 1;
      slotChars[p.top][col] = "┐";
      slotChars[p.bottom][col] = "┘";
    }

    /* Apply: pad each line to (subBox+spacing) width, then append channel. */
    const lineTarget = outerWidth - 4 - channelWidth;
    for (let r = 0; r < hostInnerLines.length; r++) {
      const padded = padRight(hostInnerLines[r], lineTarget);
      const channelStr = slotChars[r].join("");
      const styled = channelStr === " ".repeat(channelWidth)
        ? channelStr
        : style.yellow(channelStr);
      hostInnerLines[r] = padded + styled;
    }
  }

  const hostBox = box({
    title: `${style.bold(style.red("HOST"))} ${style.dim("(network namespace)")}`,
    lines: hostInnerLines,
    color: style.red,
    double: true,
    innerWidth: outerWidth - 2,
  });
  for (const line of hostBox) out.push(line);

  /* ISOLATED box (containers on `--network=none` or with no networks
   * reported) — drawn outside HOST since they have their own netns. */
  const isolated = [
    ...(model.byNetwork["none"]?.containers ?? []),
    ...(model.byNetwork["(no network)"]?.containers ?? []),
  ];
  if (isolated.length > 0) {
    out.push("");
    const innerLines = [];
    innerLines.push(
      style.dim("private netns, no connectivity to host or other containers"),
    );
    for (const c of sortContainers(isolated)) {
      for (const line of containerLines(c, "none")) {
        innerLines.push("  " + line);
      }
    }
    const isoBox = box({
      title: `${style.bold(style.yellow("ISOLATED"))} ${style.dim("(none)")}`,
      lines: innerLines,
      color: style.yellow,
      double: true,
      innerWidth: outerWidth - 2,
    });
    for (const line of isoBox) out.push(line);
  }

  return out;
}

function getOuterWidth() {
  if (widthOverride) return widthOverride;
  let cols = 100;
  try {
    cols = tty.size().cols;
  } catch {
    /* keep default */
  }
  return Math.max(40, Math.min(cols, 140));
}

/* ------------------------------------------------------------------ */
/* Entry                                                               */
/* ------------------------------------------------------------------ */

if (once) {
  snapshot()
    .then((model) => {
      const w = getOuterWidth();
      for (const line of renderModel(model, w)) console.log(line);
    })
    .catch((e) => {
      console.error(`docker-net: ${e?.message ?? e}`);
    });
} else {
  try {
    tty.write("");
  } catch {
    console.error(
      "docker-net/render.js needs a PTY in live mode. Use --once or dump.js.",
    );
    yeet.exit();
  }

  tty.alt();
  tty.hideCursor();
  tty.clear();

  /* Flicker-free repaint:
   * - Build the whole frame as one string (cursor-home, content, erase-
   *   to-end-of-line per row).
   * - If the new frame is shorter than the previous one, erase from the
   *   cursor to end of screen so trailing leftovers are wiped.
   * - Send it all in a single tty.write — the terminal swaps the frame
   *   atomically, no blank intermediate. */
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
    if (ev.kind !== "snapshot") return;
    const w = getOuterWidth();
    paint(renderModel(ev.model, w));
  });
}
