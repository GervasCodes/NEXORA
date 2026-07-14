export default function Footer() {
    return (
        <footer className="glass-dark text-paper/70 mt-24">
            <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-sm">
                <div className="flex items-center gap-2">
                    <span className="font-display italic text-paper text-lg">NEXORA</span>
                </div>
                <p>A regional marketplace connecting buyers, sellers &amp; delivery partners.</p>
                <p className="text-paper/40">&copy; {new Date().getFullYear()} NEXORA</p>
            </div>
        </footer>
    );
}
