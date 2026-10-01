const { chromium } = require('@playwright/test');
const { apiLogin } = require('./e2e/test-utils');
const apiUrl = 'http://127.0.0.1:8000/api';
const auth = (t) => ({ Accept: 'application/json', Authorization: `Bearer ${t}` });

(async () => {
  const browser = await chromium.launch();
  const req = (await browser.newContext()).request;
  const customer = await apiLogin(req, 'customer');
  const receptionist = await apiLogin(req, 'receptionist');
  const vet = await apiLogin(req, 'veterinary');

  const petRes = await req.post(`${apiUrl}/pets`, { headers: auth(customer.token), data: { name: `E2E Notify Pet ${Date.now()}`, species: 'Dog' } });
  console.log('pet:', petRes.status());
  const pet = (await petRes.json()).pet || await petRes.json();

  const date = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  const reqRes = await req.post(`${apiUrl}/customer/requests`, { headers: auth(customer.token), data: {
    customer_name: customer.user.name, customer_email: customer.user.email,
    pet_id: pet.id, pet_name: pet.name, request_type: 'vet', service_type: 'vet',
    service_name: 'Consultation', request_date: date, request_time: '10:00',
    requested_date: date, requested_time: '10:00', notes: 'E2E vet notification deep link',
  }});
  console.log('request:', reqRes.status(), (await reqRes.text()).slice(0, 300));
  const requestId = (await reqRes.json?.() ?? ({})).request?.id;

  await browser.close();
})();
