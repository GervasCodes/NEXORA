import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";

export default function Header() {
    const { user, logout } = useAuth();
    const { itemCount } = useCart();
    const navigate = useNavigate();
    const [search, setSearch] = useState("");

    const handleSearch = (e) => {
        e.preventDefault();
        navigate(search.trim() ? `/?search=${encodeURIComponent(search.trim())}` : "/");
    };

    return (
        <header className="glass-dark text-paper sticky top-0 z-40">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center gap-6">
                <Link to="/" className="flex items-center gap-2 shrink-0">
                    <span className="font-display italic text-xl tracking-tight">NEXORA</span>
                </Link>

                <form onSubmit={handleSearch} className="flex-1 hidden sm:flex">
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        type="text"
                        placeholder="Search products, brands..."
                        className="w-full max-w-md bg-paper placeholder-ash text-ink rounded-l-md px-4 py-2 text-sm focus-ring border border-transparent"
                    />
                    <button
                        type="submit"
                        className="bg-mango text-abyss px-4 rounded-r-md text-sm font-semibold hover:bg-mango-dark transition-colors focus-ring"
                    >
                        Search
                    </button>
                </form>

                <nav className="flex items-center gap-5 text-sm ml-auto">
                    {user?.role === "seller" && (
                        <Link to="/seller" className="text-paper/80 hover:text-azure-light transition-colors">
                            Dashboard
                        </Link>
                    )}

                    {user?.role === "delivery_agent" && (
                        <Link to="/delivery" className="text-paper/80 hover:text-azure-light transition-colors">
                            Deliveries
                        </Link>
                    )}

                    {user?.role === "admin" && (
                        <Link to="/admin" className="text-paper/80 hover:text-azure-light transition-colors">
                            Admin
                        </Link>
                    )}

                    {(user?.role === "buyer" || user?.role === "seller") && (
                        <Link to="/messages" className="text-paper/80 hover:text-azure-light transition-colors">
                            Messages
                        </Link>
                    )}

                    {user?.role === "buyer" && (
                        <Link to="/orders" className="text-paper/80 hover:text-azure-light transition-colors hidden sm:inline">
                            Orders
                        </Link>
                    )}

                    {user?.role === "buyer" && (
                        <Link to="/cart" className="relative text-paper/80 hover:text-azure-light transition-colors">
                            Cart
                            {itemCount > 0 && (
                                <span className="absolute -top-2 -right-3 bg-mango text-abyss text-[10px] font-mono font-semibold rounded-full w-4 h-4 flex items-center justify-center">
                                    {itemCount}
                                </span>
                            )}
                        </Link>
                    )}

                    {user && (
                        <Link to="/account" className="text-paper/80 hover:text-azure-light transition-colors hidden sm:inline">
                            Account
                        </Link>
                    )}

                    {user ? (
                        <button
                            onClick={() => { logout(); navigate("/"); }}
                            className="text-paper/80 hover:text-azure-light transition-colors"
                        >
                            Sign out
                        </button>
                    ) : (
                        <>
                            <Link to="/login" className="text-paper/80 hover:text-azure-light transition-colors">Sign in</Link>
                            <Link
                                to="/register"
                                className="bg-mango text-abyss px-3 py-1.5 rounded-md font-semibold hover:bg-mango-dark transition-colors"
                            >
                                Join
                            </Link>
                        </>
                    )}
                </nav>
            </div>

            <form onSubmit={handleSearch} className="sm:hidden px-4 pb-3 flex">
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    type="text"
                    placeholder="Search products..."
                    className="w-full bg-paper placeholder-ash text-ink rounded-l-md px-4 py-2 text-sm focus-ring border border-transparent"
                />
                <button type="submit" className="bg-mango text-abyss px-4 rounded-r-md text-sm font-semibold">Go</button>
            </form>
        </header>
    );
}
