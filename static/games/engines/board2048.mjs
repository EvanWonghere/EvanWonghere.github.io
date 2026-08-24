export function moveLine(values) {
    const compact = values.filter(Boolean);
    const merged = [];
    let gain = 0;
    for (let i = 0; i < compact.length; i++) {
        if (compact[i] === compact[i + 1]) {
            const value = compact[i] * 2;
            merged.push(value);
            gain += value;
            i++;
        } else {
            merged.push(compact[i]);
        }
    }
    while (merged.length < values.length) merged.push(0);
    return { values: merged, gain };
}

export function moveBoard(board, direction) {
    const size = board.length;
    const next = board.map((row) => row.slice());
    let gain = 0;
    for (let index = 0; index < size; index++) {
        const source = [];
        for (let offset = 0; offset < size; offset++) {
            const reverse = direction === 'right' || direction === 'down';
            const cursor = reverse ? size - 1 - offset : offset;
            source.push(direction === 'left' || direction === 'right' ? next[index][cursor] : next[cursor][index]);
        }
        const moved = moveLine(source);
        gain += moved.gain;
        for (let offset = 0; offset < size; offset++) {
            const reverse = direction === 'right' || direction === 'down';
            const cursor = reverse ? size - 1 - offset : offset;
            if (direction === 'left' || direction === 'right') next[index][cursor] = moved.values[offset];
            else next[cursor][index] = moved.values[offset];
        }
    }
    return { board: next, gain, moved: JSON.stringify(next) !== JSON.stringify(board) };
}
