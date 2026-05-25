import { Routes, Route } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";
import CashierDashboard from "../components/cashier/CashierDashboard";
import CashierPOS from "../components/cashier/CashierPOS_New";
import CashierTransactions from "../components/cashier/CashierTransactions";
import CashierHistory from "../components/cashier/CashierHistory";
import CashierReports from "../components/cashier/CashierReports";
import ProfileSettings from "../components/shared/ProfileSettings";
import CashierPaymentVerification from "../components/cashier/CashierPaymentVerification";

const CashierRoutes = () => (
  <Routes>
    {/* Full-screen POS as default landing page */}
    <Route
      index
      element={
        <ProtectedRoute>
          <CashierPOS />
        </ProtectedRoute>
      }
    />

    {/* Full-screen POS route */}
    <Route
      path="pos"
      element={
        <ProtectedRoute>
          <CashierPOS />
        </ProtectedRoute>
      }
    />

    {/* Dashboard wrapper with sidebar for other features */}
    <Route
      path="dashboard"
      element={
        <ProtectedRoute>
          <CashierDashboard />
        </ProtectedRoute>
      }
    >
      <Route path="pos" element={<CashierPOS />} />
      <Route path="sales" element={<CashierTransactions />} />
      <Route path="transactions" element={<CashierTransactions />} />
      <Route path="analytics" element={<CashierReports />} />
      <Route path="history" element={<CashierHistory />} />
      <Route path="reports" element={<CashierReports />} />
      <Route path="payment-verification" element={<CashierPaymentVerification />} />
      <Route path="profile" element={<ProfileSettings />} />
    </Route>

    {/* Direct routes for other features (with sidebar) - redirect to dashboard */}
    <Route
      path="sales"
      element={
        <ProtectedRoute>
          <CashierDashboard />
        </ProtectedRoute>
      }
    >
      <Route index element={<CashierTransactions />} />
    </Route>
    <Route
      path="transactions"
      element={
        <ProtectedRoute>
          <CashierDashboard />
        </ProtectedRoute>
      }
    >
      <Route index element={<CashierTransactions />} />
    </Route>
    <Route
      path="analytics"
      element={
        <ProtectedRoute>
          <CashierDashboard />
        </ProtectedRoute>
      }
    >
      <Route index element={<CashierReports />} />
    </Route>
    <Route
      path="history"
      element={
        <ProtectedRoute>
          <CashierDashboard />
        </ProtectedRoute>
      }
    >
      <Route index element={<CashierHistory />} />
    </Route>
    <Route
      path="reports"
      element={
        <ProtectedRoute>
          <CashierDashboard />
        </ProtectedRoute>
      }
    >
      <Route index element={<CashierReports />} />
    </Route>
    <Route
      path="payment-verification"
      element={
        <ProtectedRoute>
          <CashierDashboard />
        </ProtectedRoute>
      }
    >
      <Route index element={<CashierPaymentVerification />} />
    </Route>
    <Route
      path="profile"
      element={
        <ProtectedRoute>
          <CashierDashboard />
        </ProtectedRoute>
      }
    >
      <Route index element={<ProfileSettings />} />
    </Route>

    {/* Catch-all redirect to full-screen POS */}
    <Route
      path="*"
      element={
        <ProtectedRoute>
          <CashierPOS />
        </ProtectedRoute>
      }
    />
  </Routes>
);

export default CashierRoutes;
