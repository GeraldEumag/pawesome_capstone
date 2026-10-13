import { useState, useRef, useEffect, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowsRotate,
  faSpinner,
  faMagnifyingGlass,
  faFilter,
  faSort,
  faFileArrowDown,
  faCheck,
  faXmark,
  faPaperclip,
  faPrint,
  faFilePdf,
  faMoneyBillWave,
  faMobileScreen,
  faWallet,
  faHotel,
  faStethoscope,
  faScissors,
  faShoppingBag,
  faBoxOpen,
  faCheckCircle,
  faTriangleExclamation,
  faClockRotateLeft,
  faDeleteLeft,
} from "@fortawesome/free-solid-svg-icons";
import { showSuccess, showError, showWarning } from "../../../utils/alert.jsx";
import { printReceipt } from "../../../utils/receiptPrinter";
import { downloadReceiptPdf } from "../../../utils/receiptPdf";
import { STORE_INFO } from "../../../utils/storeInfo";
import { usePaymentApprovals, paymentKey } from "../hooks/usePaymentApprovals.jsx";
import { useAuth } from "../../../context/AuthContext";
import "./PaymentApprovals.css";

/* ── Payment method config ── */
const METHOD_CONFIG = {
  cash:    { label: "Cash",   color: "#10b981", bg: "#dcfce7", icon: faMoneyBillWave },
  gcash:   { label: "GCash",  color: "#4f46e5", bg: "#ede9fe", icon: faMobileScreen  },
  maya:    { label: "Maya",   color: "#0ea5e9", bg: "#e0f2fe", icon: faWallet        },
  counter: { label: "Cash",   color: "#10b981", bg: "#dcfce7", icon: faMoneyBillWave },
};

const BILL_PRESETS = [50, 100, 200, 500, 1000];

const getMethodConfig = (method) => {
  const key = (method || "").toLowerCase();
  return METHOD_CONFIG[key] || METHOD_CONFIG.counter;
};

const getTypeIcon = (type) => {
  switch ((type || "").toLowerCase()) {
    case "boarding":    return faHotel;
    case "appointment": return faStethoscope;
    case "grooming":    return faScissors;
    case "service_billing_payment": return faStethoscope;
    case "service":     return faShoppingBag;
    case "order":       return faBoxOpen;
    default:            return faBoxOpen;
  }
};

/* Customer initials avatar */
const CustomerAvatar = ({ name }) => {
  const initials = (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join("");
  const hue = [...(name || "?")].reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  return (
    <div className="pa-avatar" style={{ background: `hsl(${hue},55%,50%)` }} aria-hidden="true">
      {initials}
    </div>
  );
};

const isDigitalMethod = (method) => {
  const m = (method || "").toLowerCase();
  return m === "gcash" || m === "maya";
};

const isCashMethod = (method) => {
  const m = (method || "").toLowerCase();
  return !m || m === "cash" || m === "counter";
};

const isWalkIn = (payment) => (payment?.booking_channel || "").toLowerCase() === "walk_in";
const isServiceBillingCashier = (payment) =>
  payment?.payable_type === "service_billing_payment" && payment?.payment_channel === "cashier";

/*
 * Counter cash is collectible for walk-in bookings, or for any booking whose
 * submitted e-wallet proof was rejected (the counter-fallback rule). The
 * backend enforces the same — this only shapes the displayed action.
 */
const isCounterCollection = (payment) => {
  const ps = (payment?.payment_status || "").toLowerCase();
  if (payment?.payable_type === "service_billing_payment" && payment?.payment_channel === "cashier") return true;
  if (ps === "rejected") return true;
  return isWalkIn(payment) && ["unpaid", "pending"].includes(ps);
};

/* The row has an actionable payment step: counter collection, or a
 * submitted proof awaiting verification. */
const isActionable = (payment) => {
  const ps = (payment?.payment_status || "").toLowerCase();
  if (isCounterCollection(payment)) return true;
  return ps === "pending" && !!payment?.payment_proof;
};

const fmt = (n) =>
  Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ── Main component ── */
const PaymentApprovals = () => {
  const { user } = useAuth();
  const {
    filteredRequests,
    loading,
    refreshing,
    actionLoading,
    lastUpdated,
    stats,
    searchTerm,
    setSearchTerm,
    typeFilter,
    setTypeFilter,
    methodFilter,
    setMethodFilter,
    sortBy,
    setSortBy,
    selectedIds,
    toggleSelection,
    selectAll,
    clearSelection,
    fetchRequests,
    verifyPayment,
    rejectPayment,
    bulkVerify,
    bulkReject,
    exportToCSV,
    proofModal,
    openProof,
    closeProof,
  } = usePaymentApprovals(user);

  /* ── Modal local state ── */
  const [referenceNumber, setReferenceNumber] = useState("");
  const [cashReceived, setCashReceived]       = useState("");   // string, e.g. "500"
  const [cashierMethod, setCashierMethod] = useState("cash");
  const [showReceipt, setShowReceipt]         = useState(false);
  const [receiptData, setReceiptData]         = useState(null);

  const referenceNumberRef = useRef(referenceNumber);
  referenceNumberRef.current = referenceNumber;
  const cashReceivedRef = useRef(cashReceived);
  cashReceivedRef.current = cashReceived;

  /* Reset local modal state when modal opens/closes */
  useEffect(() => {
    if (!proofModal) {
      setReferenceNumber("");
      setCashReceived("");
      setCashierMethod("cash");
      return;
    }

    const payment = proofModal.payment;
    setCashierMethod(isServiceBillingCashier(payment) ? "cash" : (payment?.payment_method || "cash"));
    if (!isServiceBillingCashier(payment) && payment?.payment_reference) {
      setReferenceNumber(payment.payment_reference);
    }
  }, [proofModal]);

  /* Derived cash values */
  const amountDue  = Number(proofModal?.payment?.amount || proofModal?.payment?.total_amount || 0);
  const billingCounterPayment = isServiceBillingCashier(proofModal?.payment);
  const modalPaymentMethod = billingCounterPayment ? cashierMethod : proofModal?.payment?.payment_method;
  const isCashModal = billingCounterPayment ? cashierMethod === "cash" : isCashMethod(modalPaymentMethod);
  const cashNum    = Number(cashReceived) || 0;
  const changeAmt  = useMemo(() => Math.max(cashNum - amountDue, 0), [cashNum, amountDue]);
  const cashShort  = useMemo(() => (cashNum > 0 && cashNum < amountDue ? amountDue - cashNum : 0), [cashNum, amountDue]);
  const cashReady  = cashNum >= amountDue && amountDue > 0;   // can proceed

  /* ── Numpad handlers ── */
  const handleNumpadKey = (key) => {
    setCashReceived(prev => {
      if (prev.length >= 9) return prev;        // max 9 digits
      if (key === "." && prev.includes(".")) return prev;
      if (key === "." && prev === "") return "0.";
      return prev + key;
    });
  };

  const handleDeleteKey = () => setCashReceived(prev => prev.slice(0, -1));

  const handleBillPreset = (amount) => {
    // Add bill to running total (like Square/Toast)
    setCashReceived(prev => {
      const current = Number(prev) || 0;
      return String(current + amount);
    });
  };

  const handleExact = () => setCashReceived(String(amountDue));

  /* ── Verify handler ── */
  const handleVerifyFromModal = async () => {
    if (!proofModal?.payment) { showError("Payment data not available"); return; }
    const payment = proofModal.payment;
    const paymentToVerify = { ...payment, payment_method: modalPaymentMethod };
    const refNum  = referenceNumberRef.current.trim();

    if (isCashModal) {
      // Cash: require amount entered AND sufficient
      if (!cashReceivedRef.current || cashNum <= 0) {
        showWarning("Please enter the cash amount received.");
        return;
      }
      if (cashNum < amountDue) {
        showWarning(`Cash received (₱${fmt(cashNum)}) is less than the amount due (₱${fmt(amountDue)}).`);
        return;
      }
    } else {
      // Digital: require reference number
      if (!refNum) {
        showWarning(`Please enter the ${getMethodConfig(modalPaymentMethod).label} reference number to verify.`);
        return;
      }
      if (refNum.length < 6) {
        showWarning("Reference number must be at least 6 characters.");
        return;
      }
    }

    const cashParams = {
      paymentMethod: modalPaymentMethod,
      ...(isCashModal ? { cashReceived: cashNum, change: changeAmt } : {}),
    };

    const result = await verifyPayment(paymentToVerify, refNum, cashParams);
    if (result?.success) {
      setReceiptData({
        id:               payment.id,
        customer_name:    payment.customer_name,
        service_name:     payment.service_name || payment.request_type || "Service",
        amount:           amountDue,
        payment_method:   modalPaymentMethod || "Cash",
        receipt_number:   result.receipt_number,
        reference_number: refNum || null,
        cash_received:    isCashModal ? cashNum : null,
        change:           isCashModal ? changeAmt : null,
        paid_at:          new Date().toISOString(),
        verified_by:      user?.name || "Cashier",
        breakdown:        result.breakdown || null,
      });
      closeProof();
      setShowReceipt(true);
      setReferenceNumber("");
      setCashReceived("");
    }
  };

  const handleRejectFromModal = async () => {
    if (!proofModal?.payment) { showError("Payment data not available"); return; }
    await rejectPayment(proofModal.payment);
    closeProof();
    setReferenceNumber("");
    setCashReceived("");
  };

  const getReceiptOptions = () => {
    const receipt = receiptData;
    if (!receipt) return null;
    const amount = Number(receipt.amount || 0);
    return {
      title: "Invoice",
      receiptNumber: receipt.receipt_number || "N/A",
      date: receipt.paid_at ? new Date(receipt.paid_at).toLocaleString("en-PH") : new Date().toLocaleString("en-PH"),
      cashier: user?.name || "Cashier",
      customer: receipt.customer_name || "Customer",
      paymentMethod: receipt.payment_method || "Cash",
      paymentStatus: "paid",
      referenceNumber: receipt.reference_number || "",
      verifiedBy: receipt.verified_by || user?.name || "Cashier",
      amountReceived: receipt.cash_received ?? undefined,
      change: receipt.change ?? undefined,
      items: [{ name: receipt.service_name || "Service", quantity: 1, unitPrice: amount, total: amount }],
      subtotal: amount,
      netAmount: receipt.breakdown?.net_amount ?? receipt.net_amount,
      vat: receipt.breakdown?.vat_amount ?? receipt.vat_amount,
      total: amount,
    };
  };

  return (
    <div className="payment-approvals">

      {/* ── Header ── */}
      <div className="pa-header">
        <div className="pa-header-title">
          <span className="pa-badge">CASHIER</span>
          <h2>Payment Approvals</h2>
          <p>Verify customer payments and process transactions</p>
        </div>
        <div className="pa-header-actions">
          <button className="pa-btn-secondary" onClick={() => fetchRequests()} disabled={refreshing}>
            <FontAwesomeIcon icon={refreshing ? faSpinner : faArrowsRotate} spin={refreshing} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <button className="pa-btn-primary" onClick={exportToCSV} disabled={filteredRequests.length === 0}>
            <FontAwesomeIcon icon={faFileArrowDown} /> Export CSV
          </button>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="pa-stats">
        <div className="pa-stat-card">
          <div className="pa-stat-icon pa-stat-icon--blue"><FontAwesomeIcon icon={faClockRotateLeft} /></div>
          <div className="pa-stat-content">
            <span className="pa-stat-value">{stats.total}</span>
            <span className="pa-stat-label">Pending</span>
          </div>
        </div>
        <div className="pa-stat-card pa-stat-highlight">
          <div className="pa-stat-icon pa-stat-icon--green"><FontAwesomeIcon icon={faMoneyBillWave} /></div>
          <div className="pa-stat-content">
            <span className="pa-stat-value">₱{stats.totalAmount.toLocaleString("en-PH")}</span>
            <span className="pa-stat-label">Total Amount</span>
          </div>
        </div>
        <div className="pa-stat-card">
          <div className="pa-stat-icon pa-stat-icon--pink"><FontAwesomeIcon icon={faCheckCircle} /></div>
          <div className="pa-stat-content">
            <span className="pa-stat-value">{stats.verifiedToday}</span>
            <span className="pa-stat-label">Verified Today</span>
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="pa-filters">
        <div className="pa-search">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="pa-search-icon" />
          <input
            type="text"
            placeholder="Search customer…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="pa-filter-group">
          <FontAwesomeIcon icon={faFilter} />
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">All Types</option>
            <option value="boarding">Boarding</option>
            <option value="appointment">Appointment</option>
            <option value="grooming">Grooming</option>
            <option value="service">Service</option>
            <option value="order">Order</option>
          </select>
        </div>

        <div className="pa-method-chips">
          {[
            { value: "all",   label: "All",   icon: null            },
            { value: "cash",  label: "Cash",  icon: faMoneyBillWave  },
            { value: "gcash", label: "GCash", icon: faMobileScreen   },
            { value: "maya",  label: "Maya",  icon: faWallet         },
          ].map(({ value, label, icon }) => (
            <button
              key={value}
              className={`pa-method-chip${methodFilter === value ? " active" : ""}`}
              data-method={value}
              onClick={() => setMethodFilter(value)}
            >
              {icon && <FontAwesomeIcon icon={icon} />} {label}
            </button>
          ))}
        </div>

        <div className="pa-filter-group">
          <FontAwesomeIcon icon={faSort} />
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="date-desc">Newest First</option>
            <option value="date-asc">Oldest First</option>
            <option value="amount-desc">Highest Amount</option>
            <option value="amount-asc">Lowest Amount</option>
            <option value="name-asc">Name A-Z</option>
            <option value="name-desc">Name Z-A</option>
          </select>
        </div>

        <div className="pa-filter-meta">
          <span className="pa-result-count">{filteredRequests.length} result{filteredRequests.length !== 1 ? "s" : ""}</span>
          {lastUpdated && (
            <span className="pa-last-updated">
              Updated {lastUpdated.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
      </div>

      {/* ── Bulk Actions ── */}
      {selectedIds.length > 0 && (
        <div className="pa-bulk-bar">
          <div className="pa-bulk-info">
            <label className="pa-bulk-checkbox">
              <input
                type="checkbox"
                checked={filteredRequests.every(r => selectedIds.includes(paymentKey(r)))}
                onChange={selectAll}
              />
              <span>{selectedIds.length} selected</span>
            </label>
            <button className="pa-btn-clear" onClick={clearSelection}>
              <FontAwesomeIcon icon={faXmark} /> Clear
            </button>
          </div>
          <div className="pa-bulk-actions">
            <button className="pa-btn-bulk-verify" onClick={bulkVerify}>
              <FontAwesomeIcon icon={faCheck} /> Verify All
            </button>
            <button className="pa-btn-bulk-reject" onClick={bulkReject}>
              <FontAwesomeIcon icon={faXmark} /> Reject All
            </button>
          </div>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="pa-loading">
          <FontAwesomeIcon icon={faSpinner} spin size="2x" />
          <p>Loading payment requests…</p>
        </div>
      )}

      {/* ── Empty State ── */}
      {!loading && filteredRequests.length === 0 && (
        <div className="pa-empty">
          <div className="pa-empty-icon"><FontAwesomeIcon icon={faBoxOpen} /></div>
          <h3>No pending payments</h3>
          <p>
            {searchTerm || typeFilter !== "all" || methodFilter !== "all"
              ? "Try adjusting your filters to see more results."
              : "New payment requests will appear here automatically."}
          </p>
          {(searchTerm || typeFilter !== "all" || methodFilter !== "all") && (
            <button className="pa-btn-primary" onClick={() => { setSearchTerm(""); setTypeFilter("all"); setMethodFilter("all"); }}>
              Clear Filters
            </button>
          )}
        </div>
      )}

      {/* ── Payment Cards ── */}
      {!loading && filteredRequests.length > 0 && (
        <div className="pa-cards">
          {filteredRequests.map((payment) => {
            const customerName  = payment.customer_name || payment.customer?.name || "Unknown";
            const customerEmail = payment.customer?.email || payment.customer_email || "";
            const type          = payment.request_type || payment.type || "-";
            const service       = payment.service_name || payment.service?.name || payment.order_name || "-";
            const amount        = Number(payment.amount || payment.total_amount || 0).toLocaleString("en-PH");
            const hasProof      = !!payment.proof_url;
            const pKey          = paymentKey(payment);
            const isVerifyLoading = actionLoading === `${pKey}-verify`;
            const isRejectLoading = actionLoading === `${pKey}-reject`;
            const methodCfg     = getMethodConfig(payment.payment_method);
            const payDate       = payment.request_date || payment.date || payment.created_at;

            return (
              <div
                key={pKey}
                className={`pa-card${selectedIds.includes(pKey) ? " pa-card-selected" : ""}`}
              >
                <div className="pa-card-accent" style={{ background: methodCfg.color }} />

                <div className="pa-card-header">
                  {payment.payable_type !== "service_billing_payment" && (
                    <label className="pa-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(pKey)}
                        onChange={() => toggleSelection(pKey)}
                      />
                      <span className="pa-checkmark" />
                    </label>
                  )}

                  <CustomerAvatar name={customerName} />

                  <div className="pa-customer">
                    <span className="pa-customer-name">{customerName}</span>
                    {customerEmail && <span className="pa-customer-email">{customerEmail}</span>}
                  </div>

                  <div className="pa-card-header-right">
                    <span
                      className="pa-method-badge"
                      style={{ color: methodCfg.color, background: methodCfg.bg }}
                    >
                      <FontAwesomeIcon icon={methodCfg.icon} /> {isServiceBillingCashier(payment) ? "At Cashier" : methodCfg.label}
                    </span>
                    {payDate && (
                      <span className="pa-time">
                        {new Date(payDate).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                </div>

                <div className="pa-card-body">
                  <div className="pa-service">
                    <span className="pa-service-icon-wrap">
                      <FontAwesomeIcon icon={getTypeIcon(type)} />
                    </span>
                    <div className="pa-service-info">
                      <span className="pa-service-type">{type}</span>
                      <span className="pa-service-name">{service}</span>
                    </div>
                  </div>
                  <div className="pa-amount-section">
                    <span className="pa-amount">₱{amount}</span>
                    {payment.payment_reference && (
                      <div className="pa-card-reference">
                        Customer ref: <code>{payment.payment_reference}</code>
                      </div>
                    )}
                    {hasProof && (
                      <button className="pa-proof-btn" onClick={() => openProof(payment.proof_url, payment)}>
                        <FontAwesomeIcon icon={faPaperclip} /> View Proof
                      </button>
                    )}
                  </div>
                </div>

                <div className="pa-card-actions">
                  {isActionable(payment) ? (
                    <button
                      className="pa-btn-verify"
                      onClick={() => openProof(payment.proof_url || null, payment)}
                      disabled={isVerifyLoading || isRejectLoading}
                    >
                      {isVerifyLoading
                        ? <><FontAwesomeIcon icon={faSpinner} spin /> Verifying…</>
                        : <><FontAwesomeIcon icon={faCheck} /> {isServiceBillingCashier(payment) ? "Collect Payment" : isCounterCollection(payment) ? "Collect Cash" : "Verify"}</>}
                    </button>
                  ) : (
                    <span className="pa-awaiting-online" title="This booking was made online — the customer must submit an e-wallet payment proof first.">
                      Awaiting Online Payment
                    </span>
                  )}
                  {/* Only a pending submitted proof can be rejected — an
                      'unpaid' record is awaiting payment, not approval. */}
                  {(payment.payment_status || "").toLowerCase() === "pending" && (
                    <button
                      className="pa-btn-reject"
                      onClick={() => rejectPayment(payment)}
                      disabled={isVerifyLoading || isRejectLoading}
                    >
                      {isRejectLoading
                        ? <><FontAwesomeIcon icon={faSpinner} spin /> Rejecting…</>
                        : <><FontAwesomeIcon icon={faXmark} /> Reject</>}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Proof / Verify Modal ── */}
      {proofModal && (() => {
        const isCash = isCashModal;
        return (
          <div className="pa-modal-overlay" onClick={closeProof}>
            <div
              className={`pa-modal pa-proof-modal${isCash ? " pa-proof-modal--cash" : ""}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="pa-modal-header">
                <div>
                  <h3>
                    {isCash
                      ? "Collect Cash Payment"
                      : `Verify ${getMethodConfig(modalPaymentMethod).label} Payment`}
                  </h3>
                  <p className="pa-modal-sub">
                    {proofModal.payment?.customer_name || "Customer"} —{" "}
                    {proofModal.payment?.service_name || proofModal.payment?.request_type || "Service"}
                  </p>
                </div>
                <button className="pa-modal-close" onClick={closeProof}>
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              </div>

              {proofModal.payment?.payable_type === "service_billing_payment" && (
                <div className="pa-reference-section">
                  <strong>Bill items</strong>
                  {(proofModal.payment.items || []).map((item, index) => (
                    <div key={`${item.id || item.description}-${index}`} className="pa-modal-sub">
                      <span>{item.is_discount ? `Discount: ${item.description}` : item.description}</span>
                      <span>₱{fmt(item.is_discount ? -Math.abs(Number(item.total_price || 0)) : item.total_price)}</span>
                    </div>
                  ))}
                  <strong>Full balance due: ₱{fmt(amountDue)}</strong>
                </div>
              )}

              {billingCounterPayment && (
                <div className="pa-reference-section">
                  <label htmlFor="paCashierMethod" className="pa-reference-label">
                    <strong>Payment Method Collected</strong>
                  </label>
                  <select
                    id="paCashierMethod"
                    value={cashierMethod}
                    onChange={(event) => {
                      setCashierMethod(event.target.value);
                      setCashReceived("");
                      setReferenceNumber("");
                    }}
                    className="pa-reference-input"
                  >
                    <option value="cash">Cash</option>
                    <option value="gcash">GCash</option>
                    <option value="maya">Maya</option>
                  </select>
                </div>
              )}

              {/* ── Cash collection layout ── */}
              {isCash ? (
                <div className="pa-modal-body pa-cash-collect">

                  {/* Due / Received / Change display */}
                  <div className="pa-cash-readout">
                    <div className="pa-cash-readout-row pa-cash-due-row">
                      <span>Amount Due</span>
                      <strong className="pa-cash-due-val">₱{fmt(amountDue)}</strong>
                    </div>
                    <div className={`pa-cash-readout-row pa-cash-recv-row${cashReady ? " pa-cash-recv-row--ok" : ""}`}>
                      <span>Cash Received</span>
                      <strong className="pa-cash-recv-val">
                        {cashReceived ? `₱${fmt(cashNum)}` : <span className="pa-cash-placeholder">₱0.00</span>}
                      </strong>
                    </div>
                    {cashShort > 0 && (
                      <div className="pa-cash-readout-row pa-cash-short-row">
                        <span>Short</span>
                        <strong className="pa-cash-short-val">−₱{fmt(cashShort)}</strong>
                      </div>
                    )}
                    {cashReady && (
                      <div className="pa-cash-readout-row pa-cash-change-row">
                        <span>Change</span>
                        <strong className="pa-cash-change-val">₱{fmt(changeAmt)}</strong>
                      </div>
                    )}
                  </div>

                  {/* Bill presets */}
                  <div className="pa-bill-presets">
                    {BILL_PRESETS.map(b => (
                      <button key={b} className="pa-bill-btn" onClick={() => handleBillPreset(b)}>
                        ₱{b.toLocaleString()}
                      </button>
                    ))}
                    <button className="pa-bill-btn pa-bill-btn--exact" onClick={handleExact}>
                      Exact
                    </button>
                  </div>

                  {/* Numpad */}
                  <div className="pa-cash-numpad">
                    {["1","2","3","4","5","6","7","8","9","00","0"].map(k => (
                      <button key={k} className="pa-numpad-key" onClick={() => handleNumpadKey(k)}>
                        {k}
                      </button>
                    ))}
                    <button className="pa-numpad-key pa-numpad-key--delete" onClick={handleDeleteKey}>
                      <FontAwesomeIcon icon={faDeleteLeft} />
                    </button>
                  </div>

                  {/* Optional receipt # */}
                  <div className="pa-reference-section">
                    <label htmlFor="paRefNum" className="pa-reference-label">
                      <strong>Receipt / Reference Number</strong>
                      <span className="pa-reference-hint">Optional</span>
                    </label>
                    <input
                      type="text"
                      id="paRefNum"
                      value={referenceNumber}
                      onChange={(e) => setReferenceNumber(e.target.value)}
                      placeholder="Enter receipt or reference number (optional)"
                      className="pa-reference-input"
                    />
                  </div>
                </div>
              ) : (
                /* ── Digital payment layout (proof image + reference) ── */
                <div className="pa-modal-body pa-proof-body">
                  {/* Proof image */}
                  <div className="pa-proof-image-container">
                    {proofModal.loading ? (
                      <div className="pa-proof-loading">
                        <FontAwesomeIcon icon={faSpinner} spin size="2x" />
                        <p>Loading proof…</p>
                      </div>
                    ) : proofModal.error ? (
                      <div className="pa-proof-loading pa-proof-error">
                        <FontAwesomeIcon icon={faTriangleExclamation} size="2x" />
                        <p>{proofModal.error}</p>
                        {proofModal.payment?.proof_url && (
                          <button type="button" className="pa-btn-secondary" onClick={() => openProof(proofModal.payment.proof_url, proofModal.payment)}>
                            Retry
                          </button>
                        )}
                      </div>
                    ) : proofModal.blobUrl && proofModal.isPdf ? (
                      <iframe src={proofModal.blobUrl} title="Payment proof PDF" className="pa-proof-pdf" />
                    ) : proofModal.blobUrl ? (
                      <img src={proofModal.blobUrl} alt="Payment proof" className="pa-proof-image" />
                    ) : (
                      <div className="pa-proof-loading">
                        <p>{billingCounterPayment ? "Record the reference for the payment received at the cashier." : "No payment proof available."}</p>
                      </div>
                    )}
                  </div>

                  {/* Reference input */}
                  <div className="pa-reference-section">
                    {proofModal.payment?.payment_reference && (
                      <div className="pa-submitted-reference">
                        <span className="pa-submitted-reference-label">Customer-submitted reference</span>
                        <strong className="pa-submitted-reference-value">{proofModal.payment.payment_reference}</strong>
                      </div>
                    )}
                    <label htmlFor="paRefNum" className="pa-reference-label">
                      <strong>{getMethodConfig(modalPaymentMethod).label} Reference Number</strong>
                      <span className="pa-reference-hint">{billingCounterPayment ? "Required for counter e-wallet collection" : "Required — enter from the payment screenshot"}</span>
                    </label>
                    <input
                      type="text"
                      id="paRefNum"
                      value={referenceNumber}
                      onChange={(e) => setReferenceNumber(e.target.value)}
                      placeholder={`Enter ${getMethodConfig(modalPaymentMethod).label} reference number`}
                      className="pa-reference-input"
                      autoFocus
                    />
                  </div>
                </div>
              )}

              <div className="pa-modal-footer">
                {(proofModal.payment?.payment_status || "").toLowerCase() === "pending" && (
                  <button className="pa-btn-reject" onClick={handleRejectFromModal} disabled={!!actionLoading}>
                    {actionLoading === `${proofModal?.payment?.id}-reject`
                      ? <><FontAwesomeIcon icon={faSpinner} spin /> Rejecting…</>
                      : <><FontAwesomeIcon icon={faXmark} /> Reject</>}
                  </button>
                )}
                <button
                  className="pa-btn-verify"
                  onClick={handleVerifyFromModal}
                  disabled={!!actionLoading || (isCash && !cashReady)}
                  title={isCash && !cashReady ? "Enter cash amount first" : ""}
                >
                  {actionLoading === `${proofModal?.payment?.id}-verify`
                    ? <><FontAwesomeIcon icon={faSpinner} spin /> Processing…</>
                    : isCash
                      ? <><FontAwesomeIcon icon={faCheck} /> Collect &amp; Print Receipt</>
                      : <><FontAwesomeIcon icon={faCheck} /> Verify Payment</>}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Receipt Modal ── */}
      {showReceipt && receiptData && (
        <div className="pa-modal-overlay" onClick={() => setShowReceipt(false)}>
          <div className="pa-modal pa-receipt-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pa-modal-header">
              <h3>Payment Verified</h3>
              <button className="pa-modal-close" onClick={() => setShowReceipt(false)}>
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>
            <div className="pa-receipt">

              {/* Store header */}
              <div className="pa-receipt-hd">
                <div className="pa-receipt-name">PAWESOME RETREAT INC.</div>
                {STORE_INFO.address.split("\n").map((line) => (
                  <div className="pa-receipt-addr" key={line}>{line}</div>
                ))}
                <div className="pa-receipt-sub">INVOICE</div>
              </div>

              {/* Transaction info */}
              {receiptData.receipt_number && (
                <div className="pa-receipt-row"><span>Receipt #</span><span>{receiptData.receipt_number}</span></div>
              )}
              <div className="pa-receipt-row"><span>Date</span><span>{new Date(receiptData.paid_at).toLocaleString("en-PH")}</span></div>
              <div className="pa-receipt-row"><span>Customer</span><span>{receiptData.customer_name || "N/A"}</span></div>
              <div className="pa-receipt-row"><span>Service</span><span>{receiptData.service_name || "Service"}</span></div>
              <div className="pa-receipt-row"><span>Method</span><span>{(receiptData.payment_method || "—").toUpperCase()}</span></div>
              {receiptData.reference_number && (
                <div className="pa-receipt-row"><span>Reference #</span><span>{receiptData.reference_number}</span></div>
              )}
              <div className="pa-receipt-row"><span>Verified by</span><span>{receiptData.verified_by || "Cashier"}</span></div>

              {/* VAT-inclusive breakdown — authoritative values from the backend */}
              <div className="pa-receipt-row"><span>Net Amount (ex-VAT)</span><span>₱{fmt(receiptData.breakdown?.net_amount ?? receiptData.net_amount ?? receiptData.amount)}</span></div>
              <div className="pa-receipt-row"><span>VAT (12%)</span><span>₱{fmt(receiptData.breakdown?.vat_amount ?? receiptData.vat_amount ?? 0)}</span></div>
              <div className="pa-receipt-total">
                <span>TOTAL</span>
                <span>₱{fmt(receiptData.amount)}</span>
              </div>

              {/* Payment details */}
              {receiptData.cash_received != null && (
                <div className="pa-receipt-row"><span>Cash Received</span><span>₱{fmt(receiptData.cash_received)}</span></div>
              )}
              {receiptData.change != null && (
                <div className="pa-receipt-row"><span>Change</span><span>₱{fmt(receiptData.change)}</span></div>
              )}


              {/* Footer */}
              <div className="pa-receipt-footer">
                <p>Thank you for choosing Pawesome Retreat Inc.!<br />Please keep this receipt.</p>
              </div>
            </div>
            <div className="pa-modal-footer">
              <button className="pa-btn-secondary" onClick={() => setShowReceipt(false)}>Close</button>
              <button
                className="pa-btn-secondary"
                onClick={() => {
                  const options = getReceiptOptions();
                  if (!options) return;
                  try {
                    downloadReceiptPdf(options);
                  } catch (err) {
                    showError(err.message || "Failed to download receipt PDF.");
                  }
                }}
              >
                <FontAwesomeIcon icon={faFilePdf} /> Download PDF
              </button>
              <button
                className="pa-btn-primary"
                onClick={() => {
                  const options = getReceiptOptions();
                  if (options) printReceipt({ ...options, subtotal: options.netAmount ?? options.subtotal });
                }}
              >
                <FontAwesomeIcon icon={faPrint} /> Print Receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentApprovals;
