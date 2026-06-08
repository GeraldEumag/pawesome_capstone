/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║           REAL-TIME INVENTORY SYNC SERVICE                         ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║  Purpose: Synchronize inventory data across POS, CustomerStore,     ║
 * ║  and Admin panels in real-time                                    ║
 * ║  Features:                                                        ║
 * ║  - Single source of truth from /inventory/sellable API           ║
 * ║  - Real-time stock updates                                         ║
 * ║  - Event-driven updates across components                          ║
 * ║  - Automatic refresh every 30 seconds                             ║
 * ║  - Returns empty inventory when API is unavailable               ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import { inventoryApi } from '../api/inventory.jsx';
import { normalizeList } from '../api/client';
import { categorizeProducts } from '../components/shared/inventorySync';

// Event system for real-time updates
class InventoryEventEmitter {
  constructor() {
    this.listeners = new Map();
  }

  // Subscribe to inventory events
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  // Unsubscribe from inventory events
  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  // Emit inventory events
  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in inventory event listener for ${event}:`, error);
        }
      });
    }
  }
}

// Global event emitter instance
const eventEmitter = new InventoryEventEmitter();

// Inventory sync service
class InventorySyncService {
  constructor() {
    this.cache = new Map();
    this.lastFetch = 0;
    this.refreshInterval = 30000; // 30 seconds
    this.isRefreshing = false;
    this.subscribers = new Set();
    this.fallbackData = categorizeProducts([]);
  }

  // Subscribe to inventory updates
  subscribe(componentId, callback) {
    const subscriber = { componentId, callback };
    this.subscribers.add(subscriber);
    
    // Notify immediately with current data
    if (this.cache.has('products')) {
      callback(this.cache.get('products'));
    }

    // Return unsubscribe function
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  // Normalize product data from API
  normalizeProduct(product, index) {
    // Safer stock extraction that handles multiple field names
    const stockValue =
      product.available_stock ??
      product.stock_quantity ??
      product.stock ??
      product.quantity ??
      product.current_stock ??
      0;

    return {
      id: product.id || product.product_id || product.item_id || index + 1,
      name: product.name || product.product_name || product.item_name || "Unnamed Product",
      price: Number(product.price || product.selling_price || product.unit_price || 0),
      stock: Number(stockValue) || 0,
      category: product.category || product.product_category || product.type || "Food",
      inStock: Number(stockValue) > 0,
      sku: product.sku || product.barcode || product.item_code || "",
      description: product.description || "",
      image: product.photo_url || product.image || this.getProductEmoji(product.name || ""),
      rating: 4.5,
      reviews: Math.floor(Math.random() * 200) + 50,
      discount: Number(product.discount || product.discount_percent || 0),
      brand: product.brand || "",
      supplier: product.supplier || "",
      receivedDate: product.received_date || product.receivedDate || new Date().toISOString(),
      batchNumber: product.batch_number || product.batchNumber || "",
      location: product.location || "",
      minStock: product.min_stock || product.minStock || 5,
    };
  }

  // Get product emoji based on name
  getProductEmoji(productName) {
    const name = (productName || "").toLowerCase();
    if (name.includes("food") || name.includes("treat") || name.includes("bone")) return "🦴";
    if (name.includes("toy") || name.includes("ball") || name.includes("chew")) return "⚽";
    if (name.includes("collar") || name.includes("leash")) return "🦮";
    if (name.includes("bed") || name.includes("house")) return "🏠";
    if (name.includes("shampoo") || name.includes("groom")) return "🧴";
    if (name.includes("brush") || name.includes("comb")) return "🪮";
    if (name.includes("vitamin") || name.includes("medicine") || name.includes("health")) return "💊";
    if (name.includes("service") || name.includes("grooming")) return "✂️";
    if (name.includes("boarding") || name.includes("hotel")) return "🏨";
    return "🐾";
  }

  // Fetch products from API
  async fetchProducts() {
    if (this.isRefreshing) {
      return this.cache.get('products') || this.fallbackData;
    }

    try {
      this.isRefreshing = true;
      const role = String((await import("../utils/auth")).getRole() || "").toLowerCase();
      const response =
        role === "cashier"
          ? await inventoryApi.getCashierSellableItems()
          : await inventoryApi.getSellableItems();
      const rawProducts = normalizeList(response, ['products', 'items', 'data']);

      if (rawProducts.length > 0) {
        // Normalize and categorize products
        const normalizedProducts = rawProducts.map((product, index) => 
          this.normalizeProduct(product, index)
        );
        
        const categorizedData = categorizeProducts(normalizedProducts);
        
        // Update cache
        this.cache.set('products', categorizedData);
        this.cache.set('rawProducts', normalizedProducts);
        this.lastFetch = Date.now();

        // Notify all subscribers
        this.notifySubscribers(categorizedData);
        
        // Emit global events
        eventEmitter.emit('productsUpdated', categorizedData);
        eventEmitter.emit('stockChanged', normalizedProducts);

        return categorizedData;
      } else {
        const emptyData = categorizeProducts([]);
        this.cache.set('products', emptyData);
        this.cache.set('rawProducts', []);
        this.notifySubscribers(emptyData);
        return emptyData;
      }
    } catch (error) {
      console.error("InventorySync: Failed to fetch products:", error);
      const emptyData = categorizeProducts([]);
      this.cache.set('products', emptyData);
      this.cache.set('rawProducts', []);
      this.notifySubscribers(emptyData);
      return emptyData;
    } finally {
      this.isRefreshing = false;
    }
  }

  // Notify all subscribers
  notifySubscribers(data) {
    this.subscribers.forEach(subscriber => {
      try {
        subscriber.callback(data);
      } catch (error) {
        console.error(`Error notifying subscriber ${subscriber.componentId}:`, error);
      }
    });
  }

  // Get cached products or fetch if needed
  async getProducts(forceRefresh = false) {
    const cached = this.cache.get('products');
    const now = Date.now();
    
    // Return cached data if still fresh
    if (!forceRefresh && cached && (now - this.lastFetch) < this.refreshInterval) {
      return cached;
    }
    
    // Fetch fresh data
    return await this.fetchProducts();
  }

  // Get raw products (non-categorized)
  async getRawProducts() {
    const cached = this.cache.get('rawProducts');
    if (cached) {
      return cached;
    }
    
    await this.fetchProducts();
    return this.cache.get('rawProducts') || [];
  }

  // Update stock for a specific product (for real-time updates)
  updateStock(productId, newStock, reason = "Sale") {
    const rawProducts = this.cache.get('rawProducts') || [];
    const productIndex = rawProducts.findIndex(p => p.id === productId);
    
    if (productIndex !== -1) {
      const oldStock = rawProducts[productIndex].stock;
      rawProducts[productIndex].stock = newStock;
      rawProducts[productIndex].inStock = newStock > 0;
      
      // Re-categorize products
      const categorizedData = categorizeProducts(rawProducts);
      
      // Update cache
      this.cache.set('products', categorizedData);
      this.cache.set('rawProducts', rawProducts);
      
      // Notify subscribers
      this.notifySubscribers(categorizedData);
      
      // Emit stock change event
      eventEmitter.emit('stockChanged', [{
        ...rawProducts[productIndex],
        oldStock,
        newStock,
        reason,
        timestamp: new Date().toISOString()
      }]);
      
      // Stock updated
    }
  }

  // Start automatic refresh
  startAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    
    this.refreshTimer = setInterval(() => {
      this.fetchProducts();
    }, this.refreshInterval);
    
    // Auto-refresh started
  }

  // Stop automatic refresh
  stopAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
      // Auto-refresh stopped
    }
  }

  // Get sync status
  getStatus() {
    return {
      isRefreshing: this.isRefreshing,
      lastFetch: this.lastFetch,
      subscriberCount: this.subscribers.size,
      hasCachedData: this.cache.has('products'),
      usingFallback: this.cache.get('products') === this.fallbackData
    };
  }

  // Clear cache
  clearCache() {
    this.cache.clear();
    // Cache cleared
  }
}

// Create singleton instance
const inventorySync = new InventorySyncService();

// Start auto-refresh when service is imported
inventorySync.startAutoRefresh();

// Export service and event emitter
export { inventorySync, eventEmitter };
export default inventorySync;
