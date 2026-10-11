const { test, expect } = require("@playwright/test");
const { loginAs } = require("./test-utils");

// Customer Dashboard revisions — cards clickable, pet breed shown,
// language selector hidden for customers, chatbot layout usable.
test.describe("Customer dashboard revisions", () => {
  test("service card is a single clickable button that navigates once", async ({ page }) => {
    await loginAs(page, "customer");
    await page.goto("/customer/services");
    const card = page.locator(".cs-card", { hasText: "Grooming" }).first();
    await expect(card).toBeVisible();
    // Card itself is the button — one click navigates to the grooming flow.
    await card.click();
    await expect(page).toHaveURL(/\/customer\/grooming/);
    // No nested <button> inside the card (single action surface).
    await page.goto("/customer/services");
    expect(await card.locator("button").count()).toBe(0);
  });

  test("pet selector shows name, species and breed", async ({ page }) => {
    await loginAs(page, "customer");
    await page.goto("/customer/grooming");
    const select = page.locator('select[name="pet_id"]');
    await expect(select).toBeVisible();
    await expect.poll(async () => select.locator("option").count()).toBeGreaterThan(1);
    const labels = await select.locator("option").allInnerTexts();
    // At least one seeded pet carries a breed → "· <breed>" must appear.
    const withBreed = labels.filter((l) => l.includes("·"));
    expect(withBreed.length, `expected a pet option with breed, saw: ${labels.join(" | ")}`).toBeGreaterThan(0);
  });

  test("customer profile has no language selector", async ({ page }) => {
    await loginAs(page, "customer");
    await page.goto("/customer/profile");
    await expect(page.getByText(/account settings|preferences/i).first()).toBeVisible({ timeout: 15000 });
    expect(await page.locator("text=/^Language$/").count()).toBe(0);
  });

  test("chatbot opens, sends a message, composer stays in a row", async ({ page }) => {
    await loginAs(page, "customer");
    await page.goto("/customer/services");
    const toggle = page.locator(".rbac-chatbot-toggle");
    await expect(toggle).toBeVisible({ timeout: 15000 });
    await toggle.click();
    const panel = page.locator(".rbac-chatbot-panel");
    await expect(panel).toBeVisible();
    await expect(page.locator(".rbac-chatbot-header")).toBeVisible();
    await expect(page.locator(".rbac-chatbot-body")).toBeVisible();
    const form = page.locator(".rbac-chatbot-form");
    await expect(form).toBeVisible();
    const input = form.locator("input");
    await input.fill("What services do you offer?");
    await form.locator("button[type='submit']").click();
    await expect(page.locator(".rbac-chat-message.user .rbac-chat-bubble", { hasText: "What services" })).toBeVisible({ timeout: 10000 });
    // Composer remains a row (input beside send button).
    const [inputBox, btnBox] = await Promise.all([
      input.boundingBox(),
      form.locator("button[type='submit']").boundingBox(),
    ]);
    expect(Math.abs(inputBox.y - btnBox.y)).toBeLessThan(10);
  });

  test("chatbot panel fits a 360px mobile viewport without covering it", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await loginAs(page, "customer");
    await page.goto("/customer/services");
    await page.locator(".rbac-chatbot-toggle").click();
    const panel = page.locator(".rbac-chatbot-panel");
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box.width).toBeGreaterThan(280); // usable width, not the old ~250px squeeze
    expect(box.width + box.x).toBeLessThanOrEqual(360);
    const input = page.locator(".rbac-chatbot-form input");
    await input.fill("hi");
    await page.locator(".rbac-chatbot-form button[type='submit']").click();
    await expect(page.locator(".rbac-chat-message.user").last()).toBeVisible({ timeout: 10000 });
    // Composer still a single row at 360px
    const [ib, sb] = await Promise.all([input.boundingBox(), page.locator(".rbac-chatbot-form button[type='submit']").boundingBox()]);
    expect(Math.abs(ib.y - sb.y)).toBeLessThan(10);
  });
});
