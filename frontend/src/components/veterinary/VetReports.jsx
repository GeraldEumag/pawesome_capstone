import React, { useCallback, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarCheck,
  faChartLine,
  faMoneyBillWave,
  faPaw,
  faStethoscope,
} from "@fortawesome/free-solid-svg-icons";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { apiRequest } from "../../api/client";
import { formatCurrency } from "../../utils/currency";
import { getDateRangePreset } from "../../utils/reportExport";
import UnifiedReportEngine, { ChartContainer, CHART_COLORS } from "../shared/UnifiedReportEngine";
import "./VetReports.css";

const getInitialDateRange = () => {
  try {
    const preset = getDateRangePreset("month");
    return {
      startDate: preset?.startDate || "",
      endDate: preset?.endDate || "",
    };
  } catch {
    return {
      startDate: "",
      endDate: "",
    };
  }
};

const emptyReports = {
  monthly_revenue: 0,
  monthly_completed: 0,
  period: "Current Month",
  service_breakdown: [],
  records: [],
};

const VetReports = () => {
  const [records, setRecords] = useState([]);
  const [services, setServices] = useState([]);
  const [serviceOptions, setServiceOptions] = useState([]);

  const fetchReportData = useCallback(async (filters) => {
    const params = new URLSearchParams();
    if (filters.startDate) params.append("start_date", filters.startDate);
    if (filters.endDate) params.append("end_date", filters.endDate);
    if (filters.status && filters.status !== "all") params.append("status", filters.status);

    const endpoint = params.toString() ? `/veterinary/reports?${params}` : "/veterinary/reports";
    const result = await apiRequest(endpoint);
    const data = result?.data || result || {};

    const normalizedRecords = (data.records || data.appointments || []).map((r, i) => ({
      id: r?.id || i + 1,
      customer: r?.customer?.name || r?.customer_name || "Customer",
      pet: r?.pet?.name || r?.pet_name || "Pet",
      serviceName: r?.service?.name || r?.service_name || "Unknown Service",
      status: (r?.status || "completed").toLowerCase().replace(/\s+/g, "_"),
      revenue: Number(r?.revenue || r?.amount || r?.price || 0),
      veterinarian: r?.veterinarian?.name || r?.vet_name || "Vet Staff",
      date: r?.date || r?.appointment_date || r?.created_at || "",
      raw: r,
    }));

    const serviceBreakdown = data.service_breakdown || data.services || [];
    const normalizedServices = serviceBreakdown.map((s, i) => ({
      id: s?.id || i + 1,
      serviceName: s?.service?.name || s?.service_name || "Unknown Service",
      count: Number(s?.count || s?.appointments || 0),
      revenue: Number(s?.revenue || s?.amount || 0),
      average_revenue: Number(s?.average_revenue || s?.revenue / (s?.count || 1) || 0),
    }));

    setRecords(normalizedRecords);
    setServices(normalizedServices);
    setServiceOptions([...new Set(normalizedServices.map((s) => s.serviceName))].sort());

    return normalizedRecords;
  }, []);

  // Summary cards
  const summaryCards = useMemo(() => {
    const totalRevenue = services.reduce((sum, s) => sum + s.revenue, 0);
    const totalAppointments = services.reduce((sum, s) => sum + s.count, 0);
    const completedRecords = records.filter((r) => r.status === "completed").length;

    return [
      { id: "revenue", label: "Monthly Revenue", value: formatCurrency(totalRevenue), icon: faMoneyBillWave, tone: "money", trend: "up", change: "+12%" },
      { id: "appointments", label: "Appointments", value: totalAppointments, icon: faCalendarCheck, tone: "primary", trend: "up", change: "+8%" },
      { id: "services", label: "Active Services", value: services.length, icon: faStethoscope, tone: "info", trend: "neutral" },
      { id: "completed", label: "Completed", value: completedRecords, icon: faPaw, tone: "success", trend: "up", change: "+15%" },
    ];
  }, [services, records]);

  // Table columns
  const tableColumns = [
    { key: "id", label: "ID", sortable: true },
    { key: "customer", label: "Customer", sortable: true },
    { key: "pet", label: "Pet", sortable: true },
    { key: "serviceName", label: "Service", sortable: true },
    { key: "veterinarian", label: "Veterinarian", sortable: true },
    { key: "date", label: "Date", format: "date", sortable: true },
    { key: "revenue", label: "Revenue", format: "currency", sortable: true },
    { key: "status", label: "Status", sortable: true },
  ];

  // Custom service type filter
  const customFilters = useMemo(
    () => [
      {
        key: "serviceType",
        label: "Service Type",
        dataKey: "serviceName",
        options: serviceOptions.map((s) => ({ value: s, label: s })),
      },
    ],
    [serviceOptions]
  );

  // Chart data
  const chartData = useMemo(() => {
    const topServices = [...services].sort((a, b) => b.revenue - a.revenue).slice(0, 6);
    const servicePie = topServices.map((s) => ({ name: s.serviceName, value: s.count }));

    return { topServices, servicePie };
  }, [services]);

  // Render charts
  const renderCharts = () => (
    <>
      <ChartContainer title="Service Revenue" subtitle="Top services by revenue">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData.topServices}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="serviceName" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value) => formatCurrency(value)} />
            <Bar dataKey="revenue" fill={CHART_COLORS[0]} radius={[8, 8, 0, 0]}>
              {chartData.topServices.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartContainer>

      <ChartContainer title="Appointment Distribution" subtitle="By service type">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={chartData.servicePie} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={4} dataKey="value">
              {chartData.servicePie.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value, name, props) => [`${value} appointments`, props.payload.name]} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </ChartContainer>
    </>
  );

  return (
    <UnifiedReportEngine
      title="Veterinary Reports"
      subtitle="Service revenue, appointments, and veterinary analytics"
      icon={faStethoscope}
      fetchData={fetchReportData}
      data={records}
      columns={tableColumns}
      summaryCards={summaryCards}
      charts={renderCharts()}
      statusOptions={["completed", "scheduled", "pending", "cancelled", "no_show"]}
      customFilters={customFilters}
      exportFilename="veterinary-reports"
      exportTitle="Veterinary Reports"
      tablePageSize={12}
      tableEmptyMessage="No veterinary records found"
      enableSavedFilters={true}
      refreshInterval={30000}
    />
  );
};

export default VetReports;
