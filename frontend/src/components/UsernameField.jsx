import { useEffect, useRef, useState } from "react";
import api from "../api/client";
import Input from "./ui/Input";
import { useLanguage } from "../context/LanguageContext";
import { USERNAME_MAX, isValidUsernameFormat } from "../utils/username";

// How long to wait after the last keystroke before asking the server whether
// the name is free (the endpoint is rate-limited, so don't ask per keystroke).
const CHECK_DEBOUNCE_MS = 450;

/**
 * Username input with a live availability check (round 5, phase 6).
 *
 * Reports its state to the parent through `onStatusChange` so the form can
 * block submit while the name is invalid/taken:
 *   "idle" | "checking" | "available" | "invalid" | "reserved" | "taken" | "error"
 * "error" means the check itself failed (e.g. server asleep) - parents should
 * NOT block on it, because the server re-validates on submit anyway.
 *
 * `currentUsername` (Account settings) makes keeping the existing name read as
 * fine without calling the server.
 */
export default function UsernameField({
    value,
    onChange,
    onStatusChange,
    currentUsername = "",
    suggestion = "",
    disabled = false,
    id,
    label,
    hint
}) {
    const { t } = useLanguage();
    const [status, setStatus] = useState("idle");
    const requestId = useRef(0);

    const report = (next) => {
        setStatus(next);
        onStatusChange?.(next);
    };

    useEffect(() => {
        const username = String(value ?? "").trim();
        requestId.current += 1;
        const myRequest = requestId.current;

        if (!username) {
            report("idle");
            return undefined;
        }
        if (!isValidUsernameFormat(username)) {
            report("invalid");
            return undefined;
        }
        if (currentUsername && username === currentUsername) {
            report("available");
            return undefined;
        }

        report("checking");
        const timer = setTimeout(async () => {
            try {
                const { data } = await api.get("/auth/username-available", { params: { username } });
                if (myRequest !== requestId.current) return; // a newer keystroke won
                const result = data?.data;
                report(result?.available ? "available" : (result?.reason || "taken"));
            } catch {
                if (myRequest !== requestId.current) return;
                report("error");
            }
        }, CHECK_DEBOUNCE_MS);

        return () => clearTimeout(timer);
        // report is stable enough here: it only sets state + calls the parent callback
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, currentUsername]);

    const messages = {
        invalid: t("username.invalid"),
        reserved: t("username.reserved"),
        taken: t("username.taken")
    };
    const error = messages[status] || "";
    const statusLine = status === "available"
        ? t("username.available")
        : status === "checking"
            ? t("username.checking")
            : "";

    return (
        <div>
            <Input
                id={id}
                label={label || t("username.label")}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                maxLength={USERNAME_MAX}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                disabled={disabled}
                error={error}
                hint={error ? undefined : (hint || t("username.hint"))}
            />
            {statusLine && (
                <p role="status" className={`text-xs mt-1 ${status === "available" ? "text-teal" : "text-ash"}`}>
                    {statusLine}
                </p>
            )}
            {suggestion && suggestion !== value && (
                <button
                    type="button"
                    onClick={() => onChange(suggestion)}
                    className="text-xs text-teal underline mt-1 focus-ring rounded"
                >
                    {t("username.useSuggestion", { name: suggestion })}
                </button>
            )}
        </div>
    );
}
