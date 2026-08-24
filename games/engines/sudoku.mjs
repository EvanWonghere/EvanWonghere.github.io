const SIZE = 9;

export function cloneGrid(grid) {
    return grid.map((row) => row.slice());
}

export function candidates(grid, row, col) {
    if (grid[row][col] !== 0) return [];
    const used = new Set();
    for (let i = 0; i < SIZE; i++) {
        used.add(grid[row][i]);
        used.add(grid[i][col]);
    }
    const boxRow = Math.floor(row / 3) * 3;
    const boxCol = Math.floor(col / 3) * 3;
    for (let r = boxRow; r < boxRow + 3; r++) {
        for (let c = boxCol; c < boxCol + 3; c++) used.add(grid[r][c]);
    }
    return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((value) => !used.has(value));
}

function findBestEmpty(grid) {
    let best = null;
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            if (grid[r][c] !== 0) continue;
            const values = candidates(grid, r, c);
            if (!values.length) return { row: r, col: c, values };
            if (!best || values.length < best.values.length) best = { row: r, col: c, values };
            if (values.length === 1) return best;
        }
    }
    return best;
}

export function solve(grid) {
    const result = cloneGrid(grid);
    function visit() {
        const next = findBestEmpty(result);
        if (!next) return true;
        for (const value of next.values) {
            result[next.row][next.col] = value;
            if (visit()) return true;
        }
        result[next.row][next.col] = 0;
        return false;
    }
    return visit() ? result : null;
}

export function countSolutions(grid, limit = 2) {
    const work = cloneGrid(grid);
    let count = 0;
    function visit() {
        if (count >= limit) return;
        const next = findBestEmpty(work);
        if (!next) {
            count++;
            return;
        }
        for (const value of next.values) {
            work[next.row][next.col] = value;
            visit();
            if (count >= limit) break;
        }
        work[next.row][next.col] = 0;
    }
    visit();
    return count;
}

function shuffled(values, rng) {
    const result = values.slice();
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function makeSolution(rng) {
    const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
    function fill() {
        const next = findBestEmpty(grid);
        if (!next) return true;
        for (const value of shuffled(next.values, rng)) {
            grid[next.row][next.col] = value;
            if (fill()) return true;
        }
        grid[next.row][next.col] = 0;
        return false;
    }
    fill();
    return grid;
}

export function generateSudoku(givens = 44, rng = Math.random) {
    const target = Math.max(24, Math.min(64, Number(givens) || 44));
    for (let restart = 0; restart < 40; restart++) {
        const solution = makeSolution(rng);
        const puzzle = cloneGrid(solution);
        let remaining = 81;
        let cells = shuffled(Array.from({ length: 81 }, (_, i) => i), rng);

        for (const index of cells) {
            if (remaining <= target) break;
            const row = Math.floor(index / 9);
            const col = index % 9;
            const previous = puzzle[row][col];
            puzzle[row][col] = 0;
            if (countSolutions(puzzle, 2) !== 1) puzzle[row][col] = previous;
            else remaining--;
        }

        if (remaining === target) return { puzzle, solution };
    }
    throw new Error(`无法生成含 ${target} 个提示数的唯一解数独`);
}
