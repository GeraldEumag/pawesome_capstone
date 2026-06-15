import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarAlt,
  faCalendarCheck,
  faCalendarDay,
  faChartLine,
  faCheckCircle,
  faClock,
  faEye,
  faFileInvoiceDollar,
  faFingerprint,
  faMoneyBillWave,
  faTriangleExclamation,
  faUserCheck,
  faUserTimes,
  faUsers,
  faSpinner,
  faFileExcel,
  faFileCsv,
  faFilePdf,
  faPrint,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiRequest } from "../../api/client";
import { formatCurrency } from "../../utils/currency";
import { exportToCSV, exportToPDF, exportToExcel } from "../../utils/reportExport";
import StandardReportLayout from "../shared/StandardReportLayout";
import StandardTable from "../shared/StandardTable";
import "./ManagerReports.css";

// CHART_COLORS for charts
const CHART_COLORS = ["#ff5f93", "#ff8db5", "#ffc8dd", "#f59e0b", "#10b981", "#3b82f6"];

const getDefaultDateRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);

  return {
    startDate: start.toISOString().split("T")[0],
    endDate: now.toISOString().split("T")[0],
  };
};

const normalizeList = (payload, keys = []) => {
  if (Array.isArray(payload)) return payload;

  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
    if (Array.isArray(payload?.data?.[key])) return payload.data[key];
    if (Array.isArray(payload?.[key]?.data)) return payload[key].data;
    if (Array.isArray(payload?.data?.[key]?.data)) return payload.data[key].data;
  }

  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.records)) return payload.records;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;

  return [];
};

const safeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeStatus = (value) =>
  String(value || "pending")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");

const formatLabel = (value) =>
  String(value || "N/A")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatDate = (value) => {
  if (!value) return "N/A";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
};

const formatDateTime = (value) => {
  if (!value) return "N/A";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
};

const isWithinDateRange = (value, startDate, endDate) => {
  if (!value) return true;

  const recordDate = new Date(value);
  if (Number.isNaN(recordDate.getTime())) return true;

  const start = startDate ? new Date(`${startDate}T00:00:00`) : null;
  const end = endDate ? new Date(`${endDate}T23:59:59`) : null;

  if (start && recordDate < start) return false;
  if (end && recordDate > end) return false;

  return true;
};

const getEmployeeName = (record) =>
  record.employee_name ||
  record.staff_name ||
  record.user?.name ||
  record.employee?.name ||
  record.name ||
  "Unknown Employee";

const getDepartment = (record) =>
  record.department ||
  record.employee?.department ||
  record.user?.department ||
  record.role ||
  "Unassigned";

const getRole = (record) =>
  record.position ||
  record.role ||
  record.employee?.position ||
  record.user?.role ||
  "Staff";

const normalizeAttendance = (record, index) => {
  const status = normalizeStatus(record.status || record.attendance_status);
  const reviewStatus = normalizeStatus(
    record.review_status ||
      record.manager_review_status ||
      record.reviewStatus ||
      (record.reviewed || record.is_reviewed ? "reviewed" : "pending")
  );

  return {
    id: record.id || record.attendance_id || `attendance-${index}`,
    employeeName: getEmployeeName(record),
    employeeId: record.employee_id || record.staff_id || record.employee?.id || "N/A",
    department: getDepartment(record),
    role: getRole(record),
    date: record.date || record.attendance_date || record.created_at,
    timeIn: record.time_in || record.check_in || "",
    timeOut: record.time_out || record.check_out || "",
    status,
    reviewStatus,
    overtime: safeNumber(record.overtime_hours || record.overtime || record.ot_hours || 0),
    undertime: safeNumber(record.undertime_hours || record.undertime || 0),
    remarks: record.remarks || record.notes || record.manager_remarks || "",
  };
};

const normalizePayroll = (record, index) => {
  const grossPay = safeNumber(record.gross_pay || record.total_gross_pay || record.amount || 0);
  const deductions = safeNumber(record.total_deductions || record.deductions || 0);
  const netPay = safeNumber(record.net_pay || record.total_net_pay || grossPay - deductions);
  const status = normalizeStatus(record.status || record.payroll_status);

  return {
    id: record.id || record.payroll_id || `payroll-${index}`,
    employeeName: getEmployeeName(record),
    employeeId: record.employee_id || record.staff_id || record.employee?.id || "N/A",
    department: getDepartment(record),
    role: getRole(record),
    period: record.payroll_period || record.period || record.month || record.cutoff || "N/A",
    date: record.created_at || record.updated_at || record.payroll_date,
    attendanceDays: safeNumber(record.attendance_days || record.days_worked || record.present_days || 0),
    lateDeductions: safeNumber(record.late_deductions || record.late_deduction || 0),
    absenceDeductions: safeNumber(record.absence_deductions || record.absent_deductions || 0),
    overtimePay: safeNumber(record.overtime_pay || record.overtime_amount || 0),
    grossPay,
    deductions,
    netPay,
    status,
  };
};

const normalizeStaff = (record, index) => ({
  id: record.id || record.user_id || record.employee_id || `staff-${index}`,
  name: getEmployeeName(record),
  email: record.email || record.user?.email || record.employee?.email || "N/A",
  department: getDepartment(record),
  role: getRole(record),
  status: normalizeStatus(record.status || record.employment_status || "active"),
  hireDate: record.hire_date || record.created_at || record.date_hired || "",
  attendanceRecords: safeNumber(record.attendance_records || record.attendance_count || 0),
  payrollRecords: safeNumber(record.payroll_records || record.payroll_count || 0),
});

const getMonthKey = (dateValue) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "No Date";

  return date.toLocaleDateString("en-PH", {
    month: "short",
    year: "numeric",
  });
};

const normalizeLeave = (record, index) => ({
  id: record.id || `leave-${index}`,
  employeeName: record.employee_name || record.user?.name || "Unknown",
  employeeId: record.user_id || record.employee_id || "N/A",
  department: record.employee_role || record.user?.department || "Unassigned",
  role: record.employee_role || record.user?.role || "Staff",
  type: record.type || "leave",
  startDate: record.start_date,
  endDate: record.end_date,
  days: safeNumber(record.days || 0),
  reason: record.reason || "",
  status: normalizeStatus(record.status),
  managerRemarks: record.manager_remarks || "",
  reviewedBy: record.reviewed_by_name || "",
  reviewedAt: record.reviewed_at,
  createdAt: record.created_at,
});

const normalizeSchedule = (record, index) => ({
  id: record.id || `schedule-${index}`,
  employeeName: record.employee_name || record.user?.name || "Unknown",
  employeeId: record.user_id || record.employee_id || "N/A",
  department: record.employee_department || record.user?.department || "Unassigned",
  role: record.employee_role || record.user?.role || "Staff",
  dayOfWeek: record.day_of_week || record.day || "",
  shiftStart: record.shift_start || "",
  shiftEnd: record.shift_end || "",
  isOffDay: !!record.is_off_day,
  createdAt: record.created_at,
});

const TAB_CONFIG = [
  { key: 'summary', label: 'Summary', icon: faChartLine },
  { key: 'sales', label: 'Sales Report', icon: faFileInvoiceDollar },
  { key: 'payments', label: 'Payment Report', icon: faMoneyBillWave },
  { key: 'inventory', label: 'Inventory Report', icon: faTriangleExclamation },
  { key: 'services', label: 'Service Report', icon: faCalendarCheck },
  { key: 'customers', label: 'Customer Report', icon: faUsers },
  { key: 'staff', label: 'Staff Performance', icon: faUserCheck },
  { key: 'payroll', label: 'Payroll Summary', icon: faFileInvoiceDollar },
];

const ManagerReports = ({ initialTab }) => {
  const defaultRange = useMemo(() => getDefaultDateRange(), []);

  const [activeTab, setActiveTab] = useState(initialTab || "summary");
  const [salesData, setSalesData] = useState([]);
  const [paymentsData, setPaymentsData] = useState([]);
  const [inventoryData, setInventoryData] = useState([]);
  const [servicesData, setServicesData] = useState([]);
  const [customersData, setCustomersData] = useState([]);
  const [staff, setStaff] = useState([]);
  const [payroll, setPayroll] = useState([]);
  const [liveSummary, setLiveSummary] = useState({});
  const [departments, setDepartments] = useState([]);
  const [reportErrors, setReportErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [toast, setToast] = useState(null);
  const [theme, setTheme] = useState("light");

  // Data loading function
  const fetchReportData = useCallback(
    async ({ silent = false } = {}) => {
      try {
        if (silent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        const requestMap = [
          ["summary", apiRequest("/manager/reports/live")],
          ["sales", apiRequest("/manager/reports/sales")],
          ["payments", apiRequest("/manager/reports/payments")],
          ["inventory", apiRequest("/manager/reports/inventory")],
          ["services", apiRequest("/manager/reports/services")],
          ["customers", apiRequest("/manager/reports/customers")],
          ["staff", apiRequest("/manager/staff")],
          ["payroll", apiRequest("/manager/reports/payroll")],
        ];

        const settled = await Promise.allSettled(requestMap.map(([, request]) => request));
        const responses = {};
        const nextErrors = {};

        settled.forEach((result, index) => {
          const key = requestMap[index][0];
          if (result.status === "fulfilled") {
            responses[key] = result.value;
          } else {
            responses[key] = null;
            nextErrors[key] = result.reason?.message || "Report data is unavailable.";
          }
        });

        const liveResponse = responses.summary;
        const salesResponse = responses.sales;
        const paymentsResponse = responses.payments;
        const inventoryResponse = responses.inventory;
        const servicesResponse = responses.services;
        const customersResponse = responses.customers;
        const staffResponse = responses.staff;
        const payrollResponse = responses.payroll;

        const liveData = liveResponse?.data || liveResponse || {};
        const summary = liveData.summary || liveData || {};

        const salesList = normalizeList(salesResponse, ["sales", "records", "data"]);
        const paymentsList = normalizeList(paymentsResponse, ["payments", "records", "data"]);
        const inventoryList = normalizeList(inventoryResponse, ["inventory", "items", "data"]);
        const servicesList = normalizeList(servicesResponse, ["services", "requests", "data"]);
        const customersList = normalizeList(customersResponse, ["customers", "data"]);
        const staffList = normalizeList(staffResponse, ["staff", "users", "employees", "data"]);
        const payrollList = normalizeList(payrollResponse, ["payroll", "records", "data"]);

        setLiveSummary(summary);
        setSalesData(salesList);
        setPaymentsData(paymentsList);
        setInventoryData(inventoryList);
        setServicesData(servicesList);
        setCustomersData(customersList);
        setStaff(staffList.map(normalizeStaff));
        setPayroll(payrollList.map(normalizePayroll));
        setReportErrors(nextErrors);

        if (
          !liveResponse &&
          salesList.length === 0 &&
          paymentsList.length === 0 &&
          inventoryList.length === 0 &&
          servicesList.length === 0 &&
          customersList.length === 0 &&
          staffList.length === 0 &&
          payrollList.length === 0
        ) {
          setError("No manager report data is available yet. Empty executive report tabs are still available.");
        }
      } catch (err) {
        setError(err.message || "Failed to load manager reports.");
        setSalesData([]);
        setPaymentsData([]);
        setInventoryData([]);
        setServicesData([]);
        setCustomersData([]);
        setStaff([]);
        setPayroll([]);
        setReportErrors({ summary: err.message || "Report data is unavailable." });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  const statuses = useMemo(() => {
    const source =
      activeTab === "sales"
        ? salesData.map((item) => item.status)
        : activeTab === "payments"
          ? paymentsData.map((item) => item.status)
          : activeTab === "inventory"
            ? inventoryData.map((item) => item.status)
            : activeTab === "services"
              ? servicesData.map((item) => item.status)
              : activeTab === "customers"
                ? customersData.map((item) => item.status)
                : activeTab === "staff"
                  ? staff.map((item) => item.status)
                  : activeTab === "payroll"
                    ? payroll.map((item) => item.status)
                    : [
                        ...salesData.map((item) => item.status),
                        ...paymentsData.map((item) => item.status),
                        ...inventoryData.map((item) => item.status),
                        ...servicesData.map((item) => item.status),
                        ...customersData.map((item) => item.status),
                        ...staff.map((item) => item.status),
                        ...payroll.map((item) => item.status),
                      ];

    return [...new Set(source)].filter(Boolean).sort();
  }, [activeTab, salesData, paymentsData, inventoryData, servicesData, customersData, staff, payroll]);

  const filteredSales = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return salesData.filter((record) => {
      const matchesSearch =
        !search ||
        Object.values(record)
          .join(" ")
          .toLowerCase()
          .includes(search);
      const matchesStatus = statusFilter === "all" || record.status === statusFilter;
      const matchesDate = isWithinDateRange(record.date, startDate, endDate);
      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [salesData, endDate, searchTerm, startDate, statusFilter]);

  const filteredPayments = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return paymentsData.filter((record) => {
      const matchesSearch =
        !search ||
        Object.values(record)
          .join(" ")
          .toLowerCase()
          .includes(search);
      const matchesStatus = statusFilter === "all" || record.status === statusFilter;
      const matchesDate = isWithinDateRange(record.date, startDate, endDate);
      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [paymentsData, endDate, searchTerm, startDate, statusFilter]);

  const filteredInventory = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return inventoryData.filter((record) => {
      const matchesSearch =
        !search ||
        Object.values(record)
          .join(" ")
          .toLowerCase()
          .includes(search);
      const matchesStatus = statusFilter === "all" || record.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [inventoryData, searchTerm, statusFilter]);

  const filteredServices = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return servicesData.filter((record) => {
      const matchesSearch =
        !search ||
        Object.values(record)
          .join(" ")
          .toLowerCase()
          .includes(search);
      const matchesStatus = statusFilter === "all" || record.status === statusFilter;
      const matchesDate = isWithinDateRange(record.date, startDate, endDate);
      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [servicesData, endDate, searchTerm, startDate, statusFilter]);

  const filteredCustomers = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return customersData.filter((record) => {
      const matchesSearch =
        !search ||
        Object.values(record)
          .join(" ")
          .toLowerCase()
          .includes(search);
      return matchesSearch;
    });
  }, [customersData, searchTerm]);

  const filteredPayroll = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return payroll.filter((record) => {
      const matchesSearch =
        !search ||
        [
          record.employeeName,
          record.employeeId,
          record.department,
          record.role,
          record.period,
          record.status,
        ]
          .join(" ")
          .toLowerCase()
          .includes(search);

      const matchesStatus = statusFilter === "all" || record.status === statusFilter;
      const matchesDepartment =
        departmentFilter === "all" || record.department === departmentFilter;
      const matchesDate = isWithinDateRange(record.date, startDate, endDate);

      return matchesSearch && matchesStatus && matchesDepartment && matchesDate;
    });
  }, [departmentFilter, endDate, payroll, searchTerm, startDate, statusFilter]);

  const filteredStaff = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return staff.filter((record) => {
      const matchesSearch =
        !search ||
        [record.name, record.email, record.department, record.role, record.status]
          .join(" ")
          .toLowerCase()
          .includes(search);

      const matchesStatus = statusFilter === "all" || record.status === statusFilter;
      const matchesDepartment =
        departmentFilter === "all" || record.department === departmentFilter;

      return matchesSearch && matchesStatus && matchesDepartment;
    });
  }, [departmentFilter, searchTerm, staff, statusFilter]);

  // Filter functions
  const filterData = (data, filters) => {
    const search = filters.searchTerm?.trim().toLowerCase() || '';
    const status = filters.status || 'all';
    const dept = filters.department || 'all';
    const start = filters.startDate;
    const end = filters.endDate;

    return data.filter(item => {
      // Search filter
      if (search) {
        const searchableText = Object.values(item || {}).join(' ').toLowerCase();
        if (!searchableText.includes(search)) return false;
      }
      
      // Status filter
      if (status !== 'all' && item.status !== status) return false;
      
      // Department filter
      if (dept !== 'all' && item.department !== dept) return false;
      
      // Date filter
      if (start || end) {
        const itemDate = new Date(item.date || item.created_at);
        if (start && itemDate < new Date(start)) return false;
        if (end && itemDate > new Date(end)) return false;
      }
      
      return true;
    });
  };

  // Get filtered data for current tab
  const getFilteredData = useCallback((filters) => {
    switch (activeTab) {
      case 'sales': return filterData(salesData, filters);
      case 'payments': return filterData(paymentsData, filters);
      case 'inventory': return filterData(inventoryData, filters);
      case 'services': return filterData(servicesData, filters);
      case 'customers': return filterData(customersData, filters);
      case 'staff': return filterData(staff, filters);
      case 'payroll': return filterData(payroll, filters);
      default: {
        const all = [...salesData, ...paymentsData, ...inventoryData, ...servicesData, ...customersData, ...staff, ...payroll];
        return filterData(all, filters);
      }
    }
  }, [activeTab, salesData, paymentsData, inventoryData, servicesData, customersData, staff, payroll]);

  // Calculate summary stats
  const summary = useMemo(() => {
    return liveSummary || {
      totalSales: 0,
      totalReservations: 0,
      totalPayments: 0,
      totalInventory: 0,
      totalServices: 0,
      totalCustomers: 0,
      totalStaff: 0,
      totalPayroll: 0,
    };
  }, [liveSummary]);

  const salesStatusChart = useMemo(() => {
    const counts = {};
    filteredSales.forEach((item) => {
      counts[formatLabel(item.status)] = (counts[formatLabel(item.status)] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredSales]);

  const paymentsStatusChart = useMemo(() => {
    const counts = {};
    filteredPayments.forEach((item) => {
      counts[formatLabel(item.status)] = (counts[formatLabel(item.status)] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredPayments]);

  const inventoryStatusChart = useMemo(() => {
    const counts = {};
    filteredInventory.forEach((item) => {
      counts[formatLabel(item.status)] = (counts[formatLabel(item.status)] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredInventory]);

  const servicesStatusChart = useMemo(() => {
    const counts = {};
    filteredServices.forEach((item) => {
      counts[formatLabel(item.status)] = (counts[formatLabel(item.status)] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredServices]);

  const payrollStatusChart = useMemo(() => {
    const counts = {};
    filteredPayroll.forEach((item) => {
      counts[formatLabel(item.status)] = (counts[formatLabel(item.status)] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredPayroll]);

  const monthlyPayrollChart = useMemo(() => {
    const totals = {};

    filteredPayroll.forEach((item) => {
      const month = getMonthKey(item.date);
      totals[month] = (totals[month] || 0) + item.netPay;
    });

    return Object.entries(totals).map(([month, netPay]) => ({
      month,
      netPay,
    }));
  }, [filteredPayroll]);

  const salesTrendChart = useMemo(() => {
    const totals = {};

    filteredSales.forEach((item) => {
      const month = getMonthKey(item.date);

      if (!totals[month]) {
        totals[month] = {
          month,
          total: 0,
        };
      }

      totals[month].total += item.amount || 0;
    });

    return Object.values(totals);
  }, [filteredSales]);

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setDepartmentFilter("all");
    setStartDate(defaultRange.startDate);
    setEndDate(defaultRange.endDate);
  };

  const getActiveDataset = () => {
    if (activeTab === "sales") return filteredSales;
    if (activeTab === "payments") return filteredPayments;
    if (activeTab === "inventory") return filteredInventory;
    if (activeTab === "services") return filteredServices;
    if (activeTab === "customers") return filteredCustomers;
    if (activeTab === "staff") return filteredStaff;
    if (activeTab === "payroll") return filteredPayroll;

    return [
      ...filteredSales.map((item) => ({ ...item, reportType: "Sales" })),
      ...filteredPayments.map((item) => ({ ...item, reportType: "Payments" })),
      ...filteredInventory.map((item) => ({ ...item, reportType: "Inventory" })),
      ...filteredServices.map((item) => ({ ...item, reportType: "Services" })),
      ...filteredCustomers.map((item) => ({ ...item, reportType: "Customers" })),
      ...filteredStaff.map((item) => ({ ...item, reportType: "Staff" })),
      ...filteredPayroll.map((item) => ({ ...item, reportType: "Payroll" })),
    ];
  };

  const getExportColumns = () => {
    if (activeTab === "sales") {
      return [
        { key: "id", label: "ID" },
        { key: "date", label: "Date" },
        { key: "amount", label: "Amount" },
        { key: "status", label: "Status" },
      ];
    }
    if (activeTab === "payments") {
      return [
        { key: "id", label: "ID" },
        { key: "date", label: "Date" },
        { key: "amount", label: "Amount" },
        { key: "method", label: "Method" },
        { key: "status", label: "Status" },
      ];
    }
    if (activeTab === "inventory") {
      return [
        { key: "id", label: "ID" },
        { key: "name", label: "Name" },
        { key: "quantity", label: "Quantity" },
        { key: "status", label: "Status" },
      ];
    }
    if (activeTab === "services") {
      return [
        { key: "id", label: "ID" },
        { key: "date", label: "Date" },
        { key: "service", label: "Service" },
        { key: "status", label: "Status" },
      ];
    }
    if (activeTab === "customers") {
      return [
        { key: "id", label: "ID" },
        { key: "name", label: "Name" },
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
      ];
    }
    if (activeTab === "staff") {
      return [
        { key: "id", label: "ID" },
        { key: "name", label: "Name" },
        { key: "role", label: "Role" },
        { key: "status", label: "Status" },
      ];
    }
    if (activeTab === "payroll") {
      return [
        { key: "employeeName", label: "Employee" },
        { key: "employeeId", label: "Employee ID" },
        { key: "department", label: "Department" },
        { key: "role", label: "Role" },
        { key: "period", label: "Period" },
        { key: "attendanceDays", label: "Attendance Days" },
        { key: "grossPay", label: "Gross Pay" },
        { key: "deductions", label: "Deductions" },
        { key: "netPay", label: "Net Pay" },
        { key: "status", label: "Status" },
      ];
    }
    if (activeTab === "leave") {
      return [
        { key: "employeeName", label: "Employee" },
        { key: "department", label: "Department" },
        { key: "type", label: "Type" },
        { key: "startDate", label: "From" },
        { key: "endDate", label: "To" },
        { key: "days", label: "Days" },
        { key: "status", label: "Status" },
        { key: "reason", label: "Reason" },
      ];
    }
    if (activeTab === "schedule") {
      return [
        { key: "employeeName", label: "Employee" },
        { key: "department", label: "Department" },
        { key: "dayOfWeek", label: "Day" },
        { key: "shiftStart", label: "Start" },
        { key: "shiftEnd", label: "End" },
        { key: "isOffDay", label: "Off Day" },
      ];
    }
    if (activeTab === "staff") {
      return [
        { key: "name", label: "Name" },
        { key: "email", label: "Email" },
        { key: "department", label: "Department" },
        { key: "role", label: "Role" },
        { key: "status", label: "Status" },
        { key: "hireDate", label: "Hire Date" },
        { key: "attendanceRecords", label: "Attendance Records" },
        { key: "payrollRecords", label: "Payroll Records" },
      ];
    }
    return [
      { key: "reportType", label: "Report Type" },
      { key: "employeeName", label: "Employee" },
      { key: "name", label: "Name" },
      { key: "department", label: "Department" },
      { key: "role", label: "Role" },
      { key: "status", label: "Status" },
      { key: "date", label: "Date" },
      { key: "period", label: "Period" },
      { key: "netPay", label: "Net Pay" },
    ];
  };

  const handleExport = (type) => {
    if (activeTab === "biometric") {
      showToast("warning", "Biometric report does not support tabular export.");
      return;
    }
    const dataset = getActiveDataset();

    if (dataset.length === 0) {
      showToast("warning", "There is no report data to export.");
      return;
    }

    const columns = getExportColumns();
    const filename = `manager-${activeTab}-report`;
    const title = getTabTitle(activeTab);

    try {
      if (type === "csv") {
        exportToCSV(dataset, columns, filename);
      } else if (type === "pdf") {
        exportToPDF(dataset, columns, title, filename);
      } else if (type === "excel") {
        exportToExcel(dataset, columns, filename);
      }
      showToast("success", `${title} exported as ${type.toUpperCase()} successfully.`);
    } catch (err) {
      console.error("Export failed:", err);
      showToast("error", `Failed to export ${type.toUpperCase()} report.`);
    }
  };

  const printReport = () => {
    window.print();
  };

  const renderSummaryTab = () => (
    <>
      <section className="manager-report-chart-grid">
        <ChartCard title="Sales Status Distribution">
          {salesStatusChart.length === 0 ? (
            <ChartEmpty message="No sales status data available." />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={salesStatusChart}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={95}
                  label
                >
                  {salesStatusChart.map((entry, index) => (
                    <Cell
                      key={entry.name}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Payroll Status Distribution">
          {payrollStatusChart.length === 0 ? (
            <ChartEmpty message="No payroll status data available." />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={payrollStatusChart}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={95}
                  label
                >
                  {payrollStatusChart.map((entry, index) => (
                    <Cell
                      key={entry.name}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Monthly Payroll Net Pay" wide>
          {monthlyPayrollChart.length === 0 ? (
            <ChartEmpty message="No monthly payroll data available." />
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={monthlyPayrollChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Bar dataKey="netPay" name="Net Pay" fill="#ff5f93" radius={[12, 12, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Sales Trend" wide>
          {salesTrendChart.length === 0 ? (
            <ChartEmpty message="No sales trend data available." />
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={salesTrendChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
                <Line type="monotone" dataKey="total" stroke="#10b981" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Sales by Category" wide>
          {filteredSales.length === 0 ? (
            <ChartEmpty message="No sales category data available." />
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={Object.entries(filteredSales.reduce((acc, item) => {
                acc[item.category || "Other"] = (acc[item.category || "Other"] || 0) + (item.amount || 0);
                return acc;
              }, {})).map(([category, total]) => ({ category, total }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="category" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Bar dataKey="total" name="Total Sales" fill="#3b82f6" radius={[12, 12, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Department Payroll Distribution" wide>
          {filteredPayroll.length === 0 ? (
            <ChartEmpty message="No department payroll data available." />
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={Object.entries(filteredPayroll.reduce((acc, item) => {
                acc[item.department] = (acc[item.department] || 0) + item.netPay;
                return acc;
              }, {})).map(([dept, total]) => ({ department: dept, total }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="department" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Bar dataKey="total" name="Net Pay" fill="#14b8a6" radius={[12, 12, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </section>
    </>
  );

  const attendanceColumns = [
    { key: "employeeName", label: "Employee", sortable: true, render: (value, record) => (
      <div>
        <strong>{value}</strong>
        <small style={{ display: "block", color: "#64748b" }}>{record.employeeId}</small>
      </div>
    )},
    { key: "department", label: "Department", sortable: true },
    { key: "role", label: "Role", sortable: true },
    { key: "date", label: "Date", sortable: true, render: (value) => formatDate(value) },
    { key: "status", label: "Status", sortable: true, render: (value) => <StatusBadge status={value} /> },
    { key: "reviewStatus", label: "Review", sortable: true, render: (value) => <StatusBadge status={value} /> },
    { key: "overtime", label: "Overtime", sortable: true, render: (value) => `${value}h` },
    { key: "undertime", label: "Undertime", sortable: true, render: (value) => `${value}h` },
    { key: "actions", label: "Actions", sortable: false, render: (_value, record) => (
      <button
        type="button"
        className="report-view-btn"
        onClick={() => setSelectedRecord({ type: "attendance", record })}
      >
        <FontAwesomeIcon icon={faEye} />
        View
      </button>
    )},
  ];

  const renderAttendanceTab = () => (
    <StandardTable
      columns={attendanceColumns}
      data={filteredAttendance}
      emptyMessage="No attendance records found."
      pageSize={10}
    />
  );

  const renderSalesTab = () => (
    <StandardTable
      columns={[{ key: "id", label: "ID" }, { key: "date", label: "Date" }, { key: "amount", label: "Amount" }, { key: "status", label: "Status" }]}
      data={filteredSales}
      emptyMessage="No sales records found."
      pageSize={10}
    />
  );

  const renderPaymentsTab = () => (
    <StandardTable
      columns={[{ key: "id", label: "ID" }, { key: "date", label: "Date" }, { key: "amount", label: "Amount" }, { key: "method", label: "Method" }, { key: "status", label: "Status" }]}
      data={filteredPayments}
      emptyMessage="No payment records found."
      pageSize={10}
    />
  );

  const renderInventoryTab = () => (
    <StandardTable
      columns={[{ key: "id", label: "ID" }, { key: "name", label: "Name" }, { key: "quantity", label: "Quantity" }, { key: "status", label: "Status" }]}
      data={filteredInventory}
      emptyMessage="No inventory records found."
      pageSize={10}
    />
  );

  const renderServicesTab = () => (
    <StandardTable
      columns={[{ key: "id", label: "ID" }, { key: "date", label: "Date" }, { key: "service", label: "Service" }, { key: "status", label: "Status" }]}
      data={filteredServices}
      emptyMessage="No service records found."
      pageSize={10}
    />
  );

  const renderCustomersTab = () => (
    <StandardTable
      columns={[{ key: "id", label: "ID" }, { key: "name", label: "Name" }, { key: "email", label: "Email" }, { key: "phone", label: "Phone" }]}
      data={filteredCustomers}
      emptyMessage="No customer records found."
      pageSize={10}
    />
  );

  const payrollColumns = [
    { key: "employeeName", label: "Employee", sortable: true, render: (value, record) => (
      <div>
        <strong>{value}</strong>
        <small style={{ display: "block", color: "#64748b" }}>{record.employeeId}</small>
      </div>
    )},
    { key: "department", label: "Department", sortable: true },
    { key: "period", label: "Period", sortable: true },
    { key: "attendanceDays", label: "Attendance Days", sortable: true },
    { key: "overtimePay", label: "OT Pay", sortable: true, format: "currency" },
    { key: "regularHolidayPay", label: "Reg. Holiday", sortable: true, format: "currency" },
    { key: "specialHolidayPay", label: "Spl. Holiday", sortable: true, format: "currency" },
    { key: "nightDifferential", label: "Night Diff.", sortable: true, format: "currency" },
    { key: "grossPay", label: "Gross Pay", sortable: true, format: "currency" },
    { key: "deductions", label: "Deductions", sortable: true, format: "currency" },
    { key: "netPay", label: "Net Pay", sortable: true, render: (value) => <strong>{formatCurrency(value)}</strong> },
    { key: "status", label: "Status", sortable: true, render: (value) => <StatusBadge status={value} /> },
    { key: "actions", label: "Actions", sortable: false, render: (_value, record) => (
      <button
        type="button"
        className="report-view-btn"
        onClick={() => setSelectedRecord({ type: "payroll", record })}
      >
        <FontAwesomeIcon icon={faEye} />
        View
      </button>
    )},
  ];

  const renderPayrollTab = () => (
    <StandardTable
      columns={payrollColumns}
      data={filteredPayroll}
      emptyMessage="No payroll records found."
      pageSize={10}
    />
  );

  const staffColumns = [
    { key: "name", label: "Staff", sortable: true, render: (value, record) => (
      <div>
        <strong>{value}</strong>
        <small style={{ display: "block", color: "#64748b" }}>{record.id}</small>
      </div>
    )},
    { key: "email", label: "Email", sortable: true },
    { key: "department", label: "Department", sortable: true },
    { key: "role", label: "Role", sortable: true },
    { key: "status", label: "Status", sortable: true, render: (value) => <StatusBadge status={value} /> },
    { key: "attendanceRecords", label: "Attendance Records", sortable: true },
    { key: "payrollRecords", label: "Payroll Records", sortable: true },
    { key: "actions", label: "Actions", sortable: false, render: (_value, record) => (
      <button
        type="button"
        className="report-view-btn"
        onClick={() => setSelectedRecord({ type: "staff", record })}
      >
        <FontAwesomeIcon icon={faEye} />
        View
      </button>
    )},
  ];

  const renderStaffTab = () => (
    <StandardTable
      columns={staffColumns}
      data={filteredStaff}
      emptyMessage="No staff records found."
      pageSize={10}
    />
  );

  return (
    <StandardReportLayout
      title="Executive Monitoring Reports"
      subtitle="Review sales, payments, inventory, services, customers, staff performance, and payroll summaries in one workspace."
      icon={faChartLine}
      loading={false}
      error=""
      onRefresh={() => fetchReportData({ silent: true })}
      lastUpdated={formatDateTime(new Date())}
    >
    <div className={`manager-reports ${theme}`}>

      {error && (
        <div className="reports-alert error">
          <FontAwesomeIcon icon={faTriangleExclamation} />
          <span>{error}</span>
          <button type="button" onClick={() => fetchReportData()}>
            Retry
          </button>
        </div>
      )}

      <section className="reports-summary-grid">
        <SummaryCard
          label="Total Sales"
          value={summary.totalSales || 0}
          icon={faFileInvoiceDollar}
          tone="money"
        />
        <SummaryCard
          label="Total Reservations"
          value={summary.totalReservations || 0}
          icon={faCalendarCheck}
          tone="primary"
        />
        <SummaryCard
          label="Total Payments"
          value={summary.totalPayments || 0}
          icon={faMoneyBillWave}
          tone="success"
        />
        <SummaryCard
          label="Inventory Items"
          value={summary.totalInventory || 0}
          icon={faTriangleExclamation}
          tone="warning"
        />
        <SummaryCard
          label="Total Services"
          value={summary.totalServices || 0}
          icon={faCalendarAlt}
          tone="info"
        />
        <SummaryCard
          label="Total Customers"
          value={summary.totalCustomers || 0}
          icon={faUsers}
          tone="primary"
        />
        <SummaryCard
          label="Total Staff"
          value={summary.totalStaff || 0}
          icon={faUserCheck}
          tone="success"
        />
        <SummaryCard
          label="Total Payroll"
          value={summary.totalPayroll || 0}
          icon={faFileInvoiceDollar}
          tone="money"
        />
      </section>

      <section className="reports-tabs">
        {TAB_CONFIG.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              type="button"
              key={tab.key}
              className={activeTab === tab.key ? "active" : ""}
              onClick={() => setActiveTab(tab.key)}
            >
              <FontAwesomeIcon icon={Icon} />
              {tab.label}
            </button>
          );
        })}
      </section>

      {loading && (
        <div className="reports-loading-state">
          <FontAwesomeIcon icon={faSpinner} spin />
          <h2>Loading manager reports</h2>
          <p>Please wait while attendance, payroll, and staff reports are being loaded.</p>
        </div>
      )}

      {reportErrors[activeTab] && (
        <div className="reports-alert warning">
          <FontAwesomeIcon icon={faTriangleExclamation} />
          <span>{reportErrors[activeTab]}</span>
        </div>
      )}

      <section className="reports-content-card">
          <div className="reports-content-header">
            <div>
              <span className="reports-eyebrow">{formatLabel(activeTab)}</span>
              <h2>{getTabTitle(activeTab)}</h2>
            </div>

            <div className="reports-header-actions">
              <p>
                Last updated: <strong>{formatDateTime(new Date())}</strong>
              </p>
              <div className="manager-export-actions">
                <button className="export-btn-sm excel" type="button" onClick={() => handleExport("excel")} title="Export Excel">
                  <FontAwesomeIcon icon={faFileExcel} />
                  <span>Excel</span>
                </button>
                <button className="export-btn-sm csv" type="button" onClick={() => handleExport("csv")} title="Export CSV">
                  <FontAwesomeIcon icon={faFileCsv} />
                  <span>CSV</span>
                </button>
                <button className="export-btn-sm pdf" type="button" onClick={() => handleExport("pdf")} title="Export PDF">
                  <FontAwesomeIcon icon={faFilePdf} />
                  <span>PDF</span>
                </button>
                <button className="export-btn-sm print" type="button" onClick={printReport} title="Print">
                  <FontAwesomeIcon icon={faPrint} />
                  <span>Print</span>
                </button>
              </div>
            </div>
          </div>

          {activeTab === "summary" && renderSummaryTab()}
          {activeTab === "sales" && renderSalesTab()}
          {activeTab === "payments" && renderPaymentsTab()}
          {activeTab === "inventory" && renderInventoryTab()}
          {activeTab === "services" && renderServicesTab()}
          {activeTab === "customers" && renderCustomersTab()}
          {activeTab === "staff" && renderStaffTab()}
          {activeTab === "payroll" && renderPayrollTab()}
        </section>

      <PrintArea
        summary={summary}
        sales={filteredSales}
        payments={filteredPayments}
        inventory={filteredInventory}
        services={filteredServices}
        customers={filteredCustomers}
        payroll={filteredPayroll}
        staff={filteredStaff}
        activeTab={activeTab}
      />

      {selectedRecord && (
        <ReportDetailsModal
          selectedRecord={selectedRecord}
          onClose={() => setSelectedRecord(null)}
        />
      )}

      {toast && (
        <div className={`reports-toast ${toast.type}`}>
          <FontAwesomeIcon
            icon={toast.type === "warning" ? faTriangleExclamation : faCheckCircle}
          />
          <span>{toast.message}</span>
        </div>
      )}
    </div>
    </StandardReportLayout>
  );
};

const getTabTitle = (activeTab) => {
  if (activeTab === "sales") return "Sales Report";
  if (activeTab === "payments") return "Payment Report";
  if (activeTab === "inventory") return "Inventory Report";
  if (activeTab === "services") return "Service Report";
  if (activeTab === "customers") return "Customer Report";
  if (activeTab === "staff") return "Staff Performance Report";
  if (activeTab === "payroll") return "Payroll Summary";
  return "Executive Report Summary";
};

const SummaryCard = ({ label, value, icon, tone }) => (
  <article className={`reports-summary-card ${tone}`}>
    <span>
      <FontAwesomeIcon icon={icon} />
    </span>
    <div>
      <strong>{value}</strong>
      <p>{label}</p>
    </div>
  </article>
);

const FilterField = ({ label, children }) => (
  <label className="reports-filter-field">
    <span>{label}</span>
    {children}
  </label>
);

const ChartCard = ({ title, children, wide = false }) => (
  <article className={`reports-chart-card ${wide ? "wide" : ""}`}>
    <h3>{title}</h3>
    {children}
  </article>
);

const ChartEmpty = ({ message }) => (
  <div className="reports-chart-empty">
    <FontAwesomeIcon icon={faChartLine} />
    <p>{message}</p>
  </div>
);

const StatusBadge = ({ status }) => (
  <span className={`reports-status ${normalizeStatus(status)}`}>
    {formatLabel(status)}
  </span>
);


const ReportDetailsModal = ({ selectedRecord, onClose }) => {
  const { type, record } = selectedRecord;

  return (
    <div className="reports-modal-overlay">
      <div className="reports-modal">
        <div className="reports-modal-header">
          <div>
            <span className="reports-eyebrow">{formatLabel(type)} Details</span>
            <h2>
              {record.employeeName || record.name || record.period || "Report Record"}
            </h2>
          </div>

          <button type="button" onClick={onClose}>
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className="reports-modal-body">
          <div className="reports-detail-grid">
            {Object.entries(record).map(([key, value]) => (
              <div key={key}>
                <small>{formatLabel(key)}</small>
                <strong>
                  {typeof value === "number" && key.toLowerCase().includes("pay")
                    ? formatCurrency(value)
                    : String(value || "N/A")}
                </strong>
              </div>
            ))}
          </div>
        </div>

        <div className="reports-modal-footer">
          <button type="button" className="reports-btn secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const PrintArea = ({ summary, sales, payments, inventory, services, customers, payroll, staff, activeTab }) => (
  <section className="manager-reports-print">
    <h1>Pawesome Retreat Inc.</h1>
    <h2>{getTabTitle(activeTab)}</h2>
    <p>Generated: {formatDateTime(new Date())}</p>

    <div className="print-summary">
      <span>Total Sales: {summary.totalSales || 0}</span>
      <span>Total Reservations: {summary.totalReservations || 0}</span>
      <span>Total Payments: {summary.totalPayments || 0}</span>
      <span>Total Customers: {summary.totalCustomers || 0}</span>
    </div>

    {sales && sales.length > 0 && (
      <>
        <h3>Sales Summary</h3>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Date</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((item) => (
              <tr key={item.id}>
                <td>{item.id}</td>
                <td>{formatDate(item.date)}</td>
                <td>{formatCurrency(item.amount)}</td>
                <td>{formatLabel(item.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    )}

    {payroll && payroll.length > 0 && (
      <>
        <h3>Payroll Summary</h3>
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Period</th>
              <th>Gross Pay</th>
              <th>Deductions</th>
              <th>Net Pay</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {payroll.map((item) => (
              <tr key={item.id}>
                <td>{item.employeeName}</td>
                <td>{item.period}</td>
                <td>{formatCurrency(item.grossPay)}</td>
                <td>{formatCurrency(item.deductions)}</td>
                <td>{formatCurrency(item.netPay)}</td>
                <td>{formatLabel(item.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    )}

    {staff && staff.length > 0 && (
      <>
        <h3>Staff Summary</h3>
        <table>
          <thead>
            <tr>
              <th>Staff</th>
              <th>Email</th>
              <th>Department</th>
              <th>Role</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.email}</td>
                <td>{item.department}</td>
                <td>{item.role}</td>
                <td>{formatLabel(item.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    )}
  </section>
);

export default ManagerReports;
