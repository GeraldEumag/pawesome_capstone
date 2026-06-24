import React from "react";
import { Navigate, Routes, Route } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";
import PayrollReports from "../components/admin/PayrollReports";
import PayrollManagement from "../components/manager/PayrollManagement";
import PayrollComputation from "../components/manager/PayrollComputation";
import ManagerAttendance from "../components/manager/ManagerAttendance";
import ManagerLeave from "../components/manager/ManagerLeave";
import ManagerSchedule from "../components/manager/ManagerSchedule";
import FingerprintKiosk from "../components/manager/FingerprintKiosk";

const PayrollRoutes = () => (
  <Routes>
    <Route
      index
      element={
        <ProtectedRoute>
          <PayrollManagement />
        </ProtectedRoute>
      }
    />
    <Route
      path="compute"
      element={
        <ProtectedRoute>
          <PayrollComputation />
        </ProtectedRoute>
      }
    />
    <Route
      path="attendance"
      element={
        <ProtectedRoute>
          <ManagerAttendance />
        </ProtectedRoute>
      }
    />
    <Route
      path="leaves"
      element={
        <ProtectedRoute>
          <ManagerLeave />
        </ProtectedRoute>
      }
    />
    <Route
      path="schedule"
      element={
        <ProtectedRoute>
          <ManagerSchedule />
        </ProtectedRoute>
      }
    />
    <Route
      path="kiosk"
      element={
        <ProtectedRoute>
          <FingerprintKiosk />
        </ProtectedRoute>
      }
    />
    <Route
      path="reports"
      element={
        <ProtectedRoute>
          <PayrollReports />
        </ProtectedRoute>
      }
    />
    <Route path="*" element={<Navigate to="/payroll" replace />} />
  </Routes>
);

export default PayrollRoutes;
