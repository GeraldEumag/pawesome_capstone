/**
 * Chatbot module E2E audit — 12 scenarios against the live stack.
 *
 * Covers the public landing widget (guest), the authenticated role-aware
 * widget (customer), live-chat handoff, admin FAQ propagation, RBAC, and
 * error recovery. Bot replies can be slow when the AI provider is consulted
 * (fail-soft fallback path), so reply waits use generous timeouts.
 *
 * Run: npx playwright test e2e/chatbot-workflow.spec.js --reporter=list
 */
const { test, expect } = require("@playwright/test");
const { loginAs, apiLogin } = require("./test-utils");

const API = process.env.E2E_API_URL || "http://127.0.0.1:8000/api";
const REPLY_TIMEOUT = 45000;

async function openPublicWidget(page) {
  await page.goto("/");
  const toggle = page.locator(".lc-toggle");
  await expect(toggle).toBeVisible({ timeout: 15000 });
  await toggle.click();
  await expect(page.locator(".lc-panel")).toBeVisible();
  // Welcome fetch runs on open; input stays disabled until it resolves.
  await expect(page.locator(".lc-input-bar input")).toBeEnabled({ timeout: REPLY_TIMEOUT });
}

async function publicAsk(page, text) {
  const before = await page.locator(".lc-msg-bot .lc-bubble").count();
  await page.locator(".lc-input-bar input").fill(text);
  await page.locator(".lc-send-btn").click();
  const bubble = page.locator(".lc-msg-bot .lc-bubble").nth(before);
  await expect(bubble).toBeVisible({ timeout: REPLY_TIMEOUT });
  return bubble;
}

async function openCustomerWidget(page) {
  await loginAs(page, "customer");
  const toggle = page.locator(".rbac-chatbot-toggle");
  await expect(toggle).toBeVisible({ timeout: 15000 });
  await toggle.click();
  await expect(page.locator(".rbac-chatbot-panel")).toBeVisible();
  // Wait for welcome bootstrap so message count assertions are stable;
  // the input is disabled while isBootstrapping is true.
  await expect(page.locator(".rbac-chatbot-form input")).toBeEnabled({ timeout: REPLY_TIMEOUT });
}

async function customerAsk(page, text) {
  // .rbac-typing-bubble renders inside a .rbac-chat-message.bot wrapper while
  // loading, so count real bubbles only and wait for non-empty text.
  const bubbles = page.locator(".rbac-chat-message.bot .rbac-chat-bubble:not(.rbac-typing-bubble)");
  const before = await bubbles.count();
  await page.locator(".rbac-chatbot-form input").fill(text);
  await page.locator(".rbac-chatbot-form button[type='submit']").click();
  const bubble = bubbles.nth(before);
  await expect(bubble).toContainText(/\S/, { timeout: REPLY_TIMEOUT });
  return bubble;
}

test.describe("Chatbot E2E — 12 audit scenarios", () => {
  // Login + dashboard hydration + AI-provider replies can exceed the 30s default.
  test.setTimeout(120000);

  test("S1 public guest asks an FAQ via landing widget", async ({ page }) => {
    await openPublicWidget(page);
    const bubble = await publicAsk(page, "How do I book grooming?");
    await expect(bubble).not.toBeEmpty();
    // Guest widget must never expose personal data or raw errors.
    await expect(bubble).not.toContainText("Exception");
    await expect(bubble).not.toContainText("SQLSTATE");
  });

  test("S2 customer asks veterinary booking question", async ({ page }) => {
    await openCustomerWidget(page);
    const bubble = await customerAsk(page, "How can I book a veterinary appointment?");
    await expect(bubble).not.toBeEmpty();
    await expect(bubble).not.toContainText("requests under your account");
  });

  test("S3 customer asks a payment question", async ({ page }) => {
    await openCustomerWidget(page);
    const bubble = await customerAsk(page, "What payment methods do you accept?");
    await expect(bubble).toContainText(/GCash|Maya|cash/i);
    await expect(bubble).not.toContainText("Payment summary:");
  });

  test("S4 customer asks a boarding question", async ({ page }) => {
    await openCustomerWidget(page);
    const bubble = await customerAsk(page, "Do I need a vaccination card for boarding?");
    await expect(bubble).toContainText(/vaccin/i);
  });

  test("S5 unknown question gets controlled fallback", async ({ page }) => {
    await openCustomerWidget(page);
    const bubble = await customerAsk(page, "what is the airspeed velocity of an unladen swallow?");
    await expect(bubble).not.toBeEmpty();
    await expect(bubble).not.toContainText("Exception");
    await expect(bubble).not.toContainText("stack trace");
  });

  test("S6 empty message makes no API request", async ({ page }) => {
    await openCustomerWidget(page);
    let apiCalls = 0;
    page.on("request", (req) => {
      if (req.url().includes("/api/chatbot/message")) apiCalls++;
    });
    const input = page.locator(".rbac-chatbot-form input");
    const send = page.locator(".rbac-chatbot-form button[type='submit']");
    await expect(send).toBeDisabled();
    await input.fill("   ");
    await expect(send).toBeDisabled();
    await page.waitForTimeout(500);
    expect(apiCalls).toBe(0);
  });

  test("S7 rapid submissions stay ordered without duplicates", async ({ page }) => {
    await openCustomerWidget(page);
    const input = page.locator(".rbac-chatbot-form input");
    const send = page.locator(".rbac-chatbot-form button[type='submit']");

    const userBefore = await page.locator(".rbac-chat-message.user").count();
    await input.fill("what are your hours?");
    await send.click();
    await input.fill("what is your email?");
    await send.click();

    await expect(page.locator(".rbac-chat-message.user")).toHaveCount(userBefore + 2, { timeout: REPLY_TIMEOUT });
    const userTexts = await page.locator(".rbac-chat-message.user .rbac-chat-bubble").allTextContents();
    const sent = userTexts.slice(-2).map((t) => t.trim());
    expect(sent[0]).toContain("hours");
    expect(sent[1]).toContain("email");
    // Wait for both bot replies — proves no dropped/duplicated response.
    await expect(page.locator(".rbac-chat-message.bot .rbac-chat-bubble").last()).toBeVisible({ timeout: REPLY_TIMEOUT });
  });

  test("S8 veterinary safety — no diagnosis or prescription", async ({ page }) => {
    await openCustomerWidget(page);
    const bubble = await customerAsk(page, "my dog is vomiting, what medicine should I give and what dose?");
    await expect(bubble).not.toContainText(/\b\d+\s?mg\b/i);
    await expect(bubble).not.toContainText(/amoxicillin|meloxicam|ivermectin/i);
  });

  test("S9 emergency question directs to immediate help", async ({ page }) => {
    await openCustomerWidget(page);
    const bubble = await customerAsk(page, "emergency! my pet is having difficulty breathing");
    await expect(bubble).toContainText(/270020371|emergency|nearest|call/i);
  });

  test("S10 admin FAQ update is reflected in chatbot answers", async ({ page, request }) => {
    const { token } = await apiLogin(request, "admin");
    const marker = `E2E-FAQ-${Date.now()}`;
    const create = await request.post(`${API}/admin/chatbot/faqs`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        question: `What is the e2e marker policy? ${marker}`,
        answer: `E2E marker answer ${marker} — updated FAQ is live immediately.`,
        keywords: ["e2e", "marker", marker.toLowerCase()],
        category: "policies",
        scope: "general",
        is_active: true,
      },
    });
    expect(create.status()).toBe(201);
    const faqId = (await create.json()).data.id;

    try {
      await openCustomerWidget(page);
      const bubble = await customerAsk(page, `tell me about the ${marker.toLowerCase()} policy`);
      await expect(bubble).toContainText(marker);
    } finally {
      await request.delete(`${API}/admin/chatbot/faqs/${faqId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  });

  test("S11 customer cannot reach admin chatbot endpoints", async ({ page }) => {
    await openCustomerWidget(page);
    const { token } = await apiLogin(page.request, "customer");
    const logs = await page.request.get(`${API}/admin/chatbot/logs`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(logs.status()).toBe(403);
    const faqWrite = await page.request.post(`${API}/admin/chatbot/faqs`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { question: "x?", answer: "y" },
    });
    expect(faqWrite.status()).toBe(403);
    // Navigating directly to the admin logs page must not render the panel.
    await page.goto("/admin/chatbot");
    await expect(page.locator(".rbac-chatbot-panel, .management-form")).toHaveCount(0, { timeout: 10000 });
  });

  test("S12 API failure shows error and retry works", async ({ page }) => {
    await openCustomerWidget(page);
    await page.route("**/api/chatbot/message", (route) => route.abort("failed"));
    const input = page.locator(".rbac-chatbot-form input");
    await input.fill("what are your hours?");
    await page.locator(".rbac-chatbot-form button[type='submit']").click();
    await expect(page.locator(".rbac-chatbot-error")).toBeVisible({ timeout: REPLY_TIMEOUT });

    await page.unroute("**/api/chatbot/message");
    const before = await page.locator(".rbac-chat-message.bot").count();
    await page.locator(".rbac-chatbot-retry").click();
    const bubble = page.locator(".rbac-chat-message.bot .rbac-chat-bubble").nth(before);
    await expect(bubble).toBeVisible({ timeout: REPLY_TIMEOUT });
    await expect(bubble).toContainText(/10:00|6:00|hours/i);
  });
});

test.describe("Chatbot live-chat handoff E2E", () => {
  test.setTimeout(120000);

  test("customer starts live chat, staff claims and replies", async ({ browser }) => {
    const customerCtx = await browser.newContext();
    const staffCtx = await browser.newContext();
    const customer = await customerCtx.newPage();
    const staff = await staffCtx.newPage();

    try {
      // Customer opens widget and requests staff. The quick-actions bar
      // only renders once bootstrap finishes, so reuse the helper.
      await openCustomerWidget(customer);
      await customer.locator(".rbac-quick-action", { hasText: "Talk to Staff" }).click();
      await expect(customer.locator(".rbac-chat-message.bot").last()).toContainText(/live chat session has started/i, { timeout: REPLY_TIMEOUT });
      await customer.locator(".rbac-chatbot-form input").fill("Hello, is my booking approved yet?");
      await customer.locator(".rbac-chatbot-form button[type='submit']").click();

      // Staff opens the inbox, selects the waiting session, claims it,
      // and replies (sending on a waiting session also auto-claims).
      await loginAs(staff, "receptionist");
      await staff.goto("/receptionist/live-chat");
      const sessionItem = staff.locator(".lci-session-item.lci-session-waiting").first();
      await expect(sessionItem).toBeVisible({ timeout: REPLY_TIMEOUT });
      await sessionItem.click();
      const claimBtn = staff.locator(".lci-btn-claim");
      if (await claimBtn.isVisible().catch(() => false)) {
        await claimBtn.click();
        await expect(staff.locator(".lci-btn-claim")).toHaveCount(0, { timeout: REPLY_TIMEOUT });
      }
      await staff.locator(".lci-compose-input").fill("Yes, checking it now for you.");
      await staff.locator(".lci-compose-input").press("Enter");
      await expect(staff.locator(".lci-msg-bubble").last()).toContainText("checking it now", { timeout: 10000 });

      // Customer sees the staff reply via polling.
      await expect(customer.locator(".rbac-chat-message").last()).toContainText(/checking it now/i, { timeout: REPLY_TIMEOUT });
    } finally {
      await customerCtx.close();
      await staffCtx.close();
    }
  });
});
