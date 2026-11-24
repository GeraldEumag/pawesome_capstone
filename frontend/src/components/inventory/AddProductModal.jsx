import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { inventoryApi } from "../../api/inventory.jsx";
import { formatCurrency } from "../../utils/currency";
import Modal from "../shared/Modal";
import QrScanner from "../shared/QrScanner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBoxOpen,
  faLayerGroup,
  faClipboardCheck,
  faCheck,
  faChevronLeft,
  faChevronRight,
  faEdit,
  faCloudArrowUp,
  faCamera,
} from "@fortawesome/free-solid-svg-icons";
import "./AddProductModal.css";

const TOTAL_STEPS = 3;
const EXPIRY_CATEGORIES = ["food", "medicine", "vitamin", "health", "grooming", "shampoo", "treat"];
const categoryRequiresExpiry = (category) => EXPIRY_CATEGORIES.some((value) => String(category || "").toLowerCase().includes(value));

const AddProductModal = ({ isOpen, onClose, onSuccess, editItem = null }) => {
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    name: "",
    sku: "",
    barcode: "",
    category: "",
    brand: "",
    generic_name: "",
    supplier: "",
    supplier_id: null,
    reorder_level: "0",
    price: "",
    cost: "",
    status: "active",
    description: "",
    photo: null,
    photoFile: null,
    requires_expiry_tracking: false,
    issue_method: "FIFO",
    unit: "piece",
    pack_size: "",
    box_size: "",
  });

  const [errors, setErrors] = useState({});
  const [photoPreview, setPhotoPreview] = useState(null);
  const [suppliers, setSuppliers] = useState([]);

  // Barcode webcam scanner
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [barcodeError, setBarcodeError] = useState("");
  const [barcodeChecking, setBarcodeChecking] = useState(false);

  useEffect(() => {
    if (editItem) {
      const requiresExpiry = Boolean(editItem.requires_expiry_tracking) || categoryRequiresExpiry(editItem.category);
      const issueMethod = requiresExpiry ? "FEFO" : "FIFO";
      setFormData({
        name: editItem.name || "",
        sku: editItem.sku || "",
        barcode: editItem.barcode || "",
        category: editItem.category || "",
        brand: editItem.brand || "",
        generic_name: editItem.generic_name || "",
        supplier: editItem.supplier || "",
        supplier_id: editItem.supplier_id || null,
        reorder_level: editItem.reorder_level?.toString() || "0",
        price: editItem.price?.toString() || "",
        cost: editItem.cost?.toString() || "",
        status: editItem.status || "active",
        description: editItem.description || "",
        photo: editItem.photo_url || editItem.photo || null,
        photoFile: null,
        requires_expiry_tracking: requiresExpiry,
        issue_method: issueMethod,
        unit: editItem.unit || "piece",
        pack_size: editItem.pack_size?.toString() || "",
        box_size: editItem.box_size?.toString() || "",
      });
      setPhotoPreview(editItem.photo_url || editItem.photo || null);
    } else {
      setFormData({
        name: "",
        sku: "",
        barcode: "",
        category: "",
        brand: "",
        generic_name: "",
        supplier: "",
        supplier_id: null,
        reorder_level: "0",
        price: "",
        cost: "",
        status: "active",
        description: "",
        photo: null,
        photoFile: null,
        requires_expiry_tracking: false,
        issue_method: "FIFO",
        unit: "piece",
        pack_size: "",
        box_size: "",
      });
      setPhotoPreview(null);
    }
    setErrors({});
    setCurrentStep(1);
  }, [editItem, isOpen]);

  // Load active suppliers for the supplier dropdowns
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    inventoryApi
      .getSuppliers({ active_only: true })
      .then((res) => {
        if (cancelled) return;
        const list = res?.suppliers || res?.data || (Array.isArray(res) ? res : []);
        setSuppliers(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setSuppliers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  /* ── Barcode webcam scan handler ── */
  const handleBarcodeScan = async (code) => {
    setShowBarcodeScanner(false);
    setBarcodeChecking(true);
    setBarcodeError("");
    try {
      const res = await inventoryApi.lookupByBarcode(code);
      const found = res?.item ?? res;
      if (found?.id) {
        // Barcode already belongs to an existing product
        setBarcodeError(
          `Barcode already assigned to "${found.name}". Choose a different barcode.`
        );
        return;
      }
    } catch (err) {
      // 404 means barcode is not in inventory — safe to use
      const msg = err.message?.toLowerCase() ?? "";
      if (!msg.includes("404") && !msg.includes("not found")) {
        setBarcodeError("Could not verify barcode. Please try again.");
        return;
      }
    } finally {
      setBarcodeChecking(false);
    }
    // Safe — pre-fill the barcode field and clear any previous error
    setBarcodeError("");
    setFormData((prev) => ({ ...prev, barcode: code }));
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === "requires_expiry_tracking") {
      const requiresExpiry = categoryRequiresExpiry(formData.category) || checked;
      setFormData((prev) => ({
        ...prev,
        requires_expiry_tracking: requiresExpiry,
        issue_method: requiresExpiry ? "FEFO" : "FIFO",
      }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
    }
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const handleSupplierSelect = (e) => {
    const id = e.target.value;
    const found = suppliers.find((s) => String(s.id) === String(id));
    setFormData((prev) => ({
      ...prev,
      supplier_id: found ? found.id : id === "" ? null : prev.supplier_id,
      supplier: found ? found.name : id === "" ? "" : prev.supplier,
    }));
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormData((prev) => ({ ...prev, photoFile: file }));
      const reader = new FileReader();
      reader.onloadend = () => setPhotoPreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleRemovePhoto = () => {
    setFormData((prev) => ({ ...prev, photo: null, photoFile: null }));
    setPhotoPreview(null);
  };

  // Auto-set issue_method and requires_expiry_tracking when category changes
  const handleCategoryChange = (e) => {
    const category = e.target.value;
    const requiresExpiry = categoryRequiresExpiry(category) || formData.requires_expiry_tracking;
    setFormData((prev) => ({
      ...prev,
      category,
      requires_expiry_tracking: requiresExpiry,
      issue_method: requiresExpiry ? "FEFO" : "FIFO",
    }));
    if (errors.category) {
      setErrors((prev) => ({ ...prev, category: null }));
    }
  };

  const validateStep = (step) => {
    const newErrors = {};
    if (step === 1) {
      if (!formData.name.trim()) newErrors.name = "Product name is required";
      if (!formData.category) newErrors.category = "Category is required";
      // Barcode is optional — the backend auto-generates a unique EAN-13
      // for sellable items when the field is left blank.
    } else if (step === 2) {
      if (!formData.price || parseFloat(formData.price) <= 0) {
        newErrors.price = "Valid price is required";
      }
      const pack = parseInt(formData.pack_size, 10);
      const box = parseInt(formData.box_size, 10);
      if (formData.pack_size !== "" && (!pack || pack < 2)) newErrors.pack_size = "At least 2 base units per pack.";
      if (formData.box_size !== "" && (!box || box < 2)) newErrors.box_size = "At least 2 base units per box.";
      if (pack >= 2 && box >= 2 && box < pack) newErrors.box_size = "A box must contain at least as many units as a pack.";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, TOTAL_STEPS));
    }
  };

  const prevStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateStep(currentStep)) return;

    setLoading(true);
    const data = {
      ...formData,
      reorder_level: parseInt(formData.reorder_level) || 0,
      price: parseFloat(formData.price),
      cost: formData.cost ? parseFloat(formData.cost) : null,
      supplier_id: formData.supplier_id || null,
      requires_expiry_tracking: formData.requires_expiry_tracking ? 1 : 0,
      unit: (formData.unit || "piece").trim() || "piece",
      pack_size: formData.pack_size === "" ? null : parseInt(formData.pack_size, 10),
      box_size: formData.box_size === "" ? null : parseInt(formData.box_size, 10),
      barcode: formData.barcode.trim() || null,
    };
    delete data.photoFile;
    if (formData.photoFile instanceof File) {
      data.photo = formData.photoFile;
    }

    // Product registration creates a catalog record only — stock arrives
    // later through the dedicated Stock Management receiving action, which
    // records the opening batch and movement log.
    if (!editItem) {
      data.stock = 0;
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

  const steps = [
    { num: 1, label: "Basic Info", icon: faBoxOpen },
    { num: 2, label: "Pricing & Tracking", icon: faLayerGroup },
    { num: 3, label: "Supplier & Review", icon: faClipboardCheck },
  ];

  const footer = (
    <>
      <button type="button" className="btn-cancel" onClick={onClose} disabled={loading}>
        Cancel
      </button>
      {currentStep > 1 && (
        <button type="button" className="btn-cancel" onClick={prevStep} disabled={loading}>
          <FontAwesomeIcon icon={faChevronLeft} /> Back
        </button>
      )}
      {currentStep < TOTAL_STEPS ? (
        <button key="next" type="button" className="btn-submit" onClick={nextStep}>
          Next <FontAwesomeIcon icon={faChevronRight} />
        </button>
      ) : (
        <button key="submit" type="submit" form="apm-form" className="btn-submit" disabled={loading}>
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
      )}
    </>
  );

  return (
    <Modal
      onClose={onClose}
      title={editItem ? "Edit Product" : "Add New Product"}
      subtitle={editItem ? "Update product details" : "Create a new inventory item"}
      icon={editItem ? faEdit : faBoxOpen}
      size="lg"
      className="product-modal"
      footer={footer}
    >
        {/* Step Indicator */}
        <div className="step-indicator">
          {steps.map((step, idx) => (
            <React.Fragment key={step.num}>
              <div
                className={`step-circle ${
                  currentStep > step.num ? "completed" : currentStep === step.num ? "active" : ""
                }`}
              >
                {currentStep > step.num ? (
                  <FontAwesomeIcon icon={faCheck} />
                ) : (
                  <FontAwesomeIcon icon={step.icon} />
                )}
                <span className="step-label">{step.label}</span>
              </div>
              {idx < steps.length - 1 && (
                <div className={`step-connector ${currentStep > step.num ? "completed" : ""}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        <form id="apm-form" onSubmit={handleSubmit} onKeyDown={(e) => {
          if (e.key === 'Enter' && currentStep < TOTAL_STEPS) {
            e.preventDefault();
            nextStep();
          }
        }}>
          <div className="apm-modal-body">
            {errors.submit && <div className="error-banner">{errors.submit}</div>}

            {/* STEP 1: Basic Information */}
            {currentStep === 1 && (
              <div className="step-content">
                <div className="form-section">
                  <h4>Basic Information</h4>
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
                      <label>SKU</label>
                      <input
                        type="text"
                        name="sku"
                        value={formData.sku}
                        onChange={handleChange}
                        placeholder="Leave blank to generate automatically"
                        className={errors.sku ? "error" : ""}
                      />
                      {errors.sku && <span className="error-text">{errors.sku}</span>}
                    </div>

                    <div className="form-group">
                      <label>Barcode</label>
                      <div className="barcode-input-row">
                        <input
                          type="text"
                          name="barcode"
                          value={formData.barcode}
                          onChange={handleChange}
                          placeholder="e.g., 8938501234567 (scan or type)"
                          className={errors.barcode ? "error" : ""}
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          className={`btn-scan-barcode-inline${showBarcodeScanner ? " active" : ""}`}
                          onClick={() => { setShowBarcodeScanner((v) => !v); setBarcodeError(""); }}
                          title={showBarcodeScanner ? "Close scanner" : "Scan barcode with webcam"}
                          disabled={barcodeChecking}
                        >
                          <FontAwesomeIcon icon={faCamera} />
                        </button>
                      </div>

                      {errors.barcode && <span className="error-text">{errors.barcode}</span>}
                      {barcodeChecking && <small className="helper-text">Checking barcode…</small>}
                      {barcodeError && <span className="error-text">{barcodeError}</span>}
                      {!barcodeError && !barcodeChecking && (
                        <small className="helper-text">
                          {editItem
                            ? "Unique product barcode for POS scanning. Click the camera to scan."
                            : "Optional — leave blank to auto-generate a unique barcode, or scan/type your own."}
                        </small>
                      )}

                      {/* Portal: renders outside the modal's overflow:hidden DOM so the camera works */}
                      {showBarcodeScanner && ReactDOM.createPortal(
                        <div
                          className="apm-scan-overlay"
                          onClick={() => setShowBarcodeScanner(false)}
                        >
                          <div
                            className="apm-scan-panel"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="apm-scan-header">
                              <span>📷 Scan Product Barcode</span>
                              <button
                                type="button"
                                className="apm-scan-close"
                                onClick={() => setShowBarcodeScanner(false)}
                              >
                                ×
                              </button>
                            </div>
                            <p className="apm-scan-hint">
                              Hold the product barcode horizontally inside the scanning bar.
                            </p>
                            <QrScanner onScan={handleBarcodeScan} stopOnScan={true} />
                          </div>
                        </div>,
                        document.body
                      )}
                    </div>

                    <div className="form-group">
                      <label>
                        Category <span className="required">*</span>
                      </label>
                      <select
                        name="category"
                        value={formData.category}
                        onChange={handleCategoryChange}
                        className={errors.category ? "error" : ""}
                      >
                        <option value="">Select Category</option>
                        <option value="Food">Pet Food</option>
                        <option value="Grooming">Grooming</option>
                        <option value="Health">Health</option>
                        <option value="Toys">Toys</option>
                        <option value="Accessories">Accessories</option>
                        <option value="Services">Services</option>
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

                    <div className="form-group">
                      <label>Generic Name</label>
                      <input
                        type="text"
                        name="generic_name"
                        value={formData.generic_name}
                        onChange={handleChange}
                        placeholder="e.g., Amoxicillin (for medicines)"
                      />
                      <small className="helper-text">Optional: Generic name for medicines/health products</small>
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <h4>Product Photo</h4>
                  <div className="photo-upload-area">
                    {photoPreview ? (
                      <div className="photo-preview-container">
                        <img src={photoPreview} alt="Product preview" className="photo-preview-img" />
                        <button type="button" className="btn-remove-photo" onClick={handleRemovePhoto}>
                          Remove Photo
                        </button>
                      </div>
                    ) : (
                      <label className="photo-upload-label">
                        <input type="file" accept="image/*" onChange={handlePhotoChange} className="photo-input" />
                        <div className="photo-upload-placeholder">
                          <FontAwesomeIcon icon={faCloudArrowUp} className="upload-icon" />
                          <span>Click to upload product photo</span>
                          <small>JPEG, PNG, GIF up to 5MB</small>
                        </div>
                      </label>
                    )}
                  </div>
                </div>

                {/* Live Preview */}
                {formData.name && formData.price && (
                  <div className="product-preview">
                    <h4>Preview</h4>
                    <div className="preview-card">
                      <div className="preview-name">{formData.name}</div>
                      <div className="preview-details">
                        <span className="preview-sku">{formData.sku || "No SKU"}</span>
                        {formData.barcode && (
                          <span className="preview-barcode">Barcode: {formData.barcode}</span>
                        )}
                        <span className="preview-price">{formatCurrency(parseFloat(formData.price) || 0)}</span>
                      </div>
                      <div className="preview-stock">
                        Category: {formData.category || "—"}
                        {formData.brand && ` · Brand: ${formData.brand}`}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 2: Pricing & Tracking */}
            {currentStep === 2 && (
              <div className="step-content">
                <div className="form-section">
                  <h4>Stock Thresholds</h4>
                  {editItem && (
                    <p className="helper-text" style={{ marginTop: 0 }}>
                      Current stock: <strong>{Number(editItem.stock ?? 0)} units</strong> — managed in Stock Management.
                    </p>
                  )}
                  {!editItem && (
                    <p className="helper-text" style={{ marginTop: 0 }}>
                      New products are created with zero stock. Receive the first batch in Stock Management.
                    </p>
                  )}
                  <div className="form-grid">
                    <div className="form-group">
                      <label>Reorder Level</label>
                      <input
                        type="number"
                        name="reorder_level"
                        value={formData.reorder_level}
                        onChange={handleChange}
                        placeholder="0"
                        min="0"
                      />
                      <small className="helper-text">Items at or below this level are flagged as low stock.</small>
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
                </div>

                {/* Units of Measure */}
                <div className="form-section">
                  <h4>Units of Measure</h4>
                  <div className="form-grid">
                    <div className="form-group">
                      <label>Base Unit</label>
                      <input
                        type="text"
                        name="unit"
                        value={formData.unit}
                        onChange={handleChange}
                        placeholder="piece"
                      />
                      <small className="helper-text">Stock is always counted in this unit (e.g. piece, tablet, can).</small>
                      {errors.unit && <span className="error-text">{errors.unit}</span>}
                    </div>
                    <div className="form-group">
                      <label>Units per Pack</label>
                      <input
                        type="number"
                        name="pack_size"
                        value={formData.pack_size}
                        onChange={handleChange}
                        placeholder="e.g. 12"
                        min="2"
                      />
                      <small className="helper-text">Leave blank if the item is not packed. Stock In/Out then offer a Pack option.</small>
                      {errors.pack_size && <span className="error-text">{errors.pack_size}</span>}
                    </div>
                    <div className="form-group">
                      <label>Units per Box</label>
                      <input
                        type="number"
                        name="box_size"
                        value={formData.box_size}
                        onChange={handleChange}
                        placeholder="e.g. 24"
                        min="2"
                      />
                      <small className="helper-text">Optional larger packaging unit.</small>
                      {errors.box_size && <span className="error-text">{errors.box_size}</span>}
                    </div>
                  </div>
                </div>

                {/* Expiry Tracking Settings */}
                <div className="form-section">
                  <h4>Expiry & Issue Method</h4>
                  <div className="form-grid">
                    <div className="form-group">
                      <label>Expiry Tracking</label>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          name="requires_expiry_tracking"
                          checked={formData.requires_expiry_tracking}
                          onChange={handleChange}
                          disabled={categoryRequiresExpiry(formData.category)}
                        />
                        Requires Expiry Tracking
                      </label>
                      <small className="helper-text">Enable for items with expiration dates (medicines, food).</small>
                    </div>

                    <div className="form-group">
                      <label>Issue Method</label>
                      <select name="issue_method" value={formData.requires_expiry_tracking ? "FEFO" : "FIFO"} disabled>
                        {formData.requires_expiry_tracking
                          ? <option value="FEFO">FEFO (First Expired, First Out)</option>
                          : <option value="FIFO">FIFO (First In, First Out)</option>}
                      </select>
                      <small className="helper-text">Expiry-tracked items use FEFO; non-expiring items use FIFO.</small>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: Supplier & Review */}
            {currentStep === 3 && (
              <div className="step-content">
                <div className="form-section">
                  <h4>Supplier Information</h4>
                  <div className="form-grid">
                    <div className="form-group">
                      <label>Supplier</label>
                      <select
                        name="supplier_id"
                        value={formData.supplier_id ?? ""}
                        onChange={handleSupplierSelect}
                      >
                        <option value="">Select supplier</option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                        {formData.supplier &&
                          !suppliers.some(
                            (s) => String(s.id) === String(formData.supplier_id)
                          ) && (
                            <option value={formData.supplier_id ?? formData.supplier}>
                              {formData.supplier}
                            </option>
                          )}
                      </select>
                      <small className="helper-text">
                        Manage the supplier list in the Suppliers tab.
                      </small>
                    </div>

                    <div className="form-group">
                      <label>Status</label>
                      <select name="status" value={formData.status} onChange={handleChange}>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="discontinued">Discontinued</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <h4>Additional Information</h4>
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

                {/* Review Summary */}
                <div className="form-section">
                  <h4>Review Summary</h4>
                  <div className="review-card">
                    <div className="review-row">
                      <span className="review-label">Name:</span>
                      <span className="review-value">{formData.name || "—"}</span>
                    </div>
                    <div className="review-row">
                      <span className="review-label">SKU:</span>
                      <span className="review-value">{formData.sku || "—"}</span>
                    </div>
                    <div className="review-row">
                      <span className="review-label">Category:</span>
                      <span className="review-value">{formData.category || "—"}</span>
                    </div>
                    <div className="review-row">
                      <span className="review-label">Brand:</span>
                      <span className="review-value">{formData.brand || "—"}</span>
                    </div>
                    <div className="review-row">
                      <span className="review-label">Price:</span>
                      <span className="review-value">{formatCurrency(parseFloat(formData.price) || 0)}</span>
                    </div>
                    <div className="review-row">
                      <span className="review-label">Cost:</span>
                      <span className="review-value">{formData.cost ? formatCurrency(parseFloat(formData.cost)) : "—"}</span>
                    </div>
                    <div className="review-row">
                      <span className="review-label">Units:</span>
                      <span className="review-value">
                        {formData.unit || "piece"}
                        {formData.pack_size ? ` · ${formData.pack_size}/pack` : ""}
                        {formData.box_size ? ` · ${formData.box_size}/box` : ""}
                      </span>
                    </div>
                    <div className="review-row">
                      <span className="review-label">Issue Method:</span>
                      <span className="review-value">{formData.issue_method}</span>
                    </div>
                    <div className="review-row">
                      <span className="review-label">Expiry Tracking:</span>
                      <span className="review-value">{formData.requires_expiry_tracking ? "Yes" : "No"}</span>
                    </div>
                    {!editItem && (
                      <div className="review-row">
                        <span className="review-label">Initial Stock:</span>
                        <span className="review-value">0 units — receive in Stock Management</span>
                      </div>
                    )}
                    <div className="review-row">
                      <span className="review-label">Supplier:</span>
                      <span className="review-value">{formData.supplier || "—"}</span>
                    </div>
                    <div className="review-row">
                      <span className="review-label">Status:</span>
                      <span className="review-value" style={{ textTransform: "capitalize" }}>{formData.status}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </form>
    </Modal>
  );
};

export default AddProductModal;
