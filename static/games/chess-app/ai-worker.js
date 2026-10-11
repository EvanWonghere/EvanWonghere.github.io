import { Chess } from '../vendor/chess.js/chess.js';

const VALUE = { p: 100, n: 320, b: 335, r: 500, q: 900, k: 0 };

function evaluate(game) {
    let score = 0;
    const board = game.board();
    for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
        const piece = board[row][col];
        if (!piece) continue;
        const center = 7 - (Math.abs(3.5 - row) + Math.abs(3.5 - col));
        const activity = ['n', 'b', 'q'].includes(piece.type) ? center * 2 : piece.type === 'p' ? center : 0;
        score += (VALUE[piece.type] + activity) * (piece.color === 'b' ? 1 : -1);
    }
    return score;
}

function orderedMoves(game) {
    return game.moves({ verbose: true }).sort((a, b) => {
        const value = (move) => (move.san.includes('#') ? 1e7 : 0) + (move.captured ? 10 * VALUE[move.captured] - VALUE[move.piece] : 0) + (move.promotion ? VALUE[move.promotion] : 0) + (move.san.includes('+') ? 40 : 0);
        return value(b) - value(a);
    });
}

function search(game, depth, alpha, beta, deadline) {
    if (performance.now() >= deadline) return { timeout: true, value: 0 };
    if (game.isCheckmate()) return { value: game.turn() === 'b' ? -1e7 - depth : 1e7 + depth };
    if (game.isDraw()) return { value: 0 };
    if (depth === 0) return { value: evaluate(game) };
    const maximizing = game.turn() === 'b';
    let best = maximizing ? -Infinity : Infinity;
    for (const move of orderedMoves(game)) {
        game.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
        const result = search(game, depth - 1, alpha, beta, deadline);
        game.undo();
        if (result.timeout) return result;
        if (maximizing) { best = Math.max(best, result.value); alpha = Math.max(alpha, best); }
        else { best = Math.min(best, result.value); beta = Math.min(beta, best); }
        if (beta <= alpha) break;
    }
    return { value: best };
}

export function chooseChessMove(fen, difficulty) {
    const game = new Chess(fen);
    const moves = orderedMoves(game);
    if (!moves.length) return null;
    if (difficulty === 'easy') {
        const quietMix = moves.slice(0, Math.min(8, moves.length));
        return quietMix[Math.floor(Math.random() * quietMix.length)];
    }
    const deadline = performance.now() + (difficulty === 'hard' ? 1000 : 320);
    const maxDepth = difficulty === 'hard' ? 4 : 2;
    let completed = moves[0];
    for (let depth = 1; depth <= maxDepth; depth++) {
        let best = null;
        let timedOut = false;
        for (const move of moves) {
            game.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
            const result = search(game, depth - 1, -Infinity, Infinity, deadline);
            game.undo();
            if (result.timeout) { timedOut = true; break; }
            if (!best || result.value > best.value) best = { move, value: result.value };
        }
        if (timedOut) break;
        if (best) completed = best.move;
    }
    return completed;
}

// ---- Stockfish ----
// The computer is Stockfish 19 (lite, single-threaded: it needs no special headers), run by a worker of its own and spoken to over UCI.
// If it cannot start or does not answer in time, the move comes from the small search above, so the game never stalls.
const ENGINE_URL = typeof self !== 'undefined' && self.location ? new URL('../vendor/stockfish/stockfish-19-lite-single.js', import.meta.url) : null;
// Skill Level is Stockfish's own strength dial (0-20); movetime is how long it may think, in milliseconds.
const LEVELS = { easy: { skill: 0, ms: 60 }, normal: { skill: 8, ms: 250 }, hard: { skill: 16, ms: 1000 }, master: { skill: 20, ms: 2000 } };
let engine = null, starting = null;
const listeners = new Set();

function startEngine() {
    starting ??= new Promise((resolve, reject) => {
        const worker = new Worker(ENGINE_URL);
        const timer = setTimeout(() => { worker.terminate(); reject(new Error('Stockfish did not start')); }, 15000);
        worker.onerror = (event) => { clearTimeout(timer); reject(new Error(event.message || 'Stockfish failed')); };
        worker.onmessage = (event) => {
            const line = typeof event.data === 'string' ? event.data : '';
            if (line === 'uciok') worker.postMessage('isready');
            else if (line === 'readyok') { clearTimeout(timer); engine = worker; resolve(worker); }
            for (const listener of listeners) listener(line);
        };
        worker.postMessage('uci');
    });
    starting.catch(() => { starting = null; });
    return starting;
}

// "e2e4" or "e7e8q" → { from, to, promotion }; null when there is no move.
export function parseBestMove(line) {
    const match = /^bestmove\s+([a-h][1-8])([a-h][1-8])([qrbn])?/.exec(line);
    return match ? { from: match[1], to: match[2], promotion: match[3] || undefined } : null;
}

async function stockfishMove(fen, difficulty) {
    const level = LEVELS[difficulty] ?? LEVELS.normal;
    const worker = await startEngine();
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { listeners.delete(listener); reject(new Error('Stockfish did not answer')); }, level.ms + 6000);
        const listener = (line) => {
            if (!line.startsWith('bestmove')) return;
            clearTimeout(timer); listeners.delete(listener);
            resolve(parseBestMove(line));
        };
        listeners.add(listener);
        worker.postMessage(`setoption name Skill Level value ${level.skill}`);
        worker.postMessage('ucinewgame');
        worker.postMessage(`position fen ${fen}`);
        worker.postMessage(`go movetime ${level.ms}`);
    });
}

if (typeof self !== 'undefined' && typeof self.addEventListener === 'function') self.addEventListener('message', async (event) => {
    const { id, fen, difficulty } = event.data;
    let move = null;
    try { move = await stockfishMove(fen, difficulty); }
    catch (error) {
        console.warn('Stockfish unavailable, using the built-in search:', error.message);
        const fallback = chooseChessMove(fen, difficulty === 'master' ? 'hard' : difficulty);
        move = fallback ? { from: fallback.from, to: fallback.to, promotion: fallback.promotion || 'q' } : null;
    }
    self.postMessage({ id, move });
});
