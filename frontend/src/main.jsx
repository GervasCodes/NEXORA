import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
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

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch(() => {

        });
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
                                            <App />
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
