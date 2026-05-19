import React, { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus,
  faEdit,
  faTrash,
  faSearch,
  faBox,
  faExclamationTriangle,
  faCheckCircle,
  faTimes,
  faSave,
  faBarcode,
  faWarehouse,
  faBoxes,
  faBell,
  faSync,
  faArchive,
  faImage,
  faEye,
} from '@fortawesome/free-solid-svg-icons';
import { inventoryApi } from '../../api/inventory';
import { normalizeList } from '../../api/client';
import PremiumToast from '../shared/PremiumToast';
import DeleteConfirmModal from '../shared/DeleteConfirmModal';
import './InventoryManagement.css';

/**
 * INVENTORY MANAGEMENT COMPONENT
 * 
 * Full CRUD operations via API for centralized inventory management.
 * All changes immediately sync to all dashboards (Cashier, Customer, Admin, Inventory).
 * 
 * API Endpoints Used:
 * - GET    /inventory/items     - Fetch all items
 * - POST   /inventory/items     - Create new item
 * - PUT    /inventory/items/:id - Update item
 * - DELETE /inventory/items/:id - Delete item
 * - GET    /inventory/dashboard - Dashboard stats
 */

const CATEGORIES = [
  { value: 'Food', label: 'Food', icon: '🍖' },
  { value: 'Accessories', label: 'Accessories', icon: '🦴' },
  { value: 'Grooming', label: 'Grooming', icon: '✂️' },
  { value: 'Toys', label: 'Toys', icon: '🎾' },
  { value: 'Health', label: 'Health', icon: '💊' },
  { value: 'Services', label: 'Services', icon: '🩺' }
];

const INITIAL_FORM_DATA = {
  name: '',
  sku: '',
  category: 'Food',
  price: '',
  stock_quantity: '',
  reorder_level: 10,
  brand: '',
  supplier: '',
  description: '',
  location: '',
  photo: null,
  photoFile: null,
};

const InventoryManagement = () => {
  // State
  const [items, setItems] = useState([]);
  const [archivedItems, setArchivedItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);
  const [formTouched, setFormTouched] = useState({});
  const [saving, setSaving] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [viewPhotoUrl, setViewPhotoUrl] = useState(null);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('active');
  
  // Stats
  const [stats, setStats] = useState({
    totalItems: 0,
    lowStock: 0,
    outOfStock: 0
  });

  // Toast state
  const [toast, setToast] = useState({
    show: false,
    type: 'success',
    title: '',
    message: ''
  });

  // Delete modal state
  const [deleteModal, setDeleteModal] = useState({
    open: false,
    item: null,
    loading: false
  });

  // Activity logs state
  const [activityLogs, setActivityLogs] = useState([]);

  // Helper to add activity log
  const addActivityLog = (type, message) => {
    const newLog = {
      id: Date.now(),
      type,
      message,
      time: new Date().toLocaleString(),
    };

    setActivityLogs((prev) => [newLog, ...prev].slice(0, 5));
  };

  // Alert count for badge
  const alertCount = stats.lowStock + stats.outOfStock;

  // Fetch inventory data
  const fetchInventory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [itemsResponse, dashboardResponse, archivedResponse] = await Promise.all([
        inventoryApi.getItems(),
        inventoryApi.getDashboard().catch(() => null),
        inventoryApi.getArchivedItems().catch(() => [])
      ]);
      
      const fetchedItems = normalizeList(itemsResponse, ['items', 'inventory', 'inventory_items', 'data']);
      const fetchedArchivedItems = normalizeList(archivedResponse, ['archived', 'items', 'inventory', 'data']);
      
      setItems(fetchedItems);
      setArchivedItems(fetchedArchivedItems);

      if (fetchedItems.length > 0) {
        // Update stats from API
        if (dashboardResponse) {
          setStats({
            totalItems: dashboardResponse.total_items || fetchedItems.length,
            lowStock: dashboardResponse.low_stock_count || 0,
            outOfStock: dashboardResponse.out_of_stock_count || 0
          });
        }
      } else {
        setItems([]);
        setStats({
          totalItems: 0,
          lowStock: 0,
          outOfStock: 0
        });
      }
    } catch (err) {
      setError(err.message);
      setItems([]);
      setStats({
        totalItems: 0,
        lowStock: 0,
        outOfStock: 0
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchInventory();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchInventory, 30000);
    return () => clearInterval(interval);
  }, [fetchInventory]);

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name.includes('price') || name.includes('quantity') || name.includes('stock') 
        ? parseFloat(value) || value 
        : value
    }));
  };

  // Validate form
  const validateForm = () => {
    const errors = {};

    if (!formData.name?.trim()) errors.name = "Product name is required";
    if (!formData.sku?.trim()) errors.sku = "SKU is required";
    if (!formData.category?.trim()) errors.category = "Category is required";
    if (formData.price === "" || Number(formData.price) < 0) errors.price = "Valid price is required";
    if (formData.stock_quantity === "" || Number(formData.stock_quantity) < 0) {
      errors.stock_quantity = "Valid stock quantity is required";
    }

    return errors;
  };

  const formErrors = validateForm();
  const isFormValid = Object.keys(formErrors).length === 0;

  const handleBlur = (e) => {
    const { name } = e.target;
    setFormTouched((prev) => ({ ...prev, [name]: true }));
  };

  // Open modal for new item
  const handleAddNew = () => {
    setEditingItem(null);
    setFormData(INITIAL_FORM_DATA);
    setFormTouched({});
    setPhotoPreview(null);
    setShowModal(true);
  };

  // Open modal for editing
  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({
      name: item.name || '',
      sku: item.sku || '',
      category: item.category || 'Food',
      price: item.price || '',
      stock_quantity: item.stock_quantity || item.stock || item.quantity || '',
      reorder_level: item.reorder_level || item.min_stock_level || item.minStock || 10,
      brand: item.brand || '',
      supplier: item.supplier || '',
      description: item.description || '',
      location: item.location || '',
      photo: item.photo_url || item.photo || null,
      photoFile: null,
    });
    setPhotoPreview(item.photo_url || item.photo || null);
    setFormTouched({});
    setShowModal(true);
  };

  // Handle photo file selection
  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormData(prev => ({ ...prev, photoFile: file }));
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // Remove selected photo
  const handleRemovePhoto = () => {
    setFormData(prev => ({ ...prev, photo: null, photoFile: null }));
    setPhotoPreview(null);
  };

  // Save item (create or update)
  const handleSave = async (e) => {
    e.preventDefault();

    if (!isFormValid) {
      setFormTouched({
        name: true,
        sku: true,
        category: true,
        price: true,
        stock_quantity: true,
      });
      return;
    }
    
    try {
      setSaving(true);
      
      // Prepare payload with both stock and quantity for backend compatibility
      const payload = {
        ...formData,
        stock: parseInt(formData.stock_quantity) || 0,
        quantity: parseInt(formData.stock_quantity) || 0,
        stock_quantity: parseInt(formData.stock_quantity) || 0,
      };
      delete payload.photoFile;
      
      if (formData.photoFile instanceof File) {
        payload.photo = formData.photoFile;
      }
      
      if (editingItem) {
        // Update existing item
        if (payload.photo instanceof File) {
          await inventoryApi.updateItemWithPhoto(editingItem.id, payload);
        } else {
          await inventoryApi.updateItem(editingItem.id, payload);
        }
      } else {
        // Create new item
        if (payload.photo instanceof File) {
          await inventoryApi.createItemWithPhoto(payload);
        } else {
          await inventoryApi.createItem(payload);
        }
      }

      await fetchInventory();

      setShowModal(false);
      setFormData(INITIAL_FORM_DATA);
      setEditingItem(null);
      setFormTouched({});
      setPhotoPreview(null);

      addActivityLog(
        editingItem ? "update" : "create",
        editingItem
          ? `${formData.name} was updated.`
          : `${formData.name} was added to inventory.`
      );

      setToast({
        show: true,
        type: "success",
        title: editingItem ? "Item Updated" : "Item Created",
        message: `Item ${editingItem ? "updated" : "created"} successfully!`,
      });
    } catch (err) {
      setToast({
        show: true,
        type: "error",
        title: "Save Failed",
        message: `Failed to ${editingItem ? "update" : "create"} item: ${err.message}`,
      });
    } finally {
      setSaving(false);
    }
  };

  // Archive item
  const handleArchive = (id) => {
    const item = items.find(i => i.id === id);
    const stock = item?.stock_quantity || item?.stock || item?.quantity || 0;

    // Rule: Cannot archive if product has stock
    if (stock > 0) {
      setToast({
        show: true,
        type: 'error',
        title: 'Cannot Archive Product',
        message: `Cannot archive "${item?.name}" because it has ${stock} units in stock. Please adjust stock to 0 first.`
      });
      return;
    }

    setDeleteModal({
      open: true,
      item: item || { name: 'this item' },
      isArchive: true,
      loading: false
    });
  };

  const confirmArchive = async (reason) => {
    setDeleteModal(prev => ({ ...prev, loading: true }));
    const { item } = deleteModal;

    try {
      await inventoryApi.archiveItem(item.id, reason);
      await fetchInventory();

      addActivityLog('archive', `Archived "${item.name}" - Reason: ${reason}`);

      setDeleteModal({ open: false, item: null, loading: false });
      setToast({
        show: true,
        type: 'success',
        title: 'Item Archived',
        message: 'Item archived successfully! It will no longer appear in POS or service dropdowns.'
      });
    } catch (err) {
      setDeleteModal(prev => ({ ...prev, loading: false }));
      setToast({
        show: true,
        type: 'error',
        title: 'Archive Failed',
        message: `Failed to archive item: ${err.message}`
      });
    }
  };

  // Unarchive item
  const handleUnarchive = async (id) => {
    const item = archivedItems.find(i => i.id === id);
    if (!item) return;

    try {
      setLoading(true);
      await inventoryApi.restoreItem(id);
      await fetchInventory();

      addActivityLog('unarchive', `Unarchived "${item.name}"`);

      setToast({
        show: true,
        type: 'success',
        title: 'Item Unarchived',
        message: 'Item restored to active inventory successfully!'
      });
    } catch (err) {
      setToast({
        show: true,
        type: 'error',
        title: 'Unarchive Failed',
        message: `Failed to unarchive item: ${err.message}`
      });
    } finally {
      setLoading(false);
    }
  };

  // Filter items
  const currentItems = activeTab === 'active' ? items : archivedItems;
  const filteredItems = currentItems.filter(item => {
    const matchesSearch = 
      (item.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (item.sku?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (item.category?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (item.brand?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (item.supplier?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    
    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
    
    // For archived items, ignore status filter
    const matchesStatus = activeTab === 'archived' ? true : 
      (statusFilter === 'all' || 
        (statusFilter === 'in_stock' && (item.stock_quantity || item.stock || 0) > (item.reorder_level || item.min_stock_level || 10)) ||
        (statusFilter === 'low_stock' && (item.stock_quantity || item.stock || 0) > 0 && (item.stock_quantity || item.stock || 0) <= (item.reorder_level || item.min_stock_level || 10)) ||
        (statusFilter === 'out_of_stock' && (item.stock_quantity || item.stock || 0) === 0));
    
    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Get status badge
  const getStatusBadge = (item) => {
    const stock = item.stock_quantity || item.stock || item.quantity || 0;
    const minStock = item.reorder_level || item.min_stock_level || item.minStock || 10;
    
    if (stock === 0) {
      return <span className="status-badge out-of-stock"><FontAwesomeIcon icon={faTimes} /> Out of Stock</span>;
    }
    if (stock <= minStock) {
      return <span className="status-badge low-stock"><FontAwesomeIcon icon={faExclamationTriangle} /> Low Stock</span>;
    }
    return <span className="status-badge in-stock"><FontAwesomeIcon icon={faCheckCircle} /> In Stock</span>;
  };

  return (
    <div className="inventory-management">
      {/* Header */}
      <div className="inventory-header">
        <div className="header-left">
          <h1><FontAwesomeIcon icon={faWarehouse} /> Inventory Management</h1>

          {alertCount > 0 && (
            <span className="stock-alert-badge">
              <FontAwesomeIcon icon={faBell} />
              {alertCount} stock alert{alertCount > 1 ? 's' : ''}
            </span>
          )}

          {error && <span className="demo-badge">No live records</span>}
        </div>
        <button className="btn btn-primary" onClick={handleAddNew}>
          <FontAwesomeIcon icon={faPlus} /> Add New Item
        </button>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card total">
          <div className="stat-icon"><FontAwesomeIcon icon={faBoxes} /></div>
          <div className="stat-info">
            <span className="stat-value">{stats.totalItems}</span>
            <span className="stat-label">Total Items</span>
          </div>
        </div>
        <div className="stat-card low">
          <div className="stat-icon"><FontAwesomeIcon icon={faBell} /></div>
          <div className="stat-info">
            <span className="stat-value">{stats.lowStock}</span>
            <span className="stat-label">Low Stock</span>
          </div>
        </div>
        <div className="stat-card out">
          <div className="stat-icon"><FontAwesomeIcon icon={faBox} /></div>
          <div className="stat-info">
            <span className="stat-value">{stats.outOfStock}</span>
            <span className="stat-label">Out of Stock</span>
          </div>
        </div>
      </div>

      {/* Activity Timeline */}
      <div className="activity-timeline-card">
        <div className="timeline-header">
          <div>
            <h3>Recent Inventory Activity</h3>
            <p>Latest product changes and stock updates</p>
          </div>
          <span>Live</span>
        </div>

        {activityLogs.length === 0 ? (
          <div className="timeline-empty">
            No recent activity yet.
          </div>
        ) : (
          <div className="timeline-list">
            {activityLogs.map((log) => (
              <div key={log.id} className={`timeline-item ${log.type}`}>
                <div className="timeline-dot"></div>
                <div>
                  <strong>{log.message}</strong>
                  <small>{log.time}</small>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="inventory-tabs">
        <button
          className={`tab-button ${activeTab === 'active' ? 'active' : ''}`}
          onClick={() => setActiveTab('active')}
        >
          <FontAwesomeIcon icon={faBox} />
          Active Items ({items.length})
        </button>
        <button
          className={`tab-button ${activeTab === 'archived' ? 'active' : ''}`}
          onClick={() => setActiveTab('archived')}
        >
          <FontAwesomeIcon icon={faArchive} />
          Archived Items ({archivedItems.length})
        </button>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <div className="search-box">
          <FontAwesomeIcon icon={faSearch} />
          <input
            type="text"
            placeholder="Search by name, SKU, or brand..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="filter-selects">
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="all">All Categories</option>
            {CATEGORIES.map(cat => (
              <option key={cat.value} value={cat.value}>{cat.icon} {cat.label}</option>
            ))}
          </select>
          {activeTab === 'active' && (
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All Status</option>
              <option value="in_stock">In Stock</option>
              <option value="low_stock">Low Stock</option>
              <option value="out_of_stock">Out of Stock</option>
            </select>
          )}
          <button className="btn btn-refresh" onClick={fetchInventory}>
            <FontAwesomeIcon icon={faSync} />
          </button>
        </div>
      </div>

      {/* Items Table */}
      <div className="items-table-container">
        {loading && items.length === 0 ? (
          <div className="loading-state">Loading inventory...</div>
        ) : error && items.length === 0 ? (
          <div className="error-state">
            <p>Failed to load inventory: {error}</p>
            <button onClick={fetchInventory}>Retry</button>
          </div>
        ) : (
          <table className="items-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product Name</th>
                <th>Category</th>
                <th>Price</th>
                <th>{activeTab === 'archived' ? 'Stock' : 'Stock'}</th>
                <th>{activeTab === 'archived' ? 'Archived Date' : 'Status'}</th>
                <th>{activeTab === 'archived' ? 'Archive Reason' : 'Location'}</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map(item => (
                <tr key={item.id} className={(item.stock_quantity || item.stock || 0) === 0 ? 'out-of-stock-row' : ''}>
                  <td className="sku-cell">
                    <FontAwesomeIcon icon={faBarcode} /> {item.sku || item.id}
                  </td>
                  <td className="name-cell">
                    <div className="product-name">{item.name}</div>
                    <div className="product-brand">{item.brand}</div>
                  </td>
                  <td>
                    <span className="category-badge">
                      {CATEGORIES.find(c => c.value === item.category)?.icon || '📦'} {item.category}
                    </span>
                  </td>
                  <td className="price-cell">₱{(item.price || 0).toLocaleString()}</td>
                  <td className="stock-cell">
                    {activeTab === 'archived' ? (
                      <span className="archived-stock">{item.stock_quantity || item.stock || 0}</span>
                    ) : (
                      <>
                        <span className={`stock-value ${(item.stock_quantity || item.stock || 0) <= (item.reorder_level || item.min_stock_level || 10) ? 'low' : ''}`}>
                          {item.stock_quantity || item.stock || 0}
                        </span>
                        <span className="min-stock">/ {item.reorder_level || item.min_stock_level || item.minStock || 10} min</span>
                      </>
                    )}
                  </td>
                  <td>
                    {activeTab === 'archived' ? (
                      <span className="archived-date">
                        {item.archived_at ? new Date(item.archived_at).toLocaleDateString() : 'N/A'}
                      </span>
                    ) : (
                      getStatusBadge(item)
                    )}
                  </td>
                  <td>
                    {activeTab === 'archived' ? (
                      <span className="archive-reason">{item.archive_reason || 'No reason'}</span>
                    ) : (
                      <span className="location-cell">{item.location || '-'}</span>
                    )}
                  </td>
                  <td className="actions-cell">
                    {activeTab === 'archived' ? (
                      <button 
                        className="btn-icon unarchive" 
                        onClick={() => handleUnarchive(item.id)} 
                        title="Unarchive"
                      >
                        <FontAwesomeIcon icon={faPlus} />
                      </button>
                    ) : (
                      <>
                        <button
                          className={`btn-icon view-photo ${!item.photo_url ? 'no-photo' : ''}`}
                          onClick={() => {
                            if (item.photo_url) {
                              setViewPhotoUrl(item.photo_url);
                            } else {
                              setToast({
                                show: true,
                                type: 'info',
                                title: 'No Photo',
                                message: `${item.name} does not have a product photo.`,
                              });
                            }
                          }}
                          title={item.photo_url ? 'View Photo' : 'No Photo Available'}
                        >
                          <FontAwesomeIcon icon={faEye} />
                        </button>
                        <button className="btn-icon edit" onClick={() => handleEdit(item)} title="Edit">
                          <FontAwesomeIcon icon={faEdit} />
                        </button>
                        <button className="btn-icon delete" onClick={() => handleArchive(item.id)} title="Archive">
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        
        {filteredItems.length === 0 && !loading && (
          <div className="empty-state">
            <FontAwesomeIcon icon={faBox} />
            <p>No items found matching your filters</p>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                <FontAwesomeIcon icon={editingItem ? faEdit : faPlus} />
                {editingItem ? 'Edit Item' : 'Add New Item'}
              </h2>
              <button className="btn-close" onClick={() => setShowModal(false)}>
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="item-form">
              <div className="form-row">
                <div className={`form-group ${formTouched.name && formErrors.name ? "has-error" : ""}`}>
                  <label>Product Name *</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    onBlur={handleBlur}
                    required
                    placeholder="e.g., Premium Dog Food 5kg"
                    autoFocus
                  />
                  {formTouched.name && formErrors.name && (
                    <small className="form-error">{formErrors.name}</small>
                  )}
                </div>
                <div className={`form-group ${formTouched.sku && formErrors.sku ? "has-error" : ""}`}>
                  <label>SKU *</label>
                  <input
                    type="text"
                    name="sku"
                    value={formData.sku}
                    onChange={handleInputChange}
                    onBlur={handleBlur}
                    required
                    placeholder="e.g., PDF-5KG-001"
                  />
                  {formTouched.sku && formErrors.sku && (
                    <small className="form-error">{formErrors.sku}</small>
                  )}
                </div>
              </div>

              <div className="form-row">
                <div className={`form-group ${formTouched.category && formErrors.category ? "has-error" : ""}`}>
                  <label>Category *</label>
                  <select name="category" value={formData.category} onChange={handleInputChange} onBlur={handleBlur} required>
                    {CATEGORIES.map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.icon} {cat.label}</option>
                    ))}
                  </select>
                  {formTouched.category && formErrors.category && (
                    <small className="form-error">{formErrors.category}</small>
                  )}
                </div>
                <div className="form-group">
                  <label>Location</label>
                  <input
                    type="text"
                    name="location"
                    value={formData.location}
                    onChange={handleInputChange}
                    placeholder="e.g., A1-01"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className={`form-group ${formTouched.price && formErrors.price ? "has-error" : ""}`}>
                  <label>Price (₱) *</label>
                  <input
                    type="number"
                    name="price"
                    value={formData.price}
                    onChange={handleInputChange}
                    onBlur={handleBlur}
                    required
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                  />
                  {formTouched.price && formErrors.price && (
                    <small className="form-error">{formErrors.price}</small>
                  )}
                </div>
                <div className={`form-group ${formTouched.stock_quantity && formErrors.stock_quantity ? "has-error" : ""}`}>
                  <label>Stock Quantity *</label>
                  <input
                    type="number"
                    name="stock_quantity"
                    value={formData.stock_quantity}
                    onChange={handleInputChange}
                    onBlur={handleBlur}
                    required
                    min="0"
                    placeholder="0"
                  />
                  {formTouched.stock_quantity && formErrors.stock_quantity && (
                    <small className="form-error">{formErrors.stock_quantity}</small>
                  )}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Minimum Stock Level</label>
                  <input
                    type="number"
                    name="reorder_level"
                    value={formData.reorder_level}
                    onChange={handleInputChange}
                    min="0"
                    placeholder="10"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Brand</label>
                  <input
                    type="text"
                    name="brand"
                    value={formData.brand}
                    onChange={handleInputChange}
                    placeholder="e.g., Pawsome Premium"
                  />
                </div>
                <div className="form-group">
                  <label>Supplier</label>
                  <input
                    type="text"
                    name="supplier"
                    value={formData.supplier}
                    onChange={handleInputChange}
                    placeholder="e.g., Pet Nutrition Co."
                  />
                </div>
              </div>

              <div className="form-group full-width">
                <label>Description</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows="3"
                  placeholder="Enter product description..."
                />
              </div>

              {/* Photo Upload */}
              <div className="form-group full-width">
                <label>Product Photo</label>
                <div className="photo-upload-area">
                  {photoPreview ? (
                    <div className="photo-preview-container">
                      <img
                        src={photoPreview}
                        alt="Product preview"
                        className="photo-preview-img"
                        onClick={() => setViewPhotoUrl(photoPreview)}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary btn-remove-photo"
                        onClick={handleRemovePhoto}
                      >
                        <FontAwesomeIcon icon={faTrash} /> Remove Photo
                      </button>
                    </div>
                  ) : (
                    <label className="photo-upload-label">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoChange}
                        className="photo-input"
                      />
                      <div className="photo-upload-placeholder">
                        <FontAwesomeIcon icon={faImage} size="2x" />
                        <span>Click to upload product photo</span>
                        <small>JPEG, PNG, GIF up to 5MB</small>
                      </div>
                    </label>
                  )}
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving || !isFormValid}>
                  <FontAwesomeIcon icon={faSave} />
                  {saving ? 'Saving...' : (editingItem ? 'Update Item' : 'Create Item')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      <PremiumToast
        show={toast.show}
        type={toast.type}
        title={toast.title}
        message={toast.message}
        onClose={() => setToast(prev => ({ ...prev, show: false }))}
      />

      {/* Photo View Modal */}
      {viewPhotoUrl && (
        <div className="modal-overlay" onClick={() => setViewPhotoUrl(null)}>
          <div className="modal-content photo-view-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                <FontAwesomeIcon icon={faImage} /> Product Photo
              </h2>
              <button className="btn-close" onClick={() => setViewPhotoUrl(null)}>
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            <div className="photo-view-body">
              <img src={viewPhotoUrl} alt="Product" className="photo-view-img" />
            </div>
          </div>
        </div>
      )}

      {/* Archive Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={deleteModal.open}
        itemName={deleteModal.item?.name || 'this item'}
        loading={deleteModal.loading}
        requireReason={true}
        onClose={() => setDeleteModal({ open: false, item: null, loading: false })}
        onConfirm={confirmArchive}
        title={deleteModal.isArchive ? "Archive Item" : "Delete Item"}
        message={deleteModal.isArchive 
          ? "This item will be hidden from POS and service usage, but previous records will remain available."
          : "This will permanently delete the item and all its data."
        }
        confirmText={deleteModal.isArchive ? "Archive" : "Delete"}
      />
    </div>
  );
};

export default InventoryManagement;
