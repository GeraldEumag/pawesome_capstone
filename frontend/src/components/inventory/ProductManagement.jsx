import React from "react";
import UnifiedInventory from "./UnifiedInventory";

/**
 * Product Management — catalog identity only.
 * Create/edit/archive product records (name, SKU, barcode, category,
 * brand, pricing, supplier, sellability). Stock quantities are read-only
 * here; all stock movement happens in Stock Management.
 */
const ProductManagement = () => <UnifiedInventory mode="products" />;

export default ProductManagement;
