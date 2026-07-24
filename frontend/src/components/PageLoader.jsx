
export default function PageLoader() {
    return (
        <div className="flex items-center justify-center py-24 animate-fade-in [animation-delay:150ms]">
            <div className="relative w-9 h-9">
                <div className="absolute inset-0 border-2 border-line rounded-full" />
                <div className="absolute inset-0 border-2 border-transparent border-t-mango rounded-full animate-spin" />
            </div>
        </div>
    );
}
