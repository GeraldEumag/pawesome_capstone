const { test, expect } = require('@playwright/test');
const { apiLogin } = require('./test-utils');
const fs = require('node:fs');

const apiUrl = process.env.E2E_API_URL;

test('vet tech checks in a patient without clinical controls', async ({ page, request }, testInfo) => {
  test.skip(process.env.E2E_AUDIT_DATABASE !== 'pawesome_e2e_audit', 'Requires the approved isolated audit database.');
  test.setTimeout(60000);
  expect(apiUrl).toBe('http://127.0.0.1:8001/api');
  const vet = await apiLogin(request, 'veterinary');
  const patientsResponse = await request.get(`${apiUrl}/veterinary/patients`, { headers: { Authorization: `Bearer ${vet.token}` } });
  expect(patientsResponse.ok()).toBeTruthy();
  const patientsBody = await patientsResponse.json();
  const patient = (patientsBody.data || patientsBody).find((pet) => pet.appointments?.length);
  expect(patient).toBeTruthy();
  const scheduled = new Date();
  scheduled.setUTCDate(scheduled.getUTCDate() + 600 + Math.floor(Math.random() * 100));
  scheduled.setUTCHours(2, 30, 0, 0);
  const created = await request.post(`${apiUrl}/veterinary/appointments`, {
    headers: { Authorization: `Bearer ${vet.token}` },
    data: { customer_id: patient.customer_id, pet_id: patient.id, service_id: patient.appointments[0].service_id, scheduled_at: scheduled.toISOString() },
  });
  expect(created.status(), await created.text()).toBe(201);
  const createdBody = await created.json();
  const appointment = createdBody.appointment || createdBody.data;
  expect(appointment.id).toBeTruthy();

  const tech = await apiLogin(request, 'vet_tech');
  await page.addInitScript(({ token }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('role', 'vet_tech');
  }, { token: tech.token });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.url().includes('/api/') && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto('/veterinary/appointments');
  await page.getByRole('button', { name: `Actions for ${appointment.id}`, exact: true }).click();
  await expect(page.getByRole('button', { name: /^Check in$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^(Start|Consult|Edit|Cancel)$/ })).toHaveCount(0);
  const [checkIn] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith(`/veterinary/appointments/${appointment.id}/check-in`) && response.request().method() === 'POST'),
    page.getByRole('button', { name: /^Check in$/ }).first().click(),
  ]);
  expect(checkIn.status()).toBe(200);
  expect((await checkIn.json()).appointment.status).toBe('checked_in');
  const persistedResponse = await request.get(`${apiUrl}/veterinary/appointments`, { headers: { Authorization: `Bearer ${vet.token}` } });
  expect(persistedResponse.ok()).toBeTruthy();
  const persistedBody = await persistedResponse.json();
  const persisted = (persistedBody.data || persistedBody).find((row) => row.id === appointment.id);
  expect(persisted.status).toBe('checked_in');
  expect(persisted.checked_in_by).toBe(tech.user.id);
  await page.screenshot({ path: testInfo.outputPath('checked-in.png'), fullPage: true });
  fs.writeFileSync(testInfo.outputPath('workflow-evidence.json'), JSON.stringify({ appointment_id: appointment.id, tech_user_id: tech.user.id, pet_id: patient.id, status: persisted.status, checked_in_by: persisted.checked_in_by, api_errors: errors }, null, 2));
  expect(errors).toEqual([]);
});
