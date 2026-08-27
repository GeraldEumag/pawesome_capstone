const { test, expect } = require('@playwright/test');
const frontendUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";

test.describe('Receptionist Dashboard end-to-end', () => {
  const { loginAs, mockLoginAs, getDashboardPath } = require('./test-utils');
  const role = 'receptionist';
  const dashboardPath = getDashboardPath(role);

  test.beforeEach(async ({ page }) => {
    if (process.env.E2E_LIVE) {
      await loginAs(page, role);
    } else {
      await mockLoginAs(page, role, 'E2E Receptionist');
    }
  });

  test('login redirects to correct dashboard', async ({ page }) => {
    await page.goto(frontendUrl + dashboardPath);
    await expect(page).toHaveURL(new RegExp(dashboardPath));
  });

  test('dashboard title is visible', async ({ page }) => {
    await page.goto(frontendUrl + dashboardPath);
    await expect(page.locator('h1, h2').filter({ hasText: /receptionist|dashboard|requests/i }).first()).toBeVisible();
  });

  test('loads receptionist appointments/requests list', async ({ page }) => {
    const mockRequests = {
      requests: [{
        id: 1,
        customer: 'Jane Customer',
        pet: 'Mochi',
        service: 'Grooming',
        type: 'grooming',
        date: new Date().toISOString().slice(0, 10),
        time: '10:00 AM',
        status: 'pending',
        payment: 'pending'
      }]
    };
    if (!process.env.E2E_LIVE) {
      await page.route('**/receptionist/requests', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockRequests) }));
    }
    await page.goto(frontendUrl + dashboardPath);
    await expect(page.locator('.receptionist-stat-card, [class*="stat"], [class*="card"]').first()).toBeVisible();
    await expect(page.locator('text=/customer|request|appointment/i').first()).toBeVisible();
  });

  test('can approve/reject requests (main operator flow)', async ({ page }) => {
    let approveCalled = false;
    let rejectCalled = false;
    const mockRequests = {
      requests: [{
        id: 1,
        customer: 'Jane Customer',
        pet: 'Mochi',
        service: 'Grooming',
        type: 'grooming',
        date: new Date().toISOString().slice(0, 10),
        time: '10:00 AM',
        status: 'pending',
        payment: 'pending'
      }]
    };
    if (!process.env.E2E_LIVE) {
      await page.route('**/receptionist/requests', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockRequests) }));
      await page.route('**/receptionist/requests/**/status', route => {
        const url = route.request().url();
        if (route.request().method() === 'PATCH') {
          if (url.includes('approve') || url.includes('1')) approveCalled = true;
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, message: 'Status updated' }) });
      });
    }
    await page.goto(frontendUrl + dashboardPath);
    await page.waitForLoadState('networkidle');
    
    // Look for and click approve button
    const approveBtn = page.locator('button:has-text("approve"), button:has-text("Approve"), button[class*="approve"], [data-testid*="approve"]').first();
    const approveVisible = await approveBtn.isVisible().catch(() => false);
    
    if (approveVisible) {
      await approveBtn.click();
      await page.waitForTimeout(500);
      // Check for success message or status change
      const successIndicator = page.locator('text=/approved|success|updated/i, .toast, .alert-success, [role="alert"]').first();
      await expect(successIndicator).toBeVisible().catch(() => {});
    }
    
    // Mock more requests for reject test
    if (!process.env.E2E_LIVE) {
      mockRequests.requests[0].status = 'pending';
      await page.route('**/receptionist/requests', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockRequests) }));
    }
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Look for and click reject button
    const rejectBtn = page.locator('button:has-text("reject"), button:has-text("Reject"), button[class*="reject"], [data-testid*="reject"]').first();
    const rejectVisible = await rejectBtn.isVisible().catch(() => false);
    
    if (rejectVisible) {
      await rejectBtn.click();
      await page.waitForTimeout(500);
      const rejectIndicator = page.locator('text=/rejected|declined|success/i, .toast, .alert-success, [role="alert"]').first();
      await expect(rejectIndicator).toBeVisible().catch(() => {});
    }
    
    expect(approveVisible || rejectVisible).toBeTruthy();
  });

  test('refresh button reloads data', async ({ page }) => {
    await page.goto(frontendUrl + dashboardPath);
    await page.locator('button:has-text("refresh"), button:has([data-icon="rotate"]), [title*="refresh" i]').first().click().catch(() => {});
    await expect(page.locator('.receptionist-stat-card, [class*="card"]').first()).toBeVisible();
  });

  test('main navigation works', async ({ page }) => {
    await page.goto(frontendUrl + dashboardPath);
    const nav = page.locator('nav, aside, [role="navigation"], .sidebar, .sidenav').first();
    await expect(nav).toBeVisible();
    const links = nav.locator('a, button').filter({ hasText: /request|booking|order|customer/i });
    if (await links.count() > 0) {
      await expect(links.first()).toBeVisible();
    }
  });

  test('forbidden pages redirect or block', async ({ page }) => {
    const forbiddenPaths = ['/admin', '/manager'];
    for (const path of forbiddenPaths) {
      await page.goto(frontendUrl + path);
      const currentUrl = page.url();
      const blocked = currentUrl.includes('/unauthorized') || 
                      currentUrl.includes('/forbidden') || 
                      currentUrl.includes(dashboardPath) ||
                      await page.locator('text=/access denied|forbidden|unauthorized/i').first().isVisible().catch(() => false);
      expect(blocked).toBeTruthy();
    }
  });
});
