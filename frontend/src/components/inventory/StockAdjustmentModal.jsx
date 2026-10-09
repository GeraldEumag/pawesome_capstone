import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowDown,
  faArrowUp,
  faBox,
  faMinus,
  faPlus,
  faSpinner,
  faTimes,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { inventoryApi } from "../../api/inventory.jsx";
import DatePickerInput from "../shared/DatePickerInput";
import { formatDateOnly, parseDateOnly } from "../../utils/date";
import "./StockAdjustmentModal.css";
import { showAlert, showError } from "../../utils/alert.jsx";

const REASONS = {
  add: [
    "New stock received",
    "Returned by customer",
    "Inventory correction",
    "Found in warehouse",
    "Other",
  ],
  remove: [
    "Damaged/expired",
    "Returned to supplier",
    "Lost/stolen",
    "Used for internal",
    "Other",
  ],
};

const QUICK_QTY = [5, 10, 25, 50, 100];

const StockAdjustmentModal = ({ isOpen, onClose, item, onSuccess, initialType, initialQuantity }) => {
  const [adjustmentType, setAdjustmentType] = useState(initialType || "add");
  const [quantity, setQuantity] = useState(initialQuantity ? String(initialQuantity) : "");
  const [reason, setReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [receivedDate, setReceivedDate] = useState(formatDateOnly(new Date()));
  const [manufacturingDate, setManufacturingDate] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [supplier, setSupplier] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const currentStock = Number(item?.stock ?? item?.quantity ?? item?.stock_quantity ?? item?.current_stock ?? 0);
  const expiryCategories = ["food", "medicine", "vitamin", "health", "grooming", "shampoo", "treat"];
  const requiresExpiry = Boolean(item?.requires_expiry_tracking)
    || item?.issue_method === "FEFO"
    || expiryCategories.some((category) => String(item?.category || "").toLowerCase().includes(category));
  const qty = parseInt(quantity, 10);
  const hasQty = !isNaN(qty) && qty > 0;
  const newTotal = hasQty
    ? adjustmentType === "add"
      ? currentStock + qty
      : Math.max(0, currentStock - qty)
    : currentStock;
  const delta = hasQty ? (adjustmentType === "add" ? qty : -qty) : 0;

  const resetForm = () => {
    setAdjustmentType(initialType || "add");
    setQuantity(initialQuantity ? String(initialQuantity) : "");
    setReason("");
    setCustomReason("");
    setBatchNo("");
    setReceivedDate(formatDateOnly(new Date()));
    setManufacturingDate("");
    setExpirationDate("");
    setSupplier("");
    setUnitCost("");
    setError(null);
  };

  useEffect(() => {
    if (isOpen) resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialType, initialQuantity]);

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const switchType = (type) => {
    setAdjustmentType(type);
    setReason("");
    setCustomReason("");
  };

  const validateForm = () => {
    if (!hasQty) return "Please enter a valid quantity";
    if (adjustmentType === "remove" && qty > currentStock) {
      return `Cannot remove more than current stock (${currentStock})`;
    }
    if (!reason) return "Please provide a reason for this adjustment";
    if (reason === "Other" && !customReason.trim()) return "Please specify the reason";
    if (adjustmentType === "add") {
      if (!batchNo.trim()) return "Batch number is required for stock receiving";
      if (!receivedDate) return "Received date is required";
      if (requiresExpiry && !expirationDate) return "Expiration date is required for this item";
      if (manufacturingDate && manufacturingDate > receivedDate) return "Manufacturing date cannot be after the received date";
      if (expirationDate && expirationDate < receivedDate) return "Expiration date cannot be before the received date";
    }
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validateForm();
    if (validationError) {
      showAlert(validationError);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const finalReason = reason === "Other" ? customReason.trim() : reason;
      if (adjustmentType === "add") {
        await inventoryApi.addBatch(item.id, {
          batch_no: batchNo.trim(),
          received_date: receivedDate,
          manufacturing_date: manufacturingDate || null,
          expiration_date: expirationDate || null,
          quantity: qty,
          supplier: supplier.trim() || null,
          unit_cost: unitCost === "" ? null : Number(unitCost),
          notes: finalReason,
        });
      } else {
        await inventoryApi.adjustStock(item.id, adjustmentType, qty, finalReason);
      }
      await onSuccess?.();
      onClose?.();
    } catch (err) {
      const errorMsg = err.message || "Failed to adjust stock. Please try again.";
      setError(errorMsg);
      showError(`Error: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !item) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content adjustment-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Adjust Stock</h3>
            <p>Update inventory quantity with reason tracking</p>
          </div>
          <button type="button" className="modal-close-btn" onClick={handleClose} aria-label="Close">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="modal-body">
          {/* Product info */}
          <div className="item-info">
            <p className="item-name">
              <FontAwesomeIcon icon={faBox} /> {item.name}
            </p>
            <p className="item-current-stock">
              SKU: {item.sku || "N/A"} &middot; {item.category || "Uncategorized"} &middot;{" "}
              Current stock: <strong>{currentStock} units</strong>
            </p>
          </div>

          {error && <p className="error-message">{error}</p>}

          {/* Adjustment type */}
          <div className="adjustment-types">
            <button
              type="button"
              className={`adjustment-type-btn ${adjustmentType === "add" ? "active add" : ""}`}
              onClick={() => switchType("add")}
            >
              <FontAwesomeIcon icon={faPlus} /> Add Stock
            </button>
            <button
              type="button"
              className={`adjustment-type-btn ${adjustmentType === "remove" ? "active remove" : ""}`}
              onClick={() => switchType("remove")}
            >
              <FontAwesomeIcon icon={faMinus} /> Remove Stock
            </button>
          </div>

          {/* Quantity */}
          <div className="quantity-section">
            <label>{adjustmentType === "add" ? "Quantity to Add" : "Quantity to Remove"}</label>
            <div className="quantity-stepper">
              <button
                type="button"
                className="stepper-btn"
                onClick={() => setQuantity(String(Math.max(1, (qty || 1) - 1)))}
                aria-label="Decrease"
              >
                <FontAwesomeIcon icon={faMinus} />
              </button>
              <input
                type="number"
                className="quantity-input"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
                min="1"
              />
              <button
                type="button"
                className="stepper-btn"
                onClick={() => setQuantity(String((qty || 0) + 1))}
                aria-label="Increase"
              >
                <FontAwesomeIcon icon={faPlus} />
              </button>
            </div>
            <div className="quick-qty">
              {QUICK_QTY.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`quick-qty-btn ${qty === n ? "active" : ""}`}
                  onClick={() => setQuantity(String(n))}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {adjustmentType === "add" && (
            <div className="batch-intake-section">
              <h4>New stock batch</h4>
              <p>Each receipt is recorded as a separate lot for stock rotation and expiry tracking.</p>
              <div className="batch-intake-grid">
                <label>
                  <span>Batch number <span className="required">*</span></span>
                  <input value={batchNo} onChange={(e) => setBatchNo(e.target.value)} maxLength={50} placeholder="Supplier lot or batch number" />
                </label>
                <label>
                  <span>Received date <span className="required">*</span></span>
                  <DatePickerInput selected={parseDateOnly(receivedDate)} onChange={(date) => setReceivedDate(formatDateOnly(date))} maxDate={new Date()} />
                </label>
                <label>
                  <span>Manufacturing date</span>
                  <DatePickerInput selected={parseDateOnly(manufacturingDate)} onChange={(date) => setManufacturingDate(formatDateOnly(date))} maxDate={parseDateOnly(receivedDate) || new Date()} />
                </label>
                <label>
                  <span>Expiration date {requiresExpiry && <span className="required">*</span>}</span>
                  <DatePickerInput selected={parseDateOnly(expirationDate)} onChange={(date) => setExpirationDate(formatDateOnly(date))} minDate={parseDateOnly(receivedDate) || new Date()} />
                </label>
                <label>
                  <span>Supplier</span>
                  <input value={supplier} onChange={(e) => setSupplier(e.target.value)} maxLength={255} placeholder="Supplier name" />
                </label>
                <label>
                  <span>Unit cost</span>
                  <input type="number" min="0" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="0.00" />
                </label>
              </div>
            </div>
          )}

          {/* Result preview */}
          <div className={`stock-preview ${hasQty ? (delta >= 0 ? "up" : "down") : ""}`}>
            <div className="stock-preview-label">
              New stock after {adjustmentType === "add" ? "adding" : "removing"}
            </div>
            <div className={`stock-preview-value ${hasQty ? (delta >= 0 ? "positive" : "negative") : ""}`}>
              {newTotal}
            </div>
            {hasQty && (
              <div className={`stock-preview-delta ${delta >= 0 ? "positive" : "negative"}`}>
                <FontAwesomeIcon icon={delta >= 0 ? faArrowUp : faArrowDown} />{" "}
                {delta >= 0 ? `+${delta}` : delta} from {currentStock}
              </div>
            )}
            {hasQty && newTotal === 0 && (
              <div className="stock-preview-warning">
                <FontAwesomeIcon icon={faTriangleExclamation} /> This will result in OUT OF STOCK
              </div>
            )}
            {hasQty && newTotal > 0 && newTotal <= 10 && (
              <div className="stock-preview-warning warn">
                <FontAwesomeIcon icon={faTriangleExclamation} /> This will trigger LOW STOCK alert
              </div>
            )}
          </div>

          {/* Reason */}
          <div className="reason-section">
            <label>
              Reason <span className="required">*</span>
            </label>
            <select
              className="reason-select"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              <option value="">Select a reason...</option>
              {(REASONS[adjustmentType] || ["Other"]).map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            {reason === "Other" && (
              <textarea
                className="custom-reason-input"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Enter custom reason..."
                autoFocus
              />
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-cancel" onClick={handleClose} disabled={loading}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn-confirm ${adjustmentType}`}
            onClick={handleSubmit}
            disabled={loading || !hasQty || !reason}
          >
            {loading ? (
              <>
                <FontAwesomeIcon icon={faSpinner} spin /> Processing...
              </>
            ) : (
              <>{adjustmentType === "add" ? "Add Stock" : "Remove Stock"}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StockAdjustmentModal;
