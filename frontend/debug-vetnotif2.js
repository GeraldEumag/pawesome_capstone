const { chromium } = require('@playwright/test');
const { apiLogin } = require('./e2e/test-utils');
const apiUrl = 'http://127.0.0.1:8000/api';
const auth = (t) => ({ Accept: 'application/json', Authorization: `Bearer ${t}` });

(async () => {
  const browser = await chromium.launch();
  const req = (await browser.newContext()).request;
  const receptionist = await apiLogin(req, 'receptionist');
  const vet = await apiLogin(req, 'veterinary');

  // Approve the request created above (id 113)
  const appRes = await req.post(`${apiUrl}/receptionist/requests/113/approve`, {
    headers: auth(receptionist.token),
    data: { veterinarian_id: vet.user.id, receptionist_remarks: 'E2E' },
  });
  console.log('approve:', appRes.status(), (await appRes.text()).slice(0, 400));

  // Check vet notifications
  const notifRes = await req.get(`${apiUrl}/notifications`, { headers: auth(vet.token) });
  const notifs = await notifRes.json();
  const list = notifs.notifications || notifs.data || notifs || [];
  const arr = Array.isArray(list) ? list : [];
  console.log('vet notifications:', arr.length);
  for (const n of arr.slice(0, 5)) console.log(' -', n.title || n.type, '|', (n.message||'').slice(0,80));
  await browser.close();
})();
