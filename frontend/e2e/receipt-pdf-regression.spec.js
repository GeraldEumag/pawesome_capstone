const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const { mockLoginAs } = require('./test-utils');
const frontendUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';

test('shared receipt PDF keeps thermal width and paginates long item lists', async ({ page }) => {
  await page.goto(frontendUrl);
  const pdf = await page.evaluate(async () => {
    const { createReceiptPdf } = await import('/src/utils/receiptPdf.js');
    const { doc, filename } = createReceiptPdf({
      title: 'Sales Invoice',
      receiptNumber: 'ORDER/42',
      date: 'Oct 12, 2026 10:30 AM',
      customer: 'Sample Customer',
      paymentMethod: 'Cash',
      paymentStatus: 'paid',
      items: Array.from({ length: 32 }, (_, index) => ({
        name: `Long item name ${index + 1} with a wrapping description for thermal receipt output`,
        quantity: 2,
        unitPrice: 125,
        total: 250,
      })),
      subtotal: 8000,
      netAmount: 7142.86,
      vat: 857.14,
      total: 8000,
      amountReceived: 8500,
      change: 500,
    });
    const content = doc.internal.pages.slice(1).flat().join(' ');
    const minimum = createReceiptPdf({ receiptNumber: 'MIN-1', total: 0 });
    return {
      minimumPages: minimum.doc.internal.getNumberOfPages(),
      minimumWidth: minimum.doc.internal.pageSize.getWidth(),
      width: doc.internal.pageSize.getWidth(),
      height: doc.internal.pageSize.getHeight(),
      pages: doc.internal.getNumberOfPages(),
      filename,
      signature: doc.output().slice(0, 4),
      hasCustomer: content.includes('Sample Customer'),
      hasTotal: content.includes('TOTAL'),
      hasLastItem: content.includes('Long item name 32'),
      hasNetAmount: content.includes('Net') && content.includes('ex-VAT'),
      hasVat: content.includes('VAT 12%'),
      hasChange: content.includes('Change'),
    };
  });

  expect(pdf.minimumWidth).toBeCloseTo(58, 4);
  expect(pdf.minimumPages).toBe(1);
  expect(pdf.width).toBeCloseTo(58, 4);
  expect(pdf.height).toBeCloseTo(200, 4);
  expect(pdf.pages).toBeGreaterThan(1);
  expect(pdf.filename).toBe('receipt-ORDER-42.pdf');
  expect(pdf.signature).toBe('%PDF');
  expect(pdf.hasCustomer).toBe(true);
  expect(pdf.hasTotal).toBe(true);
  expect(pdf.hasLastItem).toBe(true);
  expect(pdf.hasNetAmount).toBe(true);
  expect(pdf.hasVat).toBe(true);
  expect(pdf.hasChange).toBe(true);
});

test('veterinary receipt downloads a valid 58mm PDF', async ({ page }) => {
  await mockLoginAs(page, 'veterinary', 'Receipt PDF Vet');
  await page.route('**/api/veterinary/receipt/42', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      receipt: {
        id: 42,
        receipt_number: 'VET-42',
        date: '2026-10-12T10:30:00.000Z',
        paid_date: '2026-10-12T10:30:00.000Z',
        service_name: 'Wellness Examination',
        vet_name: 'Alex Rivera',
        pet_name: 'Mochi',
        customer_name: 'Taylor Santos',
        amount: 1500,
        subtotal: 1500,
        net_amount: 1339.29,
        vat_amount: 160.71,
        total: 1500,
        status: 'paid',
        payment_method: 'cash',
        verified_by: 'Jordan Lee',
        reference_number: 'REF-000042',
        notes: 'Annual checkup',
        additional_services: [{ name: 'Nail trim', cost: 250 }],
      },
    }),
  }));

  await page.goto(`${frontendUrl}/veterinary/receipt?id=42`);
  await expect(page.locator('.vr-paper')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^receipt-VET-42\.pdf$/);
  const bytes = await fs.readFile(await download.path());
  expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
  expect(bytes.length).toBeGreaterThan(1000);
});

test('customer payment receipt exposes a PDF download while preserving print', async ({ page }) => {
  await mockLoginAs(page, 'customer', 'Receipt PDF Customer');
  await page.route('**/api/customer/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith('/customer/my-requests')
      || path.endsWith('/customer/store/orders')
      || path.endsWith('/customer/boarding-requests')
      ? []
      : path.endsWith('/customer/billing')
        ? { invoices: [] }
        : path.endsWith('/customer/payments/history')
          ? { data: [{
            id: 91,
            payment_source: 'boarding',
            type: 'boarding',
            receipt_number: 'BOARD-91',
            amount: 1800,
            total_amount: 1800,
            payment_status: 'paid',
            status: 'paid',
            payment_method: 'cash',
            paid_at: '2026-10-12T10:30:00.000Z',
            customer_name: 'Receipt PDF Customer',
            pet_name: 'Mochi',
          }] }
          : {};
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });

  await page.goto(`${frontendUrl}/customer/payments`);
  await expect(page.getByRole('button', { name: 'PDF', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Print BOARD-91/ })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^receipt-BOARD-91\.pdf$/);
  const bytes = await fs.readFile(await download.path());
  expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
});
