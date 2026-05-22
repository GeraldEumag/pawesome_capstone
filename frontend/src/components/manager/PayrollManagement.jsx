import React, { useCallback, useEffect, useMemo, useState } from "react";
import { payrollApi } from "../../api/payroll";
import { apiRequest } from "../../api/client";
import { formatCurrency } from "../../utils/currency";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import DatePickerInput from "../../components/shared/DatePickerInput";
import {
  faCalendarAlt,
  faCheck,
  faCheckCircle,
  faChevronDown,
  faChevronLeft,
  faChevronRight,
  faChevronUp,
  faClock,
  faDownload,
  faEye,
  faFileInvoiceDollar,
  faFilter,
  faMoneyBill,
  faMoneyBillWave,
  faPrint,
  faRefresh,
  faSearch,
  faSpinner,
  faTable,
  faTriangleExclamation,
  faUsers,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "./PayrollManagement.css";

const CHART_COLORS = ["#ff5f93", "#ff8db5", "#ffc8dd", "#f59e0b", "#10b981", "#3b82f6"];

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
  String(value || "draft")
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

const getEmployeeName = (record) =>
  record.employee_name ||
  record.staff_name ||
  record.user?.name ||
  record.employee?.name ||
  record.name ||
  "Unknown Employee";

const getDepartment = (record) =>
  record.department ||
  record.user?.department ||
  record.employee?.department ||
  "Unassigned";

const getRole = (record) =>
  record.role ||
  record.position ||
  record.user?.role ||
  record.employee?.position ||
  "Staff";

const getPayrollPeriod = (record) =>
  record.pay_period_label ||
  record.payroll_period ||
  record.period ||
  record.month ||
  record.cutoff ||
  "N/A";

const normalizePayroll = (record, index) => {
  const grossPay = safeNumber(record.gross_pay || record.total_gross_pay || record.amount || 0);
  const deductions = safeNumber(record.deductions || record.total_deductions || 0);
  const netPay = safeNumber(record.net_pay || record.total_net_pay || grossPay - deductions);

  return {
    id: record.id || record.payroll_id || `payroll-${index}`,
    rawId: record.id || record.payroll_id || `payroll-${index}`,
    payrollId: record.payroll_id || record.reference_no || `PAY-${String(index + 1).padStart(4, "0")}`,
    employeeName: getEmployeeName(record),
    employeeId: record.employee_id || record.staff_id || record.user_id || record.employee?.id || "N/A",
    department: getDepartment(record),
    role: getRole(record),
    period: getPayrollPeriod(record),
    date: record.created_at || record.updated_at || record.payroll_date || record.generated_at,
    regularHours: safeNumber(record.regular_hours || record.hours_worked || record.total_hours || 0),
    overtimeHours: safeNumber(record.overtime_hours || record.overtime || 0),
    attendanceDays: safeNumber(record.attendance_days || record.days_worked || record.present_days || 0),
    lateCount: safeNumber(record.late_count || record.late_days || 0),
    absentCount: safeNumber(record.absent_count || record.absent_days || 0),
    lateDeductions: safeNumber(record.late_deductions || record.late_deduction || 0),
    absenceDeductions: safeNumber(record.absence_deductions || record.absent_deductions || 0),
    overtimePay: safeNumber(record.overtime_pay || record.overtime_amount || 0),
    allowance: safeNumber(record.allowance || record.bonus || record.allowances || 0),
    grossPay,
    deductions,
    netPay,
    status: normalizeStatus(record.status || record.payroll_status),
    approvedBy: record.approved_by || record.approver?.name || "N/A",
    releasedBy: record.released_by || record.paid_by || "N/A",
    remarks: record.remarks || record.notes || "",
    raw: record,
  };
};

const escapeCSV = (value) => {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
};

const createPayrollNotification = async (message, priority = "high") => {
  try {
    await apiRequest("/notifications", {
      method: "POST",
      body: JSON.stringify({
        type: "payroll",
        message,
        priority,
        role: "manager",
      }),
    });
  } catch (error) {
    console.warn("Payroll notification failed:", error);
  }
};

const PayrollManagement = () => {
  const [payrolls, setPayrolls] = useState([]);
  const [backendSummary, setBackendSummary] = useState(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPeriod, setSelectedPeriod] = useState("all");
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  const [selectedRole, setSelectedRole] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [sortBy, setSortBy] = useState("employeeName");
  const [sortOrder, setSortOrder] = useState("asc");
  const [showFilters, setShowFilters] = useState(false);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [selectedPayroll, setSelectedPayroll] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [printPayroll, setPrintPayroll] = useState(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const showToast = useCallback((message, type = "info") => {
    setToast({ message, type });
    window.clearTimeout(window.managerPayrollToastTimer);
    window.managerPayrollToastTimer = window.setTimeout(() => setToast(null), 3500);
  }, []);

  const fetchPayrolls = useCallback(
    async ({ silent = false } = {}) => {
      try {
        if (silent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        let response;

        try {
          response = await payrollApi.getAll();
        } catch (primaryError) {
          response = await apiRequest("/manager/payroll");
        }

        const records = normalizeList(response, ["payroll", "records", "items", "data"]);
        setPayrolls(records.map(normalizePayroll));
        setBackendSummary(response?.summary || response?.data?.summary || null);
      } catch (err) {
        console.error("Payroll fetch error:", err);
        setError(
          err.message ||
            "Failed to load payroll data. Please verify the payroll API endpoint."
        );
        setPayrolls([]);
        setBackendSummary(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchPayrolls();
  }, [fetchPayrolls]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    selectedPeriod,
    selectedDepartment,
    selectedRole,
    selectedStatus,
    sortBy,
    sortOrder,
  ]);

  const payPeriods = useMemo(() => {
    return [...new Set(payrolls.map((payroll) => payroll.period))]
      .filter(Boolean)
      .sort()
      .reverse();
  }, [payrolls]);

  const departments = useMemo(() => {
    return [...new Set(payrolls.map((payroll) => payroll.department))]
      .filter(Boolean)
      .sort();
  }, [payrolls]);

  const roles = useMemo(() => {
    return [...new Set(payrolls.map((payroll) => payroll.role))]
      .filter(Boolean)
      .sort();
  }, [payrolls]);

  const statuses = useMemo(() => {
    return [...new Set(payrolls.map((payroll) => payroll.status))]
      .filter(Boolean)
      .sort();
  }, [payrolls]);

  const filteredPayrolls = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return payrolls
      .filter((payroll) => {
        const matchesSearch =
          !search ||
          [
            payroll.payrollId,
            payroll.employeeName,
            payroll.employeeId,
            payroll.department,
            payroll.role,
            payroll.period,
            payroll.status,
          ]
            .join(" ")
            .toLowerCase()
            .includes(search);

        const matchesPeriod =
          selectedPeriod === "all" || payroll.period === selectedPeriod;

        const matchesDepartment =
          selectedDepartment === "all" || payroll.department === selectedDepartment;

        const matchesRole = selectedRole === "all" || payroll.role === selectedRole;

        const matchesStatus =
          selectedStatus === "all" || payroll.status === selectedStatus;

        return (
          matchesSearch &&
          matchesPeriod &&
          matchesDepartment &&
          matchesRole &&
          matchesStatus
        );
      })
      .sort((a, b) => {
        const first = a[sortBy];
        const second = b[sortBy];

        if (typeof first === "number" && typeof second === "number") {
          return sortOrder === "asc" ? first - second : second - first;
        }

        const firstText = String(first || "").toLowerCase();
        const secondText = String(second || "").toLowerCase();

        if (firstText < secondText) return sortOrder === "asc" ? -1 : 1;
        if (firstText > secondText) return sortOrder === "asc" ? 1 : -1;
        return 0;
      });
  }, [
    payrolls,
    searchTerm,
    selectedPeriod,
    selectedDepartment,
    selectedRole,
    selectedStatus,
    sortBy,
    sortOrder,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredPayrolls.length / itemsPerPage));

  const paginatedPayrolls = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredPayrolls.slice(start, start + itemsPerPage);
  }, [currentPage, filteredPayrolls, itemsPerPage]);

  const summary = useMemo(() => {
    const employees = new Set(payrolls.map((payroll) => payroll.employeeId)).size;
    const grossPay = payrolls.reduce((sum, payroll) => sum + payroll.grossPay, 0);
    const deductions = payrolls.reduce((sum, payroll) => sum + payroll.deductions, 0);
    const netPay = payrolls.reduce((sum, payroll) => sum + payroll.netPay, 0);
    const overtimePay = payrolls.reduce((sum, payroll) => sum + payroll.overtimePay, 0);

    const pending = payrolls.filter((payroll) =>
      ["pending", "pending_review", "for_approval", "draft", "processing"].includes(
        payroll.status
      )
    ).length;

    const approved = payrolls.filter((payroll) => payroll.status === "approved").length;

    const released = payrolls.filter((payroll) =>
      ["released", "paid"].includes(payroll.status)
    ).length;

    return {
      employees: safeNumber(backendSummary?.total_employees) || employees,
      records: payrolls.length,
      grossPay: safeNumber(backendSummary?.total_gross) || grossPay,
      deductions: safeNumber(backendSummary?.total_deductions) || deductions,
      netPay: safeNumber(backendSummary?.total_net) || netPay,
      overtimePay,
      pending: safeNumber(backendSummary?.pending_count) || pending,
      approved,
      released: safeNumber(backendSummary?.paid_count) || released,
    };
  }, [backendSummary, payrolls]);

  const payrollChartData = useMemo(() => {
    return filteredPayrolls.slice(0, 10).map((payroll) => ({
      name: payroll.employeeName.split(" ")[0] || "Staff",
      gross: payroll.grossPay,
      net: payroll.netPay,
      deductions: payroll.deductions,
    }));
  }, [filteredPayrolls]);

  const statusChartData = useMemo(() => {
    const counts = {};

    filteredPayrolls.forEach((payroll) => {
      const label = formatLabel(payroll.status);
      counts[label] = (counts[label] || 0) + 1;
    });

    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredPayrolls]);

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedPeriod("all");
    setSelectedDepartment("all");
    setSelectedRole("all");
    setSelectedStatus("all");
    setSortBy("employeeName");
    setSortOrder("asc");
  };

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortBy(field);
    setSortOrder("asc");
  };

  const handleGenerate = async () => {
    if (!startDate || !endDate) {
      showToast("Please select both start and end dates.", "error");
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      showToast("Start date must be before the end date.", "error");
      return;
    }

    setGenerating(true);

    try {
      try {
        await payrollApi.generateForPeriod({
          start_date: startDate,
          end_date: endDate,
        });
      } catch (primaryError) {
        await apiRequest("/manager/payroll/generate", {
          method: "POST",
          body: JSON.stringify({
            start_date: startDate,
            end_date: endDate,
          }),
        });
      }

      await createPayrollNotification(
        `Payroll generated for ${startDate} to ${endDate}`,
        "high"
      );

      await fetchPayrolls({ silent: true });
      setStartDate("");
      setEndDate("");
      showToast("Payroll generated successfully.", "success");
    } catch (err) {
      console.error("Generate payroll error:", err);
      showToast(
        err.message ||
          "Failed to generate payroll. Please verify the payroll generate endpoint.",
        "error"
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleApprove = async (payroll) => {
    setActionLoadingId(payroll.id);

    try {
      try {
        await payrollApi.approve(payroll.rawId);
      } catch (primaryError) {
        await apiRequest(`/manager/payroll/${payroll.rawId}/approve`, {
          method: "POST",
          body: JSON.stringify({
            status: "approved",
          }),
        });
      }

      await createPayrollNotification(`${payroll.payrollId} has been approved.`, "medium");
      await fetchPayrolls({ silent: true });
      showToast("Payroll approved successfully.", "success");
    } catch (err) {
      console.error("Approve payroll error:", err);
      showToast(
        err.message ||
          "Failed to approve payroll. Please verify the payroll approval endpoint.",
        "error"
      );
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRelease = async (payroll) => {
    setActionLoadingId(payroll.id);

    try {
      try {
        await payrollApi.markAsPaid(payroll.rawId);
      } catch (primaryError) {
        await apiRequest(`/manager/payroll/${payroll.rawId}/release`, {
          method: "POST",
          body: JSON.stringify({
            status: "released",
          }),
        });
      }

      await createPayrollNotification(`${payroll.payrollId} has been released.`, "high");
      await fetchPayrolls({ silent: true });
      showToast("Payroll marked as released successfully.", "success");
    } catch (err) {
      console.error("Release payroll error:", err);
      showToast(
        err.message ||
          "Failed to release payroll. Please verify the payroll release endpoint.",
        "error"
      );
    } finally {
      setActionLoadingId(null);
    }
  };

  const openDetails = (payroll) => {
    setSelectedPayroll(payroll);
    setShowDetailsModal(true);
  };

  const closeDetails = () => {
    setSelectedPayroll(null);
    setShowDetailsModal(false);
  };

  const exportCSV = () => {
    if (filteredPayrolls.length === 0) {
      showToast("There is no payroll data to export.", "warning");
      return;
    }

    const headers = [
      "Payroll ID",
      "Employee",
      "Employee ID",
      "Department",
      "Role",
      "Pay Period",
      "Attendance Days",
      "Regular Hours",
      "Overtime Hours",
      "Gross Pay",
      "Deductions",
      "Net Pay",
      "Status",
    ];

    const rows = filteredPayrolls.map((payroll) => [
      payroll.payrollId,
      payroll.employeeName,
      payroll.employeeId,
      payroll.department,
      payroll.role,
      payroll.period,
      payroll.attendanceDays,
      payroll.regularHours,
      payroll.overtimeHours,
      formatCurrency(payroll.grossPay),
      formatCurrency(payroll.deductions),
      formatCurrency(payroll.netPay),
      formatLabel(payroll.status),
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map(escapeCSV).join(","))
      .join("\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `manager-payroll-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();

    URL.revokeObjectURL(url);
    showToast("Payroll CSV exported successfully.", "success");
  };

  const downloadPayslipPDF = (payroll) => {
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.setTextColor(255, 95, 147);
    doc.text("Pawesome Retreat Inc.", 14, 20);

    doc.setFontSize(12);
    doc.setTextColor(31, 41, 55);
    doc.text("Employee Payslip", 14, 28);

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated: ${formatDateTime(new Date())}`, 14, 35);

    doc.setFontSize(10);
    doc.setTextColor(31, 41, 55);
    doc.text(`Employee: ${payroll.employeeName}`, 14, 48);
    doc.text(`Payroll ID: ${payroll.payrollId}`, 14, 55);
    doc.text(`Pay Period: ${payroll.period}`, 14, 62);
    doc.text(`Department: ${payroll.department}`, 14, 69);
    doc.text(`Status: ${formatLabel(payroll.status)}`, 14, 76);

    autoTable(doc, {
      startY: 88,
      head: [["Description", "Details", "Amount"]],
      body: [
        ["Regular Hours", `${payroll.regularHours} hrs`, ""],
        ["Attendance Days", `${payroll.attendanceDays} day(s)`, ""],
        ["Overtime Hours", `${payroll.overtimeHours} hrs`, formatCurrency(payroll.overtimePay)],
        ["Allowance / Bonus", "", formatCurrency(payroll.allowance)],
        ["Gross Pay", "", formatCurrency(payroll.grossPay)],
        ["Late Deductions", `${payroll.lateCount} late record(s)`, formatCurrency(payroll.lateDeductions)],
        ["Absence Deductions", `${payroll.absentCount} absent record(s)`, formatCurrency(payroll.absenceDeductions)],
        ["Total Deductions", "", formatCurrency(payroll.deductions)],
        ["Net Pay", "", formatCurrency(payroll.netPay)],
      ],
      headStyles: {
        fillColor: [255, 95, 147],
        textColor: 255,
        fontStyle: "bold",
      },
      bodyStyles: {
        fontSize: 10,
      },
      alternateRowStyles: {
        fillColor: [250, 250, 250],
      },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 60 },
        1: { cellWidth: 70 },
        2: { halign: "right", fontStyle: "bold" },
      },
    });

    const finalY = doc.lastAutoTable.finalY + 12;
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text("This payslip was generated by the Pawesome Payroll Management System.", 14, finalY);

    const filename = `Payslip-${payroll.employeeName.replace(/\s+/g, "_")}-${payroll.period.replace(/\s+/g, "_")}.pdf`;
    doc.save(filename);
  };

  const printPayslip = (payroll) => {
    setPrintPayroll(payroll);

    window.setTimeout(() => {
      window.print();
    }, 120);
  };

  const pageStart = filteredPayrolls.length ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const pageEnd = Math.min(currentPage * itemsPerPage, filteredPayrolls.length);

  return (
    <div className="manager-payroll">
      <section className="manager-payroll-hero">
        <div>
          <span className="payroll-eyebrow">Manager Payroll</span>
          <h1>Payroll Management</h1>
          <p>
            Generate payroll by period, review attendance-based payroll values,
            approve records, release payroll, and print employee payslips.
          </p>
        </div>

        <div className="payroll-hero-actions">
          <button
            type="button"
            className="payroll-btn secondary"
            onClick={() => fetchPayrolls({ silent: true })}
            disabled={loading || refreshing}
          >
            <FontAwesomeIcon icon={refreshing ? faSpinner : faRefresh} spin={refreshing} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>

          <button type="button" className="payroll-btn primary" onClick={exportCSV}>
            <FontAwesomeIcon icon={faDownload} />
            Export CSV
          </button>
        </div>
      </section>

      {error && (
        <div className="payroll-alert error">
          <FontAwesomeIcon icon={faTriangleExclamation} />
          <span>{error}</span>
          <button type="button" onClick={() => fetchPayrolls()}>
            Retry
          </button>
        </div>
      )}

      <section className="payroll-generate-card">
        <div>
          <span className="payroll-eyebrow">Payroll Period</span>
          <h2>Generate Payroll</h2>
          <p>Select a start and end date to generate payroll for the selected period.</p>
        </div>

        <div className="payroll-generate-form">
          <label>
            <span>Start Date</span>
            <DatePickerInput
              selected={startDate ? new Date(startDate) : null}
              onChange={(date) => setStartDate(date ? date.toISOString().split("T")[0] : "")}
              placeholderText="From..."
            />
          </label>

          <label>
            <span>End Date</span>
            <DatePickerInput
              selected={endDate ? new Date(endDate) : null}
              onChange={(date) => setEndDate(date ? date.toISOString().split("T")[0] : "")}
              placeholderText="To..."
            />
          </label>

          <button
            type="button"
            className="payroll-btn primary"
            onClick={handleGenerate}
            disabled={generating || !startDate || !endDate}
          >
            <FontAwesomeIcon icon={generating ? faSpinner : faMoneyBill} spin={generating} />
            {generating ? "Generating..." : "Generate Payroll"}
          </button>
        </div>
      </section>

      <section className="payroll-summary-grid">
        <SummaryCard label="Employees in Payroll" value={summary.employees} icon={faUsers} tone="primary" />
        <SummaryCard label="Payroll Records" value={summary.records} icon={faFileInvoiceDollar} tone="info" />
        <SummaryCard label="Gross Pay Total" value={formatCurrency(summary.grossPay)} icon={faMoneyBillWave} tone="money" />
        <SummaryCard label="Deductions Total" value={formatCurrency(summary.deductions)} icon={faTriangleExclamation} tone="danger" />
        <SummaryCard label="Net Pay Total" value={formatCurrency(summary.netPay)} icon={faMoneyBill} tone="success" />
        <SummaryCard label="Pending Review" value={summary.pending} icon={faClock} tone="warning" />
        <SummaryCard label="Approved Payroll" value={summary.approved} icon={faCheck} tone="info" />
        <SummaryCard label="Released Payroll" value={summary.released} icon={faCheckCircle} tone="success" />
      </section>

      <section className="payroll-chart-grid">
        <ChartCard title="Payroll Amount Overview">
          {payrollChartData.length === 0 ? (
            <ChartEmpty message="No payroll chart data available." />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={payrollChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
                <Bar dataKey="gross" name="Gross Pay" fill="#ff8db5" radius={[10, 10, 0, 0]} />
                <Bar dataKey="net" name="Net Pay" fill="#10b981" radius={[10, 10, 0, 0]} />
                <Bar dataKey="deductions" name="Deductions" fill="#f59e0b" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Payroll Status Distribution">
          {statusChartData.length === 0 ? (
            <ChartEmpty message="No payroll status data available." />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={statusChartData} dataKey="value" nameKey="name" outerRadius={95} label>
                  {statusChartData.map((entry, index) => (
                    <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </section>

      <section className="payroll-controls-card">
        <div className="payroll-search-row">
          <div className="payroll-search-box">
            <FontAwesomeIcon icon={faSearch} />
            <input
              type="text"
              placeholder="Search payroll ID, employee, department, role, period, or status..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />

            {searchTerm && (
              <button type="button" onClick={() => setSearchTerm("")}>
                <FontAwesomeIcon icon={faXmark} />
              </button>
            )}
          </div>

          <button
            type="button"
            className={`payroll-filter-toggle ${showFilters ? "active" : ""}`}
            onClick={() => setShowFilters((prev) => !prev)}
          >
            <FontAwesomeIcon icon={faFilter} />
            Filters
            <FontAwesomeIcon icon={showFilters ? faChevronUp : faChevronDown} />
          </button>
        </div>

        {showFilters && (
          <div className="payroll-filter-grid">
            <FilterField label="Pay Period">
              <select value={selectedPeriod} onChange={(event) => setSelectedPeriod(event.target.value)}>
                <option value="all">All Pay Periods</option>
                {payPeriods.map((period) => (
                  <option value={period} key={period}>
                    {period}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Department">
              <select
                value={selectedDepartment}
                onChange={(event) => setSelectedDepartment(event.target.value)}
              >
                <option value="all">All Departments</option>
                {departments.map((department) => (
                  <option value={department} key={department}>
                    {department}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Role">
              <select value={selectedRole} onChange={(event) => setSelectedRole(event.target.value)}>
                <option value="all">All Roles</option>
                {roles.map((role) => (
                  <option value={role} key={role}>
                    {role}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Status">
              <select
                value={selectedStatus}
                onChange={(event) => setSelectedStatus(event.target.value)}
              >
                <option value="all">All Status</option>
                {statuses.map((status) => (
                  <option value={status} key={status}>
                    {formatLabel(status)}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Sort By">
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                <option value="employeeName">Employee</option>
                <option value="period">Pay Period</option>
                <option value="grossPay">Gross Pay</option>
                <option value="deductions">Deductions</option>
                <option value="netPay">Net Pay</option>
                <option value="status">Status</option>
              </select>
            </FilterField>

            <button
              type="button"
              className="payroll-sort-btn"
              onClick={() => setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))}
            >
              {sortOrder === "asc" ? "Ascending" : "Descending"}
            </button>

            <button type="button" className="payroll-clear-btn" onClick={clearFilters}>
              Clear Filters
            </button>
          </div>
        )}
      </section>

      <section className="payroll-table-card">
        <div className="payroll-table-header">
          <div>
            <span className="payroll-eyebrow">Payroll Records</span>
            <h2>Employee Payroll List</h2>
          </div>

          <label className="payroll-page-size">
            <span>Rows</span>
            <select
              value={itemsPerPage}
              onChange={(event) => {
                setItemsPerPage(Number(event.target.value));
                setCurrentPage(1);
              }}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </label>
        </div>

        {loading ? (
          <div className="payroll-loading-state">
            <FontAwesomeIcon icon={faSpinner} spin />
            <h3>Loading payroll records</h3>
            <p>Please wait while payroll records are being loaded.</p>
          </div>
        ) : (
          <>
            <div className="payroll-table-scroll">
              <table className="payroll-table">
                <thead>
                  <tr>
                    <SortableHeader label="Payroll ID" field="payrollId" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                    <SortableHeader label="Employee" field="employeeName" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                    <th>Department</th>
                    <SortableHeader label="Pay Period" field="period" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                    <th>Attendance</th>
                    <th>Gross Pay</th>
                    <th>Deductions</th>
                    <SortableHeader label="Net Pay" field="netPay" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                    <SortableHeader label="Status" field="status" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {paginatedPayrolls.map((payroll) => (
                    <tr key={payroll.id}>
                      <td>
                        <span className="payroll-id">{payroll.payrollId}</span>
                      </td>

                      <td>
                        <div className="payroll-employee-cell">
                          <strong>{payroll.employeeName}</strong>
                          <small>{payroll.role}</small>
                        </div>
                      </td>

                      <td>
                        <span className="payroll-department-badge">{payroll.department}</span>
                      </td>

                      <td>{payroll.period}</td>

                      <td>
                        <div className="payroll-attendance-cell">
                          <span>{payroll.attendanceDays} day(s)</span>
                          <small>{payroll.regularHours} regular hrs</small>
                          <small>{payroll.overtimeHours} overtime hrs</small>
                        </div>
                      </td>

                      <td>{formatCurrency(payroll.grossPay)}</td>

                      <td className="payroll-deductions">
                        {formatCurrency(payroll.deductions)}
                      </td>

                      <td className="payroll-net-pay">
                        {formatCurrency(payroll.netPay)}
                      </td>

                      <td>
                        <StatusBadge status={payroll.status} />
                      </td>

                      <td>
                        <div className="payroll-actions">
                          <button type="button" onClick={() => openDetails(payroll)}>
                            <FontAwesomeIcon icon={faEye} />
                            View
                          </button>

                          {["pending", "pending_review", "for_approval", "draft", "processing"].includes(payroll.status) && (
                            <button
                              type="button"
                              onClick={() => handleApprove(payroll)}
                              disabled={actionLoadingId === payroll.id}
                            >
                              <FontAwesomeIcon
                                icon={actionLoadingId === payroll.id ? faSpinner : faCheck}
                                spin={actionLoadingId === payroll.id}
                              />
                              Approve
                            </button>
                          )}

                          {payroll.status === "approved" && (
                            <button
                              type="button"
                              onClick={() => handleRelease(payroll)}
                              disabled={actionLoadingId === payroll.id}
                            >
                              <FontAwesomeIcon
                                icon={actionLoadingId === payroll.id ? faSpinner : faMoneyBillWave}
                                spin={actionLoadingId === payroll.id}
                              />
                              Release
                            </button>
                          )}

                          <button type="button" onClick={() => printPayslip(payroll)}>
                            <FontAwesomeIcon icon={faPrint} />
                            Print
                          </button>

                          <button type="button" onClick={() => downloadPayslipPDF(payroll)}>
                            <FontAwesomeIcon icon={faDownload} />
                            PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {paginatedPayrolls.length === 0 && (
              <div className="payroll-empty-state">
                <FontAwesomeIcon icon={faTable} />
                <h3>No payroll records found</h3>
                <p>Try adjusting your search, period, department, role, or status filters.</p>
              </div>
            )}

            <div className="payroll-pagination">
              <p>
                Showing {pageStart} to {pageEnd} of {filteredPayrolls.length} payroll records
              </p>

              <div>
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                >
                  <FontAwesomeIcon icon={faChevronLeft} />
                  Previous
                </button>

                <span>
                  Page {currentPage} of {totalPages}
                </span>

                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                >
                  Next
                  <FontAwesomeIcon icon={faChevronRight} />
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {showDetailsModal && selectedPayroll && (
        <PayrollDetailsModal
          payroll={selectedPayroll}
          onClose={closeDetails}
          onPrint={() => printPayslip(selectedPayroll)}
          onDownload={() => downloadPayslipPDF(selectedPayroll)}
        />
      )}

      <PayslipPrint payroll={printPayroll} />

      {toast && (
        <div className={`payroll-toast ${toast.type}`}>
          <FontAwesomeIcon
            icon={toast.type === "error" || toast.type === "warning" ? faTriangleExclamation : faCheckCircle}
          />
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
};

const SummaryCard = ({ label, value, icon, tone }) => (
  <article className={`payroll-summary-card ${tone}`}>
    <span>
      <FontAwesomeIcon icon={icon} />
    </span>
    <div>
      <strong>{value}</strong>
      <p>{label}</p>
    </div>
  </article>
);

const ChartCard = ({ title, children }) => (
  <article className="payroll-chart-card">
    <h3>{title}</h3>
    {children}
  </article>
);

const ChartEmpty = ({ message }) => (
  <div className="payroll-chart-empty">
    <FontAwesomeIcon icon={faTable} />
    <p>{message}</p>
  </div>
);

const FilterField = ({ label, children }) => (
  <label className="payroll-filter-field">
    <span>{label}</span>
    {children}
  </label>
);

const SortableHeader = ({ label, field, sortBy, sortOrder, onSort }) => (
  <th>
    <button type="button" onClick={() => onSort(field)}>
      {label}
      {sortBy === field && (
        <FontAwesomeIcon icon={sortOrder === "asc" ? faChevronUp : faChevronDown} />
      )}
    </button>
  </th>
);

const StatusBadge = ({ status }) => (
  <span className={`payroll-status ${normalizeStatus(status)}`}>
    {formatLabel(status)}
  </span>
);

const DetailItem = ({ label, value }) => (
  <div>
    <small>{label}</small>
    <strong>{value || "N/A"}</strong>
  </div>
);

const PayrollDetailsModal = ({ payroll, onClose, onPrint, onDownload }) => (
  <div className="payroll-modal-overlay">
    <div className="payroll-modal large">
      <div className="payroll-modal-header">
        <div>
          <span className="payroll-eyebrow">Payroll Details</span>
          <h2>{payroll.employeeName}</h2>
        </div>

        <button type="button" onClick={onClose}>
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      <div className="payroll-modal-body">
        <div className="payroll-detail-grid">
          <DetailItem label="Payroll ID" value={payroll.payrollId} />
          <DetailItem label="Employee" value={payroll.employeeName} />
          <DetailItem label="Department" value={payroll.department} />
          <DetailItem label="Role" value={payroll.role} />
          <DetailItem label="Pay Period" value={payroll.period} />
          <DetailItem label="Generated Date" value={formatDate(payroll.date)} />
          <DetailItem label="Attendance Days" value={payroll.attendanceDays} />
          <DetailItem label="Regular Hours" value={`${payroll.regularHours} hrs`} />
          <DetailItem label="Overtime Hours" value={`${payroll.overtimeHours} hrs`} />
          <DetailItem label="Overtime Pay" value={formatCurrency(payroll.overtimePay)} />
          <DetailItem label="Allowance / Bonus" value={formatCurrency(payroll.allowance)} />
          <DetailItem label="Gross Pay" value={formatCurrency(payroll.grossPay)} />
          <DetailItem label="Late Count" value={payroll.lateCount} />
          <DetailItem label="Absent Count" value={payroll.absentCount} />
          <DetailItem label="Late Deductions" value={formatCurrency(payroll.lateDeductions)} />
          <DetailItem label="Absence Deductions" value={formatCurrency(payroll.absenceDeductions)} />
          <DetailItem label="Total Deductions" value={formatCurrency(payroll.deductions)} />
          <DetailItem label="Net Pay" value={formatCurrency(payroll.netPay)} />
          <DetailItem label="Status" value={formatLabel(payroll.status)} />
          <DetailItem label="Approved By" value={payroll.approvedBy} />
          <DetailItem label="Released By" value={payroll.releasedBy} />
          <DetailItem label="Remarks" value={payroll.remarks || "No remarks"} />
        </div>
      </div>

      <div className="payroll-modal-footer">
        <button type="button" className="payroll-btn secondary" onClick={onClose}>
          Close
        </button>

        <button type="button" className="payroll-btn secondary" onClick={onPrint}>
          <FontAwesomeIcon icon={faPrint} />
          Print Payslip
        </button>

        <button type="button" className="payroll-btn primary" onClick={onDownload}>
          <FontAwesomeIcon icon={faDownload} />
          Download PDF
        </button>
      </div>
    </div>
  </div>
);

const PayslipPrint = ({ payroll }) => {
  if (!payroll) return null;

  return (
    <section className="payroll-print-area">
      <h1>Pawesome Retreat Inc.</h1>
      <h2>Employee Payslip</h2>
      <p>Generated: {formatDateTime(new Date())}</p>

      <div className="print-info-grid">
        <div>
          <strong>Employee</strong>
          <span>{payroll.employeeName}</span>
        </div>
        <div>
          <strong>Payroll ID</strong>
          <span>{payroll.payrollId}</span>
        </div>
        <div>
          <strong>Department</strong>
          <span>{payroll.department}</span>
        </div>
        <div>
          <strong>Role</strong>
          <span>{payroll.role}</span>
        </div>
        <div>
          <strong>Pay Period</strong>
          <span>{payroll.period}</span>
        </div>
        <div>
          <strong>Status</strong>
          <span>{formatLabel(payroll.status)}</span>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th>Details</th>
            <th>Amount</th>
          </tr>
        </thead>

        <tbody>
          <tr>
            <td>Regular Hours</td>
            <td>{payroll.regularHours} hrs</td>
            <td></td>
          </tr>
          <tr>
            <td>Attendance Days</td>
            <td>{payroll.attendanceDays} day(s)</td>
            <td></td>
          </tr>
          <tr>
            <td>Overtime Hours</td>
            <td>{payroll.overtimeHours} hrs</td>
            <td>{formatCurrency(payroll.overtimePay)}</td>
          </tr>
          <tr>
            <td>Allowance / Bonus</td>
            <td></td>
            <td>{formatCurrency(payroll.allowance)}</td>
          </tr>
          <tr>
            <td>Gross Pay</td>
            <td></td>
            <td>{formatCurrency(payroll.grossPay)}</td>
          </tr>
          <tr>
            <td>Late Deductions</td>
            <td>{payroll.lateCount} late record(s)</td>
            <td>{formatCurrency(payroll.lateDeductions)}</td>
          </tr>
          <tr>
            <td>Absence Deductions</td>
            <td>{payroll.absentCount} absent record(s)</td>
            <td>{formatCurrency(payroll.absenceDeductions)}</td>
          </tr>
          <tr>
            <td>Total Deductions</td>
            <td></td>
            <td>{formatCurrency(payroll.deductions)}</td>
          </tr>
          <tr className="net-row">
            <td>Net Pay</td>
            <td></td>
            <td>{formatCurrency(payroll.netPay)}</td>
          </tr>
        </tbody>
      </table>

      <div className="print-signatures">
        <div>
          <span></span>
          <strong>Prepared By</strong>
        </div>
        <div>
          <span></span>
          <strong>Employee Signature</strong>
        </div>
      </div>
    </section>
  );
};

export default PayrollManagement;