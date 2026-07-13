// Shown briefly while a route chunk downloads (see App.jsx's React.lazy
// imports). Deliberately minimal - most of these loads are near-instant
// on a warm cache, this is just there to avoid a blank white flash.
export default function PageLoader() {
    return (
        <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-line border-t-mango rounded-full animate-spin" />
        </div>
    );
}
