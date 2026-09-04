import React, { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";
import ReceptionistLayout from "../components/receptionist/ReceptionistLayout";

const ReceptionistChatbot = lazy(() => import("../components/receptionist/ReceptionistChatbot"));
const LiveChatInbox = lazy(() => import("../components/live-chat/LiveChatInbox"));
const ReceptionistHotelBookings = lazy(() => import("../components/receptionist/ReceptionistHotelBookings"));
const ReceptionistVeterinaryBookings = lazy(() => import("../components/receptionist/ReceptionistVeterinaryBookings"));
const ReceptionistGroomingBookings = lazy(() => import("../components/receptionist/ReceptionistGroomingBookings"));
const ReceptionistManageServices = lazy(() => import("../components/receptionist/ReceptionistManageServices"));
const ReceptionistWalkIns = lazy(() => import("../components/receptionist/ReceptionistWalkIns"));
const CustomerManagement = lazy(() => import("../components/receptionist/ReceptionistCustomerManagement"));
const CustomersProfile = lazy(() => import("../components/receptionist/ReceptionistCustomersProfile"));
const ProfileSettings = lazy(() => import("../components/shared/ProfileSettings"));
const Reports = lazy(() => import("../components/customers/CustomerReports"));
const ReceptionistHistory = lazy(() => import("../components/receptionist/ReceptionistHistory"));
const MyPayroll = lazy(() => import("../components/shared/MyPayroll"));

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
        {/* Default redirect to Hotel Bookings */}
        <Route index element={<Navigate to="bookings/hotel" replace />} />

        {/* Booking Routes - Separated by Service Type */}
        <Route path="bookings/hotel" element={<ReceptionistHotelBookings />} />
        <Route path="bookings/veterinary" element={<ReceptionistVeterinaryBookings />} />
        <Route path="bookings/grooming" element={<ReceptionistGroomingBookings />} />

        {/* Legacy redirects to new structure */}
        <Route path="appointments-boarding" element={<Navigate to="/receptionist/bookings/hotel" replace />} />
        <Route path="dashboard" element={<Navigate to="/receptionist/bookings/hotel" replace />} />
        <Route path="appointments" element={<Navigate to="/receptionist/bookings/veterinary" replace />} />
        <Route path="boarding-manager" element={<Navigate to="/receptionist/bookings/hotel" replace />} />
        <Route path="checkin" element={<Navigate to="/receptionist/bookings/hotel" replace />} />
        <Route path="checkout" element={<Navigate to="/receptionist/bookings/hotel" replace />} />
        <Route path="bookings" element={<Navigate to="/receptionist/bookings/hotel" replace />} />
        <Route path="approvals" element={<Navigate to="/receptionist/bookings/hotel" replace />} />

        {/* Manage Services */}
        <Route path="manage-services" element={<ReceptionistManageServices />} />

        {/* Walk-ins */}
        <Route path="walk-ins" element={<ReceptionistWalkIns />} />

        <Route path="chatbot" element={<ReceptionistChatbot />} />
        <Route path="live-chat" element={<LiveChatInbox />} />
        <Route path="medical-confinements" element={<Navigate to="/receptionist/bookings/hotel" replace />} />
        <Route path="customers" element={<CustomerManagement />} />
        <Route path="history" element={<ReceptionistHistory />} />
        <Route path="payroll" element={<MyPayroll roleAccent="#d97706" roleLabel="Receptionist" />} />
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
      <Route
        path="payroll"
        element={
          <ProtectedRoute>
            <ReceptionistLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<MyPayroll roleAccent="#d97706" roleLabel="Receptionist" />} />
      </Route>
    </Routes>
  </Suspense>
);

export default ReceptionistRoutes;
