import { NavLink, Outlet } from "react-router-dom";
import { useAgentShift } from "../hooks/useAgentShift";
import IncomingOfferModal from "./IncomingOfferModal";

const tabs = [
    { to: "/delivery", label: "Available", end: true },
    { to: "/delivery/mine", label: "My deliveries" },
    { to: "/delivery/earnings", label: "Earnings" }
];

export default function DeliveryLayout() {
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
