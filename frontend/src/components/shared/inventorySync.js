/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║           UNIFIED INVENTORY DATA - SINGLE SOURCE OF TRUTH        ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║  Used by: CashierPOS, InventoryReports, Admin                     ║
 * ║  Features: FIFO tracking, stock management, sync updates         ║
 * ║  Refresh: 30-second auto-refresh for live data                   ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  HOW TO ADD NEW INVENTORY ITEMS:                                │
 * │                                                                 │
 * │  1. Use the Inventory Management UI or API                   │
 * │  2. All data should come from the backend API                     │
 * │  3. This file now only contains utility functions             │
 * │  4. No hardcoded demo data for production safety              │
 * └─────────────────────────────────────────────────────────────────┘
 */

// Empty arrays - data should come from backend API
export const sharedProducts = [];
export const sharedServices = [];

// Categorize products (used by CashierPOS product grouping)
export const categorizeProducts = (products) => {
  const categories = {
    Food: [],
    Accessories: [],
    Grooming: [],
    Toys: [],
    Health: [],
    Services: []
  };
  
  products.forEach(product => {
    const cat = product.category;
    if (categories[cat]) {
      categories[cat].push(product);
    }
  });
  
  return categories;
};

export const sortByFIFO = (items) => {
  return [...items].sort((a, b) => new Date(a.receivedDate) - new Date(b.receivedDate));
};

export const getStockStatus = (item) => {
  if (item.stock === 0) return { label: "Out of Stock", color: "#ef4444", severity: "critical" };
  if (item.stock <= item.minStock) return { label: "Low Stock", color: "#f97316", severity: "warning" };
  return { label: "In Stock", color: "#22c55e", severity: "good" };
};

// Update stock across all dashboards (simulated - in production this would be API call)
export const updateStock = (itemId, quantityChange, allItems) => {
  return allItems.map(item => {
    if (item.id === itemId) {
      const newStock = Math.max(0, item.stock + quantityChange);
      return { 
        ...item, 
        stock: newStock, 
        inStock: newStock > 0,
        lastUpdated: new Date().toISOString()
      };
    }
    return item;
  });
};

// Get inventory summary for dashboard
export const getInventorySummary = (items) => {
  const total = items.length;
  const inStock = items.filter(i => i.stock > 0).length;
  const outOfStock = items.filter(i => i.stock === 0).length;
  const lowStock = items.filter(i => i.stock > 0 && i.stock <= i.minStock).length;
  
  return {
    total,
    inStock,
    outOfStock,
    lowStock
  };
};
