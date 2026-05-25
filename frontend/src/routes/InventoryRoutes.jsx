import React from "react";
import { Routes, Route } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";
import InventoryDashboard from "../components/inventory/InventoryDashboard";
import UnifiedInventory from "../components/inventory/UnifiedInventory";
import InventoryReports from "../components/inventory/InventoryReports";
import InventoryHistory from "../components/inventory/InventoryHistory_Fixed";
import ProfileSettings from "../components/shared/ProfileSettings";
import MonthlyInventoryAudit from "../components/inventory/MonthlyInventoryAudit";
import MonthlyAuditReport from "../components/inventory/MonthlyAuditReport";
import AuditAnalyticsDashboard from "../components/inventory/AuditAnalyticsDashboard";

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
      <Route index element={<UnifiedInventory />} />
      <Route path="products" element={<UnifiedInventory />} />
      <Route path="simplified" element={<UnifiedInventory />} />
      <Route path="stock" element={<UnifiedInventory />} />
      <Route path="management" element={<UnifiedInventory />} />
      <Route path="legacy-products" element={<UnifiedInventory />} />
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
      <Route path="profile" element={<ProfileSettings />} />
    </Route>
  </Routes>
);

export default InventoryRoutes;
