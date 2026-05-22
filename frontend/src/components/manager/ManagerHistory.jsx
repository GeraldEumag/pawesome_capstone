import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import DatePickerInput from "../../components/shared/DatePickerInput";
import {
  faCalendarAlt,
  faCheckCircle,
  faChevronDown,
  faChevronUp,
  faClipboardList,
  faClock,
  faDownload,
  faEye,
  faExclamationTriangle,
  faFileInvoiceDollar,
  faFilter,
  faMoneyBillWave,
  faSearch,
  faSpinner,
  faSync,
  faTimesCircle,
  faUserCheck,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import { formatCurrency } from "../../utils/currency";
import { useTheme } from "../../utils/theme";
import "./ManagerHistory.css";

const ACTION_OPTIONS = [
  { value: "all", label: "All Actions" },
  { value: "attendance_review", label: "Attendance Review" },
  { value: "attendance_remarks", label: "Attendance Remarks" },
  { value: "attendance_record", label: "Attendance Record" },
  { value: "payroll_generated", label: "Payroll Generated" },
  { value: "payroll_approved", label: "Payroll Approved" },
  { value: "payroll_released", label: "Payroll Released" },
  { value: "payroll_record", label: "Payroll Record" },
  { value: "report_exported", label: "Report Exported" },
];

const CATEGORY_OPTIONS = [
  { value: "all", label: "All Categories" },
  { value: "attendance", label: "Attendance" },
  { value: "payroll", label: "Payroll" },
  { value: "reports", label: "Reports" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
  { value: "action", label: "Action Type" },
  { value: "employee", label: "Employee Name" },
  { value: "status", label: "Status" },
];

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
  if (Array.isArray(payload?.history)) return payload.history;
  if (Array.isArray(payload?.activities)) return payload.activities;
  if (Array.isArray(payload?.logs)) return payload.logs;

  return [];
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeText = (value, fallback = "N/A") => {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
};

const normalizeStatus = (value) =>
  String(value || "completed")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");

const formatLabel = (value) =>
  String(value || "N/A")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

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

const getActionType = (record) => {
  const rawAction = normalizeStatus(
    record.action_type ||
      record.action ||
      record.type ||
      record.event ||
      record.activity_type
  );

  if (rawAction.includes("remark")) return "attendance_remarks";
  if (rawAction.includes("attendance") && rawAction.includes("review")) {
    return "attendance_review";
  }
  if (rawAction.includes("attendance")) return "attendance_record";
  if (rawAction.includes("payroll") && rawAction.includes("generate")) {
    return "payroll_generated";
  }
  if (rawAction.includes("payroll") && rawAction.includes("approve")) {
    return "payroll_approved";
  }
  if (
    rawAction.includes("payroll") &&
    (rawAction.includes("release") || rawAction.includes("paid"))
  ) {
    return "payroll_released";
  }
  if (rawAction.includes("payroll")) return "payroll_record";
  if (rawAction.includes("export") || rawAction.includes("report")) {
    return "report_exported";
  }

  return rawAction && rawAction !== "completed" ? rawAction : "attendance_record";
};

const getCategory = (actionType) => {
  if (actionType.includes("attendance")) return "attendance";
  if (actionType.includes("payroll")) return "payroll";
  if (actionType.includes("report")) return "reports";
  return "attendance";
};

const getEmployeeName = (record) =>
  record.employee_name ||
  record.affected_employee ||
  record.staff_name ||
  record.user?.name ||
  record.employee?.name ||
  record.name ||
  record.customer_name ||
  "N/A";

const getPayrollPeriod = (record) =>
  record.payroll_period ||
  record.period ||
  record.period_label ||
  record.month ||
  record.cutoff ||
  record.date_range ||
  "N/A";

const normalizeHistoryRecord = (record, index, source = "history") => {
  const actionType = getActionType(record);
  const category = getCategory(actionType);
  const status = normalizeStatus(
    record.status ||
      record.result ||
      record.review_status ||
      record.payroll_status ||
      record.payment_status ||
      "completed"
  );

  const date =
    record.created_at ||
    record.updated_at ||
    record.performed_at ||
    record.date ||
    record.timestamp ||
    record.report_date ||
    record.attendance_date ||
    record.payroll_date;

  const amount =
    record.amount ||
    record.net_pay ||
    record.total_net_pay ||
    record.total_amount ||
    record.gross_pay ||
    record.total_payroll ||
    0;

  return {
    id: record.id || record.history_id || record.log_id || `${source}-${index}`,
    source,
    actionType,
    category,
    action:
      record.action_label ||
      record.title ||
      record.action ||
      record.event ||
      formatLabel(actionType),
    description:
      record.description ||
      record.message ||
      record.remarks ||
      record.notes ||
      buildDescription(actionType, record),
    employeeName: getEmployeeName(record),
    employeeId:
      record.employee_id ||
      record.staff_id ||
      record.user_id ||
      record.employee?.id ||
      "N/A",
    payrollPeriod: getPayrollPeriod(record),
    performedBy:
      record.performed_by ||
      record.created_by ||
      record.generated_by ||
      record.manager_name ||
      record.approved_by ||
      record.released_by ||
      "Manager",
    status,
    date,
    amount: toNumber(amount),
    reference:
      record.reference_no ||
      record.reference_number ||
      record.receipt_number ||
      record.report_id ||
      record.payroll_id ||
      record.attendance_id ||
      "N/A",
    raw: record,
  };
};

const buildDescription = (actionType, record) => {
  if (actionType === "attendance_review") {
    return `${getEmployeeName(record)} attendance was reviewed.`;
  }

  if (actionType === "attendance_remarks") {
    return `${getEmployeeName(record)} attendance remarks were updated.`;
  }

  if (actionType === "attendance_record") {
    return `${getEmployeeName(record)} attendance record was logged or updated.`;
  }

  if (actionType === "payroll_generated") {
    return `Payroll was generated for ${getPayrollPeriod(record)}.`;
  }

  if (actionType === "payroll_approved") {
    return `Payroll was approved for ${getPayrollPeriod(record)}.`;
  }

  if (actionType === "payroll_released") {
    return `Payroll was released for ${getPayrollPeriod(record)}.`;
  }

  if (actionType === "payroll_record") {
    return `Payroll record was updated for ${getPayrollPeriod(record)}.`;
  }

  if (actionType === "report_exported") {
    return "A manager report was exported.";
  }

  return "Manager activity record.";
};

const buildAttendanceFallback = (records) => {
  return records.map((record, index) =>
    normalizeHistoryRecord(
      {
        ...record,
        action_type:
          record.review_status === "reviewed" || record.is_reviewed
            ? "attendance_review"
            : "attendance_record",
        description:
          record.description ||
          record.remarks ||
          `Attendance record for ${getEmployeeName(record)}.`,
        performed_by: record.reviewed_by || record.manager_name || "Manager",
        created_at: record.updated_at || record.created_at || record.date,
      },
      index,
      "attendance"
    )
  );
};

const buildPayrollFallback = (records) => {
  return records.map((record, index) => {
    const status = normalizeStatus(record.status || record.payroll_status);
    let actionType = "payroll_record";

    if (status === "generated" || status === "draft") {
      actionType = "payroll_generated";
    }

    if (status === "approved") {
      actionType = "payroll_approved";
    }

    if (status === "released" || status === "paid") {
      actionType = "payroll_released";
    }

    return normalizeHistoryRecord(
      {
        ...record,
        action_type: actionType,
        description:
          record.description ||
          `Payroll record for ${getEmployeeName(record)} during ${getPayrollPeriod(record)}.`,
        performed_by:
          record.approved_by ||
          record.released_by ||
          record.generated_by ||
          "Manager",
        created_at: record.updated_at || record.created_at || record.payroll_date,
      },
      index,
      "payroll"
    );
  });
};

const escapeCSV = (value) => {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
};

const ManagerHistory = () => {
  const { theme } = useTheme();

  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [showFilters, setShowFilters] = useState(false);

  const [selectedRecord, setSelectedRecord] = useState(null);

  const showToast = useCallback((message, type = "info") => {
    setToast({ message, type });
    window.clearTimeout(window.managerHistoryToastTimer);
    window.managerHistoryToastTimer = window.setTimeout(
      () => setToast(null),
      3500
    );
  }, []);

  const loadHistory = useCallback(
    async ({ silent = false } = {}) => {
      try {
        if (silent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        const [historyResponse, attendanceResponse, payrollResponse] =
          await Promise.all([
            apiRequest("/manager/history").catch(() => null),
            apiRequest("/manager/attendance").catch(() => null),
            apiRequest("/manager/payroll").catch(() => null),
          ]);

        const historyRecords = normalizeList(historyResponse, [
          "history",
          "activities",
          "logs",
          "records",
        ]);

        const attendanceRecords = normalizeList(attendanceResponse, [
          "attendance",
          "records",
          "items",
        ]);

        const payrollRecords = normalizeList(payrollResponse, [
          "payroll",
          "records",
          "items",
        ]);

        let normalized = [];

        if (historyRecords.length > 0) {
          normalized = historyRecords.map((record, index) =>
            normalizeHistoryRecord(record, index, "history")
          );
        } else {
          normalized = [
            ...buildAttendanceFallback(attendanceRecords),
            ...buildPayrollFallback(payrollRecords),
          ];

          if (normalized.length > 0) {
            showToast(
              "Using attendance and payroll records as history fallback. Dedicated manager history endpoint still needs verification.",
              "warning"
            );
          }
        }

        setHistory(normalized);

        if (
          !historyResponse &&
          !attendanceResponse &&
          !payrollResponse &&
          normalized.length === 0
        ) {
          setError(
            "No manager history data is available yet. Please verify /manager/history, /manager/attendance, and /manager/payroll."
          );
        }
      } catch (err) {
        console.error("Manager history load error:", err);
        setError(err.message || "Failed to load manager history.");
        setHistory([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const statusOptions = useMemo(() => {
    const statuses = [...new Set(history.map((record) => record.status))]
      .filter(Boolean)
      .sort();

    return [
      { value: "all", label: "All Status" },
      ...statuses.map((status) => ({
        value: status,
        label: formatLabel(status),
      })),
    ];
  }, [history]);

  const filteredHistory = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return history
      .filter((record) => {
        const recordDate = record.date ? new Date(record.date) : null;
        const fromDate = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
        const toDate = dateTo ? new Date(`${dateTo}T23:59:59`) : null;

        const matchesSearch =
          !search ||
          [
            record.id,
            record.action,
            record.description,
            record.employeeName,
            record.employeeId,
            record.payrollPeriod,
            record.performedBy,
            record.status,
            record.reference,
          ]
            .join(" ")
            .toLowerCase()
            .includes(search);

        const matchesCategory =
          categoryFilter === "all" || record.category === categoryFilter;

        const matchesAction =
          actionFilter === "all" || record.actionType === actionFilter;

        const matchesStatus =
          statusFilter === "all" || record.status === statusFilter;

        const matchesDateFrom =
          !fromDate ||
          !recordDate ||
          Number.isNaN(recordDate.getTime()) ||
          recordDate >= fromDate;

        const matchesDateTo =
          !toDate ||
          !recordDate ||
          Number.isNaN(recordDate.getTime()) ||
          recordDate <= toDate;

        return (
          matchesSearch &&
          matchesCategory &&
          matchesAction &&
          matchesStatus &&
          matchesDateFrom &&
          matchesDateTo
        );
      })
      .sort((a, b) => {
        if (sortBy === "oldest") {
          return new Date(a.date || 0) - new Date(b.date || 0);
        }

        if (sortBy === "action") {
          return a.action.localeCompare(b.action);
        }

        if (sortBy === "employee") {
          return a.employeeName.localeCompare(b.employeeName);
        }

        if (sortBy === "status") {
          return a.status.localeCompare(b.status);
        }

        return new Date(b.date || 0) - new Date(a.date || 0);
      });
  }, [
    actionFilter,
    categoryFilter,
    dateFrom,
    dateTo,
    history,
    searchTerm,
    sortBy,
    statusFilter,
  ]);

  const summary = useMemo(() => {
    const attendanceActions = history.filter(
      (record) => record.category === "attendance"
    ).length;

    const payrollActions = history.filter(
      (record) => record.category === "payroll"
    ).length;

    const reportActions = history.filter(
      (record) => record.category === "reports"
    ).length;

    const pendingActions = history.filter((record) =>
      ["pending", "draft", "for_approval", "pending_review"].includes(
        record.status
      )
    ).length;

    const completedActions = history.filter((record) =>
      ["completed", "reviewed", "approved", "released", "paid"].includes(
        record.status
      )
    ).length;

    return {
      total: history.length,
      attendanceActions,
      payrollActions,
      reportActions,
      pendingActions,
      completedActions,
    };
  }, [history]);

  const handleClearFilters = () => {
    setSearchTerm("");
    setCategoryFilter("all");
    setActionFilter("all");
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
    setSortBy("newest");
  };

  const handleExportCSV = () => {
    const headers = [
      "Action",
      "Category",
      "Description",
      "Employee",
      "Employee ID",
      "Payroll Period",
      "Performed By",
      "Status",
      "Reference",
      "Amount",
      "Date",
    ];

    const rows = filteredHistory.map((record) => [
      record.action,
      formatLabel(record.category),
      record.description,
      record.employeeName,
      record.employeeId,
      record.payrollPeriod,
      record.performedBy,
      formatLabel(record.status),
      record.reference,
      record.amount ? formatCurrency(record.amount) : "",
      formatDateTime(record.date),
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
    link.download = `manager-history-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();

    URL.revokeObjectURL(url);
    showToast("Manager history exported successfully.", "success");
  };

  const getActionIcon = (actionType) => {
    if (actionType.includes("attendance")) return faUserCheck;
    if (actionType.includes("payroll")) return faFileInvoiceDollar;
    if (actionType.includes("report")) return faClipboardList;
    return faClock;
  };

  const getCategoryLabel = (category) => {
    const found = CATEGORY_OPTIONS.find((item) => item.value === category);
    return found ? found.label : formatLabel(category);
  };

  if (loading) {
    return (
      <div className={`manager-history ${theme}`}>
        <div className="history-loading-state">
          <FontAwesomeIcon icon={faSpinner} spin />
          <h2>Loading manager history</h2>
          <p>Please wait while the manager audit trail is being loaded.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`manager-history ${theme}`}>
      <section className="history-hero">
        <div>
          <span className="history-eyebrow">Manager Audit Trail</span>
          <h1>Manager History</h1>
          <p>
            Track attendance review activity, payroll actions, report exports,
            and manager-level monitoring history.
          </p>
        </div>

        <div className="history-hero-actions">
          <button
            type="button"
            className="history-btn secondary"
            onClick={() => loadHistory({ silent: true })}
            disabled={refreshing}
          >
            <FontAwesomeIcon icon={refreshing ? faSpinner : faSync} spin={refreshing} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>

          <button
            type="button"
            className="history-btn primary"
            onClick={handleExportCSV}
          >
            <FontAwesomeIcon icon={faDownload} />
            Export CSV
          </button>
        </div>
      </section>

      {error && (
        <div className="history-alert error">
          <FontAwesomeIcon icon={faExclamationTriangle} />
          <span>{error}</span>
          <button type="button" onClick={() => loadHistory()}>
            Retry
          </button>
        </div>
      )}

      <section className="history-summary-grid">
        <SummaryCard
          label="Total Activities"
          value={summary.total}
          icon={faClipboardList}
          tone="primary"
        />
        <SummaryCard
          label="Attendance Actions"
          value={summary.attendanceActions}
          icon={faUserCheck}
          tone="success"
        />
        <SummaryCard
          label="Payroll Actions"
          value={summary.payrollActions}
          icon={faMoneyBillWave}
          tone="money"
        />
        <SummaryCard
          label="Report Exports"
          value={summary.reportActions}
          icon={faDownload}
          tone="info"
        />
        <SummaryCard
          label="Pending"
          value={summary.pendingActions}
          icon={faClock}
          tone="warning"
        />
        <SummaryCard
          label="Completed"
          value={summary.completedActions}
          icon={faCheckCircle}
          tone="success"
        />
      </section>

      <section className="history-controls-card">
        <div className="history-search-row">
          <div className="history-search-box">
            <FontAwesomeIcon icon={faSearch} />
            <input
              type="text"
              placeholder="Search action, employee, payroll period, status, reference, or description..."
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
            className={`history-filter-toggle ${showFilters ? "active" : ""}`}
            onClick={() => setShowFilters((prev) => !prev)}
          >
            <FontAwesomeIcon icon={faFilter} />
            Filters
            <FontAwesomeIcon icon={showFilters ? faChevronUp : faChevronDown} />
          </button>
        </div>

        {showFilters && (
          <div className="history-filter-grid">
            <FilterSelect
              label="Category"
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={CATEGORY_OPTIONS}
            />

            <FilterSelect
              label="Action Type"
              value={actionFilter}
              onChange={setActionFilter}
              options={ACTION_OPTIONS}
            />

            <FilterSelect
              label="Status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={statusOptions}
            />

            <FilterSelect
              label="Sort"
              value={sortBy}
              onChange={setSortBy}
              options={SORT_OPTIONS}
            />

            <div className="history-filter-field">
              <label htmlFor="history-date-from">Date From</label>
              <DatePickerInput
                id="history-date-from"
                selected={dateFrom ? new Date(dateFrom) : null}
                onChange={(date) => setDateFrom(date ? date.toISOString().split("T")[0] : "")}
                placeholderText="From..."
              />
            </div>

            <div className="history-filter-field">
              <label htmlFor="history-date-to">Date To</label>
              <DatePickerInput
                id="history-date-to"
                selected={dateTo ? new Date(dateTo) : null}
                onChange={(date) => setDateTo(date ? date.toISOString().split("T")[0] : "")}
                placeholderText="To..."
              />
            </div>

            <button
              type="button"
              className="history-clear-btn"
              onClick={handleClearFilters}
            >
              Clear Filters
            </button>
          </div>
        )}
      </section>

      <section className="history-content-card">
        <div className="history-content-header">
          <div>
            <span className="history-eyebrow">Activity Records</span>
            <h2>Manager Activity Timeline</h2>
          </div>

          <p>
            Showing <strong>{filteredHistory.length}</strong> of{" "}
            <strong>{history.length}</strong> records
          </p>
        </div>

        {filteredHistory.length === 0 ? (
          <div className="history-empty-state">
            <FontAwesomeIcon icon={faClipboardList} />
            <h3>No history records found</h3>
            <p>
              Try adjusting your search, category, action type, status, or date
              filters.
            </p>
          </div>
        ) : (
          <div className="history-timeline">
            {filteredHistory.map((record) => (
              <article className="history-record-card" key={record.id}>
                <div className={`history-record-icon ${record.category}`}>
                  <FontAwesomeIcon icon={getActionIcon(record.actionType)} />
                </div>

                <div className="history-record-main">
                  <div className="history-record-top">
                    <div>
                      <span className="history-category-pill">
                        {getCategoryLabel(record.category)}
                      </span>
                      <h3>{formatLabel(record.action)}</h3>
                    </div>

                    <span className={`history-status ${record.status}`}>
                      {formatLabel(record.status)}
                    </span>
                  </div>

                  <p>{record.description}</p>

                  <div className="history-record-meta">
                    <span>
                      <FontAwesomeIcon icon={faUserCheck} />
                      {record.employeeName}
                    </span>
                    <span>
                      <FontAwesomeIcon icon={faFileInvoiceDollar} />
                      {record.payrollPeriod}
                    </span>
                    <span>
                      <FontAwesomeIcon icon={faCalendarAlt} />
                      {formatDateTime(record.date)}
                    </span>
                    <span>
                      <FontAwesomeIcon icon={faClock} />
                      By {record.performedBy}
                    </span>
                  </div>
                </div>

                <div className="history-record-actions">
                  <button
                    type="button"
                    onClick={() => setSelectedRecord(record)}
                  >
                    <FontAwesomeIcon icon={faEye} />
                    View Details
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {selectedRecord && (
        <HistoryDetailsModal
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
        />
      )}

      {toast && (
        <div className={`history-toast ${toast.type}`}>
          <FontAwesomeIcon
            icon={
              toast.type === "error"
                ? faTimesCircle
                : toast.type === "warning"
                  ? faExclamationTriangle
                  : faCheckCircle
            }
          />
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
};

const SummaryCard = ({ label, value, icon, tone }) => (
  <article className={`history-summary-card ${tone}`}>
    <span>
      <FontAwesomeIcon icon={icon} />
    </span>
    <div>
      <strong>{value}</strong>
      <p>{label}</p>
    </div>
  </article>
);

const FilterSelect = ({ label, value, options, onChange }) => (
  <div className="history-filter-field">
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

const DetailItem = ({ label, value, wide = false }) => (
  <div className={wide ? "wide" : ""}>
    <small>{label}</small>
    <strong>{value || "N/A"}</strong>
  </div>
);

const HistoryDetailsModal = ({ record, onClose }) => (
  <div className="history-modal-overlay">
    <div className="history-modal">
      <div className="history-modal-header">
        <div>
          <span className="history-eyebrow">Activity Details</span>
          <h2>{formatLabel(record.action)}</h2>
        </div>

        <button type="button" onClick={onClose} aria-label="Close details">
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      <div className="history-modal-body">
        <div className="history-detail-grid">
          <DetailItem label="Category" value={formatLabel(record.category)} />
          <DetailItem label="Action Type" value={formatLabel(record.actionType)} />
          <DetailItem label="Status" value={formatLabel(record.status)} />
          <DetailItem label="Date and Time" value={formatDateTime(record.date)} />
          <DetailItem label="Employee" value={record.employeeName} />
          <DetailItem label="Employee ID" value={record.employeeId} />
          <DetailItem label="Payroll Period" value={record.payrollPeriod} />
          <DetailItem label="Performed By" value={record.performedBy} />
          <DetailItem label="Reference" value={record.reference} />
          <DetailItem
            label="Amount"
            value={record.amount ? formatCurrency(record.amount) : "N/A"}
          />
          <DetailItem label="Description" value={record.description} wide />
        </div>

        <div className="history-raw-section">
          <h3>Source Data</h3>
          <pre>{JSON.stringify(record.raw, null, 2)}</pre>
        </div>
      </div>

      <div className="history-modal-footer">
        <button type="button" className="history-btn secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  </div>
);

export default ManagerHistory;