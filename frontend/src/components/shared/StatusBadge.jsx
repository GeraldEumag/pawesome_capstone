import React from "react";
import "./StatusBadge.css";

const VARIANTS = ["success", "warning", "danger", "info", "neutral", "primary"];

/**
 * Canonical status pill. Replaces the 28 scattered `.status-badge`
 * definitions — always use this instead of hand-rolled badge markup.
 *
 *   <StatusBadge variant="success">In Stock</StatusBadge>
 */
const StatusBadge = ({ variant = "neutral", children, className = "" }) => {
  const v = VARIANTS.includes(variant) ? variant : "neutral";
  return (
    <span className={`pw-badge pw-badge--${v} ${className}`.trim()}>
      {children}
    </span>
  );
};

export default StatusBadge;
