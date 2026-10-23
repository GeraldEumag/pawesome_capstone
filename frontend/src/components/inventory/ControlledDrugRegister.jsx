import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPrescriptionBottleMedical,
  faChevronDown,
  faChevronUp,
  faSpinner,
  faClipboardCheck,
  faBalanceScale,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import { showPrompt } from "../../utils/alert.jsx";
import "./ControlledDrugRegister.css";

/**
 * Controlled-drug register + weekly two-person counts (Phase D).
 * Mounted under both /inventory and /manager — the API prefix switches with
 * the role. Inventory staff submit counts; a different user verifies.
 */
const ControlledDrugRegister = ({ apiPrefix = "/inventory", canVerify = false }) => {
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [registers, setRegisters] = useState({});
  const [countForm, setCountForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [itemsRes, countsRes] = await Promise.all([
        apiRequest(`${apiPrefix}/controlled-drugs`),
        apiRequest(`${apiPrefix}/controlled-drug-counts`),
      ]);
      setItems(Array.isArray(itemsRes?.items) ? itemsRes.items : []);
      setCounts(Array.isArray(countsRes?.counts) ? countsRes.counts : []);
    } catch (err) {
      toast.error(err.message || "Failed to load controlled drugs.");
    } finally {
      setLoading(false);
    }
  }, [apiPrefix]);

  useEffect(() => { load(); }, [load]);

  const loadRegister = async (itemId) => {
    try {
      const res = await apiRequest(`${apiPrefix}/controlled-drugs/${itemId}/register`);
      setRegisters((prev) => ({ ...prev, [itemId]: res }));
    } catch (err) {
      toast.error(err.message || "Failed to load register.");
    }
  };

  const toggle = async (itemId) => {
    const opening = !expanded[itemId];
    setExpanded((prev) => ({ ...prev, [itemId]: opening }));
    if (opening && !registers[itemId]) {
      await loadRegister(itemId);
    }
  };

  const submitCount = async (item) => {
    const form = countForm[item.id] || {};
    const counted = parseInt(form.counted_balance ?? "", 10);
    if (Number.isNaN(counted) || counted < 0) {
      toast.error("Enter a valid counted balance.");
      return;
    }
    try {
      setBusy(`count-${item.id}`);
      await apiRequest(`${apiPrefix}/controlled-drug-counts`, "POST", {
        inventory_item_id: item.id,
        counted_balance: counted,
        reason: form.reason || undefined,
      });
      toast.success("Count submitted — a second person must verify it.");
      setCountForm((prev) => ({ ...prev, [item.id]: {} }));
      await load();
    } catch (err) {
      toast.error(err.message || "Failed to submit count.");
    } finally {
      setBusy(null);
    }
  };

  const verifyCount = async (count) => {
    let body = {};
    if (count.variance !== 0) {
      const reason = await showPrompt(
        `Count variance is ${count.variance}. Reason for the correction:`,
        "Verify Count"
      );
      if (reason === null) return;
      body = { reason: reason || undefined };
    }
    try {
      setBusy(`verify-${count.id}`);
      await apiRequest(`${apiPrefix}/controlled-drug-counts/${count.id}/verify`, "POST", body);
      toast.success("Count verified.");
      await load();
    } catch (err) {
      toast.error(err.message || "Verification failed.");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <section className="cdr-page">
        <div className="cdr-empty"><FontAwesomeIcon icon={faSpinner} spin /> Loading register…</div>
      </section>
    );
  }

  return (
    <section className="cdr-page">
      <header className="cdr-header">
        <h2><FontAwesomeIcon icon={faPrescriptionBottleMedical} /> Controlled Drug Register</h2>
        <p>
          Every movement is logged with a running balance. Weekly counts need
          a counter and a separate witness.
        </p>
      </header>

      {items.length === 0 ? (
        <div className="cdr-empty">
          No items are classed as controlled drugs. Set <code>item_class = controlled_drug</code> on inventory items.
        </div>
      ) : (
        <div className="cdr-items">
          {items.map((item) => {
            const open = expanded[item.id];
            const reg = registers[item.id];
            const form = countForm[item.id] || {};
            const itemCounts = counts.filter((c) => c.inventory_item_id === item.id);
            return (
              <article key={item.id} className="cdr-item">
                <button type="button" className="cdr-item-head" onClick={() => toggle(item.id)}>
                  <div className="cdr-item-title">
                    <strong>{item.name}</strong>
                    <span className="cdr-sku">{item.sku}</span>
                  </div>
                  <div className="cdr-balances">
                    <span className={`cdr-balance${item.balance_matches_stock ? " cdr-balance--ok" : " cdr-balance--bad"}`}>
                      <FontAwesomeIcon icon={faBalanceScale} />
                      Register {item.register_balance} / Stock {item.stock}
                    </span>
                    <FontAwesomeIcon icon={open ? faChevronUp : faChevronDown} />
                  </div>
                </button>

                {open && (
                  <div className="cdr-item-body">
                    {!item.balance_matches_stock && (
                      <div className="cdr-warning">
                        <FontAwesomeIcon icon={faTriangleExclamation} />
                        Register and stock disagree — run a physical count to reconcile.
                      </div>
                    )}

                    <div className="cdr-count-form">
                      <input
                        type="number"
                        min="0"
                        placeholder="Counted balance"
                        aria-label="Counted balance"
                        value={form.counted_balance ?? ""}
                        onChange={(e) =>
                          setCountForm((prev) => ({ ...prev, [item.id]: { ...form, counted_balance: e.target.value } }))
                        }
                      />
                      <input
                        type="text"
                        placeholder="Reason (required on variance)"
                        aria-label="Count reason"
                        value={form.reason ?? ""}
                        onChange={(e) =>
                          setCountForm((prev) => ({ ...prev, [item.id]: { ...form, reason: e.target.value } }))
                        }
                      />
                      <button
                        type="button"
                        className="cdr-btn"
                        disabled={busy === `count-${item.id}`}
                        onClick={() => submitCount(item)}
                      >
                        <FontAwesomeIcon icon={faClipboardCheck} /> Submit Count
                      </button>
                    </div>

                    {itemCounts.length > 0 && (
                      <div className="cdr-counts">
                        {itemCounts.slice(0, 5).map((count) => (
                          <div key={count.id} className="cdr-count-row">
                            <span>
                              Week of {count.week_of}: counted {count.counted_balance} vs register {count.expected_balance}
                              {count.variance !== 0 && <strong className="cdr-variance"> (variance {count.variance})</strong>}
                            </span>
                            <span className={`cdr-count-status cdr-count-status--${count.status}`}>
                              {count.status === "pending_witness" ? "Awaiting witness" : count.status}
                            </span>
                            {canVerify && count.status === "pending_witness" && (
                              <button
                                type="button"
                                className="cdr-btn cdr-btn--verify"
                                disabled={busy === `verify-${count.id}`}
                                onClick={() => verifyCount(count)}
                              >
                                Verify
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <table className="cdr-register">
                      <thead>
                        <tr>
                          <th>When</th>
                          <th>Type</th>
                          <th>Δ Qty</th>
                          <th>Balance</th>
                          <th>By</th>
                          <th>Witness</th>
                          <th>Pet</th>
                          <th>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(reg?.entries || []).map((entry) => (
                          <tr key={entry.id}>
                            <td>{entry.created_at ? new Date(entry.created_at).toLocaleString() : "—"}</td>
                            <td>{entry.entry_type}</td>
                            <td className={entry.quantity_delta < 0 ? "cdr-neg" : "cdr-pos"}>
                              {entry.quantity_delta > 0 ? `+${entry.quantity_delta}` : entry.quantity_delta}
                            </td>
                            <td><strong>{entry.balance_after}</strong></td>
                            <td>{entry.performed_by?.name || "—"}</td>
                            <td>{entry.witness?.name || "—"}</td>
                            <td>{entry.pet?.name || "—"}</td>
                            <td>{entry.notes || "—"}</td>
                          </tr>
                        ))}
                        {(reg?.entries || []).length === 0 && (
                          <tr><td colSpan="8">No register entries yet.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default ControlledDrugRegister;
