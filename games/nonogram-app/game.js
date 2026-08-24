import { clues } from '../engines/nonogram.mjs';
import { DIFFICULTIES, LEVELS, levelById, levelsForDifficulty } from './levels.mjs';

const runtime = window.ArcadeRuntime;
const boardEl = document.getElementById('board');
const timerEl = document.getElementById('timer');
const progressEl = document.getElementById('progress');
const titleEl = document.getElementById('puzzle-title');
const overlay = document.getElementById('overlay');
const revealEl = document.getElementById('reveal');
const undoButton = document.getElementById('undo');
const redoButton = document.getElementById('redo');

let level = LEVELS[0];
let difficulty = 'easy';
let state = [];
let active = { row: 0, col: 0 };
let tool = 1;
let dragging = false;
let dragValue = 1;
let stroke = [];
let undoStack = [];
let redoStack = [];
let elapsed = 0;
let running = true;
let lastTick = performance.now();

const storageKey = (suffix) => `nonogram.${level.id}.${suffix}`;
const lineSolved = (values, solution) => values.every((value, index) => (value === 1 ? 1 : 0) === solution[index]);

function difficultyInfo() {
    return DIFFICULTIES.find((item) => item.id === difficulty) || DIFFICULTIES[0];
}

function updateDifficultyTabs() {
    document.querySelectorAll('[data-difficulty]').forEach((button) => {
        const selected = button.dataset.difficulty === difficulty;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', String(selected));
    });
    document.getElementById('pool-count').textContent = `${levelsForDifficulty(difficulty).length} 题`;
}

function randomLevel(nextDifficulty = difficulty) {
    const pool = levelsForDifficulty(nextDifficulty);
    let played = [];
    if (runtime) {
        try { played = JSON.parse(runtime.get(`nonogram.pool.${nextDifficulty}.played`, '[]')); }
        catch (_) { played = []; }
    }
    if (!Array.isArray(played)) played = [];
    const playedSet = new Set(played);
    let available = pool.filter((item) => !playedSet.has(item.id) && item.id !== level.id);
    if (!available.length) { played = []; available = pool.filter((item) => item.id !== level.id); }
    const picked = available[Math.floor(Math.random() * available.length)] || pool[0];
    if (runtime) runtime.set(`nonogram.pool.${nextDifficulty}.played`, JSON.stringify([...played, picked.id]));
    return picked;
}

function newRandomPuzzle(nextDifficulty = difficulty) {
    difficulty = nextDifficulty;
    updateDifficultyTabs();
    load(randomLevel(difficulty).id);
}

function save() {
    if (runtime) runtime.set(storageKey('save'), JSON.stringify({ state, elapsed }));
}

function restore() {
    state = Array.from({ length: level.size }, () => Array(level.size).fill(0));
    elapsed = 0;
    if (!runtime) return;
    try {
        const saved = JSON.parse(runtime.get(storageKey('save'), 'null'));
        if (saved && Array.isArray(saved.state) && saved.state.length === level.size &&
            saved.state.every((row) => Array.isArray(row) && row.length === level.size && row.every((cell) => [0, 1, 2].includes(cell)))) {
            state = saved.state;
            elapsed = Math.max(0, Number(saved.elapsed) || 0);
        }
    } catch (_) { /* 忽略损坏的旧进度 */ }
}

function render() {
    const size = level.size;
    const rowClues = level.solution.map(clues);
    const colClues = level.solution[0].map((_, col) => clues(level.solution.map((row) => row[col])));
    const clueWidth = Math.min(112, Math.max(58, Math.max(...rowClues.map((line) => line.length)) * 24));
    const clueHeight = Math.min(105, Math.max(54, Math.max(...colClues.map((line) => line.length)) * 22));
    const wrap = boardEl.parentElement;
    const availableWidth = Math.max(260, wrap.clientWidth - 18);
    const availableHeight = Math.max(260, wrap.clientHeight - 18);
    const cell = Math.max(14, Math.min(42, (availableWidth - clueWidth) / size, (availableHeight - clueHeight) / size));

    boardEl.innerHTML = '';
    boardEl.style.setProperty('--cell', `${cell}px`);
    boardEl.style.gridTemplateColumns = `${clueWidth}px repeat(${size}, ${cell}px)`;
    boardEl.style.gridTemplateRows = `${clueHeight}px repeat(${size}, ${cell}px)`;
    const corner = document.createElement('div');
    corner.className = 'corner';
    corner.innerHTML = '<span>列</span><span>行</span>';
    boardEl.appendChild(corner);

    for (let col = 0; col < size; col++) {
        const values = state.map((row) => row[col]);
        const clueEl = document.createElement('div');
        clueEl.className = `clue clue-col${lineSolved(values, level.solution.map((row) => row[col])) ? ' solved' : ''}`;
        clueEl.dataset.col = col;
        clueEl.innerHTML = colClues[col].map((value) => `<span>${value}</span>`).join('');
        boardEl.appendChild(clueEl);
    }

    for (let row = 0; row < size; row++) {
        const clueEl = document.createElement('div');
        clueEl.className = `clue clue-row${lineSolved(state[row], level.solution[row]) ? ' solved' : ''}`;
        clueEl.dataset.row = row;
        clueEl.innerHTML = rowClues[row].map((value) => `<span>${value}</span>`).join('');
        boardEl.appendChild(clueEl);
        for (let col = 0; col < size; col++) {
            const cellEl = document.createElement('button');
            cellEl.type = 'button';
            cellEl.className = 'cell';
            cellEl.dataset.row = row;
            cellEl.dataset.col = col;
            cellEl.setAttribute('aria-label', `第 ${row + 1} 行，第 ${col + 1} 列`);
            if (state[row][col] === 1) cellEl.classList.add('filled');
            if (state[row][col] === 2) cellEl.classList.add('crossed');
            if ((row + 1) % 5 === 0 && row !== size - 1) cellEl.classList.add('group-bottom');
            if ((col + 1) % 5 === 0 && col !== size - 1) cellEl.classList.add('group-right');
            cellEl.addEventListener('pointerdown', beginStroke);
            cellEl.addEventListener('pointerenter', continueStroke);
            cellEl.addEventListener('contextmenu', (event) => event.preventDefault());
            boardEl.appendChild(cellEl);
        }
    }
    updateHighlights();
    updateMeta();
}

function updateMeta() {
    progressEl.textContent = `${state.flat().filter((cell) => cell === 1).length} / ${level.solution.flat().filter(Boolean).length}`;
    const info = difficultyInfo();
    titleEl.textContent = `${info.label} · ${info.size}×${info.size}`;
    document.getElementById('puzzle-code').textContent = `随机谜题 ${String(levelsForDifficulty(difficulty).findIndex((item) => item.id === level.id) + 1).padStart(2, '0')}`;
    undoButton.disabled = undoStack.length === 0;
    redoButton.disabled = redoStack.length === 0;
}

function updateHighlights() {
    boardEl.querySelectorAll('[data-row], [data-col]').forEach((element) => {
        const sameRow = element.dataset.row !== undefined && Number(element.dataset.row) === active.row;
        const sameCol = element.dataset.col !== undefined && Number(element.dataset.col) === active.col;
        element.classList.toggle('line-active', sameRow || sameCol);
        if (element.classList.contains('cell')) element.classList.toggle('active', sameRow && sameCol);
    });
}

function applyCell(row, col, value) {
    if (state[row][col] === value) return;
    const existing = stroke.find((change) => change.row === row && change.col === col);
    if (!existing) stroke.push({ row, col, before: state[row][col], after: value });
    else existing.after = value;
    state[row][col] = value;
    active = { row, col };
    render();
}

function beginStroke(event) {
    event.preventDefault();
    dragging = true;
    stroke = [];
    const row = Number(event.currentTarget.dataset.row);
    const col = Number(event.currentTarget.dataset.col);
    const selectedTool = event.button === 2 ? 2 : tool;
    dragValue = state[row][col] === selectedTool ? 0 : selectedTool;
    applyCell(row, col, dragValue);
    window.addEventListener('pointerup', endStroke, { once: true });
    window.addEventListener('pointercancel', endStroke, { once: true });
}

function continueStroke(event) {
    if (dragging) applyCell(Number(event.currentTarget.dataset.row), Number(event.currentTarget.dataset.col), dragValue);
}

function endStroke() {
    if (!dragging) return;
    dragging = false;
    if (stroke.length) {
        undoStack.push(stroke.map((change) => ({ ...change })));
        if (undoStack.length > 100) undoStack.shift();
        redoStack = [];
        save();
        checkWin();
    }
    stroke = [];
    updateMeta();
}

function applyHistory(changes, direction) {
    for (const change of changes) state[change.row][change.col] = change[direction];
    active = { row: changes.at(-1).row, col: changes.at(-1).col };
    save(); render();
}

function undo() {
    const changes = undoStack.pop();
    if (!changes) return;
    redoStack.push(changes); applyHistory(changes, 'before');
}

function redo() {
    const changes = redoStack.pop();
    if (!changes) return;
    undoStack.push(changes); applyHistory(changes, 'after'); checkWin();
}

function checkWin() {
    if (!state.every((row, index) => lineSolved(row, level.solution[index]))) return false;
    running = false;
    revealEl.innerHTML = '';
    revealEl.style.gridTemplateColumns = `repeat(${level.size}, 1fr)`;
    for (const value of level.solution.flat()) {
        const pixel = document.createElement('span');
        if (value) pixel.className = 'on';
        revealEl.appendChild(pixel);
    }
    document.getElementById('win-time').textContent = formatTime(elapsed);
    document.getElementById('win-name').textContent = level.name;
    overlay.classList.add('show');
    if (runtime) runtime.set(storageKey('completed'), 'true');
    return true;
}

function commitSingle(row, col, value) {
    stroke = [];
    applyCell(row, col, state[row][col] === value && value !== 0 ? 0 : value);
    if (stroke.length) undoStack.push(stroke.map((change) => ({ ...change })));
    redoStack = []; stroke = []; save(); render(); checkWin();
}

function hint() {
    const candidates = [];
    for (let row = 0; row < level.size; row++) for (let col = 0; col < level.size; col++) {
        const expected = level.solution[row][col] ? 1 : 2;
        if (state[row][col] !== expected) candidates.push({ row, col, expected });
    }
    candidates.sort((a, b) => Math.abs(a.row - active.row) + Math.abs(a.col - active.col) - Math.abs(b.row - active.row) - Math.abs(b.col - active.col));
    if (candidates[0]) commitSingle(candidates[0].row, candidates[0].col, candidates[0].expected);
}

function setTool(next) {
    tool = next;
    document.querySelectorAll('[data-tool]').forEach((button) => {
        const selected = Number(button.dataset.tool) === tool;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', String(selected));
    });
}

function load(id, clear = false) {
    level = levelById(id);
    difficulty = level.difficulty;
    updateDifficultyTabs();
    active = { row: 0, col: 0 }; undoStack = []; redoStack = [];
    overlay.classList.remove('show'); running = true; lastTick = performance.now();
    if (clear && runtime) runtime.remove(storageKey('save'));
    if (runtime) {
        runtime.set('nonogram.difficulty', difficulty);
        runtime.set(`nonogram.current.${difficulty}`, level.id);
    }
    restore(); render();
}

function selectDifficulty(nextDifficulty) {
    if (nextDifficulty === difficulty) return;
    newRandomPuzzle(nextDifficulty);
}

function formatTime(seconds) {
    const total = Math.floor(seconds);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function tick(now) {
    const dt = Math.min(.25, Math.max(0, (now - lastTick) / 1000));
    lastTick = now;
    if (running && !(runtime && runtime.isPaused())) elapsed += dt;
    timerEl.textContent = formatTime(elapsed);
    requestAnimationFrame(tick);
}

document.querySelectorAll('[data-tool]').forEach((button) => button.addEventListener('click', () => setTool(Number(button.dataset.tool))));
document.querySelectorAll('[data-difficulty]').forEach((button) => button.addEventListener('click', () => selectDifficulty(button.dataset.difficulty)));
document.getElementById('random-puzzle').addEventListener('click', () => newRandomPuzzle());
document.getElementById('reset').addEventListener('click', () => load(level.id, true));
document.getElementById('hint').addEventListener('click', hint);
undoButton.addEventListener('click', undo);
redoButton.addEventListener('click', redo);
document.getElementById('continue').addEventListener('click', () => newRandomPuzzle());

document.addEventListener('keydown', (event) => {
    const navigation = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[event.key];
    if (navigation) {
        event.preventDefault();
        active.row = (active.row + navigation[0] + level.size) % level.size;
        active.col = (active.col + navigation[1] + level.size) % level.size;
        updateHighlights(); return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return; }
    const input = event.code === 'Space' || event.key === 'Enter' ? tool : event.key.toLowerCase() === 'x' ? 2 : ['Backspace', 'Delete'].includes(event.key) ? 0 : null;
    if (input !== null) { event.preventDefault(); commitSingle(active.row, active.col, input); }
    if (event.key.toLowerCase() === 'h') hint();
});

window.addEventListener('resize', render);
window.addEventListener('arcade:pause', save);
window.addEventListener('arcade:resume', () => { lastTick = performance.now(); });
const savedDifficulty = runtime ? runtime.get('nonogram.difficulty', 'easy') : 'easy';
difficulty = DIFFICULTIES.some((item) => item.id === savedDifficulty) ? savedDifficulty : 'easy';
const savedLevelId = runtime ? runtime.get(`nonogram.current.${difficulty}`, '') : '';
const savedLevel = LEVELS.find((item) => item.id === savedLevelId && item.difficulty === difficulty);
load(savedLevel ? savedLevel.id : randomLevel(difficulty).id); setTool(1); requestAnimationFrame(tick);
if (runtime) runtime.ready();
