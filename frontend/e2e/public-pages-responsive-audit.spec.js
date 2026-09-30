const { test, expect } = require('@playwright/test');

const VIEWPORTS = [
  { name: 'phone-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'tablet-landscape-1024', width: 1024, height: 768 },
  { name: 'laptop-1366', width: 1366, height: 900 },
  { name: 'macbook-1512', width: 1512, height: 982 },
  { name: 'desktop-1920', width: 1920, height: 1080 },
];

const PUBLIC_ROUTES = [
  { path: '/',                root: '.landing-container', landmark: '.landing-header' },
  { path: '/login',           root: '.login-page',        landmark: '.login-card' },
  { path: '/register',        root: '.register-page',     landmark: '.register-card' },
  { path: '/forgot-password', root: '.login-page',        landmark: '.login-card' },
  { path: '/verify-email',    root: '.register-page',     landmark: '.register-card' },
];

async function stubPublicApi(page) {
  const apiBase = process.env.E2E_API_URL || 'http://127.0.0.1:8000/api';
  const apiOrigin = new URL(apiBase).origin;
  await page.route(
    (url) => url.origin === apiOrigin || url.pathname.startsWith('/api/'),
    async (route) => {
      const url = new URL(route.request().url());
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, body: '' });
        return;
      }

      let body = { success: true, data: {} };
      if (url.pathname === '/api/settings/public') {
        body = { theme_color: 'cream-white' };
      } else if (url.pathname === '/api/landing-page') {
        // Empty content → page renders built-in fallbacks
        body = { success: true, data: {} };
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    }
  );
}

async function expectNoHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(
    dimensions.documentWidth,
    `${label} should not overflow horizontally: ${JSON.stringify(dimensions)}`
  ).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
}

test('public pages render without horizontal overflow across all viewports', async ({ page }) => {
  test.setTimeout(180000);
  await stubPublicApi(page);

  for (const route of PUBLIC_ROUTES) {
    await page.goto(route.path, { waitUntil: 'domcontentloaded' });
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await expect(
        page.locator(route.root),
        `${route.path} at ${viewport.name} should render`
      ).toBeVisible({ timeout: 10000 });
      await expect(page.locator(route.landmark).first()).toBeVisible();
      await expectNoHorizontalOverflow(page, `${route.path} at ${viewport.name}`);
    }
  }
});

test('landing header collapses to a working mobile drawer at phone width', async ({ page }) => {
  await stubPublicApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('.landing-hamburger')).toBeVisible();
  await page.locator('.landing-hamburger').click();
  const mobileNav = page.locator('.landing-mobile-nav');
  await expect(mobileNav).toHaveClass(/open/);
  await expect(mobileNav.getByRole('link', { name: 'Login' })).toBeVisible();
  await expect(mobileNav.getByRole('link', { name: 'Register' })).toBeVisible();
  await expectNoHorizontalOverflow(page, 'landing mobile nav at 390px');

  await page.locator('.landing-mobile-nav-close').click();
  await expect(mobileNav).not.toHaveClass(/open/);
});

test('auth cards remain usable at 390px: inputs and buttons are tappable', async ({ page }) => {
  await stubPublicApi(page);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.login-card')).toBeVisible({ timeout: 10000 });
  const loginBtn = page.locator('.login-btn');
  const btnBox = await loginBtn.boundingBox();
  expect(btnBox.height, 'login button should be tappable').toBeGreaterThanOrEqual(40);
  await expect(page.getByRole('link', { name: /forgot/i }).first()).toBeVisible();
  await expectNoHorizontalOverflow(page, '/login at 390px');

  await page.goto('/register', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.register-card')).toBeVisible({ timeout: 10000 });
  await expectNoHorizontalOverflow(page, '/register at 390px');

  await page.goto('/forgot-password', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.login-card')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.login-input')).toBeVisible();
  await expectNoHorizontalOverflow(page, '/forgot-password at 390px');
});
