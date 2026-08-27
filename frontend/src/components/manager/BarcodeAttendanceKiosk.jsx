import React, { useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBarcode,
  faCheckCircle,
  faClock,
  faExclamationTriangle,
  faKeyboard,
  faRefresh,
  faSignIn,
  faSignOut,
  faSpinner,
  faUserCheck,
  faUsers,
  faXmarkCircle,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import "./BarcodeAttendanceKiosk.css";

// ─── Helpers ────────────────────────────────────────────────────────────────

const formatTime = (isoOrTime) => {
  if (!isoOrTime) return "—";
  const text = String(isoOrTime);
  if (/^\d{2}:\d{2}/.test(text)) {
    const [h, m] = text.split(":");
    const d = new Date();
    d.setHours(Number(h), Number(m), 0, 0);
    return d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
  }
  const d = new Date(isoOrTime);
  return Number.isNaN(d.getTime())
    ? text
    : d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
};

const STATUS_LABELS = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  on_leave: "On Leave",
  early_leave: "Early Leave",
};

// ─── Component ───────────────────────────────────────────────────────────────

const BarcodeAttendanceKiosk = () => {
  const [barcodeInput, setBarcodeInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // { type, message, data }
  const [todayLog, setTodayLog] = useState([]);
  const [logLoading, setLogLoading] = useState(false);
  const [clockStr, setClockStr] = useState("");
  const [dateStr, setDateStr] = useState("");

  const inputRef = useRef(null);
  const resultTimerRef = useRef(null);

  // ── Live clock ──────────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClockStr(now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      setDateStr(now.toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric" }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Focus management ────────────────────────────────────────────────────
  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    focusInput();
  }, [focusInput]);

  // Re-focus after result clears
  useEffect(() => {
    if (!result) focusInput();
  }, [result, focusInput]);

  // ── Load today's log ────────────────────────────────────────────────────
  const loadTodayLog = useCallback(async () => {
    try {
      setLogLoading(true);
      const res = await apiRequest("/manager/attendance/barcode-log");
      setTodayLog(Array.isArray(res?.data) ? res.data : []);
    } catch {
      // silently fail; log is non-critical
    } finally {
      setLogLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTodayLog();
    const id = setInterval(loadTodayLog, 30000);
    return () => clearInterval(id);
  }, [loadTodayLog]);

  // ── Handle scan / submit ────────────────────────────────────────────────
  const handleScan = useCallback(async (barcode) => {
    const trimmed = barcode.trim();
    if (!trimmed) return;

    setLoading(true);
    setError("");
    setResult(null);
    setBarcodeInput("");

    try {
      const res = await apiRequest("/manager/attendance/barcode-punch", {
        method: "POST",
        body: JSON.stringify({ barcode: trimmed }),
      });

      if (res?.success) {
        setResult({ type: "success", message: res.message, data: res.data });
        loadTodayLog();
        // Auto-dismiss result after 3.5 s then re-focus
        clearTimeout(resultTimerRef.current);
        resultTimerRef.current = setTimeout(() => {
          setResult(null);
        }, 3500);
      } else {
        setError(res?.message || "Scan failed. Please try again.");
        focusInput();
      }
    } catch (err) {
      const msg = err?.message || "Network error. Please check your connection.";
      setError(msg);
      focusInput();
    } finally {
      setLoading(false);
    }
  }, [loadTodayLog, focusInput]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleScan(barcodeInput);
    }
  };

  // Dismiss result on click anywhere outside the result card
  const handleDismissResult = () => {
    clearTimeout(resultTimerRef.current);
    setResult(null);
  };

  // Cleanup timer on unmount
  useEffect(() => () => clearTimeout(resultTimerRef.current), []);

  // ── Render ─────────────────────────────────────────────────────────────
  const checkedInToday = todayLog.filter((r) => r.check_in).length;
  const checkedOutToday = todayLog.filter((r) => r.check_out).length;

  return (
    <div className="barcode-kiosk" onClick={focusInput} role="presentation">

      {/* ── Hero / Clock ─────────────────────────────────────────── */}
      <section className="bk-hero">
        <div className="bk-hero-left">
          <span className="bk-eyebrow">Barcode Attendance Kiosk</span>
          <h1>
            <FontAwesomeIcon icon={faBarcode} />
            Attendance Scanner
          </h1>
          <p>Scan your employee barcode to record check-in or check-out.</p>
        </div>
        <div className="bk-clock">
          <span className="bk-time">{clockStr}</span>
          <span className="bk-date">{dateStr}</span>
        </div>
      </section>

      {/* ── Stats strip ──────────────────────────────────────────── */}
      <section className="bk-stats">
        <div className="bk-stat">
          <FontAwesomeIcon icon={faUsers} />
          <strong>{todayLog.length}</strong>
          <small>Total Today</small>
        </div>
        <div className="bk-stat in">
          <FontAwesomeIcon icon={faSignIn} />
          <strong>{checkedInToday}</strong>
          <small>Checked In</small>
        </div>
        <div className="bk-stat out">
          <FontAwesomeIcon icon={faSignOut} />
          <strong>{checkedOutToday}</strong>
          <small>Checked Out</small>
        </div>
        <button
          type="button"
          className="bk-refresh-btn"
          onClick={(e) => { e.stopPropagation(); loadTodayLog(); }}
          disabled={logLoading}
          title="Refresh log"
        >
          <FontAwesomeIcon icon={logLoading ? faSpinner : faRefresh} spin={logLoading} />
        </button>
      </section>

      {/* ── Scan Panel ───────────────────────────────────────────── */}
      <section className="bk-scan-panel">
        <div className="bk-scan-icon-wrap">
          {loading ? (
            <FontAwesomeIcon icon={faSpinner} spin className="bk-scan-icon loading" />
          ) : (
            <FontAwesomeIcon icon={faBarcode} className="bk-scan-icon" />
          )}
        </div>

        <p className="bk-scan-label">
          {loading ? "Processing scan…" : "Scan employee barcode or type employee ID"}
        </p>

        <div className="bk-input-wrap" onClick={(e) => e.stopPropagation()}>
          <FontAwesomeIcon icon={faKeyboard} className="bk-input-icon" />
          <input
            ref={inputRef}
            type="text"
            className="bk-input"
            value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Scan barcode or type EMP001 / 1 and press Enter…"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled={loading}
            aria-label="Employee barcode input"
          />
          {barcodeInput && (
            <button
              type="button"
              className="bk-input-clear"
              onClick={(e) => { e.stopPropagation(); setBarcodeInput(""); focusInput(); }}
              tabIndex={-1}
              aria-label="Clear input"
            >
              <FontAwesomeIcon icon={faXmarkCircle} />
            </button>
          )}
        </div>

        <button
          type="button"
          className="bk-submit-btn"
          onClick={(e) => { e.stopPropagation(); handleScan(barcodeInput); }}
          disabled={loading || !barcodeInput.trim()}
        >
          {loading ? (
            <><FontAwesomeIcon icon={faSpinner} spin /> Processing…</>
          ) : (
            <><FontAwesomeIcon icon={faUserCheck} /> Record Attendance</>
          )}
        </button>
      </section>

      {/* ── Error Alert ──────────────────────────────────────────── */}
      {error && (
        <div className="bk-alert error" role="alert" onClick={(e) => { e.stopPropagation(); setError(""); focusInput(); }}>
          <FontAwesomeIcon icon={faExclamationTriangle} />
          <span>{error}</span>
          <button type="button" className="bk-alert-close" aria-label="Dismiss error">
            <FontAwesomeIcon icon={faXmarkCircle} />
          </button>
        </div>
      )}

      {/* ── Success Result Card ───────────────────────────────────── */}
      {result && result.type === "success" && (
        <div
          className={`bk-result ${result.data?.punch_type === "check_in" ? "in" : "out"}`}
          role="status"
          onClick={(e) => { e.stopPropagation(); handleDismissResult(); }}
        >
          <div className="bk-result-icon">
            <FontAwesomeIcon
              icon={result.data?.punch_type === "check_in" ? faSignIn : faSignOut}
            />
          </div>
          <div className="bk-result-body">
            <span className="bk-result-action">
              {result.data?.punch_type === "check_in" ? "Checked In" : "Checked Out"}
              {result.data?.is_late && (
                <span className="bk-late-badge">Late</span>
              )}
            </span>
            <strong className="bk-result-name">{result.data?.employee_name}</strong>
            <span className="bk-result-role">{result.data?.role}</span>
            <div className="bk-result-times">
              {result.data?.check_in && (
                <span className="bk-time-tag in">
                  <FontAwesomeIcon icon={faSignIn} /> {formatTime(result.data.check_in)}
                </span>
              )}
              {result.data?.check_out && (
                <span className="bk-time-tag out">
                  <FontAwesomeIcon icon={faSignOut} /> {formatTime(result.data.check_out)}
                </span>
              )}
            </div>
            <small className="bk-result-dismiss">Tap anywhere or wait to dismiss</small>
          </div>
          <FontAwesomeIcon icon={faCheckCircle} className="bk-result-check" />
        </div>
      )}

      {/* ── Today's Activity Log ──────────────────────────────────── */}
      <section className="bk-log" onClick={(e) => e.stopPropagation()}>
        <div className="bk-log-header">
          <h2>
            <FontAwesomeIcon icon={faClock} />
            Today&apos;s Attendance Log
          </h2>
          <span className="bk-log-count">{todayLog.length} records</span>
        </div>

        {todayLog.length === 0 ? (
          <div className="bk-log-empty">
            <FontAwesomeIcon icon={faBarcode} />
            <p>No attendance records yet for today.</p>
            <small>Scan an employee barcode to get started.</small>
          </div>
        ) : (
          <div className="bk-log-table-wrap">
            <table className="bk-log-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Role</th>
                  <th>Check In</th>
                  <th>Check Out</th>
                  <th>Status</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {todayLog.map((rec, i) => (
                  <tr key={`${rec.employee_id}-${i}`}>
                    <td>
                      <strong>{rec.employee_name}</strong>
                      {rec.is_late && <span className="bk-late-badge small">Late</span>}
                    </td>
                    <td><span className="bk-role-tag">{rec.role}</span></td>
                    <td>
                      {rec.check_in ? (
                        <span className="bk-time-tag in sm">
                          <FontAwesomeIcon icon={faSignIn} /> {formatTime(rec.check_in)}
                        </span>
                      ) : "—"}
                    </td>
                    <td>
                      {rec.check_out ? (
                        <span className="bk-time-tag out sm">
                          <FontAwesomeIcon icon={faSignOut} /> {formatTime(rec.check_out)}
                        </span>
                      ) : "—"}
                    </td>
                    <td>
                      <span className={`bk-status-badge ${rec.status}`}>
                        {STATUS_LABELS[rec.status] || rec.status}
                      </span>
                    </td>
                    <td>
                      <span className="bk-source-tag">
                        {rec.source === "barcode" ? "Barcode" : rec.source === "biometric" ? "Biometric" : rec.source || "Web"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default BarcodeAttendanceKiosk;
