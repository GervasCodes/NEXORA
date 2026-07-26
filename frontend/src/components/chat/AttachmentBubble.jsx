const formatSize = (bytes) => {
    if (!bytes) return "";
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const FileIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
            d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
        />
        <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
);

export default function AttachmentBubble({ attachment, onOpenLightbox, mine }) {
    const { attachment_url: url, attachment_type: type, attachment_name: name, attachment_size: size } = attachment;

    if (!url) return null;

    if (type === "image") {
        return (
            <button
                type="button"
                onClick={() => onOpenLightbox?.(url)}
                className="block max-w-[220px] rounded-xl overflow-hidden focus-ring"
            >
                <img src={url} alt={name || "Attachment"} className="w-full h-auto object-cover" loading="lazy" />
            </button>
        );
    }

    if (type === "video") {
        return (
            <video src={url} controls className="max-w-[240px] rounded-xl" preload="metadata" />
        );
    }

    if (type === "audio") {
        return <audio src={url} controls className="max-w-[240px]" preload="metadata" />;
    }

    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            download={name}
            className={`flex items-center gap-2 rounded-xl px-3 py-2 max-w-[220px] transition-colors ${
                mine ? "bg-frost/10 hover:bg-frost/20" : "bg-abyss/5 hover:bg-abyss/10"
            }`}
        >
            <FileIcon />
            <span className="min-w-0">
                <span className="block text-xs font-medium truncate">{name || "Attachment"}</span>
                {size ? <span className="block text-[10px] opacity-70">{formatSize(size)}</span> : null}
            </span>
        </a>
    );
}
