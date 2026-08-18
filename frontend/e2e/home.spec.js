import { test, expect } from "@playwright/test";
import { mockCommonRoutes, mockProductsList, mockDepartments } from "./fixtures/mockRoutes.js";
import { PRODUCTS, DEPARTMENTS } from "./fixtures/data.js";

test.describe("Home page - visual snapshot", () => {
    test.beforeEach(async ({ page }) => {
        await mockCommonRoutes(page);
        await mockDepartments(page, DEPARTMENTS);
        // Home shows DepartmentDiscovery (no search) by default - see
        // Home.jsx. The product grid only renders once a search is
        // active, so this covers the actual default landing view.
        await mockProductsList(page, PRODUCTS);
    });

    test("default (no search) view matches baseline", async ({ page }) => {
        await page.goto("/");
        // Waits for the department cards' cover images (mocked, local)
        // to finish painting rather than racing a fixed timeout.
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
        await page.waitForLoadState("networkidle");

        await expect(page).toHaveScreenshot("home-default.png", { fullPage: true });
    });
});
