import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import DatePickerInput from "../../components/shared/DatePickerInput";
import {
  faCalendarAlt,
  faCalendarDays,
  faCheckCircle,
  faCheckSquare,
  faChevronDown,
  faChevronLeft,
  faChevronRight,
  faChevronUp,
  faClock,
  faDownload,
  faEye,
  faFilter,
  faHourglassHalf,
  faList,
  faPenToSquare,
  faPrint,
  faRefresh,
  faSearch,
  faSpinner,
  faSquare,
  faThumbsDown,
  faThumbsUp,
  faThList,
  faTriangleExclamation,
  faUserCheck,
  faUserClock,
  faUserTimes,
  faUsers,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import { formatCurrency } from "../../utils/currency";
import { exportToCSV, exportToPDF, exportToExcel } from "../../utils/reportExport";
import "./ManagerAttendance.css";

const TODAY = new Date().toISOString().split("T")[0];

const isRequestCancelled = (error, signal) =>
  signal?.aborted ||
  error?.name === "AbortError" ||
  error?.message === "Request was cancelled";

const DEFAULT_REMARKS_FORM = {
  remarks: "",
};

const parseApiList = (response) => {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.data)) return response.data.data;
  if (Array.isArray(response?.attendance)) return response.attendance;
  if (Array.isArray(response?.records)) return response.records;
  if (Array.isArray(response?.results)) return response.results;
  if (Array.isArray(response?.items)) return response.items;
  if (response?.data && typeof response.data === "object") return [response.data];
  if (response?.id) return [response];

  return [];
};

const normalizeStatus = (value) =>
  String(value || "absent")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");

const formatStatus = (value) =>
  String(value || "N/A")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const safeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toHours = (value) => {
  if (!value || value === "00:00") return 0;

  if (typeof value === "number") return value;

  const text = String(value);

  if (text.includes(":")) {
    const [hours, minutes] = text.split(":").map(Number);
    return safeNumber(hours) + safeNumber(minutes) / 60;
  }

  return safeNumber(text);
};

const formatHours = (value) => {
  const hours = toHours(value);
  if (!hours) return "0h";

  return `${hours.toFixed(2)}h`;
};

const formatTime = (value) => {
  if (!value) return "--";

  const text = String(value);

  if (text.includes("AM") || text.includes("PM")) return text;

  if (text.includes(":") && !text.includes("T")) {
    const [hour, minute] = text.split(":");
    const date = new Date();
    date.setHours(Number(hour || 0), Number(minute || 0), 0, 0);

    return date.toLocaleTimeString("en-PH", {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return text;

  return date.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatDate = (value) => {
  if (!value) return "N/A";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
};

const escapeCSV = (value) => {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
};

const normalizeAttendanceRecord = (record, fallbackDate) => {
  const employeeId =
    record.employeeId ||
    record.employee_id ||
    record.staff_id ||
    record.user?.id ||
    record.employee?.id ||
    "";

  const totalHours =
    record.totalHours ||
    record.total_hours ||
    record.hours_worked ||
    record.worked_hours ||
    "00:00";

  const overtime =
    record.overtime ||
    record.overtime_hours ||
    record.ot_hours ||
    "00:00";

  const undertime =
    record.undertime ||
    record.undertime_hours ||
    record.early_leave_hours ||
    "00:00";

  const status = normalizeStatus(record.status || record.attendance_status);

  return {
    id:
      record.id ||
      record.attendance_id ||
      `${employeeId || "record"}-${record.date || fallbackDate}`,
    employeeId: employeeId ? `EMP${String(employeeId).padStart(3, "0")}` : "N/A",
    rawEmployeeId: employeeId,
    name:
      record.name ||
      record.employee_name ||
      record.staff_name ||
      record.user?.name ||
      record.employee?.name ||
      "Unknown Employee",
    email: record.email || record.user?.email || record.employee?.email || "N/A",
    department:
      record.department ||
      record.user?.department ||
      record.employee?.department ||
      "Unassigned",
    role:
      record.role ||
      record.position ||
      record.user?.role ||
      record.employee?.position ||
      "Staff",
    date: record.date || record.attendance_date || fallbackDate,
    timeIn: record.time_in || record.check_in || record.checkIn || "",
    timeOut: record.time_out || record.check_out || record.checkOut || "",
    breakTime: record.break_time || record.breakTime || "00:00",
    totalHours,
    overtime,
    undertime,
    status,
    isLate:
      Boolean(record.is_late) ||
      Boolean(record.late) ||
      status === "late",
    isEarlyLeave:
      Boolean(record.is_early_leave) ||
      Boolean(record.earlyLeave) ||
      status === "half_day",
    location: record.location || "N/A",
    remarks:
      record.remarks ||
      record.notes ||
      record.manager_remarks ||
      record.attendance_remarks ||
      "",
    reviewStatus: normalizeStatus(
      record.review_status ||
        record.manager_review_status ||
        record.reviewStatus ||
        (record.reviewed || record.is_reviewed ? "reviewed" : "pending")
    ),
    approvedBy:
      record.approved_by ||
      record.reviewed_by ||
      record.approver?.name ||
      record.manager?.name ||
      "N/A",
    salaryRate: safeNumber(record.salary_rate || record.salaryRate || 0),
    dailyEarnings: safeNumber(
      record.daily_earnings || record.dailyEarnings || record.amount || 0
    ),
  };
};

const ManagerAttendance = () => {
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedReviewStatus, setSelectedReviewStatus] = useState("all");
  const [selectedDate, setSelectedDate] = useState(TODAY);

  const [sortBy, setSortBy] = useState("name");
  const [sortOrder, setSortOrder] = useState("asc");
  const [showFilters, setShowFilters] = useState(false);
  const [showExportDropdown, setShowExportDropdown] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [selectedAttendance, setSelectedAttendance] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showRemarksModal, setShowRemarksModal] = useState(false);
  const [remarksForm, setRemarksForm] = useState(DEFAULT_REMARKS_FORM);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [viewMode, setViewMode] = useState("list");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const showToast = useCallback((message, type = "info") => {
    setToast({ message, type });
    window.clearTimeout(window.managerAttendanceToastTimer);
    window.managerAttendanceToastTimer = window.setTimeout(
      () => setToast(null),
      3500
    );
  }, []);

  const loadAttendance = useCallback(
    async ({ silent = false, signal } = {}) => {
      try {
        if (silent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        const params = {
          date: selectedDate,
        };

        if (selectedDepartment !== "all") {
          params.department = selectedDepartment;
        }

        if (selectedStatus !== "all") {
          params.status = selectedStatus;
        }

        if (searchTerm.trim()) {
          params.search = searchTerm.trim();
        }

        const queryString = new URLSearchParams(params).toString();
        const response = await apiRequest(
          `/manager/attendance${queryString ? `?${queryString}` : ""}`,
          { signal }
        );
        const dataList = parseApiList(response);

        const normalized = dataList.map((record) =>
          normalizeAttendanceRecord(record, selectedDate)
        );

        setAttendance(normalized);
        setCurrentPage(1);
      } catch (err) {
        if (isRequestCancelled(err, signal)) {
          return;
        }

        console.error("Manager attendance load error:", err);
        setError(
          err.message ||
            "Failed to load attendance records. Please verify the attendance API endpoint."
        );
        setAttendance([]);
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [searchTerm, selectedDate, selectedDepartment, selectedStatus]
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      loadAttendance({ signal: controller.signal });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadAttendance]);

  const departments = useMemo(() => {
    return [...new Set(attendance.map((record) => record.department))]
      .filter(Boolean)
      .sort();
  }, [attendance]);

  const statuses = useMemo(() => {
    return [...new Set(attendance.map((record) => record.status))]
      .filter(Boolean)
      .sort();
  }, [attendance]);

  const filteredAttendance = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return attendance
      .filter((record) => {
        const matchesSearch =
          !search ||
          [
            record.name,
            record.email,
            record.employeeId,
            record.department,
            record.role,
            record.remarks,
          ]
            .join(" ")
            .toLowerCase()
            .includes(search);

        const matchesDepartment =
          selectedDepartment === "all" ||
          record.department === selectedDepartment;

        const matchesStatus =
          selectedStatus === "all" || record.status === selectedStatus;

        const matchesReviewStatus =
          selectedReviewStatus === "all" ||
          record.reviewStatus === selectedReviewStatus;

        return (
          matchesSearch &&
          matchesDepartment &&
          matchesStatus &&
          matchesReviewStatus
        );
      })
      .sort((a, b) => {
        const first = String(a[sortBy] || "").toLowerCase();
        const second = String(b[sortBy] || "").toLowerCase();

        if (first < second) return sortOrder === "asc" ? -1 : 1;
        if (first > second) return sortOrder === "asc" ? 1 : -1;
        return 0;
      });
  }, [
    attendance,
    searchTerm,
    selectedDepartment,
    selectedStatus,
    selectedReviewStatus,
    sortBy,
    sortOrder,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredAttendance.length / itemsPerPage));

  const paginatedAttendance = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredAttendance.slice(start, start + itemsPerPage);
  }, [currentPage, filteredAttendance, itemsPerPage]);

  const statistics = useMemo(() => {
    const total = attendance.length;
    const present = attendance.filter((record) => record.status === "present").length;
    const absent = attendance.filter((record) => record.status === "absent").length;
    const late = attendance.filter(
      (record) => record.isLate || record.status === "late"
    ).length;
    const halfDay = attendance.filter(
      (record) =>
        record.status === "half_day" ||
        record.status === "half-day" ||
        record.isEarlyLeave
    ).length;
    const leave = attendance.filter((record) =>
      ["leave", "on_leave"].includes(record.status)
    ).length;
    const pendingReview = attendance.filter(
      (record) => record.reviewStatus !== "reviewed"
    ).length;

    const totalHours = attendance.reduce(
      (sum, record) => sum + toHours(record.totalHours),
      0
    );
    const overtimeHours = attendance.reduce(
      (sum, record) => sum + toHours(record.overtime),
      0
    );
    const undertimeHours = attendance.reduce(
      (sum, record) => sum + toHours(record.undertime),
      0
    );

    const totalEarnings = attendance.reduce((sum, record) => {
      if (record.dailyEarnings) return sum + record.dailyEarnings;
      if (record.status === "present") return sum + 500;
      if (record.status === "late") return sum + 400;
      return sum;
    }, 0);

    const lateDeductions = late * 100;
    const overtimeBonus = overtimeHours * 50;
    const netPayroll = totalEarnings - lateDeductions + overtimeBonus;

    return {
      total,
      present,
      absent,
      late,
      halfDay,
      leave,
      pendingReview,
      totalHours,
      averageHours: total ? totalHours / total : 0,
      overtimeHours,
      undertimeHours,
      lateDeductions,
      overtimeBonus,
      netPayroll,
    };
  }, [attendance]);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortBy(field);
    setSortOrder("asc");
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setSelectedDepartment("all");
    setSelectedStatus("all");
    setSelectedReviewStatus("all");
    setSortBy("name");
    setSortOrder("asc");
    setCurrentPage(1);
  };

  const handleViewDetails = (record) => {
    setSelectedAttendance(record);
    setShowDetailsModal(true);
  };

  const handleOpenRemarks = (record) => {
    setSelectedAttendance(record);
    setRemarksForm({
      remarks: record.remarks || "",
    });
    setShowRemarksModal(true);
  };

  const handleSaveRemarks = async () => {
    if (!selectedAttendance) return;

    setActionLoadingId(selectedAttendance.id);

    try {
      await apiRequest(`/manager/attendance/${selectedAttendance.id}/remarks`, {
        method: "POST",
        body: JSON.stringify({
          remarks: remarksForm.remarks,
        }),
      });

      setAttendance((prev) =>
        prev.map((record) =>
          record.id === selectedAttendance.id
            ? { ...record, remarks: remarksForm.remarks }
            : record
        )
      );

      setShowRemarksModal(false);
      setSelectedAttendance(null);
      showToast("Attendance remarks updated successfully.", "success");
    } catch (err) {
      console.error("Save attendance remarks error:", err);

      setAttendance((prev) =>
        prev.map((record) =>
          record.id === selectedAttendance.id
            ? { ...record, remarks: remarksForm.remarks }
            : record
        )
      );

      setShowRemarksModal(false);
      showToast(
        "Remarks were updated on-screen. Backend remarks endpoint still needs verification.",
        "warning"
      );
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReviewAction = async (record, action) => {
    setActionLoadingId(record.id);

    try {
      await apiRequest(`/manager/attendance/${record.id}/review`, {
        method: "POST",
        body: JSON.stringify({
          review_status: action === "approve" ? "reviewed" : "rejected",
        }),
      });

      setAttendance((prev) =>
        prev.map((item) =>
          item.id === record.id
            ? { ...item, reviewStatus: action === "approve" ? "reviewed" : "rejected" }
            : item
        )
      );

      showToast(
        `Attendance record ${action === "approve" ? "approved" : "rejected"}.`,
        "success"
      );
    } catch (err) {
      console.error(`Review ${action} error:`, err);

      setAttendance((prev) =>
        prev.map((item) =>
          item.id === record.id
            ? { ...item, reviewStatus: action === "approve" ? "reviewed" : "rejected" }
            : item
        )
      );

      showToast(
        `${action === "approve" ? "Approved" : "Rejected"} on-screen. Backend endpoint may need verification.`,
        "warning"
      );
    } finally {
      setActionLoadingId(null);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const pageIds = new Set(paginatedAttendance.map((r) => r.id));
    const allSelected = pageIds.size > 0 && [...pageIds].every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkAction = async (action) => {
    if (selectedIds.size === 0) return;
    const ids = [...selectedIds];
    let succeeded = 0;
    let failed = 0;

    for (const id of ids) {
      try {
        await apiRequest(`/manager/attendance/${id}/review`, {
          method: "POST",
          body: JSON.stringify({ review_status: action === "approve" ? "reviewed" : "rejected" }),
        });
        succeeded++;
      } catch {
        failed++;
      }
    }

    setAttendance((prev) =>
      prev.map((item) =>
        selectedIds.has(item.id)
          ? { ...item, reviewStatus: action === "approve" ? "reviewed" : "rejected" }
          : item
      )
    );

    setSelectedIds(new Set());
    showToast(
      `${action === "approve" ? "Approved" : "Rejected"} ${succeeded} records${failed > 0 ? `, ${failed} failed` : ""}.`,
      failed > 0 ? "warning" : "success"
    );
  };

  const exportColumns = [
    { key: "employeeId", label: "Employee ID" },
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "department", label: "Department" },
    { key: "role", label: "Role" },
    { key: "date", label: "Date" },
    { key: "timeIn", label: "Time In" },
    { key: "timeOut", label: "Time Out" },
    { key: "status", label: "Status" },
    { key: "totalHours", label: "Total Hours" },
    { key: "overtime", label: "Overtime" },
    { key: "undertime", label: "Undertime" },
    { key: "remarks", label: "Remarks" },
    { key: "reviewStatus", label: "Review Status" },
  ];

  const handleExport = (format) => {
    if (filteredAttendance.length === 0) {
      showToast("There is no attendance data to export.", "warning");
      return;
    }

    const exportData = filteredAttendance.map((record) => ({
      employeeId: record.employeeId,
      name: record.name,
      email: record.email,
      department: record.department,
      role: record.role,
      date: record.date,
      timeIn: formatTime(record.timeIn),
      timeOut: formatTime(record.timeOut),
      status: formatStatus(record.status),
      totalHours: record.totalHours,
      overtime: record.overtime,
      undertime: record.undertime,
      remarks: record.remarks,
      reviewStatus: formatStatus(record.reviewStatus),
    }));

    const filename = "manager-attendance";

    setShowExportDropdown(false);

    if (format === "csv") {
      exportToCSV(exportData, exportColumns, filename);
      showToast("Attendance CSV exported successfully.", "success");
    } else if (format === "excel") {
      exportToExcel(exportData, exportColumns, filename);
      showToast("Attendance Excel exported successfully.", "success");
    } else if (format === "pdf") {
      exportToPDF(exportData, exportColumns, "Attendance Report", filename);
      showToast("Attendance PDF exported successfully.", "success");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const pageStart = filteredAttendance.length
    ? (currentPage - 1) * itemsPerPage + 1
    : 0;
  const pageEnd = Math.min(currentPage * itemsPerPage, filteredAttendance.length);

  return (
    <div className="manager-attendance">
      <section className="manager-attendance-hero">
        <div>
          <span className="attendance-eyebrow">Manager Attendance</span>
          <h1>Attendance Management</h1>
          <p>
            Monitor employee attendance, review daily records, update remarks,
            and prepare attendance data for payroll validation.
          </p>
        </div>

        <div className="attendance-hero-actions">
          <button
            type="button"
            className="attendance-btn secondary"
            onClick={() => loadAttendance({ silent: true })}
            disabled={loading || refreshing}
          >
            <FontAwesomeIcon icon={refreshing ? faSpinner : faRefresh} spin={refreshing} />
            Refresh
          </button>

          <div style={{ position: "relative" }}>
            <button type="button" className="attendance-btn secondary" onClick={() => setShowExportDropdown(!showExportDropdown)}>
              <FontAwesomeIcon icon={faDownload} />
              Export ▼
            </button>
            {showExportDropdown && (
              <>
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }} onClick={() => setShowExportDropdown(false)} />
                <div style={{ position: "absolute", top: "100%", right: 0, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 999, minWidth: 160, overflow: "hidden" }}>
                  <button type="button" className="attendance-btn secondary" style={{ width: "100%", borderRadius: 0, border: "none" }} onClick={() => handleExport("csv")}>Export as CSV</button>
                  <button type="button" className="attendance-btn secondary" style={{ width: "100%", borderRadius: 0, border: "none" }} onClick={() => handleExport("excel")}>Export as Excel</button>
                  <button type="button" className="attendance-btn secondary" style={{ width: "100%", borderRadius: 0, border: "none" }} onClick={() => handleExport("pdf")}>Export as PDF</button>
                </div>
              </>
            )}
          </div>

          <button type="button" className="attendance-btn primary" onClick={handlePrint}>
            <FontAwesomeIcon icon={faPrint} />
            Print
          </button>
        </div>
      </section>

      {selectedIds.size > 0 && (
        <section className="attendance-bulk-bar">
          <span>
            <FontAwesomeIcon icon={faCheckSquare} />
            <strong>{selectedIds.size}</strong> selected
          </span>
          <div>
            <button type="button" className="attendance-btn success" onClick={() => handleBulkAction("approve")}>
              <FontAwesomeIcon icon={faThumbsUp} />
              Approve Selected
            </button>
            <button type="button" className="attendance-btn danger" onClick={() => handleBulkAction("reject")}>
              <FontAwesomeIcon icon={faThumbsDown} />
              Reject Selected
            </button>
            <button type="button" className="attendance-btn secondary" onClick={clearSelection}>
              <FontAwesomeIcon icon={faXmark} />
              Clear
            </button>
          </div>
        </section>
      )}

      {error && (
        <div className="attendance-alert error">
          <FontAwesomeIcon icon={faTriangleExclamation} />
          <span>{error}</span>
          <button type="button" onClick={() => loadAttendance()}>
            Retry
          </button>
        </div>
      )}

      <section className="attendance-payroll-panel">
        <div className="attendance-panel-heading">
          <span>
            <FontAwesomeIcon icon={faClock} />
          </span>
          <div>
            <h2>Payroll Attendance Basis</h2>
            <p>
              Attendance hours, late arrivals, undertime, and overtime can be
              used as payroll references.
            </p>
          </div>
        </div>

        <div className="attendance-payroll-grid">
          <InfoMetric label="Average Hours" value={`${statistics.averageHours.toFixed(2)}h`} />
          <InfoMetric label="Overtime Hours" value={`${statistics.overtimeHours.toFixed(2)}h`} />
          <InfoMetric label="Undertime" value={`${statistics.undertimeHours.toFixed(2)}h`} />
          <InfoMetric
            label="Late Deductions"
            value={`-${formatCurrency(statistics.lateDeductions)}`}
            tone="danger"
          />
          <InfoMetric
            label="Overtime Bonus"
            value={`+${formatCurrency(statistics.overtimeBonus)}`}
            tone="success"
          />
          <InfoMetric
            label="Estimated Net Payroll"
            value={formatCurrency(statistics.netPayroll)}
            tone="primary"
          />
        </div>
      </section>

      <section className="attendance-summary-grid">
        <SummaryCard title="Total Records" value={statistics.total} icon={faUsers} tone="primary" />
        <SummaryCard title="Present" value={statistics.present} icon={faUserCheck} tone="success" />
        <SummaryCard title="Late" value={statistics.late} icon={faUserClock} tone="warning" />
        <SummaryCard title="Absent" value={statistics.absent} icon={faUserTimes} tone="danger" />
        <SummaryCard title="Half-day" value={statistics.halfDay} icon={faHourglassHalf} tone="info" />
        <SummaryCard title="Leave" value={statistics.leave} icon={faCalendarAlt} tone="neutral" />
        <SummaryCard
          title="Pending Review"
          value={statistics.pendingReview}
          icon={faTriangleExclamation}
          tone="review"
        />
      </section>

      <section className="attendance-controls-card">
        <div className="attendance-date-row">
          <div className="attendance-date-field">
            <label htmlFor="manager-attendance-date">Attendance Date</label>
            <DatePickerInput
              id="manager-attendance-date"
              selected={selectedDate ? new Date(selectedDate) : null}
              onChange={(date) => setSelectedDate(date ? date.toISOString().split("T")[0] : "")}
              placeholderText="Pick a date..."
              maxDate={new Date()}
            />
          </div>

          <button
            type="button"
            className={`attendance-filter-toggle ${showFilters ? "active" : ""}`}
            onClick={() => setShowFilters((prev) => !prev)}
          >
            <FontAwesomeIcon icon={faFilter} />
            Filters
            <FontAwesomeIcon icon={showFilters ? faChevronUp : faChevronDown} />
          </button>
        </div>

        <div className="attendance-search-row">
          <div className="attendance-search">
            <FontAwesomeIcon icon={faSearch} />
            <input
              type="text"
              placeholder="Search employee, email, ID, role, department, or remarks..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />

            {searchTerm && (
              <button type="button" onClick={() => setSearchTerm("")}>
                <FontAwesomeIcon icon={faXmark} />
              </button>
            )}
          </div>

          <button type="button" className="attendance-clear-btn" onClick={handleClearFilters}>
            Clear Filters
          </button>
        </div>

        {showFilters && (
          <div className="attendance-filter-grid">
            <FilterSelect
              label="Department"
              value={selectedDepartment}
              onChange={setSelectedDepartment}
              options={[
                { value: "all", label: "All Departments" },
                ...departments.map((department) => ({
                  value: department,
                  label: department,
                })),
              ]}
            />

            <FilterSelect
              label="Attendance Status"
              value={selectedStatus}
              onChange={setSelectedStatus}
              options={[
                { value: "all", label: "All Statuses" },
                ...statuses.map((status) => ({
                  value: status,
                  label: formatStatus(status),
                })),
              ]}
            />

            <FilterSelect
              label="Review Status"
              value={selectedReviewStatus}
              onChange={setSelectedReviewStatus}
              options={[
                { value: "all", label: "All Review Status" },
                { value: "pending", label: "Pending" },
                { value: "reviewed", label: "Reviewed" },
              ]}
            />

            <FilterSelect
              label="Sort By"
              value={sortBy}
              onChange={setSortBy}
              options={[
                { value: "name", label: "Employee Name" },
                { value: "department", label: "Department" },
                { value: "role", label: "Role" },
                { value: "status", label: "Status" },
                { value: "reviewStatus", label: "Review Status" },
              ]}
            />

            <button
              type="button"
              className="attendance-sort-btn"
              onClick={() => setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))}
            >
              {sortOrder === "asc" ? "Ascending" : "Descending"}
            </button>
          </div>
        )}
      </section>

      <section className="attendance-table-card">
        <div className="attendance-table-header">
          <div>
            <span className="attendance-eyebrow">Attendance Records</span>
            <h2>{viewMode === "list" ? "Daily Attendance List" : "Calendar View"}</h2>
          </div>

          <div className="attendance-view-toggle">
            <button
              type="button"
              className={viewMode === "list" ? "active" : ""}
              onClick={() => setViewMode("list")}
              title="List view"
            >
              <FontAwesomeIcon icon={faList} />
              List
            </button>
            <button
              type="button"
              className={viewMode === "calendar" ? "active" : ""}
              onClick={() => setViewMode("calendar")}
              title="Calendar view"
            >
              <FontAwesomeIcon icon={faCalendarDays} />
              Calendar
            </button>
          </div>

          <div className="attendance-page-size">
            <label htmlFor="items-per-page">Rows</label>
            <select
              id="items-per-page"
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
          </div>
        </div>

        {loading ? (
          <div className="attendance-loading-state">
            <FontAwesomeIcon icon={faSpinner} spin />
            <h3>Loading attendance records</h3>
            <p>Please wait while attendance data is being loaded.</p>
          </div>
        ) : viewMode === "calendar" ? (
          <CalendarView
            records={filteredAttendance}
            month={calendarMonth}
            onMonthChange={setCalendarMonth}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
          />
        ) : (
          <>
            <div className="attendance-table-scroll">
              <table className="attendance-table">
                <thead>
                  <tr>
                    <th>
                      <button
                        type="button"
                        className="attendance-select-all"
                        onClick={toggleSelectAll}
                        title="Select all on page"
                      >
                        <FontAwesomeIcon
                          icon={
                            paginatedAttendance.length > 0 &&
                            paginatedAttendance.every((r) => selectedIds.has(r.id))
                              ? faCheckSquare
                              : faSquare
                          }
                        />
                      </button>
                    </th>
                    <SortableHeader label="Employee" field="name" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                    <SortableHeader label="Role" field="role" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                    <SortableHeader label="Department" field="department" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                    <th>Date</th>
                    <th>Time In</th>
                    <th>Time Out</th>
                    <SortableHeader label="Status" field="status" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                    <th>Overtime</th>
                    <th>Undertime</th>
                    <th>Remarks</th>
                    <SortableHeader label="Review" field="reviewStatus" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {paginatedAttendance.map((record) => (
                    <tr key={record.id} className={selectedIds.has(record.id) ? "selected" : ""}>
                      <td>
                        <button
                          type="button"
                          className="attendance-select-row"
                          onClick={() => toggleSelect(record.id)}
                        >
                          <FontAwesomeIcon
                            icon={selectedIds.has(record.id) ? faCheckSquare : faSquare}
                          />
                        </button>
                      </td>

                      <td>
                        <div className="attendance-employee-cell">
                          <span>{record.name.charAt(0).toUpperCase()}</span>
                          <div>
                            <strong>{record.name}</strong>
                            <small>{record.employeeId}</small>
                          </div>
                        </div>
                      </td>

                      <td>{record.role}</td>

                      <td>
                        <span className="department-badge">{record.department}</span>
                      </td>

                      <td>{formatDate(record.date)}</td>

                      <td>
                        <div className="attendance-time-cell">
                          <span>{formatTime(record.timeIn)}</span>
                          {record.isLate && <small className="late">Late</small>}
                        </div>
                      </td>

                      <td>
                        <div className="attendance-time-cell">
                          <span>{formatTime(record.timeOut)}</span>
                          {record.isEarlyLeave && <small className="early">Early</small>}
                        </div>
                      </td>

                      <td>
                        <span className={`attendance-status ${record.status}`}>
                          {formatStatus(record.status)}
                        </span>
                      </td>

                      <td>{formatHours(record.overtime)}</td>
                      <td>{formatHours(record.undertime)}</td>

                      <td className="remarks-cell">
                        {record.remarks || "No remarks"}
                      </td>

                      <td>
                        <span className={`attendance-review ${record.reviewStatus}`}>
                          {formatStatus(record.reviewStatus)}
                        </span>
                      </td>

                      <td>
                        <div className="attendance-actions">
                          <button
                            type="button"
                            className="view"
                            title="View details"
                            onClick={() => handleViewDetails(record)}
                          >
                            <FontAwesomeIcon icon={faEye} />
                          </button>

                          <button
                            type="button"
                            className="edit"
                            title="Edit remarks"
                            onClick={() => handleOpenRemarks(record)}
                          >
                            <FontAwesomeIcon icon={faPenToSquare} />
                          </button>

                          <button
                            type="button"
                            className="review"
                            title="Approve"
                            disabled={
                              actionLoadingId === record.id ||
                              record.reviewStatus === "reviewed"
                            }
                            onClick={() => handleReviewAction(record, "approve")}
                          >
                            <FontAwesomeIcon
                              icon={
                                actionLoadingId === record.id
                                  ? faSpinner
                                  : faThumbsUp
                              }
                              spin={actionLoadingId === record.id}
                            />
                          </button>

                          <button
                            type="button"
                            className="reject"
                            title="Reject"
                            disabled={
                              actionLoadingId === record.id ||
                              record.reviewStatus === "rejected"
                            }
                            onClick={() => handleReviewAction(record, "reject")}
                          >
                            <FontAwesomeIcon
                              icon={
                                actionLoadingId === record.id
                                  ? faSpinner
                                  : faThumbsDown
                              }
                              spin={actionLoadingId === record.id}
                            />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>

                {paginatedAttendance.length > 0 && (
                  <tfoot>
                    <tr className="attendance-summary-row">
                      <td colSpan={7}>
                        <strong>Page Totals</strong>
                      </td>
                      <td>
                        <strong>
                          {formatHours(
                            paginatedAttendance.reduce((sum, r) => sum + toHours(r.overtime), 0)
                          )}
                        </strong>
                      </td>
                      <td>
                        <strong>
                          {formatHours(
                            paginatedAttendance.reduce((sum, r) => sum + toHours(r.undertime), 0)
                          )}
                        </strong>
                      </td>
                      <td colSpan={4} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {paginatedAttendance.length === 0 && (
              <div className="attendance-empty-state">
                <FontAwesomeIcon icon={faCalendarAlt} />
                <h3>No attendance records found</h3>
                <p>
                  Try adjusting the selected date, search keyword, or filters.
                </p>
              </div>
            )}

            <div className="attendance-pagination">
              <p>
                Showing {pageStart} to {pageEnd} of {filteredAttendance.length} records
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
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                  }
                >
                  Next
                  <FontAwesomeIcon icon={faChevronRight} />
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      <PrintArea
        records={filteredAttendance}
        selectedDate={selectedDate}
        statistics={statistics}
      />

      {showDetailsModal && selectedAttendance && (
        <DetailsModal
          record={selectedAttendance}
          onClose={() => {
            setShowDetailsModal(false);
            setSelectedAttendance(null);
          }}
          onEdit={() => {
            setShowDetailsModal(false);
            handleOpenRemarks(selectedAttendance);
          }}
        />
      )}

      {showRemarksModal && selectedAttendance && (
        <RemarksModal
          record={selectedAttendance}
          form={remarksForm}
          setForm={setRemarksForm}
          saving={actionLoadingId === selectedAttendance.id}
          onClose={() => {
            setShowRemarksModal(false);
            setSelectedAttendance(null);
          }}
          onSave={handleSaveRemarks}
        />
      )}

      {toast && (
        <div className={`attendance-toast ${toast.type}`}>
          <FontAwesomeIcon
            icon={toast.type === "error" ? faTriangleExclamation : faCheckCircle}
          />
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
};

const STATUS_DOT_COLORS = {
  present: "#10b981",
  late: "#f59e0b",
  absent: "#ef4444",
  half_day: "#3b82f6",
  on_leave: "#8b5cf6",
  default: "#64748b",
};

const CalendarView = ({ records, month, onMonthChange, selectedIds, onToggleSelect }) => {
  const [year, mon] = month.split("-").map(Number);
  const firstDay = new Date(year, mon - 1, 1);
  const lastDay = new Date(year, mon, 0);
  const daysInMonth = lastDay.getDate();
  const startWeekday = firstDay.getDay();

  const byDate = useMemo(() => {
    const map = {};
    records.forEach((r) => {
      const d = String(r.date).split("T")[0];
      if (!map[d]) map[d] = [];
      map[d].push(r);
    });
    return map;
  }, [records]);

  const prevMonth = () => {
    const d = new Date(year, mon - 2, 1);
    onMonthChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const nextMonth = () => {
    const d = new Date(year, mon, 1);
    onMonthChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(day);

  return (
    <div className="attendance-calendar">
      <div className="attendance-calendar-header">
        <button type="button" onClick={prevMonth}>
          <FontAwesomeIcon icon={faChevronLeft} />
        </button>
        <strong>
          {firstDay.toLocaleDateString("en-PH", { month: "long", year: "numeric" })}
        </strong>
        <button type="button" onClick={nextMonth}>
          <FontAwesomeIcon icon={faChevronRight} />
        </button>
      </div>

      <div className="attendance-calendar-grid">
        {dayNames.map((d) => (
          <div key={d} className="attendance-calendar-dayname">
            {d}
          </div>
        ))}

        {cells.map((day, idx) => {
          if (!day) return <div key={idx} className="attendance-calendar-cell empty" />;
          const dateKey = `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayRecords = byDate[dateKey] || [];
          return (
            <div key={idx} className="attendance-calendar-cell">
              <span className="attendance-calendar-date">{day}</span>
              <div className="attendance-calendar-dots">
                {dayRecords.slice(0, 5).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={selectedIds.has(r.id) ? "selected" : ""}
                    style={{
                      backgroundColor: STATUS_DOT_COLORS[r.status] || STATUS_DOT_COLORS.default,
                    }}
                    title={`${r.name} — ${formatStatus(r.status)}`}
                    onClick={() => onToggleSelect(r.id)}
                  />
                ))}
                {dayRecords.length > 5 && (
                  <small>+{dayRecords.length - 5}</small>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {records.length === 0 && (
        <div className="attendance-empty-state">
          <FontAwesomeIcon icon={faCalendarAlt} />
          <h3>No records for this month</h3>
          <p>Try a different month or adjust filters.</p>
        </div>
      )}
    </div>
  );
};

const SummaryCard = ({ title, value, icon, tone }) => (
  <article className={`attendance-summary-card ${tone}`}>
    <span>
      <FontAwesomeIcon icon={icon} />
    </span>
    <div>
      <strong>{value}</strong>
      <p>{title}</p>
    </div>
  </article>
);

const InfoMetric = ({ label, value, tone = "default" }) => (
  <div className={`attendance-info-metric ${tone}`}>
    <small>{label}</small>
    <strong>{value}</strong>
  </div>
);

const FilterSelect = ({ label, value, options, onChange }) => (
  <div className="attendance-filter-field">
    <label>{label}</label>
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option value={option.value} key={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </div>
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

const DetailsModal = ({ record, onClose, onEdit }) => (
  <div className="attendance-modal-overlay">
    <div className="attendance-modal large">
      <div className="attendance-modal-header">
        <div>
          <span className="attendance-eyebrow">Attendance Details</span>
          <h2>{record.name}</h2>
        </div>

        <button type="button" onClick={onClose}>
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      <div className="attendance-modal-body">
        <DetailSection
          title="Employee Information"
          items={[
            ["Employee ID", record.employeeId],
            ["Email", record.email],
            ["Role", record.role],
            ["Department", record.department],
          ]}
        />

        <DetailSection
          title="Attendance Information"
          items={[
            ["Date", formatDate(record.date)],
            ["Time In", formatTime(record.timeIn)],
            ["Time Out", formatTime(record.timeOut)],
            ["Break Time", formatHours(record.breakTime)],
            ["Total Hours", formatHours(record.totalHours)],
            ["Overtime", formatHours(record.overtime)],
            ["Undertime", formatHours(record.undertime)],
            ["Status", formatStatus(record.status)],
            ["Review Status", formatStatus(record.reviewStatus)],
            ["Location", record.location],
          ]}
        />

        <DetailSection
          title="Payroll Reference"
          items={[
            ["Salary Rate", formatCurrency(record.salaryRate)],
            ["Daily Earnings", formatCurrency(record.dailyEarnings)],
            ["Approved By", record.approvedBy],
          ]}
        />

        <div className="attendance-detail-section">
          <h3>Remarks</h3>
          <p className="attendance-remarks-box">
            {record.remarks || "No remarks added yet."}
          </p>
        </div>
      </div>

      <div className="attendance-modal-footer">
        <button type="button" className="attendance-btn secondary" onClick={onClose}>
          Close
        </button>
        <button type="button" className="attendance-btn primary" onClick={onEdit}>
          <FontAwesomeIcon icon={faPenToSquare} />
          Edit Remarks
        </button>
      </div>
    </div>
  </div>
);

const RemarksModal = ({ record, form, setForm, saving, onClose, onSave }) => (
  <div className="attendance-modal-overlay">
    <div className="attendance-modal">
      <div className="attendance-modal-header">
        <div>
          <span className="attendance-eyebrow">Update Remarks</span>
          <h2>{record.name}</h2>
        </div>

        <button type="button" onClick={onClose}>
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      <div className="attendance-modal-body">
        <label className="attendance-textarea-field">
          <span>Manager Remarks</span>
          <textarea
            rows={6}
            value={form.remarks}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                remarks: event.target.value,
              }))
            }
            placeholder="Add notes about late arrival, undertime, correction, or attendance validation..."
          />
        </label>
      </div>

      <div className="attendance-modal-footer">
        <button type="button" className="attendance-btn secondary" onClick={onClose}>
          Cancel
        </button>

        <button
          type="button"
          className="attendance-btn primary"
          onClick={onSave}
          disabled={saving}
        >
          <FontAwesomeIcon icon={saving ? faSpinner : faCheckCircle} spin={saving} />
          {saving ? "Saving..." : "Save Remarks"}
        </button>
      </div>
    </div>
  </div>
);

const DetailSection = ({ title, items }) => (
  <div className="attendance-detail-section">
    <h3>{title}</h3>
    <div className="attendance-detail-grid">
      {items.map(([label, value]) => (
        <div key={label}>
          <small>{label}</small>
          <strong>{value || "N/A"}</strong>
        </div>
      ))}
    </div>
  </div>
);

const PrintArea = ({ records, selectedDate, statistics }) => (
  <section className="attendance-print-area">
    <h1>Pawesome Retreat Inc.</h1>
    <h2>Manager Attendance Report</h2>
    <p>Date: {formatDate(selectedDate)}</p>

    <div className="print-summary">
      <span>Total: {statistics.total}</span>
      <span>Present: {statistics.present}</span>
      <span>Late: {statistics.late}</span>
      <span>Absent: {statistics.absent}</span>
      <span>Pending Review: {statistics.pendingReview}</span>
    </div>

    <table>
      <thead>
        <tr>
          <th>Employee</th>
          <th>Department</th>
          <th>Role</th>
          <th>Time In</th>
          <th>Time Out</th>
          <th>Status</th>
          <th>Total Hours</th>
          <th>Review</th>
          <th>Remarks</th>
        </tr>
      </thead>
      <tbody>
        {records.map((record) => (
          <tr key={record.id}>
            <td>{record.name}</td>
            <td>{record.department}</td>
            <td>{record.role}</td>
            <td>{formatTime(record.timeIn)}</td>
            <td>{formatTime(record.timeOut)}</td>
            <td>{formatStatus(record.status)}</td>
            <td>{formatHours(record.totalHours)}</td>
            <td>{formatStatus(record.reviewStatus)}</td>
            <td>{record.remarks || ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </section>
);

export default ManagerAttendance;
