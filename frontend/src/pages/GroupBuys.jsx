import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import PageMeta from "../components/PageMeta";
import PageLoader from "../components/PageLoader";
import EmptyState from "../components/ui/EmptyState";
import { useCurrency } from "../context/CurrencyContext";

export default function GroupBuys() {
    const { format } = useCurrency();
    const [groups, setGroups] = useState(null);

    useEffect(() => {
        api.get("/group-buys").then(({ data }) => setGroups(data.data)).catch(() => setGroups([]));
    }, []);

    if (groups === null) return <PageLoader />;

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
            <PageMeta title="Group buys" description="Join a group buy to unlock a lower price together." />
            <h1 className="font-display text-2xl mb-1">Group buys</h1>
            <p className="text-ash text-sm mb-8">Join enough people before the deadline and everyone gets the discounted price.</p>

            {groups.length === 0 ? (
                <EmptyState title="No open group buys right now" hint="Check back soon for new deals." />
            ) : (
                <ul className="space-y-3">
                    {groups.map((g) => (
                        <li key={g.id}>
                            <Link to={`/group-buys/${g.id}`} className="block border border-line rounded-lg p-4 hover:border-abyss transition-colors">
                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                    <div>
                                        <p className="font-medium text-sm">{g.product_name}</p>
                                        <p className="text-xs text-ash mt-0.5">
                                            {g.participant_count}/{g.min_participants} joined · ends {new Date(g.deadline).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="price font-medium">{format(g.group_price)}</p>
                                        <p className="text-xs text-ash line-through">{format(g.product_price)}</p>
                                    </div>
                                </div>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
