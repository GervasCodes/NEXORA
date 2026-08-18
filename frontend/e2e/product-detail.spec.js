import { test, expect } from "@playwright/test";
import { mockCommonRoutes, mockProductDetail } from "./fixtures/mockRoutes.js";
import { product } from "./fixtures/data.js";

test.describe("ProductDetail page - visual snapshot", () => {
    const testProduct = product();

    test.beforeEach(async ({ page }) => {
        await mockCommonRoutes(page);
        await mockProductDetail(page, testProduct);
    });

    test("product page matches baseline", async ({ page }) => {
        await page.goto(`/products/${testProduct.id}`);
        await expect(page.getByRole("heading", { name: testProduct.name })).toBeVisible();
        await page.waitForLoadState("networkidle");

        await expect(page).toHaveScreenshot("product-detail.png", { fullPage: true });
    });
});
