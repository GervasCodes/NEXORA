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
import "./index.css";

createRoot(document.getElementById("root")).render(
    <StrictMode>
        <ThemeProvider>
            <LanguageProvider>
                <CurrencyProvider>
                    <BrowserRouter>
                        <AuthProvider>
                            <SocketProvider>
                                <CartProvider>
                                    <App />
                                </CartProvider>
                            </SocketProvider>
                        </AuthProvider>
                    </BrowserRouter>
                </CurrencyProvider>
            </LanguageProvider>
        </ThemeProvider>
    </StrictMode>
);
