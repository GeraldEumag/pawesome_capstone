import React, { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClipboardList, faSpinner, faRotateLeft } from "@fortawesome/free-solid-svg-icons";
import { inventoryApi } from "../../api/inventory.jsx";
import DatePickerInput from "../shared/DatePickerInput";
import PremiumToast from "../shared/PremiumToast";
import QuickItemSelector from "./QuickItemSelector";
import ReverseMovementModal from "./ReverseMovementModal";
import "./StockMovement.css";

const MOVEMENT_TYPES = [
  { value: "", label: "All types" },
  { value: "stock_in", label: "Stock In" },
  { value: "stock_out", label: "Stock Out" },
  { value: "stock_reversal", label: "Reversal" },
  { value: "customer_return_restock", label: "Customer Return Restock" },
  { value: "return_disposition", label: "Return Disposition" },
  { value: "sale_deduction", label: "Sale / POS" },
  { value: "order_deduction", label: "Customer Order" },
  { value: "manual_adjustment", label: "Manual Adjustment" },
];

const REASON_CODES = [
  { value: "", label: "All reasons" },
  { value: "purchase", label: "New Purchase" },
  { value: "supplier_delivery", label: "Supplier Delivery" },
  { value: "customer_return", label: "Customer Return" },
  { value: "damaged", label: "Damaged" },
  { value: "expired", label: "Expired" },
  { value: "lost_missing", label: "Lost / Missing" },
  { value: "internal_usage", label: "Internal Usage" },
  { value: "service_consumption", label: "Service Consumption" },
  { value: "supplier_return", label: "Returned to Supplier" },
  { value: "disposal", label: "Disposal" },
  { value: "correction", label: "Inventory Correction" },
  { value: "other", label: "Other" },
  { value: "reversal", label: "Reversal" },
];

const badgeClass = (m) => {
  if (m.movement_type === "stock_reversal") return "reversal";
  if (m.movement_type === "stock_in" || m.movement_type === "customer_return_restock") return "in";
  if (m.movement_type === "stock_out" || (m.delta ?? 0) < 0) return "out";
  return "neutral";
};

const toDateStr = (d) => (d ? new Date(d).toISOString().slice(0, 10) : undefined);

const StockMovementsPage = () => {
  const [filters, setFilters] = useState({ movement_type: "", reason_code: "", performed_by: "", reference: "" });
  const [itemFilter, setItemFilter] = useState(null);
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [movements, setMovements] = useState([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [reversing, setReversing] = useState(null);
  const [toast, setToast] = useState({ show: false, type: "success", title: "", message: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inventoryApi.getMovements({
        ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
        item_id: itemFilter?.id,
        startDate: toDateStr(dateFrom),
        endDate: toDateStr(dateTo),
        page,
      });
      setMovements(res?.movements || res?.data || []);
      setMeta(res?.meta || { current_page: 1, last_page: 1, total: 0 });
    } catch (err) {
      setMovements([]);
      setToast({ show: true, type: "error", title: "Load Failed", message: err.message });
    } finally {
      setLoading(false);
    }
  }, [filters, itemFilter, dateFrom, dateTo, page]);

  useEffect(() => { load(); }, [load]);

  const setF = (k, v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };

  const onReversed = (res) => {
    setToast({
      show: true, type: "success", title: "Movement Reversed",
      message: `Reversed ${res?.reversed ?? ""} unit(s)${res?.remaining_reversible !== undefined ? ` — ${res.remaining_reversible} still reversible` : ""}.`,
    });
    load();
  };

  return (
    <div className="sm-page">
      <div className="sm-header">
        <div>
          <h1><FontAwesomeIcon icon={faClipboardList} /> Stock Movements</h1>
          <div className="sm-subtitle">Append-only ledger — every stock change with source, reason, actor and before/after quantities. Reversible movements can be undone via a linked reversal.</div>
        </div>
      </div>

      <div className="sm-card">
        <h3>Filters</h3>
        <div className="sm-filters">
          <div className="sm-field">
            <label>Item</label>
            {itemFilter ? (
              <div className="sm-disposition-option selected">
                <span style={{ flex: 1 }}>{itemFilter.name} <span className="sm-line-sku">{itemFilter.sku || ""}</span></span>
                <button type="button" className="sm-remove-btn" onClick={() => setItemFilter(null)}>×</button>
              </div>
            ) : (
              <QuickItemSelector onSelect={setItemFilter} placeholder="Filter by item…" />
            )}
          </div>
          <div className="sm-field">
            <label>Movement type</label>
            <select value={filters.movement_type} onChange={(e) => setF("movement_type", e.target.value)}>
              {MOVEMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="sm-field">
            <label>Reason</label>
            <select value={filters.reason_code} onChange={(e) => setF("reason_code", e.target.value)}>
              {REASON_CODES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="sm-field">
            <label>Performed by</label>
            <input type="text" value={filters.performed_by} onChange={(e) => setF("performed_by", e.target.value)} placeholder="User name" />
          </div>
          <div className="sm-field">
            <label>Reference / Txn no.</label>
            <input type="text" value={filters.reference} onChange={(e) => setF("reference", e.target.value)} placeholder="IN-…, OUT-…, ref no." />
          </div>
          <div className="sm-field">
            <label>From</label>
            <DatePickerInput selected={dateFrom} onChange={setDateFrom} />
          </div>
          <div className="sm-field">
            <label>To</label>
            <DatePickerInput selected={dateTo} onChange={setDateTo} />
          </div>
        </div>
      </div>

      <div className="sm-card">
        {loading ? (
          <div className="sm-loading"><FontAwesomeIcon icon={faSpinner} spin /> Loading movements…</div>
        ) : movements.length === 0 ? (
          <div className="sm-empty-state">No movements match the current filters.</div>
        ) : (
          <div className="sm-table-wrap">
            <table className="sm-table">
              <thead>
                <tr>
                  <th>Transaction</th>
                  <th>Date</th>
                  <th>Item</th>
                  <th>Type</th>
                  <th>Qty</th>
                  <th>Stock</th>
                  <th>Reason</th>
                  <th>By</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <span className="sm-line-item">{m.transaction_no || `#${m.id}`}</span>
                      {m.original_movement_id && <span className="sm-line-sku">↩ movement #{m.original_movement_id}</span>}
                    </td>
                    <td>{m.created_at ? new Date(m.created_at).toLocaleString() : "—"}</td>
                    <td>
                      <span className="sm-line-item">{m.item_name || `#${m.inventory_item_id}`}</span>
                      <span className="sm-line-sku">{m.item_sku || ""}</span>
                    </td>
                    <td><span className={`sm-badge ${badgeClass(m)}`}>{(m.movement_type || "—").replace(/_/g, " ")}</span></td>
                    <td>
                      <strong className={m.delta < 0 ? "delta-neg" : "delta-pos"} style={{ color: m.delta < 0 ? "var(--color-danger-text,#b42318)" : "var(--color-success-text,#177245)" }}>
                        {m.delta > 0 ? `+${m.delta}` : m.delta ?? m.quantity}
                      </strong>
                      {m.reversed_quantity > 0 && <span className="sm-line-sku">rev {m.reversed_quantity}</span>}
                    </td>
                    <td>{m.previous_stock} → {m.new_stock}</td>
                    <td>
                      <span className="sm-line-sku">{m.reason || "—"}</span>
                    </td>
                    <td>
                      <span className="sm-line-sku">{m.performed_by || "system"}{m.role ? ` (${m.role})` : ""}</span>
                    </td>
                    <td>
                      {m.reversible && (
                        <button type="button" className="sm-link-btn" onClick={() => setReversing(m)}>
                          <FontAwesomeIcon icon={faRotateLeft} /> Reverse
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {meta.last_page > 1 && (
          <div className="sm-pagination">
            <button type="button" className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
            <span>Page {meta.current_page} of {meta.last_page}</span>
            <button type="button" className="btn btn-secondary" disabled={page >= meta.last_page} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        )}
      </div>

      {reversing && (
        <ReverseMovementModal movement={reversing} onClose={() => setReversing(null)} onDone={onReversed} />
      )}

      <PremiumToast {...toast} onClose={() => setToast((t) => ({ ...t, show: false }))} />
    </div>
  );
};

export default StockMovementsPage;
