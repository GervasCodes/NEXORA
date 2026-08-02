import { Link, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useLanguage } from "../context/LanguageContext";
import SearchBox from "./SearchBox";
import NotificationBell from "./NotificationBell";
import AdminNotificationBell from "./AdminNotificationBell";
import { NAV_ICON_BY_PATH, BrowseIcon, CartIcon, HomeIcon, SignInIcon, SignOutIcon } from "./NavIcons";

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
    if (user?.role === "buyer") links.push({ to: "/bookings", label: t("nav.bookings") });
    if (user?.role === "buyer") links.push({ to: "/disputes", label: t("nav.disputes") });
    if (user?.role === "buyer") links.push({ to: "/saved", label: t("nav.saved") });
    if (user?.role === "buyer") links.push({ to: "/cart", label: t("nav.cart") });
    if (user) links.push({ to: "/account", label: t("nav.account") });

    return links;
}

// Icon + tooltip nav item for the desktop row. Renders as a labelled
// icon button - the `label` stays in the DOM (as the tooltip and as the
// accessible name) so this is no less accessible than the plain text
// link it replaces, just more compact and consistent with the
// notification bell / cart icons that already lived in this header.
function IconNavLink({ to, label, icon: Icon, active, badge, onClick }) {
    return (
        <Link
            to={to}
            onClick={onClick}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={`group relative flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-150 ease-out
                ${active ? "bg-frost/15 text-azure-light" : "text-frost/75 hover:text-azure-light hover:bg-frost/10"}`}
        >
            <Icon className="w-5 h-5 transition-transform duration-150 ease-out group-hover:scale-110" />
            {badge}

            {/* Active-route indicator */}
            <span
                aria-hidden="true"
                className={`absolute -bottom-[15px] left-1/2 -translate-x-1/2 h-0.5 rounded-full bg-azure-light transition-all duration-150 ease-out
                    ${active ? "w-5 opacity-100" : "w-0 opacity-0"}`}
            />

            {/* Tooltip */}
            <span
                role="tooltip"
                className="pointer-events-none absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-abyss text-frost text-xs px-2 py-1
                    opacity-0 scale-95 translate-y-0.5 group-hover:opacity-100 group-hover:scale-100 group-hover:translate-y-0
                    group-focus-visible:opacity-100 group-focus-visible:scale-100 group-focus-visible:translate-y-0
                    transition-all duration-150 ease-out z-50"
            >
                {label}
            </span>
        </Link>
    );
}

export default function Header() {
    const { user, logout } = useAuth();
    const { itemCount } = useCart();
    const { t } = useLanguage();
    const navigate = useNavigate();
    const location = useLocation();
    const [menuOpen, setMenuOpen] = useState(false);
    const links = useNavLinks();

    const isActive = (to) => location.pathname === to || location.pathname.startsWith(`${to}/`);

    // Close the drawer whenever who's signed in changes (login/logout),
    // so it never stays open showing stale links.
    useEffect(() => {
        setMenuOpen(false);
    }, [user]);

    // Keyboard users get the same "back out of the drawer" affordance a
    // mouse user gets by tapping elsewhere - only listens while the
    // drawer is actually open, so it costs nothing the rest of the time.
    useEffect(() => {
        if (!menuOpen) return;
        const handleKeyDown = (e) => {
            if (e.key === "Escape") setMenuOpen(false);
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [menuOpen]);

    const handleSignOut = () => {
        setMenuOpen(false);
        logout();
        navigate("/");
    };

    const searchInputClass = "w-full bg-paper placeholder-ash text-ink rounded-l-md px-4 py-2 text-sm focus-ring border border-transparent";

    return (
        <header className="glass-dark text-frost sticky top-0 z-40">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center gap-4 sm:gap-6">
                <Link
                    to="/"
                    aria-label={t("nav.home")}
                    title={t("nav.home")}
                    className="flex items-center gap-2 shrink-0"
                    onClick={() => setMenuOpen(false)}
                >
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
                    (and overflow off-screen) below that width. Icon + tooltip
                    items, mirroring the notification bell / cart icons that
                    already lived here. */}
                <nav className="hidden md:flex items-center gap-1.5 text-sm ml-auto">
                    <IconNavLink
                        to="/"
                        label={t("nav.home")}
                        icon={HomeIcon}
                        active={location.pathname === "/"}
                        onClick={() => setMenuOpen(false)}
                    />

                    <IconNavLink
                        to="/products"
                        label={t("nav.browse")}
                        icon={BrowseIcon}
                        active={isActive("/products")}
                    />

                    {links.map((link) => (
                        <IconNavLink
                            key={link.to}
                            to={link.to}
                            label={link.label}
                            icon={NAV_ICON_BY_PATH[link.to] || CartIcon}
                            active={isActive(link.to)}
                            badge={
                                link.to === "/cart" && itemCount > 0 ? (
                                    <span className="absolute -top-1 -right-1 bg-mango text-abyss text-[10px] font-mono font-semibold rounded-full w-4 h-4 flex items-center justify-center">
                                        {itemCount}
                                    </span>
                                ) : null
                            }
                        />
                    ))}

                    {user && <NotificationBell />}
                    {user?.role === "admin" && <AdminNotificationBell />}

                    {user ? (
                        <button
                            onClick={handleSignOut}
                            aria-label={t("nav.signOut")}
                            className="group relative flex items-center justify-center w-10 h-10 rounded-lg text-frost/75 hover:text-coral hover:bg-frost/10 transition-all duration-150 ease-out"
                        >
                            <SignOutIcon className="w-5 h-5 transition-transform duration-150 ease-out group-hover:scale-110" />
                            <span
                                role="tooltip"
                                className="pointer-events-none absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-abyss text-frost text-xs px-2 py-1
                                    opacity-0 scale-95 translate-y-0.5 group-hover:opacity-100 group-hover:scale-100 group-hover:translate-y-0
                                    group-focus-visible:opacity-100 group-focus-visible:scale-100 group-focus-visible:translate-y-0
                                    transition-all duration-150 ease-out z-50"
                            >
                                {t("nav.signOut")}
                            </span>
                        </button>
                    ) : (
                        <>
                            <IconNavLink
                                to="/login"
                                label={t("nav.signIn")}
                                icon={SignInIcon}
                                active={isActive("/login")}
                            />
                            <Link
                                to="/register"
                                className="bg-mango text-abyss px-3 py-1.5 rounded-md font-semibold hover:bg-mango-dark hover:scale-[1.03] active:scale-[0.98] transition-all duration-150 ease-out ml-1"
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
                    {user?.role === "admin" && <AdminNotificationBell />}

                    {user?.role === "buyer" && (
                        <Link to="/cart" className="relative text-frost/90 shrink-0 transition-transform duration-150 ease-out active:scale-90" aria-label={t("nav.cart")}>
                            <CartIcon className="w-6 h-6" />
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
                        aria-controls="mobile-nav-drawer"
                        className="shrink-0 w-9 h-9 flex items-center justify-center rounded-md text-frost/90 hover:text-azure-light focus-ring transition-all duration-150 ease-out active:scale-90"
                    >
                        {menuOpen ? (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6 transition-transform duration-200 ease-out">
                                <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6 transition-transform duration-200 ease-out">
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
                of screen width or orientation. Icon + label rows - a
                drawer has room for both, unlike the compact desktop bar. */}
            {menuOpen && (
                <div id="mobile-nav-drawer" className="md:hidden glass-strong text-ink border-t border-line/60 px-4 py-3 animate-slide-up">
                    <nav className="flex flex-col divide-y divide-line/60">
                        <Link
                            to="/"
                            onClick={() => setMenuOpen(false)}
                            className={`py-3 flex items-center gap-3 text-sm font-medium transition-colors duration-150
                                ${location.pathname === "/" ? "text-teal" : "hover:text-teal"}`}
                        >
                            <HomeIcon className="w-[18px] h-[18px] shrink-0" />
                            {t("nav.home")}
                        </Link>

                        <Link
                            to="/products"
                            onClick={() => setMenuOpen(false)}
                            className={`py-3 flex items-center gap-3 text-sm font-medium transition-colors duration-150
                                ${isActive("/products") ? "text-teal" : "hover:text-teal"}`}
                        >
                            <BrowseIcon className="w-[18px] h-[18px] shrink-0" />
                            {t("nav.browse")}
                        </Link>

                        {links.map((link) => {
                            const Icon = NAV_ICON_BY_PATH[link.to] || CartIcon;
                            return (
                                <Link
                                    key={link.to}
                                    to={link.to}
                                    onClick={() => setMenuOpen(false)}
                                    className={`py-3 flex items-center gap-3 text-sm font-medium transition-colors duration-150
                                        ${isActive(link.to) ? "text-teal" : "hover:text-teal"}`}
                                >
                                    <Icon className="w-[18px] h-[18px] shrink-0" />
                                    <span className="flex-1">{link.label}</span>
                                    {link.to === "/cart" && itemCount > 0 && (
                                        <span className="bg-mango text-abyss text-[10px] font-mono font-semibold rounded-full w-5 h-5 flex items-center justify-center">
                                            {itemCount}
                                        </span>
                                    )}
                                </Link>
                            );
                        })}

                        {user ? (
                            <button
                                onClick={handleSignOut}
                                className="py-3 flex items-center gap-3 text-left text-sm font-medium text-coral hover:opacity-80 transition-opacity duration-150"
                            >
                                <SignOutIcon className="w-[18px] h-[18px] shrink-0" />
                                {t("nav.signOut")}
                            </button>
                        ) : (
                            <div className="py-3 flex items-center gap-3">
                                <Link
                                    to="/login"
                                    onClick={() => setMenuOpen(false)}
                                    className="flex-1 text-center text-sm font-medium border border-line rounded-md py-2 hover:border-ink transition-colors duration-150"
                                >
                                    {t("nav.signIn")}
                                </Link>
                                <Link
                                    to="/register"
                                    onClick={() => setMenuOpen(false)}
                                    className="flex-1 text-center bg-mango text-abyss px-3 py-2 rounded-md text-sm font-semibold hover:bg-mango-dark transition-colors duration-150"
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
