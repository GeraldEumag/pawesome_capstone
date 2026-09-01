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
const AdminLandingPageEditor = lazy(() => import("../components/admin/AdminLandingPageEditor"));
const LoginHistory = lazy(() => import("../components/admin/LoginHistory"));
const PayrollReports = lazy(() => import("../components/admin/PayrollReports"));

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
  <div style={{
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "40vh",
    gap: "1rem",
    color: "#ff5f93",
    fontSize: "0.95rem",
    fontWeight: 600,
  }}>
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      style={{ animation: "spin 0.8s linear infinite" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="20" cy="20" r="16" stroke="#ffc8dd" strokeWidth="4" fill="none" />
      <path d="M20 4 A16 16 0 0 1 36 20" stroke="#ff5f93" strokeWidth="4" fill="none" strokeLinecap="round" />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
    Loading...
  </div>
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
        <Route path="reports/logistics" element={<LogisticsReports />} />
        <Route path="reports/reception" element={<ReceptionistReports />} />
        <Route path="reports/attendance" element={<Attendance />} />
        <Route path="history" element={<History />} />
        <Route path="chatbot" element={<ChatbotLogs />} />
        <Route path="landing-page" element={<AdminLandingPageEditor />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="history/logins" element={<LoginHistory />} />
        <Route path="reports/payroll" element={<PayrollReports />} />

      </Route>
    </Routes>
  </Suspense>
);

export default AdminRoutes;
