/** @type {import('tailwindcss').Config} */

// Wraps a CSS custom property (defined in index.css as space-separated
const withOpacity = (variable) => ({ opacityValue }) =>
    opacityValue !== undefined
        ? `rgb(var(${variable}) / ${opacityValue})`
        : `rgb(var(${variable}))`;

export default {
    darkMode: "class",
    content: ["./index.html", "./src/**/*.{js,jsx}"],
    theme: {
        extend: {
            colors: {
                // Brand darks - matches the NEXORA logo's near-black background
                abyss: withOpacity("--color-abyss"),
                abyss2: withOpacity("--color-abyss2"),
                // Brand blues - sampled from the actual logo gradient
                azure: withOpacity("--color-azure"),
                "azure-light": withOpacity("--color-azure-light"),
                "azure-deep": withOpacity("--color-azure-deep"),
                // Body text / page background - theme-aware (see index.css)
                ink: withOpacity("--color-ink"),
                paper: withOpacity("--color-paper"),
                // Warm accent for CTAs - blue-on-blue doesn't give buttons enough
                // pop, so purchase actions stay warm/amber for contrast
                mango: withOpacity("--color-mango"),
                "mango-dark": withOpacity("--color-mango-dark"),
                teal: withOpacity("--color-teal"),
                coral: withOpacity("--color-coral"),
                ash: withOpacity("--color-ash"),
                line: withOpacity("--color-line")
            },
            fontFamily: {
                display: ["Fraunces", "serif"],
                sans: ["Inter", "system-ui", "sans-serif"],
                mono: ["'IBM Plex Mono'", "monospace"]
            },
            backgroundImage: {
                "brand-gradient": "linear-gradient(135deg, #9FC1F2 0%, #6EA8FE 45%, #1D4ED8 100%)"
            },
            keyframes: {
                fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
                slideUp: { from: { opacity: "0", transform: "translateY(12px)" }, to: { opacity: "1", transform: "translateY(0)" } },
                slideDown: { from: { opacity: "0", transform: "translateY(-8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
                scaleIn: { from: { opacity: "0", transform: "scale(0.96)" }, to: { opacity: "1", transform: "scale(1)" } },
                shimmer: { from: { backgroundPosition: "150% 0" }, to: { backgroundPosition: "-50% 0" } },
                ringOnce: {
                    "0%, 100%": { transform: "rotate(0deg)" },
                    "10%": { transform: "rotate(14deg)" },
                    "20%": { transform: "rotate(-10deg)" },
                    "30%": { transform: "rotate(8deg)" },
                    "40%": { transform: "rotate(-4deg)" },
                    "50%": { transform: "rotate(0deg)" }
                },
                popIn: {
                    "0%": { opacity: "0", transform: "scale(0.5)" },
                    "60%": { opacity: "1", transform: "scale(1.15)" },
                    "100%": { opacity: "1", transform: "scale(1)" }
                }
            },
            animation: {
                "fade-in": "fadeIn 0.35s ease-out both",
                "slide-up": "slideUp 0.4s cubic-bezier(0.16,1,0.3,1) both",
                "slide-down": "slideDown 0.25s cubic-bezier(0.16,1,0.3,1) both",
                "scale-in": "scaleIn 0.2s cubic-bezier(0.16,1,0.3,1) both",
                shimmer: "shimmer 1.6s ease-in-out infinite",
                "ring-once": "ringOnce 0.6s ease-in-out 1",
                "pop-in": "popIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both"
            }
        }
    },
    plugins: []
};
