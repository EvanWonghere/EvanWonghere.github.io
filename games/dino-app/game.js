(function () {
    'use strict';
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const scoreEl = document.getElementById('score');
    const overlay = document.getElementById('overlay');
    const msg = document.getElementById('msg');
    const runtime = window.ArcadeRuntime;
    const GROUND = 280;
    const dino = { x: 54, y: 232, w: 42, h: 48, vy: 0, ducking: false, grounded: true };
    let obstacles = [];
    let clouds = [];
    let running = false;
    let paused = false;
    let manualNight = false;
    let elapsed = 0;
    let score = 0;
    let speed = 360;
    let spawnIn = 1.2;
    let lastTime = 0;
    let animation = 0;
    let highScore = Number(runtime ? runtime.get('best', 0) : localStorage.getItem('dino_best')) || 0;

    canvas.width = 800;
    canvas.height = 300;

    function reset() {
        obstacles = [];
        clouds = [{ x: 620, y: 58 }, { x: 350, y: 88 }];
        elapsed = 0;
        score = 0;
        speed = 360;
        spawnIn = 1.15;
        dino.y = GROUND - 48;
        dino.h = 48;
        dino.vy = 0;
        dino.ducking = false;
        dino.grounded = true;
        running = true;
        lastTime = performance.now();
        overlay.classList.add('hidden');
    }

    function jump() {
        if (!running) { reset(); return; }
        if (paused || !dino.grounded) return;
        dino.vy = -760;
        dino.grounded = false;
    }

    function duck(active) {
        if (!running || paused) return;
        if (active && !dino.ducking) {
            dino.ducking = true;
            dino.h = 28;
            dino.y += 20;
            if (!dino.grounded) dino.vy += 520;
        } else if (!active && dino.ducking) {
            dino.ducking = false;
            dino.h = 48;
            dino.y -= 20;
        }
    }

    function spawn() {
        const canFly = score > 250;
        if (canFly && Math.random() < 0.24) {
            const low = Math.random() < 0.55;
            obstacles.push({ type: 'bird', x: 820, y: low ? 222 : 182, w: 46, h: 28 });
        } else {
            const tall = Math.random() < 0.45;
            const cluster = Math.random() < 0.35;
            obstacles.push({ type: 'cactus', x: 820, y: GROUND - (tall ? 52 : 38), w: cluster ? 42 : 24, h: tall ? 52 : 38 });
        }
        const minimumGap = 270 + Math.random() * 180;
        spawnIn = minimumGap / speed;
    }

    function overlaps(a, b) {
        const insetX = 6, insetY = 4;
        return a.x + insetX < b.x + b.w && a.x + a.w - insetX > b.x &&
            a.y + insetY < b.y + b.h && a.y + a.h - insetY > b.y;
    }

    function endGame() {
        running = false;
        highScore = Math.max(highScore, Math.floor(score));
        if (runtime) runtime.set('best', highScore);
        msg.textContent = `GAME OVER · BEST ${String(highScore).padStart(5, '0')}`;
        overlay.classList.remove('hidden');
    }

    function update(dt) {
        elapsed += dt;
        animation += dt;
        speed = Math.min(650, 360 + elapsed * 5.2);
        score += dt * 10;
        scoreEl.textContent = String(Math.floor(score)).padStart(5, '0');

        dino.vy += 2100 * dt;
        dino.y += dino.vy * dt;
        const floor = GROUND - dino.h;
        if (dino.y >= floor) {
            dino.y = floor;
            dino.vy = 0;
            dino.grounded = true;
        }

        spawnIn -= dt;
        if (spawnIn <= 0) spawn();
        obstacles.forEach((item) => { item.x -= speed * dt; });
        obstacles = obstacles.filter((item) => item.x + item.w > -10);
        clouds.forEach((cloud) => { cloud.x -= speed * 0.08 * dt; });
        clouds.forEach((cloud) => { if (cloud.x < -70) { cloud.x = 850; cloud.y = 45 + Math.random() * 70; } });
        if (obstacles.some((item) => overlaps(dino, item))) endGame();
    }

    function pixelRect(x, y, w, h) { ctx.fillRect(Math.round(x), Math.round(y), w, h); }

    function drawDino(color) {
        ctx.fillStyle = color;
        if (dino.ducking) {
            pixelRect(dino.x + 2, dino.y + 8, 38, 18);
            pixelRect(dino.x + 30, dino.y, 24, 20);
            pixelRect(dino.x - 8, dino.y + 13, 16, 8);
            pixelRect(dino.x + (animation % 0.18 < 0.09 ? 8 : 24), dino.y + 24, 8, 6);
        } else {
            pixelRect(dino.x + 12, dino.y + 13, 24, 29);
            pixelRect(dino.x + 25, dino.y, 28, 23);
            pixelRect(dino.x + 45, dino.y + 15, 13, 7);
            pixelRect(dino.x + 3, dino.y + 24, 14, 8);
            const stride = animation % 0.18 < 0.09;
            pixelRect(dino.x + (stride ? 12 : 28), dino.y + 40, 8, 8);
            pixelRect(dino.x + (stride ? 30 : 10), dino.y + 43, 8, 5);
        }
        ctx.fillStyle = document.body.classList.contains('theme-neon') ? '#10151a' : '#f7f7f7';
        pixelRect(dino.x + 43, dino.y + 5, 4, 4);
    }

    function draw() {
        const automaticNight = Math.floor(score / 400) % 2 === 1;
        const night = manualNight !== automaticNight;
        document.body.className = night ? 'theme-neon' : 'theme-classic';
        const color = night ? '#00ffcc' : '#535353';
        const accent = night ? '#ff5aa5' : '#535353';
        ctx.clearRect(0, 0, 800, 300);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, GROUND); ctx.lineTo(800, GROUND); ctx.stroke();

        ctx.fillStyle = color;
        ctx.globalAlpha = 0.32;
        clouds.forEach((cloud) => {
            pixelRect(cloud.x, cloud.y, 46, 6);
            pixelRect(cloud.x + 10, cloud.y - 7, 28, 7);
        });
        ctx.globalAlpha = 1;
        drawDino(color);

        obstacles.forEach((item) => {
            ctx.fillStyle = item.type === 'cactus' ? accent : color;
            if (item.type === 'cactus') {
                pixelRect(item.x + item.w * 0.35, item.y, item.w * 0.3, item.h);
                pixelRect(item.x, item.y + item.h * 0.38, item.w, 8);
                pixelRect(item.x + 2, item.y + item.h * 0.22, 7, item.h * 0.3);
            } else {
                pixelRect(item.x, item.y + 10, item.w, 9);
                pixelRect(item.x + 31, item.y + 5, 18, 8);
                const wing = animation % 0.24 < 0.12 ? 0 : 10;
                pixelRect(item.x + 12, item.y + wing, 17, 8);
            }
        });
    }

    function loop(now) {
        const dt = runtime ? runtime.clampDelta(now - lastTime) : Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;
        if (running && !paused) update(dt);
        draw();
        requestAnimationFrame(loop);
    }

    window.toggleTheme = () => { manualNight = !manualNight; };
    document.addEventListener('keydown', (event) => {
        if (event.code === 'Space' || event.code === 'ArrowUp') { event.preventDefault(); jump(); }
        if (event.code === 'ArrowDown') { event.preventDefault(); duck(true); }
    });
    document.addEventListener('keyup', (event) => { if (event.code === 'ArrowDown') duck(false); });
    document.addEventListener('touchstart', (event) => { event.preventDefault(); jump(); }, { passive: false });
    window.addEventListener('arcade:pause', () => { paused = true; });
    window.addEventListener('arcade:resume', () => { paused = false; lastTime = performance.now(); });
    requestAnimationFrame(loop);
    if (runtime) runtime.ready();
}());
