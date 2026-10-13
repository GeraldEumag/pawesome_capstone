const { test, expect } = require('@playwright/test');
const { mockLoginAs } = require('./test-utils');

const reportFixtures = {
  '/admin/reports/executive': {
    success: true,
    data: {
      summary: { total_revenue: 2500, today_revenue: 2500, yesterday_revenue: 2000, total_orders: 8, today_orders: 8, total_customers: 12, pending_approvals: 1, low_stock_items: 2 },
      status_breakdown: { completed: { count: 7, revenue: 2200 }, pending: { count: 1, revenue: 300 } },
      revenue_trend: [
        { date: 'Oct 01', full_date: '2026-10-01', revenue: 500, orders: 2 },
        { date: 'Oct 02', full_date: '2026-10-02', revenue: 900, orders: 3 },
        { date: 'Oct 03', full_date: '2026-10-03', revenue: 1100, orders: 3 },
      ],
      anomalies: [],
      predictions: { next_month_revenue: 2800 },
      comparisons: { previous_revenue: 2000, previous_orders: 6, yoy_growth: 4, period_days: 3 },
    },
  },
  '/admin/reports/staff-performance': {
    success: true,
    data: { staffData: [
      { id: 1, name: 'Alex Rivera', role: 'veterinary', revenue: 1400, appointments: 4, attendanceRate: 92 },
      { id: 2, name: 'Jamie Santos', role: 'cashier', revenue: 800, appointments: 2, attendanceRate: 100 },
    ] },
  },
  '/admin/reports/customers/segments': {
    success: true,
    data: {
      customers: [{ id: 1, name: 'Taylor', total_spent: 52000, orders: 12 }],
      segments: {
        vip: { count: 1, revenue: 52000, avg_order: 4333 },
        loyal: { count: 2, revenue: 21000, avg_order: 3500 },
        atRisk: { count: 1, revenue: 11000, recoverable: 3300 },
        lost: { count: 1, revenue: 2000 },
        new: { count: 2, revenue: 800 },
      },
    },
  },
  '/admin/reports/comparison': {
    success: true,
    data: {
      comparisonData: {
        revenue: { current: 2500, previous: 1800 },
        orders: { current: 8, previous: 6 },
        customers: { current: 7, previous: 5 },
        avgOrderValue: { current: 312.5, previous: 300 },
      },
      dailyTrend: [
        { day: 'Oct 01', current: 500, previous: 300 },
        { day: 'Oct 02', current: 900, previous: 700 },
        { day: 'Oct 03', current: 1100, previous: 800 },
      ],
      categoryBreakdown: [
        { category: 'Store Orders', current: 1500, previous: 1000 },
        { category: 'Veterinary Services', current: 1000, previous: 800 },
      ],
    },
  },
  '/admin/reports/sales-analysis': {
    success: true,
    data: {
      summary: { total_revenue: 2500, total_orders: 8, avg_order_value: 312.5, date_range: { from: '2026-10-01', to: '2026-10-03' } },
      dailyData: [
        { date: 'Oct 01', revenue: 500, orders: 2 },
        { date: 'Oct 02', revenue: 900, orders: 3 },
        { date: 'Oct 03', revenue: 1100, orders: 3 },
      ],
      categoryData: [
        { name: 'Store Orders', value: 1500, orders: 5, growth: 12 },
        { name: 'Veterinary Services', value: 1000, orders: 3, growth: 8 },
      ],
      hourlyData: [{ hour: '8AM', sales: 700 }, { hour: '10AM', sales: 1800 }],
    },
  },
  '/admin/reports/predictive': {
    success: true,
    data: {
      historical_data: [
        { date: '2026-09-29', actual: 600 },
        { date: '2026-09-30', actual: 700 },
        { date: '2026-10-01', actual: 900 },
      ],
      forecast_data: [
        { date: '2026-10-02', predicted: 950, upper_bound: 1100, lower_bound: 800 },
        { date: '2026-10-03', predicted: 1050, upper_bound: 1200, lower_bound: 900 },
      ],
      recommendations: [],
      forecast_total: 2000,
      trend_pct: 4,
      seasonality: { weekend_boost_pct: 2 },
    },
  },
  '/admin/reports/alerts': {
    success: true,
    data: { alerts: [], history: [] },
  },
  '/admin/reports/inventory-optimization': {
    success: true,
    data: {
      abcData: [
        { category: 'A - High Value', items: 2, value: 1800, percentage: 70, color: '#10b981' },
        { category: 'B - Medium Value', items: 1, value: 500, percentage: 20, color: '#3b82f6' },
        { category: 'C - Low Value', items: 1, value: 250, percentage: 10, color: '#94a3b8' },
      ],
      stockData: [
        { category: 'Food & Treats', items: 3, units: 14, value: 1800 },
        { category: 'Health Supplies', items: 1, units: 4, value: 750 },
      ],
      reorderRecommendations: [],
      lowStockCount: 1,
    },
  },
};

const chartTabs = [
  { label: 'Executive Dashboard', heading: 'Revenue Trend', charts: 3 },
  { label: 'Staff Performance', heading: 'Revenue by Staff', charts: 2 },
  { label: 'Customer Segments', heading: 'Customer Distribution', charts: 2 },
  { label: 'Period Comparison', heading: 'Daily Revenue Comparison', charts: 2 },
  { label: 'Sales Analysis', heading: 'Daily Revenue', charts: 3 },
  { label: 'Predictive Analytics', heading: 'Revenue Forecast', charts: 1 },
  { label: 'Inventory Optimization', heading: 'ABC Analysis', charts: 2 },
];

async function stubReports(page) {
  await page.route('**/api/admin/reports/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    const body = reportFixtures[path] || { success: true, data: {} };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

test('Admin report charts render without overflow from phone to desktop widths', async ({ page }) => {
  test.setTimeout(180000);
  await mockLoginAs(page, 'admin', 'Report Charts Admin');
  await stubReports(page);

  const consoleErrors = [];
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  for (const width of [320, 390, 768, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/admin/reports', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.admin-reports-nav')).toBeVisible();

    for (const tab of chartTabs) {
      await page.getByRole('button', { name: tab.label, exact: true }).click();
      const reportContent = page.locator('.advanced-report-content');
      await expect(reportContent.getByText(tab.heading, { exact: true })).toBeVisible({ timeout: 15000 });
      const chartPanels = page.locator('.ure-chart-container');
      await expect(chartPanels).toHaveCount(tab.charts, { timeout: 15000 });
      await expect.poll(() => page.locator('.ure-chart-container .recharts-wrapper').evaluateAll((charts) =>
        charts.length > 0 && charts.every((chart) => chart.getBoundingClientRect().width > 0)
      ), { timeout: 10000 }).toBe(true);

      const geometry = await page.evaluate(() => {
        const panels = Array.from(document.querySelectorAll('.ure-chart-container'));
        return {
          viewportWidth: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          charts: panels.map((panel) => {
            const body = panel.querySelector('.ure-chart-body');
            const chart = body?.querySelector('.recharts-wrapper');
            const bounds = chart?.getBoundingClientRect();
            const bodyBounds = body?.getBoundingClientRect();
            return {
              width: bounds?.width || 0,
              height: bounds?.height || 0,
              right: bounds?.right || 0,
              bodyRight: bodyBounds?.right || 0,
            };
          }),
        };
      });

      expect(geometry.documentWidth, `${tab.label} at ${width}px should not overflow`).toBeLessThanOrEqual(width + 1);
      for (const chart of geometry.charts) {
        expect(chart.width, `${tab.label} at ${width}px chart width`).toBeGreaterThan(0);
        expect(chart.height, `${tab.label} at ${width}px chart height`).toBeGreaterThan(100);
        expect(chart.right, `${tab.label} at ${width}px chart should fit its panel`).toBeLessThanOrEqual(chart.bodyRight + 1);
      }
    }
  }

  expect(consoleErrors).toEqual([]);
});

test('Admin report data loading uses the shared accessible skeleton', async ({ page }) => {
  await mockLoginAs(page, 'admin', 'Report Loading Admin');
  await page.route('**/api/admin/reports/executive*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(reportFixtures['/admin/reports/executive']),
    });
  });

  await page.goto('/admin/reports', { waitUntil: 'domcontentloaded' });
  const skeleton = page.locator('.report-skeleton').first();
  await expect(skeleton).toBeVisible();
  await expect(skeleton).toHaveAttribute('role', 'status');
  await expect(skeleton).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('.exec-charts-grid')).toBeVisible({ timeout: 15000 });
});

test('zero-series report responses render explicit chart empty states', async ({ page }) => {
  await mockLoginAs(page, 'admin', 'Empty Report Admin');
  const emptyResponses = {
    '/admin/reports/executive': {
      success: true,
      data: {
        summary: {},
        status_breakdown: { completed: { count: 0, revenue: 0 } },
        revenue_trend: [{ date: 'Oct 12', revenue: 0, orders: 0 }],
        anomalies: [],
        predictions: {},
        comparisons: {},
      },
    },
    '/admin/reports/sales-analysis': {
      success: true,
      data: {
        summary: {},
        dailyData: [{ date: 'Oct 12', revenue: 0, orders: 0 }],
        categoryData: [],
        hourlyData: [{ hour: '8AM', sales: 0 }],
      },
    },
    '/admin/reports/inventory-optimization': {
      success: true,
      data: {
        abcData: [{ category: 'A', value: 0 }, { category: 'B', value: 0 }, { category: 'C', value: 0 }],
        stockData: [{ category: 'Food', value: 0, units: 0, items: 1 }],
        reorderRecommendations: [],
        lowStockCount: 0,
      },
    },
  };
  await page.route('**/api/admin/reports/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(emptyResponses[path] || { success: true, data: {} }),
    });
  });

  await page.goto('/admin/reports', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('No trend data available for this period')).toBeVisible();
  await expect(page.getByText('No order data available for this period')).toBeVisible();

  await page.getByRole('button', { name: 'Sales Analysis', exact: true }).click();
  await expect(page.getByText('No sales data for this range')).toBeVisible();
  await expect(page.getByText('No category data for this range')).toBeVisible();
  await expect(page.getByText('No hourly data for this range')).toBeVisible();

  await page.getByRole('button', { name: 'Inventory Optimization', exact: true }).click();
  await expect(page.getByText('No inventory value available for ABC analysis')).toBeVisible();
  await expect(page.getByText('No category stock data available')).toBeVisible();
});
