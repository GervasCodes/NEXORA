# UI/UX Design Brief and Specification

| Field | Value |
|---|---|
| Audit date | 2026-10-29 |
| Document version | 1.0 |
| Basis | `frontend/tailwind.config.js`, `frontend/src/index.css`, `frontend/src/components/**`, `App.jsx`, tests. **No visual review of rendered screens was performed** (no browser in the sandbox), so colour contrast, layout quality and responsive behaviour are **Not verified** visually. |
| Structure | Part A documents the **existing** design (Verified from code). Part B lists **proposed** improvements, clearly separated. |

# Part A - Existing design

## A1. Visual language

| Aspect | Existing implementation | Source |
|---|---|---|
| Brand | Near-black "abyss" backgrounds matching the logo, with a blue gradient (`#9FC1F2` to `#6EA8FE` to `#1D4ED8`) | `tailwind.config.js` |
| Palette (RGB tokens, theme-aware) | abyss `7 9 18`; azure `110 168 254`; azure-light `159 193 242`; azure-deep `29 78 216`; ink `17 24 39`; paper `247 248 251`; **mango `245 166 35`** (primary purchase CTA, deliberately warm for contrast against blue); mango-dark `214 141 15`; teal `15 122 108`; coral `228 87 46`; ash `95 102 116` (secondary text); line `227 230 236`; frost (fixed light colour for fixed-dark surfaces) | `index.css` lines 7-31 |
| Dark mode | Class strategy. Dark tokens: paper `10 12 20`, ink `231 233 238`, line `34 39 54`, ash `148 155 168`. User setting `users.theme` is light, dark or system | `index.css` 36-42; `users.theme` |
| Typography | Display: Fraunces Variable (serif); body: Inter; monospace: system stack (IBM Plex Mono removed to save a download) | `tailwind.config.js` |
| Elevation | Mango-tinted 3D shadows for primary buttons (rest/hover/active), neutral ink-tinted for secondary and icon buttons | `boxShadow` tokens |
| Motion | `fadeIn`, `slideUp`, page transitions, route progress bar; `prefers-reduced-motion` media query present | `index.css:165` |
| Layering | Named z-index scale: sticky 40, nav 50, float 60, banner 1040, banner-top 1060, drawer 1200, modal 1250, feed 1300 | `index.css` 247-254 |
| Safe areas | `--bottom-inset: env(safe-area-inset-bottom)` for mobile bottom UI | `index.css:263` |
| Breakpoints | Tailwind defaults (no `screens` override) | `tailwind.config.js` |
| PWA | `manifest.json`: standalone display, theme colour `#070912`, maskable icons, shortcuts "Shop products" and "Book services"; service worker with network-first shell, offline page, push | `public/manifest.json`, `docs/MOBILE_STRATEGY.md` |

## A2. Layout and navigation

- Single-page app with React Router 7, lazy-loaded pages inside `Suspense` with `PageLoader`, `PageTransition` and `RouteProgressBar`.
- Chrome: `Header` (not on admin or chat-thread routes), role-specific layouts (`SellerLayout`, `BusinessToolsLayout`, `DeliveryLayout`, `AdminLayout`), `Footer` (not on admin, thread, checkout, auth routes), `MobileBottomNav` was present in git history but is **absent** from the delivered tree.
- Floating actions: NEXORA AI button and drawer, support widget. Seller "Promote" hub uses tabs; old URLs redirect into tabs.
- Skip-to-content link at the top of every page (`a11y.skipToContent`); `main` has `id="main-content"` and `tabIndex=-1`.

## A3. Component inventory (Verified; 158 components)

| Group | Examples |
|---|---|
| Primitives (`components/ui`, 10 exports) | Button, Input, Avatar, Breadcrumbs, DataTable, ListFilters, StatusBadge, QuantityStepper, CheckoutSteps, SideDrawer, CornerBadge, PasswordStrengthMeter, ImageOverlayCaption |
| State components | LoadingState, EmptyState, ErrorState, PageState, ErrorFallback, MaintenanceScreen, NetworkStatusNotice |
| Commerce | ProductCard, ProductGrid, ProductRow, ProductFilters, ProductQA, RatingBreakdown, RecommendedProducts, RecentlyViewedRail, FeaturedStoreCard, DepartmentCard, PaymentTrustBar, PaymentStatusBanner |
| Booking and delivery | AvailabilityCalendar, BookingProgressTimeline, DeliveryTrackingMap (Leaflet), DeliveryStatusTimeline, OrderTimeline, IncomingOfferModal, CourierDetailsCard, LocationPicker |
| Admin | AdminLayout, AdminDispatchMap, AdminCoverageHeatmap, AdminNotificationBell, BarChart, LineChart, PeriodComparisonCard |
| Utility and compliance | CookieConsentBanner, InstallPrompt, OnboardingTour, ConfirmDialog, ActionDialog, PhoneInput, PrivateDocumentLink, FiscalReceiptBadge, LanguageToggle, GoogleSignInButton |
| Guards | RequireAuth, RequireBuyer, RequireSeller, RequireDeliveryAgent, RequireAdmin |

## A4. States (as designed in code)

| State | Mechanism |
|---|---|
| Loading | `PageLoader`, `LoadingState`, `RouteProgressBar`; skeleton usage not audited per page |
| Empty | `EmptyState`; `ComingSoon` placeholder component exists (a "ComingSoon" screen is a signal of unfinished UI; usage not audited) |
| Error | `ErrorState`, route-level `ErrorFallback`, Sentry capture; API error messages are localised |
| Validation | Server returns `success:false` with messages; forms show them; `PasswordStrengthMeter` on registration (server only enforces length 8) |
| Success | Toast/inline messages and redirects (e.g. registration redirects to `/login`) |
| Offline/maintenance | Network notice, offline page, `MaintenanceScreen` for module maintenance |

## A5. Internationalisation

English and Swahili with full key parity (2,522 `en` keys; `sw` has the same plus one extra, `delivery.tracking.pickup`). `npm run lint:i18n` scans JSX for untranslated literals. Server messages and emails are localised the same way. Language comes from `?lang=`, `Accept-Language`, or the saved user preference.

## A6. Accessibility (existing)

| Item | Status |
|---|---|
| Skip link, landmark `main`, focus target | Verified in code |
| `eslint-plugin-jsx-a11y` recommended rules | Configured (`.eslintrc.json`); frontend lint currently reports 8 errors and 16 warnings (not categorised by rule) |
| Automated axe checks (`jest-axe`) on key entry points | Present; **1 test fails** (HomeCarousel cannot find a "Next slide" button), so the carousel's accessible control is either missing or renamed |
| Reduced motion | Media query present |
| Manual screen-reader, keyboard-only and contrast testing | **Not performed / no evidence** |

# Part B - Proposed improvements (not implemented)

| ID | Proposal | Reason / evidence |
|---|---|---|
| UX-P01 | Fix or update the HomeCarousel accessibility test and confirm the carousel has a labelled next/previous control. | Failing axe test |
| UX-P02 | Resolve the 8 frontend lint errors and the `react-hooks/exhaustive-deps` warnings, which can hide stale-data bugs. | Lint run 2026-10-29 |
| UX-P03 | Define and document a supported-browser matrix (including low-end Android and Opera Mini/UC browsers if the target market uses them) and add it to CI. | NFR-007 undefined |
| UX-P04 | Add a role-based landing (seller to `/seller`, agent to `/delivery`, admin to `/admin`) after login. | Login always goes to `returnTo` or `/` |
| UX-P05 | Align client validation with the server rule, or raise the server minimum/complexity and show it in `PasswordStrengthMeter`. | Server accepts any 8+ character password |
| UX-P06 | Remove or consolidate duplicate and unreferenced pages (4 dead pages, duplicate `SellerProductWizard`). | `design/screen-inventory.md` |
| UX-P07 | Run a manual accessibility and contrast audit of both themes, and usability tests with real sellers and agents. | No evidence of either |
| UX-P08 | Audit "ComingSoon" usage and remove placeholder screens from production navigation. | Component exists |
