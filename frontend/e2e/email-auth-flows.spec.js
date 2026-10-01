const { test, expect } = require("@playwright/test");

test.describe("email authentication flows", () => {
  test("verification link displays the API success state", async ({ page }) => {
    await page.route("**/auth/email/verify", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ message: "Email verified successfully." }),
    }));

    await page.goto("/verify-email?token=test-token&email=customer%40example.com");

    await expect(page.locator(".verify-message")).toHaveText("Email verified successfully.");
  });

  test("resend verification displays the generic API response", async ({ page }) => {
    await page.route("**/auth/email/resend", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ message: "If the email is registered and not yet verified, a new verification link has been sent." }),
    }));

    await page.goto("/verify-email");
    await page.getByLabel("Email address").fill("customer@example.com");
    await page.getByRole("button", { name: "Resend verification email" }).click();

    await expect(page.locator(".verify-message")).toContainText("If the email is registered");
  });

  test("password reset screen displays expired-token API feedback", async ({ page }) => {
    await page.route("**/auth/password/reset", (route) => route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({ message: "Reset token has expired" }),
    }));

    await page.goto("/forgot-password?email=customer%40example.com&token=expired-token");
    await page.getByLabel("Reset token").fill("expired-token");
    await page.getByLabel("New password", { exact: true }).fill("NewPassword123!");
    await page.getByLabel("Confirm new password").fill("NewPassword123!");
    await page.getByRole("button", { name: "Reset Password" }).click();

    await expect(page.locator(".login-error")).toHaveText("Reset token has expired");
  });

  test("shared API client preserves the verified-email requirement response", async ({ page }) => {
    await page.route("**/__email_verification_probe", (route) => route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Please verify your email address before making a booking.",
        email_unverified: true,
      }),
    }));

    await page.goto("/login");
    const result = await page.evaluate(async () => {
      const { apiRequest } = await import("/src/api/client.js");
      try {
        await apiRequest("/__email_verification_probe", { method: "POST", body: "{}" });
      } catch (error) {
        return { message: error.message, status: error.status, response: error.response };
      }
      return null;
    });

    expect(result).toMatchObject({
      message: "Please verify your email address before making a booking.",
      status: 403,
      response: { email_unverified: true },
    });
  });
});
