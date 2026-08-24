export function frameDelta(now, previous, maximumMilliseconds = 50) {
    if (!Number.isFinite(previous) || previous <= 0) return 0;
    return Math.max(0, Math.min(now - previous, maximumMilliseconds)) / 1000;
}

export function integrate(position, velocityPerSecond, seconds) {
    return position + velocityPerSecond * seconds;
}
