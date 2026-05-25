import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./CashierHistory_Polished.css";
import { apiRequest } from "../../api/client";

const formatCurrency = (amount) => {
  const value = Number(amount) || 0;

  return value.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
  });
};

const formatDateTime = (value) => {
  if (!value) return "N/A";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "N/A";

  return date.toLocaleString("en-PH", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const normalizeTransaction = (transaction, index) => {
  const rawId =
    transaction.id ||
    transaction.transaction_id ||
    transaction.sale_id ||
    transaction.payment_id ||
    index + 1;

  // The new backend already provides properly formatted IDs (SALE-, ORDER-, SERVICE-)
  const id = String(rawId).startsWith("TRX-") || 
             String(rawId).startsWith("SALE-") || 
             String(rawId).startsWith("ORDER-") || 
             String(rawId).startsWith("SERVICE-")
    ? String(rawId)
    : `TRX-${String(rawId).padStart(3, "0")}`;

  return {
    id,
    customer:
      transaction.customer ||
      transaction.customer_name ||
      transaction.client_name ||
      transaction.name ||
      transaction.owner_name ||
      "Walk-in Customer",

    amount:
      transaction.amount ||
      transaction.total ||
      transaction.total_amount ||
      transaction.payment_amount ||
      transaction.paid_amount ||
      0,

    method:
      transaction.method ||
      transaction.payment_method ||
      transaction.type ||
      transaction.payment_type ||
      "Cash",

    date:
      transaction.date ||
      transaction.created_at ||
      transaction.createdAt ||
      transaction.payment_date ||
      transaction.updated_at ||
      null,

    // Additional fields for better display
    source: transaction.source || 'pos',
    type: transaction.type || 'sale',
    service_name: transaction.service_name,
    pet_name: transaction.pet_name,
    payment_reference: transaction.payment_reference,
    receipt_number: transaction.receipt_number,
  };
};

const CashierHistory = () => {
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState("");
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const fetchHistory = useCallback(async ({ silent = false } = {}) => {
    try {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      /*
        LIVE BACKEND ENDPOINT

        Using the correct endpoint for cashier transaction history
      */
      const response = await apiRequest("/cashier/transactions");
      // Cashier history loaded

      const rawItems = Array.isArray(response)
        ? response
        : response?.transactions ||
          response?.history ||
          response?.data ||
          response?.sales ||
          response?.recent_sales ||
          [];
      
      // Items extracted

      const normalizedItems = rawItems.map((item, index) =>
        normalizeTransaction(item, index)
      );

      setTransactions(normalizedItems);
      setLastUpdated(new Date());
      setError("");
    } catch (err) {
      setError(err.message || "Failed to load transaction history");
      console.error("Cashier history fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const filteredItems = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    if (!keyword) return transactions;

    return transactions.filter((item) => {
      return (
        String(item.id || "").toLowerCase().includes(keyword) ||
        String(item.customer || "").toLowerCase().includes(keyword) ||
        String(item.method || "").toLowerCase().includes(keyword) ||
        String(item.amount || "").toLowerCase().includes(keyword)
      );
    });
  }, [transactions, searchTerm]);

  const totalAmount = useMemo(() => {
    return filteredItems.reduce((sum, item) => {
      return sum + (Number(item.amount) || 0);
    }, 0);
  }, [filteredItems]);

  const paymentTypeCount = useMemo(() => {
    return new Set(
      filteredItems.map((item) => String(item.method || "").toLowerCase())
    ).size;
  }, [filteredItems]);

  const getMethodBadgeClass = (method = "") => {
    const lowerMethod = String(method).toLowerCase();

    if (lowerMethod.includes("card")) return "card";
    if (lowerMethod.includes("gcash")) return "gcash";
    if (lowerMethod.includes("maya")) return "maya";
    if (lowerMethod.includes("online")) return "online";

    return "cash";
  };

  const getMethodIcon = (method = "") => {
    const lowerMethod = String(method).toLowerCase();

    if (lowerMethod.includes("card")) return "💳";
    if (lowerMethod.includes("gcash")) return "📱";
    if (lowerMethod.includes("maya")) return "📲";
    if (lowerMethod.includes("online")) return "🌐";

    return "💵";
  };

  return (
    <div className="cashier-history-page">
      <section className="history-hero">
        <div className="history-header">
          <div className="header-content">
            <span className="history-kicker">Cashier Records</span>
            <h1>Transaction History</h1>
            <p>
              Review recent sales, payment methods, and cashier transaction
              details.
            </p>
          </div>

          <div className="last-updated">
            <span>
              Last updated:
              <strong>{lastUpdated.toLocaleTimeString("en-PH")}</strong>
            </span>

            <button
              className="refresh-mini"
              onClick={() => fetchHistory({ silent: true })}
              title="Refresh"
              type="button"
              disabled={refreshing}
            >
              {refreshing ? "…" : "↻"}
            </button>
          </div>
        </div>

        <div className="history-summary-grid">
          <div className="history-summary-card">
            <span>Total Records</span>
            <strong>{filteredItems.length}</strong>
            <small>Filtered transaction count</small>
          </div>

          <div className="history-summary-card">
            <span>Total Amount</span>
            <strong>{formatCurrency(totalAmount)}</strong>
            <small>Based on visible records</small>
          </div>

          <div className="history-summary-card">
            <span>Payment Types</span>
            <strong>{paymentTypeCount}</strong>
            <small>Cash, card, or digital wallet</small>
          </div>
        </div>
      </section>

      <section className="history-content">
        <div className="history-toolbar">
          <div>
            <h2>Recent Transactions</h2>
            <p>Search and monitor cashier payment history.</p>
          </div>

          <div className="history-search">
            <span>⌕</span>
            <input
              type="text"
              placeholder="Search transaction, customer, method..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner" />
            <p>Loading transaction history...</p>
          </div>
        ) : error ? (
          <div className="history-empty">
            <div className="history-empty-icon">⚠️</div>
            <h3>Unable to Load History</h3>
            <p>{error}</p>

            <button
              className="history-retry-btn"
              type="button"
              onClick={() => fetchHistory()}
            >
              Retry
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="history-empty">
            <div className="history-empty-icon">📋</div>
            <h3>No History Available</h3>
            <p>Transaction history will appear here once sales are recorded.</p>
          </div>
        ) : (
          <div className="history-table-container">
            <div className="history-table-wrapper">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Transaction ID</th>
                    <th>Customer</th>
                    <th>Details</th>
                    <th>Amount</th>
                    <th>Payment Method</th>
                    <th>Date / Time</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredItems.map((transaction) => (
                    <tr key={transaction.id}>
                      <td>
                        <strong className="transaction-id">
                          {transaction.id}
                        </strong>
                      </td>

                      <td>{transaction.customer}</td>

                      <td className="details-cell">
                        {transaction.source === 'service_request' && (
                          <div className="service-details">
                            <div className="service-name">{transaction.service_name || 'Service'}</div>
                            {transaction.pet_name && (
                              <div className="pet-name">🐾 {transaction.pet_name}</div>
                            )}
                          </div>
                        )}
                        {transaction.source === 'customer_order' && (
                          <div className="order-details">
                            <div className="order-type">📦 Online Order</div>
                            {transaction.receipt_number && (
                              <div className="receipt">Receipt: {transaction.receipt_number}</div>
                            )}
                          </div>
                        )}
                        {transaction.source === 'pos' && (
                          <div className="pos-details">
                            <div className="pos-type">🏪 POS Sale</div>
                          </div>
                        )}
                      </td>

                      <td className="amount-cell">
                        {formatCurrency(transaction.amount)}
                      </td>

                      <td>
                        <span
                          className={`method-badge ${getMethodBadgeClass(
                            transaction.method
                          )}`}
                        >
                          <span>{getMethodIcon(transaction.method)}</span>
                          {transaction.method}
                        </span>
                      </td>

                      <td>{formatDateTime(transaction.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default CashierHistory;