// Shared between StorePage.jsx (a seller's own social links) and
// Footer.jsx (NEXORA's own company social links) - previously lived
// inside StorePage.jsx and was re-exported from there, but StorePage
// is lazy-loaded per-route (see App.jsx) while Footer renders on every
// page. Footer's static `import { SocialIcon } from "../pages/StorePage"`
// pulled the entire StorePage chunk (reviews, product grid, follow/unfollow,
// etc.) into the main bundle, defeating that route-level code-splitting.
// Living in its own file, both call sites get just the four icon paths.
//
// `colored`  brand-colored badges (Instagram gradient, Facebook
// blue, TikTok black+cyan+pink, YouTube red) instead of the plain
// currentColor outline. Defaults to false so StorePage's seller social
// links keep their existing monotone look unless it opts in; Footer.jsx
// passes colored explicitly.
export function SocialIcon({ name, colored = false }) {
    if (!colored) {
        if (name === "instagram") {
            return (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
                    <rect x="3" y="3" width="18" height="18" rx="5" />
                    <circle cx="12" cy="12" r="4" />
                    <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
                </svg>
            );
        }
        if (name === "facebook") {
            return (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
                    <path d="M14 21v-7h2.5l.5-3H14V9c0-1 .3-1.7 1.7-1.7H17V4.6c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4V11H8.5v3H10.8v7Z" strokeLinejoin="round" />
                </svg>
            );
        }
        if (name === "tiktok") {
            return (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
                    <circle cx="9.5" cy="16.5" r="3" />
                    <path d="M12.5 16.5V3.5" strokeLinecap="round" />
                    <path d="M12.5 7c.6 2.2 2.6 3.8 5 3.8" strokeLinecap="round" />
                </svg>
            );
        }
        if (name === "youtube") {
            return (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
                    <rect x="3" y="6" width="18" height="12" rx="4" />
                    <path d="M10.3 9.3v5.4l4.7-2.7Z" fill="currentColor" stroke="none" />
                </svg>
            );
        }
        return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
                <path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Z" strokeLinejoin="round" />
                <path d="M8.5 8.5c.3-.6 1-.6 1.3 0l.6 1.2c.2.4 0 .8-.3 1.1-.4.4-.4.8-.1 1.3.5.9 1.3 1.7 2.2 2.2.5.3.9.3 1.3-.1.3-.3.7-.5 1.1-.3l1.2.6c.6.3.6 1 0 1.3-1 .6-2.3.8-3.5.2-1.7-.8-3.1-2.2-3.9-3.9-.6-1.2-.4-2.5.2-3.5Z" strokeLinejoin="round" />
            </svg>
        );
    }

    // Colored variants. Same glyph shapes as above, drawn in white, over a
    // brand-colored (or brand-gradient) tile instead of a transparent
    // currentColor outline - this is a faithful stylized mark, not a
    // pixel-exact trace of each company's official logo artwork.
    if (name === "instagram") {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-4 h-4">
                <defs>
                    <linearGradient id="ig-grad" x1="0" y1="24" x2="24" y2="0">
                        <stop offset="0" stopColor="#F58529" />
                        <stop offset="0.45" stopColor="#DD2A7B" />
                        <stop offset="0.75" stopColor="#8134AF" />
                        <stop offset="1" stopColor="#515BD4" />
                    </linearGradient>
                </defs>
                <rect x="1" y="1" width="22" height="22" rx="6" fill="url(#ig-grad)" />
                <circle cx="12" cy="12" r="5" fill="none" stroke="#fff" strokeWidth="1.6" />
                <circle cx="17.6" cy="6.4" r="1.15" fill="#fff" />
            </svg>
        );
    }
    if (name === "facebook") {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-4 h-4">
                <circle cx="12" cy="12" r="11" fill="#1877F2" />
                <path d="M14 21v-7h2.3l.4-2.8H14V9.4c0-.8.2-1.3 1.3-1.3H17V5.6c-.3 0-1.1-.1-2.1-.1-2.2 0-3.6 1.3-3.6 3.8v2h-2.3v2.8H11.3V21Z" fill="#fff" />
            </svg>
        );
    }
    if (name === "tiktok") {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-4 h-4">
                <rect x="1" y="1" width="22" height="22" rx="6" fill="#010101" />
                <path d="M13.2 5.5h1.9c.2 1.4 1.3 2.6 2.8 2.8v1.9c-1 0-1.9-.3-2.7-.8v4.7a4 4 0 1 1-3.4-4v1.9a2.1 2.1 0 1 0 1.5 2V5.5Z" fill="#25F4EE" opacity="0.85" />
                <path d="M12.7 5.5h1.9c.2 1.4 1.3 2.6 2.8 2.8v1.9c-1 0-1.9-.3-2.7-.8v4.7a4 4 0 1 1-3.4-4v1.9a2.1 2.1 0 1 0 1.5 2V5.5Z" fill="#FE2C55" opacity="0.85" />
                <path d="M13 5.5h1.8c.2 1.4 1.3 2.6 2.8 2.8v1.9c-1 0-1.9-.3-2.6-.8v4.7a4 4 0 1 1-3.4-4v1.9a2.1 2.1 0 1 0 1.5 2V5.5Z" fill="#fff" />
            </svg>
        );
    }
    if (name === "youtube") {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-4 h-4">
                <rect x="1" y="4" width="22" height="16" rx="5" fill="#FF0000" />
                <path d="M10 8.7v6.6l5.8-3.3Z" fill="#fff" />
            </svg>
        );
    }
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-4 h-4">
            <circle cx="12" cy="12" r="11" fill="#25D366" />
            <path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Z" fill="#fff" />
        </svg>
    );
}
