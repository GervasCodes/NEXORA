import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function RequireAdmin({ children }) {
    const { user } = useAuth();

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (user.role !== "admin") {
        return (
            <div className="max-w-lg mx-auto py-24 px-6 text-center">
                <p className="font-display text-2xl mb-2">This page is for administrators</p>
                <p className="text-ash">You're signed in as a {user.role.replace("_", " ")}.</p>
            </div>
        );
    }

    return children;
}
