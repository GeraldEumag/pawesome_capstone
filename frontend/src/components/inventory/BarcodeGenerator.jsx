import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBarcode, faCheckSquare, faFilter,
  faPrint, faRotateRight,
  faSearch, faSave, faSquare, faTag,
  faTriangleExclamation, faXmark,
} from "@fortawesome/free-solid-svg-icons";
import JsBarcode from "jsbarcode";
import { inventoryApi } from "../../api/inventory.jsx";
import { normalizeList } from "../../api/client";
import "./BarcodeGenerator.css";

/* ── Formats currency in Philippine Peso ── */
const formatPrice = (v) =>
  v != null ? `₱ ${Number(v).toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : "—";

/* ── Single barcode SVG rendered via jsbarcode ── */
const BarcodeSvg = ({ value }) => {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, String(value), {
        format: "CODE128",
        width: 1.8,
        height: 44,
        displayValue: false,
        margin: 4,
        background: "#ffffff",
        lineColor: "#111827",
      });
    } catch {
      /* invalid barcode value — silently skip */
    }
  }, [value]);

  if (!value) return <span className="bg-no-code">No code</span>;
  return <svg ref={ref} className="bg-barcode-svg" />;
};

/* ── One product label card ── */
const LabelCard = React.memo(({ item, selected, onToggle, onPrintOne, onSaveBarcode, saving }) => {
  const code = (item.barcode || item.sku || "").trim();
  const usingSkuFallback = !item.barcode && !!item.sku;

  return (
    <div className={`bg-card ${selected ? "selected" : ""}`}>
      {/* Selection checkbox */}
      <button
        type="button"
        className="bg-card-check"
        onClick={() => onToggle(item.id)}
        aria-label={selected ? "Deselect" : "Select"}
      >
        <FontAwesomeIcon icon={selected ? faCheckSquare : faSquare} />
      </button>

      {/* Print single */}
      <button
        type="button"
        className="bg-card-print-btn"
        onClick={() => onPrintOne(item)}
        title="Print this label"
      >
        <FontAwesomeIcon icon={faPrint} />
      </button>

      {/* Label preview */}
      <div className="bg-label-preview">
        <BarcodeSvg value={code} />

        <div className="bg-label-meta">
          <span className="bg-label-name">{item.name}</span>
          <span className="bg-label-category">{item.category || "—"}</span>
        </div>

        <div className="bg-label-sku-row">
          <span className="bg-label-sku">SKU: {item.sku || "—"}</span>
          <span className="bg-label-price">{formatPrice(item.price)}</span>
        </div>

        <div className="bg-label-code-row">
          <span className="bg-label-code">{code || "—"}</span>
        </div>

        {usingSkuFallback && (
          <div className="bg-sku-badge-row">
            <span className="bg-sku-badge">
              <FontAwesomeIcon icon={faTag} /> Using SKU
            </span>
            <button
              type="button"
              className="bg-save-barcode-btn"
              onClick={() => onSaveBarcode(item)}
              disabled={saving === item.id}
              title="Save SKU as permanent barcode"
            >
              {saving === item.id ? (
                <span className="bg-spinner" />
              ) : (
                <FontAwesomeIcon icon={faSave} />
              )}
              {saving === item.id ? "Saving…" : "Save as Barcode"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

/* ── Print sheet — only rendered into the DOM when printing ── */
const PrintSheet = ({ items }) => (
  <div className="bg-print-sheet">
    {items.map((item) => {
      const code = (item.barcode || item.sku || "").trim();
      return (
        <div key={item.id} className="bg-print-label">
          {code ? (
            <PrintBarcodeSvg value={code} />
          ) : (
            <div className="bg-print-nocode">No barcode</div>
          )}
          <div className="bg-print-name">{item.name}</div>
          <div className="bg-print-sku-price">
            <span>{item.sku || "—"}</span>
            <span>{formatPrice(item.price)}</span>
          </div>
          <span className="bg-print-code">{code}</span>
        </div>
      );
    })}
  </div>
);

/* ── Barcode SVG for the print sheet (rendered once, no re-render) ── */
const PrintBarcodeSvg = ({ value }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, String(value), {
        format: "CODE128",
        width: 1.6,
        height: 38,
        displayValue: false,
        margin: 2,
        background: "#ffffff",
        lineColor: "#000000",
      });
    } catch { /* noop */ }
  }, [value]);
  return <svg ref={ref} className="bg-print-barcode-svg" />;
};

/* ══════════════════════════════════════════════════════════ */
/*  Main page component                                       */
/* ══════════════════════════════════════════════════════════ */
const BarcodeGenerator = () => {
  const [items, setItems]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [search, setSearch]         = useState("");
  const [selected, setSelected]     = useState(new Set());
  const [printItems, setPrintItems] = useState([]);
  const [saving, setSaving]         = useState(null); // item.id being saved
  const [toast, setToast]           = useState("");

  /* ── Load products ── */
  const loadItems = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await inventoryApi.getItems();
      const list = normalizeList(res, ["items", "inventory", "data"]);
      setItems(list.filter((it) => it.status !== "archived"));
    } catch (err) {
      setError(err?.message || "Failed to load products.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  /* ── Open a clean popup window and print from there (most reliable cross-browser approach) ── */
  useEffect(() => {
    if (printItems.length === 0) return;

    // 400 ms — wait for jsbarcode useEffects inside the off-screen portal to finish
    const t = setTimeout(() => {
      const printSheet = document.querySelector(".bg-print-sheet");
      if (!printSheet || !printSheet.firstElementChild) return;

      // Deep-clone the already-rendered print sheet (barcode SVGs included)
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
<title>Product Labels — Pawesome</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 8mm; background: white; font-family: sans-serif; }
  .bg-print-sheet { display: grid; grid-template-columns: repeat(3, 60mm); gap: 4mm; }
  .bg-print-label { width: 60mm; min-height: 30mm; border: 0.3pt solid #ccc; border-radius: 2mm; padding: 2mm 2.5mm; display: flex; flex-direction: column; align-items: center; gap: 1mm; page-break-inside: avoid; background: white; }
  .bg-print-barcode-svg { width: 100%; height: auto; max-height: 14mm; }
  .bg-print-name { font-size: 10px; font-weight: 700; text-align: center; color: #000; line-height: 1.2; word-break: break-word; }
  .bg-print-sku-price { display: flex; justify-content: space-between; width: 100%; font-size: 9px; color: #333; }
  .bg-print-code { font-size: 8px; font-family: monospace; color: #333; word-break: break-all; }
  .bg-print-nocode { font-size: 9px; color: #999; font-style: italic; }
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

  /* ── Filtered list ── */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.name?.toLowerCase().includes(q) ||
        it.sku?.toLowerCase().includes(q) ||
        it.barcode?.toLowerCase().includes(q) ||
        it.category?.toLowerCase().includes(q)
    );
  }, [items, search]);

  /* ── Selection helpers ── */
  const toggleOne = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const selectAll = () => setSelected(new Set(filtered.map((it) => it.id)));
  const deselectAll = () => setSelected(new Set());
  const allSelected = filtered.length > 0 && filtered.every((it) => selected.has(it.id));

  /* ── Print handlers ── */
  const handlePrintSelected = () => {
    const toPrint = filtered.filter((it) => selected.has(it.id));
    if (toPrint.length === 0) {
      setToast("Select at least one label to print.");
      setTimeout(() => setToast(""), 3000);
      return;
    }
    setPrintItems(toPrint);
  };

  const handlePrintOne = (item) => setPrintItems([item]);

  /* ── Save SKU as barcode ── */
  const handleSaveBarcode = async (item) => {
    setSaving(item.id);
    try {
      await inventoryApi.updateItem(item.id, { barcode: item.sku });
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, barcode: item.sku } : it))
      );
      setToast(`Barcode saved for ${item.name}.`);
    } catch {
      setToast("Failed to save barcode. Please try again.");
    } finally {
      setSaving(null);
      setTimeout(() => setToast(""), 3000);
    }
  };

  /* ── Render ── */
  return (
    <div className="bg-page">

      {/* Always-present print sheet rendered into body so CSS isolation doesn't hide it */}
      {ReactDOM.createPortal(<PrintSheet items={printItems} />, document.body)}

      {/* ── Hero ── */}
      <div className="bg-hero">
        <div className="bg-hero-left">
          <span className="bg-eyebrow">Inventory</span>
          <h1>
            <FontAwesomeIcon icon={faBarcode} />
            Barcode Generator
          </h1>
          <p>Generate and print scannable barcode labels for your products.</p>
        </div>
        <div className="bg-hero-actions">
          <button
            type="button"
            className="bg-btn bg-btn--outline"
            onClick={loadItems}
            disabled={loading}
            title="Refresh products"
          >
            <FontAwesomeIcon icon={faRotateRight} spin={loading} />
            Refresh
          </button>
          <button
            type="button"
            className="bg-btn bg-btn--primary"
            onClick={handlePrintSelected}
            disabled={selected.size === 0 || loading}
          >
            <FontAwesomeIcon icon={faPrint} />
            Print Selected ({selected.size})
          </button>
        </div>
      </div>

      {/* ── Controls bar ── */}
      <div className="bg-controls">
        <div className="bg-search-wrap">
          <FontAwesomeIcon icon={faSearch} className="bg-search-icon" />
          <input
            type="text"
            className="bg-search-input"
            placeholder="Search by name, SKU, barcode, category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" className="bg-search-clear" onClick={() => setSearch("")}>
              <FontAwesomeIcon icon={faXmark} />
            </button>
          )}
        </div>

        <div className="bg-selection-row">
          <button
            type="button"
            className="bg-btn bg-btn--ghost"
            onClick={allSelected ? deselectAll : selectAll}
          >
            <FontAwesomeIcon icon={allSelected ? faCheckSquare : faSquare} />
            {allSelected ? "Deselect All" : "Select All"}
          </button>
          <span className="bg-count">
            {filtered.length} product{filtered.length !== 1 ? "s" : ""}
            {selected.size > 0 && ` · ${selected.size} selected`}
          </span>
        </div>
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div className="bg-toast" role="alert">
          <FontAwesomeIcon icon={faTriangleExclamation} /> {toast}
        </div>
      )}

      {/* ── States ── */}
      {loading && (
        <div className="bg-state-msg">
          <span className="bg-spinner-lg" />
          Loading products…
        </div>
      )}

      {!loading && error && (
        <div className="bg-state-msg error">
          <FontAwesomeIcon icon={faTriangleExclamation} /> {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="bg-state-msg">
          <FontAwesomeIcon icon={faFilter} /> No products found.
        </div>
      )}

      {/* ── Label grid ── */}
      {!loading && !error && filtered.length > 0 && (
        <div className="bg-grid">
          {filtered.map((item) => (
            <LabelCard
              key={item.id}
              item={item}
              selected={selected.has(item.id)}
              onToggle={toggleOne}
              onPrintOne={handlePrintOne}
              onSaveBarcode={handleSaveBarcode}
              saving={saving}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default BarcodeGenerator;
