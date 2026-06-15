import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

// Public
import LandingPage from "../components/landing/LandingPage";
import Login from "../components/auth/Login";
import Register from "../components/auth/Register";
import ForgotPassword from "../components/auth/ForgotPassword";
import Logout from "../components/auth/Logout";
import Dashboard from "../components/Dashboard";
import ProtectedRoute from "../components/ProtectedRoute";
import AuthRedirectListener from "../components/shared/AuthRedirectListener";

// Module routes
import AdminRoutes from "./AdminRoutes";
import CustomerRoutes from "./CustomerRoutes";
import ReceptionistRoutes from "./ReceptionistRoutes";
import VetRoutes from "./VetRoutes";
import InventoryRoutes from "./InventoryRoutes";
import CashierRoutes from "./CashierRoutes";
import ManagerRoutes from "./ManagerRoutes";
import PayrollRoutes from "./PayrollRoutes";

const AppRoutes = () => (
  <Router>
    <AuthRedirectListener />
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/logout" element={<Logout />} />

      {/* User dashboard */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />

      {/* Module routes — render components directly */}
      <Route path="/admin/*" element={<AdminRoutes />} />
      <Route path="/customer/*" element={<CustomerRoutes />} />
      <Route path="/receptionist/*" element={<ReceptionistRoutes />} />
      <Route path="/veterinary/*" element={<VetRoutes />} />
      <Route path="/inventory/*" element={<InventoryRoutes />} />
      <Route path="/cashier/*" element={<CashierRoutes />} />
      <Route path="/manager/*" element={<ManagerRoutes />} />
      <Route path="/payroll/*" element={<PayrollRoutes />} />
    </Routes>
  </Router>
);

export default AppRoutes;
