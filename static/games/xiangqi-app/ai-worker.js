importScripts('../vendor/xiangqi.js/xiangqi.min.js', 'uci-glue.js');

const VALUE = { p: 100, a: 120, b: 120, n: 300, c: 350, r: 600, k: 100000 };

function evaluate(game) {
    let score = 0;
    const board = game.board();
    for (let row = 0; row < 10; row++) for (let col = 0; col < 9; col++) {
        const piece = board[row][col];
        if (!piece) continue;
        let value = VALUE[piece.type];
        if (piece.type === 'p') {
            const progress = piece.color === 'b' ? row : 9 - row;
            value += progress * 7 + (progress >= 5 ? 28 : 0);
        }
        if (['n', 'c'].includes(piece.type)) value += 6 - Math.abs(4 - col);
        score += value * (piece.color === 'b' ? 1 : -1);
    }
    return score;
}

function orderedMoves(game, limit = Infinity) {
    return game.moves({ verbose: true }).sort((a, b) => {
        const score = (move) => (move.captured ? 10 * VALUE[move.captured.toLowerCase()] - VALUE[move.piece.toLowerCase()] : 0);
        return score(b) - score(a);
    }).slice(0, limit);
}

function search(game, depth, alpha, beta, deadline) {
    if (performance.now() >= deadline) return { timeout: true, value: 0 };
    if (game.in_checkmate() || game.in_stalemate()) return { value: game.turn() === 'b' ? -1e8 - depth : 1e8 + depth };
    if (game.in_draw()) return { value: 0 };
    if (depth === 0) return { value: evaluate(game) };
    const maximizing = game.turn() === 'b';
    let best = maximizing ? -Infinity : Infinity;
    for (const move of orderedMoves(game, depth >= 3 ? 18 : 24)) {
        game.move(move.iccs);
        const result = search(game, depth - 1, alpha, beta, deadline);
        game.undo();
        if (result.timeout) return result;
        if (maximizing) { best = Math.max(best, result.value); alpha = Math.max(alpha, best); }
        else { best = Math.min(best, result.value); beta = Math.min(beta, best); }
        if (beta <= alpha) break;
    }
    return { value: best };
}

function choose(fen, difficulty) {
    const game = new Xiangqi(fen);
    const moves = orderedMoves(game);
    if (!moves.length) return null;
    if (difficulty === 'easy') {
        const pool = moves.slice(0, Math.min(10, moves.length));
        return pool[Math.floor(Math.random() * pool.length)];
    }
    const deadline = performance.now() + (difficulty === 'hard' ? 1100 : 320);
    const maxDepth = difficulty === 'hard' ? 3 : 2;
    let completed = moves[0];
    for (let depth = 1; depth <= maxDepth; depth++) {
        let best = null;
        let timedOut = false;
        for (const move of moves) {
            game.move(move.iccs);
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

// ---- Fairy-Stockfish ----
// The computer is Fairy-Stockfish playing the xiangqi variant, run by fairy-host.js and spoken to over UCI. It needs a cross-origin
// isolated page (SharedArrayBuffer); where there is none, or it fails or is too slow, the small search above answers instead.
// Skill Level is the engine's own strength dial (0-20); movetime is how long it may think, in milliseconds.
const LEVELS = { easy: { skill: 0, ms: 60 }, normal: { skill: 8, ms: 300 }, hard: { skill: 16, ms: 1200 }, master: { skill: 20, ms: 2500 } };
let host = null, starting = null;
const listeners = new Set();

function startEngine() {
    starting ??= new Promise((resolve, reject) => {
        if (!self.crossOriginIsolated || typeof Worker === 'undefined') { reject(new Error('this page is not cross-origin isolated')); return; }
        const worker = new Worker('fairy-host.js');
        const timer = setTimeout(() => { worker.terminate(); reject(new Error('Fairy-Stockfish did not start')); }, 20000);
        worker.onerror = (event) => { clearTimeout(timer); reject(new Error(event.message || 'Fairy-Stockfish failed')); };
        worker.onmessage = (event) => {
            const line = typeof event.data === 'string' ? event.data : '';
            if (line === '__loaded') worker.postMessage('uci');
            else if (line.startsWith('__failed')) { clearTimeout(timer); reject(new Error(line)); }
            else if (line === 'uciok') {
                worker.postMessage('setoption name UCI_Variant value xiangqi');
                worker.postMessage('setoption name Use NNUE value false');   // no network file is shipped, so the hand-written evaluation is used
                worker.postMessage('isready');
            } else if (line === 'readyok') { clearTimeout(timer); host = worker; resolve(worker); }
            for (const listener of listeners) listener(line);
        };
    });
    starting.catch(() => { starting = null; });
    return starting;
}

const { toEngineFen, fromEngineMove } = self.UciGlue;

async function engineMove(fen, difficulty) {
    const level = LEVELS[difficulty] ?? LEVELS.normal;
    const worker = await startEngine();
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { listeners.delete(listener); reject(new Error('Fairy-Stockfish did not answer')); }, level.ms + 8000);
        const listener = (line) => {
            if (!line.startsWith('bestmove')) return;
            clearTimeout(timer); listeners.delete(listener);
            resolve(fromEngineMove(line));
        };
        listeners.add(listener);
        worker.postMessage(`setoption name Skill Level value ${level.skill}`);
        worker.postMessage('ucinewgame');
        worker.postMessage(`position fen ${toEngineFen(fen)}`);
        worker.postMessage(`go movetime ${level.ms}`);
    });
}

self.addEventListener('message', async (event) => {
    const { id, fen, difficulty } = event.data;
    let move = null;
    try { move = await engineMove(fen, difficulty); }
    catch (error) {
        console.warn('Fairy-Stockfish unavailable, using the built-in search:', error.message);
        const fallback = choose(fen, difficulty === 'master' ? 'hard' : difficulty);
        move = fallback ? { from: fallback.from, to: fallback.to } : null;
    }
    self.postMessage({ id, move });
});
