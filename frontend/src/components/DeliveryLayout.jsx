import { NavLink, Outlet } from "react-router-dom";
import { useAgentShift } from "../hooks/useAgentShift";
import IncomingOfferModal from "./IncomingOfferModal";
import { useAuth } from "../context/AuthContext";
import AccountReviewNotice from "./AccountReviewNotice";

const tabs = [
    { to: "/delivery", label: "Available", end: true },
    { to: "/delivery/mine", label: "My deliveries" },
    { to: "/delivery/earnings", label: "Earnings" }
];

function ApprovedDeliveryLayout() {
    const { online, goOnline, goOffline, locationError, pushWarning } = useAgentShift();

    const toggleShift = () => (online ? goOffline() : goOnline());

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
            <IncomingOfferModal />

            <div className="flex items-start justify-between gap-4 mb-1">
                <div>
                    <p className="text-xs uppercase tracking-widest text-ash mb-1">Delivery</p>
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

            <Outlet />
        </div>
    );
}

export default function DeliveryLayout() {
    const { user } = useAuth();

    // Base account-level gate: set during registration, reviewed by an
    // admin. Going online, browsing available orders, claiming
    // deliveries, and viewing earnings all stay hidden until this is
    // "approved" - see requireApprovedDeliveryAgent.middleware.js for the
    // matching API-side gate. useAgentShift() (geolocation, push
    // subscription, online-status polling) only mounts once approved, so
    // a pending agent isn't prompted for location access for nothing.
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
