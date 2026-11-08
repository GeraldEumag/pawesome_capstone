# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: vet-tech-intake-audit.spec.js >> vet tech checks in a patient without clinical controls
- Location: e2e\vet-tech-intake-audit.spec.js:7:1

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: page.waitForResponse: Test timeout of 60000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary [ref=e4]:
    - generic [ref=e6]:
      - img [ref=e8]
      - generic [ref=e10]:
        - generic [ref=e11]: Vet Portal
        - generic [ref=e12]: Pawesome Clinic
    - navigation [ref=e13]:
      - paragraph [ref=e14]: Main Navigation
      - list [ref=e15]:
        - listitem [ref=e16]:
          - link "Appointments" [ref=e17] [cursor=pointer]:
            - /url: /veterinary/appointments
            - img [ref=e19]
            - generic [ref=e21]: Appointments
        - listitem [ref=e22]:
          - link "My Payroll" [ref=e23] [cursor=pointer]:
            - /url: /veterinary/payroll
            - img [ref=e25]
            - generic [ref=e27]: My Payroll
        - listitem [ref=e28]:
          - link "Profile" [ref=e29] [cursor=pointer]:
            - /url: /veterinary/profile
            - img [ref=e31]
            - generic [ref=e33]: Profile
    - button "Logout" [ref=e35] [cursor=pointer]:
      - img [ref=e36]
      - generic [ref=e38]: Logout
  - main [ref=e39]:
    - generic [ref=e40]:
      - generic [ref=e41]:
        - heading "Appointments" [level=1] [ref=e42]
        - paragraph [ref=e43]: Schedule, reschedule, and manage vet consultations.
      - generic [ref=e44]:
        - button "Notifications" [ref=e46] [cursor=pointer]:
          - img [ref=e47]
        - button "Veterinarian Veterinary" [ref=e50] [cursor=pointer]:
          - img [ref=e52]
          - generic [ref=e54]:
            - strong [ref=e55]: Veterinarian
            - generic [ref=e56]: Veterinary
    - generic [ref=e58]:
      - generic [ref=e60]:
        - generic [ref=e61]:
          - img [ref=e62]
          - text: Veterinary Schedule
        - heading "Appointments Management" [level=2] [ref=e64]:
          - img [ref=e65]
          - text: Appointments Management
        - paragraph [ref=e67]: Manage veterinary consultations, monitor schedules, and update appointment status.
      - generic [ref=e68]:
        - generic [ref=e69]:
          - img [ref=e71]
          - generic [ref=e73]:
            - heading "Today" [level=3] [ref=e74]
            - generic [ref=e75]: 0 appointments
        - generic [ref=e76]:
          - img [ref=e78]
          - generic [ref=e80]:
            - heading "Incoming" [level=3] [ref=e81]
            - generic [ref=e82]: 0 waiting
        - generic [ref=e83]:
          - img [ref=e85]
          - generic [ref=e87]:
            - heading "Scheduled" [level=3] [ref=e88]
            - generic [ref=e89]: 1 ready
        - generic [ref=e90]:
          - img [ref=e92]
          - generic [ref=e94]:
            - heading "Completion Rate" [level=3] [ref=e95]
            - generic [ref=e96]: 0%
      - generic [ref=e97]:
        - generic [ref=e98]:
          - textbox "Search by pet, owner, service, status, or notes..." [ref=e100]
          - generic [ref=e101]:
            - img [ref=e102]
            - text: Filters
          - generic [ref=e104]:
            - button "All Active (4)" [ref=e105] [cursor=pointer]
            - button "Incoming (0)" [ref=e106] [cursor=pointer]
            - button "Scheduled (1)" [ref=e107] [cursor=pointer]
            - button "Checked In (0)" [ref=e108] [cursor=pointer]
            - button "In Consultation (3)" [ref=e109] [cursor=pointer]
            - button "In Treatment (0)" [ref=e110] [cursor=pointer]
            - button "Awaiting Results (0)" [ref=e111] [cursor=pointer]
            - button "Clinical Complete (0)" [ref=e112] [cursor=pointer]
            - button "At Checkout (0)" [ref=e113] [cursor=pointer]
            - button "Completed (0)" [ref=e114] [cursor=pointer]
            - button "Cancelled (0)" [ref=e115] [cursor=pointer]
        - generic [ref=e116]:
          - img [ref=e117]
          - text: "Last updated: 06:58 PM"
      - table [ref=e121]:
        - rowgroup [ref=e122]:
          - row "Schedule Patient Owner Service Status Payment Actions" [ref=e123]:
            - columnheader "Schedule" [ref=e124] [cursor=pointer]:
              - generic [ref=e125]:
                - generic [ref=e126]: Schedule
                - img [ref=e127]
            - columnheader "Patient" [ref=e129] [cursor=pointer]:
              - generic [ref=e130]:
                - generic [ref=e131]: Patient
                - img [ref=e132]
            - columnheader "Owner" [ref=e134] [cursor=pointer]:
              - generic [ref=e135]:
                - generic [ref=e136]: Owner
                - img [ref=e137]
            - columnheader "Service" [ref=e139]:
              - generic [ref=e141]: Service
            - columnheader "Status" [ref=e142] [cursor=pointer]:
              - generic [ref=e143]:
                - generic [ref=e144]: Status
                - img [ref=e145]
            - columnheader "Payment" [ref=e147]:
              - generic [ref=e149]: Payment
            - columnheader "Actions" [ref=e150]:
              - generic [ref=e152]: Actions
        - rowgroup [ref=e153]:
          - row "Nov 24, 2026 10:30 AM Buddy Dog · Golden Retriever CUSTOMER N/A General Check-up In Consultation requested Actions for 3" [ref=e154]:
            - cell "Nov 24, 2026 10:30 AM" [ref=e155]:
              - generic [ref=e156]:
                - strong [ref=e157]: Nov 24, 2026
                - generic [ref=e158]: 10:30 AM
            - cell "Buddy Dog · Golden Retriever" [ref=e159]:
              - generic [ref=e160]:
                - strong [ref=e161]:
                  - img [ref=e162]
                  - text: Buddy
                - generic [ref=e164]: Dog · Golden Retriever
            - cell "CUSTOMER N/A" [ref=e165]:
              - generic [ref=e166]:
                - strong [ref=e167]: CUSTOMER
                - generic [ref=e168]: N/A
            - cell "General Check-up" [ref=e169]
            - cell "In Consultation" [ref=e170]:
              - generic [ref=e171]:
                - img [ref=e172]
                - text: In Consultation
            - cell "requested" [ref=e174]:
              - generic [ref=e175]: requested
            - cell "Actions for 3" [ref=e176]:
              - button "Actions for 3" [ref=e178] [cursor=pointer]:
                - img [ref=e179]
          - row "Nov 26, 2026 10:30 AM Buddy Dog · Golden Retriever CUSTOMER N/A General Check-up In Consultation requested Actions for 1" [ref=e181]:
            - cell "Nov 26, 2026 10:30 AM" [ref=e182]:
              - generic [ref=e183]:
                - strong [ref=e184]: Nov 26, 2026
                - generic [ref=e185]: 10:30 AM
            - cell "Buddy Dog · Golden Retriever" [ref=e186]:
              - generic [ref=e187]:
                - strong [ref=e188]:
                  - img [ref=e189]
                  - text: Buddy
                - generic [ref=e191]: Dog · Golden Retriever
            - cell "CUSTOMER N/A" [ref=e192]:
              - generic [ref=e193]:
                - strong [ref=e194]: CUSTOMER
                - generic [ref=e195]: N/A
            - cell "General Check-up" [ref=e196]
            - cell "In Consultation" [ref=e197]:
              - generic [ref=e198]:
                - img [ref=e199]
                - text: In Consultation
            - cell "requested" [ref=e201]:
              - generic [ref=e202]: requested
            - cell "Actions for 1" [ref=e203]:
              - button "Actions for 1" [ref=e205] [cursor=pointer]:
                - img [ref=e206]
          - row "Dec 4, 2026 10:30 AM Buddy Dog · Golden Retriever CUSTOMER N/A General Check-up In Consultation requested Actions for 2" [ref=e208]:
            - cell "Dec 4, 2026 10:30 AM" [ref=e209]:
              - generic [ref=e210]:
                - strong [ref=e211]: Dec 4, 2026
                - generic [ref=e212]: 10:30 AM
            - cell "Buddy Dog · Golden Retriever" [ref=e213]:
              - generic [ref=e214]:
                - strong [ref=e215]:
                  - img [ref=e216]
                  - text: Buddy
                - generic [ref=e218]: Dog · Golden Retriever
            - cell "CUSTOMER N/A" [ref=e219]:
              - generic [ref=e220]:
                - strong [ref=e221]: CUSTOMER
                - generic [ref=e222]: N/A
            - cell "General Check-up" [ref=e223]
            - cell "In Consultation" [ref=e224]:
              - generic [ref=e225]:
                - img [ref=e226]
                - text: In Consultation
            - cell "requested" [ref=e228]:
              - generic [ref=e229]: requested
            - cell "Actions for 2" [ref=e230]:
              - button "Actions for 2" [ref=e232] [cursor=pointer]:
                - img [ref=e233]
          - row "Sep 6, 2028 10:30 AM Buddy Dog · Golden Retriever CUSTOMER N/A General Check-up Scheduled requested Actions for 4" [ref=e235]:
            - cell "Sep 6, 2028 10:30 AM" [ref=e236]:
              - generic [ref=e237]:
                - strong [ref=e238]: Sep 6, 2028
                - generic [ref=e239]: 10:30 AM
            - cell "Buddy Dog · Golden Retriever" [ref=e240]:
              - generic [ref=e241]:
                - strong [ref=e242]:
                  - img [ref=e243]
                  - text: Buddy
                - generic [ref=e245]: Dog · Golden Retriever
            - cell "CUSTOMER N/A" [ref=e246]:
              - generic [ref=e247]:
                - strong [ref=e248]: CUSTOMER
                - generic [ref=e249]: N/A
            - cell "General Check-up" [ref=e250]
            - cell "Scheduled" [ref=e251]:
              - generic [ref=e252]:
                - img [ref=e253]
                - text: Scheduled
            - cell "requested" [ref=e255]:
              - generic [ref=e256]: requested
            - cell "Actions for 4" [ref=e257]:
              - button "Actions for 4" [ref=e259] [cursor=pointer]:
                - img [ref=e260]
  - button "Pawesome Assistant Assistant" [ref=e263] [cursor=pointer]:
    - img "Pawesome Assistant" [ref=e265]
    - generic [ref=e266]: Assistant
```

# Test source

```ts
  1  | const { test, expect } = require('@playwright/test');
  2  | const { apiLogin } = require('./test-utils');
  3  | const fs = require('node:fs');
  4  | 
  5  | const apiUrl = process.env.E2E_API_URL;
  6  | 
  7  | test('vet tech checks in a patient without clinical controls', async ({ page, request }, testInfo) => {
  8  |   test.skip(process.env.E2E_AUDIT_DATABASE !== 'pawesome_e2e_audit', 'Requires the approved isolated audit database.');
  9  |   test.setTimeout(60000);
  10 |   expect(apiUrl).toBe('http://127.0.0.1:8001/api');
  11 |   const vet = await apiLogin(request, 'veterinary');
  12 |   const patientsResponse = await request.get(`${apiUrl}/veterinary/patients`, { headers: { Authorization: `Bearer ${vet.token}` } });
  13 |   expect(patientsResponse.ok()).toBeTruthy();
  14 |   const patientsBody = await patientsResponse.json();
  15 |   const patient = (patientsBody.data || patientsBody).find((pet) => pet.appointments?.length);
  16 |   expect(patient).toBeTruthy();
  17 |   const scheduled = new Date();
  18 |   scheduled.setUTCDate(scheduled.getUTCDate() + 600 + Math.floor(Math.random() * 100));
  19 |   scheduled.setUTCHours(2, 30, 0, 0);
  20 |   const created = await request.post(`${apiUrl}/veterinary/appointments`, {
  21 |     headers: { Authorization: `Bearer ${vet.token}` },
  22 |     data: { customer_id: patient.customer_id, pet_id: patient.id, service_id: patient.appointments[0].service_id, scheduled_at: scheduled.toISOString() },
  23 |   });
  24 |   expect(created.status(), await created.text()).toBe(201);
  25 |   const createdBody = await created.json();
  26 |   const appointment = createdBody.appointment || createdBody.data;
  27 |   expect(appointment.id).toBeTruthy();
  28 | 
  29 |   const tech = await apiLogin(request, 'vet_tech');
  30 |   await page.addInitScript(({ token }) => {
  31 |     localStorage.setItem('token', token);
  32 |     localStorage.setItem('role', 'vet_tech');
  33 |   }, { token: tech.token });
  34 |   const errors = [];
  35 |   page.on('pageerror', (error) => errors.push(error.message));
  36 |   page.on('response', (response) => {
  37 |     if (response.url().includes('/api/') && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  38 |   });
  39 |   await page.goto('/veterinary/appointments');
  40 |   await expect(page.getByRole('button', { name: /^(Start|Consult|Edit|Cancel)$/ })).toHaveCount(0);
  41 |   const [checkIn] = await Promise.all([
> 42 |     page.waitForResponse((response) => response.url().endsWith(`/veterinary/appointments/${appointment.id}/check-in`) && response.request().method() === 'POST'),
     |          ^ Error: page.waitForResponse: Test timeout of 60000ms exceeded.
  43 |     page.getByRole('button', { name: /^Check in$/ }).first().click(),
  44 |   ]);
  45 |   expect(checkIn.status()).toBe(200);
  46 |   expect((await checkIn.json()).appointment.status).toBe('checked_in');
  47 |   const persistedResponse = await request.get(`${apiUrl}/veterinary/appointments`, { headers: { Authorization: `Bearer ${vet.token}` } });
  48 |   expect(persistedResponse.ok()).toBeTruthy();
  49 |   const persistedBody = await persistedResponse.json();
  50 |   const persisted = (persistedBody.data || persistedBody).find((row) => row.id === appointment.id);
  51 |   expect(persisted.status).toBe('checked_in');
  52 |   expect(persisted.checked_in_by).toBe(tech.user.id);
  53 |   await page.screenshot({ path: testInfo.outputPath('checked-in.png'), fullPage: true });
  54 |   fs.writeFileSync(testInfo.outputPath('workflow-evidence.json'), JSON.stringify({ appointment_id: appointment.id, tech_user_id: tech.user.id, pet_id: patient.id, status: persisted.status, checked_in_by: persisted.checked_in_by, api_errors: errors }, null, 2));
  55 |   expect(errors).toEqual([]);
  56 | });
  57 | 
```