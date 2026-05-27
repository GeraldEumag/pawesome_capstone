import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarAlt,
  faChartLine,
  faCheckCircle,
  faClock,
  faEye,
  faFileInvoiceDollar,
  faMoneyBillWave,
  faTriangleExclamation,
  faUserCheck,
  faUserTimes,
  faUsers,
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
import UnifiedReportEngine, { ChartContainer, CHART_COLORS } from "../shared/UnifiedReportEngine";
import "./ManagerReports.css";

// Use CHART_COLORS from UnifiedReportEngine

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

const TAB_CONFIG = [
  { key: 'summary', label: 'Summary', icon: faChartLine },
  { key: 'attendance', label: 'Attendance', icon: faCalendarAlt },
  { key: 'payroll', label: 'Payroll', icon: faMoneyBillWave },
  { key: 'staff', label: 'Staff', icon: faUsers },
];

const ManagerReports = () => {
  const defaultRange = useMemo(() => getDefaultDateRange(), []);

  const [activeTab, setActiveTab] = useState("summary");
  const [attendance, setAttendance] = useState([]);
  const [payroll, setPayroll] = useState([]);
  const [staff, setStaff] = useState([]);
  const [liveSummary, setLiveSummary] = useState({});
  const [departments, setDepartments] = useState([]);

  // Data loading is handled by UnifiedReportEngine

    async ({ silent = false } = {}) => {
      try {
        if (silent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        const [
          liveResponse,
          attendanceReportResponse,
          payrollReportResponse,
          staffResponse,
          attendanceFallbackResponse,
          payrollFallbackResponse,
        ] = await Promise.all([
          apiRequest("/manager/reports/live").catch(() => null),
          apiRequest("/manager/reports/attendance").catch(() => null),
          apiRequest("/manager/reports/payroll").catch(() => null),
          apiRequest("/manager/staff").catch(() => null),
          apiRequest("/manager/attendance").catch(() => null),
          apiRequest("/manager/payroll").catch(() => null),
        ]);

        const liveData = liveResponse?.data || liveResponse || {};
        const summary = liveData.summary || liveData || {};

        const attendanceReport = normalizeList(attendanceReportResponse, [
          "attendance",
          "records",
          "reports",
          "data",
        ]);

        const payrollReport = normalizeList(payrollReportResponse, [
          "payroll",
          "records",
          "reports",
          "data",
        ]);

        const staffList = normalizeList(staffResponse, ["staff", "users", "employees", "data"]);

        const attendanceFallback = normalizeList(attendanceFallbackResponse, [
          "attendance",
          "records",
          "items",
        ]);

        const payrollFallback = normalizeList(payrollFallbackResponse, [
          "payroll",
          "records",
          "items",
        ]);

        const attendanceSource =
          attendanceReport.length > 0 ? attendanceReport : attendanceFallback;

        const payrollSource = payrollReport.length > 0 ? payrollReport : payrollFallback;

        setLiveSummary(summary);
        setAttendance(attendanceSource.map(normalizeAttendance));
        setPayroll(payrollSource.map(normalizePayroll));
        setStaff(staffList.map(normalizeStaff));

        if (
          !liveResponse &&
          attendanceSource.length === 0 &&
          payrollSource.length === 0 &&
          staffList.length === 0
        ) {
          setError(
            "No manager report data is available yet. Please verify the manager report, attendance, payroll, and staff endpoints."
          );
        }
      } catch (err) {
        console.error("Manager reports load error:", err);
        setError(err.message || "Failed to load manager reports.");
        setAttendance([]);
        setPayroll([]);
        setStaff([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

