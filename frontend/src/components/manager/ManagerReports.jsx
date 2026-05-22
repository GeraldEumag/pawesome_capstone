import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import DatePickerInput from "../../components/shared/DatePickerInput";
import {
  faCalendarAlt,
  faChartLine,
  faCheckCircle,
  faClock,
  faDownload,
  faEye,
  faFileInvoiceDollar,
  faFilter,
  faMoneyBillWave,
  faPrint,
  faRefresh,
  faSearch,
  faSpinner,
  faTable,
  faTriangleExclamation,
  faUserCheck,
  faUserTimes,
  faUsers,
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
import { useTheme } from "../../utils/theme";
import "./ManagerReports.css";

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

const escapeCSV = (value) => {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
};

const ManagerReports = () => {
  const { theme } = useTheme();
  const defaultRange = useMemo(() => getDefaultDateRange(), []);

  const [activeTab, setActiveTab] = useState("summary");
  const [attendance, setAttendance] = useState([]);
  const [payroll, setPayroll] = useState([]);
  const [staff, setStaff] = useState([]);
  const [liveSummary, setLiveSummary] = useState({});

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const [statusFilter, setStatusFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");

  const [selectedRecord, setSelectedRecord] = useState(null);

  const showToast = useCallback((message, type = "info") => {
    setToast({ message, type });
    window.clearTimeout(window.managerReportsToastTimer);
    window.managerReportsToastTimer = window.setTimeout(() => setToast(null), 3500);
  }, []);

  const fetchReportData = useCallback(
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

  const departments = useMemo(() => {
    const values = [
      ...attendance.map((item) => item.department),
      ...payroll.map((item) => item.department),
      ...staff.map((item) => item.department),
    ];

    return [...new Set(values)].filter(Boolean).sort();
  }, [attendance, payroll, staff]);

  const statuses = useMemo(() => {
    const source =
      activeTab === "attendance"
        ? attendance.map((item) => item.status)
        : activeTab === "payroll"
          ? payroll.map((item) => item.status)
          : activeTab === "staff"
            ? staff.map((item) => item.status)
            : [
                ...attendance.map((item) => item.status),
                ...payroll.map((item) => item.status),
                ...staff.map((item) => item.status),
              ];

    return [...new Set(source)].filter(Boolean).sort();
  }, [activeTab, attendance, payroll, staff]);

  const filteredAttendance = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return attendance.filter((record) => {
      const matchesSearch =
        !search ||
        [
          record.employeeName,
          record.employeeId,
          record.department,
          record.role,
          record.status,
          record.reviewStatus,
          record.remarks,
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
  }, [attendance, departmentFilter, endDate, searchTerm, startDate, statusFilter]);

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

  const summary = useMemo(() => {
    const present = filteredAttendance.filter((item) => item.status === "present").length;
    const late = filteredAttendance.filter((item) => item.status === "late").length;
    const absent = filteredAttendance.filter((item) => item.status === "absent").length;
    const pendingReview = filteredAttendance.filter(
      (item) => item.reviewStatus !== "reviewed"
    ).length;

    const grossPay = filteredPayroll.reduce((sum, item) => sum + item.grossPay, 0);
    const deductions = filteredPayroll.reduce((sum, item) => sum + item.deductions, 0);
    const netPay = filteredPayroll.reduce((sum, item) => sum + item.netPay, 0);
    const pendingPayroll = filteredPayroll.filter((item) =>
      ["pending", "pending_review", "draft", "for_approval"].includes(item.status)
    ).length;
    const approvedPayroll = filteredPayroll.filter((item) =>
      ["approved", "released", "paid"].includes(item.status)
    ).length;

    const activeStaff = filteredStaff.filter((item) => item.status === "active").length;

    return {
      totalAttendance: filteredAttendance.length,
      present,
      late,
      absent,
      pendingReview,
      payrollRecords: filteredPayroll.length,
      grossPay,
      deductions,
      netPay,
      pendingPayroll,
      approvedPayroll,
      totalStaff: filteredStaff.length,
      activeStaff,
      liveTotalStaff: liveSummary.total_staff || liveSummary.total_employees || staff.length,
      liveMonthlyRevenue: liveSummary.monthly_revenue || liveSummary.total_revenue || 0,
    };
  }, [filteredAttendance, filteredPayroll, filteredStaff, liveSummary, staff.length]);

  const attendanceStatusChart = useMemo(() => {
    const counts = {};

    filteredAttendance.forEach((item) => {
      counts[formatLabel(item.status)] = (counts[formatLabel(item.status)] || 0) + 1;
    });

    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredAttendance]);

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

  const attendanceTrendChart = useMemo(() => {
    const totals = {};

    filteredAttendance.forEach((item) => {
      const month = getMonthKey(item.date);

      if (!totals[month]) {
        totals[month] = {
          month,
          present: 0,
          late: 0,
          absent: 0,
        };
      }

      if (item.status === "present") totals[month].present += 1;
      if (item.status === "late") totals[month].late += 1;
      if (item.status === "absent") totals[month].absent += 1;
    });

    return Object.values(totals);
  }, [filteredAttendance]);

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setDepartmentFilter("all");
    setStartDate(defaultRange.startDate);
    setEndDate(defaultRange.endDate);
  };

  const getActiveDataset = () => {
    if (activeTab === "attendance") return filteredAttendance;
    if (activeTab === "payroll") return filteredPayroll;
    if (activeTab === "staff") return filteredStaff;

    return [
      ...filteredAttendance.map((item) => ({ ...item, reportType: "Attendance" })),
      ...filteredPayroll.map((item) => ({ ...item, reportType: "Payroll" })),
      ...filteredStaff.map((item) => ({ ...item, reportType: "Staff" })),
    ];
  };

  const exportCSV = () => {
    const dataset = getActiveDataset();

    if (dataset.length === 0) {
      showToast("There is no report data to export.", "warning");
      return;
    }

    const columns =
      activeTab === "attendance"
        ? [
            "employeeName",
            "employeeId",
            "department",
            "role",
            "date",
            "status",
            "reviewStatus",
            "overtime",
            "undertime",
            "remarks",
          ]
        : activeTab === "payroll"
          ? [
              "employeeName",
              "employeeId",
              "department",
              "role",
              "period",
              "attendanceDays",
              "grossPay",
              "deductions",
              "netPay",
              "status",
            ]
          : activeTab === "staff"
            ? [
                "name",
                "email",
                "department",
                "role",
                "status",
                "hireDate",
                "attendanceRecords",
                "payrollRecords",
              ]
            : [
                "reportType",
                "employeeName",
                "name",
                "department",
                "role",
                "status",
                "date",
                "period",
                "netPay",
              ];

    const rows = [
      columns.map(formatLabel),
      ...dataset.map((item) =>
        columns.map((column) => {
          const value = item[column];

          if (["grossPay", "deductions", "netPay"].includes(column)) {
            return formatCurrency(value || 0);
          }

          if (["date", "hireDate"].includes(column)) {
            return formatDate(value);
          }

          return value ?? "";
        })
      ),
    ];

    const csvContent = rows.map((row) => row.map(escapeCSV).join(",")).join("\n");
    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `manager-${activeTab}-report-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();

    URL.revokeObjectURL(url);
    showToast("Report exported successfully.", "success");
  };

  const printReport = () => {
    window.print();
  };

  const renderSummaryTab = () => (
    <>
      <section className="manager-report-chart-grid">
        <ChartCard title="Attendance Status Distribution">
          {attendanceStatusChart.length === 0 ? (
            <ChartEmpty message="No attendance status data available." />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={attendanceStatusChart}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={95}
                  label
                >
                  {attendanceStatusChart.map((entry, index) => (
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

        <ChartCard title="Attendance Trend" wide>
          {attendanceTrendChart.length === 0 ? (
            <ChartEmpty message="No attendance trend data available." />
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={attendanceTrendChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="present" stroke="#10b981" strokeWidth={3} />
                <Line type="monotone" dataKey="late" stroke="#f59e0b" strokeWidth={3} />
                <Line type="monotone" dataKey="absent" stroke="#ef4444" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </section>
    </>
  );

  const renderAttendanceTab = () => (
    <ReportTable
      columns={[
        "Employee",
        "Department",
        "Role",
        "Date",
        "Status",
        "Review",
        "Overtime",
        "Undertime",
        "Actions",
      ]}
      emptyMessage="No attendance records found."
    >
      {filteredAttendance.map((record) => (
        <tr key={record.id}>
          <td>
            <strong>{record.employeeName}</strong>
            <small>{record.employeeId}</small>
          </td>
          <td>{record.department}</td>
          <td>{record.role}</td>
          <td>{formatDate(record.date)}</td>
          <td>
            <StatusBadge status={record.status} />
          </td>
          <td>
            <StatusBadge status={record.reviewStatus} />
          </td>
          <td>{record.overtime}h</td>
          <td>{record.undertime}h</td>
          <td>
            <button
              type="button"
              className="report-view-btn"
              onClick={() => setSelectedRecord({ type: "attendance", record })}
            >
              <FontAwesomeIcon icon={faEye} />
              View
            </button>
          </td>
        </tr>
      ))}
    </ReportTable>
  );

  const renderPayrollTab = () => (
    <ReportTable
      columns={[
        "Employee",
        "Department",
        "Period",
        "Attendance Days",
        "Gross Pay",
        "Deductions",
        "Net Pay",
        "Status",
        "Actions",
      ]}
      emptyMessage="No payroll records found."
    >
      {filteredPayroll.map((record) => (
        <tr key={record.id}>
          <td>
            <strong>{record.employeeName}</strong>
            <small>{record.employeeId}</small>
          </td>
          <td>{record.department}</td>
          <td>{record.period}</td>
          <td>{record.attendanceDays}</td>
          <td>{formatCurrency(record.grossPay)}</td>
          <td>{formatCurrency(record.deductions)}</td>
          <td>
            <strong>{formatCurrency(record.netPay)}</strong>
          </td>
          <td>
            <StatusBadge status={record.status} />
          </td>
          <td>
            <button
              type="button"
              className="report-view-btn"
              onClick={() => setSelectedRecord({ type: "payroll", record })}
            >
              <FontAwesomeIcon icon={faEye} />
              View
            </button>
          </td>
        </tr>
      ))}
    </ReportTable>
  );

  const renderStaffTab = () => (
    <ReportTable
      columns={[
        "Staff",
        "Email",
        "Department",
        "Role",
        "Status",
        "Attendance Records",
        "Payroll Records",
        "Actions",
      ]}
      emptyMessage="No staff records found."
    >
      {filteredStaff.map((record) => (
        <tr key={record.id}>
          <td>
            <strong>{record.name}</strong>
            <small>{record.id}</small>
          </td>
          <td>{record.email}</td>
          <td>{record.department}</td>
          <td>{record.role}</td>
          <td>
            <StatusBadge status={record.status} />
          </td>
          <td>{record.attendanceRecords}</td>
          <td>{record.payrollRecords}</td>
          <td>
            <button
              type="button"
              className="report-view-btn"
              onClick={() => setSelectedRecord({ type: "staff", record })}
            >
              <FontAwesomeIcon icon={faEye} />
              View
            </button>
          </td>
        </tr>
      ))}
    </ReportTable>
  );

  return (
    <div className={`manager-reports ${theme}`}>
      <section className="manager-reports-hero">
        <div>
          <span className="reports-eyebrow">Manager Reports</span>
          <h1>Attendance & Payroll Reports</h1>
          <p>
            Review attendance summaries, payroll totals, staff performance, and
            manager-level operational reporting in one workspace.
          </p>
        </div>

        <div className="reports-hero-actions">
          <button
            type="button"
            className="reports-btn secondary"
            onClick={() => fetchReportData({ silent: true })}
            disabled={loading || refreshing}
          >
            <FontAwesomeIcon icon={refreshing ? faSpinner : faRefresh} spin={refreshing} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>

          <button type="button" className="reports-btn secondary" onClick={printReport}>
            <FontAwesomeIcon icon={faPrint} />
            Print
          </button>

          <button type="button" className="reports-btn primary" onClick={exportCSV}>
            <FontAwesomeIcon icon={faDownload} />
            Export CSV
          </button>
        </div>
      </section>

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
          label="Attendance Records"
          value={summary.totalAttendance}
          icon={faCalendarAlt}
          tone="primary"
        />
        <SummaryCard label="Present" value={summary.present} icon={faUserCheck} tone="success" />
        <SummaryCard label="Late" value={summary.late} icon={faClock} tone="warning" />
        <SummaryCard label="Absent" value={summary.absent} icon={faUserTimes} tone="danger" />
        <SummaryCard
          label="Pending Review"
          value={summary.pendingReview}
          icon={faTriangleExclamation}
          tone="info"
        />
        <SummaryCard
          label="Payroll Records"
          value={summary.payrollRecords}
          icon={faFileInvoiceDollar}
          tone="money"
        />
        <SummaryCard
          label="Net Payroll"
          value={formatCurrency(summary.netPay)}
          icon={faMoneyBillWave}
          tone="money"
        />
        <SummaryCard label="Active Staff" value={summary.activeStaff} icon={faUsers} tone="success" />
      </section>

      <section className="reports-controls-card">
        <div className="reports-search-row">
          <div className="reports-search-box">
            <FontAwesomeIcon icon={faSearch} />
            <input
              type="text"
              placeholder="Search employee, department, role, status, or payroll period..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />

            {searchTerm && (
              <button type="button" onClick={() => setSearchTerm("")}>
                <FontAwesomeIcon icon={faXmark} />
              </button>
            )}
          </div>

          <div className="reports-filter-label">
            <FontAwesomeIcon icon={faFilter} />
            Filters
          </div>
        </div>

        <div className="reports-filter-grid">
          <FilterField label="Start Date">
            <DatePickerInput
              selected={startDate ? new Date(startDate) : null}
              onChange={(date) => setStartDate(date ? date.toISOString().split("T")[0] : "")}
              placeholderText="From..."
            />
          </FilterField>

          <FilterField label="End Date">
            <DatePickerInput
              selected={endDate ? new Date(endDate) : null}
              onChange={(date) => setEndDate(date ? date.toISOString().split("T")[0] : "")}
              placeholderText="To..."
            />
          </FilterField>

          <FilterField label="Department">
            <select
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
            >
              <option value="all">All Departments</option>
              {departments.map((department) => (
                <option value={department} key={department}>
                  {department}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Status">
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All Status</option>
              {statuses.map((status) => (
                <option value={status} key={status}>
                  {formatLabel(status)}
                </option>
              ))}
            </select>
          </FilterField>

          <button type="button" className="reports-clear-btn" onClick={clearFilters}>
            Clear Filters
          </button>
        </div>
      </section>

      <section className="reports-tabs">
        {[
          { id: "summary", label: "Summary", icon: faChartLine },
          { id: "attendance", label: "Attendance Report", icon: faCalendarAlt },
          { id: "payroll", label: "Payroll Report", icon: faMoneyBillWave },
          { id: "staff", label: "Staff Performance", icon: faUsers },
        ].map((tab) => (
          <button
            type="button"
            key={tab.id}
            className={activeTab === tab.id ? "active" : ""}
            onClick={() => setActiveTab(tab.id)}
          >
            <FontAwesomeIcon icon={tab.icon} />
            {tab.label}
          </button>
        ))}
      </section>

      {loading ? (
        <div className="reports-loading-state">
          <FontAwesomeIcon icon={faSpinner} spin />
          <h2>Loading manager reports</h2>
          <p>Please wait while attendance, payroll, and staff reports are being loaded.</p>
        </div>
      ) : (
        <section className="reports-content-card">
          <div className="reports-content-header">
            <div>
              <span className="reports-eyebrow">{formatLabel(activeTab)}</span>
              <h2>{getTabTitle(activeTab)}</h2>
            </div>

            <p>
              Last updated: <strong>{formatDateTime(new Date())}</strong>
            </p>
          </div>

          {activeTab === "summary" && renderSummaryTab()}
          {activeTab === "attendance" && renderAttendanceTab()}
          {activeTab === "payroll" && renderPayrollTab()}
          {activeTab === "staff" && renderStaffTab()}
        </section>
      )}

      <PrintArea
        summary={summary}
        attendance={filteredAttendance}
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
  );
};

const getTabTitle = (activeTab) => {
  if (activeTab === "attendance") return "Attendance Report";
  if (activeTab === "payroll") return "Payroll Report";
  if (activeTab === "staff") return "Staff Performance Report";
  return "Manager Report Summary";
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

const ReportTable = ({ columns, children, emptyMessage }) => (
  <div className="reports-table-wrap">
    <table className="reports-table">
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column}>{column}</th>
          ))}
        </tr>
      </thead>

      <tbody>{children}</tbody>
    </table>

    {React.Children.count(children) === 0 && (
      <div className="reports-empty-state">
        <FontAwesomeIcon icon={faTable} />
        <h3>No records found</h3>
        <p>{emptyMessage}</p>
      </div>
    )}
  </div>
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

const PrintArea = ({ summary, attendance, payroll, staff, activeTab }) => (
  <section className="manager-reports-print">
    <h1>Pawesome Retreat Inc.</h1>
    <h2>{getTabTitle(activeTab)}</h2>
    <p>Generated: {formatDateTime(new Date())}</p>

    <div className="print-summary">
      <span>Attendance Records: {summary.totalAttendance}</span>
      <span>Payroll Records: {summary.payrollRecords}</span>
      <span>Net Payroll: {formatCurrency(summary.netPay)}</span>
      <span>Active Staff: {summary.activeStaff}</span>
    </div>

    <h3>Attendance Summary</h3>
    <table>
      <thead>
        <tr>
          <th>Employee</th>
          <th>Department</th>
          <th>Date</th>
          <th>Status</th>
          <th>Review</th>
        </tr>
      </thead>
      <tbody>
        {attendance.map((item) => (
          <tr key={item.id}>
            <td>{item.employeeName}</td>
            <td>{item.department}</td>
            <td>{formatDate(item.date)}</td>
            <td>{formatLabel(item.status)}</td>
            <td>{formatLabel(item.reviewStatus)}</td>
          </tr>
        ))}
      </tbody>
    </table>

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
  </section>
);

export default ManagerReports;