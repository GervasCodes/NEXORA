import { lazy, Suspense, useState } from "react";
import { Routes, Route } from "react-router-dom";
import Header from "./components/Header";
import Footer from "./components/Footer";
import SplashScreen from "./components/SplashScreen";
import PageLoader from "./components/PageLoader";
import RequireBuyer from "./components/RequireBuyer";
import RequireSeller from "./components/RequireSeller";
import RequireAuth from "./components/RequireAuth";
import RequireDeliveryAgent from "./components/RequireDeliveryAgent";
import RequireAdmin from "./components/RequireAdmin";
import SellerLayout from "./components/SellerLayout";
import DeliveryLayout from "./components/DeliveryLayout";
import AdminLayout from "./components/AdminLayout";

// Every page below is code-split with React.lazy instead of imported
// eagerly. Previously this file pulled in all ~28 pages - admin tables,
// seller analytics charts, delivery dashboards - into one bundle that
// EVERY visitor downloaded before seeing the homepage, even a buyer who
// never touches the seller or admin areas. Each import() below becomes
// its own chunk that only loads when that route is actually visited.
const Home = lazy(() => import("./pages/Home"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const Cart = lazy(() => import("./pages/Cart"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Orders = lazy(() => import("./pages/Orders"));
const OrderDetail = lazy(() => import("./pages/OrderDetail"));
const Messages = lazy(() => import("./pages/Messages"));
const ConversationThread = lazy(() => import("./pages/ConversationThread"));
const Account = lazy(() => import("./pages/Account"));

const SellerSetup = lazy(() => import("./pages/seller/SellerSetup"));
const SellerOverview = lazy(() => import("./pages/seller/SellerOverview"));
const SellerProducts = lazy(() => import("./pages/seller/SellerProducts"));
const SellerProductForm = lazy(() => import("./pages/seller/SellerProductForm"));
const SellerOrders = lazy(() => import("./pages/seller/SellerOrders"));
const SellerDeliveryTeam = lazy(() => import("./pages/seller/SellerDeliveryTeam"));
const SellerStore = lazy(() => import("./pages/seller/SellerStore"));
const SellerAnalytics = lazy(() => import("./pages/seller/SellerAnalytics"));
const SellerWallet = lazy(() => import("./pages/seller/SellerWallet"));
const SellerVerification = lazy(() => import("./pages/seller/SellerVerification"));

const DeliveryAvailable = lazy(() => import("./pages/delivery/DeliveryAvailable"));
const DeliveryMine = lazy(() => import("./pages/delivery/DeliveryMine"));
const DeliveryEarnings = lazy(() => import("./pages/delivery/DeliveryEarnings"));

const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminSellers = lazy(() => import("./pages/admin/AdminSellers"));
const AdminProducts = lazy(() => import("./pages/admin/AdminProducts"));
const AdminCategories = lazy(() => import("./pages/admin/AdminCategories"));
const AdminStoreTypes = lazy(() => import("./pages/admin/AdminStoreTypes"));
const AdminOrders = lazy(() => import("./pages/admin/AdminOrders"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const AdminWithdrawals = lazy(() => import("./pages/admin/AdminWithdrawals"));
const AdminVerifications = lazy(() => import("./pages/admin/AdminVerifications"));
const AdminManageAdmins = lazy(() => import("./pages/admin/AdminManageAdmins"));

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
                <Suspense fallback={<PageLoader />}>
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
                        <Route path="/account" element={<RequireAuth><Account /></RequireAuth>} />

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
                            <Route path="verification" element={<SellerVerification />} />
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
                            <Route path="verifications" element={<AdminVerifications />} />
                            <Route path="admins" element={<AdminManageAdmins />} />
                        </Route>

                        <Route path="*" element={
                            <div className="max-w-lg mx-auto py-24 px-6 text-center">
                                <p className="font-display text-2xl mb-2">Page not found</p>
                            </div>
                        } />
                    </Routes>
                </Suspense>
            </main>

            <Footer />
        </div>
    );
}
