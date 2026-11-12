// Mirrors HomeCarousel.jsx's fallback content and badge styling exactly, so
// the 3D hero and the 2D fallback never show visually different content
// when there's no live promo data. Kept as its own file rather than
// exported from HomeCarousel.jsx to avoid touching that file for this
// sub-phase - see PHASE_7_NOTES.md.
//
// Same three real, verified, freely-licensed photos (Unsplash License -
// free for commercial use, no attribution required:
// https://unsplash.com/license) HomeCarousel.jsx uses: "Marketing Flatlay"
// by Campaign Creators, "Ships out today" by Bench Accounting, and "GRAB
// courier makes delivery" by Kseniia Ilinykh.
export const FALLBACK_SLIDES = [
    {
        type: "fallback",
        title: "Everything you need",
        subtitle: "Thousands of products from local vendors",
        imageUrl: "https://images.unsplash.com/photo-1533750516457-a7f992034fec?q=80&w=1200&auto=format&fit=crop",
        href: "/products",
        badge: null
    },
    {
        type: "fallback",
        title: "From sellers you trust",
        subtitle: "Verified stores, ready to ship",
        imageUrl: "https://images.unsplash.com/photo-1449247666642-264389f5f5b1?q=80&w=1200&auto=format&fit=crop",
        href: "/products",
        badge: null
    },
    {
        type: "fallback",
        title: "Tracked door to door",
        subtitle: "Follow every order from pickup to drop-off",
        imageUrl: "https://images.unsplash.com/photo-1587476351660-e9fa4bb8b26c?q=80&w=1200&auto=format&fit=crop",
        href: "/products",
        badge: null
    }
];

export const BADGE_STYLES = {
    Sponsored: "bg-azure/90 text-frost",
    "On sale": "bg-coral/90 text-frost",
    "Featured store": "bg-mango/90 text-abyss"
};
