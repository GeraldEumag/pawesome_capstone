import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";

// Core admin modules - lazy loaded
const AdminDashboard = lazy(() => import("../components/admin/AdminDashboard"));
const AdminReports = lazy(() => import("../components/admin/AdminReports"));
const ManageUsers = lazy(() => import("../components/admin/ManageUsers"));
const CreateUser = lazy(() => import("../components/admin/CreateUser"));
const History = lazy(() => import("../components/admin/History"));
const Attendance = lazy(() => import("../components/admin/Attendance"));
const ProfileSettings = lazy(() => import("../components/shared/ProfileSettings"));
const ChatbotLogs = lazy(() => import("../components/admin/ChatbotLogs"));
const AdminSettings = lazy(() => import("../components/admin/AdminSettings"));

// Admin monitoring reports - read-only system-wide views
const CashierReports = lazy(() => import("../components/admin/CashierAdminReports"));
const InventoryReports = lazy(() => import("../components/admin/InventoryAdminReports"));
const ManagerReports = lazy(() => import("../components/admin/ManagerAdminReports"));
const VetReports = lazy(() => import("../components/admin/VeterinaryAdminReports"));
const CustomerReport = lazy(() => import("../components/admin/CustomerReport"));
const PaymentReports = lazy(() => import("../components/admin/PaymentReports"));
const OrderReports = lazy(() => import("../components/admin/OrderReports"));
const ServiceRequestReports = lazy(() => import("../components/admin/ServiceRequestReports"));
const LogisticsReports = lazy(() => import("../components/admin/LogisticsReports"));
const ReceptionistReports = lazy(() => import("../components/receptionist/ReceptionistReports"));

// Loading fallback component
const RouteLoading = () => (
  <div style={{ padding: "20px", textAlign: "center" }}>Loading...</div>
);

const AdminRoutes = () => (
  <Suspense fallback={<RouteLoading />}>
    <Routes>
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AdminDashboard />
          </ProtectedRoute>
        }
      >
        {/* Default index route → dashboard overview */}
        <Route index element={<AdminReports />} />

        {/* Core admin routes */}
        <Route path="profile" element={<ProfileSettings />} />
        <Route path="users" element={<ManageUsers />} />
        <Route path="users/create" element={<CreateUser />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="reports/cashier" element={<CashierReports />} />
        <Route path="reports/inventory" element={<InventoryReports />} />
        <Route path="reports/manager" element={<ManagerReports />} />
        <Route path="reports/veterinary" element={<VetReports />} />
        <Route path="reports/customers" element={<CustomerReport />} />
        <Route path="reports/payments" element={<PaymentReports />} />
        <Route path="reports/orders" element={<OrderReports />} />
        <Route path="reports/services" element={<ServiceRequestReports />} />
        <Route path="reports/service-requests" element={<ServiceRequestReports />} />
        <Route path="reports/logistics" element={<LogisticsReports />} />
        <Route path="reports/reception" element={<ReceptionistReports />} />
        <Route path="reports/attendance" element={<Attendance />} />
        <Route path="history" element={<History />} />
        <Route path="chatbot" element={<ChatbotLogs />} />
        <Route path="settings" element={<AdminSettings />} />

      </Route>
    </Routes>
  </Suspense>
);

export default AdminRoutes;
