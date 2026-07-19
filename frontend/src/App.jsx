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


const Home = lazy(() => import("./pages/Home"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const Cart = lazy(() => import("./pages/Cart"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Orders = lazy(() => import("./pages/Orders"));
const OrderDetail = lazy(() => import("./pages/OrderDetail"));
const Messages = lazy(() => import("./pages/Messages"));
const ConversationThread = lazy(() => import("./pages/ConversationThread"));
const Account = lazy(() => import("./pages/Account"));
const Saved = lazy(() => import("./pages/Saved"));
const Disputes = lazy(() => import("./pages/Disputes"));
const NewDispute = lazy(() => import("./pages/NewDispute"));
const DisputeDetail = lazy(() => import("./pages/DisputeDetail"));
const LegalPage = lazy(() => import("./pages/legal/LegalPage"));

const SellerSetup = lazy(() => import("./pages/seller/SellerSetup"));
const SellerOverview = lazy(() => import("./pages/seller/SellerOverview"));
const SellerProducts = lazy(() => import("./pages/seller/SellerProducts"));
const SellerProductForm = lazy(() => import("./pages/seller/SellerProductForm"));
const SellerOrders = lazy(() => import("./pages/seller/SellerOrders"));
const SellerDeliveryTeam = lazy(() => import("./pages/seller/SellerDeliveryTeam"));
const SellerStore = lazy(() => import("./pages/seller/SellerStore"));
const SellerAnalytics = lazy(() => import("./pages/seller/SellerAnalytics"));
const SellerWallet = lazy(() => import("./pages/seller/SellerWallet"));
const SellerDisputes = lazy(() => import("./pages/seller/SellerDisputes"));

const DeliveryAvailable = lazy(() => import("./pages/delivery/DeliveryAvailable"));
const DeliveryMine = lazy(() => import("./pages/delivery/DeliveryMine"));
const DeliveryEarnings = lazy(() => import("./pages/delivery/DeliveryEarnings"));
const DeliveryRatings = lazy(() => import("./pages/delivery/DeliveryRatings"));

const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminSellers = lazy(() => import("./pages/admin/AdminSellers"));
const AdminProducts = lazy(() => import("./pages/admin/AdminProducts"));
const AdminCategories = lazy(() => import("./pages/admin/AdminCategories"));
const AdminStoreTypes = lazy(() => import("./pages/admin/AdminStoreTypes"));
const AdminOrders = lazy(() => import("./pages/admin/AdminOrders"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const AdminWithdrawals = lazy(() => import("./pages/admin/AdminWithdrawals"));
const AdminAccountVerifications = lazy(() => import("./pages/admin/AdminAccountVerifications"));
const AdminManageAdmins = lazy(() => import("./pages/admin/AdminManageAdmins"));
const AdminFraud = lazy(() => import("./pages/admin/AdminFraud"));
const AdminDisputes = lazy(() => import("./pages/admin/AdminDisputes"));

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
                        <Route path="/forgot-password" element={<ForgotPassword />} />

                        <Route path="/cart" element={<RequireBuyer><Cart /></RequireBuyer>} />
                        <Route path="/checkout" element={<RequireBuyer><Checkout /></RequireBuyer>} />
                        <Route path="/orders" element={<RequireBuyer><Orders /></RequireBuyer>} />
                        <Route path="/orders/:id" element={<RequireBuyer><OrderDetail /></RequireBuyer>} />
                        <Route path="/legal/:slug" element={<LegalPage />} />
                        <Route path="/saved" element={<RequireBuyer><Saved /></RequireBuyer>} />
                        <Route path="/disputes" element={<RequireBuyer><Disputes /></RequireBuyer>} />
                        <Route path="/disputes/new" element={<RequireBuyer><NewDispute /></RequireBuyer>} />
                        {/* Shared: buyer, seller, or admin - dispute.service.js enforces per-dispute access */}
                        <Route path="/disputes/:id" element={<RequireAuth><DisputeDetail /></RequireAuth>} />

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
                            <Route path="disputes" element={<SellerDisputes />} />
                        </Route>

                        <Route path="/delivery" element={<RequireDeliveryAgent><DeliveryLayout /></RequireDeliveryAgent>}>
                            <Route index element={<DeliveryAvailable />} />
                            <Route path="mine" element={<DeliveryMine />} />
                            <Route path="earnings" element={<DeliveryEarnings />} />
                            <Route path="ratings" element={<DeliveryRatings />} />
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
                            <Route path="account-verifications" element={<AdminAccountVerifications />} />
                            <Route path="admins" element={<AdminManageAdmins />} />
                            <Route path="fraud" element={<AdminFraud />} />
                            <Route path="disputes" element={<AdminDisputes />} />
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
