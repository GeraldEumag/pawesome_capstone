const { test, expect } = require('@playwright/test');
const { mockLoginAs } = require('./test-utils');

async function mockCustomerPetApi(page, { initialPets = [], failCreate = false, postDelay = 0 } = {}) {
  let pets = [...initialPets];
  const createRequests = [];

  await page.route('**/api/customer/pets*', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (pathname.endsWith('/customer/pets/archived')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pets: [] }) });
      return;
    }

    if (request.method() === 'POST') {
      const contentType = request.headers()['content-type'] || '';
      const rawBody = request.postDataBuffer()?.toString('latin1') || '';
      let payload;

      if (contentType.includes('application/json')) {
        payload = JSON.parse(rawBody || '{}');
      } else {
        const field = (name) => rawBody.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r\\n]*)`))?.[1] || '';
        payload = {
          name: field('name'),
          species: field('species'),
          breed: field('breed'),
          birthdate: field('birthdate'),
          birth_date: field('birth_date'),
          gender: field('gender'),
          notes: field('notes'),
          customer_email: field('customer_email'),
        };
      }

      createRequests.push({ contentType, rawBody, payload });
      if (postDelay) await new Promise((resolve) => setTimeout(resolve, postDelay));
      if (failCreate) {
        await route.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Pet could not be saved. Please try again.' }),
        });
        return;
      }

      const pet = {
        id: 700 + pets.length,
        name: payload.name,
        species: payload.species,
        breed: payload.breed,
        birthdate: payload.birthdate || payload.birth_date || null,
        gender: payload.gender || null,
        notes: payload.notes || '',
      };
      pets = [...pets, pet];
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Pet added successfully.', pet }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ pets }),
    });
  });

  return createRequests;
}

async function openAddPetDialog(page) {
  await page.getByRole('button', { name: 'Add New Pet', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a new pet' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function fillRequiredPetFields(page, name) {
  await page.getByLabel(/Pet Name/).fill(name);
  await page.locator('select[name="species"]').selectOption('Dog');
  const firstBreed = await page.locator('select[name="breed"] option').nth(1).getAttribute('value');
  await page.locator('select[name="breed"]').selectOption(firstBreed);
}

test.describe('Customer Add Pet modal', () => {
  test.beforeEach(async ({ page }) => {
    await mockLoginAs(page, 'customer', 'Add Pet Modal Customer');
  });

  test('opens from the toolbar and first-pet empty state, stays in viewport, and closes accessibly', async ({ page }) => {
    await mockCustomerPetApi(page);
    await page.setViewportSize({ width: 320, height: 820 });
    await page.goto('/customer/pets', { waitUntil: 'domcontentloaded' });

    const addButton = page.getByRole('button', { name: 'Add New Pet', exact: true });
    await expect(addButton).toBeVisible();
    await expect(page.locator('.pets-form-card')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);

    const emptyCta = page.locator('.pets-add-empty-btn');
    await emptyCta.click();
    const dialog = page.getByRole('dialog', { name: 'Add a new pet' });
    await expect(dialog).toBeVisible();
    await expect(page.locator('input[name="name"]')).toBeFocused();
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');

    const closeButton = page.getByRole('button', { name: 'Close Add a new pet dialog' });
    const submitButton = page.getByRole('button', { name: 'Add Pet', exact: true });
    await closeButton.focus();
    await page.keyboard.press('Shift+Tab');
    await expect(submitButton).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(closeButton).toBeFocused();
    await page.locator('input[name="name"]').focus();

    for (const width of [320, 390, 768, 1366]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => dialog.evaluate((element) => element.getAnimations().every((animation) => animation.playState === 'finished'))).toBe(true);
      const bounds = await dialog.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(901);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
      await expect(dialog.locator('.pw-modal-footer')).toBeVisible();
    }

    await page.setViewportSize({ width: 320, height: 520 });
    const notesField = dialog.locator('textarea[name="notes"]');
    await notesField.scrollIntoViewIfNeeded();
    await expect(notesField).toBeVisible();
    await expect(dialog.locator('.pw-modal-footer')).toBeVisible();

    await page.getByLabel('Birthdate').click();
    const calendar = page.locator('.react-datepicker__portal');
    await expect(calendar).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(calendar).toHaveCount(0);
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(emptyCta).toBeFocused();
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');

    await openAddPetDialog(page);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(addButton).toBeFocused();
  });

  test('shows validation, posts JSON, refreshes the list, and closes only after success', async ({ page }) => {
    const createRequests = await mockCustomerPetApi(page);
    await page.goto('/customer/pets', { waitUntil: 'domcontentloaded' });
    const dialog = await openAddPetDialog(page);

    await page.getByRole('button', { name: 'Add Pet', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Pet name is required');
    await expect(page.locator('input[name="name"]')).toHaveAttribute('aria-invalid', 'true');

    await fillRequiredPetFields(page, 'Mochi');
    await dialog.getByLabel('Gender').selectOption('Female');
    await page.getByRole('button', { name: 'Add Pet', exact: true }).click();

    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.pets-toast.success')).toContainText('Pet added successfully');
    const createdPet = page.locator('.pet-item').filter({ hasText: 'Mochi' });
    await expect(createdPet).toBeVisible();
    await expect(createdPet).toContainText('Gender: Female');
    expect(createRequests).toHaveLength(1);
    expect(createRequests[0].contentType).toContain('application/json');
    expect(createRequests[0].payload).toMatchObject({ name: 'Mochi', species: 'Dog', gender: 'Female' });
    expect(createRequests[0].payload.breed).toBeTruthy();
  });

  test('uploads a pet photo as multipart data and keeps the preview until save succeeds', async ({ page }) => {
    const createRequests = await mockCustomerPetApi(page);
    await page.goto('/customer/pets', { waitUntil: 'domcontentloaded' });
    const dialog = await openAddPetDialog(page);

    await page.evaluate(() => {
      window.__revokedPetPreviewUrls = [];
      const revoke = URL.revokeObjectURL.bind(URL);
      URL.revokeObjectURL = (url) => {
        window.__revokedPetPreviewUrls.push(url);
        revoke(url);
      };
    });
    const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jrJkAAAAASUVORK5CYII=', 'base64');
    await page.locator('input[name="image"]').setInputFiles({
      name: 'mochi.png',
      mimeType: 'image/png',
      buffer: image,
    });
    await expect(dialog.locator('.pet-image-preview')).toBeVisible();
    const previewUrl = await dialog.locator('.pet-image-preview').getAttribute('src');
    await fillRequiredPetFields(page, 'Mochi');

    await page.getByRole('button', { name: 'Add Pet', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.pet-item').filter({ hasText: 'Mochi' })).toBeVisible();

    expect(createRequests).toHaveLength(1);
    expect(createRequests[0].contentType).toContain('multipart/form-data');
    expect(createRequests[0].rawBody).toContain('name="image"');
    expect(createRequests[0].rawBody).toContain('filename="mochi.png"');
    expect(createRequests[0].payload).toMatchObject({ name: 'Mochi', species: 'Dog' });
    expect(await page.evaluate((url) => window.__revokedPetPreviewUrls.includes(url), previewUrl)).toBe(true);
  });

  test('rejects unsupported and oversized pet photos before submission', async ({ page }) => {
    const createRequests = await mockCustomerPetApi(page);
    await page.goto('/customer/pets', { waitUntil: 'domcontentloaded' });
    const dialog = await openAddPetDialog(page);
    const imageInput = dialog.locator('input[name="image"]');

    await imageInput.setInputFiles({
      name: 'pet.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not an image'),
    });
    await expect(dialog.getByRole('alert')).toContainText('Photo must be a JPG, PNG, or WebP image');
    await expect(imageInput).toHaveValue('');

    await imageInput.setInputFiles({
      name: 'large-pet.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
    });
    await expect(dialog.getByRole('alert')).toContainText('image under 10 MB');
    await expect(imageInput).toHaveValue('');
    expect(createRequests).toHaveLength(0);
  });

  test('keeps a failed create open with the entered draft and clears it on cancel', async ({ page }) => {
    await mockCustomerPetApi(page, { failCreate: true });
    await page.goto('/customer/pets', { waitUntil: 'domcontentloaded' });
    const dialog = await openAddPetDialog(page);
    await fillRequiredPetFields(page, 'Mochi');

    await page.getByRole('button', { name: 'Add Pet', exact: true }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('alert')).toContainText('Pet could not be saved');
    await expect(page.locator('input[name="name"]')).toHaveValue('Mochi');

    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await openAddPetDialog(page);
    await expect(page.locator('input[name="name"]')).toHaveValue('');
  });

  test('disables create while the request is pending to prevent duplicate submissions', async ({ page }) => {
    const createRequests = await mockCustomerPetApi(page, { postDelay: 1500 });
    await page.goto('/customer/pets', { waitUntil: 'domcontentloaded' });
    const dialog = await openAddPetDialog(page);
    await fillRequiredPetFields(page, 'Mochi');

    const submitButton = dialog.getByRole('button', { name: 'Add Pet', exact: true });
    await page.evaluate(() => {
      const button = document.querySelector('.pets-add-modal button[type="submit"]');
      button.click();
      button.click();
    });
    await expect.poll(() => createRequests.length).toBe(1);
    await expect(dialog).toHaveCount(0);
    expect(createRequests).toHaveLength(1);
  });
});
