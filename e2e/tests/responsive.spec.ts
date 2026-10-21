import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, gotoReady } from "./helpers";

const PAGES = ["/", "/kids", "/women", "/shop?sort=newest", "/products/ruffle-sleeve-party-frock", "/cart", "/login", "/register", "/policies/returns"];

test.describe("responsive layout @mobile", () => {
  for (const width of [320, 390]) {
    test(`no horizontal scrolling at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      for (const path of PAGES) {
        await gotoReady(page, path);
        await page.waitForLoadState("networkidle");
        await expectNoHorizontalOverflow(page);
      }
    });
  }

  test("mobile menu, search and filters work on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoReady(page, "/");
    await page.getByRole("button", { name: "Open menu" }).click();
    const menu = page.getByRole("dialog", { name: "Menu" });
    await expect(menu.getByRole("link", { name: "Kids", exact: true })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Women", exact: true })).toBeVisible();
    await menu.getByRole("link", { name: "Women", exact: true }).click();
    await expect(page).toHaveURL(/\/women/);

    await page.getByRole("button", { name: /^Filters/ }).click();
    await expect(page.getByRole("dialog", { name: "Filters" })).toBeVisible();
    await page.getByRole("dialog", { name: "Filters" }).getByRole("button", { name: /^Show \d+ style/ }).click();

    await page.getByRole("button", { name: "Search products" }).click();
    await page.getByLabel("Search kids' & women's fashion").fill("lehenga");
    await expect(page.getByRole("dialog", { name: "Search products" }).getByText("Festive Pink Lehenga Set")).toBeVisible();
  });
});
