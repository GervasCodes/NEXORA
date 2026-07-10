import { useState } from "react";
import { Routes, Route } from "react-router-dom";
import Header from "./components/Header";
import Footer from "./components/Footer";
import SplashScreen from "./components/SplashScreen";
import RequireBuyer from "./components/RequireBuyer";
import RequireSeller from "./components/RequireSeller";
import RequireAuth from "./components/RequireAuth";
import RequireDeliveryAgent from "./components/RequireDeliveryAgent";
import RequireAdmin from "./components/RequireAdmin";
import SellerLayout from "./components/SellerLayout";
import DeliveryLayout from "./components/DeliveryLayout";
import AdminLayout from "./components/AdminLayout";

import Home from "./pages/Home";
import ProductDetail from "./pages/ProductDetail";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import Orders from "./pages/Orders";
import OrderDetail from "./pages/OrderDetail";
import Messages from "./pages/Messages";
import ConversationThread from "./pages/ConversationThread";

import SellerSetup from "./pages/seller/SellerSetup";
import SellerOverview from "./pages/seller/SellerOverview";
import SellerProducts from "./pages/seller/SellerProducts";
import SellerProductForm from "./pages/seller/SellerProductForm";
import SellerOrders from "./pages/seller/SellerOrders";
import SellerDeliveryTeam from "./pages/seller/SellerDeliveryTeam";
import SellerStore from "./pages/seller/SellerStore";
import SellerAnalytics from "./pages/seller/SellerAnalytics";
import SellerWallet from "./pages/seller/SellerWallet";
import DeliveryAvailable from "./pages/delivery/DeliveryAvailable";
import DeliveryMine from "./pages/delivery/DeliveryMine";
import DeliveryEarnings from "./pages/delivery/DeliveryEarnings";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminSellers from "./pages/admin/AdminSellers";
import AdminProducts from "./pages/admin/AdminProducts";
import AdminCategories from "./pages/admin/AdminCategories";
import AdminStoreTypes from "./pages/admin/AdminStoreTypes";
import AdminOrders from "./pages/admin/AdminOrders";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminWithdrawals from "./pages/admin/AdminWithdrawals";

export default function App() {
    const [showSplash, setShowSplash] = useState(
        () => !sessionStorage.getItem("nexora_splash_shown")
    );

    if (showSplash) {
        return <SplashScreen onDone={() => setShowSplash(false)} />;
    }

    return (
        <div className="min-h-screen flex flex-col">
            <Header />

            <main className="flex-1">
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/products/:slug" element={<ProductDetail />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />

                    <Route path="/cart" element={<RequireBuyer><Cart /></RequireBuyer>} />
                    <Route path="/checkout" element={<RequireBuyer><Checkout /></RequireBuyer>} />
                    <Route path="/orders" element={<RequireBuyer><Orders /></RequireBuyer>} />
                    <Route path="/orders/:id" element={<RequireBuyer><OrderDetail /></RequireBuyer>} />

                    <Route path="/messages" element={<RequireAuth><Messages /></RequireAuth>} />
                    <Route path="/messages/:id" element={<RequireAuth><ConversationThread /></RequireAuth>} />

                    <Route path="/seller" element={<RequireSeller><SellerLayout /></RequireSeller>}>
                        <Route path="setup" element={<SellerSetup />} />
                        <Route index element={<SellerOverview />} />
                        <Route path="products" element={<SellerProducts />} />
                        <Route path="products/new" element={<SellerProductForm />} />
                        <Route path="products/:id/edit" element={<SellerProductForm />} />
                        <Route path="orders" element={<SellerOrders />} />
                        <Route path="delivery-team" element={<SellerDeliveryTeam />} />
                        <Route path="store" element={<SellerStore />} />
                        <Route path="analytics" element={<SellerAnalytics />} />
                        <Route path="wallet" element={<SellerWallet />} />
                    </Route>

                    <Route path="/delivery" element={<RequireDeliveryAgent><DeliveryLayout /></RequireDeliveryAgent>}>
                        <Route index element={<DeliveryAvailable />} />
                        <Route path="mine" element={<DeliveryMine />} />
                        <Route path="earnings" element={<DeliveryEarnings />} />
                    </Route>

                    <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
                        <Route index element={<AdminDashboard />} />
                        <Route path="users" element={<AdminUsers />} />
                        <Route path="sellers" element={<AdminSellers />} />
                        <Route path="products" element={<AdminProducts />} />
                        <Route path="categories" element={<AdminCategories />} />
                        <Route path="store-types" element={<AdminStoreTypes />} />
                        <Route path="orders" element={<AdminOrders />} />
                        <Route path="settings" element={<AdminSettings />} />
                        <Route path="withdrawals" element={<AdminWithdrawals />} />
                    </Route>

                    <Route path="*" element={
                        <div className="max-w-lg mx-auto py-24 px-6 text-center">
                            <p className="font-display text-2xl mb-2">Page not found</p>
                        </div>
                    } />
                </Routes>
            </main>

            <Footer />
        </div>
    );
}
