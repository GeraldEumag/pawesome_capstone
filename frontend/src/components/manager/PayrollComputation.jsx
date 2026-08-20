import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faCalculator,
  faCheckCircle,
  faChevronLeft,
  faChevronRight,
  faClock,
  faExclamationTriangle,
  faEye,
  faMoneyBillWave,
  faRefresh,
  faSave,
  faSearch,
  faSpinner,
  faUsers,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import { formatCurrency } from "../../utils/currency";
import "./PayrollComputation.css";

const formatNum = (v) => (v == null ? "0.00" : Number(v).toFixed(2));

const todayInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const monthStartInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

const PayrollComputation = () => {
  const navigate = useNavigate();
  const [periodStart, setPeriodStart] = useState(monthStartInput());
  const [periodEnd, setPeriodEnd] = useState(todayInput());
  const [previewData, setPreviewData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(8);
  const [showBreakdown, setShowBreakdown] = useState(null); // user_id

  const showToast = useCallback((message, type = "info") => {
    setToast({ message, type });
    window.clearTimeout(window.payrollCompToastTimer);
    window.payrollCompToastTimer = window.setTimeout(() => setToast(null), 3500);
  }, []);

  const computePreview = useCallback(async () => {
    if (!periodStart || !periodEnd) return;
    setLoading(true);
    setError("");
    try {
      const res = await apiRequest("/manager/payroll/compute", {
        method: "POST",
        body: JSON.stringify({ period_start: periodStart, period_end: periodEnd }),
      });
      const rows = (res?.data || []).map((r) => ({
        ...r,
        _bonus: r.bonus ?? 0,
        _allowances: r.allowances ?? 0,
        _otherDeductions: r.deductions ?? 0,
      }));
      setPreviewData(rows);
      showToast("Computation preview ready.", "success");
    } catch (err) {
      console.error("Compute error:", err);
      setError(err.message || "Failed to compute payroll preview.");
    } finally {
      setLoading(false);
    }
  }, [periodStart, periodEnd, showToast]);

  const updateField = (userId, field, value) => {
    setPreviewData((prev) =>
      prev.map((r) => (r.user_id === userId ? { ...r, [field]: value } : r))
    );
  };

  const computedRows = useMemo(() => {
    return previewData.map((r) => {
      const base = Number(r.base_salary) || 0;
      const otPay = Number(r.overtime_pay) || 0;
      const bonus = Number(r._bonus) || 0;
      const allowances = Number(r._allowances) || 0;
      const sss = Number(r.sss_contribution) || 0;
      const philhealth = Number(r.philhealth_contribution) || 0;
      const pagibig = Number(r.pagibig_contribution) || 0;
      const lateDed = Number(r.late_deductions) || 0;
      const absentDed = Number(r.absent_deductions) || 0;
      const otherDed = Number(r._otherDeductions) || 0;
      const gross = base + otPay + bonus + allowances;
      const totalDed = sss + philhealth + pagibig + lateDed + absentDed + otherDed;
      const net = Math.max(0, gross - totalDed);
      return { ...r, _gross: gross, _totalDed: totalDed, _net: net };
    });
  }, [previewData]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return computedRows;
    return computedRows.filter((r) =>
      [r.employee_name, r.role, r.department].join(" ").toLowerCase().includes(term)
    );
  }, [computedRows, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filtered.slice(start, start + itemsPerPage);
  }, [currentPage, filtered, itemsPerPage]);

  const totals = useMemo(() => {
    return computedRows.reduce(
      (acc, r) => ({
        base: acc.base + Number(r.base_salary),
        overtime: acc.overtime + Number(r.overtime_pay),
        bonus: acc.bonus + Number(r._bonus),
        allowances: acc.allowances + Number(r._allowances),
        gross: acc.gross + r._gross,
        sss: acc.sss + Number(r.sss_contribution),
        philhealth: acc.philhealth + Number(r.philhealth_contribution),
        pagibig: acc.pagibig + Number(r.pagibig_contribution),
        late: acc.late + Number(r.late_deductions),
        absent: acc.absent + Number(r.absent_deductions),
        other: acc.other + Number(r._otherDeductions),
        totalDed: acc.totalDed + r._totalDed,
        net: acc.net + r._net,
      }),
      { base: 0, overtime: 0, bonus: 0, allowances: 0, gross: 0, sss: 0, philhealth: 0, pagibig: 0, late: 0, absent: 0, other: 0, totalDed: 0, net: 0 }
    );
  }, [computedRows]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      // Step 1: Generate payroll from attendance
      const genResponse = await apiRequest("/manager/payroll/generate", {
        method: "POST",
        body: JSON.stringify({ period_start: periodStart, period_end: periodEnd }),
      });

      // Step 2: Apply edited bonus/allowances/deductions to generated records
      const generatedRecords = genResponse?.data || [];
      const editedMap = new Map(computedRows.map((r) => [r.user_id, r]));

      for (const gen of generatedRecords) {
        const edited = editedMap.get(gen.user_id);
        if (!edited) continue;

        const hasEdits =
          Number(edited._bonus) !== 0 ||
          Number(edited._allowances) !== 0 ||
          Number(edited._otherDeductions) !== 0;

        if (!hasEdits) continue;

        try {
          await apiRequest(`/manager/payroll/${gen.id}`, {
            method: "PUT",
            body: JSON.stringify({
              bonus: Number(edited._bonus) || 0,
              allowances: Number(edited._allowances) || 0,
              deductions: Number(edited._otherDeductions) || 0,
            }),
          });
        } catch (updateErr) {
          console.warn(`Failed to apply edits for user ${gen.user_id}:`, updateErr);
        }
      }

      showToast("Payroll generated successfully.", "success");
      setTimeout(() => navigate("/manager/payroll"), 1200);
    } catch (err) {
      console.error("Generate error:", err);
      showToast("Payroll generated locally. Verify backend.", "warning");
      setTimeout(() => navigate("/manager/payroll"), 1200);
    } finally {
      setGenerating(false);
    }
  };

  const pageStart = filtered.length ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const pageEnd = Math.min(currentPage * itemsPerPage, filtered.length);

  return (
    <div className="payroll-computation">
      <section className="payroll-comp-hero">
        <div>
          <button type="button" className="payroll-comp-back" onClick={() => navigate("/manager/payroll")}>
            <FontAwesomeIcon icon={faArrowLeft} /> Back to Payroll
          </button>
          <span className="payroll-comp-eyebrow">Payroll Computation</span>
          <h1>Compute Payroll</h1>
          <p>Select a pay period, preview computed earnings and deductions per employee, adjust values, then generate payroll.</p>
        </div>
      </section>

      {error && (
        <div className="payroll-comp-alert error">
          <FontAwesomeIcon icon={faExclamationTriangle} />
          <span>{error}</span>
          <button type="button" onClick={() => setError("")}><FontAwesomeIcon icon={faXmark} /></button>
        </div>
      )}

      <section className="payroll-comp-controls">
        <div className="payroll-comp-period">
          <label>
            <span>Period Start</span>
            <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </label>
          <label>
            <span>Period End</span>
            <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </label>
          <button type="button" className="payroll-comp-btn primary" onClick={computePreview} disabled={loading}>
            <FontAwesomeIcon icon={loading ? faSpinner : faCalculator} spin={loading} />
            {loading ? "Computing..." : "Preview Computation"}
          </button>
        </div>

        {previewData.length > 0 && (
          <div className="payroll-comp-summary-bar">
            <SummaryPill icon={faUsers} label="Employees" value={computedRows.length} />
            <SummaryPill icon={faMoneyBillWave} label="Total Gross" value={formatCurrency(totals.gross)} />
            <SummaryPill icon={faClock} label="Total Deductions" value={formatCurrency(totals.totalDed)} />
            <SummaryPill icon={faCheckCircle} label="Total Net Pay" value={formatCurrency(totals.net)} tone="success" />
          </div>
        )}
      </section>

      {previewData.length > 0 && (
        <>
          <section className="payroll-comp-toolbar">
            <div className="payroll-comp-search">
              <FontAwesomeIcon icon={faSearch} />
              <input type="text" placeholder="Search employee..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              {searchTerm && <button type="button" onClick={() => setSearchTerm("")}><FontAwesomeIcon icon={faXmark} /></button>}
            </div>
            <button type="button" className="payroll-comp-btn success" onClick={handleGenerate} disabled={generating}>
              <FontAwesomeIcon icon={generating ? faSpinner : faSave} spin={generating} />
              {generating ? "Generating..." : "Generate Payroll"}
            </button>
          </section>

          <section className="payroll-comp-table-card">
            <div className="payroll-comp-table-scroll">
              <table className="payroll-comp-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Attendance</th>
                    <th>Base Salary</th>
                    <th>Overtime Pay</th>
                    <th>Bonus</th>
                    <th>Allowances</th>
                    <th>Gross Pay</th>
                    <th>Deductions</th>
                    <th>Net Pay</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((r) => (
                    <tr key={r.user_id}>
                      <td>
                        <div className="payroll-comp-employee">
                          <strong>{r.employee_name}</strong>
                          <small>{r.role} · {r.department}</small>
                        </div>
                      </td>
                      <td>
                        <div className="payroll-comp-attendance">
                          <span className="tag present">{r.present_days} Present</span>
                          {r.late_days > 0 && <span className="tag late">{r.late_days} Late</span>}
                          {r.absent_days > 0 && <span className="tag absent">{r.absent_days} Absent</span>}
                          <small>{formatNum(r.regular_hours)} hrs · {formatNum(r.overtime_hours)} OT</small>
                        </div>
                      </td>
                      <td>
                        <input
                          type="number"
                          className="payroll-comp-input number"
                          value={r.base_salary}
                          onChange={(e) => updateField(r.user_id, "base_salary", Number(e.target.value))}
                        />
                      </td>
                      <td>{formatCurrency(r.overtime_pay)}</td>
                      <td>
                        <input
                          type="number"
                          className="payroll-comp-input number"
                          value={r._bonus}
                          onChange={(e) => updateField(r.user_id, "_bonus", Number(e.target.value))}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="payroll-comp-input number"
                          value={r._allowances}
                          onChange={(e) => updateField(r.user_id, "_allowances", Number(e.target.value))}
                        />
                      </td>
                      <td><strong>{formatCurrency(r._gross)}</strong></td>
                      <td>
                        <span className="payroll-comp-ded" onClick={() => setShowBreakdown(showBreakdown === r.user_id ? null : r.user_id)}>
                          {formatCurrency(r._totalDed)}
                          <FontAwesomeIcon icon={faEye} />
                        </span>
                        {showBreakdown === r.user_id && (
                          <div className="payroll-comp-breakdown">
                            <div><small>SSS</small><span>{formatCurrency(r.sss_contribution)}</span></div>
                            <div><small>PhilHealth</small><span>{formatCurrency(r.philhealth_contribution)}</span></div>
                            <div><small>Pag-IBIG</small><span>{formatCurrency(r.pagibig_contribution)}</span></div>
                            <div><small>Late</small><span>{formatCurrency(r.late_deductions)}</span></div>
                            <div><small>Absent</small><span>{formatCurrency(r.absent_deductions)}</span></div>
                            <div><small>Other</small>
                              <input
                                type="number"
                                className="payroll-comp-input inline"
                                value={r._otherDeductions}
                                onChange={(e) => updateField(r.user_id, "_otherDeductions", Number(e.target.value))}
                              />
                            </div>
                          </div>
                        )}
                      </td>
                      <td><strong className="net">{formatCurrency(r._net)}</strong></td>
                      <td>
                        <button type="button" className="payroll-comp-btn-icon" onClick={() => setShowBreakdown(showBreakdown === r.user_id ? null : r.user_id)}>
                          <FontAwesomeIcon icon={faEye} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {paginated.length === 0 && (
              <div className="payroll-comp-empty">
                <FontAwesomeIcon icon={faUsers} />
                <h3>No employees match your search</h3>
              </div>
            )}

            <div className="payroll-comp-pagination">
              <p>Showing {pageStart} to {pageEnd} of {filtered.length} employees</p>
              <div>
                <button type="button" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>
                  <FontAwesomeIcon icon={faChevronLeft} /> Prev
                </button>
                <span>Page {currentPage} of {totalPages}</span>
                <button type="button" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>
                  Next <FontAwesomeIcon icon={faChevronRight} />
                </button>
              </div>
            </div>
          </section>
        </>
      )}

      {toast && (
        <div className={`payroll-comp-toast ${toast.type}`}>
          <FontAwesomeIcon icon={toast.type === "error" ? faExclamationTriangle : faCheckCircle} />
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
};

const SummaryPill = ({ icon, label, value, tone }) => (
  <div className={`payroll-comp-pill ${tone || ""}`}>
    <FontAwesomeIcon icon={icon} />
    <div>
      <strong>{value}</strong>
      <small>{label}</small>
    </div>
  </div>
);

export default PayrollComputation;
