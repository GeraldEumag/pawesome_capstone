import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";
import CustomerDashboard from "../components/customers/CustomerDashboard";

// Core customer modules
import CustomerReports from "../components/customers/CustomerReports";
import CustomerPets from "../components/customers/CustomerPets";
import CustomerChatbot from "../components/customers/CustomerChatbot";
import CustomerUserInfo from "../components/customers/CustomerUserInfo";
import ProfileSettings from "../components/shared/ProfileSettings";
import CustomerPayments from "../components/customers/CustomerPayments";
import CustomerNotifications from "../components/customers/CustomerNotifications";
import HotelForm from "../components/customers/HotelForm";
import GroomingForm from "../components/customers/GroomingForm";
import VetForm from "../components/customers/VetForm";
import CustomerMedicalConfinements from "../components/customers/CustomerMedicalConfinements";
import CustomerHistory from "../components/customers/CustomerHistory";
import CustomerServices from "../components/customers/CustomerServices";

const CustomerRoutes = () => (
  <Routes>
    <Route
      path="/*"
      element={
        <ProtectedRoute>
          <CustomerDashboard />
        </ProtectedRoute>
      }
    >
      {/* Default index route → dashboard overview */}
      <Route index element={<CustomerReports />} />

      {/* Core customer routes */}
      <Route path="services" element={<CustomerServices />} />
      <Route path="bookings" element={<Navigate to="/customer/services" replace />} />
      <Route path="booking" element={<Navigate to="/customer/services" replace />} />
      <Route path="requests" element={<Navigate to="/customer/services" replace />} />
      <Route path="pets" element={<CustomerPets />} />
      <Route path="hotel" element={<HotelForm />} />
      <Route path="grooming" element={<GroomingForm />} />
      <Route path="vet" element={<VetForm />} />
      <Route path="medical-confinements" element={<CustomerMedicalConfinements />} />
            <Route path="chatbot" element={<CustomerChatbot />} />
      <Route path="userinfo" element={<CustomerUserInfo />} />
      <Route path="profile" element={<ProfileSettings />} />
      <Route path="history" element={<CustomerHistory />} />
      <Route path="notifications" element={<CustomerNotifications />} />

      {/* Direct payments route */}
      <Route path="payments" element={<CustomerPayments />} />

      {/* Nested under reports */}
      <Route path="reports" element={<CustomerReports />}>
        <Route path="payments" element={<CustomerPayments />} />
      </Route>
    </Route>
  </Routes>
);

export default CustomerRoutes;
