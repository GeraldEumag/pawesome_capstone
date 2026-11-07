import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import ProtectedRoute from "./ProtectedRoute";
import { AuthProvider } from "../context/AuthContext";

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>LOGIN PAGE</div>} />
          <Route path="/customer" element={<div>CUSTOMER HOME</div>} />
          <Route path="/admin" element={<div>ADMIN HOME</div>} />
          <Route
            path="/customer/services"
            element={
              <ProtectedRoute>
                <div>CUSTOMER SERVICES</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute>
                <div>ADMIN USERS</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );

const signIn = (role) => {
  localStorage.setItem("token", "t-" + role);
  localStorage.setItem("role", role);
};

describe("ProtectedRoute", () => {
  beforeEach(() => localStorage.clear());

  it("redirects to /login when there is no token", () => {
    renderAt("/customer/services");
    expect(screen.getByText("LOGIN PAGE")).toBeInTheDocument();
  });

  it("renders the page for a role that is allowed on the route", () => {
    signIn("customer");
    renderAt("/customer/services");
    expect(screen.getByText("CUSTOMER SERVICES")).toBeInTheDocument();
  });

  it("sends a customer who opens a staff route back to their own home", () => {
    signIn("customer");
    renderAt("/admin/users");
    expect(screen.getByText("CUSTOMER HOME")).toBeInTheDocument();
    expect(screen.queryByText("ADMIN USERS")).not.toBeInTheDocument();
  });

  it("lets admin into staff routes", () => {
    signIn("admin");
    renderAt("/admin/users");
    expect(screen.getByText("ADMIN USERS")).toBeInTheDocument();
  });
});
