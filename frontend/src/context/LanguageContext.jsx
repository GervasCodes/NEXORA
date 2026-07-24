import { createContext, useContext, useState, useCallback, useMemo } from "react";

const LanguageContext = createContext(null);

const STORAGE_KEY = "nexora_language";
export const LANGUAGES = [
    { code: "en", label: "English" },
    { code: "sw", label: "Kiswahili" }
];

// Keys are grouped by feature area (nav, common, auth, cart, checkout,
// orders, notifications, delivery, footer...). Every key added to "en"
// should also be added to "sw" - if a key is ever missing in "sw", `t()`
// below falls back to the English text so nothing renders blank.
export const DICTIONARY = {
    en: {
        "nav.dashboard": "Dashboard",
        "nav.deliveries": "Deliveries",
        "nav.admin": "Admin",
        "nav.messages": "Messages",
        "nav.orders": "Orders",
        "nav.disputes": "Disputes",
        "nav.saved": "Saved",
        "nav.cart": "Cart",
        "nav.account": "Account",
        "nav.browse": "Browse all",
        "nav.signOut": "Sign out",
        "nav.signIn": "Sign in",
        "nav.join": "Join",
        "nav.searchPlaceholder": "Search products, brands...",
        "nav.search": "Search",
        "nav.go": "Go",

        "search.recent": "Recent searches",
        "search.clearRecent": "Clear",
        "search.resultsFor": "Results for \"{term}\"",
        "search.resultCountOne": "1 result",
        "search.resultCountMany": "{count} results",
        "search.clearSearch": "Clear search",
        "search.noResultsTitle": "No results for \"{term}\"",
        "search.noResultsHint": "Try a different search term, check your spelling, or browse a department instead.",
        "search.browseDepartments": "Browse departments",
        "search.browseAll": "Browse all products",

        "filters.minPrice": "Min price",
        "filters.maxPrice": "Max price",
        "filters.noLimit": "No limit",
        "filters.store": "Store",
        "filters.allStores": "All stores",
        "filters.location": "Location",
        "filters.allLocations": "All locations",
        "filters.rating": "Rating",
        "filters.anyRating": "Any rating",
        "filters.andUp": "& up",
        "filters.sortBy": "Sort by",
        "filters.sortNewest": "Newest",
        "filters.sortPriceLow": "Price: low to high",
        "filters.sortPriceHigh": "Price: high to low",
        "filters.sortRating": "Highest rated",
        "filters.clear": "Clear filters",

        "products.viewGrid": "Grid view",
        "products.viewList": "List view",

        "account.title": "Account",
        "account.signedInAs": "Signed in as",
        "account.profile": "Profile",
        "account.settings": "Settings",
        "account.settingsHint": "Language, theme, and currency apply across NEXORA instantly.",
        "account.language": "Language",
        "account.theme": "Theme",
        "account.currency": "Currency",
        "account.changePassword": "Change password",
        "account.changePasswordHint": "For your security, we'll email you a verification code before you can set a new password.",
        "account.changePasswordButton": "Change Password",
        "account.deleteAccount": "Delete account",

        "common.save": "Save",
        "common.saving": "Saving…",
        "common.cancel": "Cancel",
        "common.continue": "Continue",
        "common.loading": "Loading…",
        "common.remove": "Remove",
        "common.each": "each",
        "common.total": "Total",
        "common.browseMarketplace": "Browse the marketplace",
        "common.startShopping": "Start shopping",
        "common.somethingWentWrong": "Something went wrong. Please try again.",

        "auth.signInTitle": "Sign in",
        "auth.emailLabel": "Email",
        "auth.passwordLabel": "Password",
        "auth.signInButton": "Sign in",
        "auth.signingIn": "Signing in…",
        "auth.noAccount": "Don't have an account?",
        "auth.registerLink": "Create one",
        "auth.forgotPasswordLink": "Forgot your password?",
        "auth.registerTitle": "Create your account",
        "auth.haveAccount": "Already have an account?",
        "auth.signInLink": "Sign in",
        "auth.registerSubtitle": "Create your account to start buying, selling, or delivering.",
        "auth.firstNameLabel": "First name",
        "auth.lastNameLabel": "Last name",
        "auth.phoneLabel": "Phone",
        "auth.phoneHint": "Choose your country, then enter your number without the leading 0.",
        "auth.countryCodeLabel": "Country code",
        "auth.passwordHint": "At least 8 characters.",
        "auth.roleLabel": "I want to",
        "auth.roleBuyer": "Buy products",
        "auth.roleSeller": "Sell products",
        "auth.roleDeliveryAgent": "Deliver orders",
        "auth.roleVerificationHint": "You'll be asked to verify your identity on the next step before your account is created.",
        "auth.termsPrefix": "I agree to NEXORA's",
        "auth.termsOfService": "Terms of Service",
        "auth.and": "and",
        "auth.privacyPolicy": "Privacy Policy",
        "auth.createAccountButton": "Create account",
        "auth.creatingAccount": "Creating account…",
        "auth.continueToVerification": "Continue to verification",
        "auth.termsRequiredError": "Please accept the Terms of Service and Privacy Policy to continue.",
        "auth.invalidPhoneError": "Please enter a valid phone number.",

        "cart.title": "Your cart",
        "cart.empty": "Your cart is empty",
        "cart.loading": "Loading cart…",
        "cart.checkoutButton": "Proceed to checkout",

        "checkout.title": "Checkout",
        "checkout.placeOrderButton": "Place order",
        "checkout.placingOrder": "Placing order…",

        "orders.title": "Your orders",
        "orders.empty": "No orders yet",
        "orders.loading": "Loading orders…",
        "orders.vendorsBadge": "{count} vendors",

        "orderTimeline.placed": "Placed",
        "orderTimeline.processing": "Processing",
        "orderTimeline.shipped": "Shipped",
        "orderTimeline.delivered": "Delivered",
        "orderTimeline.cancelled": "This order was cancelled.",

        "delivery.tracking.title": "Delivery tracking",
        "delivery.tracking.agentEnRoute": "Your delivery agent is on the way",
        "delivery.tracking.awaitingAgent": "Waiting for a delivery agent",
        "delivery.tracking.eta": "Estimated arrival",
        "delivery.tracking.viewLive": "View live tracking",
        "delivery.tracking.live": "Live",
        "delivery.tracking.connecting": "Connecting…",
        "delivery.tracking.reconnecting": "Reconnecting…",
        "delivery.tracking.offline": "Tracking unavailable — check your connection",
        "delivery.tracking.distanceRemaining": "Distance remaining",
        "delivery.tracking.calculating": "Calculating…",
        "delivery.tracking.back": "Back to order",
        "delivery.tracking.unavailable": "Tracking unavailable",        "delivery.tracking.pickup": "Pickup",
        "delivery.tracking.destination": "Destination",
        "delivery.tracking.courierDetails": "Courier details",
        "delivery.tracking.messageCourier": "Message",
        "delivery.tracking.callCourier": "Call",
        "delivery.tracking.timeline.title": "Delivery timeline",
        "delivery.tracking.timeline.assigned": "Agent assigned",
        "delivery.tracking.timeline.picked_up": "Picked up",
        "delivery.tracking.timeline.in_transit": "On the way",
        "delivery.tracking.timeline.delivered": "Delivered",
        "delivery.tracking.timeline.failed": "Delivery failed",

        "notifications.title": "Notifications",
        "notifications.empty": "You're all caught up",
        "notifications.markAllRead": "Mark all as read",

        "footer.tagline": "A regional marketplace connecting buyers, sellers & delivery partners."
    },
    sw: {
        "nav.dashboard": "Dashibodi",
        "nav.deliveries": "Usafirishaji",
        "nav.admin": "Msimamizi",
        "nav.messages": "Ujumbe",
        "nav.orders": "Maagizo",
        "nav.disputes": "Migogoro",
        "nav.saved": "Iliyohifadhiwa",
        "nav.cart": "Kikapu",
        "nav.account": "Akaunti",
        "nav.browse": "Vinjari vyote",
        "nav.signOut": "Toka",
        "nav.signIn": "Ingia",
        "nav.join": "Jiunge",
        "nav.searchPlaceholder": "Tafuta bidhaa, chapa...",
        "nav.search": "Tafuta",
        "nav.go": "Nenda",

        "search.recent": "Utafutaji wa hivi karibuni",
        "search.clearRecent": "Futa",
        "search.resultsFor": "Matokeo ya \"{term}\"",
        "search.resultCountOne": "Matokeo 1",
        "search.resultCountMany": "Matokeo {count}",
        "search.clearSearch": "Futa utafutaji",
        "search.noResultsTitle": "Hakuna matokeo ya \"{term}\"",
        "search.noResultsHint": "Jaribu neno tofauti la utafutaji, angalia tahajia, au vinjari idara badala yake.",
        "search.browseDepartments": "Vinjari idara",
        "search.browseAll": "Vinjari bidhaa zote",

        "filters.minPrice": "Bei ya chini",
        "filters.maxPrice": "Bei ya juu",
        "filters.noLimit": "Hakuna kikomo",
        "filters.store": "Duka",
        "filters.allStores": "Maduka yote",
        "filters.location": "Mahali",
        "filters.allLocations": "Maeneo yote",
        "filters.rating": "Ukadiriaji",
        "filters.anyRating": "Ukadiriaji wowote",
        "filters.andUp": "na zaidi",
        "filters.sortBy": "Panga kwa",
        "filters.sortNewest": "Mpya zaidi",
        "filters.sortPriceLow": "Bei: chini kwenda juu",
        "filters.sortPriceHigh": "Bei: juu kwenda chini",
        "filters.sortRating": "Ukadiriaji wa juu zaidi",
        "filters.clear": "Futa vichujio",

        "products.viewGrid": "Mwonekano wa gridi",
        "products.viewList": "Mwonekano wa orodha",

        "account.title": "Akaunti",
        "account.signedInAs": "Umeingia kama",
        "account.profile": "Wasifu",
        "account.settings": "Mipangilio",
        "account.settingsHint": "Lugha, mandhari, na sarafu vinatumika kote NEXORA papo hapo.",
        "account.language": "Lugha",
        "account.theme": "Mandhari",
        "account.currency": "Sarafu",
        "account.changePassword": "Badilisha nenosiri",
        "account.changePasswordHint": "Kwa usalama wako, tutakutumia msimbo wa uthibitisho kwa barua pepe kabla ya kuweka nenosiri jipya.",
        "account.changePasswordButton": "Badilisha Nenosiri",
        "account.deleteAccount": "Futa akaunti",

        "common.save": "Hifadhi",
        "common.saving": "Inahifadhi…",
        "common.cancel": "Ghairi",
        "common.continue": "Endelea",
        "common.loading": "Inapakia…",
        "common.remove": "Ondoa",
        "common.each": "kila moja",
        "common.total": "Jumla",
        "common.browseMarketplace": "Vinjari soko",
        "common.startShopping": "Anza kununua",
        "common.somethingWentWrong": "Hitilafu imetokea. Tafadhali jaribu tena.",

        "auth.signInTitle": "Ingia",
        "auth.emailLabel": "Barua pepe",
        "auth.passwordLabel": "Nenosiri",
        "auth.signInButton": "Ingia",
        "auth.signingIn": "Inaingia…",
        "auth.noAccount": "Huna akaunti?",
        "auth.registerLink": "Unda moja",
        "auth.forgotPasswordLink": "Umesahau nenosiri?",
        "auth.registerTitle": "Unda akaunti yako",
        "auth.haveAccount": "Tayari una akaunti?",
        "auth.signInLink": "Ingia",
        "auth.registerSubtitle": "Unda akaunti yako ili kuanza kununua, kuuza, au kusafirisha.",
        "auth.firstNameLabel": "Jina la kwanza",
        "auth.lastNameLabel": "Jina la mwisho",
        "auth.phoneLabel": "Simu",
        "auth.phoneHint": "Chagua nchi yako, kisha andika namba yako bila sifuri mwanzoni.",
        "auth.countryCodeLabel": "Msimbo wa nchi",
        "auth.passwordHint": "Angalau herufi 8.",
        "auth.roleLabel": "Nataka kufanya nini",
        "auth.roleBuyer": "Nunua bidhaa",
        "auth.roleSeller": "Uza bidhaa",
        "auth.roleDeliveryAgent": "Safirisha maagizo",
        "auth.roleVerificationHint": "Utaombwa kuthibitisha utambulisho wako katika hatua inayofuata kabla akaunti yako haijaundwa.",
        "auth.termsPrefix": "Nakubali",
        "auth.termsOfService": "Masharti ya Huduma",
        "auth.and": "na",
        "auth.privacyPolicy": "Sera ya Faragha",
        "auth.createAccountButton": "Unda akaunti",
        "auth.creatingAccount": "Inaunda akaunti…",
        "auth.continueToVerification": "Endelea na uthibitisho",
        "auth.termsRequiredError": "Tafadhali kubali Masharti ya Huduma na Sera ya Faragha ili kuendelea.",
        "auth.invalidPhoneError": "Tafadhali ingiza namba sahihi ya simu.",

        "cart.title": "Kikapu chako",
        "cart.empty": "Kikapu chako kiko tupu",
        "cart.loading": "Inapakia kikapu…",
        "cart.checkoutButton": "Endelea kulipia",

        "checkout.title": "Kulipia",
        "checkout.placeOrderButton": "Weka agizo",
        "checkout.placingOrder": "Inaweka agizo…",

        "orders.title": "Maagizo yako",
        "orders.empty": "Bado hakuna maagizo",
        "orders.loading": "Inapakia maagizo…",
        "orders.vendorsBadge": "wachuuzi {count}",

        "orderTimeline.placed": "Limewekwa",
        "orderTimeline.processing": "Linachakatwa",
        "orderTimeline.shipped": "Limesafirishwa",
        "orderTimeline.delivered": "Limefika",
        "orderTimeline.cancelled": "Agizo hili limeghairiwa.",

        "delivery.tracking.title": "Ufuatiliaji wa usafirishaji",
        "delivery.tracking.agentEnRoute": "Wakala wako wa usafirishaji yuko njiani",
        "delivery.tracking.awaitingAgent": "Inasubiri wakala wa usafirishaji",
        "delivery.tracking.eta": "Muda unaokadiriwa wa kuwasili",
        "delivery.tracking.viewLive": "Tazama ufuatiliaji wa moja kwa moja",
        "delivery.tracking.live": "Moja kwa moja",
        "delivery.tracking.connecting": "Inaunganisha…",
        "delivery.tracking.reconnecting": "Inaunganisha tena…",
        "delivery.tracking.offline": "Ufuatiliaji haupatikani — angalia muunganisho wako",
        "delivery.tracking.distanceRemaining": "Umbali uliobaki",
        "delivery.tracking.calculating": "Inakokotoa…",
        "delivery.tracking.back": "Rudi kwenye agizo",
        "delivery.tracking.unavailable": "Ufuatiliaji haupatikani kwa sasa",
        "delivery.tracking.pickup": "Mahali pa kuchukua",
        "delivery.tracking.destination": "Anwani ya kufikisha",
        "delivery.tracking.courierDetails": "Taarifa za wakala",
        "delivery.tracking.messageCourier": "Tuma ujumbe",
        "delivery.tracking.callCourier": "Piga simu",
        "delivery.tracking.timeline.title": "Ratiba ya usafirishaji",
        "delivery.tracking.timeline.assigned": "Wakala amepangwa",
        "delivery.tracking.timeline.picked_up": "Amechukua agizo",
        "delivery.tracking.timeline.in_transit": "Yuko njiani",
        "delivery.tracking.timeline.delivered": "Limefika",
        "delivery.tracking.timeline.failed": "Usafirishaji umeshindwa",

        "notifications.title": "Arifa",
        "notifications.empty": "Umepata arifa zote",
        "notifications.markAllRead": "Weka zote kama zimesomwa",

        "footer.tagline": "Soko la kikanda linalounganisha wanunuzi, wauzaji na washirika wa usafirishaji."
    }
};

const loadStoredLanguage = () => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return DICTIONARY[stored] ? stored : "en";
};

export function LanguageProvider({ children }) {
    const [language, setLanguageState] = useState(loadStoredLanguage);

    const setLanguage = useCallback((next) => {
        if (!DICTIONARY[next]) return;
        localStorage.setItem(STORAGE_KEY, next);
        setLanguageState(next);
    }, []);

    const syncFromProfile = useCallback((profileLanguage) => {
        if (!DICTIONARY[profileLanguage]) return;
        if (localStorage.getItem(STORAGE_KEY)) return;
        setLanguage(profileLanguage);
    }, [setLanguage]);

    // Falls back to the key's English text (or the key itself) so
    // untranslated strings never render blank. Accepts an optional
    // params object for simple {placeholder} interpolation, e.g.
    // t("orders.vendorsBadge", { count: 3 }).
    const t = useCallback((key, params) => {
        const template = DICTIONARY[language]?.[key] || DICTIONARY.en[key] || key;
        if (!params) return template;
        return template.replace(/\{(\w+)\}/g, (match, k) => (
            params[k] !== undefined && params[k] !== null ? String(params[k]) : ""
        ));
    }, [language]);

    const value = useMemo(
        () => ({ language, setLanguage, syncFromProfile, t }),
        [language, setLanguage, syncFromProfile, t]
    );

    return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);
