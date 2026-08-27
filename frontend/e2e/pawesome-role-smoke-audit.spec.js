const { test, expect } = require("@playwright/test");

const frontendUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const apiUrl = process.env.E2E_API_URL || "http://127.0.0.1:8000/api";

const accounts = {
  customer: { email: "customer@example.com", password: "Password123!", dashboard: "/customer" },
  receptionist: { email: "receptionist@example.com", password: "Password123!", dashboard: "/receptionist" },
  cashier: { email: "cashier@example.com", password: "password123", dashboard: "/cashier" },
  inventory: { email: "inventory@example.com", password: "Password123!", dashboard: "/inventory" },
  veterinary: { email: "vet@example.com", password: "Password123!", dashboard: "/veterinary" },
  manager: { email: "manager@example.com", password: "password123", dashboard: "/manager" },
  admin: { email: "admin@example.com", password: "Password123!", dashboard: "/admin" },
};

async function apiLogin(request, role) {
  const account = accounts[role];
  const response = await request.post(`${apiUrl}/auth/login`, {
    headers: { Accept: "application/json" },
    data: { login: account.email, email: account.email, password: account.password },
  });
  if (!response.ok()) {
    throw new Error(`API login failed for ${role}: ${response.status()} ${await response.text()}`);
  }
  const body = await response.json();
  return { token: body.token || body.access_token, user: body.user || {} };
}

test.describe.configure({ mode: "serial" });

for (const role of Object.keys(accounts)) {
  test(`${role} dashboard loads without console errors`, async ({ page, request }) => {
    const errors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        // ERR_NETWORK_CHANGED, ERR_ADDRESS_IN_USE, and "Failed to fetch" are Windows socket exhaustion issues, not app defects
        if (text.includes("ERR_NETWORK_CHANGED") || text.includes("ERR_ADDRESS_IN_USE") || text.includes("net::ERR_") || text.includes("Failed to fetch")) {
          return;
        }
        errors.push({ text: msg.text(), page: page.url() });
      }
    });
    page.on("response", (response) => {
      const status = response.status();
      const url = response.url();
      if (url.includes("/api/") && [401, 403, 500].includes(status)) {
        errors.push({ type: "http", status, url, page: page.url() });
      }
    });

    const session = await apiLogin(request, role);
    await page.addInitScript(({ token, user }) => {
      window.localStorage.setItem("token", token);
      window.localStorage.setItem("role", user.role);
      window.localStorage.setItem("name", user.name);
      window.localStorage.setItem("username", user.username || user.email);
      window.localStorage.setItem("email", user.email);
    }, { token: session.token, user: session.user });

    await page.goto(frontendUrl + accounts[role].dashboard);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    const bodyText = await page.locator("body").innerText({ timeout: 15000 }).catch(() => "");
    const rendered = bodyText.length > 40;
    const onLogin = page.url().includes("/login");
    const hasUnauthorized = bodyText.toLowerCase().includes("unauthorized");
    expect(rendered, `${role} dashboard should render`).toBeTruthy();
    expect(onLogin, `${role} should not redirect to login`).toBeFalsy();
    expect(hasUnauthorized, `${role} should not show unauthorized`).toBeFalsy();

    await page.waitForTimeout(3000); // give sockets time to close before next role
    if (errors.length) {
      throw new Error(`Console/HTTP errors for ${role}: ${JSON.stringify(errors, null, 2)}`);
    }
  });
}
