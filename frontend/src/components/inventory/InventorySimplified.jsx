import React, { useState, useEffect, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBox,
  faEdit,
  faArchive,
  faPlus,
  faSearch,
  faExclamationTriangle,
  faCheckCircle,
  faTimes,
  faEye,
  faImage,
  faBoxes,
  faBell,
  faFilter,
} from '@fortawesome/free-solid-svg-icons';
import { inventoryApi } from '../../api/inventory';
import PremiumToast from '../shared/PremiumToast';
import './InventorySimplified.css';

/**
 * SIMPLIFIED INVENTORY MANAGEMENT COMPONENT
 * 
 * Addresses professor's concerns:
 * - "Too many things shown" → Shows only essential columns
 * - "Simple CRUD appearance" → Organized as proper stock control system
 * - "Delete purpose confusion" → Clear Archive/Discontinue behavior
 * 
 * Main table shows only:
 * - Item Name
 * - Category  
 * - Current Stock
 * - Unit
 * - Reorder Level
 * - Status
 * - Actions
 * 
 * Advanced details moved to modal:
 * - SKU, Supplier, Cost price, Batch list, Movement history
 * - Archive information
 */

const CATEGORIES = [
  { value: 'Food', label: 'Food', icon: '🍖' },
  { value: 'Accessories', label: 'Accessories', icon: '🦴' },
  { value: 'Grooming', label: 'Grooming', icon: '✂️' },
  { value: 'Toys', label: 'Toys', icon: '🎾' },
  { value: 'Health', label: 'Health', icon: '💊' },
  { value: 'Services', label: 'Services', icon: '🩺' }
];

const InventorySimplified = () => {
  // State
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Filters and tabs
  const [activeTab, setActiveTab] = useState('active');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  
  // Modal states
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiveReason, setArchiveReason] = useState('');
  const [viewPhotoUrl, setViewPhotoUrl] = useState(null);
  
  // Toast state
  const [toast, setToast] = useState({
    show: false,
    type: 'success',
    title: '',
    message: ''
  });

  // Fetch inventory data
  const fetchInventory = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await inventoryApi.getItems({
        status: activeTab === 'archived' ? 'archived' : 'active'
      });
      
      const fetchedItems = response.items || response.data || [];
      setItems(fetchedItems);
    } catch (err) {
      setError(err.message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  // Initial load and auto-refresh
  useEffect(() => {
    fetchInventory();
    
    const interval = setInterval(fetchInventory, 30000);
    return () => clearInterval(interval);
  }, [activeTab]);

  // Filter and categorize items
  const processedItems = useMemo(() => {
    let filtered = items;
    
    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(item => 
        (item.name?.toLowerCase() || '').includes(search) ||
        (item.sku?.toLowerCase() || '').includes(search)
      );
    }
    
    // Category filter
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(item => item.category === categoryFilter);
    }
    
    // Categorize by status
    const activeItems = filtered.filter(item => item.status === 'active');
    const lowStockItems = activeItems.filter(item => 
      (item.stock || 0) <= (item.reorder_level || 10)
    );
    const outOfStockItems = activeItems.filter(item => (item.stock || 0) === 0);
    const expiringItems = activeItems.filter(item => {
      // Check if item has expiring batches (within 30 days)
      return item.has_expiring_soon || false;
    });
    const archivedItems = filtered.filter(item => item.status === 'archived');
    
    return {
      all: filtered,
      active: activeItems,
      lowStock: lowStockItems,
      outOfStock: outOfStockItems,
      expiring: expiringItems,
      archived: archivedItems
    };
  }, [items, searchTerm, categoryFilter, activeTab]);

  // Get display items based on active tab
  const displayItems = useMemo(() => {
    switch (activeTab) {
      case 'active':
        return processedItems.active;
      case 'low-stock':
        return processedItems.lowStock;
      case 'out-of-stock':
        return processedItems.outOfStock;
      case 'expiring':
        return processedItems.expiring;
      case 'archived':
        return processedItems.archived;
      default:
        return processedItems.active;
    }
  }, [processedItems, activeTab]);

  // Stock status helper
  const getStockStatus = (item) => {
    const stock = item.stock || 0;
    const reorderLevel = item.reorder_level || 10;
    
    if (stock === 0) return { status: 'out-of-stock', label: 'Out of Stock', color: '#dc3545' };
    if (stock <= reorderLevel) return { status: 'low-stock', label: 'Low Stock', color: '#ffc107' };
    return { status: 'in-stock', label: 'In Stock', color: '#28a745' };
  };

  // Archive item
  const handleArchive = async (item) => {
    const stock = item.stock || 0;
    
    // Rule: Cannot archive if item has stock
    if (stock > 0) {
      setToast({
        show: true,
        type: 'error',
        title: 'Cannot Archive Item',
        message: `Cannot archive "${item.name}" because it has ${stock} units in stock. Please adjust stock to 0 first.`
      });
      return;
    }

    setSelectedItem(item);
    setArchiveReason('');
    setShowArchiveModal(true);
  };

  const confirmArchive = async () => {
    if (!selectedItem || !archiveReason.trim()) return;
    
    try {
      await inventoryApi.archiveItem(selectedItem.id, archiveReason);
      await fetchInventory();
      
      setShowArchiveModal(false);
      setSelectedItem(null);
      setArchiveReason('');
      
      setToast({
        show: true,
        type: 'success',
        title: 'Item Archived',
        message: `"${selectedItem.name}" has been archived. It will no longer appear in POS or service dropdowns, but historical data remains available.`
      });
    } catch (err) {
      setToast({
        show: true,
        type: 'error',
        title: 'Archive Failed',
        message: `Failed to archive item: ${err.message}`
      });
    }
  };

  // View item details
  const handleViewDetails = (item) => {
    setSelectedItem(item);
    setShowDetailsModal(true);
  };

  // Get stock status badge
  const getStatusBadge = (item) => {
    const status = getStockStatus(item);
    return (
      <span className="stock-badge" style={{ backgroundColor: status.color, color: 'white' }}>
        <FontAwesomeIcon icon={status.status === 'out-of-stock' ? faTimes : 
                         status.status === 'low-stock' ? faExclamationTriangle : faCheckCircle} />
        {status.label}
      </span>
    );
  };

  return (
    <div className="inventory-simplified">
      {/* Header */}
      <div className="inventory-header">
        <div className="header-left">
          <h1><FontAwesomeIcon icon={faBoxes} /> Inventory Control</h1>
          <p className="header-subtitle">Stock management with proper tracking and controls</p>
        </div>
        <div className="header-right">
          <button className="btn btn-primary" onClick={() => setShowDetailsModal(true)}>
            <FontAwesomeIcon icon={faPlus} /> Add New Item
          </button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="stats-overview">
        <div className="stat-card">
          <div className="stat-icon">
            <FontAwesomeIcon icon={faBoxes} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{processedItems.active.length}</span>
            <span className="stat-label">Active Items</span>
          </div>
        </div>
        <div className="stat-card warning">
          <div className="stat-icon">
            <FontAwesomeIcon icon={faBell} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{processedItems.lowStock.length}</span>
            <span className="stat-label">Low Stock</span>
          </div>
        </div>
        <div className="stat-card danger">
          <div className="stat-icon">
            <FontAwesomeIcon icon={faTimes} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{processedItems.outOfStock.length}</span>
            <span className="stat-label">Out of Stock</span>
          </div>
        </div>
        <div className="stat-card info">
          <div className="stat-icon">
            <FontAwesomeIcon icon={faExclamationTriangle} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{processedItems.expiring.length}</span>
            <span className="stat-label">Expiring Soon</span>
          </div>
        </div>
      </div>

      {/* Tabs and Filters */}
      <div className="inventory-controls">
        <div className="tabs">
          <button 
            className={`tab ${activeTab === 'active' ? 'active' : ''}`}
            onClick={() => setActiveTab('active')}
          >
            <FontAwesomeIcon icon={faCheckCircle} /> Active Items
          </button>
          <button 
            className={`tab ${activeTab === 'low-stock' ? 'active' : ''}`}
            onClick={() => setActiveTab('low-stock')}
          >
            <FontAwesomeIcon icon={faBell} /> Low Stock
          </button>
          <button 
            className={`tab ${activeTab === 'out-of-stock' ? 'active' : ''}`}
            onClick={() => setActiveTab('out-of-stock')}
          >
            <FontAwesomeIcon icon={faTimes} /> Out of Stock
          </button>
          <button 
            className={`tab ${activeTab === 'expiring' ? 'active' : ''}`}
            onClick={() => setActiveTab('expiring')}
          >
            <FontAwesomeIcon icon={faExclamationTriangle} /> Expiring Soon
          </button>
          <button 
            className={`tab ${activeTab === 'archived' ? 'active' : ''}`}
            onClick={() => setActiveTab('archived')}
          >
            <FontAwesomeIcon icon={faArchive} /> Archived Items
          </button>
        </div>

        <div className="filters">
          <div className="search-box">
            <FontAwesomeIcon icon={faSearch} />
            <input
              type="text"
              placeholder="Search by name or SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="filter-controls">
            <FontAwesomeIcon icon={faFilter} />
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="all">All Categories</option>
              {CATEGORIES.map(cat => (
                <option key={cat.value} value={cat.value}>
                  {cat.icon} {cat.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="inventory-table-container">
        {loading && (
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading inventory...</p>
          </div>
        )}

        {error && (
          <div className="error-state">
            <FontAwesomeIcon icon={faExclamationTriangle} />
            <p>Failed to load inventory: {error}</p>
            <button onClick={fetchInventory}>Retry</button>
          </div>
        )}

        {!loading && !error && displayItems.length === 0 && (
          <div className="empty-state">
            <FontAwesomeIcon icon={faBox} />
            <h3>No items found</h3>
            <p>
              {activeTab === 'archived' 
                ? 'No archived items found.' 
                : 'No items match your current filters.'
              }
            </p>
          </div>
        )}

        {!loading && !error && displayItems.length > 0 && (
          <table className="simplified-table">
            <thead>
              <tr>
                <th>Item Name</th>
                <th>Category</th>
                <th>Current Stock</th>
                <th>Unit</th>
                <th>Reorder Level</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayItems.map(item => (
                <tr key={item.id} className={getStockStatus(item).status}>
                  <td className="name-cell">
                    <div className="item-name">{item.name}</div>
                    <div className="item-category">{item.category}</div>
                  </td>
                  <td className="category-cell">
                    <span className="category-badge">
                      {CATEGORIES.find(c => c.value === item.category)?.icon || '📦'} {item.category}
                    </span>
                  </td>
                  <td className="stock-cell">
                    <span className="stock-quantity">{item.stock || 0}</span>
                  </td>
                  <td className="unit-cell">{item.unit || 'pcs'}</td>
                  <td className="reorder-cell">{item.reorder_level || 10}</td>
                  <td className="status-cell">
                    {getStatusBadge(item)}
                  </td>
                  <td className="actions-cell">
                    <button
                      className={`btn-icon btn-view-photo ${!item.photo_url ? 'no-photo' : ''}`}
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
                      <FontAwesomeIcon icon={faImage} />
                    </button>
                    <button
                      className="btn-icon btn-view"
                      onClick={() => handleViewDetails(item)}
                      title="View Details"
                    >
                      <FontAwesomeIcon icon={faEye} />
                    </button>
                    <button
                      className="btn-icon btn-edit"
                      onClick={() => handleViewDetails(item)}
                      title="Edit Item"
                    >
                      <FontAwesomeIcon icon={faEdit} />
                    </button>
                    <button
                      className="btn-icon btn-archive"
                      onClick={() => handleArchive(item)}
                      title="Archive Item"
                      disabled={activeTab === 'archived'}
                    >
                      <FontAwesomeIcon icon={faArchive} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Item Details Modal */}
      {showDetailsModal && selectedItem && (
        <div className="modal-overlay" onClick={() => setShowDetailsModal(false)}>
          <div className="modal-content details-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                <FontAwesomeIcon icon={faEye} /> Item Details
              </h2>
              <button className="btn-close" onClick={() => setShowDetailsModal(false)}>
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            
            <div className="modal-body">
              <div className="details-grid">
                {/* Photo */}
                {selectedItem.photo_url && (
                  <div className="details-section photo-section">
                    <h3>Product Photo</h3>
                    <img
                      src={selectedItem.photo_url}
                      alt={selectedItem.name}
                      className="details-photo"
                      onClick={() => setViewPhotoUrl(selectedItem.photo_url)}
                    />
                  </div>
                )}

                {/* Basic Info */}
                <div className="details-section">
                  <h3>Basic Information</h3>
                  <div className="detail-row">
                    <span className="label">SKU:</span>
                    <span className="value">{selectedItem.sku || 'N/A'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Supplier:</span>
                    <span className="value">{selectedItem.supplier || 'N/A'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Cost Price:</span>
                    <span className="value">₱{(selectedItem.cost_price || 0).toFixed(2)}</span>
                  </div>
                </div>

                {/* Flags */}
                <div className="details-section">
                  <h3>Item Flags</h3>
                  <div className="detail-row">
                    <span className="label">Sellable:</span>
                    <span className={`value ${selectedItem.is_sellable ? 'yes' : 'no'}`}>
                      {selectedItem.is_sellable ? '✓ Yes' : '✗ No'}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Service Consumable:</span>
                    <span className={`value ${selectedItem.is_service_consumable ? 'yes' : 'no'}`}>
                      {selectedItem.is_service_consumable ? '✓ Yes' : '✗ No'}
                    </span>
                  </div>
                </div>

                {/* Archive Info */}
                {selectedItem.status === 'archived' && (
                  <div className="details-section">
                    <h3>Archive Information</h3>
                    <div className="detail-row">
                      <span className="label">Archived On:</span>
                      <span className="value">{new Date(selectedItem.archived_at).toLocaleDateString()}</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Archive Reason:</span>
                      <span className="value">{selectedItem.archive_reason || 'N/A'}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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
            <div className="modal-body photo-view-body">
              <img src={viewPhotoUrl} alt="Product" className="photo-view-img" />
            </div>
          </div>
        </div>
      )}

      {/* Archive Confirmation Modal */}
      {showArchiveModal && selectedItem && (
        <div className="modal-overlay" onClick={() => setShowArchiveModal(false)}>
          <div className="modal-content archive-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                <FontAwesomeIcon icon={faArchive} /> Archive Item
              </h2>
              <button className="btn-close" onClick={() => setShowArchiveModal(false)}>
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            
            <div className="modal-body">
              <div className="archive-warning">
                <FontAwesomeIcon icon={faExclamationTriangle} />
                <div>
                  <h4>Archive Confirmation</h4>
                  <p>This item will be <strong>hidden from POS and service usage</strong>, but all historical data will remain available in reports and logs.</p>
                  <p>Items with stock cannot be archived. Please adjust stock to 0 first.</p>
                </div>
              </div>
              
              <div className="archive-form">
                <div className="form-group">
                  <label>Item to Archive:</label>
                  <div className="item-info">
                    <strong>{selectedItem.name}</strong>
                    <span className="item-stock">Current Stock: {selectedItem.stock || 0} units</span>
                  </div>
                </div>
                
                <div className="form-group">
                  <label>Archive Reason <span className="required">*</span>:</label>
                  <textarea
                    value={archiveReason}
                    onChange={(e) => setArchiveReason(e.target.value)}
                    placeholder="Please specify why this item is being archived..."
                    rows="3"
                    required
                  />
                </div>
                
                <div className="form-actions">
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => setShowArchiveModal(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    className="btn btn-danger" 
                    onClick={confirmArchive}
                    disabled={!archiveReason.trim() || (selectedItem.stock || 0) > 0}
                  >
                    <FontAwesomeIcon icon={faArchive} /> Archive Item
                  </button>
                </div>
              </div>
            </div>
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
    </div>
  );
};

export default InventorySimplified;
