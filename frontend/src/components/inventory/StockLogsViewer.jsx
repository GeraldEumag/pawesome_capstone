import React, { useState, useEffect } from "react";
import { inventoryApi } from "../../api/inventory";
import { normalizeList } from "../../api/client";
import { generateInventoryAuditPdf } from "../../utils/inventoryAuditPdf";
import "./StockLogsViewer.css";
import DatePickerInput from "../shared/DatePickerInput";

const normalizeMovement = (log = {}) => ({
  id: log.id,
  itemName:
    log.item_name ||
    log.item_name_snapshot ||
    log.inventory_item?.name ||
    log.inventoryItem?.name ||
    log.product_name ||
    log.name ||
    `Item #${log.inventory_item_id || log.item_id || "?"}`,
  sku:
    log.item_sku ||
    log.item_sku_snapshot ||
    log.sku ||
    log.inventory_item?.sku ||
    log.inventoryItem?.sku ||
    "No SKU",
  movementType:
    log.movement_type ||
    log.action ||
    log.reference_type ||
    log.type ||
    "activity",
  quantityChange: Number(log.quantity_change ?? log.delta ?? log.quantity ?? 0),
  stockBefore: log.previous_stock ?? log.stock_before ?? log.quantity_before ?? "N/A",
  stockAfter: log.new_stock ?? log.stock_after ?? log.quantity_after ?? "N/A",
  reason: log.reason || "No reason provided",
  performedBy: log.user_name || log.user?.name || log.performed_by || "System",
  role: log.role || log.user?.role || "—",
  image: log.item_image || log.image || log.inventory_item?.image || log.inventoryItem?.image || null,
  createdAt: log.created_at,
  raw: log,
});

const getMovementLabel = (movementType) => {
  switch (movementType) {
    case "vet_usage":
      return "Veterinary Usage";
    case "grooming_usage":
      return "Grooming Usage";
    case "boarding_food_usage":
      return "Boarding Food Usage";
    case "boarding_supply_usage":
      return "Boarding Supply Usage";
    default:
      return String(movementType || "activity")
        .replaceAll("_", " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
};

const StockLogsViewer = ({ itemId = null, filterAction = null, search = null }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all, adjustment, sale, restock
  const [searchTerm, setSearchTerm] = useState("");
  const [dateRange, setDateRange] = useState({ start: "", end: "" });

  // Use external props if provided, otherwise use internal state
  const activeFilter = filterAction !== null ? filterAction.toLowerCase().replace(" ", "_") : filter;
  const activeSearch = search !== null ? search : searchTerm;

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      try {
        const params = itemId ? { itemId } : {};
        const response = await inventoryApi.getStockHistory(params);
        const logsData = normalizeList(response, ["logs", "history", "data"]);
        setLogs(logsData);
      } catch (err) {
        console.error("Failed to fetch stock logs:", err);
        setLogs([]);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [itemId]);

  const refreshLogs = async () => {
    setLoading(true);
    try {
      const params = itemId ? { itemId } : {};
      const response = await inventoryApi.getStockHistory(params);
      const logsData = normalizeList(response, ["logs", "history", "data"]);
      setLogs(logsData);
    } catch (err) {
      console.error("Failed to refresh stock logs:", err);
    } finally {
      setLoading(false);
    }
  };

  const getFilteredLogs = () => {
    return logs
      .map(normalizeMovement)
      .filter((log) => {
      // Filter by action type (use external prop if provided)
      const action = log.movementType;
      if (activeFilter !== "all" && action !== activeFilter) return false;

      // Filter by search term (use external prop if provided)
      if (activeSearch) {
        const searchLower = activeSearch.toLowerCase();
        const searchable = [
          log.itemName,
          log.sku,
          log.reason,
          log.performedBy,
          log.movementType,
          log.role,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!searchable.includes(searchLower)) return false;
      }

      // Filter by date range
      if (dateRange.start) {
        const logDate = new Date(log.created_at);
        const startDate = new Date(dateRange.start);
        if (logDate < startDate) return false;
      }
      if (dateRange.end) {
        const logDate = new Date(log.created_at);
        const endDate = new Date(dateRange.end);
        endDate.setHours(23, 59, 59);
        if (logDate > endDate) return false;
      }

      return true;
    });
  };

  const getActionLabel = (action) => {
    switch (action) {
      case "restock": return "Restock";
      case "sale": return "Sale";
      case "adjustment": return "Adjustment";
      case "remove": return "Removal";
      case "expired": return "Expired";
      default: return "Adjustment";
    }
  };

  const getActionColor = (action, quantityChange) => {
    if (quantityChange > 0) return "positive";
    if (quantityChange < 0) return "negative";
    return "neutral";
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const calculateStats = () => {
    const filtered = getFilteredLogs();
    const additions = filtered
      .filter((l) => l.quantityChange > 0)
      .reduce((sum, l) => sum + l.quantityChange, 0);
    const removals = filtered
      .filter((l) => l.quantityChange < 0)
      .reduce((sum, l) => sum + Math.abs(l.quantityChange), 0);
    const adjustments = filtered.filter((l) => (l.movementType || "").includes("adjustment")).length;

    return { additions, removals, adjustments, total: filtered.length };
  };

const getInitials = (name) =>
  String(name || "S")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const stats = calculateStats();
  const filteredLogs = getFilteredLogs();

  return (
    <div className="stock-logs-viewer">
      {/* Header with Stats */}
      <div className="logs-header">
        <div className="logs-title">
          <h3>Stock Activity Log</h3>
          <p>Track all inventory changes and adjustments</p>
        </div>
        <button className="btn-refresh" onClick={refreshLogs} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* Stats Cards */}
      <div className="logs-stats">
        <div className="stat-card additions">
          <span className="stat-icon">+</span>
          <div className="stat-info">
            <span className="stat-value">+{stats.additions}</span>
            <span className="stat-label">Stock Added</span>
          </div>
        </div>
        <div className="stat-card removals">
          <span className="stat-icon">-</span>
          <div className="stat-info">
            <span className="stat-value">-{stats.removals}</span>
            <span className="stat-label">Stock Removed</span>
          </div>
        </div>
        <div className="stat-card adjustments">
          <span className="stat-icon">~</span>
          <div className="stat-info">
            <span className="stat-value">{stats.adjustments}</span>
            <span className="stat-label">Adjustments</span>
          </div>
        </div>
        <div className="stat-card total">
          <span className="stat-icon">#</span>
          <div className="stat-info">
            <span className="stat-value">{stats.total}</span>
            <span className="stat-label">Total Entries</span>
          </div>
        </div>
      </div>

      {/* Analytics Panel */}
      <div className="logs-analytics">
        <h4>Activity Overview</h4>
        <div className="analytics-row">
          <div>
            <strong>Most Active Item:</strong>{" "}
            {filteredLogs[0]?.itemName || "N/A"}
          </div>
          <div>
            <strong>Top User:</strong>{" "}
            {
              Object.entries(
                filteredLogs.reduce((acc, log) => {
                  acc[log.performedBy || "System"] = (acc[log.performedBy || "System"] || 0) + 1;
                  return acc;
                }, {})
              ).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A"
            }
          </div>
          <div>
            <strong>Net Change:</strong>{" "}
            {stats.additions - stats.removals > 0 ? "+" : ""}
            {stats.additions - stats.removals}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="logs-filters">
        <div className="filter-group">
          <input
            type="text"
            placeholder="Search logs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filter-group">
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All Actions</option>
            <option value="restock">Restock</option>
            <option value="sale">Sale</option>
            <option value="adjustment">Adjustment</option>
            <option value="remove">Removal</option>
            <option value="expired">Expired</option>
          </select>
        </div>

        <div className="filter-group date-range">
          <DatePickerInput
            selected={dateRange.start ? new Date(dateRange.start) : null}
            onChange={(date) =>
              setDateRange((prev) => ({ ...prev, start: date ? date.toISOString().split("T")[0] : "" }))
            }
            placeholderText="From..."
          />
          <span>to</span>
          <DatePickerInput
            selected={dateRange.end ? new Date(dateRange.end) : null}
            onChange={(date) =>
              setDateRange((prev) => ({ ...prev, end: date ? date.toISOString().split("T")[0] : "" }))
            }
            placeholderText="To..."
          />
        </div>

        <button
          className="btn-clear-filters"
          onClick={() => {
            setFilter("all");
            setSearchTerm("");
            setDateRange({ start: "", end: "" });
          }}
        >
          Clear
        </button>

        <button
          className="btn-export"
          onClick={() => generateInventoryAuditPdf(filteredLogs)}
          disabled={filteredLogs.length === 0}
          title="Export audit report as PDF"
        >
          Export PDF
        </button>
      </div>

      {/* Logs List */}
      <div className="logs-list-container">
        {loading ? (
          <div className="logs-loading">
            <div className="spinner"></div>
            <p>Loading stock logs...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="logs-empty">
            <span className="empty-icon">-</span>
            <h4>No logs found</h4>
            <p>Try adjusting your filters or search criteria</p>
          </div>
        ) : (
          <div className="logs-list">
            {filteredLogs.map((log) => (
              <div key={log.id} className={`log-item ${log.movementType}`}>
              <div className="log-product-media">
                {log.image ? (
                  <img src={log.image} alt={log.itemName} />
                ) : (
                  <span>{getActionLabel(log.movementType)}</span>
                )}
              </div>

              <div className="log-content">
                <div className="log-header">
                  <div>
                    <span className="log-item-name">
                      {log.itemName}
                      <span className="audit-badge">AUDIT LOG</span>
                    </span>
                    <div className="log-sku">{log.sku}</div>
                  </div>

                  <span className="log-time">{formatDate(log.createdAt)}</span>
                </div>

                <div className="log-details">
                  <span className={`log-quantity ${getActionColor(log.movementType, log.quantityChange)}`}>
                    {log.quantityChange > 0 ? "+" : ""}
                    {log.quantityChange} units
                  </span>
                  <span className="log-arrow">→</span>
                  <span className="log-after">{log.stockBefore} to {log.stockAfter}</span>
                  <span className="log-action">{getMovementLabel(log.movementType)}</span>
                </div>

                <div className="log-bottom-row">
                  <div className="log-reason">
                    <span className="reason-label">Reason:</span>
                    <span className="reason-text">{log.reason}</span>
                  </div>

                  <div className="log-user-pill">
                    <span className="log-user-avatar">{getInitials(log.performedBy)}</span>
                    <span>{log.performedBy}</span>
                  </div>
                </div>
              </div>
            </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary Footer */}
      {filteredLogs.length > 0 && (
        <div className="logs-footer">
          <p>
            Showing <strong>{filteredLogs.length}</strong> of <strong>{logs.length}</strong>{" "}
            total entries
          </p>
        </div>
      )}
    </div>
  );
};

export default StockLogsViewer;
