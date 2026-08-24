import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

import { generateSudoku as generateExtremeSudoku, countSolutions, solve } from '../static/games/engines/sudoku.mjs';
import { Chess } from '../static/games/vendor/chess.js/chess.js';
import { chooseChessMove } from '../static/games/chess-app/ai-worker.js';
import { moveLine, moveBoard } from '../static/games/engines/board2048.mjs';
import { FIXED_STEP, circleRectContact, stepBall } from '../static/games/engines/breakout.mjs';
import { clues, countNonogramSolutions } from '../static/games/engines/nonogram.mjs';
import { DIFFICULTIES as NONOGRAM_DIFFICULTIES, LEVELS as NONOGRAM_LEVELS, levelsForDifficulty } from '../static/games/nonogram-app/levels.mjs';
import { SevenBag, PIECES, scoreClear } from '../static/games/engines/tetris.mjs';
import { frameDelta, integrate } from '../static/games/engines/timing.mjs';
import { annotateMines, isLogicallySolvable } from '../static/games/engines/minesweeper.mjs';

const sudokuContext = vm.createContext({});
vm.runInContext(await readFile(new URL('../static/games/vendor/sudoku.js/sudoku.js', import.meta.url), 'utf8'), sudokuContext);
const sudokuVendor = sudokuContext.sudoku;

const xiangqiContext = vm.createContext({});
vm.runInContext(await readFile(new URL('../static/games/vendor/xiangqi.js/xiangqi.min.js', import.meta.url), 'utf8'), xiangqiContext);
const createXiangqi = (fen) => vm.runInContext(`new Xiangqi(${fen ? JSON.stringify(fen) : ''})`, xiangqiContext);

test('每个数独难度生成 100 个指定提示数的唯一解棋盘', { timeout: 120_000 }, () => {
    for (const givens of [53, 44, 35, 26]) {
        for (let sample = 0; sample < 100; sample++) {
            const puzzleString = givens === 26
                ? generateExtremeSudoku(26).puzzle.flat().map(value => value || '.').join('')
                : sudokuVendor.generate(givens, true);
            const solutionString = sudokuVendor.solve(puzzleString);
            const puzzle = sudokuVendor.board_string_to_grid(puzzleString)
                .map(row => row.map(value => value === '.' ? 0 : Number(value)));
            const solution = sudokuVendor.board_string_to_grid(solutionString)
                .map(row => row.map(Number));
            const actualGivens = puzzle.flat().filter(Boolean).length;
            assert.equal(actualGivens, givens);
            assert.equal(countSolutions(puzzle, 2), 1);
            assert.deepEqual(solve(puzzle), solution);
        }
    }
});

test('2048 每个方块一轮最多合并一次', () => {
    assert.deepEqual(moveLine([2, 2, 2, 2]), { values: [4, 4, 0, 0], gain: 8 });
    assert.deepEqual(moveLine([4, 4, 8, 0]), { values: [8, 8, 0, 0], gain: 8 });
    const moved = moveBoard([[2, 2, 2, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], 'left');
    assert.deepEqual(moved.board[0], [4, 4, 0, 0]);
});

test('打砖块使用正确碰撞法线并阻止高速穿透', () => {
    const brick = { x: 100, y: 100, w: 80, h: 20, active: true };
    assert.deepEqual(circleRectContact({ x: 94, y: 110, r: 7 }, brick), { nx: -1, ny: 0, penetration: 1 });
    const corner = circleRectContact({ x: 96, y: 96, r: 7 }, brick);
    assert.ok(corner.nx < 0 && corner.ny < 0);

    let hitCount = 0;
    const ball = { x: 140, y: 60, r: 6, vx: 0, vy: 2400 };
    stepBall(ball, 1 / 30, {
        width: 300, height: 400, paddle: null, bricks: [brick],
        onBrickHit: () => { hitCount++; brick.active = false; }
    });
    assert.equal(hitCount, 1);
    assert.ok(ball.vy < 0, '高速球应在砖块上表面反弹');
    assert.ok(ball.y < brick.y, '高速球不应穿到砖块下方');
});

test('打砖块固定时间步在 30/60/144Hz 下保持一致', () => {
    const simulate = (hz) => {
        const ball = { x: 150, y: 250, r: 6, vx: 173, vy: -241 };
        let accumulator = 0;
        for (let frame = 0; frame < hz * 4; frame++) {
            accumulator += 1 / hz;
            while (accumulator + 1e-12 >= FIXED_STEP) {
                stepBall(ball, FIXED_STEP, { width: 600, height: 760, paddle: null, bricks: [] });
                accumulator -= FIXED_STEP;
            }
        }
        return ball;
    };
    const baseline = simulate(60);
    for (const hz of [30, 144]) {
        const result = simulate(hz);
        assert.ok(Math.abs(result.x - baseline.x) < .001, `${hz}Hz x`);
        assert.ok(Math.abs(result.y - baseline.y) < .001, `${hz}Hz y`);
        assert.ok(Math.abs(result.vx - baseline.vx) < .001, `${hz}Hz vx`);
        assert.ok(Math.abs(result.vy - baseline.vy) < .001, `${hz}Hz vy`);
    }
});

test('方块堆叠的每个 7-bag 恰好包含七种方块', () => {
    const bag = new SevenBag(() => 0.42);
    for (let batch = 0; batch < 20; batch++) {
        assert.deepEqual(new Set(Array.from({ length: 7 }, () => bag.next())), new Set(PIECES));
    }
    assert.equal(scoreClear(4, 2, { backToBack: true, combo: 2 }), 2600);
});

test('所有随游戏发布的数织关卡都恰好有一个解', { timeout: 30_000 }, () => {
    assert.ok(NONOGRAM_LEVELS.length >= 60);
    assert.equal(new Set(NONOGRAM_LEVELS.map(level => level.id)).size, NONOGRAM_LEVELS.length);
    for (const difficulty of NONOGRAM_DIFFICULTIES) {
        const pool = levelsForDifficulty(difficulty.id);
        assert.ok(pool.length >= 20, difficulty.id);
        assert.ok(pool.every(level => level.size === difficulty.size), difficulty.id);
        const signatures = pool.map(level => level.solution.map(clues).map(line => line.join(',')).join('|'));
        assert.equal(new Set(signatures).size, pool.length, `${difficulty.id} 存在重复谜题`);
    }
    for (const level of NONOGRAM_LEVELS) {
        const rowClues = level.solution.map(clues);
        const colClues = level.solution[0].map((_, col) => clues(level.solution.map(row => row[col])));
        assert.equal(countNonogramSolutions(rowClues, colClues, 2), 1, level.id);
    }
});

test('数织界面只选择难度，并在该难度题库中随机出题', async () => {
    const html = await readFile(new URL('../static/games/nonogram-app/index.html', import.meta.url), 'utf8');
    const source = await readFile(new URL('../static/games/nonogram-app/game.js', import.meta.url), 'utf8');
    assert.doesNotMatch(html, /id=["']level-select["']/);
    assert.equal((html.match(/data-difficulty=/g) || []).length, 3);
    assert.match(html, /id="random-puzzle"/);
    assert.match(source, /levelsForDifficulty\(nextDifficulty\)/);
    assert.match(source, /nonogram\.pool\.\$\{nextDifficulty\}\.played/);
});

test('游戏厅品牌名称与游戏内界面保持同步', async () => {
    const brands = {
        breakout: 'Breakout Prism',
        dino: '恐龙快跑',
        flappy: 'Flappy Flight',
        nonogram: '数织工坊',
        tetris: '方块堆叠',
        wordle: 'Hive Words'
    };
    for (const [slug, brand] of Object.entries(brands)) {
        const page = await readFile(new URL(`../content/games/${slug}.md`, import.meta.url), 'utf8');
        const game = await readFile(new URL(`../static/games/${slug}-app/index.html`, import.meta.url), 'utf8');
        assert.match(page, new RegExp(`title: ["']${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`));
        assert.ok(game.includes(brand), `${slug} 游戏内缺少品牌名称 ${brand}`);
    }
});

test('三款棋类游戏的电脑对手均在 Worker 中运行并提供三级强度', async () => {
    for (const slug of ['gomoku', 'chess', 'xiangqi']) {
        const html = await readFile(new URL(`../static/games/${slug}-app/index.html`, import.meta.url), 'utf8');
        assert.match(html, /value="easy"/);
        assert.match(html, /value="normal"/);
        assert.match(html, /value="hard"/);
        assert.match(html, /new Worker\(['"](?:ai-)?worker\.js/);
    }
});

test('棋类电脑对手返回合法走法并优先处理五子棋立即胜负', async () => {
    const chess = new Chess();
    chess.move('e4');
    const chessMove = chooseChessMove(chess.fen(), 'normal');
    assert.ok(chess.moves({ verbose: true }).some(move => move.from === chessMove.from && move.to === chessMove.to));

    let gomokuHandler;
    let gomokuReply;
    const gomokuContext = vm.createContext({
        performance,
        self: {
            addEventListener: (_, handler) => { gomokuHandler = handler; },
            postMessage: message => { gomokuReply = message; }
        }
    });
    vm.runInContext(await readFile(new URL('../static/games/gomoku-app/worker.js', import.meta.url), 'utf8'), gomokuContext);
    const forcedBoard = Array.from({ length: 15 }, () => Array(15).fill(0));
    [4, 5, 6, 7].forEach(col => { forcedBoard[7][col] = 2; });
    gomokuHandler({ data: { id: 1, board: forcedBoard, difficulty: 'hard' } });
    assert.equal(gomokuReply.id, 1);
    assert.ok(gomokuReply.move.r === 7 && [3, 8].includes(gomokuReply.move.c));

    let xiangqiHandler;
    let xiangqiReply;
    const xiangqiAiContext = vm.createContext({
        performance,
        importScripts: () => {},
        self: {
            addEventListener: (_, handler) => { xiangqiHandler = handler; },
            postMessage: message => { xiangqiReply = message; }
        }
    });
    vm.runInContext(await readFile(new URL('../static/games/vendor/xiangqi.js/xiangqi.min.js', import.meta.url), 'utf8'), xiangqiAiContext);
    vm.runInContext(await readFile(new URL('../static/games/xiangqi-app/ai-worker.js', import.meta.url), 'utf8'), xiangqiAiContext);
    const xiangqi = vm.runInContext('new Xiangqi()', xiangqiAiContext);
    xiangqi.move('e3e4');
    xiangqiHandler({ data: { id: 2, fen: xiangqi.fen(), difficulty: 'easy' } });
    assert.equal(xiangqiReply.id, 2);
    assert.ok(xiangqi.moves({ verbose: true }).some(move => move.from === xiangqiReply.move.from && move.to === xiangqiReply.move.to));
});

test('无猜扫雷求解器能完成确定性棋盘', () => {
    const board = annotateMines([
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 0, 1, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0]
    ]);
    assert.equal(isLogicallySolvable(board, 0, 0), true);
});

test('按时间积分不受 30/60/144Hz 刷新率影响', () => {
    for (const hz of [30, 60, 144]) {
        let position = 0;
        let previous = 1;
        for (let frame = 1; frame <= hz * 10; frame++) {
            const now = 1 + frame * 1000 / hz;
            position = integrate(position, 180, frameDelta(now, previous));
            previous = now;
        }
        assert.ok(Math.abs(position - 1800) < 0.001, `${hz}Hz: ${position}`);
    }
});

test('游戏外壳通过握手消除 ready 竞态并恢复首次键盘焦点', async () => {
    const shell = await readFile(new URL('../layouts/games/single.html', import.meta.url), 'utf8');
    const runtime = await readFile(new URL('../static/games/arcade-runtime.js', import.meta.url), 'utf8');
    assert.match(shell, /postToGame\("arcade:hello", "handshake"\)/);
    assert.match(shell, /frame\.focus\(\)/);
    assert.match(runtime, /data\.type === 'arcade:hello' && readySent/);
    assert.match(runtime, /data\.type === 'arcade:key'/);
});

test('chess.js 覆盖易位、吃过路兵、升变、悔棋和所有终局', () => {
    const castling = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const kingTargets = castling.moves({ square: 'e1', verbose: true }).map(move => move.to);
    assert.ok(kingTargets.includes('g1'));
    assert.ok(kingTargets.includes('c1'));

    const enPassant = new Chess();
    ['e4', 'a6', 'e5', 'd5'].forEach(move => assert.ok(enPassant.move(move)));
    const capture = enPassant.move({ from: 'e5', to: 'd6' });
    assert.ok(capture.flags.includes('e'));
    assert.equal(enPassant.undo().to, 'd6');

    const promotion = new Chess('8/P7/8/8/8/8/7k/4K3 w - - 0 1');
    assert.equal(promotion.move({ from: 'a7', to: 'a8', promotion: 'n' }).promotion, 'n');

    const mate = new Chess();
    ['f3', 'e5', 'g4', 'Qh4#'].forEach(move => mate.move(move));
    assert.equal(mate.isCheckmate(), true);
    assert.equal(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1').isStalemate(), true);
    assert.equal(new Chess('8/8/8/8/8/8/1k6/4K2R w - - 100 1').isDrawByFiftyMoves(), true);
    assert.equal(new Chess('8/8/8/8/8/8/1k6/4K3 w - - 0 1').isInsufficientMaterial(), true);

    const repetition = new Chess();
    ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8'].forEach(move => repetition.move(move));
    assert.equal(repetition.isThreefoldRepetition(), true);
});

test('国际象棋界面以 chess.js 为唯一规则状态源', async () => {
    const source = await readFile(new URL('../static/games/chess-app/index.html', import.meta.url), 'utf8');
    assert.match(source, /import \{ Chess \} from '\/games\/vendor\/chess\.js\/chess\.js'/);
    assert.match(source, /chessEngine\.moves/);
    assert.match(source, /chessEngine\.move/);
    assert.match(source, /chessEngine\.undo/);
    assert.match(source, /board\.length !== BOARD_SIZE/);
});

test('xiangqi.js 覆盖合法走法、将死、困毙、重复和悔棋重做', () => {
    const game = createXiangqi();
    assert.deepEqual(Array.from(game.moves({ square: 'b0' })).sort(), ['b0a2', 'b0c2']);
    const first = game.move('h0g2');
    assert.ok(first);
    assert.ok(game.undo());
    assert.equal(game.get('h0').type, 'n');
    assert.ok(game.redo());
    assert.equal(game.get('g2').type, 'n');

    assert.equal(createXiangqi('4k4/9/9/9/9/9/9/9/4Ar3/2r1K4 r - - 0 7').in_checkmate(), true);
    assert.equal(createXiangqi('3aca3/1Cnrk4/b3r4/2p1n4/2b6/9/9/9/4C4/ppppcK3 b - - 0 1').in_stalemate(), true);

    const repetition = createXiangqi();
    ['h0g2', 'h9g7', 'g2h0', 'g7h9', 'h0g2', 'h9g7', 'g2h0', 'g7h9']
        .forEach(move => repetition.move(move));
    assert.equal(repetition.in_threefold_repetition(), true);
});

test('中国象棋界面以 xiangqi.js 为唯一规则状态源', async () => {
    const source = await readFile(new URL('../static/games/xiangqi-app/index.html', import.meta.url), 'utf8');
    assert.match(source, /vendor\/xiangqi\.js\/xiangqi\.min\.js/);
    assert.match(source, /xiangqiEngine\.moves/);
    assert.match(source, /xiangqiEngine\.move/);
    assert.match(source, /xiangqiEngine\.undo/);
    assert.match(source, /xiangqiEngine\.redo/);
});
