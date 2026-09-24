import { Link, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useLanguage } from "../context/LanguageContext";
import { useUnreadMessagesCount } from "../hooks/useUnreadMessagesCount";
import SearchBox from "./SearchBox";
import NotificationBell from "./NotificationBell";
import MobileBottomNav from "./MobileBottomNav";
import Button from "./ui/Button";
import { NAV_ICON_BY_PATH, BrowseIcon, CartIcon, HomeIcon, OrdersIcon, MessagesIcon, AccountIcon, SignInIcon, SignOutIcon } from "./NavIcons";
import ConfirmDialog from "./ConfirmDialog";
import ToolsMenu from "./ToolsMenu";
import SideDrawer from "./ui/SideDrawer";

// A single nav link config, shared between the desktop row and the mobile
// drawer, so the two never drift out of sync with each other.
//
// Each entry carries a `group`: "primary" links keep their own slot in
// the desktop icon row (the handful of highest-frequency actions),
// "secondary" links live inside the ToolsMenu dropdown instead so the
// row doesn't grow every time another feature (Loyalty, Affiliate,
// Group buys...) ships. The mobile drawer ignores `group` entirely and
// still lists everything flat, exactly as before.
function useNavLinks() {
    const { user } = useAuth();
    const { t } = useLanguage();

    const links = [];
    if (user?.role === "seller") links.push({ to: "/seller", label: t("nav.dashboard"), group: "primary" });
    if (user?.role === "delivery_agent") links.push({ to: "/delivery", label: t("nav.deliveries"), group: "primary" });
    if (user?.role === "admin") links.push({ to: "/admin", label: t("nav.admin"), group: "primary" });
    if (user?.role === "buyer" || user?.role === "seller") links.push({ to: "/messages", label: t("nav.messages"), group: "primary" });
    if (user?.role === "buyer") links.push({ to: "/orders", label: t("nav.orders"), group: "secondary" });
    if (user?.role === "buyer") links.push({ to: "/bookings", label: t("nav.bookings"), group: "secondary" });
    if (user?.role === "buyer") links.push({ to: "/disputes", label: t("nav.disputes"), group: "secondary" });
    if (user?.role === "buyer") links.push({ to: "/returns", label: t("nav.returns"), group: "secondary" });
    if (user?.role === "buyer") links.push({ to: "/saved", label: t("nav.saved"), group: "secondary" });
    if (user?.role === "buyer") links.push({ to: "/account/wallet", label: t("nav.wallet"), group: "secondary" });
    if (user?.role === "buyer") links.push({ to: "/loyalty", label: "Loyalty", group: "secondary" });
    if (user?.role === "buyer") links.push({ to: "/affiliate", label: "Affiliate", group: "secondary" });
    links.push({ to: "/group-buys", label: "Group buys", group: "secondary" });
    links.push({ to: "/live-selling", label: "Live selling", group: "secondary" });
    links.push({ to: "/guides", label: "Guides", group: "secondary" });
    if (user?.role === "buyer") links.push({ to: "/cart", label: t("nav.cart"), group: "primary" });
    // Account (and Sign-out, rendered separately below) used to appear
    // in this header for every signed-in role. Admin and seller now have
    // their own dashboard shells (Control room / seller sidebar) with
    // Account and Sign-out built into them instead - see AdminLayout.jsx
    // and SellerLayout.jsx - so this header no longer duplicates it for
    // those two roles. Buyer and delivery agent still get it here since
    // neither has an equivalent shell of their own.
    if (user && user.role !== "admin" && user.role !== "seller") {
        links.push({ to: "/account", label: t("nav.account"), group: "primary" });
    }

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
    const { user, sessionReady, logout } = useAuth();
    const { itemCount } = useCart();
    const { t } = useLanguage();
    const navigate = useNavigate();
    const location = useLocation();
    const [menuOpen, setMenuOpen] = useState(false);
    const links = useNavLinks();
    // Desktop icon row only ever shows the primary links directly - the
    // rest live inside ToolsMenu. The mobile drawer below still maps
    // over the full, un-split `links` array.
    const primaryLinks = links.filter((l) => l.group !== "secondary");
    const secondaryLinks = links
        .filter((l) => l.group === "secondary")
        .map((l) => ({ ...l, icon: NAV_ICON_BY_PATH[l.to] || CartIcon }));

    // Only buyers/sellers ever see a "/messages" link (see useNavLinks
    // above), so there's no point polling for anyone else. sessionReady
    // additionally holds off until the optimistic cached `user` has been
    // confirmed against the server - otherwise a stale session polls a
    // dead cookie and gets a 401 (see AuthContext.jsx).
    const unreadMessages = useUnreadMessagesCount(sessionReady && (user?.role === "buyer" || user?.role === "seller"));

    const isActive = (to) => location.pathname === to || location.pathname.startsWith(`${to}/`);

    // Close the drawer whenever who's signed in changes (login/logout),
    // so it never stays open showing stale links.
    useEffect(() => {
        setMenuOpen(false);
    }, [user]);

    // Escape-to-close and outside-click-to-close for the mobile drawer
    // are now handled inside the shared SideDrawer itself (see below),
    // so there's no separate keydown listener to maintain here.

    //  sign-out now requires an explicit confirmation instead of
    // firing on a single click - a stray tap (easy on the mobile drawer's
    // compact rows) used to log someone out immediately with no way back
    // except signing in again.
    const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);

    const handleSignOut = () => {
        setSignOutConfirmOpen(true);
    };

    const confirmSignOut = () => {
        setSignOutConfirmOpen(false);
        setMenuOpen(false);
        logout();
        navigate("/");
    };

    // Buyer's mobile bottom nav (Phase 6: Mobile Navigation
    // Unification) - fixed to 5 slots, so newer buyer destinations
    // (Wallet added in Phase Q2) live in the desktop icon row/Account
    // page instead of competing for a bottom-nav slot; Cart keeps its
    // slot here as the buyer's actual highest-frequency action.
    const buyerBottomNavItems = [
        { to: "/", label: t("nav.home"), icon: HomeIcon, end: true },
        { to: "/orders", label: t("nav.orders"), icon: OrdersIcon },
        { to: "/messages", label: t("nav.messages"), icon: MessagesIcon, badge: unreadMessages > 0 && (
            <span className="absolute -top-1.5 -right-2 bg-coral text-frost text-[9px] font-mono font-semibold rounded-full min-w-[14px] h-3.5 px-1 flex items-center justify-center">
                {unreadMessages > 9 ? "9+" : unreadMessages}
            </span>
        ) },
        {
            to: "/cart",
            label: t("nav.cart"),
            icon: CartIcon,
            badge: itemCount > 0 && (
                <span className="absolute -top-1.5 -right-2 bg-mango text-abyss text-[9px] font-mono font-semibold rounded-full min-w-[14px] h-3.5 px-1 flex items-center justify-center">
                    {itemCount > 9 ? "9+" : itemCount}
                </span>
            )
        },
        { to: "/account", label: t("nav.account"), icon: AccountIcon }
    ];

    const searchInputClass = "w-full bg-paper placeholder-ash text-ink rounded-l-md px-4 py-2 text-sm focus-ring border border-transparent";

    return (
        <header className="glass-dark text-frost sticky top-0 z-40">
            {/* (UI/UX remediation): the cart/messages/notification
                badge counts above only ever updated visually - a
                screen-reader user had no way to learn a new item landed
                in their cart or a new message arrived unless they
                happened to refocus the icon. These two sr-only regions
                announce count changes without duplicating what's already
                visually shown, and stay outside every layout's
                conditional rendering so they're always present exactly
                once regardless of viewport. */}
            <span className="sr-only" role="status" aria-live="polite">
                {itemCount > 0 ? `Cart: ${itemCount} item${itemCount === 1 ? "" : "s"}` : ""}
            </span>
            <span className="sr-only" role="status" aria-live="polite">
                {unreadMessages > 0 ? `${unreadMessages} unread message${unreadMessages === 1 ? "" : "s"}` : ""}
            </span>
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center gap-4 sm:gap-6">
                <Link
                    to="/"
                    aria-label={t("nav.home")}
                    title={t("nav.home")}
                    className="flex items-center gap-2 shrink-0"
                    onClick={() => setMenuOpen(false)}
                >
                    <img src="/favicon-32.png" alt="" aria-hidden="true" className="w-7 h-7 shrink-0" />
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

                    {primaryLinks.map((link) => (
                        <IconNavLink
                            key={link.to}
                            to={link.to}
                            label={link.label}
                            icon={NAV_ICON_BY_PATH[link.to] || CartIcon}
                            active={isActive(link.to)}
                            badge={
                                link.to === "/cart" && itemCount > 0 ? (
                                    <span className="absolute -top-1 -right-1 bg-mango text-abyss text-[10px] font-mono font-semibold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                                        {itemCount > 9 ? "9+" : itemCount}
                                    </span>
                                ) : link.to === "/messages" && unreadMessages > 0 ? (
                                    <span className="absolute -top-1 -right-1 bg-coral text-frost text-[10px] font-mono font-semibold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                                        {unreadMessages > 9 ? "9+" : unreadMessages}
                                    </span>
                                ) : null
                            }
                        />
                    ))}

                    <ToolsMenu links={secondaryLinks} isActive={isActive} />

                    {user && <NotificationBell />}

                    {user && user.role !== "admin" && user.role !== "seller" ? (
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
                    ) : !user ? (
                        <>
                            <IconNavLink
                                to="/login"
                                label={t("nav.signIn")}
                                icon={SignInIcon}
                                active={isActive("/login")}
                            />
                            <Button
                                as={Link}
                                to="/register"
                                size="sm"
                                className="hover:scale-[1.03] active:scale-[0.98] duration-150 ease-out ml-1"
                            >
                                {t("nav.join")}
                            </Button>
                        </>
                    ) : null}
                </nav>

                {/* Mobile: cart + hamburger only, always visible regardless
                    of viewport width or orientation - this is what actually
                    fixes buttons being unreachable in portrait mode. */}
                <div className="flex items-center gap-3 ml-auto md:hidden">
                    {user && <NotificationBell />}

                    {user?.role === "buyer" && (
                        <Link to="/cart" className="relative text-frost/90 shrink-0 transition-transform duration-150 ease-out active:scale-90" aria-label={t("nav.cart")}>
                            <CartIcon className="w-6 h-6" />
                            {itemCount > 0 && (
                                <span className="absolute -top-2 -right-2 bg-mango text-abyss text-[10px] font-mono font-semibold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                                    {itemCount > 9 ? "9+" : itemCount}
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
                drawer has room for both, unlike the compact desktop bar.

                UI Modernization Phase 2: now the shared, edge-anchored
                SideDrawer (right side, the component's default) instead
                of a top-anchored slide-down panel living inline inside
                `header`. Its own internal scroll region (see
                SideDrawer.jsx) is what fixed the original "unreachable
                nav items on short viewports" bug (Bookings/Disputes/
                Returns/Wallet/Loyalty/Affiliate landing past the
                viewport's cut-off with no way to scroll to them) - this
                keeps that fix, just inside the shared component now. The
                extra bottom padding for buyers reserves room for the
                fixed MobileBottomNav below so the last item can scroll
                clear of it instead of ending up hidden underneath. */}
            <SideDrawer
                open={menuOpen}
                onClose={() => setMenuOpen(false)}
                id="mobile-nav-drawer"
                ariaLabel="Menu"
                widthClassName="w-80 max-w-[85vw]"
            >
                <div
                    className="md:hidden glass-strong text-ink px-4 pt-3"
                    style={{ paddingBottom: user?.role === "buyer" ? "calc(env(safe-area-inset-bottom) + 76px)" : "0.75rem" }}
                >
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
                                    {link.to === "/messages" && unreadMessages > 0 && (
                                        <span className="bg-coral text-frost text-[10px] font-mono font-semibold rounded-full w-5 h-5 flex items-center justify-center">
                                            {unreadMessages > 9 ? "9+" : unreadMessages}
                                        </span>
                                    )}
                                </Link>
                            );
                        })}

                        {user && user.role !== "admin" && user.role !== "seller" ? (
                            <button
                                onClick={handleSignOut}
                                className="py-3 flex items-center gap-3 text-left text-sm font-medium text-coral hover:opacity-80 transition-opacity duration-150"
                            >
                                <SignOutIcon className="w-[18px] h-[18px] shrink-0" />
                                {t("nav.signOut")}
                            </button>
                        ) : !user ? (
                            <div className="py-3 flex items-center gap-3">
                                <Link
                                    to="/login"
                                    onClick={() => setMenuOpen(false)}
                                    className="flex-1 text-center text-sm font-medium border border-line rounded-md py-2 hover:border-ink transition-colors duration-150"
                                >
                                    {t("nav.signIn")}
                                </Link>
                                <Button
                                    as={Link}
                                    to="/register"
                                    onClick={() => setMenuOpen(false)}
                                    size="sm"
                                    className="flex-1"
                                >
                                    {t("nav.join")}
                                </Button>
                            </div>
                        ) : null}
                    </nav>
                </div>
            </SideDrawer>

            {user?.role === "buyer" && <MobileBottomNav items={buyerBottomNavItems} />}

            <ConfirmDialog
                open={signOutConfirmOpen}
                title={t("nav.signOut")}
                description="You'll need to sign in again to access your account."
                confirmLabel={t("nav.signOut")}
                cancelLabel={t("common.cancel") || "Cancel"}
                danger
                onConfirm={confirmSignOut}
                onCancel={() => setSignOutConfirmOpen(false)}
            />
        </header>
    );
}
