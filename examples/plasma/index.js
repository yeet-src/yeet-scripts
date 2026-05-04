#!/usr/bin/env -S yeet run
//
// PLASMA — animated sine-wave plasma using truecolor.
//
// Each cell's color is a function of its (x, y, t) coords through a
// few combined sines. The result is a smooth flowing organic gradient
// that morphs over time. We use ▀ (upper half block) so each terminal
// row encodes two pixel rows of color, doubling vertical resolution.

const { interval = 50 } = yeet.args;

const ESC = "\x1b[";

let { rows, cols } = tty.size();

// HSV-ish to RGB approximation
function rgb(h, s, v) {
  h = (h % 1 + 1) % 1;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r, g, b;
  switch (i) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    default: r = v; g = p; b = q;
  }
  return [
    Math.round(r * 255),
    Math.round(g * 255),
    Math.round(b * 255),
  ];
}

function plasma(x, y, t) {
  const v =
    Math.sin(x / 10 + t) +
    Math.sin(y / 8 - t * 1.3) +
    Math.sin((x + y) / 14 + t * 0.7) +
    Math.sin(Math.hypot(x - cols / 2, y - rows / 2) / 6 - t);
  return (v + 4) / 8; // normalize to 0..1
}

let t = 0;

function tick() {
  // re-read terminal size each frame so we adapt to resizes
  ({ rows, cols } = tty.size());
  let frame = `${ESC}H`;
  for (let cy = 0; cy < rows; cy++) {
    // each terminal row encodes 2 plasma pixel rows via the ▀ glyph
    const py0 = cy * 2;
    const py1 = cy * 2 + 1;
    let line = "";
    for (let cx = 0; cx < cols; cx++) {
      const top = plasma(cx, py0, t);
      const bot = plasma(cx, py1, t);
      const [tr, tg, tb] = rgb(top, 0.85, 0.95);
      const [br, bg, bb] = rgb(bot, 0.85, 0.95);
      // foreground = top half, background = bottom half
      line += `\x1b[38;2;${tr};${tg};${tb}m\x1b[48;2;${br};${bg};${bb}m▀`;
    }
    frame += line + "\x1b[0m";
    if (cy + 1 < rows) frame += "\n";
  }
  tty.write(frame);
  t += 0.06;
}

tty.alt();
tty.hideCursor();
tty.title("plasma");
tty.clear();
setInterval(tick, interval);
