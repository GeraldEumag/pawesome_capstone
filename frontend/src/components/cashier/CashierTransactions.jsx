import React, { useState, useEffect } from "react";
import { showAlert, showPrompt, showError } from "../../utils/alert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSearch,
  faFilter,
  faPlus,
  faEdit,
  faTrash,
  faReceipt,
  faCreditCard,
  faMoneyBillWave,
  faCalendarAlt,
  faShoppingCart,
  faEye,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import "./CashierTransactions_Polished.css";
import { formatCurrency } from "../../utils/currency";
import { posApi } from "../../api/pos";
import { useNavigate } from "react-router-dom";

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

  useEffect(() => {
    loadTransactions(pagination.current_page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus]);

  const loadTransactions = async (page = 1) => {
    try {
      setLoading(true);
      setError("");
      const params = { per_page: 20, page };
      if (filterStatus !== "all") {
        params.status = filterStatus;
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
      console.error("Load transactions error:", err);
    } finally {
      setLoading(false);
    }
  };

  const mapPaymentMethod = (method) => {
    const map = {
      'cash': 'cash',
      'credit_card': 'visa',
      'debit_card': 'mastercard',
      'gcash': 'amex',
      'maya': 'amex',
    };
    return map[method] || 'cash';
  };

  const handlePrintReceipt = (transaction) => {
    const receiptWindow = window.open("", "_blank", "width=400,height=600");
    if (!receiptWindow) return;

    const itemsHtml = (transaction.products || [])
      .map((p) => `<tr><td>${p.name}</td><td>${p.quantity}</td><td>${formatCurrency(p.price)}</td></tr>`)
      .join("");

    receiptWindow.document.write(`
      <html>
        <head>
          <title>Receipt ${transaction.id}</title>
          <style>
            body { font-family: monospace; padding: 20px; max-width: 360px; margin: 0 auto; }
            h2 { text-align: center; margin-bottom: 4px; }
            .store { text-align: center; font-size: 12px; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { text-align: left; padding: 4px 0; }
            th { border-bottom: 1px dashed #000; }
            .total { border-top: 1px dashed #000; font-weight: bold; margin-top: 8px; padding-top: 8px; text-align: right; }
            .meta { margin-top: 16px; font-size: 12px; }
            .meta div { margin-bottom: 4px; }
            @media print { button { display: none; } }
          </style>
        </head>
        <body>
          <h2>PAWESOME PET STORE</h2>
          <div class="store">123 Pet Street, Manila, Philippines</div>
          <div class="meta">
            <div><strong>Transaction:</strong> ${transaction.id}</div>
            <div><strong>Customer:</strong> ${transaction.customer || "Walk-in"}</div>
            <div><strong>Date:</strong> ${transaction.date} ${transaction.time || ""}</div>
            <div><strong>Payment:</strong> ${transaction.payment || "Cash"}</div>
          </div>
          <table>
            <thead><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead>
            <tbody>${itemsHtml}</tbody>
          </table>
          <div class="total">TOTAL: ${formatCurrency(transaction.amount)}</div>
          <div class="meta" style="margin-top:24px; text-align:center;">
            <div>Thank you for shopping!</div>
          </div>
          <button onclick="window.print()" style="margin-top:20px; width:100%; padding:10px; font-size:14px;">Print Receipt</button>
        </body>
      </html>
    `);
    receiptWindow.document.close();
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
    const matchesSearch = 
      transaction.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transaction.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transaction.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = filterStatus === "all" || transaction.status === filterStatus;
    
    return matchesSearch && matchesFilter;
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
      case "amex":
        return faCreditCard;
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
                  <button
                    className="action-btn view-btn"
                    onClick={() => setSelectedTransaction(transaction)}
                    title="View Details"
                  >
                    <FontAwesomeIcon icon={faEye} />
                  </button>
                  <button 
                    className="action-btn edit-btn" 
                    title="Edit"
                    onClick={() => showAlert('Edit feature coming soon!')}
                  >
                    <FontAwesomeIcon icon={faEdit} />
                  </button>
                  <button 
                    className="action-btn delete-btn" 
                    title="Void"
                    onClick={async () => {
                      const reason = await showPrompt("Enter reason for voiding:");
                      if (reason) handleVoidTransaction(transaction.sale_id, reason);
                    }}
                    disabled={transaction.status === 'cancelled'}
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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

      {selectedTransaction && (
        <div className="transaction-modal-overlay" onClick={() => setSelectedTransaction(null)}>
          <div className="transaction-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Transaction Details</h2>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => handlePrintReceipt(selectedTransaction)}
                  style={{ fontSize: 13, padding: "6px 12px" }}
                >
                  <FontAwesomeIcon icon={faReceipt} /> Print Receipt
                </button>
                <button
                  className="close-btn"
                  onClick={() => setSelectedTransaction(null)}
                >
                  ×
                </button>
              </div>
            </div>
            <div className="modal-content">
              <div className="transaction-overview">
                <div className="overview-item">
                  <label>Transaction ID:</label>
                  <span>{selectedTransaction.id}</span>
                </div>
                <div className="overview-item">
                  <label>Customer:</label>
                  <span>{selectedTransaction.customer}</span>
                </div>
                <div className="overview-item">
                  <label>Email:</label>
                  <span>{selectedTransaction.email}</span>
                </div>
                <div className="overview-item">
                  <label>Date:</label>
                  <span>{selectedTransaction.date} at {selectedTransaction.time}</span>
                </div>
                <div className="overview-item">
                  <label>Payment Method:</label>
                  <span>{selectedTransaction.payment}</span>
                </div>
                <div className="overview-item">
                  <label>Status:</label>
                  <span className={`status-badge ${getStatusColor(selectedTransaction.status)}`}>
                    {selectedTransaction.status}
                  </span>
                </div>
              </div>
              
              <div className="transaction-products">
                <h3>Products</h3>
                <table className="products-table">
                  <thead>
                    <tr>
                      <th>Product Name</th>
                      <th>Quantity</th>
                      <th>Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTransaction.products.map((product, index) => (
                      <tr key={index}>
                        <td>{product.name}</td>
                        <td>{product.quantity}</td>
                        <td>{formatCurrency(product.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="total-row">
                      <td colSpan="2">Total:</td>
                      <td className="total-amount">{formatCurrency(selectedTransaction.amount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashierTransactions;
