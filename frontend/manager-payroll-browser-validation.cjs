const { chromium } = require("playwright");
const fs = require("fs/promises");
const fss = require("fs");
const path = require("path");

const baseUrl = process.env.FRONTEND_URL || "http://localhost:3007";
const password = "Password123!";
const evidenceDir = path.resolve(__dirname, "..", "browser-evidence", "manager-payroll");

const managerLinks = [
  "Dashboard",
  "Reports",
  "Reservations Monitoring",
  "Service Monitoring",
  "Payment Monitoring",
  "Inventory Monitoring",
  "Customer Records",
  "Staff Performance",
  "Payroll Summary",
  "History / Audit Trail",
  "Profile",
  "Logout",
];

const removedManagerLinks = [
  "Attendance",
  "Fingerprint Kiosk",
  "Leave",
  "Schedule",
  "Payroll Computation",
];

const managerKpis = [
  "Total Revenue",
  "Total Reservations",
  "Pending Reservations",
  "Paid Payments",
  "Pending Payments",
  "Rejected Payments",
  "Total Customers",
  "Active Customers",
  "Total Appointments",
  "Grooming Requests",
  "Veterinary Appointments",
  "Boarding Bookings",
  "Low Stock Items",
  "Completed Services",
  "Today's Appointments",
];

const reportTabs = [
  "Summary",
  "Sales Report",
  "Payment Report",
  "Inventory Report",
  "Service Report",
  "Customer Report",
  "Staff Performance",
  "Payroll Summary",
];

const payrollPages = [
  { name: "Payroll Manager Payroll Management", url: "/payroll", screenshot: "payroll-manager-payroll-management.png", expected: ["Payroll Management"] },
  { name: "Payroll Manager Payroll Computation", url: "/payroll/compute", screenshot: "payroll-manager-payroll-computation.png", expected: ["Compute Payroll", "Preview Computation"] },
  { name: "Payroll Manager Attendance", url: "/payroll/attendance", screenshot: "payroll-manager-attendance.png", expected: ["Attendance"] },
  { name: "Payroll Manager Leave", url: "/payroll/leaves", screenshot: "payroll-manager-leave.png", expected: ["Leave"] },
  { name: "Payroll Manager Schedule", url: "/payroll/schedule", screenshot: "payroll-manager-schedule.png", expected: ["Scheduling"] },
  { name: "Payroll Manager Fingerprint Kiosk", url: "/payroll/kiosk", screenshot: "payroll-manager-fingerprint-kiosk.png", expected: ["Fingerprint Kiosk"] },
  { name: "Payroll Manager Reports", url: "/payroll/reports", screenshot: "payroll-manager-reports.png", expected: ["Reports"] },
  { name: "Payroll Manager Salaries", url: "/payroll/salaries", screenshot: "payroll-manager-salaries.png", expected: ["Salary"] },
];

const otherRoleCandidates = [
  { role: "Customer", email: "customer@example.com" },
  { role: "Receptionist", email: "receptionist@example.com" },
  { role: "Cashier", email: "cashier@example.com" },
  { role: "Inventory", email: "inventory@example.com" },
  { role: "Veterinary", email: "vet@example.com" },
];

const results = {
  baseUrl,
  generatedAt: new Date().toISOString(),
  screenshots: [],
  tests: [],
};

let activeTest = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeText = (value) => String(value || "").replace(/\s+/g, " ").trim();

const screenshotPath = (filename) => path.join(evidenceDir, filename);

const relativeScreenshot = (filename) => `browser-evidence/manager-payroll/${filename}`;

const record = (entry) => {
  const consoleErrors = activeTest?.consoleErrors || [];
  const networkErrors = activeTest?.networkErrors || [];
  results.tests.push({
    consoleErrors,
    networkErrors,
    ...entry,
    status: entry.passed ? "Passed" : "Failed",
  });
  console.log(`${entry.passed ? "PASS" : "FAIL"}: ${entry.page}`);
  fss.mkdirSync(evidenceDir, { recursive: true });
  fss.writeFileSync(
    path.join(evidenceDir, "browser-validation-results.json"),
    JSON.stringify(results, null, 2)
  );
};

const beginTest = (name) => {
  activeTest = { name, consoleErrors: [], networkErrors: [] };
};

const attachPageListeners = (page) => {
  page.on("console", (message) => {
    if (message.type() === "error" && activeTest) {
      const location = message.location();
      const suffix = location?.url ? ` @ ${location.url}:${location.lineNumber || 0}` : "";
      activeTest.consoleErrors.push(`${message.text()}${suffix}`);
    }
  });

  page.on("pageerror", (error) => {
    if (activeTest) activeTest.consoleErrors.push(error.message);
  });

  page.on("response", (response) => {
    const status = response.status();
    if (status === 404 || status >= 500) {
      if (activeTest) {
        activeTest.networkErrors.push(`${status} ${response.url()}`);
      }
    }
  });
};

const capture = async (page, filename) => {
  await page.screenshot({ path: screenshotPath(filename), fullPage: true });
  const rel = relativeScreenshot(filename);
  results.screenshots.push(rel);
  return rel;
};

const bodyText = async (page) => normalizeText(await page.locator("body").innerText({ timeout: 8000 }).catch(() => ""));

const waitForBodyText = async (page, text, timeout = 10000) => {
  await page
    .waitForFunction(
      (expected) => document.body && document.body.innerText.includes(expected),
      text,
      { timeout }
    )
    .catch(() => {});
};

const gotoAndSettle = async (page, url) => {
  await page.goto(`${baseUrl}${url}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 2500 }).catch(() => {});
  await sleep(400);
};

const logoutStorage = async (page) => {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  }).catch(() => {});
};

const login = async (page, email) => {
  await logoutStorage(page);
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("Enter your username").fill(email);
  await page.getByPlaceholder("Enter your password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();

  const okButton = page.getByRole("button", { name: "OK" });
  await okButton.waitFor({ state: "visible", timeout: 12000 }).catch(() => {});
  if (await okButton.isVisible().catch(() => false)) {
    await okButton.click();
  } else {
    await page.keyboard.press("Enter").catch(() => {});
  }

  await page.waitForLoadState("networkidle", { timeout: 3500 }).catch(() => {});
  await page.waitForFunction(() => !window.location.pathname.includes("/login"), { timeout: 15000 }).catch(() => {});
  await sleep(1500);
  return page.url();
};

const loginWithRetry = async (page, email) => {
  let url = await login(page, email);
  if (url.includes("/login")) {
    await sleep(1000);
    url = await login(page, email);
  }
  return url;
};

const expectTextSet = async (page, expected) => {
  const text = await bodyText(page);
  return {
    text,
    missing: expected.filter((item) => !text.includes(item)),
  };
};

const buttonTexts = async (page) => {
  const texts = await page.locator("button").allTextContents().catch(() => []);
  return texts.map(normalizeText).filter(Boolean);
};

(async () => {
  await fs.mkdir(evidenceDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.setDefaultNavigationTimeout(10000);
  attachPageListeners(page);

  try {
    beginTest("Manager Login Redirect");
    const managerUrl = await loginWithRetry(page, "manager@example.com");
    await waitForBodyText(page, "Executive Summary", 12000);
    let shot = await capture(page, "manager-dashboard.png");
    record({
      page: "Manager Dashboard",
      expected: "Manager login redirects to Manager Dashboard.",
      actual: managerUrl,
      passed: managerUrl.includes("/manager"),
      screenshot: shot,
      fixNeeded: managerUrl.includes("/manager") ? "" : "Check manager login redirect and /manager route protection.",
    });

    beginTest("Manager Sidebar");
    await gotoAndSettle(page, "/manager");
    await waitForBodyText(page, "Executive Summary", 12000);
    shot = await capture(page, "manager-sidebar.png");
    const sidebarText = normalizeText(await page.locator("aside").innerText({ timeout: 5000 }).catch(() => ""));
    const missingLinks = managerLinks.filter((link) => !sidebarText.includes(link));
    const unexpectedLinks = removedManagerLinks.filter((link) => sidebarText.includes(link));
    record({
      page: "Manager Sidebar",
      expected: "Sidebar shows executive monitoring links only.",
      actual: `Missing: ${missingLinks.join(", ") || "none"}; Unexpected: ${unexpectedLinks.join(", ") || "none"}`,
      passed: missingLinks.length === 0 && unexpectedLinks.length === 0,
      screenshot: shot,
      fixNeeded: missingLinks.length || unexpectedLinks.length ? "Adjust ManagerSidebar links." : "",
    });

    beginTest("Manager Dashboard KPI Cards");
    const kpiCheck = await expectTextSet(page, managerKpis);
    record({
      page: "Manager Dashboard KPI Cards",
      expected: "All executive KPI cards are visible.",
      actual: `Missing KPI labels: ${kpiCheck.missing.join(", ") || "none"}`,
      passed: kpiCheck.missing.length === 0,
      screenshot: "browser-evidence/manager-payroll/manager-dashboard.png",
      fixNeeded: kpiCheck.missing.length ? "Review ManagerDashboard KPI card labels/data." : "",
    });

    beginTest("Manager Reports");
    await gotoAndSettle(page, "/manager/reports");
    await waitForBodyText(page, "Sales Report", 15000);
    shot = await capture(page, "manager-reports.png");
    const reportCheck = await expectTextSet(page, reportTabs);
    record({
      page: "Manager Reports",
      expected: "Executive report tabs load.",
      actual: `Missing report tabs: ${reportCheck.missing.join(", ") || "none"}`,
      passed: reportCheck.missing.length === 0,
      screenshot: shot,
      fixNeeded: reportCheck.missing.length ? "Review ManagerReports TAB_CONFIG/rendering." : "",
    });

    beginTest("Manager Payroll Summary Read Only");
    await gotoAndSettle(page, "/manager/payroll");
    await waitForBodyText(page, "Payroll Management", 12000);
    shot = await capture(page, "manager-payroll-summary-view-only.png");
    const payrollText = await bodyText(page);
    const lowerPayrollText = payrollText.toLowerCase();
    const buttons = await buttonTexts(page);
    const forbiddenButtons = ["Compute Payroll", "Generate Payroll", "Release Payroll", "Approve Leave", "Reject Leave", "Edit Attendance"];
    const visibleForbidden = forbiddenButtons.filter((label) => buttons.some((button) => button.includes(label)));
    const hasFingerprintAction = payrollText.includes("Fingerprint Kiosk") || buttons.some((button) => button.includes("Check In") || button.includes("Check Out"));
    record({
      page: "Manager Payroll Summary",
      expected: "View Only badge is visible and operational payroll/HR buttons are absent.",
      actual: `View Only: ${lowerPayrollText.includes("view only")}; Forbidden buttons: ${visibleForbidden.join(", ") || "none"}; Fingerprint actions: ${hasFingerprintAction ? "present" : "absent"}`,
      passed: lowerPayrollText.includes("view only") && visibleForbidden.length === 0 && !hasFingerprintAction,
      screenshot: shot,
      fixNeeded: lowerPayrollText.includes("view only") && visibleForbidden.length === 0 && !hasFingerprintAction ? "" : "Review PayrollManagement role-based controls.",
    });

    beginTest("Payroll Manager Login Redirect");
    const payrollUrl = await loginWithRetry(page, "payroll@example.com");
    await waitForBodyText(page, "Payroll Management", 15000);
    shot = await capture(page, "payroll-manager-payroll-management.png");
    record({
      page: "Payroll Manager Default Route",
      expected: "Payroll Manager logs into /payroll.",
      actual: payrollUrl,
      passed: payrollUrl.includes("/payroll"),
      screenshot: shot,
      fixNeeded: payrollUrl.includes("/payroll") ? "" : "Check /payroll route mounting and login redirect.",
    });

    for (const spec of payrollPages) {
      beginTest(spec.name);
      await gotoAndSettle(page, spec.url);
      shot = await capture(page, spec.screenshot);
      const check = await expectTextSet(page, spec.expected);
      const text = await bodyText(page);
      const isBlank = text.length < 20;
      record({
        page: spec.name,
        expected: `${spec.expected.join(", ")} visible and no blank page.`,
        actual: `URL: ${page.url()}; Missing: ${check.missing.join(", ") || "none"}; Blank: ${isBlank ? "yes" : "no"}`,
        passed: check.missing.length === 0 && !isBlank,
        screenshot: shot,
        fixNeeded: check.missing.length || isBlank ? `Review route/page ${spec.url}.` : "",
      });
    }

    beginTest("Payroll Manager Operational Buttons");
    await gotoAndSettle(page, "/payroll");
    const payrollButtons = await buttonTexts(page);
    const expectedOps = ["Compute Payroll", "Manual Entry"];
    const missingOps = expectedOps.filter((label) => !payrollButtons.some((button) => button.includes(label)));
    record({
      page: "Payroll Manager Payroll Management",
      expected: "Operational payroll controls are available to Payroll/HR.",
      actual: `Missing operational buttons: ${missingOps.join(", ") || "none"}`,
      passed: missingOps.length === 0,
      screenshot: "browser-evidence/manager-payroll/payroll-manager-payroll-management.png",
      fixNeeded: missingOps.length ? "Review PayrollManagement canOperatePayroll controls." : "",
    });

    beginTest("Wrong Role - Manager Cannot Access Payroll Operations");
    await loginWithRetry(page, "manager@example.com");
    await gotoAndSettle(page, "/payroll/compute");
    shot = await capture(page, "wrong-role-manager-to-payroll.png");
    record({
      page: "Wrong Role: Manager to Payroll Computation",
      expected: "Manager is redirected away from /payroll/compute.",
      actual: page.url(),
      passed: !page.url().includes("/payroll/compute"),
      screenshot: shot,
      fixNeeded: page.url().includes("/payroll/compute") ? "Review ProtectedRoute payroll role map." : "",
    });

    beginTest("Wrong Role - Payroll Cannot Access Manager");
    await loginWithRetry(page, "payroll@example.com");
    await gotoAndSettle(page, "/manager");
    shot = await capture(page, "wrong-role-payroll-to-manager.png");
    record({
      page: "Wrong Role: Payroll to Manager",
      expected: "Payroll Manager is redirected away from /manager.",
      actual: page.url(),
      passed: !page.url().includes("/manager"),
      screenshot: shot,
      fixNeeded: page.url().includes("/manager") ? "Review ProtectedRoute manager role map." : "",
    });

    for (const candidate of otherRoleCandidates) {
      beginTest(`Wrong Role - ${candidate.role} Cannot Access Manager`);
      let actual = "";
      let passed = false;
      let fixNeeded = "";
      let screenshot = "";
      try {
        const url = await loginWithRetry(page, candidate.email);
        if (url.includes("/login")) {
          actual = `Login failed or remained on login page for ${candidate.email}.`;
          fixNeeded = "Demo credentials unavailable; cannot browser-confirm this role.";
        } else {
          await gotoAndSettle(page, "/manager");
          actual = page.url();
          passed = !page.url().includes("/manager");
        }
      } catch (error) {
        actual = `Login/test error for ${candidate.email}: ${error.message}`;
        fixNeeded = "Verify demo account exists and password is correct.";
      }
      screenshot = await capture(page, `wrong-role-${candidate.role.toLowerCase()}-to-manager.png`);
      record({
        page: `Wrong Role: ${candidate.role} to Manager`,
        expected: `${candidate.role} cannot access /manager.`,
        actual,
        passed,
        screenshot,
        fixNeeded,
      });
    }
  } finally {
    await browser.close();
    await fs.writeFile(
      path.join(evidenceDir, "browser-validation-results.json"),
      JSON.stringify(results, null, 2)
    );
  }
})().catch(async (error) => {
  results.fatalError = error.message;
  await fs.mkdir(evidenceDir, { recursive: true });
  await fs.writeFile(
    path.join(evidenceDir, "browser-validation-results.json"),
    JSON.stringify(results, null, 2)
  );
  console.error(error);
  process.exit(1);
});
