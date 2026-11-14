import { useEffect, useRef } from "react";
import {
    MAX_BURST_PARTICLES,
    SNOW_COLORS,
    createBurst,
    createSnow,
    createSparkles,
    stepBurst,
    stepSnow
} from "./particles";

// Phase 4: the full-page animation. Loaded lazily by HolidayMount only when
// the theme is visible, so it costs nothing for everyone else.
//
//   christmas -> soft falling snow
//   newyear   -> gentle firework / confetti bursts plus slow gold sparkles
//
// One fixed canvas, pointer-events: none (it never receives a click or a
// touch), sitting under the sticky header and far under dialogs. It does not
// take part in layout, so nothing shifts. The loop stops while the tab is
// hidden and stops for good on unmount.

const MAX_DT = 0.05; // seconds; a long pause must not make particles jump
const MAX_DPR = 1.5;

const isDark = () => document.documentElement.classList.contains("dark");

const drawStar = (ctx, x, y, size) => {
    const s = size;
    const i = size * 0.28;
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + i, y - i);
    ctx.lineTo(x + s, y);
    ctx.lineTo(x + i, y + i);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x - i, y + i);
    ctx.lineTo(x - s, y);
    ctx.lineTo(x - i, y - i);
    ctx.closePath();
    ctx.fill();
};

export default function HolidayLayer({ mode }) {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext?.("2d");
        if (!canvas || !ctx) return undefined;

        let width = 0;
        let height = 0;
        let dpr = 1;
        let raf = 0;
        let last = 0;
        let snow = [];
        let sparkles = [];
        const burst = [];
        let nextBurstIn = 0.6;
        let clock = 0;

        const resize = () => {
            width = window.innerWidth;
            height = window.innerHeight;
            dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            if (mode === "christmas") snow = createSnow(width, height);
            if (mode === "newyear") sparkles = createSparkles(width, height);
        };

        const drawSnow = () => {
            const colors = isDark() ? SNOW_COLORS.dark : SNOW_COLORS.light;
            ctx.fillStyle = colors.fill;
            if (colors.stroke) {
                ctx.strokeStyle = colors.stroke;
                ctx.lineWidth = 1;
            }
            for (const f of snow) {
                ctx.beginPath();
                ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
                ctx.fill();
                if (colors.stroke) ctx.stroke();
            }
        };

        const drawNewYear = (dt) => {
            nextBurstIn -= dt;
            if (nextBurstIn <= 0) {
                const room = MAX_BURST_PARTICLES - burst.length;
                if (room > 8) burst.push(...createBurst(width, height, room));
                nextBurstIn = 2.2 + Math.random() * 1.8;
            }
            stepBurst(burst, dt);

            ctx.fillStyle = "#E9B824";
            for (const s of sparkles) {
                const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(clock * s.speed + s.phase));
                ctx.globalAlpha = a;
                drawStar(ctx, s.x, s.y, s.size);
            }

            for (const p of burst) {
                ctx.globalAlpha = Math.max(0, 1 - p.life / p.ttl);
                ctx.fillStyle = p.color;
                if (p.confetti) {
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate(p.rot);
                    ctx.fillRect(-p.size / 2, -p.size, p.size, p.size * 2);
                    ctx.restore();
                } else {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            ctx.globalAlpha = 1;
        };

        const frame = (now) => {
            const dt = last ? Math.min((now - last) / 1000, MAX_DT) : 0;
            last = now;
            clock += dt;
            ctx.clearRect(0, 0, width, height);
            if (mode === "christmas") {
                stepSnow(snow, dt, width, height);
                drawSnow();
            } else if (mode === "newyear") {
                drawNewYear(dt);
            }
            raf = requestAnimationFrame(frame);
        };

        const start = () => {
            if (raf) return;
            last = 0;
            raf = requestAnimationFrame(frame);
        };
        const stop = () => {
            if (raf) cancelAnimationFrame(raf);
            raf = 0;
        };
        const onVisibility = () => {
            if (document.hidden) stop();
            else start();
        };

        resize();
        window.addEventListener("resize", resize);
        document.addEventListener("visibilitychange", onVisibility);
        if (!document.hidden) start();

        return () => {
            stop();
            window.removeEventListener("resize", resize);
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, [mode]);

    return (
        <canvas
            ref={canvasRef}
            aria-hidden="true"
            data-holiday-layer={mode}
            className="pointer-events-none fixed inset-0 w-full h-full"
            style={{ zIndex: 35 }}
        />
    );
}
