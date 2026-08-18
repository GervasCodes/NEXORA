import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PLACEHOLDER_IMAGE } from "./data.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Matches api/client.js's default baseURL - see the note in
// playwright.config.js about running against a production build (no
// .env override present in this repo, so this is genuinely what ships).
const API_BASE = "http://localhost:5000/api/v1";

const json = (body) => ({ contentType: "application/json", body: JSON.stringify(body) });

/**
 * Wires up the minimum set of API route mocks every page under test
 * needs regardless of what it's specifically testing - the local
 * placeholder image (so no test depends on external network access for
 * photos) and an unauthenticated GET /auth/me by default (most pages
 * work fine logged-out; authenticatedContext() below overrides this for
 * the ones that don't).
 */
async function mockCommonRoutes(page) {
    const svg = fs.readFileSync(path.join(__dirname, "placeholder.svg"));
    await page.route(`**${PLACEHOLDER_IMAGE}`, (route) =>
        route.fulfill({ contentType: "image/svg+xml", body: svg })
    );
    await page.route(`${API_BASE}/auth/me`, (route) =>
        route.fulfill({ status: 401, ...json({ success: false, message: "Unauthorized" }) })
    );
}

async function mockProductsList(page, products) {
    await page.route(`${API_BASE}/products*`, (route) =>
        route.fulfill(json({ success: true, data: { data: products, total: products.length, page: 1, pages: 1 } }))
    );
}

async function mockDepartments(page, departments) {
    await page.route(`${API_BASE}/categories/departments`, (route) =>
        route.fulfill(json({ success: true, data: departments }))
    );
    await page.route(`${API_BASE}/service-categories/browse`, (route) =>
        route.fulfill(json({ success: true, data: [] }))
    );
}

async function mockProductDetail(page, product) {
    await page.route(`${API_BASE}/products/${product.id}`, (route) =>
        route.fulfill(json({ success: true, data: product }))
    );
    await page.route(`${API_BASE}/products/${product.id}/reviews*`, (route) =>
        route.fulfill(json({ success: true, data: { data: [], total: 0 } }))
    );
    await page.route(`${API_BASE}/products?*store_slug*`, (route) =>
        route.fulfill(json({ success: true, data: { data: [], total: 0 } }))
    );
}

/**
 * Mocks a signed-in buyer session - overrides GET /auth/me (set to
 * unauthenticated by mockCommonRoutes above) so AuthContext's
 * checkSession effect (see Phase 4's session-cookie migration) resolves
 * to a real user instead of clearing straight back to logged-out.
 */
async function authenticatedContext(page, user) {
    await page.route(`${API_BASE}/auth/me`, (route) =>
        route.fulfill(json({ success: true, data: { user } }))
    );
    // AuthContext's optimistic first paint reads this before checkSession
    // resolves - setting it directly avoids a flash of the logged-out
    // header on every snapshot.
    await page.addInitScript((u) => {
        window.localStorage.setItem("nexora_user", JSON.stringify(u));
    }, user);
}

async function mockCart(page, items) {
    await page.route(`${API_BASE}/cart`, (route) => {
        if (route.request().method() === "GET") {
            return route.fulfill(json({ success: true, data: items }));
        }
        return route.fulfill(json({ success: true, data: items }));
    });
}

export {
    mockCommonRoutes,
    mockProductsList,
    mockDepartments,
    mockProductDetail,
    authenticatedContext,
    mockCart
};
