import React from "react";
import UnifiedInventory from "./UnifiedInventory";

/**
 * Stock Management — physical quantity only.
 * Receive stock as batches, adjust/set stock with reasons, view batch
 * detail and movement history. Product identity fields are not editable
 * here; catalog changes happen in Product Management.
 */
const StockManagement = () => <UnifiedInventory mode="stock" />;

export default StockManagement;
