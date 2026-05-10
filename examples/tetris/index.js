#!/usr/bin/env -S yeet run
//
// TETRIS: runs multiple auto-playing games with a beam-search AI.
//
// Independent games run in parallel, with visible piece drops.
// Border color reflects danger level, and Tetris clears flash.
// Each game shows stats for lines, pieces, holes, and height.
//
// Flags:
//   --interval 200   ms between piece placements (default: 200)
//   --games 6        number of simultaneous games (default: 6, max 12)
//   --drop 15        ms per row during drop animation (default: 15)

import {
  ROWS, COLS, PIECE_DEFS,
  newBoard, getBit, setBit, popcountu32,
  colHeight, boardHeight, isLost, pieceWidth,
  findLandingRow, makeBag, findBest,
} from './data.js';

const { interval = 100, drop = 5 } = yeet.args;
const NUM_GAMES = Math.min(Number(yeet.args.games) || 6, 12);

function makeColorGrid() {
  const g = [];
  for (let c = 0; c < COLS; c++) g.push(new Array(32).fill(-1));
  return g;
}


function lockPiece(board, grid, p, r, col, landRow) {
  const cells = PIECE_DEFS[p][r % PIECE_DEFS[p].length];
  for (const [cr, cc] of cells) {
    setBit(board, col + cc, landRow + cr);
    grid[col + cc][landRow + cr] = p;
  }
}

function clearWithColor(board, grid) {
  let cleared = 0;
  for (;;) {
    let mask = 0xFFFFFFFF;
    for (let c = 0; c < COLS; c++) mask &= board[c];
    if (mask === 0) break;
    const bit = mask & (-mask);
    const pos = 31 - Math.clz32(bit);
    for (let c = 0; c < COLS; c++) {
      const lo = board[c] & (bit - 1);
      const hi = (board[c] >> (pos + 1)) << pos;
      board[c] = lo | hi;
      for (let r = pos; r < 31; r++) grid[c][r] = grid[c][r + 1];
      grid[c][31] = -1;
    }
    cleared++;
  }
  return cleared;
}

// 0-999, 1.0k-9.9k, 10k-999k, 1.0m-999m
function fmt(n) {
  if (n >= 100000000) return Math.floor(n / 1000000) + 'm';
  if (n >= 10000000) return Math.floor(n / 1000000) + 'm';
  if (n >= 1000000) return (n / 1000000).toFixed(1).slice(0, 3) + 'm';
  if (n >= 100000) return Math.floor(n / 1000) + 'k';
  if (n >= 10000) return Math.floor(n / 1000) + 'k';
  if (n >= 1000) return (n / 1000).toFixed(1).slice(0, 3) + 'k';
  return String(n);
}

function countHoles(board) {
  let holes = 0;
  for (let c = 0; c < COLS; c++) {
    const h = colHeight(board, c);
    holes += h - popcountu32(board[c]);
  }
  return holes;
}

const FG = [
  style.brightYellow, style.brightCyan, style.brightGreen,
  style.brightRed, style.brightMagenta, style.brightYellow, style.brightBlue,
];
const BG = [
  style.bgYellow, style.bgCyan, style.bgGreen,
  style.bgRed, style.bgMagenta, style.bgYellow, style.bgBlue,
];

// Threat level -> border color
function threatColor(board) {
  const h = boardHeight(board);
  const ratio = h / ROWS;
  if (ratio >= 0.75) return style.brightRed;
  if (ratio >= 0.5) return style.brightYellow;
  if (ratio >= 0.25) return style.brightGreen;
  return style.brightBlack;
}

function makeGame() {
  const bag = makeBag();
  return {
    board: newBoard(),
    grid: makeColorGrid(),
    bag,
    current: bag.pop(),
    lines: 0,
    pieces: 0,
    losses: 0,
    state: 'planning',
    dropPiece: -1,
    dropRot: 0,
    dropCol: 0,
    dropRow: ROWS,
    dropTarget: 0,
    lastDrop: 0,
    flashRows: 0,
    flashStart: 0,
    flashDuration: 150,
    lastClear: 0,
    tetrisFlashEnd: 0,
  };
}

function nextPiece(g) {
  if (g.bag.length === 0) g.bag = makeBag();
  return g.bag.pop();
}

function planDrop(g) {
  if (isLost(g.board)) {
    g.losses++;
    g.board = newBoard();
    g.grid = makeColorGrid();
    g.bag = makeBag();
    g.current = nextPiece(g);
    g.lines = 0;
    g.pieces = 0;
  }
  const knownNext = g.bag.length > 0 ? g.bag[g.bag.length - 1] : -1;
  const { rot, col } = findBest(g.board, g.current, knownNext);
  const target = findLandingRow(g.board, g.current, rot, col);
  g.dropPiece = g.current;
  g.dropRot = rot;
  g.dropCol = col;
  g.dropTarget = target;
  g.dropRow = ROWS;
  g.state = 'dropping';
  g.lastDrop = Date.now();
}

function findFilledRowMask(board) {
  let filled = 0xFFFFFFFF;
  for (let c = 0; c < COLS; c++) filled &= board[c];
  return filled;
}

function tickDrop(g, now) {
  if (g.state === 'dropping') {
    if (now - g.lastDrop < drop) return;
    g.lastDrop = now;
    g.dropRow--;
    if (g.dropRow <= g.dropTarget) {
      lockPiece(g.board, g.grid, g.dropPiece, g.dropRot, g.dropCol, g.dropTarget);
      g.pieces++;
      const filled = findFilledRowMask(g.board);
      if (filled !== 0) {
        g.flashRows = filled;
        g.flashStart = now;
        g.lastClear = popcountu32(filled);
        g.state = 'flashing';
      } else {
        g.lastClear = 0;
        g.current = nextPiece(g);
        g.state = 'planning';
      }
    }
  } else if (g.state === 'flashing') {
    if (now - g.flashStart >= g.flashDuration) {
      const cleared = clearWithColor(g.board, g.grid);
      g.lines += cleared;
      if (cleared >= 4) { // Tetris (4-line clear :O)
        g.tetrisFlashEnd = now + 500;
      }
      g.flashRows = 0;
      g.current = nextPiece(g);
      g.state = 'planning';
    }
  }
}

const games = [];
for (let i = 0; i < NUM_GAMES; i++) games.push(makeGame());

// Stagger games for concurrent play appearance
for (let i = 0; i < NUM_GAMES; i++) {
  const g = games[i];
  for (let j = 0; j < i * 3; j++) {
    const knownNext = g.bag.length > 0 ? g.bag[g.bag.length - 1] : -1;
    const { rot, col } = findBest(g.board, g.current, knownNext);
    const target = findLandingRow(g.board, g.current, rot, col);
    if (target >= 0) lockPiece(g.board, g.grid, g.current, rot, col, target);
    clearWithColor(g.board, g.grid);
    g.pieces++;
    g.current = nextPiece(g);
  }
}

let tick = 0;

function isDropCell(g, col, row) {
  if (g.state !== 'dropping') return -1;
  const cells = PIECE_DEFS[g.dropPiece][g.dropRot % PIECE_DEFS[g.dropPiece].length];
  for (const [cr, cc] of cells) {
    if (g.dropCol + cc === col && g.dropRow + cr === row) return g.dropPiece;
  }
  return -1;
}

function renderBoard(g, sx, sy, now) {
  const bRows = Math.ceil(ROWS / 2);
  const h = boardHeight(g.board);
  const holes = countHoles(g.board);

  // Border color based on threat + tetris flash
  let borderFn;
  if (now < g.tetrisFlashEnd && (Math.floor((now - (g.tetrisFlashEnd - 500)) / 60) % 2 === 0)) {
    borderFn = style.brightWhite;
  } else {
    borderFn = threatColor(g.board);
  }

  // Top border
  tty.move(sy, sx);
  tty.write(borderFn('┌' + '─'.repeat(COLS) + '┐'));

  for (let ty = 0; ty < bRows; ty++) {
    const topRow = ROWS - 1 - ty * 2;
    const botRow = ROWS - 2 - ty * 2;
    tty.move(sy + 1 + ty, sx);
    let line = borderFn('│');

    const tFlash = g.state === 'flashing' && topRow >= 0 && ((g.flashRows >> topRow) & 1);
    const bFlash = g.state === 'flashing' && botRow >= 0 && ((g.flashRows >> botRow) & 1);
    const flashOn = g.state === 'flashing' && (Math.floor((now - g.flashStart) / 40) % 2 === 0);

    for (let c = 0; c < COLS; c++) {
      const tBoard = topRow >= 0 && topRow < 32 && getBit(g.board, c, topRow);
      const bBoard = botRow >= 0 && botRow < 32 && getBit(g.board, c, botRow);
      const tDrop = isDropCell(g, c, topRow);
      const bDrop = isDropCell(g, c, botRow);

      const tF = tBoard || tDrop >= 0;
      const bF = bBoard || bDrop >= 0;
      let tI = tDrop >= 0 ? tDrop : (tBoard ? g.grid[c][topRow] : -1);
      let bI = bDrop >= 0 ? bDrop : (bBoard ? g.grid[c][botRow] : -1);

      if (tFlash && flashOn && tBoard) tI = 7;
      if (bFlash && flashOn && bBoard) bI = 7;

      const fgFn = (i) => i === 7 ? style.brightWhite : (i >= 0 ? FG[i] : style.black);
      const bgFn = (i) => i === 7 ? style.bgWhite : (i >= 0 ? BG[i] : style.bgBlack);

      if (tF && bF) {
        line += bgFn(bI)(fgFn(tI)('▀'));
      } else if (tF) {
        line += fgFn(tI)('▀');
      } else if (bF) {
        line += fgFn(bI)('▄');
      } else {
        line += ' ';
      }
    }
    line += borderFn('│');
    tty.write(line);
  }

  // Bottom border
  tty.move(sy + 1 + bRows, sx);
  tty.write(borderFn('└' + '─'.repeat(COLS) + '┘'));

  // Stats - always fit within board width
  const W = COLS + 2;
  const hColor = h >= 15 ? style.brightRed : h >= 10 ? style.brightYellow : style.brightWhite;
  const hoColor = holes > 4 ? style.brightRed : holes > 1 ? style.brightYellow : style.brightWhite;

  function row(label, val, colorFn) {
    const s = label + ':' + fmt(val);
    return colorFn(s) + ' '.repeat(Math.max(0, W - s.length));
  }

  tty.move(sy + 2 + bRows, sx);
  tty.write(row('P', g.pieces, style.brightCyan));
  tty.move(sy + 3 + bRows, sx);
  tty.write(row('L', g.lines, style.brightGreen));
  tty.move(sy + 4 + bRows, sx);
  tty.write(row('H', h, hColor));
  tty.move(sy + 5 + bRows, sx);
  tty.write(row('\u2B21', holes, hoColor));
  tty.move(sy + 6 + bRows, sx);
  tty.write(row('D', g.losses, style.brightRed));
}

function render() {
  tick++;
  const now = Date.now();
  const { rows: tR, cols: tC } = tty.size();

  const bRows = Math.ceil(ROWS / 2);
  const cellW = COLS + 2;
  const cellH = bRows + 7;  // board + borders + 5 stat rows
  const gap = 1;

  const maxGridCols = Math.max(1, Math.floor((tC + gap) / (cellW + gap)));
  const gridCols = Math.min(maxGridCols, NUM_GAMES);
  const gridRows = Math.ceil(NUM_GAMES / gridCols);

  const totalW = gridCols * cellW + (gridCols - 1) * gap;
  const totalH = gridRows * cellH + (gridRows - 1) * gap;
  const ox = Math.max(0, Math.floor((tC - totalW) / 2));
  const oy = Math.max(0, Math.floor((tR - totalH - 2) / 2));

  tty.frame(() => {
    for (let i = 0; i < NUM_GAMES; i++) {
      const gc = i % gridCols;
      const gr = Math.floor(i / gridCols);
      const sx = ox + gc * (cellW + gap);
      const sy = oy + gr * (cellH + gap);
      if (sy + cellH <= tR && sx + cellW <= tC) {
        renderBoard(games[i], sx, sy, now);
      }
    }

    // Global stats
    const statsY = oy + totalH + 1;
    if (statsY < tR) {
      let tLines = 0, tPieces = 0, tLosses = 0;
      for (const g of games) {
        tLines += g.lines;
        tPieces += g.pieces;
        tLosses += g.losses;
      }
      tty.move(statsY, ox);
      const spin = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
      tty.write(
        style.brightGreen('auto-play:on') +
        style.brightBlack('  ') +
        style.brightBlack(spin[Math.floor(tick / 3) % spin.length] + ' ') +
        style.bold(style.brightWhite(String(NUM_GAMES))) +
        style.brightBlack(' games  ') +
        style.brightCyan('P:' + fmt(tPieces)) +
        style.brightBlack('  ') +
        style.brightGreen('L:' + fmt(tLines)) +
        style.brightBlack('  ') +
        style.brightRed('D:' + fmt(tLosses)) +
        '\x1b[K'
      );
    }
  });
}

tty.alt();
tty.hideCursor();
tty.clear();

let lastPlan = 0;

// Game loop
setInterval(() => {
  const now = Date.now();

  if (now - lastPlan > interval) {
    let anyPlanned = false;
    for (let i = 0; i < NUM_GAMES; i++) {
      if (games[i].state === 'planning') {
        planDrop(games[i]);
        anyPlanned = true;
      }
    }
    if (anyPlanned) lastPlan = now;
  }

  for (let i = 0; i < NUM_GAMES; i++) {
    tickDrop(games[i], now);
  }

  render();
}, 33);
