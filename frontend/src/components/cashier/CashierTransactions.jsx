import React, { useState, useEffect, useRef } from "react";
import { showAlert, showError, showReasonPrompt, VOID_REASONS } from "../../utils/alert.jsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSearch,
  faFilter,
  faPlus,
  faTrash,
  faReceipt,
  faFilePdf,
  faCreditCard,
  faMoneyBillWave,
  faMobileScreen,
  faWallet,
  faCalendarAlt,
  faShoppingCart,
  faEye,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import "./CashierTransactions_Polished.css";
import { formatCurrency } from "../../utils/currency";
import { posApi } from "../../api/pos";
import { printReceipt } from "../../utils/receiptPrinter";
import { downloadReceiptPdf } from "../../utils/receiptPdf";
import ReceiptDocument from "../shared/receipt/ReceiptDocument";
import { useNavigate } from "react-router-dom";
import RowActionPopover from "../shared/RowActionPopover";
import Modal from "../shared/Modal";

const isGenericFetchFailure = (error) =>
  error?.name === "TypeError" && error?.message === "Failed to fetch";

const CashierTransactions = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pagination, setPagination] = useState({
    current_page: 1,
    last_page: 1,
    total: 0,
  });

  const searchDebounceRef = useRef(null);

  useEffect(() => {
    loadTransactions(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus]);

  useEffect(() => {
    clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      loadTransactions(1);
    }, 400);
    return () => clearTimeout(searchDebounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  const loadTransactions = async (page = 1) => {
    try {
      setLoading(true);
      setError("");
      const params = { per_page: 20, page };
      if (filterStatus !== "all") {
        params.status = filterStatus;
      }
      if (searchTerm.trim()) {
        params.search = searchTerm.trim();
      }
      const response = await posApi.getTransactions(params);
      
      const transformedData = (response.data || []).map(sale => ({
        id: sale.transaction_number || `TRX-${sale.id}`,
        sale_id: sale.id,
        customer: sale.customer?.name || "Walk-in",
        email: sale.customer?.email || "",
        amount: parseFloat(sale.total_amount || sale.amount || 0),
        items: sale.items?.length || 0,
        payment: sale.payments?.[0]?.payment_method || "Cash",
        paymentMethod: mapPaymentMethod(sale.payments?.[0]?.payment_method),
        date: new Date(sale.created_at).toISOString().split('T')[0],
        time: new Date(sale.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: sale.status,
        products: (sale.items || []).map(item => ({
          name: item.item_name,
          quantity: item.quantity,
          price: parseFloat(item.total_price),
        })),
        raw_data: sale, 
      }));
      
      setTransactions(transformedData);
      setPagination({
        current_page: response.current_page || 1,
        last_page: response.last_page || 1,
        total: response.total || transformedData.length,
      });
    } catch (err) {
      setError("Failed to load transactions");
      showError("Failed to load transactions");
      if (!isGenericFetchFailure(err)) {
        console.error("Load transactions error:", err);
      }
    } finally {
      setLoading(false);
    }
  };

  const mapPaymentMethod = (method) => {
    const map = {
      'cash': 'cash',
      'credit_card': 'visa',
      'debit_card': 'mastercard',
      'gcash': 'gcash',
      'maya': 'maya',
    };
    return map[method] || 'cash';
  };

  const getReceiptOptions = (transaction) => {
    // Fix: API returns "items" not "products" — check both for safety
    const receipt = transactionDetail?.receipt || transaction.receipt || {};
    const sale = transactionDetail?.transaction || transaction.raw_data || transaction;
    const rawItems = Array.isArray(receipt.items)
      ? receipt.items
      : Array.isArray(sale.items)
        ? sale.items
        : Array.isArray(transaction.products) ? transaction.products : [];
    const items = rawItems.map((item) => {
      const quantity = Number(item.quantity || 1);
      const unitPrice = Number(item.unit_price ?? item.price ?? 0);
      return {
        name: item.item_name || item.name || "Item",
        quantity,
        unitPrice,
        total: Number(item.total_price ?? item.total ?? unitPrice * quantity),
      };
    });
    const breakdown = receipt.breakdown || sale.breakdown || {};
    const total = Number(receipt.total ?? receipt.total_amount ?? sale.total_amount ?? transaction.amount ?? 0);
    const amountReceived = Number(receipt.payment?.amount ?? sale.amount_received ?? sale.cash_received ?? 0);

    return {
      title: "Sales Invoice",
      receiptNumber: receipt.receipt_number || receipt.invoice_number || sale.transaction_number || String(transaction.id),
      date: receipt.date || sale.created_at || (`${transaction.date || ""} ${transaction.time || ""}`.trim() || new Date().toLocaleString("en-PH")),
      cashier: receipt.cashier || sale.cashier?.name || sale.cashier_name || transaction.cashier || "Cashier",
      customer: receipt.customer?.name || sale.customer?.name || transaction.customer || transaction.customer_name || "Walk-in",
      paymentMethod: receipt.payment?.method || sale.payments?.[0]?.payment_method || transaction.payment || transaction.payment_method || "cash",
      paymentStatus: sale.status || transaction.status || "paid",
      referenceNumber: receipt.payment?.reference_number || sale.payments?.[0]?.reference_number || transaction.reference_number || "",
      items,
      subtotal: Number(receipt.subtotal ?? sale.subtotal ?? total),
      netAmount: breakdown.net_amount ?? receipt.net_amount ?? sale.net_amount,
      vat: breakdown.vat_amount ?? receipt.tax ?? sale.tax_amount ?? transaction.tax_amount,
      discount: Number(receipt.discount ?? sale.discount_amount ?? transaction.discount_amount ?? 0),
      total,
      amountReceived: amountReceived || undefined,
      change: Number(receipt.payment?.change ?? sale.payments?.reduce((sum, payment) => sum + Number(payment.change ?? payment.change_amount ?? 0), 0) ?? transaction.change ?? 0) || undefined,
    };
  };

  const handlePrintReceipt = (transaction) => printReceipt(getReceiptOptions(transaction));
  const handleDownloadReceiptPdf = async (transaction) => {
    try {
      await downloadReceiptPdf(getReceiptOptions(transaction));
    } catch (err) {
      showError(err.message || "Failed to download receipt PDF.");
    }
  };

  const [transactionDetail, setTransactionDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const handleViewDetails = async (transaction) => {
    setSelectedTransaction(transaction);
    setTransactionDetail(null);
    try {
      setDetailLoading(true);
      const detail = await posApi.getTransaction(transaction.sale_id);
      setTransactionDetail(detail);
    } catch (err) {
      showError("Failed to load transaction details");
      if (!isGenericFetchFailure(err)) {
        console.error("Load transaction detail error:", err);
      }
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetails = () => {
    setSelectedTransaction(null);
    setTransactionDetail(null);
  };

  const handleVoidTransaction = async (id, reason) => {
    try {
      setLoading(true);
      const result = await posApi.voidTransaction(id, reason);
      if (result.success) {
        await loadTransactions(pagination.current_page);
      }
    } catch (err) {
      setError("Failed to void transaction");
      showError("Failed to void transaction");
    } finally {
      setLoading(false);
    }
  };

  const filteredTransactions = transactions.filter((transaction) => {
    return filterStatus === "all" || transaction.status === filterStatus;
  });

  const getStatusColor = (status) => {
    switch (status) {
      case "completed":
        return "success";
      case "pending":
        return "warning";
      case "cancelled":
        return "danger";
      default:
        return "info";
    }
  };

  const getPaymentIcon = (method) => {
    switch (method) {
      case "visa":
      case "mastercard":
        return faCreditCard;
      case "gcash":
        return faMobileScreen;
      case "maya":
        return faWallet;
      case "cash":
        return faMoneyBillWave;
      default:
        return faReceipt;
    }
  };

  return (
    <div className="cashier-transactions">
      <div className="transactions-header">
        <div className="header-left">
          <h1>Transaction Management</h1>
          <p>View and manage all customer transactions</p>
        </div>
        <div className="header-actions">
          <button className="primary-btn" onClick={() => navigate('/cashier/pos')}>
            <FontAwesomeIcon icon={faPlus} />
            New Transaction
          </button>
        </div>
      </div>

      <div className="transactions-controls">
        <div className="search-filter-group">
          <div className="search-box">
            <FontAwesomeIcon icon={faSearch} />
            <input
              type="text"
              placeholder="Search by customer, transaction ID, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="filter-dropdown">
            <FontAwesomeIcon icon={faFilter} />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      {loading && (
        <div className="loading-overlay">
          <FontAwesomeIcon icon={faSpinner} spin />
          <span>Loading transactions...</span>
        </div>
      )}
      
      {error && <div className="error-banner">{error}</div>}

      <div className="transactions-table-container">
        <div className="transactions-table-wrapper">
        <table className="transactions-table">
          <thead>
            <tr>
              <th>Transaction ID</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Amount</th>
              <th>Payment</th>
              <th>Date & Time</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.map((transaction) => (
              <tr key={transaction.id} className="transaction-row">
                <td className="transaction-id">
                  <FontAwesomeIcon icon={faReceipt} />
                  {transaction.id}
                </td>
                <td className="customer-info">
                  <div className="customer-details">
                    <span className="customer-name">{transaction.customer}</span>
                    <span className="customer-email">{transaction.email}</span>
                  </div>
                </td>
                <td className="items-count">
                  <FontAwesomeIcon icon={faShoppingCart} />
                  {transaction.items} items
                </td>
                <td className="amount">{formatCurrency(transaction.amount)}</td>
                <td className="payment-method">
                  <FontAwesomeIcon icon={getPaymentIcon(transaction.paymentMethod)} />
                  {transaction.payment}
                </td>
                <td className="datetime">
                  <div>
                    <FontAwesomeIcon icon={faCalendarAlt} />
                    {transaction.date}
                  </div>
                  <span className="time">{transaction.time}</span>
                </td>
                <td className="status">
                  <span className={`status-badge ${getStatusColor(transaction.status)}`}>
                    {transaction.status}
                  </span>
                </td>
                <td className="actions">
                  <RowActionPopover rowLabel={transaction.customer || transaction.id}>
                  <button
                    className="action-btn view"
                    onClick={() => handleViewDetails(transaction)}
                    title="View Details"
                  >
                    <FontAwesomeIcon icon={faEye} />
                  </button>
                  <button 
                    className="action-btn delete" 
                    title="Void"
                    onClick={async () => {
                      const reason = await showReasonPrompt(
                        `Void transaction ${transaction.id}? Stock is restored and payments are refunded.`,
                        "Void Transaction",
                        "Void",
                        VOID_REASONS
                      );
                      if (reason) handleVoidTransaction(transaction.sale_id, reason);
                    }}
                    disabled={transaction.status === 'cancelled'}
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                  </RowActionPopover>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* Pagination */}
      {pagination.last_page > 1 && (
        <div className="pagination">
          <button 
            className="page-btn" 
            disabled={pagination.current_page === 1}
            onClick={() => loadTransactions(pagination.current_page - 1)}
          >
            Previous
          </button>
          {Array.from({ length: pagination.last_page }, (_, i) => i + 1).map(page => (
            <button
              key={page}
              className={`page-btn ${pagination.current_page === page ? 'active' : ''}`}
              onClick={() => loadTransactions(page)}
            >
              {page}
            </button>
          ))}
          <button 
            className="page-btn" 
            disabled={pagination.current_page === pagination.last_page}
            onClick={() => loadTransactions(pagination.current_page + 1)}
          >
            Next
          </button>
        </div>
      )}

      {selectedTransaction && (() => {
        // The detail endpoint returns the same payload the receipt uses —
        // never recompute totals here; fall back to the row only while it loads.
        const receipt = transactionDetail?.receipt;
        const sale = transactionDetail?.transaction;
        const breakdown = receipt?.breakdown || {};
        const items = receipt?.items?.length
          ? receipt.items
          : (selectedTransaction.products || []);
        const payments = receipt?.payments?.length
          ? receipt.payments
          : (selectedTransaction.raw_data?.payments || []);
        const total = Number(receipt?.total ?? selectedTransaction.amount ?? 0);
        const netAmount = Number(breakdown.net_amount ?? sale?.subtotal ?? total);
        const vatAmount = Number(breakdown.vat_amount ?? sale?.tax_amount ?? 0);
        const discount = Number(receipt?.discount ?? sale?.discount_amount ?? 0);
        const amountPaid = Number(breakdown.amount_paid ?? receipt?.payment?.amount ?? total);
        const balanceDue = Number(breakdown.balance_due ?? Math.max(0, total - amountPaid));
        const changeDue = payments.reduce((sum, p) => sum + Number(p.change ?? p.change_amount ?? 0), 0);
        const isCancelled = selectedTransaction.status === 'cancelled';
        const voidReason = sale?.void_reason ?? selectedTransaction.raw_data?.void_reason;
        const voidedAt = sale?.voided_at ?? selectedTransaction.raw_data?.voided_at;

        return (
        <Modal
          onClose={closeDetails}
          title="Transaction Details"
          icon={faReceipt}
          size="lg"
          className="transaction-modal"
          headerActions={
            <>
              <button
                className="btn-secondary"
                type="button"
                onClick={() => handleDownloadReceiptPdf(selectedTransaction)}
                style={{ fontSize: 13, padding: "6px 12px" }}
              >
                <FontAwesomeIcon icon={faFilePdf} /> Download PDF
              </button>
              <button
                className="btn-secondary"
                type="button"
                onClick={() => handlePrintReceipt(selectedTransaction)}
                style={{ fontSize: 13, padding: "6px 12px" }}
              >
                <FontAwesomeIcon icon={faReceipt} /> Print Receipt
              </button>
            </>
          }
        >
            <div className="ctx-modal-body">
              {detailLoading && (
                <div className="loading-overlay" style={{ position: "static" }}>
                  <FontAwesomeIcon icon={faSpinner} spin />
                  <span>Loading details...</span>
                </div>
              )}

              {!detailLoading && (
                <div className="ctx-receipt-view">
                  <ReceiptDocument {...getReceiptOptions(selectedTransaction)} />
                </div>
              )}

              <div className="transaction-overview">
                <div className="overview-item">
                  <label>Transaction ID:</label>
                  <span>{selectedTransaction.id}</span>
                </div>
                <div className="overview-item">
                  <label>Date:</label>
                  <span>{selectedTransaction.date} at {selectedTransaction.time}</span>
                </div>
                <div className="overview-item">
                  <label>Cashier:</label>
                  <span>{receipt?.cashier || selectedTransaction.raw_data?.cashier?.name || "—"}</span>
                </div>
                <div className="overview-item">
                  <label>Invoice #:</label>
                  <span>{receipt?.invoice_number || "—"}</span>
                </div>
                <div className="overview-item">
                  <label>Status:</label>
                  <span className={`status-badge ${getStatusColor(selectedTransaction.status)}`}>
                    {selectedTransaction.status}
                  </span>
                </div>
              </div>

              <div className="transaction-overview">
                <div className="overview-item">
                  <label>Customer:</label>
                  <span>{receipt?.customer?.name || selectedTransaction.customer}</span>
                </div>
                <div className="overview-item">
                  <label>Email:</label>
                  <span>{receipt?.customer?.email || selectedTransaction.email || "—"}</span>
                </div>
                <div className="overview-item">
                  <label>Phone:</label>
                  <span>{receipt?.customer?.phone || "—"}</span>
                </div>
              </div>

              <div className="transaction-products">
                <h3>Items</h3>
                <table className="products-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Unit Price</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => (
                      <tr key={index}>
                        <td>{item.name}</td>
                        <td>{item.quantity}</td>
                        <td>{formatCurrency(Number(item.unit_price ?? item.price ?? item.total ?? 0))}</td>
                        <td>{formatCurrency(Number(item.total ?? item.total_price ?? item.price ?? 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="3">Net Amount (ex-VAT):</td>
                      <td>{formatCurrency(netAmount)}</td>
                    </tr>
                    <tr>
                      <td colSpan="3">VAT (12%, included):</td>
                      <td>{formatCurrency(vatAmount)}</td>
                    </tr>
                    {discount > 0 && (
                      <tr>
                        <td colSpan="3">Discount:</td>
                        <td>-{formatCurrency(discount)}</td>
                      </tr>
                    )}
                    <tr className="total-row">
                      <td colSpan="3">Total:</td>
                      <td className="total-amount">{formatCurrency(total)}</td>
                    </tr>
                    <tr>
                      <td colSpan="3">Amount Paid:</td>
                      <td>{formatCurrency(amountPaid)}</td>
                    </tr>
                    {balanceDue > 0 && (
                      <tr>
                        <td colSpan="3">Balance Due:</td>
                        <td>{formatCurrency(balanceDue)}</td>
                      </tr>
                    )}
                    {changeDue > 0 && (
                      <tr>
                        <td colSpan="3">Change:</td>
                        <td>{formatCurrency(changeDue)}</td>
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>

              {payments.length > 0 && (
                <div className="transaction-products">
                  <h3>Payments</h3>
                  <table className="products-table">
                    <thead>
                      <tr>
                        <th>Method</th>
                        <th>Amount</th>
                        <th>Reference</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p, index) => (
                        <tr key={index}>
                          <td>{p.method || p.payment_method || "cash"}</td>
                          <td>{formatCurrency(Number(p.amount ?? 0))}</td>
                          <td>{p.reference_number || p.reference || "—"}</td>
                          <td>{p.status || "paid"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {isCancelled && (
                <div className="transaction-overview">
                  <div className="overview-item">
                    <label>Void Reason:</label>
                    <span>{voidReason || "—"}</span>
                  </div>
                  <div className="overview-item">
                    <label>Voided At:</label>
                    <span>{voidedAt ? new Date(voidedAt).toLocaleString("en-PH") : "—"}</span>
                  </div>
                </div>
              )}
            </div>
        </Modal>
        );
      })()}
    </div>
  );
};

export default CashierTransactions;
