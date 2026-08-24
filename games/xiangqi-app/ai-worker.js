importScripts('../vendor/xiangqi.js/xiangqi.min.js');

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

self.addEventListener('message', (event) => {
    const { id, fen, difficulty } = event.data;
    const move = choose(fen, difficulty);
    self.postMessage({ id, move: move ? { from: move.from, to: move.to } : null });
});
