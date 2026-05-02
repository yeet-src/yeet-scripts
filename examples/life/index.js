#!/usr/bin/env -S yeet run
//
// LIFE — Conway's Game of Life with double-buffered braille rendering.
//
// Each terminal cell is a 2x4 braille "pixel grid", giving us 8x density
// vs char-based rendering. Cells age — newer cells glow bright, older
// cells fade to deep cyan. When the grid stagnates we reseed.

const { interval = 80, density = 0.32 } = yeet.args;

const ESC = "\x1b[";
const move = (r, c) => `${ESC}${r + 1};${c + 1}H`;

let { rows, cols } = tty.size();

// Braille grid: 2x4 sub-cells per terminal char
let BW = cols * 2;
let BH = rows * 4;
let grid = new Uint8Array(BW * BH);
let next = new Uint8Array(BW * BH);
let age = new Uint8Array(BW * BH);

const at = (x, y) => grid[((y + BH) % BH) * BW + ((x + BW) % BW)];

function seed() {
  for (let i = 0; i < grid.length; i++) {
    grid[i] = Math.random() < density ? 1 : 0;
    age[i] = grid[i] ? 1 : 0;
  }
}
seed();

let stagnantTicks = 0;
let lastPop = 0;

function step() {
  for (let y = 0; y < BH; y++) {
    for (let x = 0; x < BW; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (dx || dy) n += at(x + dx, y + dy);
      const i = y * BW + x;
      const alive = grid[i];
      const live = alive ? n === 2 || n === 3 : n === 3;
      next[i] = live ? 1 : 0;
      if (live) age[i] = alive ? Math.min(age[i] + 1, 60) : 1;
      else age[i] = 0;
    }
  }
  [grid, next] = [next, grid];

  let pop = 0;
  for (let i = 0; i < grid.length; i++) pop += grid[i];
  if (Math.abs(pop - lastPop) < 3) stagnantTicks++;
  else stagnantTicks = 0;
  lastPop = pop;
  if (stagnantTicks > 60 || pop < 4) { seed(); stagnantTicks = 0; }
}

// braille dot offsets (col 0/1, row 0/1/2/3) → bit position in the 8-dot pattern
const BRAILLE_BITS = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
];

function tick() {
  const sz = tty.size();
  if (sz.rows !== rows || sz.cols !== cols) {
    rows = sz.rows; cols = sz.cols;
    BW = cols * 2;
    BH = rows * 4;
    grid = new Uint8Array(BW * BH);
    next = new Uint8Array(BW * BH);
    age = new Uint8Array(BW * BH);
    seed();
    tty.clear();
  }
  step();
  let frame = `${ESC}H`;
  for (let cy = 0; cy < rows; cy++) {
    let line = "";
    for (let cx = 0; cx < cols; cx++) {
      let bits = 0;
      let maxAge = 0;
      let any = 0;
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const x = cx * 2 + dx, y = cy * 4 + dy;
          if (grid[y * BW + x]) {
            bits |= BRAILLE_BITS[dy][dx];
            any = 1;
            const a = age[y * BW + x];
            if (a > maxAge) maxAge = a;
          }
        }
      }
      if (!any) { line += " "; continue; }
      // young → bright cyan/white; old → deep cyan
      const color =
        maxAge < 3 ? 231 :
        maxAge < 8 ? 51 :
        maxAge < 15 ? 45 :
        maxAge < 30 ? 39 : 33;
      line += `\x1b[38;5;${color}m${String.fromCharCode(0x2800 + bits)}`;
    }
    frame += line + "\x1b[0m";
    if (cy + 1 < rows) frame += "\n";
  }
  tty.write(frame);
}

tty.alt();
tty.hideCursor();
tty.title("life");
tty.clear();
setInterval(tick, interval);
