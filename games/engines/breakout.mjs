export const FIXED_STEP = 1 / 120;

const EPSILON = 0.01;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function circleRectContact(circle, rect) {
    const closestX = clamp(circle.x, rect.x, rect.x + rect.w);
    const closestY = clamp(circle.y, rect.y, rect.y + rect.h);
    const dx = circle.x - closestX;
    const dy = circle.y - closestY;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared > circle.r * circle.r) return null;

    if (distanceSquared > EPSILON * EPSILON) {
        const distance = Math.sqrt(distanceSquared);
        return { nx: dx / distance, ny: dy / distance, penetration: circle.r - distance };
    }

    const faces = [
        { distance: circle.x - rect.x, nx: -1, ny: 0 },
        { distance: rect.x + rect.w - circle.x, nx: 1, ny: 0 },
        { distance: circle.y - rect.y, nx: 0, ny: -1 },
        { distance: rect.y + rect.h - circle.y, nx: 0, ny: 1 }
    ].sort((a, b) => a.distance - b.distance);
    return { nx: faces[0].nx, ny: faces[0].ny, penetration: circle.r + faces[0].distance };
}

export function reflect(ball, nx, ny) {
    const projection = ball.vx * nx + ball.vy * ny;
    if (projection >= 0) return false;
    ball.vx -= 2 * projection * nx;
    ball.vy -= 2 * projection * ny;
    return true;
}

export function resolveCircleRect(ball, rect, shouldReflect = true) {
    const contact = circleRectContact(ball, rect);
    if (!contact) return null;
    ball.x += contact.nx * (contact.penetration + EPSILON);
    ball.y += contact.ny * (contact.penetration + EPSILON);
    if (shouldReflect) reflect(ball, contact.nx, contact.ny);
    return contact;
}

function bounceFromPaddle(ball, paddle) {
    const speed = Math.hypot(ball.vx, ball.vy);
    const center = paddle.x + paddle.w / 2;
    const offset = clamp((ball.x - center) / (paddle.w / 2), -1, 1);
    const angle = offset * Math.PI / 3;
    ball.vx = speed * Math.sin(angle) + (paddle.vx || 0) * 0.12;
    ball.vy = -Math.max(speed * Math.cos(angle), speed * 0.38);
    const correctedSpeed = Math.hypot(ball.vx, ball.vy);
    ball.vx *= speed / correctedSpeed;
    ball.vy *= speed / correctedSpeed;
}

/**
 * Advances one ball using adaptive micro-steps. Colliders are resolved after
 * every move, keeping travel below half a radius to prevent fast balls from
 * tunnelling through thin bricks.
 */
export function stepBall(ball, dt, world) {
    const maxTravel = Math.max(ball.r * 0.45, 1);
    const steps = Math.max(1, Math.min(48, Math.ceil(Math.hypot(ball.vx, ball.vy) * dt / maxTravel)));
    const slice = dt / steps;
    const hitThisStep = new Set();

    for (let step = 0; step < steps; step++) {
        ball.x += ball.vx * slice;
        ball.y += ball.vy * slice;

        if (ball.x - ball.r < 0) {
            ball.x = ball.r;
            if (ball.vx < 0) ball.vx *= -1;
            world.onWallHit?.(ball);
        } else if (ball.x + ball.r > world.width) {
            ball.x = world.width - ball.r;
            if (ball.vx > 0) ball.vx *= -1;
            world.onWallHit?.(ball);
        }
        if (ball.y - ball.r < 0) {
            ball.y = ball.r;
            if (ball.vy < 0) ball.vy *= -1;
            world.onWallHit?.(ball);
        }

        if (world.paddle && ball.vy > 0) {
            const contact = resolveCircleRect(ball, world.paddle, false);
            if (contact) {
                bounceFromPaddle(ball, world.paddle);
                world.onPaddleHit?.(ball, contact);
            }
        }

        for (const brick of world.bricks || []) {
            if (!brick.active || hitThisStep.has(brick)) continue;
            const contact = circleRectContact(ball, brick);
            if (!contact) continue;
            hitThisStep.add(brick);
            world.onBrickHit?.(brick, ball, contact);
            if (!world.fireball) {
                ball.x += contact.nx * (contact.penetration + EPSILON);
                ball.y += contact.ny * (contact.penetration + EPSILON);
                reflect(ball, contact.nx, contact.ny);
                break;
            }
        }
    }

    return ball.y - ball.r > world.height;
}
