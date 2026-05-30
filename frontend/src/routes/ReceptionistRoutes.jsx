import React, { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";
import ReceptionistLayout from "../components/receptionist/ReceptionistLayout";

const ReceptionistChatbot = lazy(() => import("../components/receptionist/ReceptionistChatbot"));
const ReceptionistAppointmentsBoarding = lazy(() => import("../components/receptionist/ReceptionistAppointmentsBoarding"));
const CustomerManagement = lazy(() => import("../components/receptionist/ReceptionistCustomerManagement"));
const CustomersProfile = lazy(() => import("../components/receptionist/ReceptionistCustomersProfile"));
const ProfileSettings = lazy(() => import("../components/shared/ProfileSettings"));
const Reports = lazy(() => import("../components/customers/CustomerReports"));
const ReceptionistHistory = lazy(() => import("../components/receptionist/ReceptionistHistory"));

const RouteLoading = () => (
  <div style={{ padding: "20px", textAlign: "center" }}>Loading...</div>
);

const ReceptionistRoutes = () => (
  <Suspense fallback={<RouteLoading />}>
    <Routes>
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <ReceptionistLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="appointments-boarding" replace />} />
        <Route path="appointments-boarding" element={<ReceptionistAppointmentsBoarding />} />

        {/* Legacy redirects to unified hub */}
        <Route path="dashboard" element={<Navigate to="/receptionist/appointments-boarding" replace />} />
        <Route path="appointments" element={<Navigate to="/receptionist/appointments-boarding" replace />} />
        <Route path="boarding-manager" element={<Navigate to="/receptionist/appointments-boarding" replace />} />
        <Route path="checkin" element={<Navigate to="/receptionist/appointments-boarding" replace />} />
        <Route path="checkout" element={<Navigate to="/receptionist/appointments-boarding" replace />} />
        <Route path="bookings" element={<Navigate to="/receptionist/appointments-boarding" replace />} />
        <Route path="bookings/*" element={<Navigate to="/receptionist/appointments-boarding" replace />} />
        <Route path="approvals" element={<Navigate to="/receptionist/appointments-boarding" replace />} />

        <Route path="chatbot" element={<ReceptionistChatbot />} />
        <Route path="medical-confinements" element={<Navigate to="/receptionist/appointments-boarding" replace />} />
        <Route path="customers" element={<CustomerManagement />} />
        <Route path="history" element={<ReceptionistHistory />} />
        <Route path="profile" element={<ProfileSettings />} />
        <Route path="reports" element={<Reports />} />
      </Route>
      <Route
        path="customer-profile"
        element={
          <ProtectedRoute>
            <ReceptionistLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<CustomersProfile />} />
      </Route>
    </Routes>
  </Suspense>
);

export default ReceptionistRoutes;
