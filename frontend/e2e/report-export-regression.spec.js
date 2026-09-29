const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const XLSX = require('xlsx');
const frontendUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';
const { mockLoginAs, getDashboardPath } = require('./test-utils');
const today = new Date();
const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const todayLabel = today.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });

const executiveResponse = {
  success: true,
  data: {
    summary: {
      total_revenue: 4567.89,
      today_revenue: 850.5,
      yesterday_revenue: 700,
      total_orders: 12,
      today_orders: 3,
      active_customers: 8,
      total_customers: 40,
      pending_approvals: 2,
      low_stock_items: 1,
      critical_stock_items: 0,
    },
    status_breakdown: {
      completed: { count: 10, revenue: 4000 },
      pending: { count: 2, revenue: 567.89 },
    },
    revenue_trend: [
      { date: todayLabel, full_date: todayDate, revenue: 4567.89, orders: 12 },
    ],
    anomalies: [{ title: 'Pending Approvals', message: '2 item(s) await review', severity: 'info' }],
    predictions: { next_month_revenue: 5200 },
    comparisons: { previous_revenue: 4200, previous_orders: 10, yoy_growth: 8.5, period_days: 1 },
  },
};

async function signIn(page, role, name) {
  await mockLoginAs(page, role, name);
}

async function downloadFromExecutiveMenu(page, format) {
  const downloadEvent = page.waitForEvent('download');
  await page.locator('.export-button').click();
  await page.getByRole('button', { name: `Export as ${format}` }).click();
  return downloadEvent;
}

test.describe('Report export regression coverage', () => {
  test('Executive Dashboard exports one complete file in each selected format', async ({ page }) => {
    await signIn(page, 'admin', 'E2E Admin');
    await page.route('**/api/admin/reports/executive*', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(executiveResponse),
    }));
    await page.goto(`${frontendUrl}${getDashboardPath('admin')}/reports`);
    await expect(page.locator('.exec-kpi-grid')).toBeVisible();

    const downloads = [];
    page.on('download', (download) => downloads.push(download));

    const csvDownload = await downloadFromExecutiveMenu(page, 'CSV');
    expect(csvDownload.suggestedFilename()).toMatch(/\.csv$/i);
    const csv = await fs.readFile(await csvDownload.path(), 'utf8');
    expect(csv).toContain('Executive Dashboard Report');
    expect(csv).toContain('Reporting period:');
    expect(csv).toContain('Revenue for selected period');
    expect(csv).toContain('4567.89');
    expect(csv).toContain('Revenue Trend');
    expect(csv).toContain('Order Status');
    expect(csv).toContain('Pending Approvals');

    const excelDownload = await downloadFromExecutiveMenu(page, 'Excel');
    expect(excelDownload.suggestedFilename()).toMatch(/\.xlsx$/i);
    const workbook = XLSX.readFile(await excelDownload.path(), { cellDates: true });
    expect(workbook.SheetNames).toEqual(['Summary', 'Revenue Trend', 'Order Status', 'Alerts & Forecast']);
    const summaryRows = XLSX.utils.sheet_to_json(workbook.Sheets.Summary, { header: 1, raw: true });
    const summaryHeaderIndex = summaryRows.findIndex((row) => row[0] === 'Metric' && row[1] === 'Value');
    expect(summaryRows[summaryHeaderIndex + 1]).toEqual(['Revenue for selected period', 4567.89]);
    const trendRows = XLSX.utils.sheet_to_json(workbook.Sheets['Revenue Trend'], { header: 1, raw: true });
    const trendHeaderIndex = trendRows.findIndex((row) => row[0] === 'Date' && row[1] === 'Revenue');
    expect(trendRows[trendHeaderIndex + 1]).toEqual([todayDate, 4567.89, 12]);

    const pdfDownload = await downloadFromExecutiveMenu(page, 'PDF');
    expect(pdfDownload.suggestedFilename()).toMatch(/\.pdf$/i);
    const pdf = await fs.readFile(await pdfDownload.path());
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(1000);

    await page.waitForTimeout(150);
    expect(downloads).toHaveLength(3);
  });

  test('Monthly inventory audit shared CSV/Excel exports keep headers, valuation, and numeric cells', async ({ page }) => {
    await signIn(page, 'inventory', 'E2E Inventory');
    await page.route('**/api/inventory/dashboard*', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ total_items: 1, low_stock_items: 0, out_of_stock_items: 0 }),
    }));
    await page.route('**/api/inventory/monthly-audit*', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        audits: [{
          id: 41,
          inventory_item_id: 41,
          system_stock: 4,
          actual_stock: 2,
          variance: -2,
          status: 'discrepancy',
          reason: 'Counting Error',
          checked_by: 'E2E Auditor',
          unit_cost: 12,
          item: { id: 41, name: 'Test Kibble', sku: 'DOG-41', category: 'Food', brand: 'Pawesome', cost: 12 },
        }],
      }),
    }));
    await page.goto(`${frontendUrl}${getDashboardPath('inventory')}/monthly-audit`);
    await expect(page.getByRole('button', { name: 'Export CSV' })).toBeVisible();

    const csvEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    const csvDownload = await csvEvent;
    const csv = await fs.readFile(await csvDownload.path(), 'utf8');
    expect(csv).toContain('Estimated Variance Value');
    expect(csv).toContain('Test Kibble');
    expect(csv).toContain('Counting Error');
    expect(csv).toContain('-24');

    const excelEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export Excel' }).click();
    const excelDownload = await excelEvent;
    const workbook = XLSX.readFile(await excelDownload.path(), { cellDates: true });
    expect(workbook.SheetNames).toContain('Monthly Audit');
    const worksheet = workbook.Sheets['Monthly Audit'];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true });
    const headersIndex = rows.findIndex((row) => row.includes('Estimated Variance Value'));
    expect(rows[headersIndex + 1][0]).toBe('Test Kibble');
    expect(rows[headersIndex + 1][4]).toBe(4);
    expect(rows[headersIndex + 1][8]).toBe(-24);
  });

  test('Government remittance CSV escapes data and uses the selected agency identifier', async ({ page }) => {
    await signIn(page, 'manager', 'E2E Manager');
    await page.route('**/api/manager/reports/remittance*', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [{
          employee_name: 'Ana, Santos',
          sss_no: '01-2345678-9',
          philhealth_no: 'PH-0001',
          pagibig_no: 'PAG-0001',
          base_salary: 25000,
          employee_share: 1250,
          employer_share: 1250,
          total: 2500,
        }],
        totals: { employee_total: 1250, employer_total: 1250, grand_total: 2500 },
      }),
    }));
    await page.goto(`${frontendUrl}${getDashboardPath('manager')}/remittance-reports`);
    await page.getByRole('button', { name: 'Generate Report' }).click();
    await expect(page.getByText('Ana, Santos')).toBeVisible();

    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    const download = await downloadEvent;
    const csv = await fs.readFile(await download.path(), 'utf8');
    expect(csv).toContain('SSS No.');
    expect(csv).toContain('"Ana, Santos"');
    expect(csv).toContain('01-2345678-9');
    expect(csv).toContain('Reporting period:');
  });
});
