import React, { useEffect, useState } from "react";
import { inventoryApi } from "../../api/inventory";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSync, faHistory, faSearch } from "@fortawesome/free-solid-svg-icons";
import "./InventoryAdjustmentHistory.css";

const InventoryAdjustmentHistory = () => {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    try {
      setLoading(true);

      const response = await inventoryApi.getStockHistory?.({ action: "adjustment" });

      const data = Array.isArray(response)
        ? response
        : response?.data || response?.logs || response?.history || [];

      setLogs(data);
    } catch (error) {
      console.error("Failed to load adjustment history:", error);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter((log) => {
    const type = log.type || log.adjustment_type || "adjustment";
    const product = log.product_name || log.name || "";
    const reason = log.reason || "";

    const matchesFilter = filter === "all" || type === filter;

    const matchesSearch =
      product.toLowerCase().includes(search.toLowerCase()) ||
      reason.toLowerCase().includes(search.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  const getTypeClass = (type) => {
    if (type === "add") return "add";
    if (type === "remove") return "remove";
    if (type === "set") return "set";
    return "default";
  };

  const getTypeLabel = (type) => {
    if (type === "add") return "Add";
    if (type === "remove") return "Remove";
    if (type === "set") return "Set";
    return "Adjustment";
  };

  return (
    <div className="inventory-history-page">
      <div className="history-header">
        <div>
          <span className="history-eyebrow">
            <FontAwesomeIcon icon={faHistory} /> Inventory Audit Trail
          </span>
          <h2>Stock Adjustment History</h2>
          <p>
            Track every stock movement, adjustment reason, and inventory update.
          </p>
        </div>

        <button className="history-refresh-btn" onClick={fetchLogs}>
          <FontAwesomeIcon icon={faSync} /> Refresh
        </button>
      </div>

      <div className="history-toolbar">
        <div className="search-wrapper">
          <FontAwesomeIcon icon={faSearch} className="search-icon" />
          <input
            type="text"
            placeholder="Search product or reason..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="history-filters">
          {["all", "add", "remove", "set"].map((item) => (
            <button
              key={item}
              className={filter === item ? "active" : ""}
              onClick={() => setFilter(item)}
            >
              {item === "all" ? "All Types" : item.charAt(0).toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="history-table-card">
        {loading ? (
          <div className="history-empty">
            <div className="loading-spinner"></div>
            <p>Loading adjustment history...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="history-empty">
            <div className="empty-icon">-</div>
            <h3>No adjustment records found</h3>
            <p>Try adjusting your search or filters</p>
          </div>
        ) : (
          <table className="history-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Product</th>
                <th>Type</th>
                <th>Quantity</th>
                <th>Previous</th>
                <th>New Stock</th>
                <th>Reason</th>
                <th>Updated By</th>
              </tr>
            </thead>

            <tbody>
              {filteredLogs.map((log, index) => {
                const type = log.type || log.adjustment_type || "adjustment";

                return (
                  <tr key={log.id || index} className="history-row">
                    <td className="date-cell">
                      {log.created_at
                        ? new Date(log.created_at).toLocaleString("en-PH", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "N/A"}
                    </td>

                    <td className="product-cell">
                      <strong>{log.product_name || log.name || "Unknown Product"}</strong>
                      <small>{log.sku || "No SKU"}</small>
                    </td>

                    <td className="type-cell">
                      <span className={`history-badge ${getTypeClass(type)}`}>
                        <span className="badge-icon">{getTypeLabel(type)}</span>
                      </span>
                    </td>

                    <td className="qty-cell">{log.quantity || log.adjustment_amount || 0}</td>

                    <td className="prev-cell">
                      <span className="stock-value prev">{log.previous_stock ?? "—"}</span>
                    </td>

                    <td className="new-cell">
                      <span className={`stock-value new ${(log.new_stock || 0) <= 10 ? "low" : ""}`}>
                        {log.new_stock ?? "—"}
                      </span>
                    </td>

                    <td className="reason-cell">{log.reason || "No reason provided"}</td>

                    <td className="user-cell">
                      <span className="user-badge">{log.updated_by || log.user_name || "System"}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default InventoryAdjustmentHistory;
