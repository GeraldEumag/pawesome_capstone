import React, { useState, useEffect } from "react";
import { inventoryApi } from "../../api/inventory";
import StockLogsViewer from "./StockLogsViewer";
import "./InventoryHistory_Polished.css";
import { showAlert } from "../../utils/alert";

const InventoryHistory = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("all");

  // Available action types for filter dropdown
  const actions = ["Stock In", "Stock Out", "Adjustment", "Restock"];

  // Calculate stats from history data
  const stats = {
    totalEvents: history.length,
    additions: history.filter(h => h.action?.toLowerCase().includes("in") || h.action?.toLowerCase().includes("add") || h.action?.toLowerCase().includes("restock")).length,
    removals: history.filter(h => h.action?.toLowerCase().includes("out") || h.action?.toLowerCase().includes("remove") || h.action?.toLowerCase().includes("sale")).length,
    adjustments: history.filter(h => h.action?.toLowerCase().includes("adjustment") || h.action?.toLowerCase().includes("correction")).length,
  };

  // Fetch history from API
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        const response = await inventoryApi.getStockHistory();
        const apiHistory = response.history || response.data || [];

        setHistory(apiHistory);
        setHistoryError("");
      } catch (err) {
        setHistory([]);
        setHistoryError(err.message || "Failed to load live stock history.");
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, []);

  return (
    <div className="inventory-history-page polished">
      {/* Header */}
      <div className="history-header">
        <div className="header-title">
          <h2>Stock Movement History</h2>
          <p>Track all inventory changes, restocks, and transactions</p>
          {historyError && <span className="demo-badge">No live records</span>}
        </div>
        <div className="header-actions">
          <button className="btn-export" onClick={() => showAlert("Export feature coming soon!")}>
            📥 Export
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="history-stats">
        <div className="stat-card total">
          <div className="stat-icon">📊</div>
          <div className="stat-info">
            <span className="stat-value">{stats.totalEvents}</span>
            <span className="stat-label">Total Events</span>
          </div>
        </div>
        <div className="stat-card additions">
          <div className="stat-icon">📥</div>
          <div className="stat-info">
            <span className="stat-value">{stats.additions}</span>
            <span className="stat-label">Stock In</span>
          </div>
        </div>
        <div className="stat-card removals">
          <div className="stat-icon">📤</div>
          <div className="stat-info">
            <span className="stat-value">{stats.removals}</span>
            <span className="stat-label">Stock Out</span>
          </div>
        </div>
        <div className="stat-card adjustments">
          <div className="stat-icon">⚖️</div>
          <div className="stat-info">
            <span className="stat-value">{stats.adjustments}</span>
            <span className="stat-label">Adjustments</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="history-filters">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search by product, user, or note..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)}>
            <option value="all">All Actions</option>
            {actions.map(action => (
              <option key={action} value={action}>{action}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="history-loading-card">
          <div className="spinner"></div>
          <p>Loading history...</p>
        </div>
      )}

      {/* Stock Logs Viewer */}
      {!loading && <StockLogsViewer search={search} filterAction={filterAction} />}
    </div>
  );
};

export default InventoryHistory;
