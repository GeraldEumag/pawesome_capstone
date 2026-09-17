import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faIdCard, faCheckSquare, faFilter, faPrint,
  faRotateRight, faSearch, faSquare, faTriangleExclamation,
  faXmark, faUsers,
} from "@fortawesome/free-solid-svg-icons";
import JsBarcode from "jsbarcode";
import { QRCodeSVG } from "qrcode.react";
import { apiRequest } from "../../api/client";
import "./EmployeeIdPrinter.css";

/* ── Role display formatting ── */
const ROLE_LABELS = {
  receptionist: "Receptionist",
  cashier: "Cashier",
  inventory: "Inventory Staff",
  veterinary: "Veterinary",
  manager: "Manager",
  admin: "Administrator",
  super_admin: "Super Admin",
  super_receptionist: "Super Receptionist",
};
const formatRole = (r) => ROLE_LABELS[r] || (r ? r.charAt(0).toUpperCase() + r.slice(1) : "Staff");

/* ── 1D Barcode SVG component ── */
const BarcodeSvg = ({ value, className }) => {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, String(value), {
        format: "CODE128",
        width: 1.8,
        height: 40,
        displayValue: false,
        margin: 4,
        background: "#ffffff",
        lineColor: "#111827",
      });
    } catch { /* noop */ }
  }, [value]);

  if (!value) return <span className="eip-no-code">No employee number</span>;
  return <svg ref={ref} className={className || "eip-barcode-svg"} />;
};

/* ── Single ID card preview ── */
const IdCard = React.memo(({ emp, selected, onToggle, onPrintOne }) => {
  const code = (emp.employee_no || "").trim();

  return (
    <div className={`eip-card ${selected ? "selected" : ""}`}>
      {/* Selection checkbox */}
      <button
        type="button"
        className="eip-card-check"
        onClick={() => onToggle(emp.id)}
        aria-label={selected ? "Deselect" : "Select"}
      >
        <FontAwesomeIcon icon={selected ? faCheckSquare : faSquare} />
      </button>

      {/* Print single */}
      <button
        type="button"
        className="eip-card-print-btn"
        onClick={() => onPrintOne(emp)}
        title="Print this ID card"
      >
        <FontAwesomeIcon icon={faPrint} />
      </button>

      {/* Card preview */}
      <div className="eip-card-preview">
        <div className="eip-card-clinic">🐾 Pawesome</div>
        <div className="eip-card-divider" />

        <div className="eip-card-info">
          <span className="eip-card-empno">{code || "—"}</span>
          <span className="eip-card-name">{emp.name || "Unknown"}</span>
          <span className="eip-role-tag">{formatRole(emp.role)}</span>
        </div>

        <div className="eip-card-divider" />

        <div className="eip-card-codes">
          <BarcodeSvg value={code} />
          <span className="eip-barcode-value">{code}</span>
          {code && (
            <QRCodeSVG value={code} size={52} level="M" bgColor="#fff" fgColor="#111827" />
          )}
        </div>
      </div>
    </div>
  );
});

/* ── Print sheet (hidden on screen) ── */
const IdCardPrintSheet = ({ items }) => (
  <div className="eip-print-sheet">
    {items.map((emp) => {
      const code = (emp.employee_no || "").trim();
      return (
        <div key={emp.id} className="eip-print-card">
          <div className="eip-print-clinic">🐾 Pawesome</div>
          <div className="eip-print-rule" />
          <div className="eip-print-empno">{code}</div>
          <div className="eip-print-name">{emp.name}</div>
          <div className="eip-print-role">{formatRole(emp.role)}</div>
          <div className="eip-print-rule" />
          <PrintBarcodeSvg value={code} />
          <div className="eip-print-code">{code}</div>
          {code && (
            <QRCodeSVG value={code} size={44} level="M" bgColor="#fff" fgColor="#000" />
          )}
        </div>
      );
    })}
  </div>
);

/* ── Barcode for print sheet ── */
const PrintBarcodeSvg = ({ value }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, String(value), {
        format: "CODE128",
        width: 1.6,
        height: 36,
        displayValue: false,
        margin: 2,
        background: "#ffffff",
        lineColor: "#000000",
      });
    } catch { /* noop */ }
  }, [value]);
  return <svg ref={ref} className="eip-print-barcode-svg" />;
};

/* ══════════════════════════════════════════════════════════ */
/*  Main page component                                       */
/* ══════════════════════════════════════════════════════════ */
const EmployeeIdPrinter = () => {
  const [staff, setStaff]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [search, setSearch]         = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selected, setSelected]     = useState(new Set());
  const [printItems, setPrintItems] = useState([]);
  const [toast, setToast]           = useState("");

  /* ── Load staff ── */
  const loadStaff = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiRequest("/manager/staff");
      const list = Array.isArray(res?.staff)
        ? res.staff
        : Array.isArray(res?.data)
        ? res.data
        : Array.isArray(res)
        ? res
        : [];
      // Only staff with an employee_no are useful for ID cards
      setStaff(list.filter((u) => u.is_active !== false));
    } catch (err) {
      setError(err?.message || "Failed to load staff. Make sure you are logged in as Manager or Admin.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStaff(); }, [loadStaff]);

  /* ── Open a clean popup window and print from there (most reliable cross-browser approach) ── */
  useEffect(() => {
    if (printItems.length === 0) return;

    // 400 ms — wait for jsbarcode useEffects inside the off-screen portal to finish
    const t = setTimeout(() => {
      const printSheet = document.querySelector(".eip-print-sheet");
      if (!printSheet || !printSheet.firstElementChild) return;

      // Deep-clone the already-rendered print sheet (barcodes + QR SVGs included)
      const clone = printSheet.cloneNode(true);
      clone.style.cssText = ""; // clear off-screen positioning

      const win = window.open("", "_blank", "toolbar=0,location=0,menubar=0");
      if (!win) {
        alert("Popup blocked — please allow pop-ups for this page to enable printing.");
        setPrintItems([]);
        return;
      }

      win.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Employee ID Cards — Pawesome</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 8mm; background: white; font-family: sans-serif; }
  .eip-print-sheet { display: grid; grid-template-columns: repeat(2, 85mm); gap: 5mm; }
  .eip-print-card { width: 85mm; min-height: 54mm; border: 0.5pt solid #ccc; border-radius: 3mm; padding: 3mm 4mm; display: flex; flex-direction: column; align-items: center; gap: 2mm; page-break-inside: avoid; background: white; }
  .eip-print-clinic { font-size: 11px; font-weight: 900; color: #7c3aed; text-transform: uppercase; letter-spacing: 0.05em; }
  .eip-print-rule { width: 100%; height: 1px; background: #ccc; margin: 1mm 0; }
  .eip-print-empno { font-size: 10px; font-family: monospace; color: #555; font-weight: 700; }
  .eip-print-name { font-size: 13px; font-weight: 700; color: #000; text-align: center; line-height: 1.2; }
  .eip-print-role { font-size: 10px; color: #7c3aed; font-weight: 700; }
  .eip-print-barcode-svg { width: 68mm; height: auto; max-height: 14mm; }
  .eip-print-code { font-size: 9px; font-family: monospace; color: #333; }
  @page { size: A4 portrait; margin: 8mm; }
</style>
</head>
<body></body>
</html>`);
      win.document.close();
      win.document.body.appendChild(clone);
      win.focus();

      // Small delay so the popup finishes rendering before the print dialog opens
      setTimeout(() => {
        win.print();
        setTimeout(() => { win.close(); setPrintItems([]); }, 800);
      }, 250);
    }, 400);

    return () => clearTimeout(t);
  }, [printItems]);

  /* ── Unique roles for filter dropdown ── */
  const roles = useMemo(
    () => [...new Set(staff.map((u) => u.role).filter(Boolean))].sort(),
    [staff]
  );

  /* ── Filtered staff ── */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter((u) => {
      const matchRole = roleFilter === "all" || u.role === roleFilter;
      const matchSearch =
        !q ||
        u.name?.toLowerCase().includes(q) ||
        u.employee_no?.toLowerCase().includes(q) ||
        u.role?.toLowerCase().includes(q);
      return matchRole && matchSearch;
    });
  }, [staff, search, roleFilter]);

  /* ── Selection ── */
  const toggleOne = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const allSelected = filtered.length > 0 && filtered.every((u) => selected.has(u.id));
  const selectAll   = () => setSelected(new Set(filtered.map((u) => u.id)));
  const deselectAll = () => setSelected(new Set());

  /* ── Print ── */
  const handlePrintSelected = () => {
    const toPrint = filtered.filter((u) => selected.has(u.id));
    if (toPrint.length === 0) {
      setToast("Select at least one employee to print.");
      setTimeout(() => setToast(""), 3000);
      return;
    }
    setPrintItems(toPrint);
  };

  const handlePrintOne = (emp) => setPrintItems([emp]);

  /* ── Render ── */
  return (
    <div className="eip-page">

      {/* Always-present print sheet rendered into body so CSS isolation doesn't hide it */}
      {ReactDOM.createPortal(<IdCardPrintSheet items={printItems} />, document.body)}

      {/* ── Hero ── */}
      <div className="eip-hero">
        <div className="eip-hero-left">
          <span className="eip-eyebrow">Manager</span>
          <h1>
            <FontAwesomeIcon icon={faIdCard} />
            Employee ID Cards
          </h1>
          <p>Generate and print employee ID cards with scannable barcodes for the attendance kiosk.</p>
        </div>
        <div className="eip-hero-actions">
          <button
            type="button"
            className="eip-btn eip-btn--outline"
            onClick={loadStaff}
            disabled={loading}
          >
            <FontAwesomeIcon icon={faRotateRight} spin={loading} />
            Refresh
          </button>
          <button
            type="button"
            className="eip-btn eip-btn--primary"
            onClick={handlePrintSelected}
            disabled={selected.size === 0 || loading}
          >
            <FontAwesomeIcon icon={faPrint} />
            Print Selected ({selected.size})
          </button>
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="eip-controls">
        <div className="eip-search-wrap">
          <FontAwesomeIcon icon={faSearch} className="eip-search-icon" />
          <input
            type="text"
            className="eip-search-input"
            placeholder="Search by name, employee #, role…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" className="eip-search-clear" onClick={() => setSearch("")}>
              <FontAwesomeIcon icon={faXmark} />
            </button>
          )}
        </div>

        <select
          className="eip-role-select"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="all">All Roles</option>
          {roles.map((r) => (
            <option key={r} value={r}>{formatRole(r)}</option>
          ))}
        </select>

        <div className="eip-selection-row">
          <button
            type="button"
            className="eip-btn eip-btn--ghost"
            onClick={allSelected ? deselectAll : selectAll}
          >
            <FontAwesomeIcon icon={allSelected ? faCheckSquare : faSquare} />
            {allSelected ? "Deselect All" : "Select All"}
          </button>
          <span className="eip-count">
            {filtered.length} employee{filtered.length !== 1 ? "s" : ""}
            {selected.size > 0 && ` · ${selected.size} selected`}
          </span>
        </div>
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div className="eip-toast" role="alert">
          <FontAwesomeIcon icon={faTriangleExclamation} /> {toast}
        </div>
      )}

      {/* ── States ── */}
      {loading && (
        <div className="eip-state-msg">
          <span className="eip-spinner-lg" />
          Loading staff…
        </div>
      )}

      {!loading && error && (
        <div className="eip-state-msg error">
          <FontAwesomeIcon icon={faTriangleExclamation} /> {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="eip-state-msg">
          <FontAwesomeIcon icon={faUsers} /> No employees found.
        </div>
      )}

      {/* ── Card grid ── */}
      {!loading && !error && filtered.length > 0 && (
        <div className="eip-grid">
          {filtered.map((emp) => (
            <IdCard
              key={emp.id}
              emp={emp}
              selected={selected.has(emp.id)}
              onToggle={toggleOne}
              onPrintOne={handlePrintOne}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default EmployeeIdPrinter;
