import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";
import { VetDashboardSkeleton } from "../components/veterinary/VetSkeleton";

const VetDashboard = lazy(() => import("../components/veterinary/VetDashboard"));
const VetAppointments = lazy(() => import("../components/veterinary/VetAppointments_PinkGlass"));
const VetServices = lazy(() => import("../components/veterinary/VetServices_PinkGlass"));
const VetEditAppointment = lazy(() => import("../components/veterinary/VetEditAppointment_PinkGlass"));
const VetConsultation = lazy(() => import("../components/veterinary/VetConsultation"));
const VetHistory = lazy(() => import("../components/veterinary/VetHistory"));
const VetCustomerProfiles = lazy(() => import("../components/veterinary/VetCustomerProfiles.jsx"));
const VetReports = lazy(() => import("../components/veterinary/VetReports"));
const VetReceipt = lazy(() => import("../components/veterinary/VetReceipt"));
const ProfileSettings = lazy(() => import("../components/shared/ProfileSettings"));
const VetCurrentBoarders = lazy(() => import("../components/veterinary/VeterinaryCurrentBoarders"));
const VetMedicalConfinements = lazy(() => import("../components/veterinary/VetMedicalConfinements"));
const MyPayroll = lazy(() => import("../components/shared/MyPayroll"));

const VetRoutes = () => (
  <Suspense fallback={<VetDashboardSkeleton />}>
    <Routes>
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <VetDashboard />
          </ProtectedRoute>
        }
      >
        {/* Default landing page */}
        <Route index element={<VetAppointments />} />

        {/* Nested routes */}
        <Route path="appointments" element={<VetAppointments />} />
        <Route path="appointments/:id/edit" element={<VetEditAppointment />} />
        <Route path="services" element={<VetServices />} />
        <Route path="appointments/:id/consult" element={<VetConsultation />} />
        <Route path="history" element={<VetHistory />} />
        <Route path="customer-profiles" element={<VetCustomerProfiles />} />
        <Route path="reports" element={<VetReports />} />
        <Route path="receipt" element={<VetReceipt />} />
        <Route path="current-boarders" element={<VetCurrentBoarders />} />
        <Route path="medical-confinements" element={<VetMedicalConfinements />} />
        <Route path="payroll" element={<MyPayroll roleAccent="#059669" roleLabel="Veterinary" />} />
        <Route path="profile" element={<ProfileSettings />} />
      </Route>
    </Routes>
  </Suspense>
);

export default VetRoutes;
