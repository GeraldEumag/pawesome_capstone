import React from "react";
import { Routes, Route } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";
import ManagerDashboard from "../components/manager/ManagerDashboard";
import ManagerStaff from "../components/manager/ManagerStaff";
import PayrollManagement from "../components/manager/PayrollManagement";
import ManagerReports from "../components/manager/ManagerReports";
import ManagerHistory from "../components/manager/ManagerHistory";
import ProfileSettings from "../components/shared/ProfileSettings";

const ManagerRoutes = () => (
  <Routes>
    <Route
      path="/*"
      element={
        <ProtectedRoute>
          <ManagerDashboard />
        </ProtectedRoute>
      }
    >
      {/* Default landing page */}
      <Route index element={<ManagerDashboard />} />

      {/* Nested routes - Executive monitoring only */}
      <Route path="staff" element={<ManagerStaff />} />
      <Route path="payroll" element={<PayrollManagement />} />
      <Route path="history" element={<ManagerHistory />} />
      <Route path="reports" element={<ManagerReports />} />
      <Route path="reservations" element={<ManagerReports initialTab="services" />} />
      <Route path="services" element={<ManagerReports initialTab="services" />} />
      <Route path="payments" element={<ManagerReports initialTab="payments" />} />
      <Route path="inventory" element={<ManagerReports initialTab="inventory" />} />
      <Route path="customers" element={<ManagerReports initialTab="customers" />} />
      <Route path="profile" element={<ProfileSettings />} />
    </Route>
  </Routes>
);

export default ManagerRoutes;
