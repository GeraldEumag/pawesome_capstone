import React, { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { faMoneyBillWave } from "@fortawesome/free-solid-svg-icons";
import { useRealTimeSync } from "../../hooks/useRealTimeSync";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { apiRequest } from "../../api/client";
import { formatCurrency } from "../../utils/currency";
import StandardReportLayout from "../shared/StandardReportLayout";
import StandardSummaryCards from "../shared/StandardSummaryCards";
import StandardTable from "../shared/StandardTable";
import {
  exportToCSV,
  exportToPDF,
  exportToExcel,
  filterByDateRange,
  filterByStatus,
  getDateRangePreset,
} from "../../utils/reportExport";
import "./CashierReports.css";

const CHART_COLORS = ["#ff5f93", "#ff8db5", "#ffc8dd", "#f59e0b", "#10b981", "#3b82f6"];

const CashierReports = () => {
  const location = useLocation();
  const isAdminReport = location.pathname.startsWith("/admin/");
  const [activeTab, setActiveTab] = useState("sales");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [salespersonFilter, setSalespersonFilter] = useState("all");
  const [salespeople, setSalespeople] = useState([]);

  // Raw data storage
  const [rawTransactions, setRawTransactions] = useState([]);
  const [summaryData, setSummaryData] = useState({
    totalSales: 0,
    totalTransactions: 0,
    todaySales: 0,
    todayTransactions: 0,
    refunds: 0,
    averageOrderValue: 0,
  });

  // Set default date range to current day
  useEffect(() => {
    const { startDate: defaultStart, endDate: defaultEnd } = getDateRangePreset("today");
    setStartDate(defaultStart);
    setEndDate(defaultEnd);
  }, []);

  const fetchReportData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      let sales = [];
      
      try {
        const params = new URLSearchParams();
        if (startDate) params.append("from", startDate);
        if (endDate) params.append("to", endDate);
        if (statusFilter !== "all") params.append("status", statusFilter);
        if (salespersonFilter !== "all") params.append("salesperson_id", salespersonFilter);
        if (searchTerm) params.append("search", searchTerm);
        const endpoint = isAdminReport ? `/admin/reports/sales?${params}` : "/cashier/transactions";
        const salesData = await apiRequest(endpoint);
        const reportData = salesData?.data || salesData || {};
        sales = Array.isArray(salesData)
          ? salesData
          : reportData.transactions || reportData.sales || [];
        setSalespeople(reportData.salespeople || []);
      } catch (apiErr) {
        console.error("Cashier transactions API failed:", apiErr);
        throw new Error("Unable to load live cashier transactions.");
      }

      setRawTransactions(sales);

      // Calculate summary statistics
      const totalSales = sales.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
      const today = new Date().toISOString().split('T')[0];
      const todaySales = sales
        .filter(item => {
          const itemDate = item.date ? new Date(item.date).toISOString().split('T')[0] : '';
          return itemDate === today;
        })
        .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

      const totalTransactions = sales.length;
      const todayTransactions = sales.filter(item => {
        const itemDate = item.date ? new Date(item.date).toISOString().split('T')[0] : '';
        return itemDate === today;
      }).length;
      const refunds = sales.filter(item => item.status === 'refunded').length;
      const averageOrderValue = totalTransactions > 0 ? totalSales / totalTransactions : 0;

      setSummaryData({
        totalSales,
        totalTransactions,
        todaySales,
        todayTransactions,
        refunds,
        averageOrderValue,
      });

      setError("");
    } catch (err) {
      console.error("Failed to fetch cashier reports:", err);
      setError(err.message || "Failed to load live cashier report data.");
      setRawTransactions([]);
      setSummaryData({
        totalSales: 0,
        totalTransactions: 0,
        todaySales: 0,
        todayTransactions: 0,
        refunds: 0,
        averageOrderValue: 0,
      });
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, statusFilter, salespersonFilter, searchTerm, isAdminReport]);

  // Use real-time sync hook for automatic polling every 30 seconds
  useRealTimeSync(fetchReportData, [
    startDate, 
    endDate, 
    statusFilter, 
    salespersonFilter, 
    searchTerm
  ], 30000);

  const getFilteredData = () => {
    let filtered = [...rawTransactions];

    // Apply date range filter
    if (startDate || endDate) {
      filtered = filterByDateRange(filtered, "date", startDate, endDate);
    }

    // Apply status filter
    if (statusFilter !== "all") {
      filtered = filterByStatus(filtered, "status", statusFilter);
    }

    // Apply search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          String(item.id || "").toLowerCase().includes(search) ||
          (item.customer || item.customer_name || item.salesperson_name || "").toLowerCase().includes(search) ||
          item.type?.toLowerCase().includes(search) ||
          item.payment_method?.toLowerCase().includes(search)
      );
    }

    return filtered;
  };

  const handleDateChange = (key, value) => {
    if (key === "startDate") setStartDate(value);
    if (key === "endDate") setEndDate(value);
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setSalespersonFilter("all");

    const { startDate: defaultStart, endDate: defaultEnd } = getDateRangePreset("today");
    setStartDate(defaultStart);
    setEndDate(defaultEnd);
  };

  const exportColumns = [
    { key: "id", label: "Transaction ID" },
    { key: "customer_name", label: "Customer" },
    { key: "date", label: "Date", format: "date" },
    { key: "time", label: "Time" },
    { key: "amount", label: "Amount", format: "currency" },
    { key: "payment_method", label: "Payment Method" },
    { key: "status", label: "Status" },
  ];

  const handleExportCSV = () => {
    exportToCSV(getFilteredData(), exportColumns, "cashier-transactions-report");
  };

  const handleExportPDF = () => {
    exportToPDF(
      getFilteredData(),
      exportColumns,
      "Cashier Transactions Report",
      "cashier-transactions-report"
    );
  };

  const handleExportExcel = () => {
    exportToExcel(getFilteredData(), exportColumns, "cashier-transactions-report");
  };

  // Prepare summary cards data
  const summaryCards = [
    {
      id: "total-sales",
      label: "Total Sales",
      value: formatCurrency(summaryData.totalSales),
      icon: "faMoneyBillWave",
      color: "primary",
      trend: "up",
      change: "+12.5%"
    },
    {
      id: "total-transactions",
      label: "Total Transactions",
      value: summaryData.totalTransactions,
      icon: "faChartLine",
      color: "secondary",
      trend: "up",
      change: "+8.2%"
    },
    {
      id: "today-sales",
      label: "Today's Sales",
      value: formatCurrency(summaryData.todaySales),
      icon: "faCalendar",
      color: "success",
      trend: "up",
      change: "+5.1%"
    },
    {
      id: "average-order",
      label: "Average Order Value",
      value: formatCurrency(summaryData.averageOrderValue),
      icon: "faShoppingCart",
      color: "warning",
      trend: "neutral",
      change: "+2.3%"
    },
    {
      id: "refunds",
      label: "Refunds",
      value: summaryData.refunds,
      icon: "faExchangeAlt",
      color: "danger",
      trend: "down",
      change: "-1.2%"
    }
  ];

  // Prepare table columns
  const tableColumns = [
    { key: "id", label: "Transaction ID", sortable: true },
    { key: "salesperson_name", label: "Salesperson", sortable: true },
    { key: "date", label: "Date", format: "date", sortable: true },
    { key: "time", label: "Time", sortable: true },
    { key: "amount", label: "Amount", format: "currency", sortable: true },
    { key: "payment_method", label: "Payment Method", sortable: true },
    { key: "status", label: "Status", sortable: true },
  ];

  // Chart data preparation
  const dailySalesData = getFilteredData().reduce((acc, item) => {
    const date = item.date
      ? new Date(item.date).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];
    const existing = acc.find(d => d.date === date);
    if (existing) {
      existing.sales += Number(item.amount) || 0;
      existing.count += 1;
    } else {
      acc.push({
        date,
        sales: Number(item.amount) || 0,
        count: 1
      });
    }
    return acc;
  }, []).slice(-7); // Last 7 days

  const paymentMethodData = getFilteredData().reduce((acc, item) => {
    const method = item.payment_method || 'Unknown';
    const existing = acc.find(m => m.method === method);
    if (existing) {
      existing.count += 1;
      existing.amount += Number(item.amount) || 0;
    } else {
      acc.push({
        method,
        count: 1,
        amount: Number(item.amount) || 0
      });
    }
    return acc;
  }, []);

  const renderSalesTab = () => (
    <div className="cashier-reports-content">
      <StandardSummaryCards cards={summaryCards} />
      
      <div className="charts-section">
        <div className="chart-row">
          <div className="chart-container">
            <h3 className="section-title">Daily Sales Trend</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dailySalesData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Line type="monotone" dataKey="sales" stroke="#ff5f93" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-container">
            <h3 className="section-title">Payment Methods</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={paymentMethodData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ method, percent }) => `${method}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {paymentMethodData.map((entry, index) => (
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
        <h3 className="section-title">Transaction History</h3>
        <StandardTable
          columns={tableColumns}
          data={getFilteredData()}
          emptyMessage="No transactions found"
        />
      </div>
    </div>
  );

  const renderActiveTab = () => {
    switch (activeTab) {
      case "sales":
        return renderSalesTab();
      default:
        return renderSalesTab();
    }
  };

  return (
    <StandardReportLayout
      title="Cashier Reports"
      subtitle="Payment transactions, sales analytics, and revenue tracking"
      icon={faMoneyBillWave}
      loading={loading}
      error={error}
      onRefresh={fetchReportData}
      lastUpdated={new Date().toLocaleTimeString()}
    >
      <div className="cashier-reports-navigation">
        <nav className="nav-tabs">
          {[
            ["sales", "💰", "Sales"],
            ["transactions", "📋", "Transactions"],
            ["refunds", "↩️", "Refunds"],
          ].map(([key, icon, label]) => (
            <button
              key={key}
              className={`nav-tab ${activeTab === key ? "active" : ""}`}
              onClick={() => setActiveTab(key)}
            >
              <span className="tab-icon">{icon}</span> {label}
            </button>
          ))}
        </nav>
      </div>

      <div className="reports-content">
        {renderActiveTab()}
      </div>
    </StandardReportLayout>
  );
};

export default CashierReports;
