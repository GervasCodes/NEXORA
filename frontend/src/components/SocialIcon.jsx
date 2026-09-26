// Shared between StorePage.jsx (a seller's own social links) and
// Footer.jsx (NEXORA's own company social links) - previously lived
// inside StorePage.jsx and was re-exported from there, but StorePage
// is lazy-loaded per-route (see App.jsx) while Footer renders on every
// page. Footer's static `import { SocialIcon } from "../pages/StorePage"`
// pulled the entire StorePage chunk (reviews, product grid, follow/unfollow,
// etc.) into the main bundle, defeating that route-level code-splitting.
// Living in its own file, both call sites get just the four icon paths.
export function SocialIcon({ name }) {
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
