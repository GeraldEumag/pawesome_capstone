import React, { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";
import SuperReceptionistLayout from "../components/super_receptionist/SuperReceptionistLayout";

// Front Desk (receptionist) components
const ReceptionistHotelBookings = lazy(() => import("../components/receptionist/ReceptionistHotelBookings"));
const ReceptionistVeterinaryBookings = lazy(() => import("../components/receptionist/ReceptionistVeterinaryBookings"));
const ReceptionistGroomingBookings = lazy(() => import("../components/receptionist/ReceptionistGroomingBookings"));
const ReceptionistWalkIns = lazy(() => import("../components/receptionist/ReceptionistWalkIns"));
const CustomerManagement = lazy(() => import("../components/receptionist/ReceptionistCustomerManagement"));
const ReceptionistManageServices = lazy(() => import("../components/receptionist/ReceptionistManageServices"));
const ReceptionistHistory = lazy(() => import("../components/receptionist/ReceptionistHistory"));

// Cashier components (excluding POS — linked to native /cashier/pos)
const CashierTransactions = lazy(() => import("../components/cashier/CashierTransactions"));
const CashierHistory = lazy(() => import("../components/cashier/CashierHistory"));
const CashierReports = lazy(() => import("../components/cashier/CashierReports"));

// Inventory components
const ProductManagement = lazy(() => import("../components/inventory/ProductManagement"));
const StockManagement = lazy(() => import("../components/inventory/StockManagement"));
const InventoryHistory = lazy(() => import("../components/inventory/InventoryHistory_Polished"));
const InventoryReports = lazy(() => import("../components/inventory/InventoryReports"));
const MonthlyInventoryAudit = lazy(() => import("../components/inventory/MonthlyInventoryAudit"));
const StockInPage = lazy(() => import("../components/inventory/StockInPage"));
const StockOutPage = lazy(() => import("../components/inventory/StockOutPage"));
const StockReturnsPage = lazy(() => import("../components/inventory/StockReturnsPage"));
const StockMovementsPage = lazy(() => import("../components/inventory/StockMovementsPage"));
const StockApprovalsPage = lazy(() => import("../components/inventory/StockApprovalsPage"));

// Shared
const MyPayroll = lazy(() => import("../components/shared/MyPayroll"));
const ProfileSettings = lazy(() => import("../components/shared/ProfileSettings"));

const RouteLoading = () => (
  <div style={{ padding: "20px", textAlign: "center" }}>Loading...</div>
);

const SuperReceptionistRoutes = () => (
  <Suspense fallback={<RouteLoading />}>
    <Routes>
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <SuperReceptionistLayout />
          </ProtectedRoute>
        }
      >
        {/* Default redirect to Hotel Bookings */}
        <Route index element={<Navigate to="bookings/hotel" replace />} />

        {/* Front Desk */}
        <Route path="bookings/hotel" element={<ReceptionistHotelBookings />} />
        <Route path="bookings/vet" element={<ReceptionistVeterinaryBookings />} />
        <Route path="bookings/veterinary" element={<ReceptionistVeterinaryBookings />} />
        <Route path="bookings/grooming" element={<ReceptionistGroomingBookings />} />
        <Route path="walk-ins" element={<ReceptionistWalkIns />} />
        <Route path="customers" element={<CustomerManagement />} />
        <Route path="manage-services" element={<ReceptionistManageServices />} />
        <Route path="history" element={<ReceptionistHistory />} />

        {/* Cashier (POS linked externally via sidebar to /cashier/pos) */}
        <Route path="cashier-payments" element={<CashierTransactions />} />
        <Route path="cashier-transactions" element={<CashierTransactions />} />
        <Route path="cashier-history" element={<CashierHistory />} />
        <Route path="cashier-reports" element={<CashierReports />} />

        {/* Inventory */}
        <Route path="inventory" element={<StockManagement />} />
        <Route path="inventory/products" element={<ProductManagement />} />
        <Route path="inventory/stock" element={<StockManagement />} />
        <Route path="inventory/history" element={<InventoryHistory />} />
        <Route path="inventory/reports" element={<InventoryReports />} />
        <Route path="inventory/audit" element={<MonthlyInventoryAudit />} />
        <Route path="inventory/stock-in" element={<StockInPage />} />
        <Route path="inventory/stock-out" element={<StockOutPage />} />
        <Route path="inventory/returns" element={<StockReturnsPage />} />
        <Route path="inventory/movements" element={<StockMovementsPage />} />
        <Route path="inventory/approvals" element={<StockApprovalsPage />} />

        {/* Account */}
        <Route path="payroll" element={<MyPayroll roleAccent="var(--color-primary)" roleLabel="Super Receptionist" />} />
        <Route path="profile" element={<ProfileSettings />} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="bookings/hotel" replace />} />
      </Route>
    </Routes>
  </Suspense>
);

export default SuperReceptionistRoutes;
