import React from "react";
import { Routes, Route } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";
import ManagerDashboard from "../components/manager/ManagerDashboard";
import ManagerStaff from "../components/manager/ManagerStaff";
import ManagerAttendance from "../components/manager/ManagerAttendance";
import PayrollManagement from "../components/manager/PayrollManagement";
import PayrollComputation from "../components/manager/PayrollComputation";
import ManagerReports from "../components/manager/ManagerReports";
import ManagerHistory from "../components/manager/ManagerHistory";
import ManagerLeave from "../components/manager/ManagerLeave";
import ManagerSchedule from "../components/manager/ManagerSchedule";
import FingerprintKiosk from "../components/manager/FingerprintKiosk";
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

      {/* Nested routes */}
      <Route path="staff" element={<ManagerStaff />} />
      <Route path="attendance" element={<ManagerAttendance />} />
      <Route path="leaves" element={<ManagerLeave />} />
      <Route path="schedule" element={<ManagerSchedule />} />
      <Route path="payroll" element={<PayrollManagement />} />
      <Route path="payroll/compute" element={<PayrollComputation />} />
      <Route path="history" element={<ManagerHistory />} />
      <Route path="reports" element={<ManagerReports />} />
      <Route path="kiosk" element={<FingerprintKiosk />} />
      <Route path="profile" element={<ProfileSettings />} />
    </Route>
  </Routes>
);

export default ManagerRoutes;
