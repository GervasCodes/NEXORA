import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import * as Sentry from "@sentry/react";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { CartProvider } from "./context/CartContext.jsx";
import { SocketProvider } from "./context/SocketContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { CurrencyProvider } from "./context/CurrencyContext.jsx";
import { LanguageProvider } from "./context/LanguageContext.jsx";
import { WishlistProvider } from "./context/WishlistContext.jsx";
import { ToastProvider } from "./context/ToastContext.jsx";
import "./index.css";

// Same "degrade gracefully when unconfigured" pattern as the backend
// (see backend/src/config/sentry.js) - VITE_SENTRY_DSN is optional, so
// local dev never needs a real DSN. tracesSampleRate/replay are left off
// by default (error tracking only) for the same free-tier-quota reason
// documented on the backend side.
if (import.meta.env.VITE_SENTRY_DSN) {
    Sentry.init({
        dsn: import.meta.env.VITE_SENTRY_DSN,
        environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE
    });
}

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch(() => {

        });
    });

    // Phase 5 (Resilience & Growth): sw.js calls self.skipWaiting() on
    // every install, so a newly-deployed service worker takes over an
    // already-open tab's requests almost immediately - but that tab's
    // already-loaded JS/HTML in memory is still the old build. Rather
    // than force a reload mid-session (losing an unsaved cart edit, a
    // half-typed message, etc.), dispatch an event the UI can react to
    // with a dismissible "update available" prompt - see
    // UpdateAvailableBanner.jsx. `hadController` distinguishes a genuine
    // update (a service worker was already controlling this tab, and a
    // new one just took over) from a first-ever visit (no controller yet,
    // nothing to "update" from) - without it, every brand-new visitor
    // would see an "update available" prompt on their very first load.
    // `refreshed` guards against this firing more than once per page load.
    let refreshed = false;
    const hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshed) return;
        refreshed = true;
        if (hadController) {
            window.dispatchEvent(new Event("nexora:sw-updated"));
        }
    });
}

createRoot(document.getElementById("root")).render(
    <StrictMode>
        <ThemeProvider>
            <LanguageProvider>
                <CurrencyProvider>
                    <BrowserRouter>
                        <AuthProvider>
                            <SocketProvider>
                                <CartProvider>
                                    <WishlistProvider>
                                        <ToastProvider>
                                            <Sentry.ErrorBoundary fallback={<p>Something went wrong. Please refresh the page.</p>}>
                                                <App />
                                            </Sentry.ErrorBoundary>
                                        </ToastProvider>
                                    </WishlistProvider>
                                </CartProvider>
                            </SocketProvider>
                        </AuthProvider>
                    </BrowserRouter>
                </CurrencyProvider>
            </LanguageProvider>
        </ThemeProvider>
    </StrictMode>
);
