import { useEffect, useState } from "react";
import api from "../api/client";
import { useDataSaver } from "../context/DataSaverContext";

// Guides nav icon (Header tools request: "real images instead of the 2D
// icon, with a smooth animation"). Rather than hardcoding a stock photo,
// this pulls the actual cover image of the most recently published guide
// from /content - the same endpoint Guides.jsx already uses - so the nav
// icon always shows real, current site content instead of a static asset.
//
// Module-level cache: Header stays mounted for the whole session, but
// this still guards against any future remount re-issuing the request.
let coverCache = null;
let coverPromise = null;

function fetchLatestCover() {
    if (coverCache !== null) return Promise.resolve(coverCache);
    if (!coverPromise) {
        coverPromise = api
            .get("/content")
            .then(({ data }) => {
                const withCover = (data.data || []).find((a) => a.cover_image_url);
                coverCache = withCover?.cover_image_url || "";
                return coverCache;
            })
            .catch(() => {
                coverCache = "";
                return "";
            });
    }
    return coverPromise;
}

// Plain line-drawn book glyph - used until the real cover has loaded,
// and permanently for stores with no published guides yet, so the nav
// never shows a broken image.
function BookOutline({ className }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <path d="M4 5.5c2-1 5-1 8 0v13c-3-1-6-1-8 0z" />
            <path d="M20 5.5c-2-1-5-1-8 0v13c3-1 6-1 8 0z" />
        </svg>
    );
}

export default function GuidesNavIcon({ className }) {
    const [cover, setCover] = useState(coverCache);
    const [loaded, setLoaded] = useState(false);
    const dataSaver = useDataSaver();

    useEffect(() => {
        let cancelled = false;
        fetchLatestCover().then((url) => {
            if (!cancelled) setCover(url);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    if (!cover) {
        return <BookOutline className={className} />;
    }

    // This renders on every single page, on every device, so it goes
    // through the same data-saver image optimizer ProductCard.jsx
    // already uses - a lighter transcode on mobile/cellular connections
    // instead of pulling the full-size cover just for a ~20px icon.
    const src = dataSaver?.optimize(cover) || cover;

    return (
        <span className={`relative inline-block rounded-full overflow-hidden shrink-0 ${className}`}>
            {/* Soft breathing ring behind the photo - reuses the same
                gentle ripple keyframe as the account-suspended lock icon
                elsewhere in the app, kept slow so it reads as "alive"
                without competing for attention next to the other icons. */}
            <span className="absolute inset-0 rounded-full bg-azure-light/40 animate-suspend-ring" aria-hidden="true" />
            <img
                src={src}
                alt=""
                aria-hidden="true"
                onLoad={() => setLoaded(true)}
                className={`relative w-full h-full object-cover rounded-full ring-1 ring-frost/40 transition-all duration-500 ease-out
                    ${loaded ? "opacity-100 scale-100" : "opacity-0 scale-75"}`}
            />
        </span>
    );
}
