import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useLanguage } from "../context/LanguageContext";
import SearchBox from "./SearchBox";
import NotificationBell from "./NotificationBell";

// A single nav link config, shared between the desktop row and the mobile
// drawer, so the two never drift out of sync with each other.
function useNavLinks() {
    const { user } = useAuth();
    const { t } = useLanguage();

    const links = [];
    if (user?.role === "seller") links.push({ to: "/seller", label: t("nav.dashboard") });
    if (user?.role === "delivery_agent") links.push({ to: "/delivery", label: t("nav.deliveries") });
    if (user?.role === "admin") links.push({ to: "/admin", label: t("nav.admin") });
    if (user?.role === "buyer" || user?.role === "seller") links.push({ to: "/messages", label: t("nav.messages") });
    if (user?.role === "buyer") links.push({ to: "/orders", label: t("nav.orders") });
    if (user?.role === "buyer") links.push({ to: "/disputes", label: t("nav.disputes") });
    if (user?.role === "buyer") links.push({ to: "/saved", label: t("nav.saved") });
    if (user?.role === "buyer") links.push({ to: "/cart", label: t("nav.cart") });
    if (user) links.push({ to: "/account", label: t("nav.account") });

    return links;
}

export default function Header() {
    const { user, logout } = useAuth();
    const { itemCount } = useCart();
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [menuOpen, setMenuOpen] = useState(false);
    const links = useNavLinks();

    // Close the drawer whenever who's signed in changes (login/logout),
    // so it never stays open showing stale links.
    useEffect(() => {
        setMenuOpen(false);
    }, [user]);

    const handleSignOut = () => {
        setMenuOpen(false);
        logout();
        navigate("/");
    };

    const searchInputClass = "w-full bg-paper placeholder-ash text-ink rounded-l-md px-4 py-2 text-sm focus-ring border border-transparent";

    return (
        <header className="glass-dark text-paper sticky top-0 z-40">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center gap-4 sm:gap-6">
                <Link to="/" className="flex items-center gap-2 shrink-0" onClick={() => setMenuOpen(false)}>
                    <span className="font-display italic text-xl tracking-tight">NEXORA</span>
                </Link>

                <div className="flex-1 hidden md:flex max-w-md">
                    <SearchBox
                        placeholder={t("nav.searchPlaceholder")}
                        submitLabel={t("nav.search")}
                        inputClassName={searchInputClass}
                    />
                </div>

                {/* Desktop nav - hidden below md, so it never has to squeeze
                    (and overflow off-screen) below that width. */}
                <nav className="hidden md:flex items-center gap-5 text-sm ml-auto">
                    {links.map((link) => (
                        <Link
                            key={link.to}
                            to={link.to}
                            className="relative text-paper/80 hover:text-azure-light transition-colors"
                        >
                            {link.label}
                            {link.to === "/cart" && itemCount > 0 && (
                                <span className="absolute -top-2 -right-3 bg-mango text-abyss text-[10px] font-mono font-semibold rounded-full w-4 h-4 flex items-center justify-center">
                                    {itemCount}
                                </span>
                            )}
                        </Link>
                    ))}

                    {user && <NotificationBell />}

                    {user ? (
                        <button onClick={handleSignOut} className="text-paper/80 hover:text-azure-light transition-colors">
                            {t("nav.signOut")}
                        </button>
                    ) : (
                        <>
                            <Link to="/login" className="text-paper/80 hover:text-azure-light transition-colors">
                                {t("nav.signIn")}
                            </Link>
                            <Link
                                to="/register"
                                className="bg-mango text-abyss px-3 py-1.5 rounded-md font-semibold hover:bg-mango-dark transition-colors"
                            >
                                {t("nav.join")}
                            </Link>
                        </>
                    )}
                </nav>

                {/* Mobile: cart + hamburger only, always visible regardless
                    of viewport width or orientation - this is what actually
                    fixes buttons being unreachable in portrait mode. */}
                <div className="flex items-center gap-3 ml-auto md:hidden">
                    {user && <NotificationBell />}

                    {user?.role === "buyer" && (
                        <Link to="/cart" className="relative text-paper/90 shrink-0" aria-label={t("nav.cart")}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-6 h-6">
                                <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
                                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                            </svg>
                            {itemCount > 0 && (
                                <span className="absolute -top-2 -right-2 bg-mango text-abyss text-[10px] font-mono font-semibold rounded-full w-4 h-4 flex items-center justify-center">
                                    {itemCount}
                                </span>
                            )}
                        </Link>
                    )}

                    <button
                        type="button"
                        onClick={() => setMenuOpen((v) => !v)}
                        aria-label="Menu"
                        aria-expanded={menuOpen}
                        className="shrink-0 w-9 h-9 flex items-center justify-center rounded-md text-paper/90 hover:text-azure-light focus-ring"
                    >
                        {menuOpen ? (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                                <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                                <path d="M3 6h18M3 12h18M3 18h18" />
                            </svg>
                        )}
                    </button>
                </div>
            </div>

            <div className="md:hidden px-4 pb-3">
                <SearchBox
                    placeholder={t("nav.searchPlaceholder")}
                    submitLabel={t("nav.go")}
                    inputClassName={searchInputClass}
                    onNavigate={() => setMenuOpen(false)}
                />
            </div>

            {/* Mobile drawer - every nav item, always reachable regardless
                of screen width or orientation. */}
            {menuOpen && (
                <div className="md:hidden glass-strong text-ink border-t border-line/60 px-4 py-3">
                    <nav className="flex flex-col divide-y divide-line/60">
                        {links.map((link) => (
                            <Link
                                key={link.to}
                                to={link.to}
                                onClick={() => setMenuOpen(false)}
                                className="py-3 flex items-center justify-between text-sm font-medium hover:text-teal transition-colors"
                            >
                                {link.label}
                                {link.to === "/cart" && itemCount > 0 && (
                                    <span className="bg-mango text-abyss text-[10px] font-mono font-semibold rounded-full w-5 h-5 flex items-center justify-center">
                                        {itemCount}
                                    </span>
                                )}
                            </Link>
                        ))}

                        {user ? (
                            <button
                                onClick={handleSignOut}
                                className="py-3 text-left text-sm font-medium text-coral hover:opacity-80 transition-opacity"
                            >
                                {t("nav.signOut")}
                            </button>
                        ) : (
                            <div className="py-3 flex items-center gap-3">
                                <Link
                                    to="/login"
                                    onClick={() => setMenuOpen(false)}
                                    className="flex-1 text-center text-sm font-medium border border-line rounded-md py-2 hover:border-ink transition-colors"
                                >
                                    {t("nav.signIn")}
                                </Link>
                                <Link
                                    to="/register"
                                    onClick={() => setMenuOpen(false)}
                                    className="flex-1 text-center bg-mango text-abyss px-3 py-2 rounded-md text-sm font-semibold hover:bg-mango-dark transition-colors"
                                >
                                    {t("nav.join")}
                                </Link>
                            </div>
                        )}
                    </nav>
                </div>
            )}
        </header>
    );
}
