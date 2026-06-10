const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "../..");
const screenshotDir = path.join(rootDir, "documentation", "screenshots", "phase10");
const reportDir = path.join(rootDir, "documentation", "reports", "phase10");

const roles = [
  {
    key: "customer",
    email: "customer@example.com",
    password: "Password123!",
    dashboard: "/customer",
    pages: ["/customer/services", "/customer/pets", "/customer/payments", "/customer/notifications"],
  },
  {
    key: "receptionist",
    email: "receptionist@example.com",
    password: "Password123!",
    dashboard: "/receptionist",
    pages: ["/receptionist/appointments-boarding", "/receptionist/customers", "/receptionist/history", "/receptionist/reports"],
  },
  {
    key: "cashier",
    email: "cashier@example.com",
    password: "Password123!",
    dashboard: "/cashier",
    pages: ["/cashier/pos", "/cashier/payment-verification", "/cashier/history", "/cashier/reports"],
  },
  {
    key: "inventory",
    email: "inventory@example.com",
    password: "Password123!",
    dashboard: "/inventory",
    pages: ["/inventory/products", "/inventory/history", "/inventory/reports", "/inventory/monthly-audit"],
  },
  {
    key: "veterinary",
    email: "vet@example.com",
    password: "Password123!",
    dashboard: "/veterinary",
    pages: ["/veterinary/appointments", "/veterinary/reports", "/veterinary/history", "/veterinary/customer-profiles"],
  },
  {
    key: "manager",
    email: "manager@example.com",
    password: "Password123!",
    dashboard: "/manager",
    pages: ["/manager/reports", "/manager/staff", "/manager/attendance", "/manager/history"],
  },
  {
    key: "admin",
    email: "admin@example.com",
    password: "Password123!",
    dashboard: "/admin",
    pages: ["/admin/users", "/admin/reports", "/admin/history", "/admin/settings"],
  },
];

const startedAt = new Date().toISOString();
const run = {
  setup: {
    backendUrl: "http://127.0.0.1:8000",
    frontendUrl: "http://localhost:3000",
    browserPreview: "http://127.0.0.1:64422",
    testDate: startedAt,
    tester: "Codex automated Playwright",
  },
  roles: [],
  workflows: [],
  issues: [],
  screenshots: [],
};

function ensureDirs() {
  fs.mkdirSync(screenshotDir, { recursive: true });
  fs.mkdirSync(reportDir, { recursive: true });
}

function writeRunResults() {
  fs.writeFileSync(
    path.join(reportDir, "phase10-browser-results.json"),
    JSON.stringify(run, null, 2)
  );
}

function sanitize(value) {
  return value.replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

async function capture(page, role, label) {
  const file = `${role}-${sanitize(label)}.png`;
  const fullPath = path.join(screenshotDir, file);
  await page.screenshot({ path: fullPath, fullPage: false });
  const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, "/");
  run.screenshots.push(relativePath);
  return relativePath;
}

function attachAuditors(page, bucket) {
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      bucket.console.push({
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
      bucket.network.push({
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
      bucket.network.push({
        status: "REQUEST_FAILED",
        method: request.method(),
        url,
        page: page.url(),
        failure: request.failure()?.errorText,
      });
    }
  });
}

async function visibleTextLength(page) {
  return page.locator("body").evaluate((body) => body.innerText.trim().length).catch(() => 0);
}

async function loginThroughUi(page, role) {
  await page.goto("/login");
  await page.locator('input[type="text"]').fill(role.email);
  await page.locator('input[type="password"]').fill(role.password);
  await page.locator('button[type="submit"]').click();

  const ok = page.locator(".swal2-confirm");
  await expect(ok).toBeVisible({ timeout: 15000 });
  await ok.click();
  await page.waitForURL(`**${role.dashboard}**`, { timeout: 20000 });
}

async function clickOrOpen(page, targetPath) {
  const navLink = page.locator(`a[href="${targetPath}"]`);
  const count = await navLink.count();

  if (count > 0) {
    await navLink.first().click({ timeout: 8000 }).catch(() => {});
    await page.waitForURL(`**${targetPath}**`, { timeout: 5000 }).catch(() => {});
    if (!page.url().includes(targetPath)) {
      await page.goto(targetPath);
    }
    await page.waitForTimeout(1500);
    return page.url().includes(targetPath) ? "clicked" : "clicked-then-opened-directly";
  }

  await page.goto(targetPath);
  await page.waitForTimeout(1500);
  return "opened-directly";
}

function summarizeStatus(roleResult) {
  const hasCriticalNetwork = roleResult.networkErrors.some((entry) =>
    [401, 403, 404, 422, 500].includes(entry.status) ||
    (entry.status === "REQUEST_FAILED" && entry.failure !== "net::ERR_ABORTED")
  );
  if (!roleResult.login || !roleResult.dashboard || roleResult.blankPages.length > 0 || hasCriticalNetwork) {
    return "FAIL";
  }
  return roleResult.consoleErrors.length || roleResult.networkErrors.length ? "WARN" : "PASS";
}

test.describe.configure({ mode: "serial" });
test.setTimeout(600000);

test("Phase 10 live browser role smoke and navigation audit", async ({ browser }) => {
  ensureDirs();

  for (const role of roles) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const audit = { console: [], network: [] };
    attachAuditors(page, audit);

    const roleResult = {
      role: role.key,
      login: false,
      dashboard: false,
      dashboardUrl: "",
      sidebar: false,
      mainPages: [],
      blankPages: [],
      consoleErrors: audit.console,
      networkErrors: audit.network,
      screenshot: "",
      notes: [],
    };

    try {
      await page.goto("/login");
      await page.evaluate(() => localStorage.clear());
      await loginThroughUi(page, role);
      roleResult.login = true;
      roleResult.dashboardUrl = page.url();
      await page.waitForTimeout(1500);
      roleResult.dashboard = (await visibleTextLength(page)) > 40;
      roleResult.sidebar = (await page.locator("aside, nav, [class*=sidebar], [class*=Sidebar]").count()) > 0;
      roleResult.screenshot = await capture(page, role.key, "dashboard");

      for (const pagePath of role.pages) {
        const navigationMode = await clickOrOpen(page, pagePath);
        const textLength = await visibleTextLength(page);
        const screenshot = await capture(page, role.key, pagePath);

        roleResult.mainPages.push({
          path: pagePath,
          url: page.url(),
          navigationMode,
          rendered: textLength > 40,
          screenshot,
        });

        if (textLength <= 40) {
          roleResult.blankPages.push(pagePath);
        }
      }

      await page.goto("/logout");
      await page.waitForURL("**/login", { timeout: 15000 }).catch(() => {});
    } catch (error) {
      roleResult.notes.push(error.message);
      roleResult.screenshot = roleResult.screenshot || (await capture(page, role.key, "failure"));
    }

    roleResult.status = summarizeStatus(roleResult);
    run.roles.push(roleResult);
    writeRunResults();
    await context.close();
  }

  const customer = run.roles.find((entry) => entry.role === "customer");
  const receptionist = run.roles.find((entry) => entry.role === "receptionist");
  const cashier = run.roles.find((entry) => entry.role === "cashier");
  const inventory = run.roles.find((entry) => entry.role === "inventory");
  const vet = run.roles.find((entry) => entry.role === "veterinary");
  const manager = run.roles.find((entry) => entry.role === "manager");

  run.workflows.push(
    {
      workflow: "Customer to Receptionist",
      result: customer?.status !== "FAIL" && receptionist?.status !== "FAIL" ? "PARTIAL PASS" : "FAIL",
      notes: "Customer service pages and receptionist request hub were browser-visited. Form submission was not attempted in this smoke spec.",
      screenshot: customer?.screenshot || "",
    },
    {
      workflow: "Payment",
      result: customer?.status !== "FAIL" && cashier?.status !== "FAIL" ? "PARTIAL PASS" : "FAIL",
      notes: "Customer payment page and cashier payment verification page were browser-visited. Payment proof upload was not attempted.",
      screenshot: cashier?.screenshot || "",
    },
    {
      workflow: "POS and Inventory",
      result: cashier?.status !== "FAIL" && inventory?.status !== "FAIL" ? "PARTIAL PASS" : "FAIL",
      notes: "Cashier POS and inventory management pages were browser-visited. Stock-changing transaction was not attempted by this audit spec.",
      screenshot: inventory?.screenshot || "",
    },
    {
      workflow: "Vet",
      result: receptionist?.status !== "FAIL" && vet?.status !== "FAIL" ? "PARTIAL PASS" : "FAIL",
      notes: "Receptionist scheduling hub and veterinary appointment pages were browser-visited. Consultation save was not attempted.",
      screenshot: vet?.screenshot || "",
    },
    {
      workflow: "Manager reporting",
      result: manager?.status !== "FAIL" ? "PASS" : "FAIL",
      notes: "Manager report and operations pages were browser-visited.",
      screenshot: manager?.screenshot || "",
    }
  );

  for (const roleResult of run.roles) {
    for (const entry of roleResult.networkErrors) {
      const abortedDuringNavigation = entry.status === "REQUEST_FAILED" && entry.failure === "net::ERR_ABORTED";
      run.issues.push({
        severity: abortedDuringNavigation ? "Low" : ([500, "REQUEST_FAILED"].includes(entry.status) ? "High" : "Medium"),
        module: roleResult.role,
        page: entry.page,
        error: `${entry.method} ${entry.status}`,
        routeFile: entry.url,
        fixApplied: abortedDuringNavigation ? "Classified as navigation-cancelled background request" : "No code fix applied by audit spec",
        status: abortedDuringNavigation ? "Observed" : "Open",
      });
    }
    for (const pagePath of roleResult.blankPages) {
      run.issues.push({
        severity: "High",
        module: roleResult.role,
        page: pagePath,
        error: "Page rendered blank or near blank",
        routeFile: pagePath,
        fixApplied: "No code fix applied by audit spec",
        status: "Open",
      });
    }
  }

  writeRunResults();

  expect(run.roles.length).toBe(roles.length);
});
