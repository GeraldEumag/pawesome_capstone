const { test, expect } = require('@playwright/test');
const { mockLoginAs } = require('./test-utils');

const CUSTOMER_ROUTES = [
  '/customer',
  '/customer/services',
  '/customer/booking',
  '/customer/bookings',
  '/customer/requests',
  '/customer/pets',
  '/customer/hotel',
  '/customer/grooming',
  '/customer/vet',
  '/customer/medical-confinements',
  '/customer/profile',
  '/customer/history',
  '/customer/notifications',
  '/customer/payments',
  '/customer/reports',
  '/customer/reports/payments',
];

const VIEWPORTS = [
  { name: 'phone-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'tablet-landscape-1024', width: 1024, height: 768 },
  { name: 'laptop-1366', width: 1366, height: 900 },
  { name: 'macbook-1512', width: 1512, height: 982 },
  { name: 'desktop-1920', width: 1920, height: 1080 },
];

async function stubCustomerApi(page, { includeStoredOrder = false, includePayableRequest = false } = {}) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/')) {
      await route.continue();
      return;
    }

    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    let body = {};
    if (url.pathname === '/api/settings/public') {
      body = { theme_color: 'cream-white' };
    } else if (url.pathname === '/api/customer/store/orders') {
      body = {
        orders: includeStoredOrder
          ? [{ id: 77, order_number: 'CUS-77', status: 'approved', payment_status: 'unpaid', total_amount: 250 }]
          : [],
      };
    } else if (url.pathname === '/api/customer/my-requests') {
      body = {
        requests: includePayableRequest
          ? [{ id: 81, service_name: 'Grooming', request_type: 'grooming', pet_name: 'Milo', status: 'approved', payment_status: 'unpaid', request_date: '2026-10-28' }]
          : [],
      };
    } else if (url.pathname === '/api/customer/bookings') {
      const items = includePayableRequest
        ? [{ key: 'service_request-81', source: 'service_request', kind: 'grooming', id: 81, pet_name: 'Milo', title: 'Grooming', date: '2026-10-28', time: '10:00', check_in: null, check_out: null, workflow_stage: 'to_pay', status: 'approved', payment_status: 'unpaid', amount_due: 450, veterinarian: null, rejection_reason: null, actions: ['pay'], updated_at: null }]
        : [];
      body = { success: true, store_today: '2026-10-18', counts: { all: items.length, to_approve: 0, to_pay: items.length, on_going: 0, ready_to_pickup: 0, complete: 0, canceled: 0 }, items };
    } else if (url.pathname === '/api/customer/dashboard') {
      body = {
        total_pets: 2,
        pending_service_requests: 1,
        appointed_appointments: 1,
        payment_pending: 1,
        completed_services: 3,
        payment_paid: 2,
        unread_notifications: 1,
        loyalty_points: 240,
        member_status: 'Standard',
        active_bookings: 1,
        recent_pets: [
          { id: 1, name: 'Milo', species: 'Dog', breed: 'Shih Tzu', created_at: '2026-08-01' },
        ],
        recent_bookings: [
          { id: 1, pet_name: 'Milo', service_name: 'Grooming', status: 'awaiting_payment', scheduled_at: '2026-10-02' },
          { id: 2, pet_name: 'Milo', service_name: 'Veterinary', status: 'approved', scheduled_at: '2026-10-01' },
          { id: 3, pet_name: 'Milo', service_name: 'Hotel Boarding', status: 'completed', scheduled_at: '2026-09-28' },
          { id: 4, pet_name: 'Milo', service_name: 'Grooming', status: 'confirmed', scheduled_at: '2026-09-25' },
          { id: 5, pet_name: 'Milo', service_name: 'Veterinary', status: 'completed', scheduled_at: '2026-09-20' },
        ],
      };
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

async function mockGroomingBookingApi(page) {
  const createdRequests = [];
  const paymentProofPaths = [];

  await page.route('**/api/customer/pets*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ pets: [{ id: 17, name: 'Milo', species: 'Dog', breed: 'Mixed' }] }),
  }));
  await page.route('**/api/customer/services*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ services: [
      { id: 9, name: 'Bath and Brush', category: 'grooming', price: 500 },
      { id: 10, name: 'General Consultation', category: 'Veterinary', price: 700 },
    ] }),
  }));
  await page.route('**/api/customer/availability/veterinary*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ slots: [{ time: '10:00', label: '10:00 AM', available: true }] }),
  }));
  await page.route('**/api/customer/availability/grooming*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, available: true, slots: [{ time: '10:00', label: '10:00 AM', available: true }] }),
  }));
  await page.route('**/api/customer/requests**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (pathname.endsWith('/my-requests')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ requests: createdRequests }) });
      return;
    }

    if (pathname.endsWith('/payment-proof')) {
      paymentProofPaths.push(pathname);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Payment proof received.' }),
      });
      return;
    }

    if (request.method() === 'POST') {
      const payload = request.postDataJSON();
      const price = payload.service_name === 'General Consultation' ? 700 : 500;
      const created = {
        id: 101 + createdRequests.length,
        ...payload,
        request_type: payload.request_type || payload.service_type,
        status: 'pending',
        payment_status: 'unpaid',
        price,
        total_amount: price,
      };
      createdRequests.push(created);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Booking request submitted.', request: created }),
      });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ requests: createdRequests }) });
  });

  return { createdRequests, paymentProofPaths };
}

async function mockHotelBookingApi(page) {
  const bookings = [];
  const paymentProofPaths = [];
  await page.route('**/api/customer/pets*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ pets: [{ id: 17, name: 'Milo', species: 'Dog', breed: 'Mixed' }] }),
  }));
  await page.route('**/api/customer/boardings*', async (route) => {
    if (route.request().method() === 'POST') {
      const booking = {
        id: 202,
        pet_id: 17,
        pet_name: 'Milo',
        hotel_room: { id: 44, name: 'Standard Dog Room' },
        check_in: '2026-10-20',
        check_out: '2026-10-20',
        status: 'pending',
        payment_status: 'unpaid',
        total_amount: 850,
        vaccination_card: 'vaccination_cards/milo-card.png',
      };
      bookings.push(booking);
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ boarding: booking }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ boardings: bookings }) });
  });
  await page.route('**/api/boarding/rooms/available*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      rooms: [{ id: 44, room_name: 'Standard Dog Room', room_type: 'dog_standard', hotel_category: 'dog_hotel', daily_rate: 850, available: true, available_rooms: 1 }],
    }),
  }));
  await page.route('**/api/customer/boarding-requests/*/payment-proof', async (route) => {
    paymentProofPaths.push(new URL(route.request().url()).pathname);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'Payment proof submitted.' }) });
  });
  return { bookings, paymentProofPaths };
}

async function fillGroomingBooking(page) {
  await page.locator('select[name="pet_id"]').selectOption('17');
  await page.locator('select[name="service_name"]').selectOption('Bath and Brush');

  const dateInput = page.locator('.grooming-form .paws-datepicker-wrap input').first();
  const date = new Date();
  date.setDate(date.getDate() + 7);
  const displayedMonth = new Date();
  await dateInput.click();
  const monthDelta = (date.getFullYear() - displayedMonth.getFullYear()) * 12 + date.getMonth() - displayedMonth.getMonth();
  for (let month = 0; month < monthDelta; month += 1) {
    await page.locator('.react-datepicker__navigation--next').first().click();
  }
  await page.locator('.react-datepicker__day:not(.react-datepicker__day--outside-month)')
    .filter({ hasText: new RegExp(`^${date.getDate()}$`) })
    .first()
    .click();

  const timeSelect = page.locator('select[name="request_time"]');
  await expect(timeSelect).toBeEnabled();
  await timeSelect.selectOption('10:00');
  await page.getByRole('button', { name: 'Submit Request' }).click();
  await expect(page.locator('.brm-modal')).toBeVisible();
}

async function fillVetBooking(page) {
  await page.locator('select[name="pet_id"]').selectOption('17');
  await page.locator('select[name="service_name"]').selectOption('General Consultation');

  const dateInput = page.locator('.vet-form .paws-datepicker-wrap input').first();
  const date = new Date();
  date.setDate(date.getDate() + 7);
  const displayedMonth = new Date();
  await dateInput.click();
  const monthDelta = (date.getFullYear() - displayedMonth.getFullYear()) * 12 + date.getMonth() - displayedMonth.getMonth();
  for (let month = 0; month < monthDelta; month += 1) {
    await page.locator('.react-datepicker__navigation--next').first().click();
  }
  await page.locator('.react-datepicker__day:not(.react-datepicker__day--outside-month)')
    .filter({ hasText: new RegExp(`^${date.getDate()}$`) })
    .first()
    .click();

  const timeSelect = page.locator('select[name="request_time"]');
  await expect(timeSelect).toBeEnabled();
  await timeSelect.selectOption('10:00');
  await page.locator('.vet-form textarea[name="notes"]').fill('Routine annual checkup.');
  await page.getByRole('button', { name: 'Submit Request' }).click();
  await expect(page.locator('.brm-modal')).toBeVisible();
}

async function navigateWithinCustomerWorkspace(page, route) {
  await page.evaluate((path) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, route);
}

test('Customer workspace routes remain responsive across supported widths', async ({ page }) => {
  test.setTimeout(180000);
  await mockLoginAs(page, 'customer', 'Responsive Audit Customer');
  await stubCustomerApi(page);
  await page.goto('/customer', { waitUntil: 'domcontentloaded' });

  const viewportsForRoute = (route) => (
    ['/customer', '/customer/services', '/customer/pets', '/customer/payments'].includes(route)
      ? VIEWPORTS
      : VIEWPORTS.filter(({ name }) => ['phone-390', 'laptop-1366'].includes(name))
  );

  for (const route of CUSTOMER_ROUTES) {
    for (const viewport of viewportsForRoute(route)) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await navigateWithinCustomerWorkspace(page, route);
      await expect(
        page.locator('.app-dashboard.customer-dashboard'),
        `${route} at ${viewport.name} should render the Customer shell; current URL: ${page.url()}`
      ).toBeVisible({ timeout: 8000 });
      await expect(
        page.locator('.app-content').first(),
        `${route} at ${viewport.name} should render content; current URL: ${page.url()}`
      ).toBeVisible();

      if (route === '/customer/hotel') {
        await expect(page.locator('[name="check_in_time"], [name="check_out_time"]')).toHaveCount(0);
      }

      if (route === '/customer/grooming') {
        const timeSelect = page.locator('select[name="request_time"]');
        await expect(timeSelect).toBeVisible();
        // Slots are loaded dynamically from /customer/availability/grooming
        // after a date is picked — with the API stubbed, only the placeholder
        // renders and the select stays disabled until a date is chosen.
        await expect(timeSelect).toBeDisabled();
        const options = await timeSelect.locator('option').evaluateAll((items) =>
          items.map((item) => ({ value: item.value, label: item.textContent.trim() }))
        );
        expect(options).toEqual([{ value: '', label: 'Select an available time' }]);
      }

      if (route === '/customer/pets') {
        const addButton = page.getByRole('button', { name: 'Add New Pet', exact: true });
        await expect(addButton).toBeVisible();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await addButton.click();
        const dialog = page.getByRole('dialog', { name: 'Add a new pet' });
        await expect(dialog).toBeVisible();
        await expect.poll(() => dialog.evaluate((element) => element.getAnimations().every((animation) => animation.playState === 'finished'))).toBe(true);
        const dialogBounds = await dialog.boundingBox();
        expect(dialogBounds).not.toBeNull();
        expect(dialogBounds.x).toBeGreaterThanOrEqual(0);
        expect(dialogBounds.x + dialogBounds.width).toBeLessThanOrEqual(viewport.width + 1);
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth))
          .toBeLessThanOrEqual(viewport.width + 1);
        await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(dialog).toHaveCount(0);
        await expect(addButton).toBeFocused();
      }

      const dimensions = await page.evaluate(() => ({
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      }));

      expect(
        dimensions.documentWidth,
        `${route} at ${viewport.name} should not overflow the viewport: ${JSON.stringify(dimensions)}`
      ).toBeLessThanOrEqual(dimensions.viewportWidth + 1);

      if (route === '/customer') {
        await expect(page).toHaveURL(/\/customer\/services$/);
        await expect(page.locator('.customer-services-page')).toBeVisible();
      }

      if (route === '/customer' && ['phone-390', 'laptop-1366'].includes(viewport.name)) {
        await test.info().attach(`customer-services-${viewport.name}`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      }
    }
  }
});

test('Customer styling remains scoped away from Admin and the cashier POS', async ({ page }) => {
  await mockLoginAs(page, 'customer', 'Customer Scope Audit');
  await stubCustomerApi(page);
  await page.goto('/customer');
  await expect(page.locator('.app-dashboard.customer-dashboard')).toBeVisible();
  await expect(page.locator('.app-dashboard.admin-dashboard')).toHaveCount(0);
  await expect(page.locator('.pos-kiosk')).toHaveCount(0);
});

test.describe('Customer booking date-only timezone handling', () => {
  test.use({ timezoneId: 'Asia/Manila' });

  test('date picker values round-trip without shifting the selected calendar day', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    const dateValues = await page.evaluate(async () => {
      const { formatDateOnly, parseDateOnly } = await import('/src/utils/date.js');
      const selectedDate = new Date(2026, 8, 29);
      return {
        formatted: formatDateOnly(selectedDate),
        parsed: formatDateOnly(parseDateOnly('2026-09-29')),
      };
    });

    expect(dateValues).toEqual({ formatted: '2026-09-29', parsed: '2026-09-29' });
  });
});

test('historical customer store orders stay off the bookings board', async ({ page }) => {
  await mockLoginAs(page, 'customer', 'Read-only Order History Audit');
  await page.addInitScript(() => window.localStorage.setItem('email', 'orders-audit@example.com'));
  await stubCustomerApi(page, { includeStoredOrder: true });
  await page.goto('/customer/bookings');

  await expect(page.locator('.app-dashboard.customer-dashboard')).toBeVisible();
  await expect(page.locator('.cbb-row')).toHaveCount(0);
  await expect(page.locator('.cbb-card')).toHaveCount(0);
  await expect(page.locator('.cbb-empty-state')).toBeVisible();
  await expect(page.locator('.cbb-btn--primary')).toHaveCount(0);
});

test('customer requests render as mobile cards with direct payment action', async ({ page }) => {
  await mockLoginAs(page, 'customer', 'Payable Request Mobile Audit');
  await page.addInitScript(() => window.localStorage.setItem('email', 'payable-audit@example.com'));
  await stubCustomerApi(page, { includePayableRequest: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/customer/bookings');

  const row = page.locator('.cbb-card').filter({ hasText: 'Grooming' });
  await expect(row).toBeVisible();
  await expect(row.locator('.cbb-btn--primary')).toHaveText('Pay now');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);

  await row.getByRole('button', { name: 'Pay' }).click();
  await expect(page.locator('.pum-modal')).toBeVisible();
  await expect(page.locator('.pum-modal')).toContainText('Grooming');
});

test('customer may upload full grooming payment proof immediately after booking', async ({ page }) => {
  await mockLoginAs(page, 'customer', 'Grooming Prepayment Customer');
  await page.addInitScript(() => window.localStorage.setItem('email', 'grooming-prepay@example.com'));
  const { createdRequests, paymentProofPaths } = await mockGroomingBookingApi(page);
  await page.goto('/customer/grooming');
  await fillGroomingBooking(page);

  const payNow = page.getByRole('checkbox', { name: /Pay the full booking total now/ });
  await expect(payNow).not.toBeChecked();
  await payNow.check();
  await page.locator('.brm-modal').getByRole('button', { name: 'Confirm booking' }).click();

  await expect(page.locator('.pum-modal')).toBeVisible();
  await expect(page.locator('.pum-modal .pum-amount strong')).toHaveText('₱500.00');
  await expect(page.locator('.pum-booking-pending-note')).toContainText('verify the proof after approval');
  expect(createdRequests).toHaveLength(1);

  const proof = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
  await page.locator('#pum-file-input').setInputFiles({ name: 'payment-proof.png', mimeType: 'image/png', buffer: proof });
  await page.locator('.pum-ref-input').fill('GCASH-PREPAY-001');
  await page.getByRole('button', { name: 'Confirm & Upload' }).click();

  await expect(page.locator('.pum-modal')).toHaveCount(0);
  expect(paymentProofPaths).toEqual(['/api/customer/requests/101/payment-proof']);
  expect(createdRequests[0]).toMatchObject({ id: 101, payment_status: 'unpaid', price: 500, total_amount: 500 });
});

test('customer may submit a grooming booking without selecting pay now', async ({ page }) => {
  await mockLoginAs(page, 'customer', 'Grooming No Prepayment Customer');
  await page.addInitScript(() => window.localStorage.setItem('email', 'grooming-no-prepay@example.com'));
  const { createdRequests, paymentProofPaths } = await mockGroomingBookingApi(page);
  await page.goto('/customer/grooming');
  await fillGroomingBooking(page);

  const payNow = page.getByRole('checkbox', { name: /Pay the full booking total now/ });
  await expect(payNow).not.toBeChecked();
  await page.locator('.brm-modal').getByRole('button', { name: 'Confirm booking' }).click();

  await expect(page.locator('.brm-modal')).toHaveCount(0);
  await expect(page.locator('.pum-modal')).toHaveCount(0);
  expect(createdRequests).toHaveLength(1);
  expect(paymentProofPaths).toHaveLength(0);
});

test('veterinary customer booking offers full-total pay now', async ({ page }) => {
  await mockLoginAs(page, 'customer', 'Veterinary Prepayment Customer');
  await page.addInitScript(() => window.localStorage.setItem('email', 'vet-prepay@example.com'));
  const { createdRequests } = await mockGroomingBookingApi(page);
  await page.goto('/customer/vet');
  await fillVetBooking(page);

  const review = page.locator('.brm-modal');
  const payNow = review.getByRole('checkbox', { name: /Pay the full booking total now/ });
  await expect(payNow).not.toBeChecked();
  await payNow.check();
  await review.getByRole('button', { name: 'Confirm booking' }).click();

  await expect(page.locator('.pum-modal')).toBeVisible();
  await expect(page.locator('.pum-modal .pum-amount strong')).toHaveText('₱700.00');
  expect(createdRequests[0]).toMatchObject({ id: 101, service_name: 'General Consultation', total_amount: 700 });
});

test('customer may pay the full hotel booking total during booking after choosing a vaccination card', async ({ page }) => {
  await mockLoginAs(page, 'customer', 'Hotel Prepayment Customer');
  await page.addInitScript(() => window.localStorage.setItem('email', 'hotel-prepay@example.com'));
  const { bookings, paymentProofPaths } = await mockHotelBookingApi(page);
  await page.goto('/customer/hotel');
  await page.locator('select[name="pet_id"]').selectOption('17');

  const checkInInput = page.locator('.book-tab .paws-datepicker-wrap input').first();
  const checkIn = new Date();
  checkIn.setDate(checkIn.getDate() + 7);
  const displayedMonth = new Date();
  await checkInInput.click();
  const monthDelta = (checkIn.getFullYear() - displayedMonth.getFullYear()) * 12 + checkIn.getMonth() - displayedMonth.getMonth();
  for (let month = 0; month < monthDelta; month += 1) {
    await page.locator('.react-datepicker__navigation--next').first().click();
  }
  await page.locator('.react-datepicker__day:not(.react-datepicker__day--outside-month)')
    .filter({ hasText: new RegExp(`^${checkIn.getDate()}$`) })
    .first()
    .click();

  const room = page.locator('.rooms-grid .room-card:not(.unavailable)').first();
  await expect(room).toBeVisible();
  await room.click();
  await expect(room).toHaveAttribute('aria-pressed', 'true');
  await expect(room).toContainText('Selected for this booking');
  await page.locator('textarea[name="notes"]').fill('Please keep the pet comfortable.');
  await expect(room).toHaveAttribute('aria-pressed', 'true');
  const card = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
  await page.locator('.book-tab input[type="file"]').setInputFiles({ name: 'milo-vaccine.png', mimeType: 'image/png', buffer: card });
  await page.getByRole('button', { name: 'Submit Boarding Request' }).click();

  const review = page.locator('.brm-modal');
  await expect(review).toBeVisible();
  const payNow = review.getByRole('checkbox', { name: /Pay the full booking total now/ });
  await payNow.check();
  await review.getByRole('button', { name: 'Confirm booking' }).click();

  await expect(page.locator('.pum-modal')).toBeVisible();
  await expect(page.locator('.pum-modal .pum-amount strong')).toHaveText('₱850.00');
  expect(bookings).toHaveLength(1);
  const proof = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
  await page.locator('#pum-file-input').setInputFiles({ name: 'hotel-proof.png', mimeType: 'image/png', buffer: proof });
  await page.locator('.pum-ref-input').fill('GCASH-HOTEL-PREPAY-001');
  await page.getByRole('button', { name: 'Confirm & Upload' }).click();
  await expect(page.locator('.pum-modal')).toHaveCount(0);
  expect(paymentProofPaths).toEqual(['/api/customer/boarding-requests/202/payment-proof']);
});
