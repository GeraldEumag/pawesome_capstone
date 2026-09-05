import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../api/client';
import './BoardingInventoryUsage.css';

const BoardingInventoryUsage = ({ boardingId, petId }) => {
  const [items, setItems] = useState([]);
  const [availableItems, setAvailableItems] = useState([]);
  const [usageHistory, setUsageHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  // Fetch available inventory items
  useEffect(() => {
    fetchAvailableItems();
    fetchUsageHistory();
  }, [boardingId]);

  const fetchAvailableItems = async () => {
    try {
      const response = await apiRequest('/receptionist/boarding/inventory-items');
      if (response.success) {
        setAvailableItems(response.items);
      }
    } catch (error) {
      console.error('Failed to fetch available items:', error);
      setMessage('Failed to load available items');
      setMessageType('error');
    }
  };

  const fetchUsageHistory = async () => {
    try {
      const response = await apiRequest(`/receptionist/boarding-requests/${boardingId}/inventory-usage-history`);
      if (response.success) {
        setUsageHistory(response.history);
      }
    } catch (error) {
      console.error('Failed to fetch usage history:', error);
    }
  };

  const addItem = () => {
    setItems([
      ...items,
      {
        inventory_item_id: '',
        quantity_used: 1,
        usage_type: 'food',
        notes: '',
        unit: 'pcs',
        batch_id: '',
      }
    ]);
  };

  const removeItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index, field, value) => {
    const updatedItems = [...items];
    updatedItems[index][field] = value;

    // Auto-fill unit and default batch when item is selected
    if (field === 'inventory_item_id') {
      const selectedItem = availableItems.find(item => item.id === parseInt(value));
      if (selectedItem) {
        updatedItems[index].unit = selectedItem.unit;
        // Default to first batch (FEFO = earliest expiration) for FEFO items
        if (selectedItem.needs_fefo && selectedItem.batches && selectedItem.batches.length > 0) {
          updatedItems[index].batch_id = selectedItem.batches[0].batch_id;
        } else {
          updatedItems[index].batch_id = '';
        }
      }
    }

    setItems(updatedItems);
  };

  // Get batches for a selected item
  const getItemBatches = (itemId) => {
    const item = availableItems.find(i => i.id === parseInt(itemId));
    return item && item.needs_fefo && item.batches ? item.batches : [];
  };

  // Get expiration badge class based on days until expiry
  const getExpiryBadgeClass = (daysUntilExpiry) => {
    if (daysUntilExpiry === null) return 'batch-badge no-expiry';
    if (daysUntilExpiry < 0) return 'batch-badge expired';
    if (daysUntilExpiry <= 30) return 'batch-badge expiring-soon';
    return 'batch-badge good';
  };

  const formatExpiryLabel = (daysUntilExpiry) => {
    if (daysUntilExpiry === null) return 'No expiry';
    if (daysUntilExpiry < 0) return 'EXPIRED';
    if (daysUntilExpiry === 0) return 'Expires today';
    if (daysUntilExpiry <= 30) return `${daysUntilExpiry}d left`;
    return `${Math.round(daysUntilExpiry / 30)}mo left`;
  };

  const saveUsage = async () => {
    // Validate items
    const validItems = items.filter(item =>
      item.inventory_item_id &&
      item.quantity_used > 0
    ).map(item => {
      const payload = { ...item };
      if (item.batch_id) {
        payload.batch_id = parseInt(item.batch_id);
      } else {
        delete payload.batch_id;
      }
      return payload;
    });

    if (validItems.length === 0) {
      setMessage('Please add at least one item with quantity');
      setMessageType('error');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const response = await apiRequest(
        `/receptionist/boarding-requests/${boardingId}/inventory-usage`,
        {
          method: 'POST',
          body: JSON.stringify({ items: validItems })
        }
      );

      if (response.success) {
        setMessage('Inventory usage recorded successfully!');
        setMessageType('success');
        setItems([]);
        fetchUsageHistory();
        fetchAvailableItems(); // Refresh stock levels
      } else {
        setMessage(response.message || 'Failed to record usage');
        setMessageType('error');
      }
    } catch (error) {
      console.error('Failed to save usage:', error);
      setMessage(error.message || 'Failed to record inventory usage');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  const clearMessage = () => {
    setMessage('');
    setMessageType('');
  };

  const getSelectedItemName = (itemId) => {
    const item = availableItems.find(i => i.id === parseInt(itemId));
    return item ? item.name : '';
  };

  const getSelectedItemStock = (itemId) => {
    const item = availableItems.find(i => i.id === parseInt(itemId));
    return item ? item.stock : 0;
  };

  return (
    <div className="boarding-inventory-usage">
      <div className="section-header">
        <h3>Boarding Food / Supply Usage</h3>
        <p>Track food and supplies used during boarding</p>
      </div>

      {message && (
        <div className={`message ${messageType}`}>
          {message}
          <button className="close-message" onClick={clearMessage}>×</button>
        </div>
      )}

      <div className="usage-form">
        <div className="form-header">
          <h4>Add Usage</h4>
          <button 
            type="button" 
            className="add-item-btn"
            onClick={addItem}
          >
            + Add Item
          </button>
        </div>

        {items.length === 0 ? (
          <div className="no-items">
            <p>No items added. Click "Add Item" to track usage.</p>
          </div>
        ) : (
          <div className="items-list">
            {items.map((item, index) => (
              <div key={index} className="item-row">
                <div className="item-fields">
                  <div className="field-group">
                    <label>Item</label>
                    <select
                      value={item.inventory_item_id}
                      onChange={(e) => updateItem(index, 'inventory_item_id', e.target.value)}
                      className="item-select"
                    >
                      <option value="">Select item...</option>
                      {availableItems.map(availableItem => (
                        <option
                          key={availableItem.id}
                          value={availableItem.id}
                          disabled={availableItem.stock <= 0}
                        >
                          {availableItem.name} ({availableItem.stock} {availableItem.unit} available)
                          {availableItem.stock <= 0 && ' - OUT OF STOCK'}
                        </option>
                      ))}
                    </select>
                  </div>

                  {item.inventory_item_id && getItemBatches(item.inventory_item_id).length > 0 && (
                    <div className="field-group batch-selector-group">
                      <label>Batch (FEFO — earliest expiry first)</label>
                      <select
                        value={item.batch_id || ''}
                        onChange={(e) => updateItem(index, 'batch_id', e.target.value ? parseInt(e.target.value) : '')}
                        className="batch-select"
                      >
                        {getItemBatches(item.inventory_item_id).map(batch => (
                          <option key={batch.batch_id} value={batch.batch_id}>
                            {batch.batch_no} — {batch.remaining_quantity} units
                            {batch.expiration_date ? ` (exp: ${batch.expiration_date})` : ' (no expiry)'}
                            {batch.is_expiring_soon ? ' ⚠ EXPIRING SOON' : ''}
                          </option>
                        ))}
                      </select>
                      {(() => {
                        const selectedBatch = getItemBatches(item.inventory_item_id).find(b => b.batch_id === parseInt(item.batch_id));
                        if (!selectedBatch) return null;
                        return (
                          <span className={getExpiryBadgeClass(selectedBatch.days_until_expiry)}>
                            {formatExpiryLabel(selectedBatch.days_until_expiry)}
                          </span>
                        );
                      })()}
                    </div>
                  )}

                  <div className="field-group">
                    <label>Quantity</label>
                    <input
                      type="number"
                      min="1"
                      max={getSelectedItemStock(item.inventory_item_id)}
                      value={item.quantity_used}
                      onChange={(e) => updateItem(index, 'quantity_used', parseInt(e.target.value) || 0)}
                      className="quantity-input"
                      disabled={!item.inventory_item_id}
                    />
                    <span className="unit-label">
                      {getSelectedItemName(item.inventory_item_id) && 
                        availableItems.find(i => i.id === parseInt(item.inventory_item_id))?.unit || 'pcs'
                      }
                    </span>
                  </div>

                  <div className="field-group">
                    <label>Usage Type</label>
                    <select
                      value={item.usage_type || 'food'}
                      onChange={(e) => updateItem(index, 'usage_type', e.target.value)}
                      className="item-select"
                    >
                      <option value="food">Food</option>
                      <option value="supply">Supply</option>
                      <option value="cleaning">Cleaning</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div className="field-group">
                    <label>Notes</label>
                    <input
                      type="text"
                      value={item.notes}
                      onChange={(e) => updateItem(index, 'notes', e.target.value)}
                      placeholder="Usage notes..."
                      className="notes-input"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  className="remove-item-btn"
                  onClick={() => removeItem(index)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="form-actions">
          <button
            type="button"
            className="save-btn"
            onClick={saveUsage}
            disabled={loading || items.length === 0}
          >
            {loading ? 'Saving...' : 'Save Usage'}
          </button>
        </div>
      </div>

      <div className="usage-history">
        <h4>Usage History</h4>
        {usageHistory.length === 0 ? (
          <p>No usage history for this boarding.</p>
        ) : (
          <div className="history-list">
            {usageHistory.map((usage) => (
              <div key={usage.id} className="history-item">
                <div className="history-details">
                  <span className="item-name">{usage.item_name}</span>
                  <span className="quantity">
                    {usage.quantity_used} {usage.unit}
                  </span>
                  <span className="batch-info">
                    {String(usage.usage_type || 'food').toUpperCase()}
                  </span>
                  {usage.batch_info && (
                    <span className="batch-info">
                      Batch: {usage.batch_info.batch_no}
                    </span>
                  )}
                </div>
                <div className="history-meta">
                  <span className="notes">{usage.notes}</span>
                  <span className="used-by">
                    by {usage.used_by} on {new Date(usage.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BoardingInventoryUsage;
