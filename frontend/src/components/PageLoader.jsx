// Shown briefly while a route chunk downloads (see App.jsx's React.lazy
// imports). Deliberately minimal - most of these loads are near-instant
// on a warm cache, this is just there to avoid a blank white flash.
// The fade-in is delayed by CSS `animation-delay` (not JS) so an
// instant load never flashes the spinner at all.
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
