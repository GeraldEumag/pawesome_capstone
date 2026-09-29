import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faGift,
  faRotate,
  faCoins,
  faCircleCheck,
  faHourglassHalf,
  faSpinner,
  faCheckCircle,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import "./ThirteenthMonthPanel.css";

const fmt = (v) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(v || 0);

const MONTHS_SHORT = ["J","F","M","A","M","J","J","A","S","O","N","D"];

const ThirteenthMonthPanel = () => {
  const [year, setYear]         = useState(new Date().getFullYear());
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [accruing, setAccruing] = useState(false);
  const [msg, setMsg]           = useState("");
  const [msgType, setMsgType]   = useState("info");

  const load = () => {
    setLoading(true);
    apiRequest(`/manager/payroll/thirteenth-month?year=${year}`)
      .then((res) => setData(res))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [year]);

  const accrue = async () => {
    setAccruing(true); setMsg("");
    try {
      await apiRequest("/manager/payroll/thirteenth-month/accrue", {
        method: "POST",
        body: JSON.stringify({ year }),
      });
      setMsg("Accrual updated successfully.");
      setMsgType("info");
      load();
    } catch (e) {
      setMsg("Error: " + (e.message || "Accrual failed."));
      setMsgType("error");
    } finally { setAccruing(false); }
  };

  const pay = async (id) => {
    if (!window.confirm("Mark this 13th month as paid?")) return;
    await apiRequest(`/manager/payroll/thirteenth-month/${id}/pay`, { method: "POST" }).catch(() => {});
    load();
  };

  const rows = data?.data || [];

  // Computed totals
  const totalAccrued   = data?.totals?.total_accrued   || 0;
  const totalPaid      = data?.totals?.total_paid       || 0;
  const totalRemaining = totalAccrued - totalPaid;

  // Month filled bars for a row — controller returns r.months.jan etc.
  const monthBars = (row) => {
    const keys = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
    const months = row.months || {};
    return keys.map((k) => parseFloat(months[k] || 0) > 0);
  };

  // Controller formats response with person_name key
  const empName = (r) =>
    r.person_name || r.user?.name || (r.employee ? `${r.employee.first_name} ${r.employee.last_name}` : "—");

  return (
    <div className="tmp-page">
      {/* Hero */}
      <div className="tmp-hero">
        <div className="tmp-hero-left">
          <div className="tmp-eyebrow">
            <FontAwesomeIcon icon={faGift} />
            13th Month Pay
          </div>
          <h1>13th Month Accruals</h1>
          <p>Track monthly salary accruals and release 13th month pay in December. Required by Philippine Presidential Decree No. 851.</p>
        </div>
        <div className="tmp-hero-actions">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="tmp-year-select"
          >
            {[2024, 2025, 2026, 2027].map((y) => <option key={y}>{y}</option>)}
          </select>
          <button className="tmp-btn primary" onClick={accrue} disabled={accruing}>
            <FontAwesomeIcon icon={accruing ? faSpinner : faRotate} spin={accruing} />
            {accruing ? "Accruing…" : "Trigger Accrual"}
          </button>
        </div>
      </div>

      {/* Message */}
      {msg && (
        <div className={`tmp-alert ${msgType}`}>
          <FontAwesomeIcon icon={msgType === "error" ? faTriangleExclamation : faCheckCircle} />
          {msg}
        </div>
      )}

      {/* Stat Cards */}
      <div className="tmp-stats">
        <div className="tmp-stat-card accrued">
          <div className="tmp-stat-icon"><FontAwesomeIcon icon={faCoins} /></div>
          <div>
            <strong>{fmt(totalAccrued)}</strong>
            <p>Total Accrued ({year})</p>
          </div>
        </div>
        <div className="tmp-stat-card paid-out">
          <div className="tmp-stat-icon"><FontAwesomeIcon icon={faCircleCheck} /></div>
          <div>
            <strong>{fmt(totalPaid)}</strong>
            <p>Total Paid Out</p>
          </div>
        </div>
        <div className="tmp-stat-card remaining">
          <div className="tmp-stat-icon"><FontAwesomeIcon icon={faHourglassHalf} /></div>
          <div>
            <strong>{fmt(totalRemaining)}</strong>
            <p>Remaining Balance</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="tmp-table-card">
        {loading ? (
          <div className="tmp-loading">
            <FontAwesomeIcon icon={faSpinner} spin />
            <span>Loading accruals…</span>
          </div>
        ) : (
          <table className="tmp-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Months Accrued</th>
                <th className="num">Total Accrued</th>
                <th className="num">Paid Out</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="tmp-empty">
                      <FontAwesomeIcon icon={faGift} style={{ fontSize: "2rem", opacity: 0.3 }} />
                      <span>No accruals for {year}. Trigger an accrual to begin.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const bars = monthBars(r);
                  return (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 750 }}>{empName(r)}</td>
                      <td>
                        <div className="tmp-month-grid" title={`${bars.filter(Boolean).length} months accrued`}>
                          {bars.map((filled, i) => (
                            <div
                              key={i}
                              className={`tmp-month-bar${filled ? " filled" : ""}`}
                              style={{ height: `${filled ? 16 : 8}px` }}
                              title={MONTHS_SHORT[i]}
                            />
                          ))}
                        </div>
                      </td>
                      <td className="num">{fmt(r.total_accrued)}</td>
                      <td className="num">{fmt(r.paid_amount)}</td>
                      <td>
                        <span className={`tmp-status-badge ${r.status}`}>
                          {r.status}
                        </span>
                      </td>
                      <td>
                        {r.status !== "paid" && (
                          <button className="tmp-btn sm success" onClick={() => pay(r.id)}>
                            <FontAwesomeIcon icon={faCircleCheck} />
                            Pay Now
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default ThirteenthMonthPanel;
