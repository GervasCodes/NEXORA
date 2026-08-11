import { createContext, useCallback, useContext, useMemo, useState } from "react";

const AIAssistantContext = createContext(null);

// Lets any page (e.g. OrderDetail's "Ask Nexora AI about this order"
// button) open the shared drawer pre-loaded with a specific context,
// rather than every page needing its own copy of the chat UI. Mirrors
// ToastContext's provider/hook shape.
export function AIAssistantProvider({ children }) {
    const [isOpen, setIsOpen] = useState(false);
    const [pendingContext, setPendingContext] = useState(null);

    const open = useCallback((context = null) => {
        setPendingContext(context);
        setIsOpen(true);
    }, []);

    const close = useCallback(() => {
        setIsOpen(false);
        setPendingContext(null);
    }, []);

    const value = useMemo(() => ({ isOpen, pendingContext, open, close }), [isOpen, pendingContext, open, close]);

    return <AIAssistantContext.Provider value={value}>{children}</AIAssistantContext.Provider>;
}

export const useAIAssistant = () => useContext(AIAssistantContext);
