export const PIECES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

export function shuffledBag(rng = Math.random) {
    const bag = PIECES.slice();
    for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    return bag;
}

export class SevenBag {
    constructor(rng = Math.random) { this.rng = rng; this.queue = []; }
    next() {
        if (!this.queue.length) this.queue.push(...shuffledBag(this.rng));
        return this.queue.shift();
    }
    preview(count = 5) {
        while (this.queue.length < count) this.queue.push(...shuffledBag(this.rng));
        return this.queue.slice(0, count);
    }
}

export const JLSTZ_KICKS = {
    '0>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '1>0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '1>2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '2>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '2>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '3>2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '3>0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '0>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]]
};

export function scoreClear(lines, level = 1, options = {}) {
    const base = [0, 100, 300, 500, 800][lines] || 0;
    let score = base * level;
    if (options.tSpin) score = [400, 800, 1200, 1600][lines] * level;
    if (options.backToBack && (lines === 4 || options.tSpin)) score = Math.floor(score * 1.5);
    if (options.combo > 0) score += 50 * options.combo * level;
    return score;
}
