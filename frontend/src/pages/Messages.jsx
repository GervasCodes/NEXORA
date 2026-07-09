import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function Messages() {
    const { user } = useAuth();
    const [conversations, setConversations] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get("/chat/conversations")
            .then(({ data }) => setConversations(data.data))
            .finally(() => setLoading(false));
    }, []);

    const otherPartyName = (c) => {
        const isMeBuyer = c.buyer_id === user.id;
        return isMeBuyer
            ? `${c.seller_first_name} ${c.seller_last_name}`
            : `${c.buyer_first_name} ${c.buyer_last_name}`;
    };

    if (loading) return <div className="max-w-2xl mx-auto px-6 py-16 text-ash">Loading messages…</div>;

    if (conversations.length === 0) {
        return (
            <div className="max-w-2xl mx-auto px-6 py-24 text-center">
                <p className="font-display text-2xl mb-2">No messages yet</p>
                <p className="text-ash text-sm">
                    {user.role === "buyer"
                        ? "Message a seller from any product page to start a conversation."
                        : "Buyers can message you from your product pages."}
                </p>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
            <h1 className="font-display text-3xl mb-8">Messages</h1>

            <ul className="divide-y divide-line border-y border-line">
                {conversations.map((c) => (
                    <li key={c.id}>
                        <Link
                            to={`/messages/${c.id}`}
                            className="py-4 flex items-center gap-4 hover:bg-line/20 transition-colors -mx-2 px-2 rounded-md"
                        >
                            <div className="w-10 h-10 rounded-full bg-abyss text-paper flex items-center justify-center font-display text-sm shrink-0">
                                {otherPartyName(c).charAt(0).toUpperCase()}
                            </div>

                            <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-medium truncate">{otherPartyName(c)}</p>
                                    {c.unread_count > 0 && (
                                        <span className="bg-mango text-abyss text-[10px] font-mono font-semibold rounded-full w-4 h-4 flex items-center justify-center shrink-0">
                                            {c.unread_count}
                                        </span>
                                    )}
                                </div>
                                {c.product_name && (
                                    <p className="text-xs text-azure-deep truncate">Re: {c.product_name}</p>
                                )}
                                <p className="text-xs text-ash truncate">{c.last_message || "No messages yet"}</p>
                            </div>
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
}
