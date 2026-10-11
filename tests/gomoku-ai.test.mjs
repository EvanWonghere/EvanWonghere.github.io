import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chooseMove } = require('../static/games/gomoku-app/worker.js');
const blank = () => Array.from({ length: 15 }, () => Array(15).fill(0));
const board = (people = [], computer = []) => { const b = blank(); people.forEach(([r, c]) => { b[r][c] = 1; }); computer.forEach(([r, c]) => { b[r][c] = 2; }); return b; };
const is = (move, ...cells) => cells.some(([r, c]) => move.r === r && move.c === c);

test('the computer opens in the centre and answers the first stone', () => {
    assert.deepEqual(chooseMove(blank(), 'hard'), { r: 7, c: 7 });
    const move = chooseMove(board([[7, 7]]), 'normal');
    assert.ok(Math.abs(move.r - 7) <= 2 && Math.abs(move.c - 7) <= 2, `near the first stone: ${JSON.stringify(move)}`);
});

test('it completes five when it can, and that comes before blocking', () => {
    for (const level of ['easy', 'normal', 'hard', 'master']) {
        assert.ok(is(chooseMove(board([], [[7, 4], [7, 5], [7, 6], [7, 7]]), level), [7, 3], [7, 8]), level);
        // both sides have a four: it wins instead of blocking
        assert.ok(is(chooseMove(board([[3, 3], [4, 4], [5, 5], [6, 6]], [[10, 2], [10, 3], [10, 4], [10, 5]]), level), [10, 1], [10, 6]), level);
    }
});

test('it blocks a four, at every level, and the one end that is still open', () => {
    for (const level of ['easy', 'normal', 'hard', 'master']) {
        assert.ok(is(chooseMove(board([[7, 4], [7, 5], [7, 6], [7, 7]], [[7, 3]]), level), [7, 8]), level);
        assert.ok(is(chooseMove(board([[3, 9], [4, 8], [5, 7], [6, 6]], [[7, 5]]), level), [2, 10]), level);
    }
});

test('it stops an open three before it becomes an open four', () => {
    const move = chooseMove(board([[7, 6], [7, 7], [7, 8]], [[9, 9]]), 'hard');
    assert.ok(is(move, [7, 5], [7, 9], [7, 4], [7, 10]), JSON.stringify(move));
});

test('it finds a winning chain of fours that ends in a four-four', () => {
    // Playing (7,4) makes a four on the row; the block at (7,8)... leaves (4,10)-(8,6) diagonal to finish; any first move that wins is fine
    const b = board([], [[7, 5], [7, 6], [7, 7], [5, 9], [6, 8], [8, 6]]);
    b[7][4] = 1;
    const move = chooseMove(b, 'hard');
    b[move.r][move.c] = 2;
    // after its move the computer must have two different ways to make five, or a four that cannot be stopped
    let threats = 0;
    for (let r = 0; r < 15; r++) for (let c = 0; c < 15; c++) {
        if (b[r][c]) continue;
        b[r][c] = 2;
        const five = [[0, 1], [1, 0], [1, 1], [1, -1]].some(([dr, dc]) => { let n = 1; for (const s of [-1, 1]) for (let i = 1; ; i++) { const rr = r + dr * i * s, cc = c + dc * i * s; if (rr < 0 || rr > 14 || cc < 0 || cc > 14 || b[rr][cc] !== 2) break; n++; } return n >= 5; });
        b[r][c] = 0;
        if (five) threats++;
    }
    assert.ok(threats >= 2, `${JSON.stringify(move)} leaves ${threats} winning cells`);
});

test('it always answers with an empty cell, and none when the board is full', () => {
    const b = blank();
    for (const [r, c] of [[7, 7], [7, 8], [8, 8], [6, 6], [8, 7], [6, 8], [9, 9], [5, 5]]) b[r][c] = ((r + c) % 2) + 1;
    for (const level of ['easy', 'normal', 'hard']) { const move = chooseMove(b, level); assert.equal(b[move.r][move.c], 0, level); }
    const full = blank();
    for (let r = 0; r < 15; r++) for (let c = 0; c < 15; c++) full[r][c] = ((r % 4 < 2) ? ((c + (r % 2)) % 4 < 2 ? 1 : 2) : ((c + (r % 2)) % 4 < 2 ? 2 : 1));
    assert.equal(chooseMove(full, 'hard'), null);
});

test('a short game against a careless player is won', () => {
    // The other side plays beside the computer's last stone, with a fixed pattern; the computer must connect five before move 60.
    const b = blank();
    let turnMoves = 0, winner = 0;
    const five = (r, c, v) => [[0, 1], [1, 0], [1, 1], [1, -1]].some(([dr, dc]) => { let n = 1; for (const s of [-1, 1]) for (let i = 1; ; i++) { const rr = r + dr * i * s, cc = c + dc * i * s; if (rr < 0 || rr > 14 || cc < 0 || cc > 14 || b[rr][cc] !== v) break; n++; } return n >= 5; });
    let last = { r: 7, c: 7 }; b[7][7] = 1;
    while (turnMoves < 60 && !winner) {
        const move = chooseMove(b.map(row => row.slice()), 'normal'); assert.equal(b[move.r][move.c], 0);
        b[move.r][move.c] = 2; turnMoves++;
        if (five(move.r, move.c, 2)) { winner = 2; break; }
        const options = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]].map(([dr, dc]) => ({ r: move.r + dr * 3, c: move.c + dc * 3 })).filter(p => p.r >= 0 && p.r < 15 && p.c >= 0 && p.c < 15 && !b[p.r][p.c]);
        const reply = options[turnMoves % options.length] ?? { r: (turnMoves * 7) % 15, c: (turnMoves * 11) % 15 };
        if (b[reply.r][reply.c]) continue;
        b[reply.r][reply.c] = 1; last = reply;
        if (five(reply.r, reply.c, 1)) winner = 1;
    }
    assert.equal(winner, 2);
});
