'use strict';
const SIZE = 15;
const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];

function inBounds(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }

function isWin(board, r, c, role) {
    return DIRECTIONS.some(([dr, dc]) => {
        let count = 1;
        for (const sign of [-1, 1]) {
            for (let i = 1; ; i++) {
                const nr = r + dr * i * sign, nc = c + dc * i * sign;
                if (!inBounds(nr, nc) || board[nr][nc] !== role) break;
                count++;
            }
        }
        return count >= 5;
    });
}

function hasNeighbor(board, r, c, distance = 2) {
    for (let dr = -distance; dr <= distance; dr++) for (let dc = -distance; dc <= distance; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr, nc = c + dc;
        if (inBounds(nr, nc) && board[nr][nc]) return true;
    }
    return false;
}

function lineValue(board, r, c, dr, dc, role) {
    let count = 1, open = 0;
    for (const sign of [-1, 1]) {
        let i = 1;
        while (inBounds(r + dr * i * sign, c + dc * i * sign) && board[r + dr * i * sign][c + dc * i * sign] === role) {
            count++; i++;
        }
        const endR = r + dr * i * sign, endC = c + dc * i * sign;
        if (inBounds(endR, endC) && board[endR][endC] === 0) open++;
    }
    if (count >= 5) return 1e8;
    if (count === 4) return open === 2 ? 2e6 : open ? 180000 : 0;
    if (count === 3) return open === 2 ? 30000 : open ? 4000 : 0;
    if (count === 2) return open === 2 ? 900 : open ? 120 : 0;
    return open === 2 ? 18 : 2;
}

function pointScore(board, r, c, role) {
    board[r][c] = role;
    const value = DIRECTIONS.reduce((sum, [dr, dc]) => sum + lineValue(board, r, c, dr, dc, role), 0);
    board[r][c] = 0;
    return value;
}

function candidates(board, role, limit = 16) {
    const result = [];
    let occupied = false;
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
        if (board[r][c]) { occupied = true; continue; }
        if (!hasNeighbor(board, r, c)) continue;
        const attack = pointScore(board, r, c, role);
        const defend = pointScore(board, r, c, role === 1 ? 2 : 1);
        result.push({ r, c, score: attack * 1.08 + defend });
    }
    if (!occupied) return [{ r: 7, c: 7, score: 0 }];
    return result.sort((a, b) => b.score - a.score).slice(0, limit);
}

function findForced(board, role) {
    for (const move of candidates(board, role, 30)) {
        board[move.r][move.c] = role;
        const wins = isWin(board, move.r, move.c, role);
        board[move.r][move.c] = 0;
        if (wins) return move;
    }
    return null;
}

function chooseMove(board, difficulty) {
    const immediate = findForced(board, 2);
    if (immediate) return immediate;
    const block = findForced(board, 1);
    if (block) return block;

    const root = candidates(board, 2, difficulty === 'hard' ? 16 : 10);
    if (difficulty === 'easy') {
        const pool = root.slice(0, Math.min(5, root.length));
        return pool[Math.floor(Math.random() * pool.length)] || null;
    }

    const deadline = performance.now() + (difficulty === 'hard' ? 850 : 220);
    const maxDepth = difficulty === 'hard' ? 4 : 2;
    let completedBest = root[0] || null;

    function evaluate() {
        const ai = candidates(board, 2, 5);
        const human = candidates(board, 1, 5);
        const weighted = (moves) => moves.reduce((sum, move, index) => sum + move.score / (index + 1), 0);
        return weighted(ai) - weighted(human) * 1.12;
    }

    function search(depth, role, alpha, beta, lastMove) {
        if (performance.now() >= deadline) return { timeout: true, value: 0 };
        if (lastMove && isWin(board, lastMove.r, lastMove.c, role === 2 ? 1 : 2)) {
            return { value: role === 2 ? -1e12 - depth : 1e12 + depth };
        }
        if (depth === 0) return { value: evaluate() };

        const moves = candidates(board, role, depth >= 3 ? 10 : 8);
        if (!moves.length) return { value: 0 };
        let best = role === 2 ? -Infinity : Infinity;
        for (const move of moves) {
            board[move.r][move.c] = role;
            const result = search(depth - 1, role === 2 ? 1 : 2, alpha, beta, move);
            board[move.r][move.c] = 0;
            if (result.timeout) return result;
            if (role === 2) {
                best = Math.max(best, result.value);
                alpha = Math.max(alpha, best);
            } else {
                best = Math.min(best, result.value);
                beta = Math.min(beta, best);
            }
            if (beta <= alpha) break;
        }
        return { value: best };
    }

    for (let depth = 1; depth <= maxDepth; depth++) {
        let iterationBest = null;
        let timedOut = false;
        for (const move of root) {
            board[move.r][move.c] = 2;
            const result = search(depth - 1, 1, -Infinity, Infinity, move);
            board[move.r][move.c] = 0;
            if (result.timeout) { timedOut = true; break; }
            const value = result.value + move.score * 0.02;
            if (!iterationBest || value > iterationBest.value) iterationBest = { ...move, value };
        }
        if (timedOut) break;
        if (iterationBest) completedBest = iterationBest;
    }
    return completedBest;
}

self.addEventListener('message', (event) => {
    const { id, board, difficulty } = event.data;
    self.postMessage({ id, move: chooseMove(board.map(row => row.slice()), difficulty) });
});
