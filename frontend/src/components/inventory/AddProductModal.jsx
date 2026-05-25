import React, { useState, useEffect } from "react";
import { inventoryApi } from "../../api/inventory";
import { formatCurrency } from "../../utils/currency";
import DatePickerInput from "../shared/DatePickerInput";
import SupplierModal from "./SupplierModal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBuilding, faPlus } from "@fortawesome/free-solid-svg-icons";
import "./AddProductModal.css";

const AddProductModal = ({ isOpen, onClose, onSuccess, editItem = null }) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    sku: "",
    category: "",
    brand: "",
    supplier: "",
    supplier_id: null,
    quantity: "",
    reorder_level: "10",
    price: "",
    cost: "",
    status: "In stock",
    description: "",
    photo: null,
    photoFile: null,
    // Batch fields
    batch_no: "",
    batch_quantity: "",
    received_date: new Date().toISOString().split('T')[0],
  });

  const [errors, setErrors] = useState({});
  const [photoPreview, setPhotoPreview] = useState(null);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [suppliers, setSuppliers] = useState([]);

  useEffect(() => {
    if (editItem) {
      setFormData({
        name: editItem.name || "",
        sku: editItem.sku || "",
        category: editItem.category || "",
        brand: editItem.brand || "",
        supplier: editItem.supplier || "",
        supplier_id: editItem.supplier_id || null,
        quantity: editItem.quantity?.toString() || "",
        reorder_level: editItem.reorder_level?.toString() || "10",
        price: editItem.price?.toString() || "",
        cost: editItem.cost?.toString() || "",
        status: editItem.status || "In stock",
        description: editItem.description || "",
        photo: editItem.photo_url || editItem.photo || null,
        photoFile: null,
      });
      setPhotoPreview(editItem.photo_url || editItem.photo || null);
    } else {
      setFormData({
        name: "",
        sku: "",
        category: "",
        brand: "",
        supplier: "",
        supplier_id: null,
        quantity: "",
        reorder_level: "10",
        price: "",
        cost: "",
        status: "In stock",
        description: "",
        photo: null,
        photoFile: null,
        batch_no: "",
        batch_quantity: "",
        received_date: new Date().toISOString().split('T')[0],
      });
      setPhotoPreview(null);
    }
    setErrors({});
  }, [editItem, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear error when user types
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormData((prev) => ({ ...prev, photoFile: file }));
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemovePhoto = () => {
    setFormData((prev) => ({ ...prev, photo: null, photoFile: null }));
    setPhotoPreview(null);
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = "Product name is required";
    if (!formData.sku.trim()) newErrors.sku = "SKU is required";
    if (!formData.category) newErrors.category = "Category is required";
    if (!formData.quantity || parseInt(formData.quantity) < 0) {
      newErrors.quantity = "Valid quantity is required";
    }
    if (!formData.price || parseFloat(formData.price) <= 0) {
      newErrors.price = "Valid price is required";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    const stock = parseInt(formData.quantity) || 0;
    const data = {
      ...formData,
      quantity: stock,
      stock: stock,
      reorder_level: parseInt(formData.reorder_level) || 10,
      price: parseFloat(formData.price),
      cost: formData.cost ? parseFloat(formData.cost) : null,
      supplier_id: formData.supplier_id || null,
    };
    delete data.photoFile;
    if (formData.photoFile instanceof File) {
      data.photo = formData.photoFile;
    }

    try {
      if (editItem) {
        if (data.photo instanceof File) {
          await inventoryApi.updateItemWithPhoto(editItem.id, data);
        } else {
          await inventoryApi.updateItem(editItem.id, data);
        }
      } else {
        if (data.photo instanceof File) {
          await inventoryApi.createItemWithPhoto(data);
        } else {
          await inventoryApi.createItem(data);
        }
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error("Failed to save product:", err);
      setErrors({ submit: err.message || "Failed to save product" });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content product-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <span className="modal-icon">{editItem ? "✏️" : "➕"}</span>
            <div>
              <h3>{editItem ? "Edit Product" : "Add New Product"}</h3>
              <p>{editItem ? "Update product details" : "Create a new inventory item"}</p>
            </div>
          </div>
          <button className="btn-close" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {errors.submit && <div className="error-banner">{errors.submit}</div>}

            <div className="form-section">
              <h4>📋 Basic Information</h4>
              <div className="form-grid">
                <div className="form-group">
                  <label>
                    Product Name <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="e.g., Premium Dog Food"
                    className={errors.name ? "error" : ""}
                  />
                  {errors.name && <span className="error-text">{errors.name}</span>}
                </div>

                <div className="form-group">
                  <label>
                    SKU <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    name="sku"
                    value={formData.sku}
                    onChange={handleChange}
                    placeholder="e.g., PET-001"
                    className={errors.sku ? "error" : ""}
                  />
                  {errors.sku && <span className="error-text">{errors.sku}</span>}
                </div>

                <div className="form-group">
                  <label>
                    Category <span className="required">*</span>
                  </label>
                  <select
                    name="category"
                    value={formData.category}
                    onChange={handleChange}
                    className={errors.category ? "error" : ""}
                  >
                    <option value="">Select Category</option>
                    <option value="Pet Food">🍖 Pet Food</option>
                    <option value="Grooming">✂️ Grooming</option>
                    <option value="Health">💊 Health</option>
                    <option value="Toys">🎾 Toys</option>
                    <option value="Accessories">🦴 Accessories</option>
                    <option value="Services">🩺 Services</option>
                  </select>
                  {errors.category && <span className="error-text">{errors.category}</span>}
                </div>

                <div className="form-group">
                  <label>Brand</label>
                  <input
                    type="text"
                    name="brand"
                    value={formData.brand}
                    onChange={handleChange}
                    placeholder="e.g., Royal Canin"
                  />
                </div>
              </div>
            </div>

            <div className="form-section">
              <h4>📦 Stock Information</h4>
              <div className="form-grid">
                <div className="form-group">
                  <label>
                    Initial Stock <span className="required">*</span>
                  </label>
                  <input
                    type="number"
                    name="quantity"
                    value={formData.quantity}
                    onChange={handleChange}
                    placeholder="0"
                    min="0"
                    className={errors.quantity ? "error" : ""}
                  />
                  {errors.quantity && <span className="error-text">{errors.quantity}</span>}
                </div>

                <div className="form-group">
                  <label>Reorder Level</label>
                  <input
                    type="number"
                    name="reorder_level"
                    value={formData.reorder_level}
                    onChange={handleChange}
                    placeholder="10"
                    min="0"
                  />
                  <small>Alert when stock falls below this</small>
                </div>

                <div className="form-group">
                  <label>
                    Unit Price (₱) <span className="required">*</span>
                  </label>
                  <input
                    type="number"
                    name="price"
                    value={formData.price}
                    onChange={handleChange}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className={errors.price ? "error" : ""}
                  />
                  {errors.price && <span className="error-text">{errors.price}</span>}
                </div>

                <div className="form-group">
                  <label>Product Cost (₱)</label>
                  <input
                    type="number"
                    name="cost"
                    value={formData.cost}
                    onChange={handleChange}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                  />
                  <small>Cost price for profit reporting</small>
                </div>

              </div>
              {formData.cost && formData.price && (
                <div className="margin-preview">
                  <span className={`margin-badge ${
                    ((parseFloat(formData.price) - parseFloat(formData.cost)) / parseFloat(formData.price) * 100) >= 30 ? "good" :
                    ((parseFloat(formData.price) - parseFloat(formData.cost)) / parseFloat(formData.price) * 100) >= 10 ? "warning" : "danger"
                  }`}>
                    Margin: {(((parseFloat(formData.price) - parseFloat(formData.cost)) / parseFloat(formData.price)) * 100).toFixed(1)}%
                  </span>
                </div>
              )}
            </div>

            {!editItem && (
              <div className="form-section batch-section">
                <h4>📦 Batch Information</h4>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Batch Number</label>
                    <input
                      type="text"
                      name="batch_no"
                      value={formData.batch_no}
                      onChange={handleChange}
                      placeholder="e.g., BATCH-001"
                    />
                  </div>

                  <div className="form-group">
                    <label>
                      Batch Quantity <span className="required">*</span>
                    </label>
                    <input
                      type="number"
                      name="batch_quantity"
                      value={formData.batch_quantity}
                      onChange={handleChange}
                      placeholder="0"
                      min="0"
                    />
                  </div>

                  <div className="form-group">
                    <label>Received Date</label>
                    <DatePickerInput
                      selected={formData.received_date ? new Date(formData.received_date) : null}
                      onChange={(date) => handleChange({ target: { name: "received_date", value: date ? date.toISOString().split("T")[0] : "" } })}
                      placeholderText="Select received date..."
                    />
                  </div>

                </div>
              </div>
            )}

            <div className="form-section">
              <h4>🏢 Supplier Information</h4>
              <div className="form-grid">
                <div className="form-group">
                  <label>Supplier</label>
                  <div className="supplier-select-row">
                    <input
                      type="text"
                      name="supplier"
                      value={formData.supplier}
                      onChange={handleChange}
                      placeholder="Select or type supplier..."
                      readOnly
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setShowSupplierModal(true)}
                      title="Select Supplier"
                    >
                      <FontAwesomeIcon icon={faBuilding} /> Select
                    </button>
                  </div>
                  {formData.supplier && (
                    <small className="supplier-hint">
                      Selected: {formData.supplier}
                    </small>
                  )}
                </div>

                <div className="form-group">
                  <label>Status</label>
                  <select name="status" value={formData.status} onChange={handleChange}>
                    <option value="In stock">In Stock</option>
                    <option value="Low stock">Low Stock</option>
                    <option value="Out of stock">Out of Stock</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="form-section">
              <h4>📝 Additional Information</h4>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Product description, notes, or special instructions..."
                  rows="3"
                />
              </div>
            </div>

            <div className="form-section">
              <h4>📸 Product Photo</h4>
              <div className="photo-upload-area">
                {photoPreview ? (
                  <div className="photo-preview-container">
                    <img
                      src={photoPreview}
                      alt="Product preview"
                      className="photo-preview-img"
                    />
                    <button
                      type="button"
                      className="btn-remove-photo"
                      onClick={handleRemovePhoto}
                    >
                      Remove Photo
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
                      <span>Click to upload product photo</span>
                      <small>JPEG, PNG, GIF up to 5MB</small>
                    </div>
                  </label>
                )}
              </div>
            </div>

            {/* Preview */}
            {formData.name && formData.price && (
              <div className="product-preview">
                <h4>👁️ Preview</h4>
                <div className="preview-card">
                  <div className="preview-name">{formData.name}</div>
                  <div className="preview-details">
                    <span className="preview-sku">{formData.sku || "No SKU"}</span>
                    <span className="preview-price">{formatCurrency(parseFloat(formData.price) || 0)}</span>
                  </div>
                  <div className="preview-stock">
                    Stock: {formData.quantity || 0} units
                    {formData.reorder_level && (
                      <small> (Reorder at: {formData.reorder_level})</small>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <SupplierModal
            isOpen={showSupplierModal}
            onClose={() => setShowSupplierModal(false)}
            mode="select"
            initialSupplierId={formData.supplier_id}
            onSelectSupplier={(supplier) => {
              setFormData((prev) => ({
                ...prev,
                supplier: supplier.name,
                supplier_id: supplier.id,
              }));
            }}
          />

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner"></span>
                  {editItem ? "Saving..." : "Creating..."}
                </>
              ) : editItem ? (
                "Save Changes"
              ) : (
                "Create Product"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddProductModal;
