function neighbors(board, row, col) {
    const result = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = row + dr, nc = col + dc;
        if (nr >= 0 && nr < board.length && nc >= 0 && nc < board[0].length) result.push(board[nr][nc]);
    }
    return result;
}

export function annotateMines(mines) {
    return mines.map((row, r) => row.map((mine, c) => ({
        r, c, isMine: Boolean(mine), value: mine ? -1 : neighbors(mines.map((line, rr) => line.map((value, cc) => ({ r: rr, c: cc, isMine: Boolean(value) }))), r, c).filter(cell => cell.isMine).length
    })));
}

export function isLogicallySolvable(board, startRow, startCol) {
    const opened = new Set();
    const flagged = new Set();
    const key = (cell) => `${cell.r},${cell.c}`;
    function reveal(cell) {
        if (cell.isMine || opened.has(key(cell))) return false;
        opened.add(key(cell));
        if (cell.value === 0) neighbors(board, cell.r, cell.c).forEach(reveal);
        return true;
    }
    reveal(board[startRow][startCol]);
    let changed = true;
    while (changed) {
        changed = false;
        for (const id of Array.from(opened)) {
            const [r, c] = id.split(',').map(Number);
            const cell = board[r][c];
            if (!cell.value) continue;
            const around = neighbors(board, r, c);
            const marked = around.filter(item => flagged.has(key(item))).length;
            const unknown = around.filter(item => !opened.has(key(item)) && !flagged.has(key(item)));
            if (unknown.length && cell.value - marked === unknown.length) {
                unknown.forEach(item => flagged.add(key(item)));
                changed = true;
            } else if (unknown.length && marked === cell.value) {
                unknown.forEach(item => { if (reveal(item)) changed = true; });
            }
        }
    }
    const mineCount = board.flat().filter(cell => cell.isMine).length;
    return opened.size === board.length * board[0].length - mineCount;
}
