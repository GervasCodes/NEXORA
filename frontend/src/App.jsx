import { lazy, Suspense, useEffect, useState } from "react";
import { Routes, Route, Link, useNavigate } from "react-router-dom";
import Header from "./components/Header";
import Footer from "./components/Footer";
import SplashScreen from "./components/SplashScreen";
import SuspendedScreen from "./components/SuspendedScreen";
import PageLoader from "./components/PageLoader";
import PageTransition from "./components/PageTransition";
import RouteProgressBar from "./components/RouteProgressBar";
import UpdateAvailableBanner from "./components/UpdateAvailableBanner";
import NetworkStatusNotice from "./components/NetworkStatusNotice";
import InstallPrompt from "./components/InstallPrompt";
import SupportWidget from "./components/SupportWidget";
import OnboardingTour from "./components/OnboardingTour";
import AffiliateClickTracker from "./components/AffiliateClickTracker";
import Button from "./components/ui/Button";
import DepartmentMaintenanceListener from "./components/DepartmentMaintenanceListener";
import NexoraAIButton from "./components/ai/NexoraAIButton";
import NexoraAIDrawer from "./components/ai/NexoraAIDrawer";
import { useAuth } from "./context/AuthContext";
import { useToast } from "./context/ToastContext";
import RequireBuyer from "./components/RequireBuyer";
import RequireSeller from "./components/RequireSeller";
import RequireAuth from "./components/RequireAuth";
import RequireDeliveryAgent from "./components/RequireDeliveryAgent";
import RequireAdmin from "./components/RequireAdmin";
import SellerLayout from "./components/SellerLayout";
import DeliveryLayout from "./components/DeliveryLayout";
import AdminLayout from "./components/AdminLayout";


const Home = lazy(() => import("./pages/Home"));
const DepartmentPage = lazy(() => import("./pages/DepartmentPage"));
const BrowseProducts = lazy(() => import("./pages/BrowseProducts"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const ServicesBrowse = lazy(() => import("./pages/ServicesBrowse"));
const ServiceCategoryPage = lazy(() => import("./pages/ServiceCategoryPage"));
const ServiceDetail = lazy(() => import("./pages/ServiceDetail"));
const StorePage = lazy(() => import("./pages/StorePage"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const Cart = lazy(() => import("./pages/Cart"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Orders = lazy(() => import("./pages/Orders"));
const OrderDetail = lazy(() => import("./pages/OrderDetail"));
const OrderTrackingPage = lazy(() => import("./pages/OrderTrackingPage"));
const Bookings = lazy(() => import("./pages/Bookings"));
const BookingDetail = lazy(() => import("./pages/BookingDetail"));
const Messages = lazy(() => import("./pages/Messages"));
const ConversationThread = lazy(() => import("./pages/ConversationThread"));
const Account = lazy(() => import("./pages/Account"));
const Saved = lazy(() => import("./pages/Saved"));
const Disputes = lazy(() => import("./pages/Disputes"));
const NewDispute = lazy(() => import("./pages/NewDispute"));
const DisputeDetail = lazy(() => import("./pages/DisputeDetail"));
const Returns = lazy(() => import("./pages/Returns"));
const NewReturn = lazy(() => import("./pages/NewReturn"));
const ReturnDetail = lazy(() => import("./pages/ReturnDetail"));
const KycStatus = lazy(() => import("./pages/KycStatus"));
const WalletPage = lazy(() => import("./pages/WalletPage"));
const Guides = lazy(() => import("./pages/Guides"));
const GuideDetail = lazy(() => import("./pages/GuideDetail"));
const Loyalty = lazy(() => import("./pages/Loyalty"));
const GroupBuys = lazy(() => import("./pages/GroupBuys"));
const GroupBuyDetail = lazy(() => import("./pages/GroupBuyDetail"));
const Affiliate = lazy(() => import("./pages/Affiliate"));
const LiveSelling = lazy(() => import("./pages/LiveSelling"));
const LegalPage = lazy(() => import("./pages/legal/LegalPage"));
const StatusPage = lazy(() => import("./pages/StatusPage"));

const SellerSetup = lazy(() => import("./pages/seller/SellerSetup"));
const SellerOverview = lazy(() => import("./pages/seller/SellerOverview"));
const SellerProducts = lazy(() => import("./pages/seller/SellerProducts"));
const SellerProductForm = lazy(() => import("./pages/seller/SellerProductForm"));
const SellerServices = lazy(() => import("./pages/seller/SellerServices"));
const SellerServiceForm = lazy(() => import("./pages/seller/SellerServiceForm"));
const SellerAvailability = lazy(() => import("./pages/seller/SellerAvailability"));
const SellerPricing = lazy(() => import("./pages/seller/SellerPricing"));
const SellerBookings = lazy(() => import("./pages/seller/SellerBookings"));
const SellerCollections = lazy(() => import("./pages/seller/SellerCollections"));
const SellerOrders = lazy(() => import("./pages/seller/SellerOrders"));
const SellerReviews = lazy(() => import("./pages/seller/SellerReviews"));
const SellerServiceReviews = lazy(() => import("./pages/seller/SellerServiceReviews"));
const SellerDeliveryTeam = lazy(() => import("./pages/seller/SellerDeliveryTeam"));
const SellerStore = lazy(() => import("./pages/seller/SellerStore"));
const SellerAnalytics = lazy(() => import("./pages/seller/SellerAnalytics"));
const SellerWallet = lazy(() => import("./pages/seller/SellerWallet"));
const SellerSubscription = lazy(() => import("./pages/seller/SellerSubscription"));
const SellerSponsorship = lazy(() => import("./pages/seller/SellerSponsorship"));
const SellerFeaturedStore = lazy(() => import("./pages/seller/SellerFeaturedStore"));
const SellerDepartmentSponsorship = lazy(() => import("./pages/seller/SellerDepartmentSponsorship"));
const SellerDisputes = lazy(() => import("./pages/seller/SellerDisputes"));
const SellerReturns = lazy(() => import("./pages/seller/SellerReturns"));
const SellerLoans = lazy(() => import("./pages/seller/SellerLoans"));
const SellerTaxInfo = lazy(() => import("./pages/seller/SellerTaxInfo"));
const SellerGroupBuys = lazy(() => import("./pages/seller/SellerGroupBuys"));
const SellerLiveSelling = lazy(() => import("./pages/seller/SellerLiveSelling"));

const DeliveryAvailable = lazy(() => import("./pages/delivery/DeliveryAvailable"));
const DeliveryMine = lazy(() => import("./pages/delivery/DeliveryMine"));
const DeliveryEarnings = lazy(() => import("./pages/delivery/DeliveryEarnings"));
const DeliveryRatings = lazy(() => import("./pages/delivery/DeliveryRatings"));

const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminDispatch = lazy(() => import("./pages/admin/AdminDispatch"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminDeletedAccounts = lazy(() => import("./pages/admin/AdminDeletedAccounts"));
const AdminSellers = lazy(() => import("./pages/admin/AdminSellers"));
const AdminProducts = lazy(() => import("./pages/admin/AdminProducts"));
const AdminCategories = lazy(() => import("./pages/admin/AdminCategories"));
const AdminMaintenance = lazy(() => import("./pages/admin/AdminMaintenance"));
const AdminStatusIncidents = lazy(() => import("./pages/admin/AdminStatusIncidents"));
const AdminServiceCategories = lazy(() => import("./pages/admin/AdminServiceCategories"));
const AdminServices = lazy(() => import("./pages/admin/AdminServices"));
const AdminStoreTypes = lazy(() => import("./pages/admin/AdminStoreTypes"));
const AdminOrders = lazy(() => import("./pages/admin/AdminOrders"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const AdminBillingControl = lazy(() => import("./pages/admin/AdminBillingControl"));
const AdminWithdrawals = lazy(() => import("./pages/admin/AdminWithdrawals"));
const AdminSponsorship = lazy(() => import("./pages/admin/AdminSponsorship"));
const AdminSubscriptions = lazy(() => import("./pages/admin/AdminSubscriptions"));
const AdminFeaturedStores = lazy(() => import("./pages/admin/AdminFeaturedStores"));
const AdminDepartmentSponsorship = lazy(() => import("./pages/admin/AdminDepartmentSponsorship"));
const AdminAccountVerifications = lazy(() => import("./pages/admin/AdminAccountVerifications"));
const AdminManageAdmins = lazy(() => import("./pages/admin/AdminManageAdmins"));
const AdminFraud = lazy(() => import("./pages/admin/AdminFraud"));
const AdminFraudDashboard = lazy(() => import("./pages/admin/AdminFraudDashboard"));
const AdminDisputes = lazy(() => import("./pages/admin/AdminDisputes"));
const AdminReturns = lazy(() => import("./pages/admin/AdminReturns"));
const AdminSupport = lazy(() => import("./pages/admin/AdminSupport"));
const AdminEfd = lazy(() => import("./pages/admin/AdminEfd"));
const AdminPickupPoints = lazy(() => import("./pages/admin/AdminPickupPoints"));
const AdminContent = lazy(() => import("./pages/admin/AdminContent"));
const AdminAuditLogs = lazy(() => import("./pages/admin/AdminAuditLogs"));

export default function App() {
    const [showSplash, setShowSplash] = useState(
        () => !sessionStorage.getItem("nexora_splash_shown")
    );
    const { suspension, clearSuspension, user, sessionExpired, clearSessionExpired, csrfExpired } = useAuth();
    const navigate = useNavigate();
    const toast = useToast();

    //  Session expiry. Fires for either an idle-timeout (see
    // AuthContext.jsx's isIdleExpired check on load) or a session that
    // died server-side mid-use (401 caught in api/client.js). Either way
    // the person gets an explicit reason instead of a silent bounce, then
    // lands on /login instead of wherever the dead session left them.
    useEffect(() => {
        if (!sessionExpired) return;
        toast.info("Your session expired - please sign in again.");
        clearSessionExpired();
        navigate("/login");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionExpired]);

    // Roles that get a fixed mobile bottom nav (Header.jsx for buyer,
    // SellerLayout.jsx for seller, DeliveryLayout.jsx for delivery_agent)
    // need their page content to clear it, or the bar covers whatever's
    // at the bottom of the page - matched to MobileBottomNav's own
    // min-h-[52px] tab height plus a little breathing room.
    const hasMobileBottomNav = ["buyer", "seller", "delivery_agent"].includes(user?.role);

    // Phase B1: Nexora AI is buyer-facing/advisory only - a guest
    // (user is null, not yet logged in) or a signed-in buyer gets it;
    // seller/delivery_agent/admin roles get their own AI entry points
    // in later phases (B2/B3), not this one.
    const showNexoraAI = !user || user.role === "buyer";

    // Phase 3: when a push notification is clicked and it focuses an
    // already-open tab (see sw.js#notificationclick), that only brings the
    // browser window forward - it doesn't change the SPA's route, since
    // this is a client-rendered app and the service worker has no access
    // to React Router. sw.js posts the intended path back to us instead.
    useEffect(() => {
        if (!("serviceWorker" in navigator)) return undefined;
        const handleMessage = (event) => {
            if (event.data?.type === "notification-click" && event.data.url) {
                navigate(event.data.url);
            }
        };
        navigator.serviceWorker.addEventListener("message", handleMessage);
        return () => navigator.serviceWorker.removeEventListener("message", handleMessage);
    }, [navigate]);

    if (showSplash) {
        return <SplashScreen onDone={() => setShowSplash(false)} />;
    }

    // CSRF cookie expired while the session cookie was still alive. The
    // only recovery is a page reload which causes the browser to re-issue
    // a fresh CSRF cookie alongside the still-valid session cookie. We
    // show a non-dismissible full-screen prompt rather than a toast,
    // because without the reload no further mutating requests will work.
    if (csrfExpired) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-paper p-6">
                <div className="max-w-sm w-full text-center glass-strong rounded-xl p-8 space-y-4">
                    <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-7 h-7 text-amber-600 dark:text-amber-400">
                            <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        </svg>
                    </div>
                    <h2 className="font-display text-xl">Session refresh needed</h2>
                    <p className="text-ash text-sm leading-relaxed">
                        Your security token has expired. Refresh the page to continue — your session is still active.
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        className="w-full bg-ink text-paper rounded-lg px-4 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                        Refresh page
                    </button>
                </div>
            </div>
        );
    }

    // Takes over the entire app, regardless of route - a suspension can be
    // discovered while sitting on any page, not just at login (see
    // AuthContext.jsx / api/client.js).
    if (suspension) {
        return <SuspendedScreen reason={suspension.reason} onBack={clearSuspension} />;
    }

    return (
        <div className="min-h-screen flex flex-col">
            <UpdateAvailableBanner />
            <NetworkStatusNotice />
            <InstallPrompt />
            <DepartmentMaintenanceListener />

            <Header />
            <SupportWidget />
            <OnboardingTour />
            <AffiliateClickTracker />

            <RouteProgressBar />

            <main className={`flex-1 ${hasMobileBottomNav ? "pb-16 md:pb-0" : ""}`}>
                <Suspense fallback={<PageLoader />}>
                    <PageTransition>
                        <Routes>
                        <Route path="/" element={<Home />} />
                        <Route path="/departments/:slug" element={<DepartmentPage />} />
                        <Route path="/products" element={<BrowseProducts />} />
                        <Route path="/products/:slug" element={<ProductDetail />} />
                        <Route path="/services" element={<ServicesBrowse />} />
                        <Route path="/services/category/:slug" element={<ServiceCategoryPage />} />
                        <Route path="/services/:slug" element={<ServiceDetail />} />
                        <Route path="/stores/:slug" element={<StorePage />} />
                        <Route path="/login" element={<Login />} />
                        <Route path="/register" element={<Register />} />
                        <Route path="/forgot-password" element={<ForgotPassword />} />

                        <Route path="/cart" element={<RequireBuyer><Cart /></RequireBuyer>} />
                        <Route path="/checkout" element={<RequireBuyer><Checkout /></RequireBuyer>} />
                        <Route path="/orders" element={<RequireBuyer><Orders /></RequireBuyer>} />
                        <Route path="/orders/:id" element={<RequireBuyer><OrderDetail /></RequireBuyer>} />
                        <Route path="/orders/:id/tracking" element={<RequireBuyer><OrderTrackingPage /></RequireBuyer>} />
                        <Route path="/bookings" element={<RequireBuyer><Bookings /></RequireBuyer>} />
                        {/* Shared: buyer or provider - booking.service.js#getBookingById enforces per-booking access */}
                        <Route path="/bookings/:id" element={<RequireAuth><BookingDetail /></RequireAuth>} />
                        <Route path="/legal/:slug" element={<LegalPage />} />
                        <Route path="/status" element={<StatusPage />} />
                        <Route path="/saved" element={<RequireBuyer><Saved /></RequireBuyer>} />
                        <Route path="/disputes" element={<RequireBuyer><Disputes /></RequireBuyer>} />
                        <Route path="/disputes/new" element={<RequireBuyer><NewDispute /></RequireBuyer>} />
                        {/* Shared: buyer, seller, or admin - dispute.service.js enforces per-dispute access */}
                        <Route path="/disputes/:id" element={<RequireAuth><DisputeDetail /></RequireAuth>} />

                        <Route path="/returns" element={<RequireBuyer><Returns /></RequireBuyer>} />
                        <Route path="/returns/new" element={<RequireBuyer><NewReturn /></RequireBuyer>} />
                        {/* Shared: buyer, seller, or admin - return.service.js enforces per-return access */}
                        <Route path="/returns/:id" element={<RequireAuth><ReturnDetail /></RequireAuth>} />

                        <Route path="/account/kyc" element={<RequireBuyer><KycStatus /></RequireBuyer>} />
                        <Route path="/account/wallet" element={<RequireBuyer><WalletPage /></RequireBuyer>} />
                        <Route path="/guides" element={<Guides />} />
                        <Route path="/guides/:slug" element={<GuideDetail />} />
                        <Route path="/loyalty" element={<RequireAuth><Loyalty /></RequireAuth>} />
                        <Route path="/group-buys" element={<GroupBuys />} />
                        <Route path="/group-buys/:id" element={<GroupBuyDetail />} />
                        <Route path="/affiliate" element={<RequireBuyer><Affiliate /></RequireBuyer>} />
                        <Route path="/live-selling" element={<LiveSelling />} />

                        <Route path="/messages" element={<RequireAuth><Messages /></RequireAuth>} />
                        <Route path="/messages/:id" element={<RequireAuth><ConversationThread /></RequireAuth>} />
                        <Route path="/account" element={<RequireAuth><Account /></RequireAuth>} />

                        <Route path="/seller" element={<RequireSeller><SellerLayout /></RequireSeller>}>
                            <Route path="setup" element={<SellerSetup />} />
                            <Route index element={<SellerOverview />} />
                            <Route path="products" element={<SellerProducts />} />
                            <Route path="products/new" element={<SellerProductForm />} />
                            <Route path="products/:id/edit" element={<SellerProductForm />} />
                            <Route path="services" element={<SellerServices />} />
                            <Route path="services/new" element={<SellerServiceForm />} />
                            <Route path="services/:id/edit" element={<SellerServiceForm />} />
                            <Route path="availability" element={<SellerAvailability />} />
                            <Route path="pricing" element={<SellerPricing />} />
                            <Route path="bookings" element={<SellerBookings />} />
                            <Route path="collections" element={<SellerCollections />} />
                            <Route path="orders" element={<SellerOrders />} />
                            <Route path="reviews" element={<SellerReviews />} />
                            <Route path="service-reviews" element={<SellerServiceReviews />} />
                            <Route path="delivery-team" element={<SellerDeliveryTeam />} />
                            <Route path="store" element={<SellerStore />} />
                            <Route path="analytics" element={<SellerAnalytics />} />
                            <Route path="wallet" element={<SellerWallet />} />
                            <Route path="sponsorship" element={<SellerSponsorship />} />
                            <Route path="featured-store" element={<SellerFeaturedStore />} />
                            <Route path="department-sponsorship" element={<SellerDepartmentSponsorship />} />
                            <Route path="subscription" element={<SellerSubscription />} />
                            <Route path="disputes" element={<SellerDisputes />} />
                            <Route path="returns" element={<SellerReturns />} />
                            <Route path="loans" element={<SellerLoans />} />
                            <Route path="tax-info" element={<SellerTaxInfo />} />
                            <Route path="group-buys" element={<SellerGroupBuys />} />
                            <Route path="live-selling" element={<SellerLiveSelling />} />
                        </Route>

                        <Route path="/delivery" element={<RequireDeliveryAgent><DeliveryLayout /></RequireDeliveryAgent>}>
                            <Route index element={<DeliveryAvailable />} />
                            <Route path="mine" element={<DeliveryMine />} />
                            <Route path="earnings" element={<DeliveryEarnings />} />
                            <Route path="ratings" element={<DeliveryRatings />} />
                        </Route>

                        <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
                            <Route index element={<AdminDashboard />} />
                            <Route path="dispatch" element={<AdminDispatch />} />
                            <Route path="users" element={<AdminUsers />} />
                            <Route path="deleted-accounts" element={<AdminDeletedAccounts />} />
                            <Route path="sellers" element={<AdminSellers />} />
                            <Route path="products" element={<AdminProducts />} />
                            <Route path="categories" element={<AdminCategories />} />
                            <Route path="maintenance" element={<AdminMaintenance />} />
                            <Route path="status-incidents" element={<AdminStatusIncidents />} />
                            <Route path="service-categories" element={<AdminServiceCategories />} />
                            <Route path="services" element={<AdminServices />} />
                            <Route path="store-types" element={<AdminStoreTypes />} />
                            <Route path="orders" element={<AdminOrders />} />
                            <Route path="settings" element={<AdminSettings />} />
                            <Route path="billing-control" element={<AdminBillingControl />} />
                            <Route path="withdrawals" element={<AdminWithdrawals />} />
                            <Route path="sponsorship" element={<AdminSponsorship />} />
                            <Route path="subscriptions" element={<AdminSubscriptions />} />
                            <Route path="featured-stores" element={<AdminFeaturedStores />} />
                            <Route path="department-sponsorship" element={<AdminDepartmentSponsorship />} />
                            <Route path="account-verifications" element={<AdminAccountVerifications />} />
                            <Route path="admins" element={<AdminManageAdmins />} />
                            <Route path="fraud" element={<AdminFraud />} />
                            <Route path="fraud-dashboard" element={<AdminFraudDashboard />} />
                            <Route path="disputes" element={<AdminDisputes />} />
                            <Route path="returns" element={<AdminReturns />} />
                            <Route path="support" element={<AdminSupport />} />
                            <Route path="efd" element={<AdminEfd />} />
                            <Route path="pickup-points" element={<AdminPickupPoints />} />
                            <Route path="content" element={<AdminContent />} />
                            <Route path="audit-logs" element={<AdminAuditLogs />} />
                        </Route>

                        <Route path="*" element={
                            <div className="max-w-lg mx-auto py-24 px-6 text-center">
                                <p className="font-display text-2xl mb-2">Page not found</p>
                                <p className="text-ash text-sm mb-6">The page you're looking for doesn't exist or may have moved.</p>
                                <Button as={Link} to="/">
                                    Go to Home
                                </Button>
                            </div>
                        } />
                        </Routes>
                    </PageTransition>
                </Suspense>
            </main>

            <Footer />

            {showNexoraAI && (
                <>
                    <NexoraAIButton />
                    <NexoraAIDrawer />
                </>
            )}
        </div>
    );
}
