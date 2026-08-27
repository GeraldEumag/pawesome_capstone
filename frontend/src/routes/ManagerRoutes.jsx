import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";
import ManagerDashboard from "../components/manager/ManagerDashboard";
import ManagerStaff from "../components/manager/ManagerStaff";
import PayrollManagement from "../components/manager/PayrollManagement";
import ManagerAttendance from "../components/manager/ManagerAttendance";
import BarcodeAttendanceKiosk from "../components/manager/BarcodeAttendanceKiosk";
import ManagerLeave from "../components/manager/ManagerLeave";
import ManagerSchedule from "../components/manager/ManagerSchedule";
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

      {/* Core routes */}
      <Route path="staff" element={<ManagerStaff />} />
      <Route path="payroll" element={<PayrollManagement />} />
      {/* Redirect old standalone computation URL to payroll (now a tab inside Payroll) */}
      <Route path="payroll/computation" element={<Navigate to="/manager/payroll" replace />} />
      <Route path="payroll/compute" element={<Navigate to="/manager/payroll" replace />} />
      <Route path="attendance" element={<ManagerAttendance />} />
      <Route path="attendance/kiosk" element={<BarcodeAttendanceKiosk />} />
      <Route path="leave" element={<ManagerLeave />} />
      {/* Redirect old /leaves alias */}
      <Route path="leaves" element={<Navigate to="/manager/leave" replace />} />
      <Route path="schedule" element={<ManagerSchedule />} />
      <Route path="history" element={<ManagerHistory />} />
      <Route path="reports" element={<ManagerReports />} />
      {/* Redirect old monitoring aliases to unified Reports page */}
      <Route path="reservations" element={<Navigate to="/manager/reports" replace />} />
      <Route path="services" element={<Navigate to="/manager/reports" replace />} />
      <Route path="payments" element={<Navigate to="/manager/reports" replace />} />
      <Route path="inventory" element={<Navigate to="/manager/reports" replace />} />
      <Route path="customers" element={<Navigate to="/manager/reports" replace />} />
      <Route path="profile" element={<ProfileSettings />} />
    </Route>
  </Routes>
);

export default ManagerRoutes;
