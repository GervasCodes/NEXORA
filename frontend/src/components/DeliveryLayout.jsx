import { Link, NavLink, Outlet } from "react-router-dom";
import { useAgentShift } from "../hooks/useAgentShift";
import IncomingOfferModal from "./IncomingOfferModal";
import { useAuth } from "../context/AuthContext";
import AccountReviewNotice from "./AccountReviewNotice";
import PageTransition from "./PageTransition";
import { HomeIcon } from "./NavIcons";

const tabs = [
    { to: "/delivery", label: "Available", end: true },
    { to: "/delivery/mine", label: "My deliveries" },
    { to: "/delivery/earnings", label: "Earnings" },
    { to: "/delivery/ratings", label: "Ratings" }
];

function ApprovedDeliveryLayout() {
    const { online, goOnline, goOffline, locationError, pushWarning } = useAgentShift();

    const toggleShift = () => (online ? goOffline() : goOnline());

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
            <IncomingOfferModal />

            <div className="flex items-start justify-between gap-4 mb-1">
                <div>
                    <p className="text-xs uppercase tracking-widest text-ash mb-1 flex items-center gap-2">
                        <Link
                            to="/"
                            aria-label="Back to Home"
                            title="Back to Home"
                            className="inline-flex items-center justify-center w-5 h-5 -ml-1 rounded text-ash hover:text-ink hover:bg-line/50 focus-ring transition-colors"
                        >
                            <HomeIcon className="w-3.5 h-3.5" />
                        </Link>
                        Delivery
                    </p>
                    <h1 className="font-display text-2xl">Your delivery rounds</h1>
                </div>

                <button
                    onClick={toggleShift}
                    className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                        online ? "bg-teal text-white" : "bg-line text-ash hover:text-ink"
                    }`}
                >
                    <span className={`w-2 h-2 rounded-full ${online ? "bg-white" : "bg-ash"}`} />
                    {online ? "On shift" : "Off shift"}
                </button>
            </div>

            {locationError && <p className="text-coral text-xs mb-4">{locationError}</p>}
            {pushWarning && <p className="text-ash text-xs mb-4">{pushWarning} (you'll still get offers while the app is open)</p>}
            {online && (
                <p className="text-xs text-ash mb-6">
                    Sharing your location — nearby orders will be offered to you automatically.
                </p>
            )}

            <nav className="flex gap-1 mb-8 border-b border-line">
                {tabs.map((tab) => (
                    <NavLink
                        key={tab.to}
                        to={tab.to}
                        end={tab.end}
                        className={({ isActive }) =>
                            `text-sm px-4 py-2.5 -mb-px border-b-2 transition-colors ${
                                isActive ? "border-mango text-ink font-medium" : "border-transparent text-ash hover:text-ink"
                            }`
                        }
                    >
                        {tab.label}
                    </NavLink>
                ))}
            </nav>

            <PageTransition granular>
                <Outlet />
            </PageTransition>
        </div>
    );
}

export default function DeliveryLayout() {
    const { user } = useAuth();

    
    if (user?.account_verification_status !== "approved") {
        return (
            <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16">
                <AccountReviewNotice
                    status={user?.account_verification_status}
                    rejectionReason={user?.account_verification_rejection_reason}
                    roleLabel="delivery"
                />
            </div>
        );
    }

    return <ApprovedDeliveryLayout />;
}
