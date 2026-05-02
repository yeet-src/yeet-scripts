#!/usr/bin/env -S yeet run
//
// MATRIX — the classic falling green code rain.
//
// Each column is a "drop" with a leading bright glyph trailing into
// fading green. Drops respawn at random intervals when they fall off
// the bottom, so the rain stays organic.

const { interval = 50 } = yeet.args;

const CHARS =
  "ｦｱｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜ" +
  "0123456789!@#$%^&*()_+-=[]{};:,.<>/?";

const pick = () => CHARS[Math.floor(Math.random() * CHARS.length)];

const ESC = "\x1b[";
const move = (r, c) => `${ESC}${r + 1};${c + 1}H`;
const HOME = `${ESC}H`;

let { rows, cols } = tty.size();
let drops = []; // { col, head, tail, speed }

function spawn(col) {
  const tail = 6 + Math.floor(Math.random() * Math.min(rows - 4, 18));
  return {
    col,
    head: -Math.floor(Math.random() * rows),
    tail,
    speed: 0.4 + Math.random() * 1.2,
  };
}

function init() {
  drops = [];
  for (let c = 0; c < cols; c++) {
    if (Math.random() < 0.6) drops.push(spawn(c));
  }
}

function tick() {
  const sz = tty.size();
  if (sz.rows !== rows || sz.cols !== cols) {
    rows = sz.rows; cols = sz.cols;
    tty.clear();
    init();
  }
  let frame = "";
  // Erase by overwriting trailing cells with space — cheaper than clearing.
  for (const d of drops) {
    const head = Math.floor(d.head);
    // tail-end cell gets erased (the one that just left the trail)
    const tailEnd = head - d.tail;
    if (tailEnd >= 0 && tailEnd < rows) {
      frame += move(tailEnd, d.col) + " ";
    }
    // trail
    for (let i = 1; i < d.tail; i++) {
      const r = head - i;
      if (r < 0 || r >= rows) continue;
      const fade = i / d.tail;
      const ch = pick();
      // green gradient: 46 → 22 → 235
      const color = fade < 0.25 ? 46 : fade < 0.55 ? 40 : fade < 0.8 ? 22 : 235;
      frame += `${move(r, d.col)}\x1b[38;5;${color}m${ch}\x1b[0m`;
    }
    // bright head
    if (head >= 0 && head < rows) {
      frame += `${move(head, d.col)}\x1b[38;5;231;1m${pick()}\x1b[0m`;
    }
    d.head += d.speed;
    if (head - d.tail > rows) {
      // respawn this drop somewhere up top
      Object.assign(d, spawn(d.col));
    }
  }
  // occasionally add a new drop
  if (drops.length < cols && Math.random() < 0.08) {
    drops.push(spawn(Math.floor(Math.random() * cols)));
  }
  tty.write(frame);
}

tty.alt();
tty.hideCursor();
tty.title("matrix");
tty.clear();
init();
setInterval(tick, interval);
