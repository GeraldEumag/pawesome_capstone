const { test, expect } = require("@playwright/test");
const { mockLoginAs } = require("./test-utils");

// The landing "Boarding Rooms" section was deliberately removed in commit
// 3e75be0. This test now guards that removal: the page renders without it.
test("public landing page renders without the removed boarding rooms section", async ({ page }) => {
  await mockLoginAs(page, "customer", "Landing customer");
  await page.goto("/");
  await expect(page.locator("#boarding-rooms-anchor")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Boarding Rooms" })).toHaveCount(0);
  await expect(page.locator(".landing-hotel-room-card")).toHaveCount(0);
});

test("walk-in page loads persisted walk-in requests and links to their service lists", async ({ page }) => {
  await mockLoginAs(page, "receptionist", "Walk-in list receptionist");
  await page.route((url) => url.pathname === "/api/receptionist/walk-ins",
  (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      data: [{
        id: 701,
        booking_channel: "walk_in",
        request_type: "grooming",
        service_name: "Bath and Brush",
        pet_name: "Mochi",
        customer_name: "Taylor Santos",
        request_date: new Date().toISOString().slice(0, 10),
        request_time: "10:00",
        status: "pending",
        price: 350,
      }],
    }),
  }));

  await page.goto("/receptionist/walk-ins");
  const recent = page.locator(".recent-item").first();
  await expect(recent).toContainText("Mochi");
  await expect(recent).toContainText("Bath and Brush");
  await expect(recent.getByRole("link", { name: /open list/i }))
    .toHaveAttribute("href", "/receptionist/bookings/grooming");
});

test("boarding approval cancel is inert and confirmation submits once", async ({ page }) => {
  await mockLoginAs(page, "receptionist", "Approval receptionist");
  let status = "pending";
  const approvals = [];

  await page.route((url) => url.pathname === "/api/receptionist/boarding-requests", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        boardings: [{
          id: 84,
          pet_id: 8,
          pet_name: "Pip",
          pet: { id: 8, name: "Pip", species: "Dog" },
          customer_name: "Riley Santos",
          status,
          payment_status: "unpaid",
          booking_channel: "walk_in",
          check_in: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
          check_out: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        }],
      }),
    })
  );
  await page.route((url) => url.pathname === "/api/receptionist/boarding-rooms", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rooms: [] }) })
  );
  await page.route((url) => url.pathname === "/api/receptionist/hotel-rooms", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rooms: [] }) })
  );
  await page.route(
    (url) => url.pathname === "/api/receptionist/boarding-requests/84/approve",
    (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      approvals.push(route.request().method());
      status = "approved";
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Boarding request approved." }),
      });
    }
  );

  await page.goto("/receptionist/bookings/hotel");
  const row = page.locator("tr", { hasText: "Pip" });
  await expect(row).toBeVisible();

  const openApprove = async () => {
    await row.locator(".row-action-popover-trigger").click();
    await page.locator(".row-action-popover-panel .approve-btn").click();
    await expect(page.locator(".swal2-popup")).toContainText("Are you sure you want to approve this request?");
    await expect(page.locator(".swal2-popup")).toContainText("Boarding #84");
  };

  await openApprove();
  await page.locator(".swal2-cancel").click();
  await expect(page.locator(".swal2-popup")).toHaveCount(0);
  expect(approvals).toHaveLength(0);

  await openApprove();
  await page.locator(".swal2-confirm").click();
  await expect.poll(() => approvals.length).toBe(1);
  expect(approvals).toHaveLength(1);
});

test("ongoing boarding remains in the receptionist list and opens its saved details", async ({ page }) => {
  await mockLoginAs(page, "receptionist", "Ongoing booking receptionist");
  await page.route((url) => url.pathname === "/api/receptionist/boarding-requests", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        boardings: [{
          id: 85,
          pet_id: 9,
          pet_name: "Mochi Ongoing",
          pet: { id: 9, name: "Mochi Ongoing", species: "Dog", breed: "Mixed" },
          customer_name: "Jordan Owner",
          customer_phone: "09170000000",
          status: "in_care",
          payment_status: "paid",
          booking_channel: "walk_in",
          check_in: "2026-10-20",
          check_out: "2026-10-20",
          total_amount: 800,
          notes: "Ongoing care details",
        }],
      }),
    })
  );
  await page.route((url) => url.pathname === "/api/receptionist/boarding-rooms", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rooms: [] }) })
  );
  await page.route((url) => url.pathname === "/api/receptionist/hotel-rooms", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rooms: [] }) })
  );

  await page.goto("/receptionist/bookings/hotel?range=all");
  const row = page.locator("tr", { hasText: "Mochi Ongoing" });
  await expect(row).toBeVisible();
  await row.locator(".row-action-popover-trigger").click();
  await page.locator(".row-action-popover-panel .view-btn").click();

  const detail = page.locator(".hbk-modal");
  await expect(detail).toContainText("Boarding #85");
  await expect(detail).toContainText("Mochi Ongoing");
  await expect(detail).toContainText("Ongoing care details");
  await page.locator(".hbk-overlay .close-btn").click();
  await expect(row).toBeVisible();
});

test("ongoing veterinary and grooming requests open details from their persisted request rows", async ({ page }) => {
  await mockLoginAs(page, "receptionist", "Ongoing service receptionist");
  await page.route((url) => url.pathname === "/api/receptionist/requests", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        requests: [
          {
            id: 901,
            request_type: "veterinary",
            service_name: "General Consultation",
            pet_name: "Mochi Vet",
            pet_type: "Dog",
            pet_breed: "Mixed",
            customer: "Avery Vet Owner",
            customer_phone: "09171111111",
            request_date: "2026-10-20",
            date: "2026-10-20",
            request_time: "10:00",
            status: "in_progress",
            workflow_stage: "on_going",
            payment_status: "paid",
            notes: "Veterinary ongoing details",
          },
          {
            id: 902,
            request_type: "grooming",
            service_name: "Bath and Brush",
            pet_name: "Mochi Grooming",
            customer_name: "Avery Grooming Owner",
            request_date: "2026-10-20",
            date: "2026-10-20",
            request_time: "11:00",
            status: "in_progress",
            workflow_stage: "on_going",
            payment_status: "paid",
            notes: "Grooming ongoing details",
          },
        ],
      }),
    })
  );
  await page.route((url) => url.pathname === "/api/receptionist/veterinarians/available", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ veterinarians: [{ id: 12, name: "Dr. Lee" }] }),
    })
  );

  await page.goto("/receptionist/bookings/veterinary?range=all");
  const vetRow = page.locator("tr", { hasText: "Mochi Vet" });
  await expect(vetRow).toBeVisible();
  await vetRow.locator(".row-action-popover-trigger").click();
  await page.locator(".row-action-popover-panel .view-btn").click();
  const vetDetail = page.locator(".hbk-modal");
  await expect(vetDetail).toContainText("Mochi Vet");
  await expect(vetDetail).toContainText("Veterinary ongoing details");
  await page.locator(".hbk-modal .close-btn").click();
  await expect(vetRow).toBeVisible();

  await page.goto("/receptionist/bookings/grooming?range=all");
  const groomingRow = page.locator("tr", { hasText: "Mochi Grooming" });
  await expect(groomingRow).toBeVisible();
  await groomingRow.locator(".row-action-popover-trigger").click();
  await page.locator(".row-action-popover-panel .view-btn").click();
  const groomingDetail = page.locator(".hbk-modal");
  await expect(groomingDetail).toContainText("Mochi Grooming");
  await expect(groomingDetail).toContainText("Grooming ongoing details");
});
