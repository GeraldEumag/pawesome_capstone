import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBuilding,
  faEdit,
  faEnvelope,
  faMapMarkerAlt,
  faPhone,
  faPlus,
  faSave,
  faSearch,
  faSpinner,
  faTimes,
  faToggleOff,
  faToggleOn,
  faTrash,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
import { inventoryApi } from "../../api/inventory.jsx";
import { showError, showSuccess, showConfirm } from "../../utils/alert.jsx";
import { useAuth } from "../../context/AuthContext";
import Modal from "../shared/Modal"
import StandardTable from "../shared/StandardTable";
import "./Suppliers.css";

const emptyForm = {
  name: "",
  contact_person: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
  is_active: true,
};

const Suppliers = () => {
  const { user } = useAuth();
  const isAdmin = ["admin"].includes(user?.role);

  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [sortKey, setSortKey] = useState("name");
  const [sortDirection, setSortDirection] = useState("asc");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const fetchSuppliers = useCallback(async (silent = false) => {
    try {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError("");
      const res = await inventoryApi.getSuppliers();
      const list = res?.suppliers || res?.data || [];
      setSuppliers(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err.message || "Failed to load suppliers.");
      setSuppliers([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return suppliers.filter((s) => {
      if (!showInactive && !s.is_active) return false;
      if (!term) return true;
      return [s.name, s.contact_person, s.phone, s.email, s.address]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [suppliers, search, showInactive]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const va = (a[sortKey] ?? "").toString().toLowerCase();
      const vb = (b[sortKey] ?? "").toString().toLowerCase();
      return sortDirection === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    return arr;
  }, [filtered, sortKey, sortDirection]);

  const handleSort = (key, direction) => {
    setSortKey(key);
    setSortDirection(direction);
  };

  const stats = useMemo(() => ({
    total: suppliers.length,
    active: suppliers.filter((s) => s.is_active).length,
    inactive: suppliers.filter((s) => !s.is_active).length,
  }), [suppliers]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormErrors({});
    setFormOpen(true);
  };

  const openEdit = (supplier) => {
    setEditing(supplier);
    setForm({
      name: supplier.name || "",
      contact_person: supplier.contact_person || "",
      phone: supplier.phone || "",
      email: supplier.email || "",
      address: supplier.address || "",
      notes: supplier.notes || "",
      is_active: supplier.is_active ?? true,
    });
    setFormErrors({});
    setFormOpen(true);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
    if (formErrors[name]) setFormErrors((prev) => ({ ...prev, [name]: null }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormErrors({ name: "Supplier name is required" });
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await inventoryApi.updateSupplier(editing.id, form);
        showSuccess("Supplier updated.");
      } else {
        await inventoryApi.createSupplier(form);
        showSuccess("Supplier created.");
      }
      setFormOpen(false);
      await fetchSuppliers(true);
    } catch (err) {
      setFormErrors({ submit: err.message || "Failed to save supplier." });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (supplier) => {
    setBusyId(supplier.id);
    try {
      await inventoryApi.updateSupplier(supplier.id, { is_active: !supplier.is_active });
      await fetchSuppliers(true);
      showSuccess(`Supplier ${supplier.is_active ? "deactivated" : "activated"}.`);
    } catch (err) {
      showError(err.message || "Failed to update supplier.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (supplier) => {
    if (!(await showConfirm(`Delete supplier "${supplier.name}"? Suppliers with linked products are marked inactive instead.`, "Delete Supplier", "Delete", "Cancel", "warning", true))) return;
    setBusyId(supplier.id);
    try {
      await inventoryApi.deleteSupplier(supplier.id);
      await fetchSuppliers(true);
      showSuccess("Supplier removed.");
    } catch (err) {
      showError(err.message || "Failed to delete supplier.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="suppliers-page">
      <div className="suppliers-hero">
        <div>
          <span className="suppliers-eyebrow">Inventory</span>
          <h1><FontAwesomeIcon icon={faBuilding} /> Suppliers</h1>
          <p>Manage supplier profiles used when adding products to inventory.</p>
        </div>
        <div className="suppliers-hero-actions">
          <button type="button" className="sup-btn primary" onClick={openCreate}>
            <FontAwesomeIcon icon={faPlus} /> New Supplier
          </button>
        </div>
      </div>

      <div className="suppliers-stats">
        <div className="sup-stat"><strong>{stats.total}</strong><span>Total Suppliers</span></div>
        <div className="sup-stat active"><strong>{stats.active}</strong><span>Active</span></div>
        <div className="sup-stat muted"><strong>{stats.inactive}</strong><span>Inactive</span></div>
      </div>

      <div className="suppliers-toolbar">
        <div className="suppliers-search">
          <FontAwesomeIcon icon={faSearch} />
          <input
            type="text"
            placeholder="Search by name, contact, phone, email, address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} aria-label="Clear search">
              <FontAwesomeIcon icon={faTimes} />
            </button>
          )}
        </div>
        <label className="suppliers-toggle">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
      </div>

      {error && <div className="suppliers-error">{error}</div>}

      <StandardTable
        data={sorted}
        loading={loading}
        emptyMessage="No suppliers found."
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSort={handleSort}
        rowClassName={(s) => (s.is_active ? "" : "inactive-row")}
        columns={[
          {
            key: "name", label: "Supplier", sortable: true,
            render: (value, s) => (
              <>
                <strong>{s.name}</strong>
                {s.notes && <small className="sup-notes">{s.notes}</small>}
              </>
            ),
          },
          { key: "contact_person", label: "Contact Person", sortable: true },
          { key: "phone", label: "Phone" },
          { key: "email", label: "Email", sortable: true },
          { key: "address", label: "Address", className: "sup-address" },
          {
            key: "is_active", label: "Status",
            render: (value, s) => (
              <span className={`sup-status ${s.is_active ? "active" : "inactive"}`}>
                {s.is_active ? "Active" : "Inactive"}
              </span>
            ),
          },
          {
            key: "actions", label: "Actions", className: "actions-col",
            render: (value, s) => (
              <div className="sup-actions">
                <button type="button" className="sup-icon-btn" onClick={() => openEdit(s)} title="Edit">
                  <FontAwesomeIcon icon={faEdit} />
                </button>
                <button
                  type="button"
                  className="sup-icon-btn"
                  onClick={() => handleToggleActive(s)}
                  disabled={busyId === s.id}
                  title={s.is_active ? "Deactivate" : "Activate"}
                >
                  <FontAwesomeIcon icon={s.is_active ? faToggleOn : faToggleOff} />
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    className="sup-icon-btn danger"
                    onClick={() => handleDelete(s)}
                    disabled={busyId === s.id}
                    title="Delete"
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                )}
              </div>
            ),
          },
        ]}
      />

      {formOpen && (
        <Modal
          onClose={() => !saving && setFormOpen(false)}
          title={editing ? `Edit — ${editing.name}` : "New Supplier"}
          subtitle="Supplier Profile"
          icon={faBuilding}
          className="sup-modal"
          footer={
            <>
              <button type="button" className="sup-btn secondary" onClick={() => setFormOpen(false)} disabled={saving}>
                Cancel
              </button>
              <button type="submit" form="sup-form" className="sup-btn primary" disabled={saving}>
                <FontAwesomeIcon icon={saving ? faSpinner : faSave} spin={saving} />
                {saving ? "Saving..." : editing ? "Update Supplier" : "Create Supplier"}
              </button>
            </>
          }
        >
            <form id="sup-form" onSubmit={handleSubmit} className="sup-form">
              {formErrors.submit && <div className="suppliers-error">{formErrors.submit}</div>}

              <div className="sup-form-grid">
                <label className={`sup-field ${formErrors.name ? "has-error" : ""}`}>
                  <span>Supplier Name <em>*</em></span>
                  <input name="name" value={form.name} onChange={handleChange} placeholder="e.g., Pet Nutrition Co." />
                  {formErrors.name && <small className="sup-field-error">{formErrors.name}</small>}
                </label>

                <label className="sup-field">
                  <span><FontAwesomeIcon icon={faUser} /> Contact Person</span>
                  <input name="contact_person" value={form.contact_person} onChange={handleChange} placeholder="e.g., Juan Dela Cruz" />
                </label>

                <label className="sup-field">
                  <span><FontAwesomeIcon icon={faPhone} /> Phone</span>
                  <input name="phone" value={form.phone} onChange={handleChange} placeholder="e.g., 0917 123 4567" />
                </label>

                <label className="sup-field">
                  <span><FontAwesomeIcon icon={faEnvelope} /> Email</span>
                  <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="supplier@example.com" />
                </label>

                <label className="sup-field full">
                  <span><FontAwesomeIcon icon={faMapMarkerAlt} /> Address</span>
                  <textarea name="address" rows="2" value={form.address} onChange={handleChange} placeholder="Full address..." />
                </label>

                <label className="sup-field full">
                  <span>Notes</span>
                  <textarea name="notes" rows="2" value={form.notes} onChange={handleChange} placeholder="Additional notes..." />
                </label>

                <label className="sup-field sup-check">
                  <input type="checkbox" name="is_active" checked={form.is_active} onChange={handleChange} />
                  <span>Active supplier</span>
                </label>
              </div>
            </form>
        </Modal>
      )}
    </div>
  );
};

export default Suppliers;
