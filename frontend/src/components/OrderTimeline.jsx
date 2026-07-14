const STEPS = [
    { key: "pending", label: "Placed" },
    { key: "processing", label: "Processing" },
    { key: "shipped", label: "Shipped" },
    { key: "delivered", label: "Delivered" }
];

export default function OrderTimeline({ status }) {
    if (status === "cancelled") {
        return (
            <div className="flex items-center gap-2 text-sm text-coral bg-coral/10 rounded-md px-3 py-2 mb-8">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 shrink-0">
                    <circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" />
                </svg>
                This order was cancelled.
            </div>
        );
    }

    const currentIndex = STEPS.findIndex((s) => s.key === status);

    return (
        <div className="flex items-center mb-8">
            {STEPS.map((step, i) => {
                const done = i <= currentIndex;
                const isLast = i === STEPS.length - 1;
                return (
                    <div key={step.key} className={`flex items-center ${isLast ? "" : "flex-1"}`}>
                        <div className="flex flex-col items-center shrink-0">
                            <div
                                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                                    done ? "bg-teal text-paper" : "bg-line text-ash"
                                }`}
                            >
                                {done ? "✓" : i + 1}
                            </div>
                            <p className={`text-[11px] mt-1.5 whitespace-nowrap ${done ? "text-ink font-medium" : "text-ash"}`}>
                                {step.label}
                            </p>
                        </div>
                        {!isLast && (
                            <div className={`flex-1 h-0.5 mx-1.5 mb-4 transition-colors ${i < currentIndex ? "bg-teal" : "bg-line"}`} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}
