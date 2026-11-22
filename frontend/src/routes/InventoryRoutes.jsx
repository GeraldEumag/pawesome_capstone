import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";
import InventoryDashboard from "../components/inventory/InventoryDashboard";
import ProductManagement from "../components/inventory/ProductManagement";
import StockManagement from "../components/inventory/StockManagement";
import InventoryReports from "../components/inventory/InventoryReports";
import InventoryHistory from "../components/inventory/InventoryHistory_Polished";
import ProfileSettings from "../components/shared/ProfileSettings";
import MonthlyInventoryAudit from "../components/inventory/MonthlyInventoryAudit";
import MonthlyAuditReport from "../components/inventory/MonthlyAuditReport";
import AuditAnalyticsDashboard from "../components/inventory/AuditAnalyticsDashboard";
import MyPayroll from "../components/shared/MyPayroll";
import BarcodeGenerator from "../components/inventory/BarcodeGenerator";
import Suppliers from "../components/inventory/Suppliers";
import StockInPage from "../components/inventory/StockInPage";
import StockOutPage from "../components/inventory/StockOutPage";
import StockReturnsPage from "../components/inventory/StockReturnsPage";
import StockMovementsPage from "../components/inventory/StockMovementsPage";
import StockApprovalsPage from "../components/inventory/StockApprovalsPage";

const InventoryRoutes = () => (
  <Routes>
    <Route
      path="/*"
      element={
        <ProtectedRoute>
          <InventoryDashboard />
        </ProtectedRoute>
      }
    >
      <Route index element={<StockManagement />} />
      <Route path="products" element={<ProductManagement />} />
      <Route path="stock" element={<StockManagement />} />
      {/* Dedicated Stock Movement & Control pages */}
      <Route path="stock-in" element={<StockInPage />} />
      <Route path="stock-out" element={<StockOutPage />} />
      <Route path="returns" element={<StockReturnsPage />} />
      <Route path="movements" element={<StockMovementsPage />} />
      <Route path="approvals" element={<StockApprovalsPage />} />
      {/* Legacy aliases — retained as redirects so old links keep working */}
      <Route path="simplified" element={<Navigate to="/inventory/stock" replace />} />
      <Route path="management" element={<Navigate to="/inventory/products" replace />} />
      <Route path="legacy-products" element={<Navigate to="/inventory/products" replace />} />
      <Route path="history" element={<InventoryHistory />} />
      <Route path="analytics" element={<InventoryReports />} />
      <Route path="reports" element={<InventoryReports />} />
<Route
        path="monthly-audit"
        element={
          <ProtectedRoute>
            <MonthlyInventoryAudit />
          </ProtectedRoute>
        }
      />
      <Route
        path="monthly-audit-report"
        element={
          <ProtectedRoute>
            <MonthlyAuditReport />
          </ProtectedRoute>
        }
      />
      <Route
        path="audit-analytics"
        element={
          <ProtectedRoute>
            <AuditAnalyticsDashboard />
          </ProtectedRoute>
        }
      />
      <Route path="suppliers" element={<Suppliers />} />
      <Route path="barcodes" element={<BarcodeGenerator />} />
      <Route path="payroll" element={<MyPayroll roleAccent="var(--color-primary)" roleLabel="Inventory" />} />
      <Route path="profile" element={<ProfileSettings />} />
    </Route>
  </Routes>
);

export default InventoryRoutes;
