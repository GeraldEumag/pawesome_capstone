# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: pawesome-role-smoke-audit.spec.js >> vet_tech dashboard loads without console errors
- Location: e2e\pawesome-role-smoke-audit.spec.js:27:3

# Error details

```
Error: Console/HTTP errors for vet_tech: [
  {
    "type": "http",
    "status": 403,
    "url": "http://127.0.0.1:8001/api/veterinary/appointments",
    "page": "http://127.0.0.1:3001/veterinary/appointments"
  },
  {
    "text": "Failed to load resource: the server responded with a status of 403 (Forbidden)",
    "page": "http://127.0.0.1:3001/veterinary/appointments"
  },
  {
    "type": "network",
    "text": "Failed to fetch appointments: Error: You are not allowed to access this page.\n    at apiRequest (http://127.0.0.1:3001/src/api/client.js:129:13)\n    at async Promise.all (index 0)\n    at async http://127.0.0.1:3001/src/components/veterinary/VetAppointments.jsx:142:35",
    "page": "http://127.0.0.1:3001/veterinary/appointments"
  },
  {
    "type": "http",
    "status": 403,
    "url": "http://127.0.0.1:8001/api/veterinary/history?status=completed,cancelled&per_page=500",
    "page": "http://127.0.0.1:3001/veterinary/appointments"
  },
  {
    "text": "Failed to load resource: the server responded with a status of 403 (Forbidden)",
    "page": "http://127.0.0.1:3001/veterinary/appointments"
  }
]
```

# Page snapshot

```yaml
- generic [ref=e2]:
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
          - button "VETERINARY TECHNICIAN Veterinary" [ref=e50] [cursor=pointer]:
            - img [ref=e52]
            - generic [ref=e54]:
              - strong [ref=e55]: VETERINARY TECHNICIAN
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
          - img [ref=e69]
          - generic [ref=e71]: Failed to load appointments. Please try again.
        - generic [ref=e72]:
          - generic [ref=e73]:
            - img [ref=e75]
            - generic [ref=e77]:
              - heading "Today" [level=3] [ref=e78]
              - generic [ref=e79]: 0 appointments
          - generic [ref=e80]:
            - img [ref=e82]
            - generic [ref=e84]:
              - heading "Incoming" [level=3] [ref=e85]
              - generic [ref=e86]: 0 waiting
          - generic [ref=e87]:
            - img [ref=e89]
            - generic [ref=e91]:
              - heading "Scheduled" [level=3] [ref=e92]
              - generic [ref=e93]: 0 ready
          - generic [ref=e94]:
            - img [ref=e96]
            - generic [ref=e98]:
              - heading "Completion Rate" [level=3] [ref=e99]
              - generic [ref=e100]: 0%
        - generic [ref=e101]:
          - generic [ref=e102]:
            - textbox "Search by pet, owner, service, status, or notes..." [ref=e104]
            - generic [ref=e105]:
              - img [ref=e106]
              - text: Filters
            - generic [ref=e108]:
              - button "All Active (0)" [ref=e109] [cursor=pointer]
              - button "Incoming (0)" [ref=e110] [cursor=pointer]
              - button "Scheduled (0)" [ref=e111] [cursor=pointer]
              - button "Checked In (0)" [ref=e112] [cursor=pointer]
              - button "In Consultation (0)" [ref=e113] [cursor=pointer]
              - button "In Treatment (0)" [ref=e114] [cursor=pointer]
              - button "Awaiting Results (0)" [ref=e115] [cursor=pointer]
              - button "Clinical Complete (0)" [ref=e116] [cursor=pointer]
              - button "At Checkout (0)" [ref=e117] [cursor=pointer]
              - button "Completed (0)" [ref=e118] [cursor=pointer]
              - button "Cancelled (0)" [ref=e119] [cursor=pointer]
          - generic [ref=e120]:
            - img [ref=e121]
            - text: "Last updated: 06:50 PM"
        - generic [ref=e124]:
          - generic [ref=e125]: 📊
          - generic [ref=e126]: No appointments match the current filter.
    - button "Pawesome Assistant Assistant" [ref=e128] [cursor=pointer]:
      - img "Pawesome Assistant" [ref=e130]
      - generic [ref=e131]: Assistant
  - status [ref=e137]: Failed to load veterinary appointments.
```

# Test source

```ts
  1  | const { test, expect } = require("@playwright/test");
  2  | 
  3  | const frontendUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
  4  | const apiUrl = process.env.E2E_API_URL || "http://127.0.0.1:8000/api";
  5  | 
  6  | const accounts = {
  7  |   customer: { email: "customer@example.com", password: "Password123!", dashboard: "/customer" },
  8  |   receptionist: { email: "receptionist@example.com", password: "Password123!", dashboard: "/receptionist" },
  9  |   cashier: { email: "cashier@example.com", password: "password123", dashboard: "/cashier" },
  10 |   inventory: { email: "inventory@example.com", password: "Password123!", dashboard: "/inventory" },
  11 |   veterinary: { email: "vet@example.com", password: "Password123!", dashboard: "/veterinary" },
  12 |   manager: { email: "manager@example.com", password: "password123", dashboard: "/manager" },
  13 |   admin: { email: "admin@example.com", password: "Password123!", dashboard: "/admin" },
  14 |   super_receptionist: { email: "super_receptionist@example.com", password: "Password123!", dashboard: "/super-receptionist" },
  15 |   vet_tech: { email: "vettech@example.com", password: "Password123!", dashboard: "/veterinary/appointments" },
  16 | };
  17 | 
  18 | const { apiLogin: sharedApiLogin } = require("./test-utils");
  19 | 
  20 | async function apiLogin(request, role) {
  21 |   return sharedApiLogin(request, role);
  22 | }
  23 | 
  24 | test.describe.configure({ mode: "serial" });
  25 | 
  26 | for (const role of Object.keys(accounts)) {
  27 |   test(`${role} dashboard loads without console errors`, async ({ page, request }) => {
  28 |     const errors = [];
  29 |     page.on("console", (msg) => {
  30 |       if (msg.type() === "error") {
  31 |         const text = msg.text();
  32 |         // ERR_NETWORK_CHANGED, ERR_ADDRESS_IN_USE, and "Failed to fetch" are Windows socket exhaustion issues, not app defects
  33 |         if (text.includes("ERR_NETWORK_CHANGED") || text.includes("ERR_ADDRESS_IN_USE") || text.includes("net::ERR_") || text.includes("Failed to fetch")) {
  34 |           errors.push({ type: "network", text, page: page.url() });
  35 |           return;
  36 |         }
  37 |         errors.push({ text: msg.text(), page: page.url() });
  38 |       }
  39 |     });
  40 |     page.on("response", (response) => {
  41 |       const status = response.status();
  42 |       const url = response.url();
  43 |       if (url.includes("/api/") && status >= 400) {
  44 |         errors.push({ type: "http", status, url, page: page.url() });
  45 |       }
  46 |     });
  47 | 
  48 |     page.on("requestfailed", (request) => {
  49 |       const failure = request.failure()?.errorText;
  50 |       if (request.url().includes("/api/") && failure !== "net::ERR_ABORTED") {
  51 |         errors.push({ type: "requestfailed", failure, url: request.url() });
  52 |       }
  53 |     });
  54 | 
  55 |     const session = await apiLogin(request, role);
  56 |     await page.addInitScript(({ token, user }) => {
  57 |       window.localStorage.setItem("token", token);
  58 |       window.localStorage.setItem("role", user.role);
  59 |       window.localStorage.setItem("name", user.name);
  60 |       window.localStorage.setItem("username", user.username || user.email);
  61 |       window.localStorage.setItem("email", user.email);
  62 |     }, { token: session.token, user: session.user });
  63 | 
  64 |     await page.goto(frontendUrl + accounts[role].dashboard);
  65 |     await page.waitForLoadState("domcontentloaded");
  66 |     await page.waitForTimeout(2000);
  67 | 
  68 |     const bodyText = await page.locator("body").innerText({ timeout: 15000 }).catch(() => "");
  69 |     const rendered = bodyText.length > 40;
  70 |     const onLogin = page.url().includes("/login");
  71 |     const hasUnauthorized = bodyText.toLowerCase().includes("unauthorized");
  72 |     expect(rendered, `${role} dashboard should render`).toBeTruthy();
  73 |     expect(onLogin, `${role} should not redirect to login`).toBeFalsy();
  74 |     expect(hasUnauthorized, `${role} should not show unauthorized`).toBeFalsy();
  75 | 
  76 |     await page.waitForTimeout(3000); // give sockets time to close before next role
  77 |     if (errors.length) {
> 78 |       throw new Error(`Console/HTTP errors for ${role}: ${JSON.stringify(errors, null, 2)}`);
     |             ^ Error: Console/HTTP errors for vet_tech: [
  79 |     }
  80 |   });
  81 | }
  82 | 
```