import React, { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";
import ReceptionistLayout from "../components/receptionist/ReceptionistLayout";

const ReceptionistDashboard = lazy(() => import("../components/receptionist/ReceptionistDashboard"));
const ReceptionistChatbot = lazy(() => import("../components/receptionist/ReceptionistChatbot"));
const HotelBookings = lazy(() => import("../components/receptionist/ReceptionistHotelBookings"));
const ReceptionistConfinements = lazy(() => import("../components/receptionist/ReceptionistConfinements"));
const VetAppointments = lazy(() => import("../components/receptionist/ReceptionistVetAppointments"));
const Grooming = lazy(() => import("../components/receptionist/ReceptionistGrooming"));
const ReceptionistBookings = lazy(() => import("../components/receptionist/ReceptionistBookings"));
const CustomerManagement = lazy(() => import("../components/receptionist/ReceptionistCustomerManagement"));
const CustomersProfile = lazy(() => import("../components/receptionist/ReceptionistCustomersProfile"));
const ProfileSettings = lazy(() => import("../components/shared/ProfileSettings"));
const AppointmentList = lazy(() => import("../components/receptionist/ReceptionistAppointmentList"));
const CheckInForm = lazy(() => import("../components/receptionist/ReceptionistCheckInForm"));
const CheckOutForm = lazy(() => import("../components/receptionist/ReceptionistCheckOutForm"));
const Reports = lazy(() => import("../components/customers/CustomerReports"));
const Approvals = lazy(() => import("../components/receptionist/ReceptionistApprovals"));
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
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<ReceptionistDashboard />} />
        <Route path="appointments" element={<AppointmentList />} />
        <Route path="checkin" element={<CheckInForm />} />
        <Route path="checkout" element={<CheckOutForm />} />
        <Route path="chatbot" element={<ReceptionistChatbot />} />
        {/* Booking sub-routes */}
        <Route path="bookings" element={<ReceptionistBookings />} />
        <Route path="bookings/hotel" element={<HotelBookings />} />
        <Route path="medical-confinements" element={<ReceptionistConfinements />} />
        <Route path="bookings/vet" element={<VetAppointments />} />
        <Route path="bookings/grooming" element={<Grooming />} />
        <Route path="customers" element={<CustomerManagement />} />
        <Route path="approvals" element={<Approvals />} />
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
