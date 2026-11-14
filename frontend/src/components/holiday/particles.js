// Phase 4: pure particle maths for the holiday layer. No DOM, no React, so it
// is cheap to unit test and the animation loop in HolidayLayer.jsx stays small.
//
// Every list here has a hard cap. Nothing in this file ever grows without
// bound, whatever the screen size or how long the tab stays open.

export const MAX_SNOWFLAKES = 70;
export const MAX_SNOWFLAKES_SMALL = 36;
export const SMALL_SCREEN_PX = 640;
export const MAX_BURST_PARTICLES = 140;
export const SPARKLE_COUNT = 10;

export const SNOW_COLORS = {
    dark: { fill: "rgba(255,255,255,0.85)", stroke: null },
    // White on a white page is invisible, so in light mode each flake gets a
    // soft blue-grey edge.
    light: { fill: "rgba(255,255,255,0.95)", stroke: "rgba(90,120,160,0.5)" }
};

// Warm gold first, with a few accents. No white: it would vanish in light mode.
export const BURST_COLORS = ["#E9B824", "#F4C430", "#F59E0B", "#EF6F5E", "#4F8DF7", "#2DB5A0"];

const rand = (min, max, rnd = Math.random) => min + rnd() * (max - min);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export const snowCountFor = (width, height) => {
    const cap = width < SMALL_SCREEN_PX ? MAX_SNOWFLAKES_SMALL : MAX_SNOWFLAKES;
    return clamp(Math.round((width * height) / 28000), 20, cap);
};

export const createSnowflake = (width, height, rnd = Math.random, fromTop = false) => ({
    x: rnd() * width,
    y: fromTop ? -4 : rnd() * height,
    r: rand(1, 3.2, rnd),
    vy: rand(18, 46, rnd),
    amp: rand(6, 22, rnd),
    phase: rnd() * Math.PI * 2
});

export const createSnow = (width, height, rnd = Math.random) =>
    Array.from({ length: snowCountFor(width, height) }, () => createSnowflake(width, height, rnd));

// dt in seconds. Flakes that fall off the bottom re-enter at the top.
export const stepSnow = (flakes, dt, width, height, rnd = Math.random) => {
    for (let i = 0; i < flakes.length; i += 1) {
        const f = flakes[i];
        f.phase += dt * 0.8;
        f.y += f.vy * dt;
        f.x += Math.sin(f.phase) * f.amp * dt;
        if (f.y > height + f.r) {
            flakes[i] = createSnowflake(width, height, rnd, true);
        } else if (f.x < -8) {
            f.x = width + 8;
        } else if (f.x > width + 8) {
            f.x = -8;
        }
    }
};

// One burst: sparks (round) and confetti (small rectangles). `room` is how many
// more particles the cap still allows, so the total never exceeds it.
export const createBurst = (width, height, room, rnd = Math.random) => {
    const count = Math.min(Math.max(0, room), Math.round(rand(22, 30, rnd)));
    const cx = rand(width * 0.15, width * 0.85, rnd);
    const cy = rand(height * 0.15, height * 0.5, rnd);
    const color = BURST_COLORS[Math.floor(rnd() * BURST_COLORS.length)];
    const particles = [];
    for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * Math.PI * 2 + rand(-0.15, 0.15, rnd);
        const speed = rand(60, 150, rnd);
        const confetti = rnd() < 0.4;
        particles.push({
            x: cx,
            y: cy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 0,
            ttl: rand(1.1, 1.8, rnd),
            size: confetti ? rand(3, 5, rnd) : rand(1.4, 2.4, rnd),
            confetti,
            rot: rnd() * Math.PI,
            vrot: rand(-6, 6, rnd),
            // Most particles share the burst colour; some take a neighbour's.
            color: rnd() < 0.7 ? color : BURST_COLORS[Math.floor(rnd() * BURST_COLORS.length)]
        });
    }
    return particles;
};

const GRAVITY = 90;

// Returns the particles still alive (same array, filtered in place).
export const stepBurst = (particles, dt) => {
    const drag = 0.985 ** (dt * 60);
    let write = 0;
    for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        p.life += dt;
        if (p.life >= p.ttl) continue;
        p.vx *= drag;
        p.vy = p.vy * drag + GRAVITY * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vrot * dt;
        particles[write] = p;
        write += 1;
    }
    particles.length = write;
    return particles;
};

export const createSparkles = (width, height, rnd = Math.random) =>
    Array.from({ length: SPARKLE_COUNT }, () => ({
        x: rnd() * width,
        y: rnd() * height,
        size: rand(4, 8, rnd),
        phase: rnd() * Math.PI * 2,
        speed: rand(0.6, 1.4, rnd)
    }));
