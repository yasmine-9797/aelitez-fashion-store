import { expect, test } from "@playwright/test";
import { uniqueEmail, gotoReady } from "./helpers";

test.describe("shopper journey", () => {
  test("browse, filter, add to bag as a guest, sign up at checkout and place a COD order", async ({ page }) => {
    await gotoReady(page, "/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Every age.");
    // The store sells only kids' and women's fashion.
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /^men$/i })).toHaveCount(0);

    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Kids", exact: true }).click();
    await expect(page).toHaveURL(/\/kids/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Kids");

    // Filter by category through the sidebar — the URL keeps the filter.
    await page.getByRole("complementary", { name: "Filters" }).getByRole("button", { name: /^Girls/ }).click();
    await expect(page).toHaveURL(/category=girls/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Girls");

    await page.getByRole("link", { name: "Ruffle Sleeve Party Frock" }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ruffle Sleeve Party Frock");

    // Adding without a size asks for one.
    await page.getByRole("button", { name: /Add to bag/ }).click();
    await expect(page.getByText("Please choose a size.")).toBeVisible();
    await page.locator("#size-options button:not([disabled])").first().click();
    await page.getByRole("button", { name: /Add to bag/ }).click();
    const bag = page.getByRole("dialog", { name: "Shopping bag" });
    await expect(bag.getByRole("heading", { name: /Your bag \(1\)/ })).toBeVisible();
    await expect(bag.getByText("₹899").first()).toBeVisible();

    // Checkout requires an account; the guest bag carries over.
    await bag.getByRole("button", { name: "Checkout" }).click();
    await expect(page).toHaveURL(/\/login\?redirect=%2Fcheckout|\/login\?redirect=\/checkout/);
    await page.getByRole("link", { name: "Create an account" }).click();
    await page.getByLabel("Full name", { exact: true }).fill("Ananya Raman");
    await page.getByLabel("Email", { exact: true }).fill(uniqueEmail("shopper"));
    await page.getByLabel("Password", { exact: true }).fill("Sunflower2026");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/checkout/);
    await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();

    await page.getByLabel("Mobile number").first().fill("98765 43210");
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Use this address" }) });
    await form.getByLabel("Full name").fill("Ananya Raman");
    await form.getByLabel("Mobile number").fill("9876543210");
    await form.getByLabel("Flat, house no., building, street").fill("12, Gandhi Street");
    await form.getByLabel("City").fill("Tiruppur");
    await form.getByLabel("State").selectOption("Tamil Nadu");
    // An invalid PIN code is rejected before the order is placed.
    await form.getByLabel("PIN code").fill("04160");
    await form.getByRole("button", { name: "Use this address" }).click();
    await expect(form.getByText("Enter a valid 6-digit PIN code")).toBeVisible();
    await form.getByLabel("PIN code").fill("641604");
    await form.getByRole("button", { name: "Use this address" }).click();

    await expect(page.getByRole("radio", { name: /^Cash on delivery/ })).toBeChecked();
    const summary = page.getByRole("complementary", { name: "Order summary" });
    await expect(summary.getByText("₹899").first()).toBeVisible();
    await expect(summary.getByText("₹79")).toBeVisible(); // below the ₹999 free-delivery threshold
    await page.getByRole("button", { name: "Place order" }).click();

    await expect(page.getByText("Thank you — your order is confirmed!")).toBeVisible();
    const orderNumber = (await page.getByRole("heading", { level: 2 }).filter({ hasText: /^AEZ-/ }).textContent())!.trim();
    expect(orderNumber).toMatch(/^AEZ-\d{6}-[A-Z0-9]{6}$/);
    await expect(page.getByText("Confirmed").first()).toBeVisible();

    await gotoReady(page, "/account/orders");
    await expect(page.getByText(orderNumber)).toBeVisible();
  });

  test("checkout sends guests to sign in", async ({ page }) => {
    await gotoReady(page, "/checkout");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });

  test("unknown products show a not-found page", async ({ page }) => {
    const res = await gotoReady(page, "/products/this-does-not-exist");
    expect(res?.status()).toBe(404);
    await expect(page.getByText("Page not found")).toBeVisible();
  });
});
