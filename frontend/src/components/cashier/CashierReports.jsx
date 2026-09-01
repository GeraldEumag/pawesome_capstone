import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { faMoneyBillWave, faChartLine, faDollarSign, faReceipt } from "@fortawesome/free-solid-svg-icons";
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
  Legend,
} from "recharts";
import { apiRequest } from "../../api/client";
import { formatCurrency } from "../../utils/currency";
import UnifiedReportEngine, { ChartContainer, CHART_COLORS } from "../shared/UnifiedReportEngine";
import "./CashierReports.css";

const CashierReports = () => {
  const location = useLocation();
  const isAdminReport = location.pathname.startsWith("/admin/");
  const [salespeople, setSalespeople] = useState([]);
  const [rawTransactions, setRawTransactions] = useState([]);
  const [summaryData, setSummaryData] = useState({
    totalSales: 0,
    totalTransactions: 0,
    todaySales: 0,
    todayTransactions: 0,
    refunds: 0,
    averageOrderValue: 0,
  });

  // Fetch data for UnifiedReportEngine
  const fetchReportData = useCallback(async (filters) => {
    const params = new URLSearchParams();
    if (filters.startDate) params.append("from", filters.startDate);
    if (filters.endDate) params.append("to", filters.endDate);
    if (filters.status && filters.status !== "all") params.append("status", filters.status);
    if (filters.salesperson_id && filters.salesperson_id !== "all") params.append("salesperson_id", filters.salesperson_id);
    if (filters.searchTerm) params.append("search", filters.searchTerm);

    const endpoint = isAdminReport
      ? `/admin/reports/cashier?${params}`
      : `/cashier/transactions?${params}`;

    const response = await apiRequest(endpoint);
    const reportData = response || {};
    const transactions = Array.isArray(reportData)
      ? reportData
      : reportData.transactions || reportData.data || [];
    
    setSalespeople(reportData.salespeople || []);
    setRawTransactions(transactions);

    // Calculate summary
    const totalSales = transactions.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const today = new Date().toISOString().split('T')[0];
    const todaySales = transactions
      .filter(item => (item.date ? new Date(item.date).toISOString().split('T')[0] : '') === today)
      .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    
    setSummaryData({
      totalSales,
      totalTransactions: transactions.length,
      todaySales,
      todayTransactions: transactions.filter(item => (item.date ? new Date(item.date).toISOString().split('T')[0] : '') === today).length,
      refunds: transactions.filter(item => item.status === 'refunded').length,
      averageOrderValue: transactions.length > 0 ? totalSales / transactions.length : 0,
    });

    return transactions;
  }, [isAdminReport]);

  // Summary cards – real data only, no fake trends
  const summaryCards = useMemo(() => [
    {
      id: "total-sales",
      label: "Total Sales",
      value: formatCurrency(summaryData.totalSales),
      icon: faDollarSign,
      tone: "money",
    },
    {
      id: "total-transactions",
      label: "Total Transactions",
      value: summaryData.totalTransactions,
      icon: faReceipt,
      tone: "primary",
    },
    {
      id: "today-sales",
      label: "Today's Sales",
      value: formatCurrency(summaryData.todaySales),
      icon: faMoneyBillWave,
      tone: "success",
    },
    {
      id: "average-order",
      label: "Average Order Value",
      value: formatCurrency(summaryData.averageOrderValue),
      icon: faChartLine,
      tone: "info",
    },
  ], [summaryData]);

  // Table columns – mapped to actual backend fields from /cashier/transactions
  const tableColumns = [
    { key: "id", label: "Transaction ID", sortable: true },
    { key: "customer_name", label: "Customer", sortable: true },
    { key: "date", label: "Date", format: "datetime", sortable: true },
    { key: "amount", label: "Amount", format: "currency", sortable: true },
    { key: "payment_method", label: "Payment Method", sortable: true },
    { key: "type", label: "Type", sortable: true },
    { key: "status", label: "Status", sortable: true },
  ];

  // Custom salesperson filter
  const customFilters = useMemo(() => [
    {
      key: 'salesperson_id',
      label: 'Salesperson',
      dataKey: 'salesperson_id',
      options: [
        { value: 'all', label: 'All Salespeople' },
        ...salespeople.map(sp => ({ value: sp.id, label: sp.name }))
      ]
    }
  ], [salespeople]);

  // Chart data
  const chartData = useMemo(() => {
    const dailyData = rawTransactions.reduce((acc, item) => {
      const date = item.date
        ? new Date(item.date).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];
      const existing = acc.find(d => d.date === date);
      if (existing) {
        existing.sales += Number(item.amount) || 0;
        existing.count += 1;
      } else {
        acc.push({ date, sales: Number(item.amount) || 0, count: 1 });
      }
      return acc;
    }, []).slice(-7);

    const paymentData = rawTransactions.reduce((acc, item) => {
      const method = item.payment_method || 'Unknown';
      const existing = acc.find(m => m.method === method);
      if (existing) {
        existing.count += 1;
        existing.amount += Number(item.amount) || 0;
      } else {
        acc.push({ method, count: 1, amount: Number(item.amount) || 0 });
      }
      return acc;
    }, []);

    return { dailyData, paymentData };
  }, [rawTransactions]);

  // Render charts
  const renderCharts = () => (
    <>
      <ChartContainer title="Daily Sales Trend" subtitle="Revenue over last 7 days">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData.dailyData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value) => formatCurrency(value)} />
            <Line type="monotone" dataKey="sales" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartContainer>

      <ChartContainer title="Payment Methods" subtitle="Distribution by method">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData.paymentData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={4}
              dataKey="count"
            >
              {chartData.paymentData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value, name, props) => [`${value} transactions`, props.payload.method]} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </ChartContainer>
    </>
  );

  return (
    <UnifiedReportEngine
      title="Cashier Reports"
      subtitle="Payment transactions, sales analytics, and revenue tracking"
      icon={faMoneyBillWave}
      fetchData={fetchReportData}
      data={rawTransactions}
      columns={[]}
      summaryCards={summaryCards}
      charts={renderCharts()}
      statusOptions={["completed", "pending", "refunded", "cancelled"]}
      customFilters={customFilters}
      exportFilename="cashier-transactions-report"
      exportTitle="Cashier Transactions Report"
      tablePageSize={15}
      tableEmptyMessage="No transactions found"
      enableSavedFilters={true}
      refreshInterval={30000}
    />
  );
};

export default CashierReports;
