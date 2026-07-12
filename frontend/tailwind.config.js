/** @type {import('tailwindcss').Config} */

// Wraps a CSS custom property (defined in index.css as space-separated
// RGB, e.g. "17 24 39") so Tailwind's opacity modifiers keep working,
// e.g. `text-paper/80`, `bg-mango/10`. This is what makes theme
// switching (light/dark) apply everywhere these tokens are used, without
// touching every component: swap the variable's value once (in
// :root / .dark in index.css) and every bg-ink / text-paper / border-line
// / etc. in the app repaints automatically.
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
            }
        }
    },
    plugins: []
};
