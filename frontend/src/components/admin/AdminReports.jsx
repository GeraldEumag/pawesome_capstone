import React, { useState, Suspense, lazy } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChartLine,
  faUsers,
  faServer,
  faChartPie,
  faBalanceScale,
  faChartArea,
  faBell,
  faBoxes,
  faUserTag,
} from "@fortawesome/free-solid-svg-icons";
import ApiHealthCheck from "./ApiHealthCheck";
import ReportErrorBoundary from "../shared/ReportErrorBoundary";
import ReportSkeleton from "../shared/ReportSkeleton";
import "./AdminReports.css";

// Lazy load advanced report components for code splitting
const ExecutiveDashboard = lazy(() => import("./reports/ExecutiveDashboard"));
const StaffPerformance = lazy(() => import("./reports/StaffPerformance"));
const CustomerSegmentation = lazy(() => import("./reports/CustomerSegmentation"));
const ComparativeReporting = lazy(() => import("./reports/ComparativeReporting"));
const SalesAnalysis = lazy(() => import("./reports/SalesAnalysis"));
const PredictiveAnalytics = lazy(() => import("./reports/PredictiveAnalytics"));
const AutomatedAlerts = lazy(() => import("./reports/AutomatedAlerts"));
const InventoryOptimization = lazy(() => import("./reports/InventoryOptimization"));

const AdvancedReportLoading = () => <ReportSkeleton type="minimal" />;

// Advanced Analytics tabs — each component fetches its own endpoint.
// Detailed per-role monitoring lives on the sidebar report pages.
const SECTION_CONFIG = [
  { key: "dashboard", label: "Executive Dashboard", icon: faChartLine },
  { key: "staff_perf", label: "Staff Performance", icon: faUsers },
  { key: "segments", label: "Customer Segments", icon: faUserTag },
  { key: "comparison", label: "Period Comparison", icon: faBalanceScale },
  { key: "sales_analysis", label: "Sales Analysis", icon: faChartPie },
  { key: "predictive", label: "Predictive Analytics", icon: faChartArea },
  { key: "alerts", label: "Automated Alerts", icon: faBell },
  { key: "inventory_opt", label: "Inventory Optimization", icon: faBoxes },
  { key: "api_health", label: "API Health Check", icon: faServer, isUtility: true },
];

const AdminReports = () => {
  const [activeSection, setActiveSection] = useState("dashboard");
  const [retryKey, setRetryKey] = useState(0);

  const renderContent = () => {
    switch (activeSection) {
      case "dashboard":
        return <ExecutiveDashboard />;
      case "staff_perf":
        return <StaffPerformance />;
      case "segments":
        return <CustomerSegmentation />;
      case "comparison":
        return <ComparativeReporting />;
      case "sales_analysis":
        return <SalesAnalysis />;
      case "predictive":
        return <PredictiveAnalytics />;
      case "alerts":
        return <AutomatedAlerts />;
      case "inventory_opt":
        return <InventoryOptimization />;
      case "api_health":
        return <ApiHealthCheck />;
      default:
        return null;
    }
  };

  return (
    <div className="admin-reports-wrapper">
      {/* Section Navigation */}
      <nav className="admin-reports-nav" aria-label="Report sections">
        {SECTION_CONFIG.map((section) => (
          <button
            key={section.key}
            type="button"
            className={`admin-nav-tab ${activeSection === section.key ? "active" : ""} advanced ${section.isUtility ? "utility" : ""}`}
            onClick={() => setActiveSection(section.key)}
          >
            <FontAwesomeIcon icon={section.icon} />
            {section.label}
          </button>
        ))}
      </nav>

      <div className="advanced-report-content">
        <ReportErrorBoundary onRetry={() => setRetryKey((k) => k + 1)}>
          <Suspense fallback={<AdvancedReportLoading />}>
            <div key={retryKey}>{renderContent()}</div>
          </Suspense>
        </ReportErrorBoundary>
      </div>
    </div>
  );
};

export default AdminReports;
