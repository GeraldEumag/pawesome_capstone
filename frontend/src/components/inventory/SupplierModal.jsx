import React, { useState, useEffect } from "react";
import { inventoryApi } from "../../api/inventory";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faEdit,
  faTrash,
  faSearch,
  faTimes,
  faSave,
  faBuilding,
  faCheck,
} from "@fortawesome/free-solid-svg-icons";
import "./SupplierModal.css";

const SupplierModal = ({
  isOpen,
  onClose,
  onSelectSupplier,
  mode = "manage", // "manage" | "select"
  initialSupplierId = null,
}) => {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    contact_person: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
    is_active: true,
  });
  const [errors, setErrors] = useState({});
  const [selectedId, setSelectedId] = useState(initialSupplierId);

  useEffect(() => {
    if (isOpen) {
      fetchSuppliers();
      setSelectedId(initialSupplierId);
    }
  }, [isOpen, initialSupplierId]);

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const res = await inventoryApi.getSuppliers({ active_only: true });
      const list = res?.suppliers || res?.data || res || [];
      setSuppliers(Array.isArray(list) ? list : []);
    } catch (err) {
      setSuppliers([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredSuppliers = suppliers.filter((s) => {
    const term = search.toLowerCase();
    return (
      s.name?.toLowerCase().includes(term) ||
      s.contact_person?.toLowerCase().includes(term) ||
      s.phone?.toLowerCase().includes(term)
    );
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.name?.trim()) newErrors.name = "Supplier name is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    try {
      if (editingSupplier) {
        await inventoryApi.updateSupplier(editingSupplier.id, formData);
      } else {
        await inventoryApi.createSupplier(formData);
      }
      await fetchSuppliers();
      setShowForm(false);
      setEditingSupplier(null);
      setFormData({
        name: "",
        contact_person: "",
        phone: "",
        email: "",
        address: "",
        notes: "",
        is_active: true,
      });
    } catch (err) {
      setErrors({ submit: err.message || "Failed to save supplier" });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name || "",
      contact_person: supplier.contact_person || "",
      phone: supplier.phone || "",
      email: supplier.email || "",
      address: supplier.address || "",
      notes: supplier.notes || "",
      is_active: supplier.is_active ?? true,
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this supplier?")) return;
    setLoading(true);
    try {
      await inventoryApi.deleteSupplier(id);
      await fetchSuppliers();
    } catch (err) {
      alert(err.message || "Failed to delete supplier");
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (supplier) => {
    setSelectedId(supplier.id);
    if (onSelectSupplier) {
      onSelectSupplier(supplier);
    }
    if (mode === "select") {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content supplier-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <FontAwesomeIcon icon={faBuilding} size="lg" />
            <div>
              <h3>{mode === "select" ? "Select Supplier" : "Manage Suppliers"}</h3>
              <p>
                {mode === "select"
                  ? "Choose a supplier for this product"
                  : "Add or edit supplier profiles"}
              </p>
            </div>
          </div>
          <button className="btn-close" onClick={onClose}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="modal-body">
          {errors.submit && <div className="error-banner">{errors.submit}</div>}

          {!showForm && (
            <>
              <div className="supplier-toolbar">
                <div className="search-box">
                  <FontAwesomeIcon icon={faSearch} />
                  <input
                    type="text"
                    placeholder="Search suppliers..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setShowForm(true);
                    setEditingSupplier(null);
                    setFormData({
                      name: "",
                      contact_person: "",
                      phone: "",
                      email: "",
                      address: "",
                      notes: "",
                      is_active: true,
                    });
                  }}
                >
                  <FontAwesomeIcon icon={faPlus} /> New Supplier
                </button>
              </div>

              {loading && suppliers.length === 0 ? (
                <div className="loading-state">Loading suppliers...</div>
              ) : (
                <div className="supplier-list">
                  {filteredSuppliers.length === 0 ? (
                    <div className="empty-state">
                      <FontAwesomeIcon icon={faBuilding} size="2x" />
                      <p>No suppliers found</p>
                    </div>
                  ) : (
                    filteredSuppliers.map((supplier) => (
                      <div
                        key={supplier.id}
                        className={`supplier-card ${selectedId === supplier.id ? "selected" : ""}`}
                        onClick={() => handleSelect(supplier)}
                      >
                        <div className="supplier-info">
                          <div className="supplier-name">
                            {supplier.name}
                            {selectedId === supplier.id && (
                              <span className="selected-badge">
                                <FontAwesomeIcon icon={faCheck} />
                              </span>
                            )}
                          </div>
                          <div className="supplier-meta">
                            {supplier.contact_person && (
                              <span>{supplier.contact_person}</span>
                            )}
                            {supplier.phone && <span>{supplier.phone}</span>}
                            {supplier.email && <span>{supplier.email}</span>}
                          </div>
                        </div>
                        {mode === "manage" && (
                          <div className="supplier-actions">
                            <button
                              className="btn-icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(supplier);
                              }}
                              title="Edit"
                            >
                              <FontAwesomeIcon icon={faEdit} />
                            </button>
                            <button
                              className="btn-icon danger"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(supplier.id);
                              }}
                              title="Delete"
                            >
                              <FontAwesomeIcon icon={faTrash} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}

          {showForm && (
            <form onSubmit={handleSubmit} className="supplier-form">
              <h4>{editingSupplier ? "Edit Supplier" : "Add New Supplier"}</h4>
              <div className="form-grid">
                <div className={`form-group ${errors.name ? "has-error" : ""}`}>
                  <label>
                    Supplier Name <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="e.g., Pet Nutrition Co."
                  />
                  {errors.name && <small className="form-error">{errors.name}</small>}
                </div>

                <div className="form-group">
                  <label>Contact Person</label>
                  <input
                    type="text"
                    name="contact_person"
                    value={formData.contact_person}
                    onChange={handleChange}
                    placeholder="e.g., Juan Dela Cruz"
                  />
                </div>

                <div className="form-group">
                  <label>Phone</label>
                  <input
                    type="text"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="e.g., 0917 123 4567"
                  />
                </div>

                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="e.g., supplier@example.com"
                  />
                </div>

                <div className="form-group full-width">
                  <label>Address</label>
                  <textarea
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    placeholder="Full address..."
                    rows="2"
                  />
                </div>

                <div className="form-group full-width">
                  <label>Notes</label>
                  <textarea
                    name="notes"
                    value={formData.notes}
                    onChange={handleChange}
                    placeholder="Any additional notes..."
                    rows="2"
                  />
                </div>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowForm(false);
                    setEditingSupplier(null);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  <FontAwesomeIcon icon={faSave} />
                  {loading ? "Saving..." : editingSupplier ? "Update" : "Create"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default SupplierModal;
