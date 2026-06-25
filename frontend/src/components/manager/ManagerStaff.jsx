import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBriefcase,
  faCalendarAlt,
  faChartPie,
  faCheckCircle,
  faChevronDown,
  faChevronLeft,
  faChevronRight,
  faChevronUp,
  faClock,
  faDownload,
  faEnvelope,
  faEye,
  faFileInvoiceDollar,
  faFingerprint,
  faFilter,
  faIdCard,
  faMapMarkerAlt,
  faMoneyBillWave,
  faPenToSquare,
  faPhone,
  faRefresh,
  faSave,
  faSearch,
  faSpinner,
  faTable,
  faTriangleExclamation,
  faUserCheck,
  faUsers,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import { formatCurrency } from "../../utils/currency";
import FingerprintEnrollment from "./FingerprintEnrollment";
import "./ManagerStaff.css";

const ROLE_COLORS = {
  manager: "#7c3aed",
  cashier: "#0891b2",
  receptionist: "#d97706",
  veterinary: "#059669",
  inventory: "#ea580c",
  payroll: "#7c3aed",
  staff: "#3b82f6",
  groomer: "#ec4899",
  default: "#64748b",
};

const getRoleColor = (role) => ROLE_COLORS[(role || "").toLowerCase().replace(/\s+/g, "_")] || ROLE_COLORS.default;

const isRequestCancelled = (error, signal) =>
  signal?.aborted ||
  error?.name === "AbortError" ||
  error?.message === "Request was cancelled";

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
  String(value || "active")
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
  record.name ||
  record.employee_name ||
  record.staff_name ||
  record.user?.name ||
  record.employee?.name ||
  "Unknown Employee";

const getDepartment = (record) =>
  record.department ||
  record.employee?.department ||
  record.user?.department ||
  "Unassigned";

const getRole = (record) =>
  record.role ||
  record.position ||
  record.job_title ||
  record.employee?.position ||
  record.user?.role ||
  "Staff";

const getEmail = (record) =>
  record.email || record.user?.email || record.employee?.email || "N/A";

const getPhone = (record) =>
  record.phone ||
  record.contact_number ||
  record.mobile_number ||
  record.user?.phone ||
  record.employee?.phone ||
  "N/A";

const normalizeStaff = (record, index) => {
  const id = record.id || record.user_id || record.employee_id || record.staff_id || index + 1;
  const status = normalizeStatus(record.status || record.employment_status || "active");

  return {
    id,
    rawId: id,
    employeeCode:
      record.employee_code ||
      record.employee_no ||
      record.staff_code ||
      `EMP${String(id).padStart(3, "0")}`,
    name: getEmployeeName(record),
    email: getEmail(record),
    phone: getPhone(record),
    department: getDepartment(record),
    role: getRole(record),
    status,
    address: record.address || record.employee?.address || "N/A",
    hireDate: record.hire_date || record.date_hired || record.created_at || "",
    schedule: record.schedule || record.shift || "N/A",
    attendanceRecords: safeNumber(
      record.attendance_records ||
        record.attendance_count ||
        record.total_attendance ||
        record.attendance_summary?.total ||
        0
    ),
    presentDays: safeNumber(
      record.present_days ||
        record.attendance_summary?.present ||
        record.present_count ||
        0
    ),
    lateDays: safeNumber(
      record.late_days ||
        record.attendance_summary?.late ||
        record.late_count ||
        0
    ),
    absentDays: safeNumber(
      record.absent_days ||
        record.attendance_summary?.absent ||
        record.absent_count ||
        0
    ),
    attendanceIssues: safeNumber(
      record.attendance_issues ||
        record.pending_attendance_issues ||
        record.late_count ||
        record.absent_count ||
        0
    ),
    payrollRecords: safeNumber(
      record.payroll_records ||
        record.payroll_count ||
        record.total_payroll_records ||
        0
    ),
    latestPayroll: safeNumber(
      record.latest_payroll ||
        record.last_net_pay ||
        record.net_pay ||
        record.salary ||
        record.basic_salary ||
        0
    ),
    totalPayroll: safeNumber(
      record.total_payroll ||
        record.payroll_total ||
        record.total_net_pay ||
        0
    ),
    avatar:
      record.avatar ||
      record.profile_photo ||
      record.photo ||
      record.image ||
      record.user?.profile_photo ||
      "",
    raw: record,
  };
};

const normalizeAttendance = (record, index) => ({
  id: record.id || record.attendance_id || index + 1,
  date: record.date || record.attendance_date || record.created_at,
  status: normalizeStatus(record.status || record.attendance_status),
  timeIn: record.time_in || record.check_in || record.checkIn || "",
  timeOut: record.time_out || record.check_out || record.checkOut || "",
  overtime: record.overtime_hours || record.overtime || 0,
  undertime: record.undertime_hours || record.undertime || 0,
  remarks: record.remarks || record.notes || record.manager_remarks || "",
  reviewStatus: normalizeStatus(
    record.review_status ||
      record.manager_review_status ||
      (record.reviewed || record.is_reviewed ? "reviewed" : "pending")
  ),
});

const normalizePayroll = (record, index) => {
  const grossPay = safeNumber(record.gross_pay || record.total_gross_pay || record.amount || 0);
  const deductions = safeNumber(record.deductions || record.total_deductions || 0);
  const netPay = safeNumber(record.net_pay || record.total_net_pay || grossPay - deductions);

  return {
    id: record.id || record.payroll_id || index + 1,
    period: record.payroll_period || record.period || record.month || record.cutoff || "N/A",
    date: record.created_at || record.updated_at || record.payroll_date,
    grossPay,
    deductions,
    netPay,
    status: normalizeStatus(record.status || record.payroll_status),
  };
};

const escapeCSV = (value) => {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
};

const ManagerStaff = () => {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  const [selectedRole, setSelectedRole] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [sortOrder, setSortOrder] = useState("asc");
  const [showFilters, setShowFilters] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [selectedStaff, setSelectedStaff] = useState(null);
  const [activeModal, setActiveModal] = useState(null);
  const [modalRecords, setModalRecords] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState("");
  const [profileTab, setProfileTab] = useState("profile");
  const [editForm, setEditForm] = useState({});
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [enrollUser, setEnrollUser] = useState(null);

  const showToast = useCallback((message, type = "info") => {
    setToast({ message, type });
    window.clearTimeout(window.managerStaffToastTimer);
    window.managerStaffToastTimer = window.setTimeout(() => setToast(null), 3500);
  }, []);

  const loadStaff = useCallback(
    async ({ silent = false, signal } = {}) => {
      try {
        if (silent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        const response = await apiRequest("/manager/staff", { signal });
        const list = normalizeList(response, ["staff", "users", "employees", "data"]);
        setStaff(list.map(normalizeStaff));
      } catch (err) {
        if (isRequestCancelled(err, signal)) {
          return;
        }

        console.error("Manager staff load error:", err);
        setError(
          err.message ||
            "Failed to load staff records. Please verify the /manager/staff endpoint."
        );
        setStaff([]);
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    const controller = new AbortController();
    loadStaff({ signal: controller.signal });

    return () => controller.abort();
  }, [loadStaff]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedDepartment, selectedRole, selectedStatus, sortBy, sortOrder]);

  const departments = useMemo(() => {
    return [...new Set(staff.map((person) => person.department))]
      .filter(Boolean)
      .sort();
  }, [staff]);

  const roles = useMemo(() => {
    return [...new Set(staff.map((person) => person.role))]
      .filter(Boolean)
      .sort();
  }, [staff]);

  const statuses = useMemo(() => {
    return [...new Set(staff.map((person) => person.status))]
      .filter(Boolean)
      .sort();
  }, [staff]);

  const filteredStaff = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return staff
      .filter((person) => {
        const matchesSearch =
          !search ||
          [
            person.name,
            person.email,
            person.phone,
            person.employeeCode,
            person.department,
            person.role,
            person.status,
          ]
            .join(" ")
            .toLowerCase()
            .includes(search);

        const matchesDepartment =
          selectedDepartment === "all" || person.department === selectedDepartment;

        const matchesRole = selectedRole === "all" || person.role === selectedRole;

        const matchesStatus =
          selectedStatus === "all" || person.status === selectedStatus;

        return matchesSearch && matchesDepartment && matchesRole && matchesStatus;
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
    searchTerm,
    selectedDepartment,
    selectedRole,
    selectedStatus,
    sortBy,
    sortOrder,
    staff,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredStaff.length / itemsPerPage));

  const paginatedStaff = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredStaff.slice(start, start + itemsPerPage);
  }, [currentPage, filteredStaff, itemsPerPage]);

  const statistics = useMemo(() => {
    const totalStaff = staff.length;
    const activeStaff = staff.filter((person) => person.status === "active").length;
    const onDutyToday = staff.filter((person) =>
      ["on_duty", "present", "active"].includes(person.status)
    ).length;
    const withAttendanceIssues = staff.filter(
      (person) => person.attendanceIssues > 0 || person.lateDays > 0 || person.absentDays > 0
    ).length;
    const withPayrollRecords = staff.filter((person) => person.payrollRecords > 0).length;
    const estimatedPayroll = staff.reduce(
      (sum, person) => sum + (person.latestPayroll || person.totalPayroll || 0),
      0
    );

    return {
      totalStaff,
      activeStaff,
      onDutyToday,
      withAttendanceIssues,
      withPayrollRecords,
      estimatedPayroll,
    };
  }, [staff]);

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedDepartment("all");
    setSelectedRole("all");
    setSelectedStatus("all");
    setSortBy("name");
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

  const exportCSV = () => {
    if (filteredStaff.length === 0) {
      showToast("There is no staff data to export.", "warning");
      return;
    }

    const headers = [
      "Employee Code",
      "Name",
      "Email",
      "Phone",
      "Department",
      "Role",
      "Status",
      "Hire Date",
      "Attendance Records",
      "Attendance Issues",
      "Payroll Records",
      "Latest Payroll",
    ];

    const rows = filteredStaff.map((person) => [
      person.employeeCode,
      person.name,
      person.email,
      person.phone,
      person.department,
      person.role,
      formatLabel(person.status),
      formatDate(person.hireDate),
      person.attendanceRecords,
      person.attendanceIssues,
      person.payrollRecords,
      formatCurrency(person.latestPayroll),
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
    link.download = `manager-staff-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();

    URL.revokeObjectURL(url);
    showToast("Staff CSV exported successfully.", "success");
  };

  const openProfile = (person) => {
    setSelectedStaff(person);
    setActiveModal("profile");
    setModalRecords([]);
    setModalError("");
  };

  const openAttendance = async (person) => {
    setSelectedStaff(person);
    setActiveModal("attendance");
    setModalRecords([]);
    setModalError("");
    setModalLoading(true);

    try {
      const response = await apiRequest(`/manager/staff/${person.rawId}/attendance`);
      const records = normalizeList(response, ["attendance", "records", "items"]);
      setModalRecords(records.map(normalizeAttendance));
    } catch (primaryError) {
      try {
        const fallback = await apiRequest("/manager/attendance");
        const fallbackRecords = normalizeList(fallback, ["attendance", "records", "items"]);
        const filtered = fallbackRecords.filter((record) => {
          const recordEmployeeId =
            record.employee_id || record.staff_id || record.user_id || record.employee?.id;
          const recordName = getEmployeeName(record).toLowerCase();

          return (
            String(recordEmployeeId) === String(person.rawId) ||
            recordName === person.name.toLowerCase()
          );
        });

        setModalRecords(filtered.map(normalizeAttendance));

        if (filtered.length === 0) {
          setModalError(
            "No attendance records were found for this employee. The staff attendance endpoint may still need backend verification."
          );
        }
      } catch (fallbackError) {
        console.error("Staff attendance load error:", primaryError, fallbackError);
        setModalError(
          "Unable to load attendance records. Please verify /manager/staff/{id}/attendance or /manager/attendance."
        );
      }
    } finally {
      setModalLoading(false);
    }
  };

  const openPayroll = async (person) => {
    setSelectedStaff(person);
    setActiveModal("payroll");
    setModalRecords([]);
    setModalError("");
    setModalLoading(true);

    try {
      const response = await apiRequest(`/manager/staff/${person.rawId}/payroll`);
      const records = normalizeList(response, ["payroll", "records", "items"]);
      setModalRecords(records.map(normalizePayroll));
    } catch (primaryError) {
      try {
        const fallback = await apiRequest("/manager/payroll");
        const fallbackRecords = normalizeList(fallback, ["payroll", "records", "items"]);
        const filtered = fallbackRecords.filter((record) => {
          const recordEmployeeId =
            record.employee_id || record.staff_id || record.user_id || record.employee?.id;
          const recordName = getEmployeeName(record).toLowerCase();

          return (
            String(recordEmployeeId) === String(person.rawId) ||
            recordName === person.name.toLowerCase()
          );
        });

        setModalRecords(filtered.map(normalizePayroll));

        if (filtered.length === 0) {
          setModalError(
            "No payroll records were found for this employee. The staff payroll endpoint may still need backend verification."
          );
        }
      } catch (fallbackError) {
        console.error("Staff payroll load error:", primaryError, fallbackError);
        setModalError(
          "Unable to load payroll records. Please verify /manager/staff/{id}/payroll or /manager/payroll."
        );
      }
    } finally {
      setModalLoading(false);
    }
  };

  const closeModal = () => {
    setSelectedStaff(null);
    setActiveModal(null);
    setModalRecords([]);
    setModalError("");
    setModalLoading(false);
    setProfileTab("profile");
    setEditForm({});
  };

  const openEdit = (person) => {
    setSelectedStaff(person);
    setEditForm({
      phone: person.phone || "",
      department: person.department || "",
      schedule: person.schedule || "",
      address: person.address || "",
    });
    setActiveModal("edit");
  };

  const handleEditChange = (field, value) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const saveEdit = async () => {
    if (!selectedStaff) return;
    try {
      await apiRequest(`/manager/staff/${selectedStaff.rawId}`, {
        method: "PUT",
        body: JSON.stringify(editForm),
      });
      setStaff((prev) =>
        prev.map((p) =>
          p.id === selectedStaff.id
            ? { ...p, phone: editForm.phone, department: editForm.department, schedule: editForm.schedule, address: editForm.address }
            : p
        )
      );
      showToast("Staff details updated successfully.", "success");
      closeModal();
    } catch (err) {
      console.error("Staff edit error:", err);
      setStaff((prev) =>
        prev.map((p) =>
          p.id === selectedStaff.id
            ? { ...p, phone: editForm.phone, department: editForm.department, schedule: editForm.schedule, address: editForm.address }
            : p
        )
      );
      showToast("Updated locally. Backend endpoint may not be ready yet.", "warning");
      closeModal();
    }
  };

  const pageStart = filteredStaff.length ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const pageEnd = Math.min(currentPage * itemsPerPage, filteredStaff.length);

  return (
    <div className="manager-staff">
      <section className="manager-staff-hero">
        <div>
          <span className="staff-eyebrow">Manager Staff Overview</span>
          <h1>Staff Directory</h1>
          <p>
            View employee profiles, attendance summaries, payroll references, and
            workforce status. Manager access is limited to monitoring and review.
          </p>
        </div>

        <div className="staff-hero-actions">
          <button
            type="button"
            className="staff-btn secondary"
            onClick={() => loadStaff({ silent: true })}
            disabled={loading || refreshing}
          >
            <FontAwesomeIcon icon={refreshing ? faSpinner : faRefresh} spin={refreshing} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>

          <button type="button" className="staff-btn primary" onClick={exportCSV}>
            <FontAwesomeIcon icon={faDownload} />
            Export CSV
          </button>
        </div>
      </section>

      {error && (
        <div className="staff-alert error">
          <FontAwesomeIcon icon={faTriangleExclamation} />
          <span>{error}</span>
          <button type="button" onClick={() => loadStaff()}>
            Retry
          </button>
        </div>
      )}

      <section className="staff-summary-grid">
        <SummaryCard label="Total Staff" value={statistics.totalStaff} icon={faUsers} tone="primary" />
        <SummaryCard label="Active Staff" value={statistics.activeStaff} icon={faUserCheck} tone="success" />
        <SummaryCard label="On Duty Today" value={statistics.onDutyToday} icon={faClock} tone="info" />
        <SummaryCard
          label="Attendance Issues"
          value={statistics.withAttendanceIssues}
          icon={faTriangleExclamation}
          tone="warning"
        />
        <SummaryCard
          label="With Payroll Records"
          value={statistics.withPayrollRecords}
          icon={faFileInvoiceDollar}
          tone="money"
        />
        <SummaryCard
          label="Payroll Reference"
          value={formatCurrency(statistics.estimatedPayroll)}
          icon={faMoneyBillWave}
          tone="money"
        />
      </section>

      <section className="staff-controls-card">
        <div className="staff-search-row">
          <div className="staff-search-box">
            <FontAwesomeIcon icon={faSearch} />
            <input
              type="text"
              placeholder="Search employee name, email, phone, ID, role, department, or status..."
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
            className={`staff-filter-toggle ${showFilters ? "active" : ""}`}
            onClick={() => setShowFilters((prev) => !prev)}
          >
            <FontAwesomeIcon icon={faFilter} />
            Filters
            <FontAwesomeIcon icon={showFilters ? faChevronUp : faChevronDown} />
          </button>
        </div>

        {showFilters && (
          <div className="staff-filter-grid">
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
              <select
                value={selectedRole}
                onChange={(event) => setSelectedRole(event.target.value)}
              >
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
                <option value="name">Name</option>
                <option value="department">Department</option>
                <option value="role">Role</option>
                <option value="status">Status</option>
                <option value="attendanceIssues">Attendance Issues</option>
                <option value="payrollRecords">Payroll Records</option>
                <option value="latestPayroll">Latest Payroll</option>
              </select>
            </FilterField>

            <button
              type="button"
              className="staff-sort-btn"
              onClick={() => setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))}
            >
              {sortOrder === "asc" ? "Ascending" : "Descending"}
            </button>

            <button type="button" className="staff-clear-btn" onClick={clearFilters}>
              Clear Filters
            </button>
          </div>
        )}
      </section>

      <section className="staff-table-card">
        <div className="staff-table-header">
          <div>
            <span className="staff-eyebrow">Staff Records</span>
            <h2>Employee List</h2>
          </div>

          <label className="staff-page-size">
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
          <div className="staff-loading-state">
            <FontAwesomeIcon icon={faSpinner} spin />
            <h3>Loading staff records</h3>
            <p>Please wait while employee records are being loaded.</p>
          </div>
        ) : (
          <>
            <div className="staff-table-scroll">
              <table className="staff-table">
                <thead>
                  <tr>
                    <SortableHeader
                      label="Employee"
                      field="name"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Department"
                      field="department"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Role"
                      field="role"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={handleSort}
                    />
                    <th>Contact</th>
                    <SortableHeader
                      label="Status"
                      field="status"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Attendance Issues"
                      field="attendanceIssues"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Payroll Records"
                      field="payrollRecords"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={handleSort}
                    />
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {paginatedStaff.map((person) => (
                    <tr key={person.id}>
                      <td>
                        <div className="staff-member-cell">
                          <span
                            className="staff-avatar"
                            style={
                              person.avatar
                                ? undefined
                                : { backgroundColor: getRoleColor(person.role) }
                            }
                          >
                            {person.avatar ? (
                              <img src={person.avatar} alt={person.name} />
                            ) : (
                              person.name.charAt(0).toUpperCase()
                            )}
                          </span>

                          <div>
                            <strong>{person.name}</strong>
                            <small>{person.employeeCode}</small>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className="staff-department-badge">{person.department}</span>
                      </td>

                      <td>{person.role}</td>

                      <td>
                        <div className="staff-contact-cell">
                          <span>
                            <FontAwesomeIcon icon={faEnvelope} />
                            {person.email}
                          </span>
                          <span>
                            <FontAwesomeIcon icon={faPhone} />
                            {person.phone}
                          </span>
                        </div>
                      </td>

                      <td>
                        <StatusBadge status={person.status} />
                      </td>

                      <td>
                        <span
                          className={`staff-issue-count ${
                            person.attendanceIssues > 0 ? "warning" : "clear"
                          }`}
                        >
                          {person.attendanceIssues}
                        </span>
                      </td>

                      <td>
                        <span className="staff-payroll-count">{person.payrollRecords}</span>
                      </td>

                      <td>
                        <div className="staff-actions">
                          <button type="button" onClick={() => openProfile(person)}>
                            <FontAwesomeIcon icon={faEye} />
                            Profile
                          </button>

                          <button type="button" onClick={() => openAttendance(person)}>
                            <FontAwesomeIcon icon={faCalendarAlt} />
                            Attendance
                          </button>

                          <button type="button" onClick={() => openPayroll(person)}>
                            <FontAwesomeIcon icon={faMoneyBillWave} />
                            Payroll
                          </button>

                          <button type="button" onClick={() => openEdit(person)}>
                            <FontAwesomeIcon icon={faPenToSquare} />
                            Edit
                          </button>

                          <button
                            type="button"
                            className="staff-fingerprint-btn"
                            onClick={() => { setEnrollUser({ id: person.id, name: person.name }); setShowEnrollModal(true); }}
                          >
                            <FontAwesomeIcon icon={faFingerprint} />
                            Fingerprint
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {paginatedStaff.length === 0 && (
              <div className="staff-empty-state">
                <FontAwesomeIcon icon={faTable} />
                <h3>No staff records found</h3>
                <p>Try adjusting your search, filters, or selected sorting option.</p>
              </div>
            )}

            <div className="staff-pagination">
              <p>
                Showing {pageStart} to {pageEnd} of {filteredStaff.length} staff records
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

      {activeModal === "profile" && selectedStaff && (
        <ProfileModal
          staff={selectedStaff}
          activeTab={profileTab}
          onTabChange={setProfileTab}
          onClose={closeModal}
        />
      )}

      {activeModal === "edit" && selectedStaff && (
        <div className="staff-modal-overlay">
          <div className="staff-modal">
            <div className="staff-modal-header">
              <div>
                <span className="staff-eyebrow">Edit Staff</span>
                <h2>{selectedStaff.name}</h2>
              </div>
              <button type="button" onClick={closeModal}>
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            <div className="staff-modal-body">
              <div className="staff-edit-form">
                <label>
                  <span>Phone</span>
                  <input
                    type="text"
                    value={editForm.phone || ""}
                    onChange={(e) => handleEditChange("phone", e.target.value)}
                    placeholder="Phone number"
                  />
                </label>
                <label>
                  <span>Department</span>
                  <input
                    type="text"
                    value={editForm.department || ""}
                    onChange={(e) => handleEditChange("department", e.target.value)}
                    placeholder="Department"
                  />
                </label>
                <label>
                  <span>Schedule</span>
                  <input
                    type="text"
                    value={editForm.schedule || ""}
                    onChange={(e) => handleEditChange("schedule", e.target.value)}
                    placeholder="e.g. Mon-Fri 9AM-5PM"
                  />
                </label>
                <label>
                  <span>Address</span>
                  <textarea
                    value={editForm.address || ""}
                    onChange={(e) => handleEditChange("address", e.target.value)}
                    placeholder="Address"
                    rows={3}
                  />
                </label>
              </div>
            </div>

            <div className="staff-modal-footer">
              <button type="button" className="staff-btn secondary" onClick={closeModal}>
                Cancel
              </button>
              <button type="button" className="staff-btn primary" onClick={saveEdit}>
                <FontAwesomeIcon icon={faSave} />
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {showEnrollModal && enrollUser && (
        <FingerprintEnrollment
          userId={enrollUser.id}
          userName={enrollUser.name}
          onClose={() => setShowEnrollModal(false)}
          onEnrolled={() => showToast("Fingerprint enrolled successfully.", "success")}
        />
      )}

      {(activeModal === "attendance" || activeModal === "payroll") && selectedStaff && (
        <RecordsModal
          type={activeModal}
          staff={selectedStaff}
          records={modalRecords}
          loading={modalLoading}
          error={modalError}
          onClose={closeModal}
        />
      )}

      {toast && (
        <div className={`staff-toast ${toast.type}`}>
          <FontAwesomeIcon
            icon={toast.type === "warning" ? faTriangleExclamation : faCheckCircle}
          />
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
};

const SummaryCard = ({ label, value, icon, tone }) => (
  <article className={`staff-summary-card ${tone}`}>
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
  <label className="staff-filter-field">
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
  <span className={`staff-status ${normalizeStatus(status)}`}>{formatLabel(status)}</span>
);

const ProfileModal = ({ staff, activeTab, onTabChange, onClose }) => {
  const attendanceRate =
    staff.attendanceRecords > 0
      ? Math.round((staff.presentDays / staff.attendanceRecords) * 100)
      : 0;
  const onTimeRate =
    staff.attendanceRecords > 0
      ? Math.round(
          ((staff.attendanceRecords - staff.lateDays - staff.absentDays) / staff.attendanceRecords) *
            100
        )
      : 0;
  const lateRate =
    staff.attendanceRecords > 0
      ? Math.round((staff.lateDays / staff.attendanceRecords) * 100)
      : 0;
  const absentRate =
    staff.attendanceRecords > 0
      ? Math.round((staff.absentDays / staff.attendanceRecords) * 100)
      : 0;

  return (
    <div className="staff-modal-overlay">
      <div className="staff-modal large">
        <div className="staff-modal-header">
          <div>
            <span className="staff-eyebrow">Employee Profile</span>
            <h2>{staff.name}</h2>
          </div>

          <button type="button" onClick={onClose}>
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className="staff-modal-tabs">
          <button
            type="button"
            className={activeTab === "profile" ? "active" : ""}
            onClick={() => onTabChange("profile")}
          >
            <FontAwesomeIcon icon={faIdCard} />
            Profile
          </button>
          <button
            type="button"
            className={activeTab === "performance" ? "active" : ""}
            onClick={() => onTabChange("performance")}
          >
            <FontAwesomeIcon icon={faChartPie} />
            Performance
          </button>
        </div>

        <div className="staff-modal-body">
          {activeTab === "profile" ? (
            <>
              <div className="staff-profile-card">
                <span
                  className="staff-profile-avatar"
                  style={
                    staff.avatar
                      ? undefined
                      : { backgroundColor: getRoleColor(staff.role) }
                  }
                >
                  {staff.avatar ? (
                    <img src={staff.avatar} alt={staff.name} />
                  ) : (
                    staff.name.charAt(0)
                  )}
                </span>

                <div>
                  <h3>{staff.name}</h3>
                  <p>{staff.role}</p>
                  <StatusBadge status={staff.status} />
                </div>
              </div>

              <div className="staff-detail-grid">
                <DetailItem icon={faIdCard} label="Employee Code" value={staff.employeeCode} />
                <DetailItem icon={faBriefcase} label="Department" value={staff.department} />
                <DetailItem icon={faEnvelope} label="Email" value={staff.email} />
                <DetailItem icon={faPhone} label="Phone" value={staff.phone} />
                <DetailItem icon={faMapMarkerAlt} label="Address" value={staff.address} />
                <DetailItem
                  icon={faCalendarAlt}
                  label="Hire Date"
                  value={formatDate(staff.hireDate)}
                />
                <DetailItem icon={faClock} label="Schedule" value={staff.schedule} />
                <DetailItem
                  icon={faMoneyBillWave}
                  label="Latest Payroll"
                  value={formatCurrency(staff.latestPayroll)}
                />
              </div>

              <div className="staff-profile-summary">
                <div>
                  <small>Attendance Records</small>
                  <strong>{staff.attendanceRecords}</strong>
                </div>
                <div>
                  <small>Present Days</small>
                  <strong>{staff.presentDays}</strong>
                </div>
                <div>
                  <small>Late Days</small>
                  <strong>{staff.lateDays}</strong>
                </div>
                <div>
                  <small>Absent Days</small>
                  <strong>{staff.absentDays}</strong>
                </div>
                <div>
                  <small>Payroll Records</small>
                  <strong>{staff.payrollRecords}</strong>
                </div>
              </div>
            </>
          ) : (
            <div className="staff-performance">
              <div className="staff-perf-summary">
                <div>
                  <span className="staff-perf-value">{attendanceRate}%</span>
                  <small>Attendance Rate</small>
                </div>
                <div>
                  <span className="staff-perf-value">{onTimeRate}%</span>
                  <small>On-Time Rate</small>
                </div>
                <div>
                  <span className="staff-perf-value">{lateRate}%</span>
                  <small>Late Rate</small>
                </div>
                <div>
                  <span className="staff-perf-value">{absentRate}%</span>
                  <small>Absent Rate</small>
                </div>
                <div>
                  <span className="staff-perf-value">
                    {formatCurrency(staff.totalPayroll)}
                  </span>
                  <small>Total Payroll Paid</small>
                </div>
                <div>
                  <span className="staff-perf-value">
                    {formatCurrency(
                      staff.payrollRecords > 0
                        ? Math.round(staff.totalPayroll / staff.payrollRecords)
                        : 0
                    )}
                  </span>
                  <small>Average Net Pay</small>
                </div>
              </div>

              <div className="staff-perf-breakdown">
                <h4>Attendance Breakdown</h4>
                <div className="staff-perf-bar-row">
                  <span>Present</span>
                  <div className="staff-perf-bar">
                    <div
                      className="staff-perf-bar-fill success"
                      style={{ width: `${attendanceRate}%` }}
                    />
                  </div>
                  <strong>{staff.presentDays} days</strong>
                </div>
                <div className="staff-perf-bar-row">
                  <span>Late</span>
                  <div className="staff-perf-bar">
                    <div
                      className="staff-perf-bar-fill warning"
                      style={{ width: `${lateRate}%` }}
                    />
                  </div>
                  <strong>{staff.lateDays} days</strong>
                </div>
                <div className="staff-perf-bar-row">
                  <span>Absent</span>
                  <div className="staff-perf-bar">
                    <div
                      className="staff-perf-bar-fill danger"
                      style={{ width: `${absentRate}%` }}
                    />
                  </div>
                  <strong>{staff.absentDays} days</strong>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="staff-modal-footer">
          <button type="button" className="staff-btn secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const RecordsModal = ({ type, staff, records, loading, error, onClose }) => {
  const isAttendance = type === "attendance";

  return (
    <div className="staff-modal-overlay">
      <div className="staff-modal large">
        <div className="staff-modal-header">
          <div>
            <span className="staff-eyebrow">
              {isAttendance ? "Attendance Records" : "Payroll Records"}
            </span>
            <h2>{staff.name}</h2>
          </div>

          <button type="button" onClick={onClose}>
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className="staff-modal-body">
          {loading ? (
            <div className="staff-modal-state">
              <FontAwesomeIcon icon={faSpinner} spin />
              <h3>Loading records</h3>
              <p>Please wait while records are being loaded.</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="staff-modal-alert">
                  <FontAwesomeIcon icon={faTriangleExclamation} />
                  <span>{error}</span>
                </div>
              )}

              {records.length === 0 ? (
                <div className="staff-modal-state">
                  <FontAwesomeIcon icon={faTable} />
                  <h3>No records found</h3>
                  <p>No {isAttendance ? "attendance" : "payroll"} records are available.</p>
                </div>
              ) : (
                <div className="staff-modal-table-wrap">
                  <table className="staff-modal-table">
                    <thead>
                      <tr>
                        {isAttendance ? (
                          <>
                            <th>Date</th>
                            <th>Status</th>
                            <th>Time In</th>
                            <th>Time Out</th>
                            <th>Review</th>
                            <th>Remarks</th>
                          </>
                        ) : (
                          <>
                            <th>Period</th>
                            <th>Date</th>
                            <th>Gross Pay</th>
                            <th>Deductions</th>
                            <th>Net Pay</th>
                            <th>Status</th>
                          </>
                        )}
                      </tr>
                    </thead>

                    <tbody>
                      {records.map((record) =>
                        isAttendance ? (
                          <tr key={record.id}>
                            <td>{formatDate(record.date)}</td>
                            <td>
                              <StatusBadge status={record.status} />
                            </td>
                            <td>{record.timeIn || "N/A"}</td>
                            <td>{record.timeOut || "N/A"}</td>
                            <td>
                              <StatusBadge status={record.reviewStatus} />
                            </td>
                            <td>{record.remarks || "No remarks"}</td>
                          </tr>
                        ) : (
                          <tr key={record.id}>
                            <td>{record.period}</td>
                            <td>{formatDate(record.date)}</td>
                            <td>{formatCurrency(record.grossPay)}</td>
                            <td>{formatCurrency(record.deductions)}</td>
                            <td>
                              <strong>{formatCurrency(record.netPay)}</strong>
                            </td>
                            <td>
                              <StatusBadge status={record.status} />
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        <div className="staff-modal-footer">
          <button type="button" className="staff-btn secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const DetailItem = ({ icon, label, value }) => (
  <div className="staff-detail-item">
    <FontAwesomeIcon icon={icon} />
    <div>
      <small>{label}</small>
      <strong>{value || "N/A"}</strong>
    </div>
  </div>
);

export default ManagerStaff;
