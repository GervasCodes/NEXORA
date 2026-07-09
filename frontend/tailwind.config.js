/** @type {import('tailwindcss').Config} */
export default {
    content: ["./index.html", "./src/**/*.{js,jsx}"],
    theme: {
        extend: {
            colors: {
                // Brand darks - matches the NEXORA logo's near-black background
                abyss: "#070912",
                abyss2: "#111623",
                // Brand blues - sampled from the actual logo gradient
                azure: "#6EA8FE",
                "azure-light": "#9FC1F2",
                "azure-deep": "#1D4ED8",
                // Body text / page background
                ink: "#111827",
                paper: "#F7F8FB",
                // Warm accent for CTAs - blue-on-blue doesn't give buttons enough
                // pop, so purchase actions stay warm/amber for contrast
                mango: "#F5A623",
                "mango-dark": "#D68D0F",
                teal: "#0F7A6C",
                coral: "#E4572E",
                ash: "#6B7280",
                line: "#E3E6EC"
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
