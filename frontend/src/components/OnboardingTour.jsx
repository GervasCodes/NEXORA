import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const STORAGE_PREFIX = "nexora_onboarding_seen_";

const BUYER_STEPS = [
    {
        emoji: "🔍",
        title: "Find anything, fast",
        body: "Search or browse by category to discover products and services from sellers across Tanzania."
    },
    {
        emoji: "🛒",
        title: "Add to cart, checkout securely",
        body: "Pay by mobile money, card, wallet balance, or cash on delivery - and pick up from a kiosk near you instead of waiting at home, if that's easier."
    },
    {
        emoji: "📦",
        title: "Track every order",
        body: "Watch your order move from placed to delivered in real time, right from the Orders page."
    },
    {
        emoji: "💬",
        title: "Help is always close by",
        body: "Tap the chat bubble in the corner any time you need support - a real person will get back to you."
    }
];

// Phase 3 (Remediation, A4): role-specific steps for sellers and
// delivery agents, added onto the existing "shown once per account"
// mechanism below - same STORAGE_PREFIX key pattern, same dismiss/skip
// behavior, just a different STEPS array and finish() destination per
// role instead of a hard-coded buyer-only one.
const SELLER_STEPS = [
    {
        emoji: "🏪",
        title: "Your store, one dashboard",
        body: "List products or services, manage orders and bookings, and see how your store is doing - all from the Seller dashboard."
    },
    {
        emoji: "📣",
        title: "Get seen",
        body: "Use Promote to pay for extra visibility - a sponsored product slot, top billing for your store, or a boosted department on the homepage."
    },
    {
        emoji: "💰",
        title: "Get paid",
        body: "Orders credit your wallet automatically. Track balance, working capital advances, and payouts from Wallet."
    },
    {
        emoji: "💬",
        title: "Help is always close by",
        body: "Tap the chat bubble in the corner any time you need support - a real person will get back to you."
    }
];

const DELIVERY_AGENT_STEPS = [
    {
        emoji: "📋",
        title: "See what's available",
        body: "Browse deliveries waiting for a courier near you and claim the ones that fit your route."
    },
    {
        emoji: "🛵",
        title: "Manage your deliveries",
        body: "Track every delivery you've claimed - pickup, in transit, delivered - from My Deliveries."
    },
    {
        emoji: "💬",
        title: "Help is always close by",
        body: "Tap the chat bubble in the corner any time you need support - a real person will get back to you."
    }
];

const ROLE_CONFIG = {
    buyer: { steps: BUYER_STEPS, finishPath: "/", ctaLabel: "Start browsing" },
    seller: { steps: SELLER_STEPS, finishPath: "/seller", ctaLabel: "Go to dashboard" },
    delivery_agent: { steps: DELIVERY_AGENT_STEPS, finishPath: "/delivery", ctaLabel: "Go to dashboard" }
};

// Shown once per account per browser (localStorage), not once
// site-wide - a shared device logging in as a different user should
// still see it.
export default function OnboardingTour() {
    const { user } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [step, setStep] = useState(0);
    const [visible, setVisible] = useState(false);

    const roleConfig = user ? ROLE_CONFIG[user.role] : null;

    useEffect(() => {
        if (!roleConfig) {
            setVisible(false);
            return;
        }
        const key = `${STORAGE_PREFIX}${user.id}`;
        if (localStorage.getItem(key) === "1") return;
        setVisible(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    if (!visible || !roleConfig) {
        return null;
    }
    // A buyer shouldn't see their own tour pop up on /seller or /delivery
    // (e.g. someone with multiple roles, or a stale link) - those routes
    // are gated to their own role by RequireSeller/RequireDeliveryAgent
    // anyway, but this keeps the buyer tour from flashing mid-redirect.
    if (user.role === "buyer" && (location.pathname.startsWith("/seller") || location.pathname.startsWith("/delivery"))) {
        return null;
    }

    const finish = () => {
        localStorage.setItem(`${STORAGE_PREFIX}${user.id}`, "1");
        setVisible(false);
    };

    const { steps, finishPath, ctaLabel } = roleConfig;
    const isLast = step === steps.length - 1;
    const current = steps[step];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-abyss/50 px-4">
            <div className="bg-paper rounded-lg shadow-xl max-w-sm w-full p-6 animate-slide-up">
                <div className="text-4xl mb-3">{current.emoji}</div>
                <h2 className="font-display text-xl mb-2">{current.title}</h2>
                <p className="text-sm text-ash mb-6">{current.body}</p>

                <div className="flex items-center justify-center gap-1.5 mb-6">
                    {steps.map((_, i) => (
                        <span
                            key={i}
                            className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-ink" : "w-1.5 bg-line"}`}
                        />
                    ))}
                </div>

                <div className="flex items-center justify-between gap-3">
                    <button onClick={finish} className="text-sm text-ash hover:text-ink">
                        Skip
                    </button>
                    <button
                        onClick={() => {
                            if (isLast) {
                                finish();
                                navigate(finishPath);
                            } else {
                                setStep((s) => s + 1);
                            }
                        }}
                        className="bg-ink text-paper px-5 py-2 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity"
                    >
                        {isLast ? ctaLabel : "Next"}
                    </button>
                </div>
            </div>
        </div>
    );
}
