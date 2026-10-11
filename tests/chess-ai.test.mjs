import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Chess } from '../static/games/vendor/chess.js/chess.js';
import { parseBestMove, chooseChessMove } from '../static/games/chess-app/ai-worker.js';

test('a UCI bestmove line becomes a move for chess.js, and "no move" becomes null', () => {
    assert.deepEqual(parseBestMove('bestmove e2e4 ponder e7e5'), { from: 'e2', to: 'e4', promotion: undefined });
    assert.deepEqual(parseBestMove('bestmove e7e8q'), { from: 'e7', to: 'e8', promotion: 'q' });
    assert.deepEqual(parseBestMove('bestmove b2b1n'), { from: 'b2', to: 'b1', promotion: 'n' });
    assert.equal(parseBestMove('bestmove (none)'), null); assert.equal(parseBestMove('info depth 5'), null); assert.equal(parseBestMove(''), null);
    // every move the parser can produce is accepted by chess.js, castling included
    const game = new Chess('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
    const castle = parseBestMove('bestmove e1g1');
    assert.ok(game.move({ from: castle.from, to: castle.to }));
});

test('the built-in search, the fallback when Stockfish cannot start, still answers with a legal move', () => {
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2';
    for (const level of ['easy', 'normal', 'hard']) {
        const move = chooseChessMove(fen, level);
        assert.ok(new Chess(fen).move({ from: move.from, to: move.to, promotion: move.promotion || 'q' }), level);
    }
    assert.equal(chooseChessMove('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', 'hard'), null, 'a stalemated side has no move');
});

test('the vendored Stockfish files are exactly the ones named in NOTICE.md', async () => {
    const dir = new URL('../static/games/vendor/stockfish/', import.meta.url);
    const notice = await readFile(new URL('NOTICE.md', dir), 'utf8');
    for (const name of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']) {
        const hash = createHash('sha256').update(await readFile(new URL(name, dir))).digest('hex');
        assert.ok(notice.includes(hash), `${name}: the file changed (or NOTICE.md is out of date)`);
    }
    assert.match(await readFile(new URL('Copying.txt', dir), 'utf8'), /GNU GENERAL PUBLIC LICENSE/);
});
