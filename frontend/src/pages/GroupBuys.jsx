import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import PageMeta from "../components/PageMeta";
import PageLoader from "../components/PageLoader";
import EmptyState from "../components/ui/EmptyState";
import StatusBadge from "../components/ui/StatusBadge";
import { useCurrency } from "../context/CurrencyContext";
import { formatTimeRemaining } from "../utils/format";
import { GroupBuysIcon } from "../components/NavIcons";

export default function GroupBuys() {
    const { format } = useCurrency();
    const [groups, setGroups] = useState(null);

    useEffect(() => {
        api.get("/group-buys").then(({ data }) => setGroups(data.data)).catch(() => setGroups([]));
    }, []);

    // Live countdown (Phase 4 remediation) - same reasoning as
    // GroupBuyDetail.jsx: formatTimeRemaining() is only as fresh as the
    // last render, so without a tick a list left open in a background
    // tab would show a stale "2 hours left" indefinitely.
    const [, setTick] = useState(0);
    useEffect(() => {
        const timer = setInterval(() => setTick((n) => n + 1), 30000);
        return () => clearInterval(timer);
    }, []);

    if (groups === null) return <PageLoader />;

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
            <PageMeta title="Group buys" description="Join a group buy to unlock a lower price together." />
            <h1 className="font-display text-2xl mb-1">Group buys</h1>
            <p className="text-ash text-sm mb-8">Join enough people before the deadline and everyone gets the discounted price.</p>

            {groups.length === 0 ? (
                <EmptyState
                    title="No open group buys right now"
                    hint="Check back soon for new deals."
                    tone="coral"
                    icon={<GroupBuysIcon className="w-7 h-7" />}
                />
            ) : (
                <ul className="space-y-3">
                    {groups.map((g) => {
                        const progress = Math.min(100, Math.round((g.participant_count / g.min_participants) * 100));
                        const timeLeft = formatTimeRemaining(g.deadline);
                        const moreNeeded = Math.max(0, g.min_participants - g.participant_count);

                        return (
                            <li key={g.id}>
                                <Link to={`/group-buys/${g.id}`} className="flex gap-3 border border-line rounded-lg p-4 hover:border-abyss transition-colors">
                                    {g.product_image && (
                                        <img
                                            src={g.product_image}
                                            alt={g.product_name}
                                            className="w-16 h-16 rounded-md object-cover shrink-0"
                                            loading="lazy"
                                            width="64"
                                            height="64"
                                        />
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                                            <p className="font-medium text-sm">{g.product_name}</p>
                                            <div className="text-right flex items-start gap-2">
                                                <div>
                                                    <p className="price font-medium">{format(g.group_price)}</p>
                                                    <p className="text-xs text-ash line-through">{format(g.product_price)}</p>
                                                </div>
                                                <StatusBadge domain="groupBuy" status={g.status} size="sm" />
                                            </div>
                                        </div>
                                        <div className="h-1.5 bg-line rounded-full overflow-hidden mb-1.5">
                                            <div className="h-full bg-teal transition-all" style={{ width: `${progress}%` }} />
                                        </div>
                                        <p className="text-xs text-ash">
                                            {g.participant_count}/{g.min_participants} joined
                                            {g.status === "open" && moreNeeded > 0 && (
                                                <span className="text-mango-dark font-medium"> · {moreNeeded} more needed</span>
                                            )}
                                            {timeLeft ? ` · ${timeLeft}` : ""}
                                        </p>
                                    </div>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
