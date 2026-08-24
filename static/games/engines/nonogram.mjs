export function clues(line) {
    const result = [];
    let run = 0;
    for (const value of line) {
        if (value) run++;
        else if (run) { result.push(run); run = 0; }
    }
    if (run) result.push(run);
    return result.length ? result : [0];
}

export function linePatterns(length, clue) {
    const normalized = clue.length === 1 && clue[0] === 0 ? [] : clue;
    const results = [];
    function place(runIndex, cursor, line) {
        if (runIndex === normalized.length) {
            results.push(line.concat(Array(length - line.length).fill(0)));
            return;
        }
        const remainingRuns = normalized.slice(runIndex + 1).reduce((a, b) => a + b, 0);
        const remainingGaps = Math.max(0, normalized.length - runIndex - 1);
        const latest = length - normalized[runIndex] - remainingRuns - remainingGaps;
        for (let start = cursor; start <= latest; start++) {
            const next = line.concat(Array(start - line.length).fill(0), Array(normalized[runIndex]).fill(1));
            if (runIndex < normalized.length - 1) next.push(0);
            place(runIndex + 1, next.length, next);
        }
    }
    place(0, 0, []);
    return results;
}

export function countNonogramSolutions(rowClues, colClues, limit = 2) {
    const width = colClues.length;
    const rowOptions = rowClues.map((clue) => linePatterns(width, clue));
    const colOptions = colClues.map((clue, col) => linePatterns(rowClues.length, clue).map((line) => ({ line, col })));
    let count = 0;
    function visit(row, chosen) {
        if (count >= limit) return;
        if (row === rowOptions.length) { count++; return; }
        for (const pattern of rowOptions[row]) {
            let valid = true;
            for (let col = 0; col < width && valid; col++) {
                valid = colOptions[col].some((option) => {
                    for (let r = 0; r < row; r++) if (option.line[r] !== chosen[r][col]) return false;
                    return option.line[row] === pattern[col];
                });
            }
            if (valid) visit(row + 1, chosen.concat([pattern]));
            if (count >= limit) return;
        }
    }
    visit(0, []);
    return count;
}
