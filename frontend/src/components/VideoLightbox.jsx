import { useEffect } from "react";

// Phase 7 (Promo Video Unification) - same overlay/Escape-to-close
// shape as chat/ImageLightbox.jsx, swapping the <img> for a <video
// controls> so a store's promo video (StorePage.jsx) plays full-screen
// instead of just linking out to the raw file.
export default function VideoLightbox({ src, onClose }) {
    useEffect(() => {
        if (!src) return undefined;

        const handleKeyDown = (e) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [src, onClose]);

    if (!src) return null;

    return (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- click-outside-to-dismiss backdrop; keyboard users dismiss via the Escape handler above and the Close button
        <div
            className="fixed inset-0 z-50 bg-abyss/90 flex items-center justify-center p-4 animate-fade-in"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label="Video preview"
        >
            <button
                type="button"
                onClick={onClose}
                className="absolute top-4 right-4 text-frost/80 hover:text-frost text-2xl leading-none w-10 h-10 flex items-center justify-center rounded-full hover:bg-frost/10 transition-colors"
                aria-label="Close"
            >
                ×
            </button>
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- stopPropagation only, so clicking the player itself doesn't dismiss the overlay */}
            {/* eslint-disable-next-line jsx-a11y/media-has-caption -- seller-uploaded product videos have no caption/subtitle track available */}
            <video
                src={src}
                controls
                autoPlay
                onClick={(e) => e.stopPropagation()}
                className="max-w-full max-h-full rounded-lg animate-scale-in"
            />
        </div>
    );
}
