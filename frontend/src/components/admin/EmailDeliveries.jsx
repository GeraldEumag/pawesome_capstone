import React, { useState, useEffect, useCallback, useRef } from "react";
import { showError as showSwalError, showSuccess as showSwalSuccess, showConfirm } from "../../utils/alert.jsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleInfo,
  faClockRotateLeft,
  faEnvelope,
  faEye,
  faPaperPlane,
  faRotateRight,
  faShieldHalved,
  faSpinner,
  faTimes,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import DatePickerInput from "../shared/DatePickerInput";
import { formatDateOnly, parseDateOnly } from "../../utils/date";
import RowActionPopover from "../shared/RowActionPopover";
import StandardTable from "../shared/StandardTable";
import StatusBadge from "../shared/StatusBadge";
import Modal from "../shared/Modal";
import "./EmailDeliveries.css";

const AUTO_REFRESH_MS = 30000;

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "accepted", label: "Accepted" },
  { value: "delivered", label: "Delivered" },
  { value: "deferred", label: "Deferred" },
  { value: "bounced", label: "Bounced" },
  { value: "blocked", label: "Blocked" },
  { value: "complaint", label: "Complaint" },
  { value: "failed", label: "Failed" },
  { value: "suppressed", label: "Suppressed" },
  { value: "expired", label: "Expired" },
  { value: "unknown", label: "Unknown" },
];

const STATUS_VARIANT = {
  delivered: "success",
  accepted: "info",
  processing: "info",
  pending: "neutral",
  deferred: "warning",
  expired: "warning",
  unknown: "warning",
  suppressed: "neutral",
  bounced: "danger",
  blocked: "danger",
  complaint: "danger",
  failed: "danger",
};

const SUPPRESSION_REASON_LABEL = {
  hard_bounce: "Hard bounce",
  invalid_email: "Invalid address",
  blocked: "Provider blocked",
  spam: "Spam complaint",
  manual: "Manual",
};

const formatDateTime = (dateString) => {
  if (!dateString) return "—";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const EmailDeliveries = () => {
  const [rows, setRows] = useState([]);
  const [statusCounts, setStatusCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [recipient, setRecipient] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [perPage, setPerPage] = useState(25);

  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [suppressions, setSuppressions] = useState([]);
  const [showSuppressions, setShowSuppressions] = useState(false);

  const filtersRef = useRef({});
  filtersRef.current = {
    debouncedSearch,
    filterStatus,
    recipient,
    dateFrom,
    dateTo,
    perPage,
    currentPage,
  };

  const buildParams = (page) => {
    const f = filtersRef.current;
    const params = new URLSearchParams();
    params.append("page", page);
    params.append("per_page", f.perPage);
    if (f.debouncedSearch) params.append("search", f.debouncedSearch);
    if (f.filterStatus !== "all") params.append("status", f.filterStatus);
    if (f.recipient) params.append("recipient", f.recipient);
    if (f.dateFrom) params.append("date_from", f.dateFrom);
    if (f.dateTo) params.append("date_to", f.dateTo);
    return params;
  };

  const fetchDeliveries = useCallback(async (page = 1, { silent = false } = {}) => {
    try {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError("");

      const data = await apiRequest(`/admin/email-deliveries?${buildParams(page).toString()}`);

      const page_ = data.deliveries || {};
      setRows(page_.data || []);
      setCurrentPage(page_.current_page || 1);
      setTotalPages(page_.last_page || 1);
      setTotalRows(page_.total || 0);
      setStatusCounts(data.status_counts || {});
    } catch (err) {
      setError(err.message || "Failed to fetch email deliveries");
      if (!silent) showSwalError(err.message || "Failed to fetch email deliveries");
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchSuppressions = useCallback(async () => {
    try {
      const data = await apiRequest("/admin/email-suppressions?active=1&per_page=50");
      setSuppressions(data.suppressions?.data || []);
    } catch (err) {
      // Non-critical — the section stays hidden on failure
    }
  }, []);

  // Debounce search input
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setCurrentPage(1);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    fetchDeliveries(currentPage);
  }, [currentPage, debouncedSearch, filterStatus, recipient, dateFrom, dateTo, perPage, fetchDeliveries]);

  useEffect(() => {
    fetchSuppressions();
  }, [fetchSuppressions]);

  // Auto-refresh every 30s (skipped while the tab is hidden)
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchDeliveries(filtersRef.current.currentPage, { silent: true });
        fetchSuppressions();
      }
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [fetchDeliveries, fetchSuppressions]);

  const applyFilter = (setter) => (event) => {
    setter(event.target.value);
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setFilterStatus("all");
    setRecipient("");
    setDateFrom("");
    setDateTo("");
    setCurrentPage(1);
  };

  const openDetail = async (row) => {
    setDetailLoading(true);
    setSelected(row);
    try {
      const data = await apiRequest(`/admin/email-deliveries/${row.id}`);
      setSelected(data.delivery || row);
    } catch (err) {
      showSwalError(err.message || "Failed to load delivery details");
    } finally {
      setDetailLoading(false);
    }
  };

  const releaseSuppression = async (row) => {
    const ok = await showConfirm(
      "Release this address? Future emails may be sent to it again.",
      "Release suppression"
    );
    if (!ok) return;
    try {
      await apiRequest(`/admin/email-suppressions/${row.id}`, { method: "DELETE" });
      showSwalSuccess("Suppression released.");
      fetchSuppressions();
    } catch (err) {
      showSwalError(err.message || "Failed to release suppression");
    }
  };

  const delivered = statusCounts.delivered || 0;
  const accepted = statusCounts.accepted || 0;
  const attention =
    (statusCounts.bounced || 0) +
    (statusCounts.complaint || 0) +
    (statusCounts.blocked || 0) +
    (statusCounts.failed || 0) +
    (statusCounts.unknown || 0);

  return (
    <div className="email-deliveries">
      {error && (
        <div className="emd-toast error">
          <FontAwesomeIcon icon={faTriangleExclamation} />
          <span>{error}</span>
        </div>
      )}

      <section className="emd-header">
        <div className="emd-header-copy">
          <span className="emd-eyebrow">
            <FontAwesomeIcon icon={faEnvelope} />
            Email Observability
          </span>
          <h1>Email Deliveries</h1>
          <p>
            Track every outgoing message through the delivery outbox — queued,
            accepted, delivered, bounced, or suppressed. Updates automatically
            every 30 seconds.
          </p>
        </div>

        <div className="emd-header-actions">
          <button
            type="button"
            className="emd-secondary-btn"
            onClick={() => fetchDeliveries(currentPage)}
            disabled={refreshing}
          >
            <FontAwesomeIcon icon={faRotateRight} className={refreshing ? "emd-spin" : ""} />
            Refresh
          </button>
        </div>
      </section>

      <section className="emd-stats-grid">
        <article className="emd-stat-card">
          <span>
            <FontAwesomeIcon icon={faPaperPlane} />
          </span>
          <div>
            <strong>{Object.values(statusCounts).reduce((a, b) => a + b, 0)}</strong>
            <p>Total Deliveries</p>
          </div>
        </article>

        <article className="emd-stat-card success">
          <span>
            <FontAwesomeIcon icon={faEnvelope} />
          </span>
          <div>
            <strong>{delivered}</strong>
            <p>Delivered</p>
          </div>
        </article>

        <article className="emd-stat-card info">
          <span>
            <FontAwesomeIcon icon={faClockRotateLeft} />
          </span>
          <div>
            <strong>{accepted + (statusCounts.pending || 0) + (statusCounts.processing || 0)}</strong>
            <p>In Flight</p>
          </div>
        </article>

        <article className="emd-stat-card danger">
          <span>
            <FontAwesomeIcon icon={faTriangleExclamation} />
          </span>
          <div>
            <strong>{attention}</strong>
            <p>Needs Attention</p>
          </div>
        </article>
      </section>

      <section className="emd-filter-bar">
        <div className="emd-search-box">
          <input
            type="text"
            placeholder="Search event key, occurrence key, or UUID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="emd-search-clear"
              onClick={() => {
                setSearch("");
                setDebouncedSearch("");
                setCurrentPage(1);
              }}
            >
              <FontAwesomeIcon icon={faTimes} />
            </button>
          )}
        </div>

        <div className="emd-filter-box">
          <select value={filterStatus} onChange={applyFilter(setFilterStatus)}>
            <option value="all">All Statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="emd-search-box emd-recipient-box">
          <input
            type="text"
            placeholder="Recipient email..."
            value={recipient}
            onChange={(e) => {
              setRecipient(e.target.value.trim());
              setCurrentPage(1);
            }}
          />
        </div>

        <div className="emd-date-box">
          <DatePickerInput
            selected={parseDateOnly(dateFrom)}
            maxDate={parseDateOnly(dateTo)}
            onChange={(date) => {
              setDateFrom(formatDateOnly(date));
              setCurrentPage(1);
            }}
            ariaLabel="From date"
          />
          <span>→</span>
          <DatePickerInput
            selected={parseDateOnly(dateTo)}
            minDate={parseDateOnly(dateFrom)}
            onChange={(date) => {
              setDateTo(formatDateOnly(date));
              setCurrentPage(1);
            }}
            ariaLabel="To date"
          />
        </div>

        <button type="button" className="emd-clear-btn" onClick={clearFilters}>
          <FontAwesomeIcon icon={faTimes} />
          Clear
        </button>
      </section>

      <section className="emd-table-container">
        <div className="emd-table-header">
          <div>
            <h2>Delivery Log</h2>
            <p>
              Showing <strong>{rows.length}</strong> of{" "}
              <strong>{totalRows}</strong> deliveries
            </p>
          </div>
        </div>

        {loading ? (
          <div className="emd-state">
            <FontAwesomeIcon icon={faSpinner} className="emd-spin" />
            <h3>Loading email deliveries...</h3>
          </div>
        ) : rows.length === 0 ? (
          <div className="emd-state">
            <FontAwesomeIcon icon={faEnvelope} />
            <h3>No deliveries found</h3>
            <p>Try adjusting your filters or check back later.</p>
          </div>
        ) : (
          <>
            <StandardTable
              nested
              data={rows}
              pageSize={perPage}
              columns={[
                {
                  key: "event_key",
                  label: "Email",
                  render: (value, row) => (
                    <div className="emd-event">
                      <strong>{row.event_key}</strong>
                      <small className="emd-mono">{row.occurrence_key}</small>
                    </div>
                  ),
                },
                {
                  key: "status",
                  label: "Status",
                  render: (value, row) => (
                    <StatusBadge variant={STATUS_VARIANT[row.status] || "neutral"}>
                      {row.status}
                    </StatusBadge>
                  ),
                },
                {
                  key: "provider_status",
                  label: "Provider Event",
                  render: (value, row) => (
                    <span className="emd-provider">{row.provider_status || "—"}</span>
                  ),
                },
                {
                  key: "attempts",
                  label: "Attempts",
                  render: (value, row) => (
                    <span>
                      {row.attempts}/{row.max_attempts}
                    </span>
                  ),
                },
                {
                  key: "failure_code",
                  label: "Failure",
                  render: (value, row) =>
                    row.failure_code ? (
                      <span className="emd-failure">{row.failure_code}</span>
                    ) : (
                      "—"
                    ),
                },
                {
                  key: "created_at",
                  label: "Queued",
                  render: (value, row) => (
                    <span className="emd-time">{formatDateTime(row.created_at)}</span>
                  ),
                },
                {
                  key: "delivered_at",
                  label: "Delivered",
                  render: (value, row) => (
                    <span className="emd-time">{formatDateTime(row.delivered_at)}</span>
                  ),
                },
                {
                  key: "actions",
                  label: "Details",
                  render: (value, row) => (
                    <RowActionPopover rowLabel={row.event_key}>
                      <button
                        type="button"
                        className="emd-view-btn"
                        title="View details"
                        onClick={() => openDetail(row)}
                      >
                        <FontAwesomeIcon icon={faEye} />
                      </button>
                    </RowActionPopover>
                  ),
                },
              ]}
            />

            <div className="emd-pagination">
              <div className="emd-per-page">
                <label htmlFor="emd-per-page">Rows:</label>
                <select
                  id="emd-per-page"
                  value={perPage}
                  onChange={(e) => {
                    setPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              <div className="emd-page-controls">
                <button
                  type="button"
                  className="emd-page-btn"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span className="emd-page-info">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  className="emd-page-btn"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      <section className="emd-suppressions">
        <button
          type="button"
          className="emd-suppressions-toggle"
          onClick={() => setShowSuppressions((v) => !v)}
        >
          <FontAwesomeIcon icon={faShieldHalved} />
          Suppressed Addresses ({suppressions.length})
          <span>{showSuppressions ? "▾" : "▸"}</span>
        </button>

        {showSuppressions && (
          <div className="emd-suppressions-body">
            {suppressions.length === 0 ? (
              <p className="emd-muted">No suppressed addresses.</p>
            ) : (
              <table className="emd-sup-table">
                <thead>
                  <tr>
                    <th>Fingerprint</th>
                    <th>Reason</th>
                    <th>Since</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {suppressions.map((s) => (
                    <tr key={s.id}>
                      <td className="emd-mono">{s.fingerprint?.slice(0, 16)}…</td>
                      <td>{SUPPRESSION_REASON_LABEL[s.reason] || s.reason}</td>
                      <td>{formatDateTime(s.created_at)}</td>
                      <td>
                        <button
                          type="button"
                          className="emd-view-btn"
                          onClick={() => releaseSuppression(s)}
                        >
                          Release
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="emd-muted">
              Suppression rows store a hashed fingerprint only — the plaintext
              address is never retained.
            </p>
          </div>
        )}
      </section>

      {selected && (
        <Modal
          onClose={() => setSelected(null)}
          title={selected.event_key}
          subtitle="Email Delivery Details"
          icon={faCircleInfo}
          size="lg"
          footer={
            <button
              type="button"
              className="emd-secondary-btn"
              onClick={() => setSelected(null)}
            >
              Close
            </button>
          }
        >
          <div className="emd-modal-body">
            <div className="emd-detail-grid">
              <div>
                <small>Status</small>
                <strong>
                  <StatusBadge variant={STATUS_VARIANT[selected.status] || "neutral"}>
                    {selected.status}
                  </StatusBadge>
                </strong>
              </div>
              <div>
                <small>Provider Event</small>
                <strong>{selected.provider_status || "—"}</strong>
              </div>
              <div>
                <small>Recipient</small>
                <strong>{selected.recipient_email || "(hidden in list view)"}</strong>
              </div>
              <div>
                <small>Attempts</small>
                <strong>
                  {selected.attempts}/{selected.max_attempts}
                </strong>
              </div>
              <div>
                <small>Queued</small>
                <strong>{formatDateTime(selected.created_at)}</strong>
              </div>
              <div>
                <small>Accepted</small>
                <strong>{formatDateTime(selected.accepted_at)}</strong>
              </div>
              <div>
                <small>Delivered</small>
                <strong>{formatDateTime(selected.delivered_at)}</strong>
              </div>
              <div>
                <small>Finished</small>
                <strong>{formatDateTime(selected.finished_at)}</strong>
              </div>
              <div>
                <small>Failure</small>
                <strong>
                  {selected.failure_class
                    ? `${selected.failure_class}${selected.failure_code ? ` — ${selected.failure_code}` : ""}`
                    : "—"}
                </strong>
              </div>
              <div>
                <small>Provider Message ID</small>
                <strong className="emd-mono">
                  {selected.provider_message_id || "—"}
                </strong>
              </div>
              <div>
                <small>Occurrence Key</small>
                <strong className="emd-mono">{selected.occurrence_key}</strong>
              </div>
              <div>
                <small>UUID</small>
                <strong className="emd-mono">{selected.uuid}</strong>
              </div>
            </div>
            {detailLoading && (
              <p className="emd-muted">
                <FontAwesomeIcon icon={faSpinner} className="emd-spin" /> Loading details…
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};

export default EmailDeliveries;
