import { useEffect } from "react";

export default function ImageLightbox({ src, onClose }) {
    // Escape-to-close, matching ConfirmDialog/RescheduleModal's convention.
    // Without this the overlay was dismissible by click only, leaving
    // keyboard users with just the close button.
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
            aria-label="Image preview"
        >
            <button
                type="button"
                onClick={onClose}
                className="absolute top-4 right-4 text-frost/80 hover:text-frost text-2xl leading-none w-10 h-10 flex items-center justify-center rounded-full hover:bg-frost/10 transition-colors"
                aria-label="Close"
            >
                ×
            </button>
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- stopPropagation only, so clicking the image itself doesn't dismiss the overlay */}
            <img
                src={src}
                alt=""
                onClick={(e) => e.stopPropagation()}
                className="max-w-full max-h-full rounded-lg animate-scale-in object-contain"
            />
        </div>
    );
}
