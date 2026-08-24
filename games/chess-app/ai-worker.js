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

if (typeof self !== 'undefined') self.addEventListener('message', (event) => {
    const { id, fen, difficulty } = event.data;
    const move = chooseChessMove(fen, difficulty);
    self.postMessage({ id, move: move ? { from: move.from, to: move.to, promotion: move.promotion || 'q' } : null });
});
