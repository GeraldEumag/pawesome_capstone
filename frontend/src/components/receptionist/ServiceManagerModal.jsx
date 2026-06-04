import React, { useEffect, useMemo, useState } from "react";
import catHotelImg from "../../assets/CATHOTEL.jpg";
import dogHotelImg from "../../assets/DOGHOTEL.jpg";
import daycareImg from "../../assets/PETDAYCARE.jpg";
import {
  FaTimes,
  FaPlus,
  FaEdit,
  FaTrash,
  FaSave,
  FaSyncAlt,
  FaStethoscope,
  FaHotel,
  FaPaw,
  FaWrench,
  FaToggleOn,
  FaToggleOff,
} from "react-icons/fa";
import { apiRequest, normalizeList } from "../../api/client";
import { showConfirm } from "../../utils/alert";
import "./ServiceManagerModal.css";

const TABS = [
  { key: "services", label: "Services", icon: FaWrench },
  { key: "hotel-rooms", label: "Hotel Rooms", icon: FaHotel },
  { key: "boarding-rooms", label: "Boarding / Daycare Rooms", icon: FaPaw },
];

const SERVICE_CATEGORIES = [
  "Consultation",
  "Vaccination",
  "Treatment",
  "Emergency",
  "Surgery",
  "Dental",
  "Diagnostics",
  "Boarding Care",
  "Medication",
  "Grooming",
  "Hotel",
  "Daycare",
  "Other",
];

const HOTEL_ROOM_STATUSES = [
  "available",
  "occupied",
  "maintenance",
  "cleaning",
  "reserved",
  "inactive",
];

const HOTEL_ROOM_TYPES = ["standard", "deluxe", "suite", "kennel", "cattery"];
const HOTEL_ROOM_SIZES = ["small", "medium", "large", "suite"];

const BOARDING_ROOM_TYPES = [
  { value: "dog_standard", label: "Standard Kennel (Dog)" },
  { value: "dog_large", label: "Large Kennel (Dog)" },
  { value: "dog_family", label: "Family Suite (Dog)" },
  { value: "cat_condo", label: "Cat Condo" },
  { value: "cat_suite", label: "Cat Suite" },
  { value: "small_pet", label: "Small Pet / Bird Enclosure" },
  { value: "daycare_dog", label: "Daycare — Dog" },
  { value: "daycare_cat", label: "Daycare — Cat" },
  { value: "daycare_mixed", label: "Daycare — Mixed" },
];

const ROOM_SHOWCASE = [
  {
    key: "dog",
    img: dogHotelImg,
    title: "Dog Hotel",
    desc: "Spacious kennels and suites for dogs of all sizes. Includes daily walks, playtime, and attentive care.",
    badge: "Best for Dogs",
    color: "#f97316",
  },
  {
    key: "cat",
    img: catHotelImg,
    title: "Cat Hotel",
    desc: "Cozy cat condos and suites with climbing structures. Quiet, stress-free environment for your feline.",
    badge: "Best for Cats",
    color: "#8b5cf6",
  },
  {
    key: "daycare",
    img: daycareImg,
    title: "Pet Daycare",
    desc: "Full-day supervised play and socialization for pets. Drop-off in the morning, pick-up in the evening.",
    badge: "Daycare",
    color: "#10b981",
  },
];

const HOTEL_CATEGORIES = [
  { value: "dog_hotel", label: "🐶 Dog Hotel" },
  { value: "cat_hotel", label: "🐱 Cat Hotel" },
  { value: "daycare",   label: "🌞 Daycare" },
  { value: "other",     label: "🐾 Other" },
];

const ROOM_TYPE_TO_CATEGORY = {
  dog_standard: "dog_hotel", dog_large: "dog_hotel", dog_family: "dog_hotel",
  cat_condo: "cat_hotel", cat_suite: "cat_hotel",
  daycare_dog: "daycare", daycare_cat: "daycare", daycare_mixed: "daycare",
  small_pet: "other",
};

const SPECIES_OPTIONS = ["dog", "cat", "bird", "fish", "reptile", "other"];

const formatCurrency = (value) => {
  const num = Number(value || 0);
  return `\u20b1${num.toFixed(2)}`;
};

const ServiceManagerModal = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState("services");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const showNotify = (type, message) => {
    if (type === "success") {
      setSuccess(message);
      setTimeout(() => setSuccess(""), 3000);
    } else {
      setError(message);
      setTimeout(() => setError(""), 5000);
    }
  };

  const fetchItems = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      let endpoint = "";
      let listKey = "";
      if (activeTab === "services") {
        endpoint = "/receptionist/services";
        listKey = "data";
      } else if (activeTab === "hotel-rooms") {
        endpoint = "/receptionist/hotel-rooms";
        listKey = "rooms";
      } else {
        endpoint = "/receptionist/boarding-rooms";
        listKey = "rooms";
      }

      const res = await apiRequest(endpoint, "GET");
      const list = normalizeList(res, [listKey, "data"]);
      setItems(list);
    } catch (err) {
      console.error("Fetch error:", err);
      showNotify("error", err.message || "Failed to load data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
    setEditingId(null);
    setFormData({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const startCreate = () => {
    setEditingId("new");
    if (activeTab === "services") {
      setFormData({
        name: "",
        category: "Grooming",
        price: "",
        description: "",
        duration_minutes: "",
        is_active: true,
      });
    } else if (activeTab === "hotel-rooms") {
      setFormData({
        room_number: "",
        name: "",
        description: "",
        type: "standard",
        size: "medium",
        capacity: 1,
        daily_rate: "",
        amenities: [],
        status: "available",
        notes: "",
      });
    } else {
      setFormData({
        room_code: "",
        room_name: "",
        room_type: "dog_standard",
        hotel_category: "dog_hotel",
        allowed_species: ["dog"],
        max_capacity: 1,
        total_rooms: 1,
        daily_rate: "",
        is_active: true,
        customer_selectable: true,
        notes: "",
      });
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setFormData({ ...item });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormData({});
  };

  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const isNew = editingId === "new";
    let endpoint = "";
    let method = isNew ? "POST" : "PUT";
    let payload = { ...formData };

    if (activeTab === "services") {
      endpoint = isNew ? "/receptionist/services" : `/receptionist/services/${editingId}`;
      payload.price = Number(payload.price) || 0;
      payload.duration_minutes = payload.duration_minutes ? Number(payload.duration_minutes) : null;
    } else if (activeTab === "hotel-rooms") {
      endpoint = isNew ? "/receptionist/hotel-rooms" : `/receptionist/hotel-rooms/${editingId}`;
      payload.daily_rate = Number(payload.daily_rate) || 0;
      payload.capacity = Number(payload.capacity) || 1;
    } else {
      endpoint = isNew ? "/receptionist/boarding-rooms" : `/receptionist/boarding-rooms/${editingId}`;
      payload.daily_rate = Number(payload.daily_rate) || 0;
      payload.max_capacity = Number(payload.max_capacity) || 1;
      payload.total_rooms = Number(payload.total_rooms) || 1;
    }

    try {
      await apiRequest(endpoint, { method, body: JSON.stringify(payload) });
      showNotify("success", isNew ? "Created successfully." : "Updated successfully.");
      setEditingId(null);
      setFormData({});
      fetchItems({ silent: true });
    } catch (err) {
      showNotify("error", err.message || "Operation failed.");
    }
  };

  const handleDelete = async (item) => {
    const confirmed = await showConfirm(`Delete ${item.name || item.room_name || item.room_code}?`);
    if (!confirmed) return;

    let endpoint = "";
    if (activeTab === "services") endpoint = `/receptionist/services/${item.id}`;
    else if (activeTab === "hotel-rooms") endpoint = `/receptionist/hotel-rooms/${item.id}`;
    else endpoint = `/receptionist/boarding-rooms/${item.id}`;

    try {
      await apiRequest(endpoint, "DELETE");
      showNotify("success", "Deleted successfully.");
      fetchItems({ silent: true });
    } catch (err) {
      showNotify("error", err.message || "Delete failed.");
    }
  };

  const toggleActive = async (item) => {
    const newStatus = !(item.is_active ?? true);
    let endpoint = `/receptionist/services/${item.id}`;
    if (activeTab === "boarding-rooms") endpoint = `/receptionist/boarding-rooms/${item.id}`;
    else if (activeTab === "hotel-rooms") {
      endpoint = `/receptionist/hotel-rooms/${item.id}`;
      try {
        await apiRequest(endpoint, { method: "PUT", body: JSON.stringify({ status: newStatus ? "available" : "inactive" }) });
        showNotify("success", `Room ${newStatus ? "activated" : "deactivated"}.`);
        fetchItems({ silent: true });
      } catch (err) {
        showNotify("error", err.message || "Toggle failed.");
      }
      return;
    }

    try {
      await apiRequest(endpoint, { method: "PUT", body: JSON.stringify({ is_active: newStatus }) });
      showNotify("success", `Item ${newStatus ? "activated" : "deactivated"}.`);
      fetchItems({ silent: true });
    } catch (err) {
      showNotify("error", err.message || "Toggle failed.");
    }
  };

  const columns = useMemo(() => {
    if (activeTab === "services") {
      return [
        { key: "name", label: "Name" },
        { key: "category", label: "Category" },
        { key: "price", label: "Price", render: (v) => formatCurrency(v) },
        { key: "duration_minutes", label: "Duration", render: (v) => (v ? `${v} min` : "N/A") },
        { key: "is_active", label: "Status", render: (v) => (v ? "Active" : "Inactive") },
      ];
    }
    if (activeTab === "hotel-rooms") {
      return [
        { key: "room_number", label: "Room #" },
        { key: "name", label: "Name" },
        { key: "type", label: "Type" },
        {
          key: "type",
          label: "Category",
          render: (v) => {
            const color = v === "kennel" ? "#f97316" : v === "cattery" ? "#8b5cf6" : "#64748b";
            const label = v === "kennel" ? "🐶 Dog" : v === "cattery" ? "🐱 Cat" : "🐾 Generic";
            return (
              <span
                style={{
                  display: "inline-block",
                  padding: "2px 10px",
                  borderRadius: "20px",
                  background: color + "18",
                  color: color,
                  fontWeight: 700,
                  fontSize: "0.7rem",
                }}
              >
                {label}
              </span>
            );
          },
        },
        { key: "size", label: "Size" },
        { key: "capacity", label: "Capacity" },
        { key: "daily_rate", label: "Rate", render: (v) => formatCurrency(v) },
        { key: "status", label: "Status" },
      ];
    }
    return [
      { key: "room_code", label: "Code" },
      { key: "room_name", label: "Name" },
      { key: "room_type", label: "Type" },
      {
        key: "hotel_category",
        label: "Category",
        render: (v, item) => {
          const cat = v || ROOM_TYPE_TO_CATEGORY[item.room_type] || "other";
          const cfg = HOTEL_CATEGORIES.find((c) => c.value === cat);
          const color =
            cat === "dog_hotel" ? "#f97316" :
            cat === "cat_hotel" ? "#8b5cf6" :
            cat === "daycare"   ? "#10b981" : "#64748b";
          return (
            <span
              style={{
                display: "inline-block",
                padding: "2px 10px",
                borderRadius: "20px",
                background: color + "18",
                color: color,
                fontWeight: 700,
                fontSize: "0.7rem",
                textTransform: "capitalize",
              }}
            >
              {cfg?.label?.replace(/^[🐶🐱🌞🐾]\s*/, "") || cat.replace(/_/g, " ")}
            </span>
          );
        },
      },
      { key: "allowed_species", label: "Species", render: (v) => (Array.isArray(v) ? v.join(", ") : v) },
      { key: "max_capacity", label: "Capacity" },
      { key: "daily_rate", label: "Rate", render: (v) => formatCurrency(v) },
      { key: "is_active", label: "Status", render: (v) => (v ? "Active" : "Inactive") },
    ];
  }, [activeTab]);

  const renderForm = () => {
    if (activeTab === "services") {
      return (
        <form className="smm-form" onSubmit={handleSubmit}>
          <div className="smm-form-grid">
            <div className="smm-form-group">
              <label>Name *</label>
              <input
                type="text"
                value={formData.name || ""}
                onChange={(e) => updateField("name", e.target.value)}
                required
                placeholder="e.g. Full Grooming Small Breed"
              />
            </div>
            <div className="smm-form-group">
              <label>Category *</label>
              <select value={formData.category || ""} onChange={(e) => updateField("category", e.target.value)} required>
                {SERVICE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="smm-form-group">
              <label>Price *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.price || ""}
                onChange={(e) => updateField("price", e.target.value)}
                required
                placeholder="0.00"
              />
            </div>
            <div className="smm-form-group">
              <label>Duration (minutes)</label>
              <input
                type="number"
                min="0"
                value={formData.duration_minutes || ""}
                onChange={(e) => updateField("duration_minutes", e.target.value)}
                placeholder="e.g. 60"
              />
            </div>
          </div>
          <div className="smm-form-group">
            <label>Description</label>
            <textarea
              rows={3}
              value={formData.description || ""}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="Brief description of the service..."
            />
          </div>
          <div className="smm-form-row">
            <label className="smm-toggle">
              <input
                type="checkbox"
                checked={!!formData.is_active}
                onChange={(e) => updateField("is_active", e.target.checked)}
              />
              <span>Active</span>
            </label>
          </div>
          <div className="smm-form-actions">
            <button type="button" className="smm-btn-secondary" onClick={cancelEdit}>
              <FaTimes /> Cancel
            </button>
            <button type="submit" className="smm-btn-primary">
              <FaSave /> Save
            </button>
          </div>
        </form>
      );
    }

    if (activeTab === "hotel-rooms") {
      return (
        <form className="smm-form" onSubmit={handleSubmit}>
          <div className="smm-form-grid">
            <div className="smm-form-group">
              <label>Room Number *</label>
              <input
                type="text"
                value={formData.room_number || ""}
                onChange={(e) => updateField("room_number", e.target.value)}
                required
                placeholder="e.g. H-101"
              />
            </div>
            <div className="smm-form-group">
              <label>Name *</label>
              <input
                type="text"
                value={formData.name || ""}
                onChange={(e) => updateField("name", e.target.value)}
                required
                placeholder="e.g. Deluxe Suite 101"
              />
            </div>
            <div className="smm-form-group">
              <label>Type *</label>
              <select
                value={formData.type || ""}
                onChange={(e) => updateField("type", e.target.value)}
                required
              >
                {HOTEL_ROOM_TYPES.map((t) => {
                  const categoryLabel = t === "kennel" ? " (Dog)" : t === "cattery" ? " (Cat)" : " (Dog/Cat)";
                  return (
                    <option key={t} value={t}>
                      {t.replace(/_/g, " ")}{categoryLabel}
                    </option>
                  );
                })}
              </select>
              {formData.type && (
                <small style={{
                  display: "block",
                  marginTop: "6px",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: formData.type === "kennel" ? "#f97316" : formData.type === "cattery" ? "#8b5cf6" : "#64748b"
                }}>
                  {formData.type === "kennel" ? "🐶 This room is for Dogs only"
                    : formData.type === "cattery" ? "🐱 This room is for Cats only"
                    : "🐾 This room is compatible with both Dogs and Cats"}
                </small>
              )}
            </div>
            <div className="smm-form-group">
              <label>Size *</label>
              <select value={formData.size || ""} onChange={(e) => updateField("size", e.target.value)} required>
                {HOTEL_ROOM_SIZES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="smm-form-group">
              <label>Capacity *</label>
              <input
                type="number"
                min="1"
                value={formData.capacity || ""}
                onChange={(e) => updateField("capacity", e.target.value)}
                required
              />
            </div>
            <div className="smm-form-group">
              <label>Daily Rate *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.daily_rate || ""}
                onChange={(e) => updateField("daily_rate", e.target.value)}
                required
                placeholder="0.00"
              />
            </div>
            <div className="smm-form-group">
              <label>Status *</label>
              <select value={formData.status || ""} onChange={(e) => updateField("status", e.target.value)} required>
                {HOTEL_ROOM_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="smm-form-group">
            <label>Description</label>
            <textarea
              rows={2}
              value={formData.description || ""}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="Room description..."
            />
          </div>
          <div className="smm-form-group">
            <label>Notes</label>
            <textarea
              rows={2}
              value={formData.notes || ""}
              onChange={(e) => updateField("notes", e.target.value)}
              placeholder="Internal notes..."
            />
          </div>
          <div className="smm-form-actions">
            <button type="button" className="smm-btn-secondary" onClick={cancelEdit}>
              <FaTimes /> Cancel
            </button>
            <button type="submit" className="smm-btn-primary">
              <FaSave /> Save
            </button>
          </div>
        </form>
      );
    }

    return (
      <form className="smm-form" onSubmit={handleSubmit}>
        <div className="smm-form-grid">
          <div className="smm-form-group">
            <label>Room Code *</label>
            <input
              type="text"
              value={formData.room_code || ""}
              onChange={(e) => updateField("room_code", e.target.value)}
              required
              placeholder="e.g. DOG-STD-01"
            />
          </div>
          <div className="smm-form-group">
            <label>Room Name *</label>
            <input
              type="text"
              value={formData.room_name || ""}
              onChange={(e) => updateField("room_name", e.target.value)}
              required
              placeholder="e.g. Standard Kennel A"
            />
          </div>
          <div className="smm-form-group">
            <label>Room Type *</label>
            <select
              value={formData.room_type || ""}
              onChange={(e) => {
                const rt = e.target.value;
                updateField("room_type", rt);
                if (ROOM_TYPE_TO_CATEGORY[rt]) {
                  updateField("hotel_category", ROOM_TYPE_TO_CATEGORY[rt]);
                }
                // Auto-set allowed_species based on room type
                if (rt.startsWith("dog")) {
                  updateField("allowed_species", ["dog"]);
                } else if (rt.startsWith("cat")) {
                  updateField("allowed_species", ["cat"]);
                } else if (rt.startsWith("daycare_dog")) {
                  updateField("allowed_species", ["dog"]);
                } else if (rt.startsWith("daycare_cat")) {
                  updateField("allowed_species", ["cat"]);
                } else if (rt.startsWith("daycare_mixed")) {
                  updateField("allowed_species", ["dog", "cat"]);
                } else if (rt === "small_pet") {
                  updateField("allowed_species", ["bird", "rabbit", "hamster", "other"]);
                }
              }}
              required
            >
              {BOARDING_ROOM_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="smm-form-group">
            <label>Hotel Category *</label>
            <select
              value={formData.hotel_category || ""}
              onChange={(e) => updateField("hotel_category", e.target.value)}
              required
            >
              {HOTEL_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="smm-form-group">
            <label>Max Capacity *</label>
            <input
              type="number"
              min="1"
              value={formData.max_capacity || ""}
              onChange={(e) => updateField("max_capacity", e.target.value)}
              required
            />
          </div>
          <div className="smm-form-group">
            <label>Total Rooms *</label>
            <input
              type="number"
              min="1"
              value={formData.total_rooms || ""}
              onChange={(e) => updateField("total_rooms", e.target.value)}
              required
            />
          </div>
          <div className="smm-form-group">
            <label>Daily Rate *</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={formData.daily_rate || ""}
              onChange={(e) => updateField("daily_rate", e.target.value)}
              required
              placeholder="0.00"
            />
          </div>
        </div>
        <div className="smm-form-group">
          <label>Allowed Species</label>
          <div className="smm-checkbox-group">
            {SPECIES_OPTIONS.map((s) => (
              <label key={s} className="smm-checkbox">
                <input
                  type="checkbox"
                  checked={(formData.allowed_species || []).includes(s)}
                  onChange={(e) => {
                    const current = formData.allowed_species || [];
                    const next = e.target.checked ? [...current, s] : current.filter((x) => x !== s);
                    updateField("allowed_species", next);
                  }}
                />
                <span>{s}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="smm-form-group">
          <label>Notes</label>
          <textarea
            rows={2}
            value={formData.notes || ""}
            onChange={(e) => updateField("notes", e.target.value)}
            placeholder="Internal notes..."
          />
        </div>
        <div className="smm-form-row">
          <label className="smm-toggle">
            <input
              type="checkbox"
              checked={!!formData.is_active}
              onChange={(e) => updateField("is_active", e.target.checked)}
            />
            <span>Active</span>
          </label>
          <label className="smm-toggle">
            <input
              type="checkbox"
              checked={!!formData.customer_selectable}
              onChange={(e) => updateField("customer_selectable", e.target.checked)}
            />
            <span>Customer Selectable</span>
          </label>
        </div>
        <div className="smm-form-actions">
          <button type="button" className="smm-btn-secondary" onClick={cancelEdit}>
            <FaTimes /> Cancel
          </button>
          <button type="submit" className="smm-btn-primary">
            <FaSave /> Save
          </button>
        </div>
      </form>
    );
  };

  return (
    <div className="smm-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="smm-modal">
        <div className="smm-header">
          <h2>
            <FaWrench />
            Service & Room Manager
          </h2>
          <button className="smm-close" onClick={onClose} aria-label="Close">
            <FaTimes />
          </button>
        </div>

        {success && <div className="smm-toast success">{success}</div>}
        {error && <div className="smm-toast error">{error}</div>}

        <div className="smm-tabs">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                className={`smm-tab ${activeTab === tab.key ? "active" : ""}`}
                onClick={() => setActiveTab(tab.key)}
              >
                <Icon /> {tab.label}
              </button>
            );
          })}
        </div>

        {(activeTab === "hotel-rooms" || activeTab === "boarding-rooms") && (
          <div className="smm-showcase">
            {ROOM_SHOWCASE.map((room) => (
              <div className="smm-showcase-card" key={room.key}>
                <div className="smm-showcase-img-wrap">
                  <img src={room.img} alt={room.title} className="smm-showcase-img" />
                  <span className="smm-showcase-badge" style={{ background: room.color }}>{room.badge}</span>
                </div>
                <div className="smm-showcase-body">
                  <h4>{room.title}</h4>
                  <p>{room.desc}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="smm-toolbar">
          <button className="smm-btn-primary" onClick={startCreate} disabled={editingId !== null}>
            <FaPlus /> Add New
          </button>
          <button className="smm-btn-ghost" onClick={() => fetchItems({ silent: true })} disabled={loading}>
            <FaSyncAlt className={loading ? "spin" : ""} /> Refresh
          </button>
        </div>

        {editingId !== null && (
          <div className="smm-editor">
            <h3>{editingId === "new" ? "Create New" : "Edit"}</h3>
            {renderForm()}
          </div>
        )}

        <div className="smm-table-wrap">
          {items.length === 0 && !loading ? (
            <div className="smm-empty">No records found.</div>
          ) : (
            <table className="smm-table">
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th key={col.key}>{col.label}</th>
                  ))}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className={item.is_active === false || item.status === "inactive" ? "inactive" : ""}>
                    {columns.map((col) => (
                      <td key={col.key}>
                        {col.render ? col.render(item[col.key], item) : item[col.key] ?? "—"}
                      </td>
                    ))}
                    <td>
                      <div className="smm-actions">
                        <button className="smm-icon-btn" onClick={() => startEdit(item)} title="Edit">
                          <FaEdit />
                        </button>
                        <button className="smm-icon-btn danger" onClick={() => handleDelete(item)} title="Delete">
                          <FaTrash />
                        </button>
                        {(activeTab === "services" || activeTab === "boarding-rooms") && (
                          <button
                            className="smm-icon-btn"
                            onClick={() => toggleActive(item)}
                            title={item.is_active ? "Deactivate" : "Activate"}
                          >
                            {item.is_active ? <FaToggleOn /> : <FaToggleOff />}
                          </button>
                        )}
                        {activeTab === "hotel-rooms" && (
                          <button
                            className="smm-icon-btn"
                            onClick={() => toggleActive(item)}
                            title={item.status !== "inactive" ? "Deactivate" : "Activate"}
                          >
                            {item.status !== "inactive" ? <FaToggleOn /> : <FaToggleOff />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default ServiceManagerModal;
