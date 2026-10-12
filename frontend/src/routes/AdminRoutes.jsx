import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";
import ReportSkeleton from "../components/shared/ReportSkeleton";

// Core admin modules - lazy loaded
const AdminDashboard = lazy(() => import("../components/admin/AdminDashboard"));
const AdminReports = lazy(() => import("../components/admin/AdminReports"));
const ManageUsers = lazy(() => import("../components/admin/ManageUsers"));
const CreateUser = lazy(() => import("../components/admin/CreateUser"));
const History = lazy(() => import("../components/admin/History"));
const Attendance = lazy(() => import("../components/admin/Attendance"));
const ProfileSettings = lazy(() => import("../components/shared/ProfileSettings"));
const ChatbotLogs = lazy(() => import("../components/admin/ChatbotLogs"));
const LiveChatInbox = lazy(() => import("../components/live-chat/LiveChatInbox"));
const AdminSettings = lazy(() => import("../components/admin/AdminSettings"));
const AdminLandingPageEditor = lazy(() => import("../components/admin/AdminLandingPageEditor"));
const LoginHistory = lazy(() => import("../components/admin/LoginHistory"));
const PayrollReports = lazy(() => import("../components/admin/PayrollReports"));
const EmployeeDirectory = lazy(() => import("../components/shared/EmployeeDirectory"));

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

const ReportRoute = ({ children }) => (
  <Suspense fallback={<ReportSkeleton label="Loading admin report" />}>
    {children}
  </Suspense>
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
        <Route index element={<ReportRoute><AdminReports /></ReportRoute>} />

        {/* Core admin routes */}
        <Route
          path="profile"
          element={
            <div className="admin-profile-settings">
              <ProfileSettings />
            </div>
          }
        />
        <Route path="users" element={<ManageUsers />} />
        <Route path="users/create" element={<CreateUser />} />
        <Route
          path="employees"
          element={
            <EmployeeDirectory
              roleAccent="#ff5f93"
              roleLabel="Admin — Staff Records"
            />
          }
        />
        <Route path="reports" element={<ReportRoute><AdminReports /></ReportRoute>} />
        <Route path="reports/cashier" element={<ReportRoute><CashierReports /></ReportRoute>} />
        <Route path="reports/inventory" element={<ReportRoute><InventoryReports /></ReportRoute>} />
        <Route path="reports/manager" element={<ReportRoute><ManagerReports /></ReportRoute>} />
        <Route path="reports/veterinary" element={<ReportRoute><VetReports /></ReportRoute>} />
        <Route path="reports/customers" element={<ReportRoute><CustomerReport /></ReportRoute>} />
        <Route path="reports/payments" element={<ReportRoute><PaymentReports /></ReportRoute>} />
        <Route path="reports/orders" element={<ReportRoute><OrderReports /></ReportRoute>} />
        <Route path="reports/services" element={<ReportRoute><ServiceRequestReports /></ReportRoute>} />
        <Route path="reports/logistics" element={<ReportRoute><LogisticsReports /></ReportRoute>} />
        <Route path="reports/reception" element={<ReportRoute><ReceptionistReports /></ReportRoute>} />
        <Route path="reports/attendance" element={<ReportRoute><Attendance /></ReportRoute>} />
        <Route path="history" element={<History />} />
        <Route path="chatbot" element={<ChatbotLogs />} />
        <Route path="live-chat" element={<LiveChatInbox />} />
        <Route path="landing-page" element={<AdminLandingPageEditor />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="history/logins" element={<LoginHistory />} />
        <Route path="reports/payroll" element={<ReportRoute><PayrollReports /></ReportRoute>} />

      </Route>
    </Routes>
  </Suspense>
);

export default AdminRoutes;
