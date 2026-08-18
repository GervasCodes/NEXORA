import { test, expect } from "@playwright/test";
import { mockCommonRoutes, authenticatedContext, mockCart } from "./fixtures/mockRoutes.js";
import { CART_ITEMS, BUYER_USER } from "./fixtures/data.js";

test.describe("Checkout page - visual snapshot", () => {
    test.beforeEach(async ({ page }) => {
        await mockCommonRoutes(page);
        // Checkout is gated behind RequireBuyer and needs a non-empty
        // cart to render its main form rather than an empty-cart
        // redirect/message - both are mocked so the snapshot captures
        // the actual filled-out checkout form.
        await authenticatedContext(page, BUYER_USER);
        await mockCart(page, CART_ITEMS);
    });

    test("filled checkout form matches baseline", async ({ page }) => {
        await page.goto("/checkout");
        await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
        await page.waitForLoadState("networkidle");

        await expect(page).toHaveScreenshot("checkout-filled.png", { fullPage: true });
    });
});
