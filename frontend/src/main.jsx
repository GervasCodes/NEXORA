import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { CartProvider } from "./context/CartContext.jsx";
import { SocketProvider } from "./context/SocketContext.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
    <StrictMode>
        <BrowserRouter>
            <AuthProvider>
                <SocketProvider>
                    <CartProvider>
                        <App />
                    </CartProvider>
                </SocketProvider>
            </AuthProvider>
        </BrowserRouter>
    </StrictMode>
);
