const { test, expect } = require("@playwright/test");
const { loginAs, apiLogin } = require("./test-utils");

const API_BASE = process.env.E2E_API_URL || "http://127.0.0.1:8000/api";

// Admin Dashboard revisions — delete-reason dropdown, compact chatbot log
// bubbles, consistent All Reports layout, settings/editor cleanup.
test.describe("Admin dashboard revisions", () => {
  test("delete user modal requires a reason; 'Other' reveals explanation field", async ({
    page,
    request,
  }) => {
    const { token } = await apiLogin(request, "admin");

    // Create a disposable user to delete via the UI
    const stamp = Date.now();
    const createRes = await request.post(`${API_BASE}/admin/users`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      data: {
        name: `Temp Delete ${stamp}`,
        username: `tempdel${stamp}`,
        email: `tempdel${stamp}@example.com`,
        password: "Password123!",
        role: "customer",
      },
    });
    expect(createRes.ok()).toBeTruthy();

    await loginAs(page, "admin");
    await page.goto("/admin/users");
    await expect(page.locator(".manage-users")).toBeVisible({ timeout: 15000 });

    // Open the row actions popover for the temp user and pick Delete
    const row = page.locator("tr", { hasText: `tempdel${stamp}@example.com` });
    await row.locator(".row-action-popover-trigger").click();
    await page
      .locator(".row-action-popover-item", { hasText: "Delete User" })
      .click();

    await expect(page.locator(".mu-modal")).toBeVisible();

    // Reason dropdown is present with the predefined options
    const reasonSelect = page.locator("#mu-delete-reason");
    await expect(reasonSelect).toBeVisible();
    const optionLabels = await reasonSelect.locator("option").allTextContents();
    expect(optionLabels.join(" ")).toContain("Duplicate account");
    expect(optionLabels.join(" ")).toContain("User requested account deletion");
    expect(optionLabels.join(" ")).toContain("Other");

    // "Other" reveals the required explanation field
    await reasonSelect.selectOption("other");
    const detail = page.locator("#mu-delete-reason-detail");
    await expect(detail).toBeVisible();
    await detail.fill("Temporary account created by automated regression test");

    await page.locator(".mu-modal-actions .confirm-btn").click();
    await expect(page.locator(".mu-modal")).toBeHidden({ timeout: 10000 });
    await expect(row).toHaveCount(0);
  });

  test("delete API rejects missing and invalid reasons", async ({ request }) => {
    const { token } = await apiLogin(request, "admin");
    const stamp = Date.now();
    const createRes = await request.post(`${API_BASE}/admin/users`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      data: {
        name: `Temp Guard ${stamp}`,
        username: `tempguard${stamp}`,
        email: `tempguard${stamp}@example.com`,
        password: "Password123!",
        role: "customer",
      },
    });
    const created = await createRes.json();
    const targetId = created?.user?.id || created?.data?.id || created?.id;
    expect(targetId).toBeTruthy();

    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const missing = await request.delete(`${API_BASE}/admin/users/${targetId}`, { headers, data: {} });
    expect(missing.status()).toBe(422);

    const invalid = await request.delete(`${API_BASE}/admin/users/${targetId}`, {
      headers,
      data: { reason: "not_a_real_reason" },
    });
    expect(invalid.status()).toBe(422);

    const otherNoDetails = await request.delete(`${API_BASE}/admin/users/${targetId}`, {
      headers,
      data: { reason: "other" },
    });
    expect(otherNoDetails.status()).toBe(422);

    // Cleanup with a valid reason
    const ok = await request.delete(`${API_BASE}/admin/users/${targetId}`, {
      headers,
      data: { reason: "test_account" },
    });
    expect(ok.status()).toBe(200);
  });

  test("all reports tabs keep a consistent outer layout", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/reports");
    await expect(page.locator(".admin-reports-nav")).toBeVisible({ timeout: 15000 });

    const wrapper = page.locator(".admin-reports-wrapper");
    const content = page.locator(".advanced-report-content");

    // Wrapper must not carry the old page-level min-height or huge bottom padding
    const wrapperMetrics = await wrapper.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { minHeight: cs.minHeight, paddingBottom: cs.paddingBottom };
    });
    expect(wrapperMetrics.minHeight).not.toBe("100vh");
    expect(parseInt(wrapperMetrics.paddingBottom)).toBeLessThan(60);

    // Switch through all tabs — the content card must not move or resize
    const tabs = page.locator(".admin-nav-tab");
    const count = await tabs.count();
    expect(count).toBe(9);

    const baseBox = await content.boundingBox();
    for (let i = 0; i < count; i++) {
      await tabs.nth(i).click();
      await page.waitForTimeout(600);
      const newBox = await content.boundingBox();
      expect(Math.abs(newBox.x - baseBox.x)).toBeLessThan(2);
      expect(Math.abs(newBox.width - baseBox.width)).toBeLessThan(2);
    }
  });

  test("chatbot logs render compact summary list", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/chatbot");
    await expect(page.locator(".management-panel").first()).toBeVisible({ timeout: 15000 });
    await expect(
      page.locator(".management-card.clickable, .empty-state").first()
    ).toBeVisible();
  });
});
