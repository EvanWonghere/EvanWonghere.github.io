import { FIXED_STEP, stepBall } from '../engines/breakout.mjs';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const menuTitle = document.getElementById('menu-title');
const menuCopy = document.getElementById('menu-copy');
const eyebrow = document.getElementById('eyebrow');
const startButton = document.getElementById('start');
const pauseButton = document.getElementById('pause');
const runtime = window.ArcadeRuntime;

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const SETTINGS = {
    easy: { paddleWidth: 138, speed: 380, lives: 5, dropRate: .2 },
    normal: { paddleWidth: 112, speed: 470, lives: 3, dropRate: .14 },
    hard: { paddleWidth: 88, speed: 575, lives: 2, dropRate: .1 }
};
const PALETTES = {
    neon: { bg:'#050914', grid:'#17233a', paddle:'#65f7ff', ball:'#ffffff', brick:['#ff4fd8','#ff586e','#ffd166','#64f58d','#55a7ff'], laser:'#ff5876' },
    candy: { bg:'#fff2da', grid:'#f0c9bd', paddle:'#ff718d', ball:'#4f3141', brick:['#a78bfa','#70c7e7','#69d5c0','#ffd166','#ff8ea1'], laser:'#ee5678' },
    retro: { bg:'#061008', grid:'#16351b', paddle:'#9cff57', ball:'#d8ff76', brick:['#61c34a','#70d653','#80e75c','#91f76a','#a6ff7e'], laser:'#d8ff76' }
};

let difficulty = runtime?.get('difficulty', 'normal') || 'normal';
let theme = runtime?.get('theme', 'neon') || 'neon';
let state = 'menu';
let resumeState = 'playing';
let shellPaused = false;
let score = 0;
let best = Number(runtime?.get('best', 0) || 0);
let level = 1;
let lives = SETTINGS[difficulty].lives;
let accumulator = 0;
let lastTime = performance.now();
let targetX = WIDTH / 2;
let leftPressed = false;
let rightPressed = false;
let effect = { wide:0, fire:0, laser:0 };
let laserCooldown = 0;
let shake = 0;
let bricks = [];
let balls = [];

const paddle = { x:WIDTH / 2 - 56, y:HEIGHT - 48, w:112, h:15, vx:0 };
const particles = Array.from({ length:220 }, () => ({ active:false, x:0, y:0, vx:0, vy:0, life:0, maxLife:0, size:0, color:'#fff' }));
const powerups = Array.from({ length:18 }, () => ({ active:false, x:0, y:0, vy:0, type:'multi' }));
const lasers = Array.from({ length:24 }, () => ({ active:false, x:0, y:0 }));

function seededRandom(seed) {
    let value = seed >>> 0;
    return () => {
        value += 0x6D2B79F5;
        let t = value;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function initLevel() {
    const random = seededRandom(level * 31337 + 7);
    const rows = Math.min(6 + Math.floor((level - 1) / 2), 10);
    const cols = 10;
    const gap = 7;
    const margin = 26;
    const width = (WIDTH - margin * 2 - gap * (cols - 1)) / cols;
    bricks = [];
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
        const patternedHole = level % 3 === 0 && (row + col) % 7 === 0;
        if (patternedHole || random() < .035) continue;
        const strongChance = Math.min(.08 + level * .025, .42);
        const hp = random() < strongChance ? (random() < .18 ? 3 : 2) : 1;
        bricks.push({
            x:margin + col * (width + gap), y:72 + row * 30,
            w:width, h:21, hp, maxHp:hp, active:true, color:row % 5
        });
    }
}

function resetEffects() {
    effect = { wide:0, fire:0, laser:0 };
    lasers.forEach((laser) => { laser.active = false; });
    powerups.forEach((powerup) => { powerup.active = false; });
    paddle.w = SETTINGS[difficulty].paddleWidth;
}

function serveBall() {
    balls = [{ x:paddle.x + paddle.w / 2, y:paddle.y - 10, r:7, vx:0, vy:0 }];
    state = 'serving';
}

function launch() {
    if (state !== 'serving') return;
    const speed = SETTINGS[difficulty].speed * (1 + Math.min((level - 1) * .025, .22));
    const direction = (level % 2 ? 1 : -1) * .26;
    balls[0].vx = speed * direction;
    balls[0].vy = -Math.sqrt(speed * speed - balls[0].vx * balls[0].vx);
    state = 'playing';
}

function newGame() {
    score = 0;
    level = 1;
    lives = SETTINGS[difficulty].lives;
    paddle.x = WIDTH / 2 - SETTINGS[difficulty].paddleWidth / 2;
    targetX = WIDTH / 2;
    resetEffects();
    initLevel();
    serveBall();
    overlay.classList.add('hidden');
    updateHud();
}

function showMenu(kind) {
    overlay.classList.remove('hidden');
    if (kind === 'pause') {
        eyebrow.textContent = 'SYSTEM HOLD';
        menuTitle.innerHTML = '游戏 <span>暂停</span>';
        menuCopy.textContent = '物理时间已冻结，继续时会重置计时基准。';
        startButton.textContent = '继续游戏';
    } else {
        eyebrow.textContent = kind === 'over' ? 'RUN TERMINATED' : 'ARCADE REFORGED';
        menuTitle.innerHTML = kind === 'over' ? 'GAME <span>OVER</span>' : 'BREAKOUT <span>PRISM</span>';
        menuCopy.textContent = kind === 'over' ? `本局得分 ${score}，最高纪录 ${best}。再来一局，砖墙会重新生成。` : '控制棱镜挡板，击碎能量砖墙。每次开球都由你决定，角度比运气更重要。';
        startButton.textContent = kind === 'over' ? '重新挑战' : '开始游戏';
    }
}

function togglePause() {
    if (state === 'menu' || state === 'over') return;
    if (state === 'paused') {
        state = resumeState;
        overlay.classList.add('hidden');
        lastTime = performance.now();
    } else {
        resumeState = state;
        state = 'paused';
        showMenu('pause');
    }
}

function updateHud() {
    document.getElementById('score').textContent = score;
    document.getElementById('best').textContent = best;
    document.getElementById('level').textContent = level;
    document.getElementById('lives').textContent = lives;
}

function burst(x, y, color, count = 8) {
    let spawned = 0;
    for (const particle of particles) {
        if (particle.active) continue;
        const angle = Math.random() * Math.PI * 2;
        const speed = 65 + Math.random() * 150;
        particle.active = true; particle.x = x; particle.y = y;
        particle.vx = Math.cos(angle) * speed; particle.vy = Math.sin(angle) * speed;
        particle.life = particle.maxLife = .28 + Math.random() * .35;
        particle.size = 2 + Math.random() * 4; particle.color = color;
        if (++spawned >= count) break;
    }
}

function spawnPowerup(brick) {
    const powerup = powerups.find((item) => !item.active);
    if (!powerup) return;
    const types = ['multi','wide','fire','laser'];
    powerup.active = true;
    powerup.x = brick.x + brick.w / 2;
    powerup.y = brick.y + brick.h / 2;
    powerup.vy = 130;
    powerup.type = types[Math.floor(Math.random() * types.length)];
}

function hitBrick(brick) {
    if (!brick.active) return;
    brick.hp--;
    score += brick.hp <= 0 ? 20 * brick.maxHp : 5;
    if (brick.hp <= 0) {
        brick.active = false;
        burst(brick.x + brick.w / 2, brick.y + brick.h / 2, PALETTES[theme].brick[brick.color], 10);
        if (Math.random() < SETTINGS[difficulty].dropRate) spawnPowerup(brick);
    } else {
        burst(brick.x + brick.w / 2, brick.y + brick.h / 2, PALETTES[theme].brick[brick.color], 4);
    }
    shake = Math.max(shake, 3.5);
    if (score > best) {
        best = score;
        runtime?.set('best', String(best));
    }
    updateHud();
}

function activatePowerup(type) {
    if (type === 'multi') {
        const originals = balls.slice(0, Math.max(0, 8 - balls.length));
        for (const ball of originals) balls.push({ ...ball, vx:-ball.vx * .9 + ball.vy * .25, vy:ball.vy * .95 });
    } else if (type === 'wide') {
        effect.wide = 10;
        paddle.w = Math.min(SETTINGS[difficulty].paddleWidth * 1.55, 180);
    } else if (type === 'fire') {
        effect.fire = 8;
    } else if (type === 'laser') {
        effect.laser = 9;
        laserCooldown = 0;
    }
}

function updatePaddle(dt) {
    const previous = paddle.x;
    if (leftPressed !== rightPressed) targetX += (rightPressed ? 1 : -1) * 650 * dt;
    targetX = Math.max(paddle.w / 2, Math.min(WIDTH - paddle.w / 2, targetX));
    const desired = targetX - paddle.w / 2;
    const maxMove = 920 * dt;
    paddle.x += Math.max(-maxMove, Math.min(maxMove, desired - paddle.x));
    paddle.x = Math.max(0, Math.min(WIDTH - paddle.w, paddle.x));
    paddle.vx = (paddle.x - previous) / dt;
}

function updateEffects(dt) {
    for (const key of ['wide','fire','laser']) effect[key] = Math.max(0, effect[key] - dt);
    if (!effect.wide && paddle.w !== SETTINGS[difficulty].paddleWidth) {
        const center = paddle.x + paddle.w / 2;
        paddle.w = SETTINGS[difficulty].paddleWidth;
        paddle.x = Math.max(0, Math.min(WIDTH - paddle.w, center - paddle.w / 2));
    }
    if (effect.laser) {
        laserCooldown -= dt;
        if (laserCooldown <= 0) {
            for (const x of [paddle.x + 4, paddle.x + paddle.w - 8]) {
                const laser = lasers.find((item) => !item.active);
                if (laser) { laser.active = true; laser.x = x; laser.y = paddle.y - 8; }
            }
            laserCooldown = .42;
        }
    }
}

function updateProjectiles(dt) {
    for (const laser of lasers) {
        if (!laser.active) continue;
        laser.y -= 680 * dt;
        if (laser.y < -14) { laser.active = false; continue; }
        for (const brick of bricks) {
            if (!brick.active) continue;
            if (laser.x + 4 > brick.x && laser.x < brick.x + brick.w && laser.y + 13 > brick.y && laser.y < brick.y + brick.h) {
                hitBrick(brick); laser.active = false; break;
            }
        }
    }
}

function updatePowerups(dt) {
    for (const powerup of powerups) {
        if (!powerup.active) continue;
        powerup.y += powerup.vy * dt;
        if (powerup.y > HEIGHT + 20) { powerup.active = false; continue; }
        if (powerup.x + 12 > paddle.x && powerup.x - 12 < paddle.x + paddle.w && powerup.y + 12 > paddle.y && powerup.y - 12 < paddle.y + paddle.h) {
            powerup.active = false;
            activatePowerup(powerup.type);
            burst(powerup.x, powerup.y, PALETTES[theme].paddle, 14);
        }
    }
}

function updateParticles(dt) {
    for (const particle of particles) {
        if (!particle.active) continue;
        particle.x += particle.vx * dt; particle.y += particle.vy * dt;
        particle.vy += 120 * dt; particle.life -= dt;
        if (particle.life <= 0) particle.active = false;
    }
    shake = Math.max(0, shake - 24 * dt);
}

function update(dt) {
    updatePaddle(dt);
    updateParticles(dt);
    if (state === 'serving') {
        balls[0].x = paddle.x + paddle.w / 2;
        balls[0].y = paddle.y - balls[0].r - 2;
        return;
    }
    if (state !== 'playing') return;
    updateEffects(dt);
    updateProjectiles(dt);
    updatePowerups(dt);

    const surviving = [];
    for (const ball of balls) {
        const lost = stepBall(ball, dt, {
            width:WIDTH, height:HEIGHT, paddle, bricks, fireball:effect.fire > 0,
            onBrickHit:hitBrick,
            onPaddleHit:(hitBall) => burst(hitBall.x, hitBall.y, PALETTES[theme].paddle, 4)
        });
        if (!lost) surviving.push(ball);
    }
    balls = surviving;

    if (bricks.every((brick) => !brick.active)) {
        score += 250 * level;
        level++;
        resetEffects(); initLevel(); serveBall(); updateHud();
        return;
    }
    if (!balls.length) {
        lives--;
        resetEffects();
        updateHud();
        if (lives > 0) serveBall();
        else { state = 'over'; showMenu('over'); }
    }
}

function roundRect(x, y, w, h, radius) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill();
}

function render() {
    const colors = PALETTES[theme];
    ctx.save();
    if (shake) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);
    ctx.fillStyle = colors.bg; ctx.fillRect(-5, -5, WIDTH + 10, HEIGHT + 10);
    ctx.strokeStyle = colors.grid; ctx.lineWidth = 1;
    for (let x = 0; x <= WIDTH; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, HEIGHT); ctx.stroke(); }
    for (let y = 0; y <= HEIGHT; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); ctx.stroke(); }

    for (const brick of bricks) {
        if (!brick.active) continue;
        const color = colors.brick[brick.color];
        ctx.fillStyle = color;
        if (theme === 'neon') { ctx.shadowColor = color; ctx.shadowBlur = 10; }
        roundRect(brick.x, brick.y, brick.w, brick.h, theme === 'retro' ? 0 : 5);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff35'; roundRect(brick.x + 3, brick.y + 3, brick.w - 6, 3, 2);
        if (brick.maxHp > 1) {
            ctx.fillStyle = theme === 'candy' ? '#513445aa' : '#07101acc';
            ctx.font = '700 10px system-ui'; ctx.textAlign = 'center';
            ctx.fillText(String(brick.hp), brick.x + brick.w / 2, brick.y + 15);
        }
    }

    ctx.fillStyle = colors.paddle;
    if (theme === 'neon') { ctx.shadowColor = colors.paddle; ctx.shadowBlur = 16; }
    roundRect(paddle.x, paddle.y, paddle.w, paddle.h, theme === 'retro' ? 0 : 8);
    ctx.shadowBlur = 0;
    if (effect.laser) { ctx.fillRect(paddle.x + 2, paddle.y - 8, 6, 10); ctx.fillRect(paddle.x + paddle.w - 8, paddle.y - 8, 6, 10); }

    for (const ball of balls) {
        ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
        ctx.fillStyle = effect.fire ? '#ff684d' : colors.ball;
        ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = theme === 'neon' ? 14 : 4; ctx.fill(); ctx.shadowBlur = 0;
    }
    ctx.fillStyle = colors.laser;
    for (const laser of lasers) if (laser.active) roundRect(laser.x, laser.y, 4, 13, 2);

    const icons = { multi:'M', wide:'W', fire:'F', laser:'L' };
    for (const powerup of powerups) if (powerup.active) {
        ctx.fillStyle = colors.ball; ctx.shadowColor = colors.paddle; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(powerup.x, powerup.y, 12, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
        ctx.fillStyle = colors.bg; ctx.font = '800 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(icons[powerup.type], powerup.x, powerup.y + 4);
    }
    for (const particle of particles) if (particle.active) {
        ctx.globalAlpha = particle.life / particle.maxLife; ctx.fillStyle = particle.color;
        ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    }
    ctx.globalAlpha = 1;

    if (state === 'serving') {
        ctx.fillStyle = theme === 'candy' ? '#513445cc' : '#eff8ffcc';
        ctx.font = '700 16px system-ui'; ctx.textAlign = 'center';
        ctx.fillText('点击 / 空格 发球', WIDTH / 2, HEIGHT - 82);
    }
    ctx.restore();
}

function frame(now) {
    const elapsed = Math.min((now - lastTime) / 1000, .08);
    lastTime = now;
    if (!shellPaused && state !== 'paused' && state !== 'menu' && state !== 'over') {
        accumulator = Math.min(accumulator + elapsed, .12);
        while (accumulator >= FIXED_STEP) { update(FIXED_STEP); accumulator -= FIXED_STEP; }
    }
    render();
    requestAnimationFrame(frame);
}

function setPointer(event) {
    const rect = canvas.getBoundingClientRect();
    targetX = (event.clientX - rect.left) * WIDTH / rect.width;
}

canvas.addEventListener('pointermove', setPointer);
canvas.addEventListener('pointerdown', (event) => { event.preventDefault(); setPointer(event); launch(); });
pauseButton.addEventListener('click', (event) => { event.stopPropagation(); togglePause(); });
startButton.addEventListener('click', () => state === 'paused' ? togglePause() : newGame());

document.querySelectorAll('[data-difficulty]').forEach((button) => button.addEventListener('click', () => {
    if (state !== 'menu' && state !== 'over') return;
    difficulty = button.dataset.difficulty;
    runtime?.set('difficulty', difficulty);
    document.querySelectorAll('[data-difficulty]').forEach((item) => item.classList.toggle('active', item === button));
}));
document.querySelectorAll('[data-theme]').forEach((button) => button.addEventListener('click', () => {
    theme = button.dataset.theme;
    document.body.dataset.theme = theme;
    runtime?.set('theme', theme);
    document.querySelectorAll('[data-theme]').forEach((item) => item.classList.toggle('active', item === button));
}));

document.addEventListener('keydown', (event) => {
    if (['ArrowLeft','ArrowRight','Space'].includes(event.code)) event.preventDefault();
    if (event.code === 'ArrowLeft') leftPressed = true;
    if (event.code === 'ArrowRight') rightPressed = true;
    if (event.code === 'Space') launch();
    if (event.key.toLowerCase() === 'p') togglePause();
});
document.addEventListener('keyup', (event) => {
    if (event.code === 'ArrowLeft') leftPressed = false;
    if (event.code === 'ArrowRight') rightPressed = false;
});
window.addEventListener('arcade:pause', () => { shellPaused = true; });
window.addEventListener('arcade:resume', () => { shellPaused = false; lastTime = performance.now(); accumulator = 0; });

document.body.dataset.theme = theme;
document.querySelectorAll('[data-theme]').forEach((button) => button.classList.toggle('active', button.dataset.theme === theme));
document.querySelectorAll('[data-difficulty]').forEach((button) => button.classList.toggle('active', button.dataset.difficulty === difficulty));
initLevel(); updateHud(); render(); requestAnimationFrame(frame);
runtime?.ready();
