const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "../..");
const evidenceDir = path.join(rootDir, "browser-evidence", "manager-payroll-scope");
const resultPath = path.join(evidenceDir, "manager-payroll-scope-results.json");

const manager = {
  email: "manager@example.com",
  password: "Password123!",
  dashboard: "/manager",
};

const managerPages = [
  { path: "/manager", label: "manager-dashboard", api: "/api/manager/dashboard" },
  { path: "/manager/staff", label: "manager-staff", api: "/api/manager/staff" },
  { path: "/manager/attendance", label: "manager-attendance", api: "/api/manager/attendance" },
  { path: "/manager/leave", label: "manager-leave", api: "/api/manager/leaves" },
  { path: "/manager/schedule", label: "manager-schedule", api: "/api/manager/schedules" },
  { path: "/manager/payroll", label: "manager-payroll", api: "/api/manager/payroll" },
  { path: "/manager/payroll/computation", label: "manager-payroll-computation", api: "/api/manager/payroll" },
  { path: "/manager/reports", label: "manager-reports", api: "/api/manager/reports/live" },
];

function ensureEvidenceDir() {
  fs.mkdirSync(evidenceDir, { recursive: true });
}

function relativeToRoot(filePath) {
  return path.relative(rootDir, filePath).replace(/\\/g, "/");
}

async function screenshot(page, label) {
  const filePath = path.join(evidenceDir, `${label}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  return relativeToRoot(filePath);
}

async function bodyTextLength(page) {
  return page.locator("body").evaluate((body) => body.innerText.trim().length);
}

async function openPageAndWaitForApi(page, managerPage) {
  const apiResponse = page.waitForResponse(
    (response) =>
      response.url().includes(managerPage.api) &&
      response.request().method() === "GET" &&
      response.status() < 400,
    { timeout: 20000 }
  ).catch(() => null);

  await page.goto(managerPage.path);
  await page.waitForLoadState("domcontentloaded");
  await apiResponse;
  await page.waitForTimeout(1000);
}

async function loginAsManager(page) {
  await page.goto("/login");
  await page.evaluate(() => localStorage.clear());
  await page.locator('input[type="text"], input[type="email"]').first().fill(manager.email);
  await page.locator('input[type="password"]').first().fill(manager.password);
  await page.locator('button[type="submit"], button:has-text("Sign In"), button:has-text("Login")').first().click();

  const sweetAlertOk = page.locator(".swal2-confirm, button:has-text('OK')").first();
  await expect(sweetAlertOk).toBeVisible({ timeout: 15000 });
  await sweetAlertOk.click();

  await page.waitForURL(`**${manager.dashboard}**`, { timeout: 20000 });
}

test.describe.configure({ mode: "serial" });
test.setTimeout(180000);

test("Manager payroll scope pages render in browser", async ({ page }) => {
  ensureEvidenceDir();

  const result = {
    startedAt: new Date().toISOString(),
    frontendUrl: test.info().project.use.baseURL,
    backendUrl: "http://127.0.0.1:8000",
    login: false,
    pages: [],
    console: [],
    network: [],
    screenshots: [],
  };

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      result.console.push({
        type: message.type(),
        text: message.text(),
        url: page.url(),
      });
    }
  });

  page.on("response", (response) => {
    const url = response.url();
    const status = response.status();
    if (url.includes("/api/") && status >= 400) {
      result.network.push({
        status,
        method: response.request().method(),
        url,
        page: page.url(),
      });
    }
  });

  page.on("requestfailed", (request) => {
    const url = request.url();
    if (url.includes("/api/")) {
      result.network.push({
        status: "REQUEST_FAILED",
        method: request.method(),
        url,
        page: page.url(),
        failure: request.failure()?.errorText || "unknown",
      });
    }
  });

  await loginAsManager(page);
  result.login = true;

  for (const managerPage of managerPages) {
    await openPageAndWaitForApi(page, managerPage);

    const currentUrl = page.url();
    const textLength = await bodyTextLength(page);
    const shot = await screenshot(page, managerPage.label);
    const pageResult = {
      path: managerPage.path,
      url: currentUrl,
      rendered: textLength > 40,
      stayedOnRoute: currentUrl.includes(managerPage.path),
      textLength,
      screenshot: shot,
    };

    result.pages.push(pageResult);
    result.screenshots.push(shot);

    expect(pageResult.rendered, `${managerPage.path} should not be blank`).toBe(true);
    expect(pageResult.stayedOnRoute, `${managerPage.path} should remain under Manager`).toBe(true);
  }

  const criticalNetwork = result.network.filter((entry) =>
    [401, 403, 404, 500].includes(entry.status)
  );

  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));

  expect(result.login).toBe(true);
  expect(criticalNetwork, "Manager pages should not produce critical API errors").toEqual([]);
});
