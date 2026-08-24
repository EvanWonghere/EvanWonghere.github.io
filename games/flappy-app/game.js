(function () {
    'use strict';
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const scoreEl = document.getElementById('score-hud');
    const startScreen = document.getElementById('start-screen');
    const gameOverScreen = document.getElementById('game-over-screen');
    const runtime = window.ArcadeRuntime;
    const palettes = {
        coral: { body: '#f06b55', wing: '#ffd166', tail: '#8f3f4b' },
        sun: { body: '#f3b61f', wing: '#fff0a6', tail: '#dd6e42' },
        mint: { body: '#4fb99f', wing: '#d9fff5', tail: '#287271' }
    };
    let palette = palettes.coral;
    let state = 'menu';
    let paused = false;
    let score = 0;
    let best = Number(runtime ? runtime.get('best', 0) : localStorage.getItem('flappy_best')) || 0;
    let pipes = [];
    let spawnTimer = 0;
    let lastTime = 0;
    let retryLockedUntil = 0;
    let worldTime = 0;
    const plane = { x: 0, y: 0, velocity: 0, radius: 14, rotation: 0 };

    function resize() {
        canvas.width = Math.max(320, window.innerWidth);
        canvas.height = Math.max(480, window.innerHeight);
        plane.x = canvas.width * 0.3;
    }

    function resetWorld() {
        plane.y = canvas.height * 0.45;
        plane.velocity = 0;
        plane.rotation = 0;
        pipes = [];
        spawnTimer = 0.9;
        score = 0;
        scoreEl.textContent = '0';
        lastTime = performance.now();
    }

    window.selectChar = function (name) {
        palette = palettes[name] || palettes.coral;
        document.querySelectorAll('.char-btn').forEach((button) => {
            button.classList.toggle('selected', button.dataset.palette === name);
        });
    };

    window.startGame = function () {
        if (performance.now() < retryLockedUntil) return;
        resetWorld();
        state = 'playing';
        plane.velocity = -300;
        startScreen.classList.add('hidden');
        gameOverScreen.classList.add('hidden');
    };

    window.resetGame = function () {
        if (performance.now() < retryLockedUntil) return;
        state = 'menu';
        gameOverScreen.classList.add('hidden');
        startScreen.classList.remove('hidden');
    };

    function flap() {
        if (state !== 'playing' || paused) return;
        plane.velocity = -430;
    }

    function die() {
        if (state !== 'playing') return;
        state = 'dead';
        retryLockedUntil = performance.now() + 450;
        best = Math.max(best, score);
        if (runtime) runtime.set('best', best);
        document.getElementById('final-score').textContent = score;
        document.getElementById('best-score').textContent = best;
        gameOverScreen.classList.remove('hidden');
    }

    function addPipe() {
        const gap = Math.max(132, 178 - score * 1.3);
        const margin = 72;
        const available = canvas.height - gap - margin * 2;
        const top = margin + Math.random() * Math.max(20, available);
        pipes.push({ x: canvas.width + 30, width: 68, top, gap, passed: false });
        spawnTimer = Math.max(1.25, 1.65 - score * 0.012);
    }

    function update(dt) {
        worldTime += dt;
        plane.velocity += 1320 * dt;
        plane.y += plane.velocity * dt;
        plane.rotation = Math.max(-0.42, Math.min(1.2, plane.velocity / 520));
        const speed = Math.min(245, 178 + score * 2.3);
        spawnTimer -= dt;
        if (spawnTimer <= 0) addPipe();

        for (const pipe of pipes) {
            pipe.x -= speed * dt;
            if (!pipe.passed && pipe.x + pipe.width < plane.x) {
                pipe.passed = true;
                score++;
                scoreEl.textContent = score;
            }
            const overlapsX = plane.x + plane.radius > pipe.x && plane.x - plane.radius < pipe.x + pipe.width;
            if (overlapsX && (plane.y - plane.radius < pipe.top || plane.y + plane.radius > pipe.top + pipe.gap)) die();
        }
        pipes = pipes.filter((pipe) => pipe.x + pipe.width > -10);
        if (plane.y - plane.radius < 0 || plane.y + plane.radius > canvas.height - 32) die();
    }

    function drawPlane() {
        ctx.save();
        ctx.translate(plane.x, plane.y);
        ctx.rotate(plane.rotation);
        ctx.fillStyle = palette.body;
        ctx.beginPath(); ctx.ellipse(0, 0, 24, 12, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = palette.wing;
        ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(-20, 18); ctx.lineTo(12, 5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = palette.tail;
        ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(-31, -12); ctx.lineTo(-28, 5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#243447';
        ctx.beginPath(); ctx.arc(13, -4, 3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    function draw() {
        const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
        sky.addColorStop(0, '#79c9d6'); sky.addColorStop(1, '#d7f0dc');
        ctx.fillStyle = sky; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(255,255,255,.55)';
        for (let i = 0; i < 6; i++) {
            const x = ((i * 230 - worldTime * 24) % (canvas.width + 260)) - 80;
            ctx.beginPath(); ctx.ellipse(x, 80 + (i % 3) * 55, 58, 18, 0, 0, Math.PI * 2); ctx.fill();
        }
        pipes.forEach((pipe) => {
            ctx.fillStyle = '#795548';
            ctx.fillRect(pipe.x, 0, pipe.width, pipe.top);
            ctx.fillRect(pipe.x, pipe.top + pipe.gap, pipe.width, canvas.height - pipe.top - pipe.gap);
            ctx.fillStyle = '#a86f4c';
            ctx.fillRect(pipe.x - 5, pipe.top - 18, pipe.width + 10, 18);
            ctx.fillRect(pipe.x - 5, pipe.top + pipe.gap, pipe.width + 10, 18);
            ctx.fillStyle = 'rgba(255,255,255,.18)';
            ctx.fillRect(pipe.x + 9, 0, 8, pipe.top - 18);
            ctx.fillRect(pipe.x + 9, pipe.top + pipe.gap + 18, 8, canvas.height);
        });
        ctx.fillStyle = '#426b4e'; ctx.fillRect(0, canvas.height - 32, canvas.width, 32);
        ctx.fillStyle = '#73a36f'; ctx.fillRect(0, canvas.height - 32, canvas.width, 8);
        drawPlane();
    }

    function loop(now) {
        const dt = runtime ? runtime.clampDelta(now - lastTime) : Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;
        if (state === 'playing' && !paused) update(dt);
        draw();
        requestAnimationFrame(loop);
    }

    window.addEventListener('keydown', (event) => {
        if (!['Space', 'Enter', 'ArrowUp'].includes(event.code)) return;
        event.preventDefault();
        if (state === 'menu') window.startGame();
        flap();
    });
    window.addEventListener('pointerdown', (event) => {
        if (event.target.closest('.panel')) return;
        event.preventDefault();
        flap();
    });
    window.addEventListener('resize', resize);
    window.addEventListener('arcade:pause', () => { paused = true; });
    window.addEventListener('arcade:resume', () => { paused = false; lastTime = performance.now(); });
    resize(); resetWorld(); requestAnimationFrame(loop);
    if (runtime) runtime.ready();
}());
