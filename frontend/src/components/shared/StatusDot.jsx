import React from "react";
import "./StatusDot.css";

const STATUS_MAP = {
  in_stock: { label: "In Stock", color: "#22c55e" },
  low_stock: { label: "Low Stock", color: "#f59e0b" },
  out_of_stock: { label: "Out of Stock", color: "#ef4444" },
  archived: { label: "Archived", color: "#94a3b8" },
  matched: { label: "Matched", color: "#22c55e" },
  discrepancy: { label: "Discrepancy", color: "#ef4444" },
  pending: { label: "Pending", color: "#94a3b8" },
  adjustment: { label: "Adjustment", color: "#f59e0b" },
  stock_in: { label: "Stock In", color: "#22c55e" },
  manual_adjustment: { label: "Adjustment", color: "#f59e0b" },
  initial: { label: "Initial", color: "#64748b" },
};

const SIZE_MAP = {
  sm: 6,
  md: 10,
  lg: 14,
};

const StatusDot = ({ status, size = "md", showLabel = true }) => {
  const normalized = String(status).toLowerCase().replace(/\s+/g, "_");
  const config = STATUS_MAP[normalized] || { label: status || "Unknown", color: "#94a3b8" };
  const dotSize = SIZE_MAP[size] || SIZE_MAP.md;

  return (
    <span className="status-dot-wrapper" title={config.label}>
      <span
        className="status-dot"
        style={{
          width: dotSize,
          height: dotSize,
          backgroundColor: config.color,
        }}
      />
      {showLabel && <span className="status-dot-label">{config.label}</span>}
    </span>
  );
};

export default StatusDot;
