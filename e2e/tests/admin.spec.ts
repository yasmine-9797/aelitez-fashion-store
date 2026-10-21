import { expect, test } from "@playwright/test";
import { ADMIN, placeCodOrder, signIn, uniqueEmail, gotoReady } from "./helpers";

test.describe("admin", () => {
  test("customers cannot open the admin area", async ({ page }) => {
    await gotoReady(page, "/register");
    await page.getByLabel("Full name").fill("Curious Customer");
    await page.getByLabel("Email", { exact: true }).fill(uniqueEmail("curious"));
    await page.getByLabel("Password", { exact: true }).fill("Curious-Passw0rd");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/account/);
    await gotoReady(page, "/admin");
    await expect(page.getByRole("heading", { name: "No access" })).toBeVisible();
  });

  test("fulfils an order through the state machine", async ({ page }) => {
    const order = await placeCodOrder();
    await signIn(page, ADMIN.email, ADMIN.password);
    await gotoReady(page, "/admin");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Orders" }).click();
    await page.getByLabel("Search orders").fill(order.orderNumber);
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("link", { name: order.orderNumber }).click();
    await expect(page.getByRole("heading", { name: order.orderNumber })).toBeVisible();

    // Shipping is not offered until the order is packed and has courier details.
    await expect(page.getByRole("button", { name: "Mark shipped" })).toHaveCount(0);
    await page.getByRole("button", { name: "Start processing" }).click();
    await expect(page.getByText("Processing").first()).toBeVisible();
    await page.getByRole("button", { name: "Mark packed" }).click();
    await page.getByLabel("Courier").fill("Delhivery");
    await page.getByLabel("Tracking number").fill("DLV123456789");
    await page.getByRole("button", { name: "Save & mark shipped" }).click();
    await expect(page.getByText("Shipped with Delhivery").first()).toBeVisible();
    await page.getByRole("button", { name: "Mark delivered" }).click();
    await expect(page.getByText("Delivered").first()).toBeVisible();

    // Cash is recorded only when staff confirm it was collected.
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: /Record cash collected/ }).click();
    await expect(page.getByText("Paid").first()).toBeVisible();
  });

  test("refuses men's categories", async ({ page }) => {
    await signIn(page, ADMIN.email, ADMIN.password);
    await gotoReady(page, "/admin/categories");
    await page.getByRole("button", { name: "New category" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill("Men's Shirts");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText(/men's categories can't be created/i).first()).toBeVisible();
  });

  test("won't publish a product without photos", async ({ page }) => {
    await signIn(page, ADMIN.email, ADMIN.password);
    await gotoReady(page, "/admin/products/new");
    await page.getByLabel("Product name").fill("Test Draft Kurti");
    await page.getByLabel("Description").fill("A draft product created by the end-to-end tests.");
    await page.getByLabel("Selling price (₹)").fill("999");
    await page.getByRole("button", { name: "Create draft" }).click();
    await expect(page.getByRole("heading", { name: "Test Draft Kurti" })).toBeVisible();
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByText("Add at least one product image before publishing.")).toBeVisible();
  });
});
