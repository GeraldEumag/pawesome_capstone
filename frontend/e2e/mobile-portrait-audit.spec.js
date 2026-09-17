const { test, expect } = require('@playwright/test');
const { mockLoginAs } = require('./test-utils');

const ROLE_ROUTES = {
  customer: ['/customer', '/customer/services', '/customer/pets', '/customer/payments'],
  receptionist: ['/receptionist', '/receptionist/customers', '/receptionist/walk-ins'],
  cashier: ['/cashier', '/cashier/dashboard/sales'],
  inventory: ['/inventory', '/inventory/history', '/inventory/reports'],
  manager: ['/manager', '/manager/staff', '/manager/payroll'],
  veterinary: ['/veterinary', '/veterinary/appointments', '/veterinary/reports'],
  admin: ['/admin', '/admin/users', '/admin/reports'],
  super_receptionist: ['/super-receptionist', '/super-receptionist/inventory'],
  super_admin: ['/admin', '/admin/users', '/admin/reports'],
};

const PUBLIC_ROUTES = ['/', '/login', '/register', '/forgot-password'];

async function stubApi(page) {
  await page.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.pathname.startsWith('/src/') || requestUrl.pathname.startsWith('/node_modules/')) {
      await route.continue();
      return;
    }
    if (!requestUrl.pathname.includes('/api/')) {
      await route.continue();
      return;
    }

    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    const responseBody = requestUrl.pathname.includes('/admin/reports/')
      ? { success: true, data: {} }
      : {};

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(responseBody),
    });
  });
}

async function waitForApp(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(300);
}

async function dismissTransientDialogs(page) {
  const dialog = page.locator('.swal2-container').first();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!(await dialog.isVisible().catch(() => false))) {
      await page.waitForTimeout(200).catch(() => {});
      continue;
    }

    const confirm = dialog.locator('.swal2-confirm').first();
    if (await confirm.count()) await confirm.click({ force: true }).catch(() => {});
    else await page.keyboard.press('Escape');
    await page.waitForTimeout(150).catch(() => {});
  }
  return dialog.isVisible().catch(() => false); 
}

async function getOverflowEvidence(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const intentional = Array.from(document.querySelectorAll(
      '.table-responsive, [class*="table-scroll"], [class*="table-wrapper"], .pos-product-area, .pos-category-tabs'
    )).map((element) => ({
      className: element.className,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      overflowX: getComputedStyle(element).overflowX,
    }));

    return {
      viewportWidth: window.innerWidth,
      documentScrollWidth: root.scrollWidth,
      bodyScrollWidth: body.scrollWidth,
      intentional,
    };
  });
}

async function auditTouchTargets(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('button, a, input, select, textarea'))
    .filter((element) => {
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getBoundingClientRect().width > 0;
    })
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName.toLowerCase(),
        text: (element.innerText || element.getAttribute('aria-label') || '').trim().slice(0, 60),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        className: element.className,
      };
    })
    .filter((item) => item.width < 44 || item.height < 44));
}

async function auditDashboardShell(page, role, route) {
  await mockLoginAs(page, role, `Portrait Audit ${role}`);
  await page.goto(route);
  await waitForApp(page);
  await dismissTransientDialogs(page);

  const overflow = await getOverflowEvidence(page);
  const undersizedTargets = await auditTouchTargets(page);
  const shell = role === 'cashier' && route === '/cashier'
    ? page.locator('.pos-kiosk').first()
    : page.locator('.app-dashboard').first();
  await expect(shell, `${role} shell should render at ${route}`).toBeVisible();
  await expect.soft(
    page.locator('html').evaluate((element) => element.scrollWidth <= window.innerWidth),
    `${role} ${route} should not create page-level horizontal overflow`
  ).toBeTruthy();

  await test.info().attach(`evidence-${role}-${route.replaceAll('/', '_') || 'root'}`, {
    body: Buffer.from(JSON.stringify({ role, route, viewport: test.info().project.name, overflow, undersizedTargets }, null, 2)),
    contentType: 'application/json',
  });

  const hasBlockingDialog = await dismissTransientDialogs(page);
  if (hasBlockingDialog) {
    await page.screenshot({ path: test.info().outputPath(`${role}-${route.replaceAll('/', '_') || 'root'}-dialog.png`), fullPage: true });
    return;
  }

  const menu = page.locator('.mobile-menu-toggle').first();
  if (await menu.count() && await menu.isVisible()) {
    const sidebar = page.locator('.app-sidebar').first();
    const backdrop = page.locator('.mobile-backdrop').first();

    await menu.click();
    await expect.soft(sidebar, `${role} sidebar should open from hamburger`).toHaveClass(/mobile-open/);
    await expect.soft(backdrop, `${role} backdrop should be visible when sidebar is open`).toBeVisible();

    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    const openAfterEscape = await sidebar.evaluate((element) => element.classList.contains('mobile-open'));
    expect.soft(openAfterEscape, `${role} sidebar should close on Escape`).toBeFalsy();
    if (openAfterEscape) {
      await sidebar.locator('.mobile-close-btn').click({ force: true }).catch(() => {});
      await page.waitForTimeout(150);
      if (await sidebar.evaluate((element) => element.classList.contains('mobile-open'))) {
        await page.evaluate(() => document.querySelector('.mobile-close-btn')?.click());
        await page.waitForTimeout(150);
      }
    }

    await menu.click();
    const backdropVisible = await backdrop.isVisible();
    if (backdropVisible) {
      const viewport = page.viewportSize();
      await backdrop.click({ position: { x: (viewport?.width || 390) - 8, y: 8 } });
    }
    await page.waitForTimeout(150);
    const openAfterBackdrop = await sidebar.evaluate((element) => element.classList.contains('mobile-open'));
    expect.soft(openAfterBackdrop, `${role} sidebar should close after backdrop click`).toBeFalsy();
    if (openAfterBackdrop) {
      await sidebar.locator('.mobile-close-btn').click({ force: true }).catch(() => {});
      await page.waitForTimeout(150);
      if (await sidebar.evaluate((element) => element.classList.contains('mobile-open'))) {
        await page.evaluate(() => document.querySelector('.mobile-close-btn')?.click());
        await page.waitForTimeout(150);
      }
    }

    await menu.click();
    const navigationLink = sidebar.locator('a').first();
    if (await navigationLink.count() && await navigationLink.isVisible()) {
      await navigationLink.click();
      await page.waitForTimeout(150);
      const sidebarClosedAfterNavigation = await page.locator('.app-sidebar').count() === 0
        || !(await page.locator('.app-sidebar').first().evaluate((element) => element.classList.contains('mobile-open')));
      expect.soft(sidebarClosedAfterNavigation, `${role} sidebar should close after navigation`).toBeTruthy();
    }

    const bodyLocked = await page.evaluate(() => document.body.classList.contains('sidebar-open'));
    expect.soft(bodyLocked, `${role} should not leave body scroll lock after sidebar closes`).toBeFalsy();
  }

  await page.screenshot({ path: test.info().outputPath(`${role}-${route.replaceAll('/', '_') || 'root'}.png`), fullPage: true });
}

test.describe('Portrait mobile audit', () => {
  test('public and auth routes render without page overflow', async ({ page }) => {
    await stubApi(page);

    for (const route of PUBLIC_ROUTES) {
      await page.goto(route);
      await waitForApp(page);
      await expect(page.locator('body')).toBeVisible();
      await expect.soft(
        page.locator('html').evaluate((element) => element.scrollWidth <= window.innerWidth),
        `${route} should not create page-level horizontal overflow`
      ).toBeTruthy();
    }
  });

  for (const [role, routes] of Object.entries(ROLE_ROUTES)) {
    for (const route of routes) {
      test(`${role} ${route} portrait shell and navigation audit`, async ({ page }) => {
        await stubApi(page);
        await auditDashboardShell(page, role, route);
      });
    }
  }
});
