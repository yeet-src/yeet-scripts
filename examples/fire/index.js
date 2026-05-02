#!/usr/bin/env -S yeet run
//
// FIRE — Fabien Sanglard's classic doom-style flame effect.
//
// We keep a buffer of "intensity" values. The bottom row is hot, fixed
// at max. Every frame each pixel cools by a small random amount and is
// pulled from one of the three pixels below it (with horizontal spread).
// Renders with truecolor and ▀ for double vertical density.

const { interval = 50 } = yeet.args;

const ESC = "\x1b[";

let { rows, cols } = tty.size();

// Internal buffer is double the row height so ▀ pairs up nicely.
let H = rows * 2;
let W = cols;
let buf = new Uint8Array(H * W);

// 32-step palette: black → red → orange → yellow → white
const PALETTE = [];
for (let i = 0; i < 32; i++) {
  let r, g, b;
  if (i < 8) { r = i * 32; g = 0; b = 0; }
  else if (i < 16) { r = 255; g = (i - 8) * 32; b = 0; }
  else if (i < 24) { r = 255; g = 255; b = (i - 16) * 32; }
  else { r = 255; g = 255; b = 200 + (i - 24) * 7; }
  PALETTE.push([r, g, b]);
}

function seedBottom() {
  for (let x = 0; x < W; x++) buf[(H - 1) * W + x] = 31;
}

function step() {
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W; x++) {
      const src = (y + 1) * W + x + (Math.floor(Math.random() * 3) - 1);
      if (src < 0 || src >= H * W) continue;
      const cool = Math.floor(Math.random() * 3);
      const v = buf[src] - cool;
      buf[y * W + x] = v < 0 ? 0 : v;
    }
  }
}

function tick() {
  const sz = tty.size();
  if (sz.rows !== rows || sz.cols !== cols) {
    rows = sz.rows; cols = sz.cols;
    H = rows * 2;
    W = cols;
    buf = new Uint8Array(H * W);
    tty.clear();
  }
  seedBottom();
  step();
  let frame = `${ESC}H`;
  for (let r = 0; r < rows; r++) {
    let line = "";
    for (let c = 0; c < cols; c++) {
      const top = PALETTE[buf[r * 2 * W + c]];
      const bot = PALETTE[buf[(r * 2 + 1) * W + c]];
      line += `\x1b[38;2;${top[0]};${top[1]};${top[2]}m`;
      line += `\x1b[48;2;${bot[0]};${bot[1]};${bot[2]}m▀`;
    }
    frame += line + "\x1b[0m";
    if (r + 1 < rows) frame += "\n";
  }
  tty.write(frame);
}

tty.alt();
tty.hideCursor();
tty.title("fire");
tty.clear();
setInterval(tick, interval);
