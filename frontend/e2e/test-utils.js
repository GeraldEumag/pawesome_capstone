// Helper utilities for E2E tests
const frontendUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';

// Default credentials for test accounts (matching the live dev/prototype database)
const DEFAULT_CREDENTIALS = {
  admin:        { email: 'admin@example.com',      password: 'Password123!' },
  manager:      { email: 'manager@example.com',    password: 'password123' },
  veterinary:   { email: 'vet@example.com',        password: 'Password123!' },
  cashier:      { email: 'cashier@example.com',    password: 'password123' },
  inventory:    { email: 'inventory@example.com',  password: 'Password123!' },
  receptionist: { email: 'receptionist@example.com', password: 'Password123!' },
  customer:     { email: 'customer@example.com',   password: 'Password123!' },
};

// Dashboard URLs per role
const ROLE_DASHBOARDS = {
  admin: '/admin',
  manager: '/manager',
  veterinary: '/veterinary',
  cashier: '/cashier',
  inventory: '/inventory',
  receptionist: '/receptionist',
  customer: '/customer',
};

// One real login per role per worker. The backend throttles /auth/login to
// 5 requests/minute per account+IP, so re-authenticating in every beforeEach
// produces 429s mid-suite. Cached credentials are still injected per test,
// keeping browser-context isolation.
const tokenCache = new Map();

/**
 * Login as a specific role using live backend
 * Uses env vars: E2E_{ROLE}_EMAIL and E2E_{ROLE}_PASSWORD
 * Falls back to default credentials from E2ESeeder
 */
async function loginAs(page, role = 'admin') {
  const roleUpper = role.toUpperCase();
  const defaults = DEFAULT_CREDENTIALS[role] || DEFAULT_CREDENTIALS.admin;
  
  const email = process.env[`E2E_${roleUpper}_EMAIL`] || defaults.email;
  const password = process.env[`E2E_${roleUpper}_PASSWORD`] || defaults.password;
  const apiBase = process.env.VITE_API_BASE_URL || process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000/api';
  const expectedPath = ROLE_DASHBOARDS[role] || '/dashboard';

  const cacheKey = `${role}:${email}`;
  let data = tokenCache.get(cacheKey);

  if (!data) {
    const response = await page.request.post(`${apiBase}/auth/login`, {
      data: { login: email, password },
      headers: { Accept: 'application/json' },
    });

    if (!response.ok()) {
      throw new Error(`Login failed for ${role}: ${response.status()} ${await response.text()}`);
    }

    data = await response.json();
    tokenCache.set(cacheKey, data);
  }
  await page.addInitScript(({ token, user }) => {
    window.localStorage.setItem('token', token);
    window.localStorage.setItem('role', user.role);
    window.localStorage.setItem('name', user.name);
    window.localStorage.setItem('username', user.username || user.email);
    window.localStorage.setItem('email', user.email);
  }, { token: data.token, user: data.user });
  
  await page.goto(frontendUrl + expectedPath);
}

/**
 * API login for request-fixture use (no page). Shares the per-worker token
 * cache with loginAs so repeated spec-level logins never hit the
 * /auth/login 5/min throttle. Returns { token, user }.
 */
async function apiLogin(request, role = 'admin', { refresh = false } = {}) {
  const roleUpper = role.toUpperCase();
  const defaults = DEFAULT_CREDENTIALS[role] || DEFAULT_CREDENTIALS.admin;
  const email = process.env[`E2E_${roleUpper}_EMAIL`] || defaults.email;
  const password = process.env[`E2E_${roleUpper}_PASSWORD`] || defaults.password;
  const apiBase = process.env.E2E_API_URL || 'http://127.0.0.1:8000/api';

  const cacheKey = `${role}:${email}`;
  let data = refresh ? null : tokenCache.get(cacheKey);

  if (!data) {
    let response;
    for (let attempt = 0; attempt < 2; attempt++) {
      response = await request.post(`${apiBase}/auth/login`, {
        data: { login: email, email, password },
        headers: { Accept: 'application/json' },
      });
      if (response.status() !== 429) break;
      // Throttle window is 60s per account+IP; wait it out once.
      await new Promise((resolve) => setTimeout(resolve, 61000));
    }
    if (!response.ok()) {
      throw new Error(`Login failed for ${role}: ${response.status()} ${await response.text()}`);
    }
    data = await response.json();
    tokenCache.set(cacheKey, data);
  }

  return { token: data.token || data.access_token, user: data.user };
}

/**
 * Catch-all API mock for mock-mode tests: any endpoint not intercepted by a
 * test-specific page.route() gets a benign 200 {} instead of hitting the real
 * backend — where the fake TEST_API_TOKEN would 401, clear auth, and redirect
 * to /login mid-test. Registered before test-specific routes, and Playwright
 * matches the most recently registered route first, so specific mocks win.
 */
async function mockApiFallback(page) {
  // Match only real API calls: the backend origin, or root-relative /api/*
  // paths. A bare glob like '**/api/**' also matches module URLs such as
  // /src/api/client.js, which would be fulfilled as JSON and break the app.
  const apiBase = process.env.E2E_API_URL || 'http://127.0.0.1:8000/api';
  const apiOrigin = new URL(apiBase).origin;
  await page.route(
    (url) => url.origin === apiOrigin || url.pathname.startsWith('/api/'),
    (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  );
}

/**
 * Mock login for isolated tests (no backend required)
 */
async function mockLoginAs(page, role, name = `E2E ${role}`) {
  await mockApiFallback(page);
  await page.addInitScript(({ role, name }) => {
    window.localStorage.setItem('token', 'TEST_API_TOKEN');
    window.localStorage.setItem('name', name);
    window.localStorage.setItem('role', role);
  }, { role, name });
}

/**
 * Get expected dashboard path for a role
 */
function getDashboardPath(role) {
  return ROLE_DASHBOARDS[role] || '/dashboard';
}

/**
 * Check if user is on correct dashboard after login
 */
async function expectDashboardRedirect(page, role) {
  const expectedPath = getDashboardPath(role);
  await page.waitForURL(`**${expectedPath}`, { timeout: 10000 });
}

module.exports = {
  loginAs,
  apiLogin,
  mockLoginAs,
  getDashboardPath,
  expectDashboardRedirect,
  DEFAULT_CREDENTIALS,
  ROLE_DASHBOARDS
};
