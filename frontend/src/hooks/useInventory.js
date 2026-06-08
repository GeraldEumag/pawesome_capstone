import { useState, useEffect, useCallback } from 'react';
import { inventoryApi } from '../api/inventory.jsx';

/**
 * UNIFIED INVENTORY HOOK
 * 
 * This hook provides live-capable inventory data to all dashboards:
 * - Admin Dashboard
 * - Inventory Reports  
 * - Cashier POS
 * - Customer Store
 * 
 * Features:
 * - Auto-refresh every 30 seconds for live updates
 * - Empty/error states when live API data is unavailable
 * - Stock synchronization across all dashboards
 * 
 */

export const useInventory = (options = {}) => {
  const { 
    autoRefresh = true,      // Auto-refresh every 30s
    refreshInterval = 30000, // 30 seconds
    includeServices = true  // Include services in results
  } = options;

  const [items, setItems] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [usingDemoData] = useState(false);

  // Transform API items to unified format
  const transformApiItem = (item) => ({
    id: item.id || item.sku,
    name: item.name,
    price: item.price,
    category: item.category || 'Uncategorized',
    inStock: (item.quantity || item.stock || 0) > 0,
    stock: item.quantity || item.stock || 0,
    quantity: item.quantity || item.stock || 0,
    minStock: item.minStock || item.reorder_level || 10,
    sku: item.sku,
    description: item.description || '',
    image: item.image || '📦',
    rating: item.rating || 4.0,
    reviews: item.reviews || 0,
    discount: item.discount || 0,
    brand: item.brand || 'Unknown',
    supplier: item.supplier || 'Unknown',
    receivedDate: item.receivedDate || new Date().toISOString().split('T')[0],
    batchNumber: item.batchNumber || 'N/A',
    location: item.location || 'N/A',
    status: item.status || ((item.quantity || item.stock || 0) > 10 ? 'In stock' : (item.quantity || item.stock || 0) > 0 ? 'Low stock' : 'Out of stock')
  });

  // Fetch inventory data
  const fetchInventory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await inventoryApi.getItems();
      const apiItems = response.items || response.data || [];
      
      if (apiItems.length > 0) {
        // Transform API data to unified format
        const transformedItems = apiItems.map(transformApiItem);
        
        // Separate products and services
        const products = transformedItems.filter(item => 
          item.category?.toLowerCase() !== 'service' && 
          item.category?.toLowerCase() !== 'services'
        );
        const serviceItems = transformedItems.filter(item => 
          item.category?.toLowerCase() === 'service' || 
          item.category?.toLowerCase() === 'services'
        );
        
        setItems(products);
        setServices(serviceItems);
      } else {
        setItems([]);
        setServices([]);
      }
    } catch (err) {
      setError(err.message);
      setItems([]);
      setServices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch and auto-refresh
  useEffect(() => {
    fetchInventory();
    
    if (autoRefresh) {
      const interval = setInterval(fetchInventory, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchInventory, autoRefresh, refreshInterval]);

  // Get all items (products + services)
  const allItems = includeServices ? [...items, ...services] : items;

  // Get items by category
  const getItemsByCategory = (category) => {
    if (category === 'all' || category === 'All') return allItems;
    return allItems.filter(item => 
      item.category?.toLowerCase() === category.toLowerCase()
    );
  };

  // Search items
  const searchItems = (query) => {
    if (!query) return allItems;
    const lowerQuery = query.toLowerCase();
    return allItems.filter(item => 
      item.name?.toLowerCase().includes(lowerQuery) ||
      item.sku?.toLowerCase().includes(lowerQuery) ||
      item.brand?.toLowerCase().includes(lowerQuery) ||
      item.description?.toLowerCase().includes(lowerQuery)
    );
  };

  // Get stock status
  const getStockStatus = (item) => {
    const stock = item.stock || item.quantity || 0;
    const minStock = item.minStock || 10;
    
    if (stock === 0) return { label: 'Out of Stock', color: '#ef4444', severity: 'critical' };
    if (stock <= minStock) return { label: 'Low Stock', color: '#f97316', severity: 'warning' };
    return { label: 'In Stock', color: '#22c55e', severity: 'good' };
  };

  // Get low stock items
  const lowStockItems = items.filter(item => {
    const stock = item.stock || item.quantity || 0;
    const minStock = item.minStock || 10;
    return stock > 0 && stock <= minStock;
  });

  // Get out of stock items
  const outOfStockItems = items.filter(item => (item.stock || item.quantity || 0) === 0);

  // Refresh function (manual)
  const refresh = () => fetchInventory();

  return {
    // Data
    items,
    services,
    allItems,
    
    // Status
    loading,
    error,
    usingDemoData,
    
    // Computed
    lowStockItems,
    outOfStockItems,
    
    // Helpers
    getItemsByCategory,
    searchItems,
    getStockStatus,
    refresh
  };
};

export default useInventory;
