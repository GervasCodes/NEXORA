import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";

export default function ConversationThread() {
    const { id } = useParams();
    const { user } = useAuth();
    const { socket } = useSocket();

    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [draft, setDraft] = useState("");
    const [error, setError] = useState("");
    const [sending, setSending] = useState(false);
    const bottomRef = useRef(null);

    useEffect(() => {
        setLoading(true);
        api.get(`/chat/conversations/${id}/messages`)
            .then(({ data }) => setMessages(data.data))
            .catch(() => setError("Couldn't load this conversation."))
            .finally(() => setLoading(false));

        api.put(`/chat/conversations/${id}/read`).catch(() => {});
    }, [id]);

    useEffect(() => {
        if (!socket) return;

        socket.emit("join_conversation", id);

        const handleNewMessage = (payload) => {
            if (String(payload.conversation_id) !== String(id)) return;
            setMessages((prev) =>
                prev.some((m) => m.id === payload.id) ? prev : [...prev, payload]
            );
        };

        socket.on("new_message", handleNewMessage);

        return () => {
            socket.emit("leave_conversation", id);
            socket.off("new_message", handleNewMessage);
        };
    }, [socket, id]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSend = async (e) => {
        e.preventDefault();
        const text = draft.trim();
        if (!text) return;

        setSending(true);
        setError("");
        setDraft("");

        try {
            const { data } = await api.post(`/chat/conversations/${id}/messages`, { message: text });
            setMessages((prev) =>
                prev.some((m) => m.id === data.data.id) ? prev : [...prev, data.data]
            );
        } catch (err) {
            setError(extractErrorMessage(err));
            setDraft(text);
        } finally {
            setSending(false);
        }
    };

    if (loading) return <div className="max-w-2xl mx-auto px-6 py-16 text-ash">Loading…</div>;

    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 flex flex-col h-[calc(100vh-64px)]">
            <Link to="/messages" className="text-sm text-teal hover:underline mb-4 inline-block">
                ← All messages
            </Link>

            <div className="flex-1 overflow-y-auto space-y-3 pb-4">
                {messages.map((m) => {
                    const mine = m.sender_id === user.id;
                    return (
                        <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                            <div
                                className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                                    mine
                                        ? "bg-abyss text-paper rounded-br-sm"
                                        : "bg-line/50 text-ink rounded-bl-sm"
                                }`}
                            >
                                {m.message}
                            </div>
                        </div>
                    );
                })}
                <div ref={bottomRef} />
            </div>

            {error && <p className="text-coral text-sm mb-2">{error}</p>}

            <form onSubmit={handleSend} className="flex gap-2 border-t border-line pt-4">
                <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Write a message…"
                    className="flex-1 border border-line rounded-full px-4 py-2 text-sm focus-ring"
                />
                <button
                    type="submit"
                    disabled={sending || !draft.trim()}
                    className="bg-mango text-abyss px-5 py-2 rounded-full text-sm font-semibold hover:bg-mango-dark transition-colors disabled:opacity-50"
                >
                    Send
                </button>
            </form>
        </div>
    );
}
