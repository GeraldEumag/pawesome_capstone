import React, { useState, useEffect, useCallback, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import StatusDot from "../shared/StatusDot";
import {
  faPlus, faEdit, faSearch, faBox,
  faSync, faArchive, faImage,
  faWarehouse, faBoxes, faBell, faSort, faSortUp, faSortDown,
  faChevronDown, faChevronUp, faDownload, faHistory, faInfoCircle,
  faSlidersH, faAdjust,
} from "@fortawesome/free-solid-svg-icons";
import { inventoryApi } from "../../api/inventory";
import { normalizeList } from "../../api/client";
import AddProductModal from "./AddProductModal";
import StockAdjustmentModal from "./StockAdjustmentModal";
import PremiumToast from "../shared/PremiumToast";
import DeleteConfirmModal from "../shared/DeleteConfirmModal";
import "./UnifiedInventory.css";

const CATEGORIES = [
  { value: "Food", label: "Food" },
  { value: "Accessories", label: "Accessories" },
  { value: "Grooming", label: "Grooming" },
  { value: "Toys", label: "Toys" },
  { value: "Health", label: "Health" },
  { value: "Services", label: "Services" },
];

const UnifiedInventory = () => {
  // Data
  const [items, setItems] = useState([]);
  const [archivedItems, setArchivedItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  // Tabs
  const [activeTab, setActiveTab] = useState("active");

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  // Sorting
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Bulk select
  const [selectedItems, setSelectedItems] = useState([]);

  // Batches (expandable rows)
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [itemBatches, setItemBatches] = useState({});
  const [loadingBatches, setLoadingBatches] = useState({});

  // Stats
  const [stats, setStats] = useState({ totalItems: 0, lowStock: 0, outOfStock: 0 });

  // Activity logs
  const [activityLogs, setActivityLogs] = useState([]);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [viewPhotoUrl, setViewPhotoUrl] = useState(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [infoItem, setInfoItem] = useState(null);
  const [adjustItem, setAdjustItem] = useState(null);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState({ open: false, item: null, loading: false });

  // Toast
  const [toast, setToast] = useState({ show: false, type: "success", title: "", message: "" });

  // Reorder suggestions
  const [reorderSuggestions, setReorderSuggestions] = useState([]);

  // ---- Fetch data ----
  const fetchInventory = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [itemsRes, archivedRes] = await Promise.all([
        inventoryApi.getItems(),
        inventoryApi.getArchivedItems().catch(() => []),
      ]);
      const fetchedItems = normalizeList(itemsRes, ["items", "inventory", "data"]);
      const fetchedArchived = normalizeList(archivedRes, ["archived", "items", "data"]);

      setItems(fetchedItems);
      setArchivedItems(fetchedArchived);
      setLastUpdated(new Date());

      // Compute stats from actual items (primary source of truth)
      const computedTotal = fetchedItems.length;
      const computedLow = fetchedItems.filter((it) => {
        const stock = Number(it.stock ?? it.quantity ?? it.stock_quantity ?? 0);
        const min = Number(it.reorder_level ?? it.min_stock_level ?? it.minStock ?? 10);
        return stock > 0 && stock <= min;
      }).length;
      const computedOut = fetchedItems.filter((it) => {
        const stock = Number(it.stock ?? it.quantity ?? it.stock_quantity ?? 0);
        return stock === 0;
      }).length;

      setStats({
        totalItems: computedTotal,
        lowStock: computedLow,
        outOfStock: computedOut,
      });

      // Compute reorder suggestions
      const suggestions = fetchedItems
        .filter((it) => {
          const qty = Number(it.quantity || it.stock || it.stock_quantity || 0);
          const reorderLevel = Number(it.reorder_level || it.minStock || 10);
          return qty <= reorderLevel;
        })
        .map((it) => {
          const qty = Number(it.quantity || it.stock || it.stock_quantity || 0);
          const reorderLevel = Number(it.reorder_level || it.minStock || 10);
          const suggestedQty = Math.max(reorderLevel * 2 - qty, reorderLevel);
          let priority = "low";
          if (qty === 0) priority = "critical";
          else if (qty <= reorderLevel / 2) priority = "high";
          return { ...it, quantity: qty, reorder_level: reorderLevel, suggestedQty, priority };
        })
        .sort((a, b) => {
          const order = { critical: 1, high: 2, low: 3 };
          return order[a.priority] - order[b.priority];
        });
      setReorderSuggestions(suggestions);
    } catch (err) {
      setError(err.message);
      setItems([]);
      setArchivedItems([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInventory();
    const interval = setInterval(() => fetchInventory(true), 30000);
    return () => clearInterval(interval);
  }, [fetchInventory]);

  // ---- Helpers ----
  const getStock = (item) => {
    const val = item?.stock ?? item?.quantity ?? item?.stock_quantity ?? 0;
    return isNaN(Number(val)) ? 0 : Number(val);
  };

  const getMinStock = (item) => item?.reorder_level ?? item?.min_stock_level ?? item?.minStock ?? 10;

  const getStatus = useCallback((item) => {
    const stock = getStock(item);
    const min = getMinStock(item);
    if (stock === 0) return "Out of stock";
    if (stock <= min) return "Low stock";
    return "In stock";
  }, []);

  const getStatusBadgeClass = (item) => {
    const status = getStatus(item);
    if (status === "Out of stock") return "danger";
    if (status === "Low stock") return "warning";
    return "success";
  };

  const uniqueValues = (key) => [...new Set(items.map((i) => i[key]).filter(Boolean))];

  // ---- Filtering ----
  const currentItems = activeTab === "active" ? items : archivedItems;

  const filteredItems = useMemo(() => {
    let result = currentItems;

    const q = searchTerm.trim().toLowerCase();
    if (q) {
      result = result.filter((it) =>
        [it.name, it.sku, it.brand, it.supplier, it.category].some((v) =>
          (v || "").toLowerCase().includes(q)
        )
      );
    }

    if (categoryFilter !== "all") result = result.filter((it) => it.category === categoryFilter);
    if (brandFilter !== "all") result = result.filter((it) => it.brand === brandFilter);
    if (supplierFilter !== "all") result = result.filter((it) => it.supplier === supplierFilter);

    if (activeTab !== "archived" && statusFilter !== "all") {
      result = result.filter((it) => {
        const status = getStatus(it);
        if (statusFilter === "in_stock") return status === "In stock";
        if (statusFilter === "low_stock") return status === "Low stock";
        if (statusFilter === "out_of_stock") return status === "Out of stock";
        return true;
      });
    }

    if (sortConfig.key) {
      result = [...result].sort((a, b) => {
        const aVal = a[sortConfig.key] ?? "";
        const bVal = b[sortConfig.key] ?? "";
        if (typeof aVal === "number" && typeof bVal === "number") {
          return sortConfig.direction === "asc" ? aVal - bVal : bVal - aVal;
        }
        const cmp = String(aVal).localeCompare(String(bVal));
        return sortConfig.direction === "asc" ? cmp : -cmp;
      });
    }

    return result;
  }, [currentItems, searchTerm, categoryFilter, brandFilter, supplierFilter, statusFilter, activeTab, sortConfig, getStatus]);

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage) || 1;
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredItems.slice(start, start + itemsPerPage);
  }, [filteredItems, currentPage]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, categoryFilter, brandFilter, supplierFilter, statusFilter, activeTab, sortConfig]);

  // ---- Sorting ----
  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const renderSortIcon = (key) => {
    if (sortConfig.key !== key) return <FontAwesomeIcon icon={faSort} className="sort-icon" />;
    return sortConfig.direction === "asc" ? <FontAwesomeIcon icon={faSortUp} className="sort-icon active" /> : <FontAwesomeIcon icon={faSortDown} className="sort-icon active" />;
  };

  // ---- Bulk select ----
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedItems(paginatedItems.map((it) => it.id));
    } else {
      setSelectedItems([]);
    }
  };

  const handleSelectItem = (id) => {
    setSelectedItems((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  // ---- Batches ----
  const toggleExpand = async (itemId) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
        return next;
      }
      next.add(itemId);
      return next;
    });

    if (!itemBatches[itemId]) {
      setLoadingBatches((prev) => ({ ...prev, [itemId]: true }));
      try {
        const res = await inventoryApi.getItemBatches(itemId);
        if (res.success) {
          setItemBatches((prev) => ({ ...prev, [itemId]: res.batches || [] }));
        }
      } catch (err) {
        console.error("Failed to fetch batches:", err);
      } finally {
        setLoadingBatches((prev) => ({ ...prev, [itemId]: false }));
      }
    }
  };

  // ---- CRUD ----
  const handleAddNew = () => { setEditingItem(null); setShowAddModal(true); };

  const handleEdit = (item) => { setEditingItem(item); setShowAddModal(true); };

  const handleSaveSuccess = async () => {
    setShowAddModal(false);
    setEditingItem(null);
    await fetchInventory(true);
    showToast("success", "Saved", "Item saved successfully.");
    addActivityLog("update", `${editingItem ? "Updated" : "Created"} item.`);
  };

  const handleArchive = (item) => {
    const stock = getStock(item);
    if (stock > 0) {
      showToast("error", "Cannot Archive", `"${item.name}" has ${stock} units in stock. Adjust to 0 first.`);
      return;
    }
    setDeleteModal({ open: true, item, loading: false });
  };

  const confirmArchive = async (reason) => {
    setDeleteModal((prev) => ({ ...prev, loading: true }));
    try {
      await inventoryApi.archiveItem(deleteModal.item.id, reason);
      await fetchInventory(true);
      setDeleteModal({ open: false, item: null, loading: false });
      showToast("success", "Archived", "Item archived successfully.");
      addActivityLog("archive", `Archived "${deleteModal.item.name}". Reason: ${reason}`);
    } catch (err) {
      setDeleteModal((prev) => ({ ...prev, loading: false }));
      showToast("error", "Archive Failed", err.message);
    }
  };

  const handleUnarchive = async (id) => {
    try {
      await inventoryApi.restoreItem(id);
      await fetchInventory(true);
      showToast("success", "Unarchived", "Item restored to active inventory.");
    } catch (err) {
      showToast("error", "Unarchive Failed", err.message);
    }
  };

  const handleBulkArchive = async () => {
    const validIds = selectedItems.filter((id) => {
      const item = items.find((it) => it.id === id);
      return item && getStock(item) === 0;
    });
    if (validIds.length === 0) {
      showToast("error", "Cannot Archive", "Selected items have stock. Adjust to 0 first.");
      return;
    }
    try {
      await Promise.all(validIds.map((id) => inventoryApi.archiveItem(id, "Bulk archive via unified inventory")));
      setSelectedItems([]);
      await fetchInventory(true);
      showToast("success", "Bulk Archived", `${validIds.length} items archived.`);
    } catch (err) {
      showToast("error", "Bulk Archive Failed", err.message);
    }
  };

  // ---- Adjust stock ----
  const handleAdjust = (item) => { setAdjustItem(item); setShowAdjustModal(true); };

  const handleAdjustSuccess = async () => {
    setShowAdjustModal(false);
    setAdjustItem(null);
    await fetchInventory(true);
    showToast("success", "Stock Adjusted", "Stock updated successfully.");
  };

  // ---- View info ----
  const handleViewInfo = (item) => { setInfoItem(item); setShowInfoModal(true); };

  // ---- Export CSV ----
  const exportToCSV = () => {
    const headers = ["Name", "SKU", "Category", "Brand", "Supplier", "Stock", "Price", "Cost", "Status"];
    const rows = filteredItems.map((it) => [
      it.name, it.sku, it.category, it.brand, it.supplier,
      getStock(it), it.price, it.cost ?? "", getStatus(it),
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inventory.csv";
    a.click();
  };

  // ---- Reorder ----
  const handleAutoReorder = async (item) => {
    try {
      await inventoryApi.createReorderRequest({
        item_id: item.id,
        item_name: item.name,
        sku: item.sku,
        suggested_quantity: item.suggestedQty,
        current_stock: item.quantity,
        reorder_level: item.reorder_level,
        priority: item.priority,
        status: "pending",
      });
      showToast("success", "Reorder Requested", `${item.name} added to reorder requests.`);
    } catch (err) {
      showToast("error", "Reorder Failed", err.message);
    }
  };

  // ---- Activity log ----
  const addActivityLog = (type, message) => {
    setActivityLogs((prev) => [{ id: Date.now(), type, message, time: new Date().toLocaleString() }, ...prev].slice(0, 5));
  };

  const showToast = (type, title, message) => setToast({ show: true, type, title, message });

  // ---- Render ----
  const alertCount = stats.lowStock + stats.outOfStock;

  return (
    <div className="unified-inventory">
      {/* Header */}
      <div className="ui-header">
        <div className="ui-header-left">
          <h1><FontAwesomeIcon icon={faWarehouse} /> Unified Inventory</h1>
          {alertCount > 0 && (
            <span className="stock-alert-badge">
              <FontAwesomeIcon icon={faBell} /> {alertCount} alert{alertCount > 1 ? "s" : ""}
            </span>
          )}
          {error && <span className="demo-badge">No live records</span>}
        </div>
        <div className="ui-header-actions">
          <button className="btn btn-secondary" onClick={exportToCSV}>
            <FontAwesomeIcon icon={faDownload} /> Export CSV
          </button>
          <button className="btn btn-primary" onClick={handleAddNew}>
            <FontAwesomeIcon icon={faPlus} /> Add New Item
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="ui-stats-grid">
        <div className="ui-stat-card total">
          <div className="ui-stat-icon"><FontAwesomeIcon icon={faBoxes} /></div>
          <div className="ui-stat-info">
            <span className="ui-stat-value">{stats.totalItems}</span>
            <span className="ui-stat-label">Total Items</span>
          </div>
        </div>
        <div className="ui-stat-card low">
          <div className="ui-stat-icon"><FontAwesomeIcon icon={faBell} /></div>
          <div className="ui-stat-info">
            <span className="ui-stat-value">{stats.lowStock}</span>
            <span className="ui-stat-label">Low Stock</span>
          </div>
        </div>
        <div className="ui-stat-card out">
          <div className="ui-stat-icon"><FontAwesomeIcon icon={faBox} /></div>
          <div className="ui-stat-info">
            <span className="ui-stat-value">{stats.outOfStock}</span>
            <span className="ui-stat-label">Out of Stock</span>
          </div>
        </div>
      </div>

      {/* Critical banner */}
      {stats.outOfStock > 0 && (
        <div className="ui-critical-banner">
          <strong>!</strong> <strong>{stats.outOfStock}</strong> items are OUT OF STOCK — Immediate attention required!
        </div>
      )}

      {/* Reorder suggestions */}
      {reorderSuggestions.length > 0 && activeTab === "active" && (
        <div className="ui-reorder-panel">
          <div className="ui-reorder-header">
            <div>
              <h3><FontAwesomeIcon icon={faBell} /> Smart Reorder Suggestions</h3>
              <p>System-generated stock recommendations based on reorder level.</p>
            </div>
            <span className="ui-reorder-count">{reorderSuggestions.length} alert{reorderSuggestions.length > 1 ? "s" : ""}</span>
          </div>
          <div className="ui-reorder-list">
            {reorderSuggestions.slice(0, 5).map((item) => (
              <div key={item.id} className={`ui-reorder-item ${item.priority}`}>
                <div className="ui-reorder-info">
                  <strong>{item.name}</strong>
                  <p>Current: {item.quantity} • Reorder at: {item.reorder_level} • Suggested: {item.suggestedQty}</p>
                </div>
                <div className="ui-reorder-actions">
                  <span className={`ui-priority ${item.priority}`}>{item.priority}</span>
                  <button className="btn btn-sm btn-reorder" onClick={() => handleAutoReorder(item)}>
                    Create Request
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="ui-tabs">
        <button className={`ui-tab ${activeTab === "active" ? "active" : ""}`} onClick={() => setActiveTab("active")}>
          <FontAwesomeIcon icon={faBox} /> Active Items ({items.length})
        </button>
        <button className={`ui-tab ${activeTab === "archived" ? "active" : ""}`} onClick={() => setActiveTab("archived")}>
          <FontAwesomeIcon icon={faArchive} /> Archived ({archivedItems.length})
        </button>
      </div>

      {/* Filters */}
      <div className="ui-filters-bar">
        <div className="ui-search-box">
          <FontAwesomeIcon icon={faSearch} />
          <input type="text" placeholder="Search by name, SKU, brand..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <div className="ui-filter-actions">
          <button className={`btn btn-filter ${showFilters ? "active" : ""}`} onClick={() => setShowFilters(!showFilters)}>
            <FontAwesomeIcon icon={faSlidersH} /> Filters
          </button>
          <button className="btn btn-refresh" onClick={() => fetchInventory()} title="Refresh">
            <FontAwesomeIcon icon={faSync} />
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="ui-filters-panel">
          <div className="ui-filter-group">
            <label>Category</label>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="all">All</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
              ))}
            </select>
          </div>
          {activeTab !== "archived" && (
            <div className="ui-filter-group">
              <label>Status</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All</option>
                <option value="in_stock">In Stock</option>
                <option value="low_stock">Low Stock</option>
                <option value="out_of_stock">Out of Stock</option>
              </select>
            </div>
          )}
          <div className="ui-filter-group">
            <label>Brand</label>
            <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}>
              <option value="all">All</option>
              {uniqueValues("brand").map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div className="ui-filter-group">
            <label>Supplier</label>
            <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}>
              <option value="all">All</option>
              {uniqueValues("supplier").map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <button className="btn btn-clear" onClick={() => { setCategoryFilter("all"); setStatusFilter("all"); setBrandFilter("all"); setSupplierFilter("all"); }}>
            Clear All
          </button>
        </div>
      )}

      {/* Bulk actions */}
      {selectedItems.length > 0 && activeTab === "active" && (
        <div className="ui-bulk-bar">
          <span>{selectedItems.length} selected</span>
          <button className="btn btn-danger" onClick={handleBulkArchive}>
            <FontAwesomeIcon icon={faArchive} /> Archive Selected
          </button>
        </div>
      )}

      {/* Realtime indicator */}
      <div className="ui-realtime">
        <span className="live-dot"></span>
        Live updates • Last synced: {lastUpdated.toLocaleTimeString()}
      </div>

      {/* Table */}
      <div className="ui-table-wrapper">
        {loading && items.length === 0 ? (
          <div className="ui-loading">Loading inventory...</div>
        ) : error && items.length === 0 ? (
          <div className="ui-error"><p>Failed to load: {error}</p><button onClick={() => fetchInventory()}>Retry</button></div>
        ) : (
          <table className="ui-table">
            <thead>
              <tr>
                {activeTab === "active" && (
                  <th className="checkbox-col">
                    <input type="checkbox" checked={selectedItems.length === paginatedItems.length && paginatedItems.length > 0} onChange={handleSelectAll} />
                  </th>
                )}
                <th className="sortable" onClick={() => handleSort("sku")}>SKU {renderSortIcon("sku")}</th>
                <th className="sortable" onClick={() => handleSort("name")}>Product {renderSortIcon("name")}</th>
                <th className="sortable" onClick={() => handleSort("category")}>Category {renderSortIcon("category")}</th>
                <th className="sortable" onClick={() => handleSort("brand")}>Brand {renderSortIcon("brand")}</th>
                <th className="sortable" onClick={() => handleSort("supplier")}>Supplier {renderSortIcon("supplier")}</th>
                <th className="sortable numeric" onClick={() => handleSort("stock")}>Stock {renderSortIcon("stock")}</th>
                <th className="sortable numeric" onClick={() => handleSort("price")}>Price {renderSortIcon("price")}</th>
                <th>Cost</th>
                <th>Status</th>
                <th className="actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((item) => (
                <React.Fragment key={item.id}>
                  <tr className={`${getStock(item) === 0 ? "out-of-stock-row" : ""} ${selectedItems.includes(item.id) ? "selected" : ""}`}>
                    {activeTab === "active" && (
                      <td className="checkbox-col">
                        <input type="checkbox" checked={selectedItems.includes(item.id)} onChange={() => handleSelectItem(item.id)} />
                      </td>
                    )}
                    <td className="sku-cell">{item.sku || "—"}</td>
                    <td className="name-cell">
                      <div className="product-name">{item.name}</div>
                      <div className="product-brand">{item.brand}</div>
                    </td>
                    <td>
                      <span className="category-badge">
                        {item.category || "—"}
                      </span>
                    </td>
                    <td>{item.brand || "—"}</td>
                    <td>{item.supplier || "—"}</td>
                    <td className="numeric">
                      <span className={`stock-value ${getStock(item) <= getMinStock(item) && getStock(item) > 0 ? "low" : ""} ${getStock(item) === 0 ? "out" : ""}`}>
                        {getStock(item)}
                      </span>
                      <span className="min-stock">/ {getMinStock(item)}</span>
                    </td>
                    <td className="numeric price-cell">₱{(item.price || 0).toLocaleString()}</td>
                    <td className="cost-cell">
                      {item.cost ? (
                        <>
                          ₱{item.cost.toLocaleString()}
                          {item.price && item.cost && (
                            <span className={`margin-pill ${((item.price - item.cost) / item.price * 100) >= 30 ? "good" : ((item.price - item.cost) / item.price * 100) >= 10 ? "warning" : "danger"}`}>
                              {(((item.price - item.cost) / item.price) * 100).toFixed(0)}%
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="no-cost">—</span>
                      )}
                    </td>
                    <td>
                      {activeTab === "archived" ? (
                        <StatusDot status="archived" />
                      ) : (
                        <StatusDot status={getStatus(item).replace(/\s+/g, "_").toLowerCase()} />
                      )}
                    </td>
                    <td className="actions-col">
                      {activeTab === "archived" ? (
                        <button className="btn-icon unarchive" onClick={() => handleUnarchive(item.id)} title="Unarchive">
                          <FontAwesomeIcon icon={faPlus} />
                        </button>
                      ) : (
                        <div className="action-group">
                          <button className="btn-icon info" onClick={() => handleViewInfo(item)} title="View Info">
                            <FontAwesomeIcon icon={faInfoCircle} />
                          </button>
                          <button className={`btn-icon photo ${!item.photo_url ? "disabled" : ""}`} onClick={() => item.photo_url ? setViewPhotoUrl(item.photo_url) : showToast("info", "No Photo", `${item.name} has no photo.`)} title={item.photo_url ? "View Photo" : "No Photo"}>
                            <FontAwesomeIcon icon={faImage} />
                          </button>
                          <button className="btn-icon edit" onClick={() => handleEdit(item)} title="Edit">
                            <FontAwesomeIcon icon={faEdit} />
                          </button>
                          <button className="btn-icon adjust" onClick={() => handleAdjust(item)} title="Adjust Stock">
                            <FontAwesomeIcon icon={faAdjust} />
                          </button>
                          <button className="btn-icon archive" onClick={() => handleArchive(item)} title="Archive">
                            <FontAwesomeIcon icon={faArchive} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {/* Expandable batch row */}
                  {activeTab === "active" && expandedItems.has(item.id) && (
                    <tr className="batch-row">
                      <td colSpan={12}>
                        <div className="batch-details">
                          <h4><FontAwesomeIcon icon={faBoxes} /> Batches for {item.name}</h4>
                          {loadingBatches[item.id] ? (
                            <p>Loading batches...</p>
                          ) : itemBatches[item.id]?.length > 0 ? (
                            <table className="batch-table">
                              <thead>
                                <tr><th>Batch #</th><th>Received</th><th>Expiry</th><th>Qty</th><th>Remaining</th><th>Status</th></tr>
                              </thead>
                              <tbody>
                                {itemBatches[item.id].map((batch) => (
                                  <tr key={batch.id}>
                                    <td>{batch.batch_no}</td>
                                    <td>{batch.received_date ? new Date(batch.received_date).toLocaleDateString() : "—"}</td>
                                    <td>{batch.expiration_date ? new Date(batch.expiration_date).toLocaleDateString() : "—"}</td>
                                    <td>{batch.quantity}</td>
                                    <td>{batch.remaining_quantity}</td>
                                    <td><span className={`batch-status ${batch.status}`}>{batch.status}</span></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <p>No batch records for this item.</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  {activeTab === "active" && (
                    <tr className="expand-toggle-row">
                      <td colSpan={12}>
                        <button className="btn-expand" onClick={() => toggleExpand(item.id)}>
                          <FontAwesomeIcon icon={expandedItems.has(item.id) ? faChevronUp : faChevronDown} />
                          {expandedItems.has(item.id) ? " Hide Batches" : " View Batches"}
                        </button>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}

        {paginatedItems.length === 0 && !loading && (
          <div className="ui-empty">
            <FontAwesomeIcon icon={faBox} size="2x" />
            <p>No items found matching your filters</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="ui-pagination">
          <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>← Prev</button>
          <div className="page-numbers">
            {(() => {
              const pages = [];
              const add = (n) => pages.push(n);
              const showFirst = currentPage > 3;
              const showLast = currentPage < totalPages - 2;
              const start = Math.max(2, currentPage - 1);
              const end = Math.min(totalPages - 1, currentPage + 1);

              add(1);
              if (showFirst && currentPage > 4) add("start-ellipsis");
              if (showFirst) { add(start); if (start + 1 <= end) add(start + 1); if (start + 2 <= end) add(start + 2); }
              else if (totalPages > 1) { add(2); if (totalPages > 2) add(3); }
              if (showLast && currentPage < totalPages - 3) add("end-ellipsis");
              if (showLast && totalPages > 1) add(totalPages);

              return pages.map((p, idx) =>
                p === "start-ellipsis" || p === "end-ellipsis" ? (
                  <span key={p + idx} className="page-ellipsis">...</span>
                ) : (
                  <button key={p} className={currentPage === p ? "active" : ""} onClick={() => setCurrentPage(p)}>{p}</button>
                )
              );
            })()}
          </div>
          <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next →</button>
          <span className="page-info">Page {currentPage} of {totalPages} ({filteredItems.length} total)</span>
        </div>
      )}

      {/* Activity Timeline */}
      <div className="ui-activity">
        <div className="ui-activity-header">
          <div>
            <h3><FontAwesomeIcon icon={faHistory} /> Recent Activity</h3>
            <p>Latest product changes and stock updates</p>
          </div>
          <span className="live-badge">Live</span>
        </div>
        {activityLogs.length === 0 ? (
          <div className="ui-activity-empty">No recent activity yet.</div>
        ) : (
          <div className="ui-activity-list">
            {activityLogs.map((log) => (
              <div key={log.id} className={`ui-activity-item ${log.type}`}>
                <div className="ui-activity-dot"></div>
                <div>
                  <strong>{log.message}</strong>
                  <small>{log.time}</small>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <AddProductModal
        isOpen={showAddModal}
        onClose={() => { setShowAddModal(false); setEditingItem(null); }}
        onSuccess={handleSaveSuccess}
        editItem={editingItem}
      />

      <StockAdjustmentModal
        isOpen={showAdjustModal}
        onClose={() => { setShowAdjustModal(false); setAdjustItem(null); }}
        item={adjustItem}
        onSuccess={handleAdjustSuccess}
      />

      {/* View Info Modal */}
      {showInfoModal && infoItem && (
        <div className="modal-overlay" onClick={() => setShowInfoModal(false)}>
          <div className="modal-content info-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2><FontAwesomeIcon icon={faInfoCircle} /> Item Details</h2>
              <button className="btn-close" onClick={() => setShowInfoModal(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="info-grid">
                <div><label>Name</label><p>{infoItem.name}</p></div>
                <div><label>SKU</label><p>{infoItem.sku || "—"}</p></div>
                <div><label>Category</label><p>{infoItem.category}</p></div>
                <div><label>Brand</label><p>{infoItem.brand || "—"}</p></div>
                <div><label>Supplier</label><p>{infoItem.supplier || "—"}</p></div>
                <div><label>Stock</label><p>{getStock(infoItem)} / {getMinStock(infoItem)} min</p></div>
                <div><label>Price</label><p>₱{(infoItem.price || 0).toLocaleString()}</p></div>
                <div><label>Cost</label><p>{infoItem.cost ? `₱${infoItem.cost.toLocaleString()}` : "—"}</p></div>
                {infoItem.cost && infoItem.price && (
                  <div><label>Margin</label>
                    <p>{(((infoItem.price - infoItem.cost) / infoItem.price) * 100).toFixed(1)}%</p>
                  </div>
                )}
                <div className="full-width"><label>Description</label><p>{infoItem.description || "No description"}</p></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Photo Modal */}
      {viewPhotoUrl && (
        <div className="modal-overlay" onClick={() => setViewPhotoUrl(null)}>
          <div className="modal-content photo-modal" onClick={(e) => e.stopPropagation()}>
            <button className="btn-close" onClick={() => setViewPhotoUrl(null)}>
              &times;
            </button>
            <img src={viewPhotoUrl} alt="Product" />
          </div>
        </div>
      )}

      {/* Archive Confirmation */}
      <DeleteConfirmModal
        isOpen={deleteModal.open}
        itemName={deleteModal.item?.name || "this item"}
        loading={deleteModal.loading}
        onClose={() => setDeleteModal({ open: false, item: null, loading: false })}
        onConfirm={confirmArchive}
        title="Archive Item"
        message="This item will be hidden from POS and service usage, but previous records will remain available."
        confirmText="Archive"
      />

      {/* Toast */}
      <PremiumToast
        show={toast.show}
        type={toast.type}
        title={toast.title}
        message={toast.message}
        onClose={() => setToast((prev) => ({ ...prev, show: false }))}
      />
    </div>
  );
};

export default UnifiedInventory;
