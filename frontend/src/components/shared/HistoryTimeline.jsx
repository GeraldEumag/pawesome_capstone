import React, { useMemo, useState } from "react";
import { exportToCSV, exportToPDF, exportToExcel } from "../../utils/reportExport";
import "./HistoryTimeline.css";

const fmt = (v) =>
  v == null || v === "" ? "N/A" : String(v).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const fmtDate = (v) => {
  if (!v) return "N/A";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleDateString("en-PH", { month: "short", day: "2-digit", year: "numeric" });
};

const fmtTime = (v) => {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
};

const fmtCurrency = (v) =>
  Number(v || 0).toLocaleString("en-PH", { style: "currency", currency: "PHP" });

const statusClass = (s) => {
  const val = String(s || "").toLowerCase();
  if (val.includes("complet")) return "ht-status-completed";
  if (val.includes("approv") || val.includes("paid") || val.includes("success")) return "ht-status-approved";
  if (val.includes("pending") || val.includes("scheduled")) return "ht-status-pending";
  if (val.includes("cancel") || val.includes("reject") || val.includes("fail")) return "ht-status-cancelled";
  if (val.includes("no_show")) return "ht-status-noshow";
  return "ht-status-default";
};

const ENTRIES_PER_PAGE = 25;

const HistoryTimeline = ({
  entries = [],
  loading = false,
  error = "",
  onRefresh,
  onExport,
  exportColumns,
  exportFilename = "history",
  exportTitle = "Activity History",
  roleAccent = "#6366f1",
  roleLabel = "History",
  emptyMessage = "No history records found.",
  searchTerm,
  onSearchChange,
  dateFilter,
  onDateFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  categoryOptions = [],
  meta = null,
  onPageChange,
  renderEntryMeta,
}) => {
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [localPage, setLocalPage] = useState(1);
  const [showExportDropdown, setShowExportDropdown] = useState(false);

  // Unified export handler — uses shared utilities if exportColumns provided,
  // otherwise falls back to the legacy onExport callback (CSV only)
  const handleExport = (format) => {
    setShowExportDropdown(false);
    if (!entries || entries.length === 0) return;

    if (exportColumns && exportColumns.length > 0) {
      if (format === "csv") exportToCSV(entries, exportColumns, exportFilename);
      else if (format === "excel") exportToExcel(entries, exportColumns, exportFilename);
      else if (format === "pdf") exportToPDF(entries, exportColumns, exportTitle, exportFilename);
    } else if (onExport) {
      // Legacy: call the old CSV-only callback
      onExport();
    }
  };

  const totalPages = meta
    ? meta.last_page || 1
    : Math.max(1, Math.ceil(entries.length / ENTRIES_PER_PAGE));

  const currentPage = meta ? meta.current_page || 1 : localPage;

  const visibleEntries = meta
    ? entries
    : entries.slice((localPage - 1) * ENTRIES_PER_PAGE, localPage * ENTRIES_PER_PAGE);

  const handlePageChange = (p) => {
    if (onPageChange) {
      onPageChange(p);
    } else {
      setLocalPage(p);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    return {
      total: meta ? meta.total : entries.length,
      today: entries.filter((e) => new Date(e.created_at || e.date || "").toDateString() === today).length,
    };
  }, [entries, meta]);

  const openDetail = (e) => setSelectedEntry(e);
  const closeDetail = () => setSelectedEntry(null);

  return (
    <div className="ht-root" style={{ "--ht-accent": roleAccent }}>
      {/* Header */}
      <div className="ht-header">
        <div className="ht-header-text">
          <span className="ht-kicker">{roleLabel}</span>
          <h2 className="ht-title">Activity History</h2>
          <p className="ht-subtitle">Review and track all recorded activity.</p>
        </div>
        <div className="ht-header-actions">
          {onRefresh && (
            <button className="ht-btn ht-btn-secondary" onClick={onRefresh} type="button">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>
              Refresh
            </button>
          )}
          {(onExport || exportColumns) && (
            <div className="ht-export-wrapper">
              <button
                className="ht-btn ht-btn-primary"
                onClick={() => setShowExportDropdown(!showExportDropdown)}
                type="button"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export
                <span className="ht-export-arrow">▼</span>
              </button>
              {showExportDropdown && (
                <>
                  <div className="ht-export-overlay" onClick={() => setShowExportDropdown(false)} />
                  <div className="ht-export-dropdown">
                    <button type="button" onClick={() => handleExport("csv")}>Export as CSV</button>
                    <button type="button" onClick={() => handleExport("excel")}>Export as Excel</button>
                    <button type="button" onClick={() => handleExport("pdf")}>Export as PDF</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="ht-stats">
        <div className="ht-stat-card">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          <div>
            <strong>{stats.total}</strong>
            <span>Total Records</span>
          </div>
        </div>
        <div className="ht-stat-card">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <div>
            <strong>{stats.today}</strong>
            <span>Today</span>
          </div>
        </div>
        <div className="ht-stat-card">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <div>
            <strong>{totalPages}</strong>
            <span>Pages</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="ht-filters">
        {onSearchChange !== undefined && (
          <div className="ht-search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              type="text"
              placeholder="Search records..."
              value={searchTerm || ""}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        )}

        {onDateFilterChange !== undefined && (
          <select
            className="ht-select"
            value={dateFilter || "all"}
            onChange={(e) => onDateFilterChange(e.target.value)}
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
        )}

        {onCategoryFilterChange !== undefined && categoryOptions.length > 0 && (
          <select
            className="ht-select"
            value={categoryFilter || "all"}
            onChange={(e) => onCategoryFilterChange(e.target.value)}
          >
            <option value="all">All Types</option>
            {categoryOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )}
      </div>

      {/* Content */}
      <div className="ht-content">
        {loading ? (
          <div className="ht-loading">
            <div className="ht-spinner" />
            <p>Loading history...</p>
          </div>
        ) : error ? (
          <div className="ht-empty ht-error">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <h3>Unable to Load History</h3>
            <p>{error}</p>
            {onRefresh && (
              <button className="ht-btn ht-btn-primary" onClick={onRefresh} type="button">
                Retry
              </button>
            )}
          </div>
        ) : visibleEntries.length === 0 ? (
          <div className="ht-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            <h3>No Records Found</h3>
            <p>{emptyMessage}</p>
          </div>
        ) : (
          <div className="ht-timeline">
            {visibleEntries.map((entry, idx) => {
              const ts = entry.created_at || entry.date || entry.scheduled_at || null;
              const status = entry.status || entry.appointment_status || entry.payment_status || "completed";
              const ref = entry.reference_id || entry.id || `#${idx + 1}`;
              const actor = entry.actor || entry.user_name || entry.cashier_name || entry.customer || "System";
              const actorRole = entry.actor_role || entry.user_role || "";
              const action = entry.action || entry.type || "Activity";
              const description = entry.description || entry.notes || entry.diagnosis || "";
              const amount = entry.amount != null ? Number(entry.amount) : null;
              const category = entry.category || entry.subcategory || "";

              return (
                <div key={`${ref}-${idx}`} className="ht-entry" onClick={() => openDetail(entry)}>
                  <div className="ht-entry-accent" />
                  <div className="ht-entry-body">
                    <div className="ht-entry-top">
                      <div className="ht-entry-left">
                        <div className="ht-entry-ref">{String(ref)}</div>
                        <div className="ht-entry-action">{fmt(action)}</div>
                        {description && (
                          <div className="ht-entry-desc">{description}</div>
                        )}
                      </div>
                      <div className="ht-entry-right">
                        {amount != null && amount > 0 && (
                          <div className="ht-entry-amount">{fmtCurrency(amount)}</div>
                        )}
                        <span className={`ht-status-badge ${statusClass(status)}`}>
                          {fmt(status)}
                        </span>
                      </div>
                    </div>

                    <div className="ht-entry-meta">
                      {actor && (
                        <span className="ht-meta-chip">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                          {actor}
                          {actorRole && <em>{fmt(actorRole)}</em>}
                        </span>
                      )}
                      {category && (
                        <span className="ht-meta-chip ht-meta-cat">
                          {fmt(category)}
                        </span>
                      )}
                      {ts && (
                        <span className="ht-meta-chip ht-meta-date">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          {fmtDate(ts)} {fmtTime(ts)}
                        </span>
                      )}
                      {renderEntryMeta && renderEntryMeta(entry)}
                    </div>
                  </div>
                  <button className="ht-entry-view" type="button" title="View details">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && !loading && visibleEntries.length > 0 && (
          <div className="ht-pagination">
            <button
              className="ht-page-btn"
              disabled={currentPage <= 1}
              onClick={() => handlePageChange(currentPage - 1)}
              type="button"
            >
              ‹ Prev
            </button>

            <div className="ht-page-numbers">
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let p;
                if (totalPages <= 7) {
                  p = i + 1;
                } else if (currentPage <= 4) {
                  p = i < 6 ? i + 1 : totalPages;
                } else if (currentPage >= totalPages - 3) {
                  p = i === 0 ? 1 : totalPages - 6 + i;
                } else {
                  const offsets = [-1, 0, 1, 2, 3];
                  if (i === 0) p = 1;
                  else if (i === 6) p = totalPages;
                  else p = currentPage + offsets[i - 1];
                }
                return (
                  <button
                    key={`page-${p}`}
                    className={`ht-page-num ${p === currentPage ? "ht-page-active" : ""}`}
                    onClick={() => handlePageChange(p)}
                    type="button"
                  >
                    {p}
                  </button>
                );
              })}
            </div>

            <button
              className="ht-page-btn"
              disabled={currentPage >= totalPages}
              onClick={() => handlePageChange(currentPage + 1)}
              type="button"
            >
              Next ›
            </button>

            <span className="ht-page-info">
              Page {currentPage} of {totalPages} &nbsp;·&nbsp; {meta ? meta.total : entries.length} records
            </span>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedEntry && (
        <div className="ht-modal-overlay" onClick={closeDetail}>
          <div className="ht-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ht-modal-header">
              <h3>{fmt(selectedEntry.action || selectedEntry.type || "Activity Detail")}</h3>
              <button className="ht-modal-close" onClick={closeDetail} type="button">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="ht-modal-body">
              <div className="ht-detail-grid">
                {[
                  ["Reference", selectedEntry.reference_id || selectedEntry.id],
                  ["Category", selectedEntry.category],
                  ["Subcategory", selectedEntry.subcategory],
                  ["Status", selectedEntry.status],
                  ["Actor", selectedEntry.actor || selectedEntry.user_name || selectedEntry.cashier_name],
                  ["Role", selectedEntry.actor_role || selectedEntry.user_role],
                  ["Action", selectedEntry.action],
                  ["Description", selectedEntry.description || selectedEntry.notes || selectedEntry.diagnosis],
                  ["Amount", selectedEntry.amount != null ? fmtCurrency(selectedEntry.amount) : null],
                  ["Date", fmtDate(selectedEntry.created_at || selectedEntry.date || selectedEntry.scheduled_at)],
                  ["Time", fmtTime(selectedEntry.created_at || selectedEntry.date || selectedEntry.scheduled_at)],
                  ["Customer", selectedEntry.customer || selectedEntry.customer_name],
                  ["Pet", selectedEntry.pet_name || selectedEntry.pet?.name],
                  ["Service", selectedEntry.service_name || selectedEntry.service?.name || selectedEntry.type],
                  ["Payment Method", selectedEntry.method || selectedEntry.payment_method],
                  ["Receipt / Ref #", selectedEntry.receipt_number || selectedEntry.payment_reference],
                ]
                  .filter(([, v]) => v != null && v !== "" && v !== "N/A" && v !== "n/a")
                  .map(([label, value]) => (
                    <div key={label} className="ht-detail-row">
                      <label>{label}</label>
                      <span>{String(value)}</span>
                    </div>
                  ))}

                {selectedEntry.metadata && typeof selectedEntry.metadata === "object" && (
                  <>
                    <div className="ht-detail-divider">Additional Details</div>
                    {Object.entries(selectedEntry.metadata)
                      .filter(([, v]) => v != null && v !== "")
                      .map(([k, v]) => (
                        <div key={k} className="ht-detail-row">
                          <label>{fmt(k)}</label>
                          <span>{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                        </div>
                      ))}
                  </>
                )}
              </div>
            </div>
            <div className="ht-modal-footer">
              <button className="ht-btn ht-btn-secondary" onClick={closeDetail} type="button">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoryTimeline;
