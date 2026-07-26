export default function ImageLightbox({ src, onClose }) {
    if (!src) return null;

    return (
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
            <img
                src={src}
                alt=""
                onClick={(e) => e.stopPropagation()}
                className="max-w-full max-h-full rounded-lg animate-scale-in object-contain"
            />
        </div>
    );
}
