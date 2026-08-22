import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const STORAGE_PREFIX = "nexora_onboarding_seen_";

const STEPS = [
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

// Shown once per account per browser (localStorage), not once
// site-wide - a shared device logging in as a different buyer should
// still see it. Buyers only: sellers/delivery agents/admins land on
// role-specific dashboards where this generic buyer-journey framing
// wouldn't fit, and get their own onboarding surfaces if/when that's
// prioritized (out of scope here - see FEATURES-PROGRESS.md).
export default function OnboardingTour() {
    const { user } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [step, setStep] = useState(0);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (!user || user.role !== "buyer") {
            setVisible(false);
            return;
        }
        const key = `${STORAGE_PREFIX}${user.id}`;
        if (localStorage.getItem(key) === "1") return;
        setVisible(true);
    }, [user]);

    if (!visible || location.pathname.startsWith("/admin") || location.pathname.startsWith("/seller")) {
        return null;
    }

    const finish = () => {
        if (user) localStorage.setItem(`${STORAGE_PREFIX}${user.id}`, "1");
        setVisible(false);
    };

    const isLast = step === STEPS.length - 1;
    const current = STEPS[step];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-abyss/50 px-4">
            <div className="bg-paper rounded-lg shadow-xl max-w-sm w-full p-6 animate-slide-up">
                <div className="text-4xl mb-3">{current.emoji}</div>
                <h2 className="font-display text-xl mb-2">{current.title}</h2>
                <p className="text-sm text-ash mb-6">{current.body}</p>

                <div className="flex items-center justify-center gap-1.5 mb-6">
                    {STEPS.map((_, i) => (
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
                                navigate("/");
                            } else {
                                setStep((s) => s + 1);
                            }
                        }}
                        className="bg-ink text-paper px-5 py-2 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity"
                    >
                        {isLast ? "Start browsing" : "Next"}
                    </button>
                </div>
            </div>
        </div>
    );
}
