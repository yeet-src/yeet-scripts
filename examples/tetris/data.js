// Pure game logic and AI. Column-major board (array of COLS u32s, bit 0 = bottom row) +
// 7-bag randomizer + greedy beam search with 1-ply lookahead
//
// Column-major representation with u32 bitmask columns + Fisher-Yates 7-bag piece selection

export const ROWS = 20;
export const COLS = 10;

export function newBoard() { return new Array(COLS).fill(0); }
export function cloneBoard(b) { return b.slice(); }
export function getBit(board, col, row) { return (board[col] >> row) & 1; }
export function setBit(board, col, row) { board[col] |= (1 << row); }
export function colHeight(board, c) { return 32 - Math.clz32(board[c]); }

export function boardHeight(board) {
  let h = 0;
  for (let c = 0; c < COLS; c++) {
    const ch = 32 - Math.clz32(board[c]);
    if (ch > h) h = ch;
  }
  return h;
}

export function isLost(board) { return boardHeight(board) > ROWS; }

export function popcountu32(x) {
  x = x - ((x >> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  return (((x + (x >> 4)) & 0x0F0F0F0F) * 0x01010101) >> 24;
}

export function clearFilledRows(board) {
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
    }
    cleared++;
  }
  return cleared;
}

// Each piece has an array of rotations. Each rotation is an array of
// [row, col] offsets where row 0 = bottom of the piece bounding box.
// Piece order: O=0, I=1, S=2, Z=3, T=4, L=5, J=6
export const PIECE_DEFS = [
  // O - 1 rotation
  [[[0,0],[0,1],[1,0],[1,1]]],
  // I - 2 rotations
  [[[0,0],[0,1],[0,2],[0,3]], [[0,0],[1,0],[2,0],[3,0]]],
  // S - 2 rotations
  [[[0,0],[0,1],[1,1],[1,2]], [[0,1],[1,0],[1,1],[2,0]]],
  // Z - 2 rotations
  [[[0,1],[0,2],[1,0],[1,1]], [[0,0],[1,0],[1,1],[2,1]]],
  // T - 4 rotations
  [[[0,0],[0,1],[0,2],[1,1]], [[0,0],[1,0],[1,1],[2,0]],
   [[0,1],[1,0],[1,1],[1,2]], [[0,1],[1,0],[1,1],[2,1]]],
  // L - 4 rotations
  [[[0,0],[0,1],[0,2],[1,0]], [[0,0],[1,0],[2,0],[2,1]],
   [[0,2],[1,0],[1,1],[1,2]], [[0,0],[0,1],[1,1],[2,1]]],
  // J - 4 rotations
  [[[0,0],[0,1],[0,2],[1,2]], [[0,0],[0,1],[1,0],[2,0]],
   [[0,0],[1,0],[1,1],[1,2]], [[0,1],[1,1],[2,0],[2,1]]],
];

export const PIECE_NAMES = ['O', 'I', 'S', 'Z', 'T', 'L', 'J'];

export function pieceWidth(p, r) {
  const cells = PIECE_DEFS[p][r % PIECE_DEFS[p].length];
  let mx = 0;
  for (const [, c] of cells) if (c > mx) mx = c;
  return mx + 1;
}

// Find where a piece would land without modifying the board.
export function findLandingRow(board, p, r, col) {
  const cells = PIECE_DEFS[p][r % PIECE_DEFS[p].length];
  const w = pieceWidth(p, r);
  if (col < 0 || col + w > COLS) return -1;
  let bestRow = ROWS + 4;
  for (let tryRow = bestRow; tryRow >= 0; tryRow--) {
    let fits = true;
    for (const [cr, cc] of cells) {
      const br = tryRow + cr, bc = col + cc;
      if (br < 0 || bc < 0 || bc >= COLS) { fits = false; break; }
      if (br < 32 && getBit(board, bc, br)) { fits = false; break; }
    }
    if (fits) bestRow = tryRow;
    else break;
  }
  return bestRow > ROWS + 4 ? -1 : bestRow;
}

// Drop a piece from above until it collides, then merge into the board.
export function placePiece(board, p, r, col) {
  const cells = PIECE_DEFS[p][r % PIECE_DEFS[p].length];
  const w = pieceWidth(p, r);
  if (col < 0 || col + w > COLS) return -1;

  let bestRow = ROWS + 4;
  for (let tryRow = bestRow; tryRow >= 0; tryRow--) {
    let fits = true;
    for (const [cr, cc] of cells) {
      const br = tryRow + cr, bc = col + cc;
      if (br < 0 || bc < 0 || bc >= COLS) { fits = false; break; }
      if (br < 32 && getBit(board, bc, br)) { fits = false; break; }
    }
    if (fits) bestRow = tryRow;
    else break;
  }
  if (bestRow > ROWS + 4) return -1;

  for (const [cr, cc] of cells) setBit(board, col + cc, bestRow + cr);
  return bestRow;
}

// Penalizes aggregate height, holes, roughness, height variance, wells,
// and covered holes (holes with more filled cells above them are worse).
export function scoreBoard(board) {
  let totalH = 0, totalHoles = 0, rough = 0, wells = 0, coveredHoles = 0;
  const heights = new Array(COLS);
  for (let c = 0; c < COLS; c++) {
    const h = colHeight(board, c);
    heights[c] = h;
    totalH += h;
    const filled = popcountu32(board[c]);
    const holes = h - filled;
    totalHoles += holes;
    // Covered holes: count how many filled cells sit above each hole
    if (holes > 0) {
      for (let r = 0; r < h; r++) {
        if (((board[c] >> r) & 1) === 0) {
          // hole at row r - count filled cells above it
          const above = popcountu32(board[c] >> (r + 1));
          coveredHoles += above;
        }
      }
    }
  }
  for (let c = 0; c < COLS - 1; c++) {
    rough += Math.abs(heights[c] - heights[c + 1]);
  }
  // Wells: a column significantly lower than both neighbors
  for (let c = 0; c < COLS; c++) {
    const left = c > 0 ? heights[c - 1] : ROWS;
    const right = c < COLS - 1 ? heights[c + 1] : ROWS;
    const depth = Math.min(left, right) - heights[c];
    if (depth > 0) wells += depth * depth;
  }
  const mean = totalH / COLS;
  let mse = 0;
  for (let c = 0; c < COLS; c++) {
    const d = heights[c] - mean;
    mse += d * d;
  }
  const maxH = boardHeight(board);
  return -(totalH * 2.5 + totalHoles * 12 + coveredHoles * 3 +
           rough * 2 + mse * 1.5 + wells * 1.5 + maxH * maxH * 0.3);
}

// 7-bag randomizer (Fisher-Yates)
export function makeBag() {
  const bag = [0, 1, 2, 3, 4, 5, 6];
  for (let i = 6; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = bag[i]; bag[i] = bag[j]; bag[j] = t;
  }
  return bag;
}

// Beam search AI
// 2-ply exact lookahead: uses the *actual* known next piece from the bag
// instead of averaging across all 7. Falls back to 7-piece average when
// no next piece is known.
function bestScoreForPiece(board, p) {
  const rots = PIECE_DEFS[p].length;
  let best = -Infinity;
  for (let r = 0; r < rots; r++) {
    const w = pieceWidth(p, r);
    for (let c = 0; c <= COLS - w; c++) {
      const tb = cloneBoard(board);
      if (placePiece(tb, p, r, c) < 0) continue;
      const cl = clearFilledRows(tb);
      if (isLost(tb)) continue;
      const s = scoreBoard(tb) + cl * 150;
      if (s > best) best = s;
    }
  }
  return best;
}

export function findBest(board, pieceIdx, knownNext) {
  const rots = PIECE_DEFS[pieceIdx].length;
  let bestScore = -Infinity, bestRot = 0, bestCol = 0;
  const hasNext = knownNext >= 0 && knownNext < 7;

  for (let rot = 0; rot < rots; rot++) {
    const w = pieceWidth(pieceIdx, rot);
    for (let col = 0; col <= COLS - w; col++) {
      const tb = cloneBoard(board);
      if (placePiece(tb, pieceIdx, rot, col) < 0) continue;
      const cl = clearFilledRows(tb);
      if (isLost(tb)) continue;
      let score = scoreBoard(tb) + cl * 150;

      if (hasNext) {
        // Exact 2-ply: evaluate best placement of the known next piece
        const nextBest = bestScoreForPiece(tb, knownNext);
        if (nextBest > -Infinity) score += nextBest * 0.4;
      } else {
        // Fallback: average best across all 7 possible next pieces
        let avg = 0, cnt = 0;
        for (let np = 0; np < 7; np++) {
          const s = bestScoreForPiece(tb, np);
          if (s > -Infinity) { avg += s; cnt++; }
        }
        if (cnt > 0) score += (avg / cnt) * 0.3;
      }

      if (score > bestScore) {
        bestScore = score;
        bestRot = rot;
        bestCol = col;
      }
    }
  }

  return { rot: bestRot, col: bestCol };
}
