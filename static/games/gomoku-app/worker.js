'use strict';
// The computer player of the gomoku game (15 x 15, freestyle: five or more in a row wins). The computer plays 2, the person 1.
// A single self-contained script (it runs as a classic worker and is also loaded by the tests).
//
// How it plays:
//  - Every run of five cells on the board is a "window". For each window it counts the stones of each colour; a window with stones of
//    one colour only is worth more the more stones it has. The sum over all windows is the evaluation, kept up to date move by move.
//  - It checks, in order: a move that wins at once, a move that stops the other side winning at once, then a search for a winning chain
//    of fours (VCF), then an iterative deepening alpha-beta search (with a transposition table) whose candidate moves are the cells
//    near the stones, best first. A side that faces a four may only block it, which keeps forced lines cheap and lets the search go deep.
//  - Strength is set by how long it may think and how deep it may go.

const SIZE = 15;
const N = SIZE * SIZE;
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
const ME = 2;
const OPP = 1;
const WIN = 1e7;
const T = [0, 1, 8, 70, 800, 1e6];   // value of a window by the number of stones of one colour in it (the other colour has none)

// ---- The windows ----
const WIN_CELLS = [];
const CELL_WINS = Array.from({ length: N }, () => []);
for (const [dr, dc] of DIRS) {
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
        const er = r + 4 * dr, ec = c + 4 * dc;
        if (er < 0 || er >= SIZE || ec < 0 || ec >= SIZE) continue;
        const cells = [];
        for (let k = 0; k < 5; k++) cells.push((r + k * dr) * SIZE + c + k * dc);
        const w = WIN_CELLS.length;
        WIN_CELLS.push(cells);
        for (const i of cells) CELL_WINS[i].push(w);
    }
}
const W = WIN_CELLS.length;
const NEIGHBOURS = Array.from({ length: N }, (_, i) => {
    const r = Math.floor(i / SIZE), c = i % SIZE, list = [];
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        const nr = r + dr, nc = c + dc;
        if ((dr || dc) && nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) list.push(nr * SIZE + nc);
    }
    return list;
});

// Fixed random numbers for hashing positions (a small xorshift, so every run is the same).
let seed = 0x2545F491;
const random32 = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; };
const Z1 = [null, Int32Array.from({ length: N }, random32), Int32Array.from({ length: N }, random32)];
const Z2 = [null, Int32Array.from({ length: N }, random32), Int32Array.from({ length: N }, random32)];

// ---- The position ----
const board = new Int8Array(N);
const cnt = [null, new Int8Array(W), new Int8Array(W)];
const total = [0, 0, 0];             // total[colour]: the value of that colour's windows
const near = new Int8Array(N);       // how many stones lie within two cells of this cell
let h1 = 0, h2 = 0, stones = 0;
let tt = new Map();
let deadline = Infinity;
let nodes = 0;
const TIMEOUT = { timeout: true };

const other = (colour) => 3 - colour;
const contribution = (w, colour) => (cnt[other(colour)][w] === 0 ? T[cnt[colour][w]] : 0);

function reset() {
    board.fill(0); cnt[1].fill(0); cnt[2].fill(0); near.fill(0);
    total[1] = total[2] = 0; h1 = h2 = 0; stones = 0; tt = new Map();
}
function place(i, colour) {
    const o = other(colour);
    for (const w of CELL_WINS[i]) {
        total[colour] -= contribution(w, colour); total[o] -= contribution(w, o);
        cnt[colour][w]++;
        total[colour] += contribution(w, colour); total[o] += contribution(w, o);
    }
    board[i] = colour; h1 ^= Z1[colour][i]; h2 ^= Z2[colour][i]; stones++;
    for (const j of NEIGHBOURS[i]) near[j]++;
}
function unplace(i, colour) {
    const o = other(colour);
    for (const w of CELL_WINS[i]) {
        total[colour] -= contribution(w, colour); total[o] -= contribution(w, o);
        cnt[colour][w]--;
        total[colour] += contribution(w, colour); total[o] += contribution(w, o);
    }
    board[i] = 0; h1 ^= Z1[colour][i]; h2 ^= Z2[colour][i]; stones--;
    for (const j of NEIGHBOURS[i]) near[j]--;
}
const key = () => (h1 & 0x7FFFFFFF) * 4194304 + (h2 & 0x3FFFFF);
// The empty cells that would give `colour` five in a row.
function fiveCells(colour) {
    const out = [];
    const own = cnt[colour], opp = cnt[other(colour)];
    for (let w = 0; w < W; w++) {
        if (own[w] !== 4 || opp[w] !== 0) continue;
        for (const i of WIN_CELLS[w]) if (board[i] === 0) { if (!out.includes(i)) out.push(i); break; }
    }
    return out;
}
// How much a stone of `colour` at i would add to the windows it lies in.
function gain(i, colour) {
    let sum = 0;
    const own = cnt[colour], opp = cnt[other(colour)];
    for (const w of CELL_WINS[i]) if (opp[w] === 0) sum += T[own[w] + 1] - T[own[w]];
    return sum;
}
// The cells to try, best first: empty cells near the stones, scored by what a stone there would do for either side.
function candidates(colour, limit) {
    const list = [];
    for (let i = 0; i < N; i++) {
        if (board[i] !== 0 || near[i] === 0) continue;
        list.push({ i, score: gain(i, colour) * 1.05 + gain(i, other(colour)) });
    }
    list.sort((a, b) => b.score - a.score);
    return list.length > limit ? list.slice(0, limit) : list;
}
const evaluate = (colour) => total[colour] - total[other(colour)];

// ---- A winning chain of fours (VCF) ----
// `colour` plays a four, the other side must block, and so on; returns the first cell of a chain that ends in five, or -1.
function vcf(colour, depth) {
    const wins = fiveCells(colour);
    if (wins.length) return wins[0];
    if (depth <= 0 || fiveCells(other(colour)).length) return -1;
    const moves = [];
    for (let i = 0; i < N; i++) {
        if (board[i] !== 0 || near[i] === 0) continue;
        let fours = 0;
        for (const w of CELL_WINS[i]) if (cnt[colour][w] === 3 && cnt[other(colour)][w] === 0) fours++;
        if (fours) moves.push({ i, fours });
    }
    moves.sort((a, b) => b.fours - a.fours);
    for (const { i } of moves) {
        place(i, colour);
        const completions = fiveCells(colour);
        let won = false;
        if (completions.length >= 2) won = true;
        else if (completions.length === 1) {
            const block = completions[0];
            place(block, other(colour));
            if (!makesFiveAt(block, other(colour))) won = vcf(colour, depth - 1) >= 0;
            unplace(block, other(colour));
        }
        unplace(i, colour);
        if (won) return i;
    }
    return -1;
}
// After the stone at i of `colour` is already on the board: is there five through it?
function makesFiveAt(i, colour) { return CELL_WINS[i].some((w) => cnt[colour][w] === 5); }

// ---- Alpha-beta ----
const LIMITS = [0, 12, 10, 9, 8, 7, 7, 6, 6, 6, 6, 6, 6];
function search(depth, alpha, beta, colour, ply) {
    if ((++nodes & 511) === 0 && performance.now() >= deadline) throw TIMEOUT;
    if (fiveCells(colour).length) return WIN - ply;
    const threats = fiveCells(other(colour));
    if (threats.length > 1) return -(WIN - ply - 1);     // two fours at once cannot both be blocked
    if (depth <= 0 && !threats.length) return evaluate(colour);

    const k = key();
    const entry = tt.get(k);
    if (entry && entry.depth >= depth) {
        if (entry.flag === 0) return entry.value;
        if (entry.flag === 1 && entry.value >= beta) return entry.value;
        if (entry.flag === 2 && entry.value <= alpha) return entry.value;
    }
    const moves = threats.length ? [{ i: threats[0], score: 0 }] : candidates(colour, LIMITS[Math.min(depth, 12)] || 6);
    if (entry && entry.move >= 0) {
        const at = moves.findIndex((m) => m.i === entry.move);
        if (at > 0) moves.unshift(moves.splice(at, 1)[0]);
    }
    if (!moves.length) return 0;
    const original = alpha;
    let best = -Infinity, bestMove = -1;
    for (const { i } of moves) {
        place(i, colour);
        const value = -search(depth - 1, -beta, -alpha, other(colour), ply + 1);
        unplace(i, colour);
        if (value > best) { best = value; bestMove = i; }
        if (value > alpha) alpha = value;
        if (alpha >= beta) break;
    }
    tt.set(k, { depth, value: best, flag: best <= original ? 2 : best >= beta ? 1 : 0, move: bestMove });
    return best;
}

const LEVELS = {
    easy: { ms: 0, depth: 0 },
    normal: { ms: 300, depth: 6, vcf: 8 },
    hard: { ms: 1200, depth: 10, vcf: 12 },
    master: { ms: 3500, depth: 14, vcf: 16 },
};
const toMove = (i) => ({ r: Math.floor(i / SIZE), c: i % SIZE });

// board2d[r][c] is 0 (empty), 1 (the person) or 2 (the computer); returns { r, c } or null when the board is full.
function chooseMove(board2d, difficulty) {
    reset();
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (board2d[r][c]) place(r * SIZE + c, board2d[r][c]);
    if (stones === 0) return { r: 7, c: 7 };
    if (stones >= N) return null;
    const level = LEVELS[difficulty] || LEVELS.normal;

    const win = fiveCells(ME);
    if (win.length) return toMove(win[0]);
    const block = fiveCells(OPP);
    if (block.length) return toMove(block[0]);          // (with two fours at once nothing helps; take one of them)

    if (level.depth === 0) {
        // Casual: an ordinary good-looking move, not always the best one.
        const list = candidates(ME, 5);
        const pick = list[Math.floor(Math.random() * Math.min(list.length, stones < 4 ? 5 : 3))];
        return pick ? toMove(pick.i) : null;
    }

    const own = vcf(ME, level.vcf);
    if (own >= 0) return toMove(own);

    deadline = performance.now() + level.ms;
    nodes = 0;
    // If the person has a winning chain of fours, the move has to take that away.
    let moves = candidates(ME, 14);
    if (vcf(OPP, level.vcf) >= 0) {
        const safe = moves.filter(({ i }) => { place(i, ME); const stopped = vcf(OPP, level.vcf) < 0; unplace(i, ME); return stopped; });
        if (safe.length) moves = safe;
    }
    let best = moves[0];
    for (let depth = 1; depth <= level.depth; depth++) {
        let alpha = -Infinity, iteration = null;
        try {
            for (const move of moves) {
                place(move.i, ME);
                const value = -search(depth - 1, -Infinity, -alpha, OPP, 1);
                unplace(move.i, ME);
                if (value > alpha) { alpha = value; iteration = move; }
            }
        } catch (error) {
            if (error !== TIMEOUT) throw error;
            break;
        }
        if (iteration) {
            best = iteration;
            moves = [iteration, ...moves.filter((m) => m !== iteration)];
            if (alpha >= WIN - 100) break;                // a forced win is found
            if (alpha <= -WIN + 100) break;               // everything loses: no use going deeper
        }
    }
    return best ? toMove(best.i) : null;
}

if (typeof self !== 'undefined' && typeof self.addEventListener === 'function') {
    self.addEventListener('message', (event) => {
        const { id, board: grid, difficulty } = event.data;
        self.postMessage({ id, move: chooseMove(grid.map((row) => row.slice()), difficulty) });
    });
}
if (typeof module === 'object' && module.exports) module.exports = { chooseMove, SIZE };
