import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Login from "./Login";
import { AuthProvider } from "../../context/AuthContext";
import { apiRequest } from "../../api/client";
import { getRole, getToken } from "../../utils/auth";

vi.mock("../../api/client", () => ({ apiRequest: vi.fn() }));
vi.mock("../../utils/alert.jsx", () => ({
  showSuccess: vi.fn(() => Promise.resolve()),
  showError: vi.fn(),
}));

const renderLogin = () =>
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <AuthProvider>
        <Login />
      </AuthProvider>
    </MemoryRouter>
  );

const submitButton = () => document.querySelector("form.login-form button[type='submit']");

describe("Login form", () => {
  beforeEach(() => {
    localStorage.clear();
    apiRequest.mockReset();
  });

  it("shows required-field errors and makes no API call when submitted empty", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("Username is required");
    expect(screen.getByLabelText("Username")).toHaveClass("login-input-error");
    expect(screen.getByLabelText("Password")).toHaveClass("login-input-error");
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("sends the trimmed username as login with the password", async () => {
    const user = userEvent.setup();
    apiRequest.mockResolvedValue({
      token: "tok-1",
      user: { name: "Ana", role: "admin", email_verified_at: "2026-01-01" },
    });
    renderLogin();

    await user.type(screen.getByLabelText("Username"), "  ana  ");
    await user.type(screen.getByLabelText("Password"), "Password123!");
    await user.click(submitButton());

    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    const [endpoint, options] = apiRequest.mock.calls[0];
    expect(endpoint).toBe("/auth/login");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({ login: "ana", password: "Password123!" });
  });

  it("stores the session on success", async () => {
    const user = userEvent.setup();
    apiRequest.mockResolvedValue({
      token: "tok-2",
      user: { name: "Ana", role: "admin", email: "a@example.com", email_verified_at: "2026-01-01" },
    });
    renderLogin();

    await user.type(screen.getByLabelText("Username"), "ana");
    await user.type(screen.getByLabelText("Password"), "Password123!");
    await user.click(submitButton());

    await waitFor(() => expect(getToken()).toBe("tok-2"));
    expect(getRole()).toBe("admin");
  });

  it("shows the server error message when credentials are rejected", async () => {
    const user = userEvent.setup();
    apiRequest.mockRejectedValue(new Error("Invalid credentials"));
    renderLogin();

    await user.type(screen.getByLabelText("Username"), "ana");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid credentials");
    expect(getToken()).toBeNull();
  });
});
