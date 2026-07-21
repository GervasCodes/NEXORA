import { useLanguage } from "../context/LanguageContext";

const VEHICLE_LABELS = {
    bicycle: "Bicycle",
    motorcycle: "Motorcycle",
    tuktuk: "Tuk-tuk",
    car: "Car",
    van: "Van",
    truck: "Truck"
};

export default function CourierDetailsCard({ delivery, onMessage }) {
    const { t } = useLanguage();

    const name = [delivery.agent_first_name, delivery.agent_last_name].filter(Boolean).join(" ");
    const initials = (delivery.agent_first_name?.[0] || "?").toUpperCase();

    return (
        <div className="border border-line rounded-xl p-4">
            <p className="text-xs uppercase tracking-widest text-ash mb-3">
                {t("delivery.tracking.courierDetails")}
            </p>
            <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-mango/20 text-mango-dark flex items-center justify-center font-display text-lg shrink-0">
                    {initials}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{name || "—"}</p>
                    <p className="text-xs text-ash">
                        {(delivery.agent_vehicle_type || delivery.agent_vehicle_plate_number)
                            ? `${VEHICLE_LABELS[delivery.agent_vehicle_type] || delivery.agent_vehicle_type || ""}${
                                delivery.agent_vehicle_plate_number ? ` · ${delivery.agent_vehicle_plate_number}` : ""
                            }`
                            : "—"}
                    </p>
                </div>
            </div>

            <div className="flex gap-2 mt-4">
                <button
                    type="button"
                    onClick={onMessage}
                    className="flex-1 border border-line rounded-md py-2 text-sm font-medium hover:border-abyss transition-colors focus-ring"
                >
                    💬 {t("delivery.tracking.messageCourier")}
                </button>
                {delivery.agent_phone && (
                    <a
                        href={`tel:${delivery.agent_phone}`}
                        className="flex-1 border border-line rounded-md py-2 text-sm font-medium text-center hover:border-abyss transition-colors focus-ring"
                    >
                        📞 {t("delivery.tracking.callCourier")}
                    </a>
                )}
            </div>
        </div>
    );
}
