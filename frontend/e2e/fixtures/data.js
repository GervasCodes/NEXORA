// Phase 4 (Testing & Session Hardening): fixture data for the visual
// snapshot tests. Deliberately hand-written and stable rather than
// pulled from a live backend/DB - a visual regression suite needs
// deterministic input to be useful at all; if the underlying seed data
// could change between runs, a snapshot diff could no longer tell you
// "the UI changed" apart from "the data changed", which defeats the
// point. Every field a rendered page actually reads is included; see
// the component prop-shape comments below for where each shape came
// from.

// Product photos point at a single local placeholder (see
// e2e/fixtures/placeholder.svg) rather than an external image host -
// pulling real images over the network on every test run would make
// these snapshots depend on network availability and on that host's
// content never changing, both of which defeat the "deterministic"
// goal above. The Playwright specs route-intercept anything matching
// this path and serve the local file instead of hitting the network at
// all.
const PLACEHOLDER_IMAGE = "/e2e-fixtures/placeholder.svg";

// Matches what ProductCard.jsx / ProductGrid.jsx read from a /products
// list item.
const product = (overrides = {}) => ({
    id: 101,
    name: "Handwoven Kikapu Basket",
    price: "45000.00",
    discount_price: null,
    stock: 12,
    image_url: PLACEHOLDER_IMAGE,
    images: [{ image_url: PLACEHOLDER_IMAGE }],
    is_verified: 1,
    store_name: "Zawadi Crafts",
    store_slug: "zawadi-crafts",
    region: "Dar es Salaam",
    description: "A handwoven kikapu basket, made by artisans in Zanzibar from natural sisal fiber. Durable, spacious, and finished with a leather trim.",
    category_name: "Home & Living",
    rating_average: 4.6,
    rating_count: 38,
    ...overrides
});

const PRODUCTS = [
    product({ id: 101, name: "Handwoven Kikapu Basket", price: "45000.00" }),
    product({ id: 102, name: "Maasai Beaded Bracelet Set", price: "18000.00", discount_price: "14500.00" }),
    product({ id: 103, name: "Kitenge Print Tote Bag", price: "32000.00", is_verified: 0 }),
    product({ id: 104, name: "Ebony Wood Carved Bowl", price: "67000.00" })
];

const DEPARTMENTS = [
    { id: 1, name: "Home & Living", slug: "home-living", cover_image_url: PLACEHOLDER_IMAGE, productCount: 214 },
    { id: 2, name: "Fashion & Accessories", slug: "fashion", cover_image_url: PLACEHOLDER_IMAGE, productCount: 356 },
    { id: 3, name: "Art & Crafts", slug: "art-crafts", cover_image_url: PLACEHOLDER_IMAGE, productCount: 129 }
];

// Matches what CartContext.jsx / Checkout.jsx read from GET /cart.
const CART_ITEMS = [
    {
        id: 1,
        product_id: 101,
        name: "Handwoven Kikapu Basket",
        image_url: PLACEHOLDER_IMAGE,
        price: "45000.00",
        discount_price: null,
        quantity: 2,
        stock: 12,
        store_name: "Zawadi Crafts"
    },
    {
        id: 2,
        product_id: 103,
        name: "Kitenge Print Tote Bag",
        image_url: PLACEHOLDER_IMAGE,
        price: "32000.00",
        discount_price: null,
        quantity: 1,
        stock: 40,
        store_name: "Zawadi Crafts"
    }
];

// Matches what AuthContext.jsx reads from GET /auth/me and
// verifyLoginOtp - see backend/src/modules/auth/auth.controller.js
// (Phase 4's session-cookie migration).
const BUYER_USER = {
    id: 55,
    first_name: "Amina",
    last_name: "Juma",
    email: "amina@example.com",
    role: "buyer",
    language: "en"
};

export { product, PRODUCTS, DEPARTMENTS, CART_ITEMS, BUYER_USER, PLACEHOLDER_IMAGE };
