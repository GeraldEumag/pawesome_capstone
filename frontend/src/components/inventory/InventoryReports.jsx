import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { faBox, faCheckCircle, faExclamationTriangle, faTimesCircle, faChartLine } from "@fortawesome/free-solid-svg-icons";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from "recharts";
import { inventoryApi } from "../../api/inventory.jsx";
import { apiRequest } from "../../api/client";
import { exportToCSV, exportToPDF, exportToExcel } from "../../utils/reportExport";
import StandardReportLayout from "../shared/StandardReportLayout";
import StandardSummaryCards from "../shared/StandardSummaryCards";
import StandardTable from "../shared/StandardTable";
import "./InventoryReports.css";

const CHART_COLORS = ["#ff5f93", "#ff8db5", "#ffc8dd", "#f59e0b", "#10b981", "#3b82f6"];

const InventoryReports = () => {
  const location = useLocation();
  const isAdminReport = location.pathname.startsWith("/admin/");
  const [apiItems, setApiItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stockLogs, setStockLogs] = useState([]);
  const [backendSummary, setBackendSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const getQuantity = useCallback((item) => Number(item.quantity ?? item.stock ?? 0), []);

  const getItemStatus = useCallback((item) => {
    const quantity = getQuantity(item);
    const minimum = Number(item.minimum_stock_level ?? item.reorder_level ?? 10);
    if (quantity <= 0) return "Out of stock";
    if (quantity <= minimum) return "Low stock";
    return "In stock";
  }, [getQuantity]);

  const fetchReportData = useCallback(async (filters) => {
      setLoading(true);
      try {
        // Use filters param when provided by UnifiedReportEngine/caller; fall back to local state
        const from = filters?.startDate ?? startDate;
        const to = filters?.endDate ?? endDate;
        const status = filters?.status ?? statusFilter;
        const category = filters?.category ?? categoryFilter;
        // searchTerm is intentionally excluded from API params — applied client-side in filteredItems

        const params = new URLSearchParams();
        if (from) params.append("from", from);
        if (to) params.append("to", to);
        if (status && status !== "all") params.append("status", status);
        if (category && category !== "all") params.append("category", category);

        const response = isAdminReport
          ? await apiRequest(`/admin/reports/inventory?${params}`)
          : await inventoryApi.getReports({ startDate: from, endDate: to, category: category !== "all" ? category : undefined });
        const data = response?.data || response || {};
        const items = data.items || response.items || response.data || [];

        setApiItems(items);
        setStockLogs(data.logs || []);
        setBackendSummary(data.summary || {});
      } catch (err) {
        console.error("Failed to fetch live inventory report data:", err);
        setApiItems([]);
        setStockLogs([]);
        setBackendSummary({});
      } finally {
        setLoading(false);
      }
    }, [startDate, endDate, statusFilter, categoryFilter, isAdminReport]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  useEffect(() => {
    const interval = setInterval(fetchReportData, 30000);
    return () => clearInterval(interval);
  }, [fetchReportData]);

  // Filter out service items from inventory data
  const inventoryItems = useMemo(() => {
    return apiItems.filter((item) => {
      const category = String(item.category || "").toLowerCase();
      const type = String(item.type || item.item_type || "").toLowerCase();

      return (
        category !== "services" &&
        category !== "service" &&
        type !== "service"
      );
    });
  }, [apiItems]);

  // Apply filters to inventory items
  const filteredItems = useMemo(() => {
    let filtered = [...inventoryItems];

    // Apply search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter((item) =>
        item.name?.toLowerCase().includes(search) ||
        item.category?.toLowerCase().includes(search) ||
        item.description?.toLowerCase().includes(search)
      );
    }

    // Apply category filter
    if (categoryFilter !== "all") {
      filtered = filtered.filter((item) =>
        item.category?.toLowerCase() === categoryFilter.toLowerCase()
      );
    }

    // Apply status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((item) => {
        const status = getItemStatus(item).toLowerCase().replace(" ", "-");
        return status === statusFilter;
      });
    }

    return filtered;
  }, [inventoryItems, searchTerm, categoryFilter, statusFilter, getItemStatus]);

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    const totalItems = inventoryItems.length;
    const inStockItems = inventoryItems.filter(item => getQuantity(item) > 0).length;
    const lowStockItems = backendSummary.low_stock_items ?? inventoryItems.filter(item => {
      const quantity = getQuantity(item);
      const minimum = Number(item.minimum_stock_level ?? item.reorder_level ?? 10);
      return quantity > 0 && quantity <= minimum;
    }).length;
    const outOfStockItems = backendSummary.out_of_stock_items ?? inventoryItems.filter(item => getQuantity(item) <= 0).length;
    return {
      totalItems,
      inStockItems,
      lowStockItems,
      outOfStockItems,
    };
  }, [inventoryItems, backendSummary, getQuantity]);

  const handleDateChange = (key, value) => {
    if (key === "startDate") setStartDate(value);
    if (key === "endDate") setEndDate(value);
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setCategoryFilter("all");
    setStatusFilter("all");
  };

  const exportColumns = [
    { key: "name", label: "Item Name" },
    { key: "category", label: "Category" },
    { key: "quantity", label: "Quantity" },
    { key: "price", label: "Unit Price", format: "currency" },
    { key: "status", label: "Status" },
  ];

  const handleExportCSV = () => {
    const exportData = filteredItems.map(item => ({
      ...item,
      status: getItemStatus(item),
    }));
    exportToCSV(exportData, exportColumns, "inventory-report");
  };

  const handleExportPDF = () => {
    const exportData = filteredItems.map(item => ({
      ...item,
      status: getItemStatus(item),
    }));
    exportToPDF(exportData, exportColumns, "Inventory Report", "inventory-report");
  };

  const handleExportExcel = () => {
    const exportData = filteredItems.map(item => ({
      ...item,
      status: getItemStatus(item),
    }));
    exportToExcel(exportData, exportColumns, "inventory-report");
  };

  // Prepare summary cards data - real values only, no fake trends
  const summaryCards = [
    {
      id: "total-items",
      label: "Total Items",
      value: summaryStats.totalItems,
      icon: "faBox",
      color: "primary",
    },
    {
      id: "in-stock",
      label: "In Stock",
      value: summaryStats.inStockItems,
      icon: "faCheckCircle",
      color: "success",
    },
    {
      id: "low-stock",
      label: "Low Stock",
      value: summaryStats.lowStockItems,
      icon: "faExclamationTriangle",
      color: "warning",
    },
    {
      id: "out-of-stock",
      label: "Out of Stock",
      value: summaryStats.outOfStockItems,
      icon: "faTimesCircle",
      color: "danger",
    }
  ];

  // Prepare table columns
  const tableColumns = [
    { key: "name", label: "Item Name", sortable: true },
    { key: "category", label: "Category", sortable: true },
    { key: "quantity", label: "Quantity", sortable: true },
    { key: "price", label: "Unit Price", format: "currency", sortable: true },
    { key: "status", label: "Status", sortable: true },
  ];

  // Chart data preparation
  const categoryData = useMemo(() => {
    const categoryCounts = {};
    filteredItems.forEach(item => {
      const category = item.category || 'Unknown';
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    });
    return Object.entries(categoryCounts).map(([category, count]) => ({
      category,
      count,
    }));
  }, [filteredItems]);

  const statusData = useMemo(() => {
    const statusCounts = { 'In Stock': 0, 'Low Stock': 0, 'Out of Stock': 0 };
    filteredItems.forEach(item => {
      const status = getItemStatus(item);
      statusCounts[status]++;
    });
    return Object.entries(statusCounts).map(([status, count]) => ({
      status,
      count,
    }));
  }, [filteredItems, getItemStatus]);

  const renderInventoryContent = () => (
    <div className="inventory-reports-content">
      <StandardSummaryCards cards={summaryCards} />
      
      <div className="charts-section">
        <div className="chart-row">
          <div className="chart-container">
            <h3 className="section-title">Items by Category</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="category" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#ff5f93" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-container">
            <h3 className="section-title">Stock Status Distribution</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ status, percent }) => `${status}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="data-table-section">
        <h3 className="section-title">Inventory Items</h3>
        <StandardTable
          columns={tableColumns}
          data={filteredItems.map(item => ({
            ...item,
            status: getItemStatus(item),
          }))}
          emptyMessage="No inventory items found"
        />
      </div>

      <div className="data-table-section">
        <h3 className="section-title">Stock Movements</h3>
        <StandardTable
          columns={[
            { key: "id", label: "Log ID", sortable: true },
            { key: "item_name", label: "Item", sortable: true },
            { key: "movement_type", label: "Movement", sortable: true },
            { key: "quantity", label: "Quantity", sortable: true },
            { key: "previous_stock", label: "Previous", sortable: true },
            { key: "new_stock", label: "New", sortable: true },
            { key: "reason", label: "Reason", sortable: true },
            { key: "performed_by", label: "Performed By", sortable: true },
            { key: "created_at", label: "Date", format: "datetime", sortable: true },
          ]}
          data={stockLogs}
          emptyMessage="No stock movements found"
        />
      </div>
    </div>
  );

  return (
    <StandardReportLayout
      title="Inventory Reports"
      subtitle="Stock levels, item analytics, and inventory valuation"
      icon={faBox}
      loading={loading}
      error=""
      onRefresh={fetchReportData}
      lastUpdated={new Date().toLocaleTimeString()}
    >
      <div className="reports-content">
        {renderInventoryContent()}
      </div>
    </StandardReportLayout>
  );
};

export default InventoryReports;
