#!/usr/bin/env -S yeet run
//
// STARFIELD — warp-speed 3D stars flying past you.
//
// Each star has (x, y, z) coords. Per tick, z decreases (closer to camera);
// projected screen position grows outward, brightness/glyph density scales
// with proximity. When z hits zero, the star respawns at the back.

const { interval = 33, count = 240 } = yeet.args;

const ESC = "\x1b[";
const move = (r, c) => `${ESC}${r + 1};${c + 1}H`;

let { rows, cols } = tty.size();
let cx = cols / 2, cy = rows / 2;

const FAR = 200;
const stars = [];

function spawn(s) {
  s.x = (Math.random() - 0.5) * 2 * FAR;
  s.y = (Math.random() - 0.5) * 2 * FAR;
  s.z = FAR;
}

for (let i = 0; i < count; i++) {
  const s = {};
  spawn(s);
  s.z = Math.random() * FAR;
  stars.push(s);
}

let prev = []; // [{r, c}] cells we drew last frame, to erase

function tick() {
  const sz = tty.size();
  if (sz.rows !== rows || sz.cols !== cols) {
    rows = sz.rows; cols = sz.cols;
    cx = cols / 2; cy = rows / 2;
    prev = [];
    tty.clear();
  }
  let frame = "";
  // erase last frame
  for (const p of prev) frame += move(p.r, p.c) + " ";
  prev = [];

  for (const s of stars) {
    s.z -= 2.2;
    if (s.z <= 1) { spawn(s); continue; }
    const k = 50 / s.z;
    const x = cx + s.x * k;
    const y = cy + s.y * k * 0.5;
    if (x < 0 || x >= cols || y < 0 || y >= rows) {
      spawn(s);
      continue;
    }
    const r = Math.floor(y), c = Math.floor(x);
    const closeness = 1 - s.z / FAR; // 0..1
    const glyph =
      closeness > 0.85 ? "✦" :
      closeness > 0.65 ? "✶" :
      closeness > 0.4  ? "•" :
      closeness > 0.2  ? "·" : ".";
    const color =
      closeness > 0.85 ? 231 :
      closeness > 0.65 ? 195 :
      closeness > 0.4  ? 153 :
      closeness > 0.2  ? 109 : 60;
    frame += `${move(r, c)}\x1b[38;5;${color}m${glyph}\x1b[0m`;
    prev.push({ r, c });
  }
  tty.write(frame);
}

tty.alt();
tty.hideCursor();
tty.title("starfield");
tty.clear();
setInterval(tick, interval);
