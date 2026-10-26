import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faWrench,
  faHotel,
  faPaw,
  faPlus,
  faEdit,
  faTrash,
  faSave,
  faToggleOn,
  faToggleOff,
  faSpinner,
  faCheckCircle,
  faExclamationTriangle,
  faImage,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest, normalizeList } from "../../../api/client";
import { resolveAvatarUrl } from "../../../utils/avatar";
import {
  showReasonPrompt,
  SERVICE_DISABLE_REASONS,
  SERVICE_DELETE_REASONS,
} from "../../../utils/alert.jsx";
import Modal from "../Modal";
import StatusBadge from "../StatusBadge";
import RowActionPopover from "../RowActionPopover";
import "./ServiceCatalogManager.css";

const ALL_TABS = [
  { key: "services", label: "Services", icon: faWrench },
  { key: "rooms", label: "Rooms", icon: faHotel },
];




const EMPTY_SERVICE_FORM = {
  name: "",
  category: "",
  price: "",
  description: "",
  duration_minutes: "",
  is_active: true,
};

const EMPTY_BOARDING_FORM = {
  room_code: "",
  room_name: "",
  room_type: "dog_standard",
  hotel_category: "dog_hotel",
  max_capacity: 1,
  total_rooms: 1,
  daily_rate: "",
  is_active: true,
  customer_selectable: true,
  notes: "",
};

/**
 * Species a room type accepts — mirrors BoardingRoom::speciesForRoomType on
 * the backend (the server is authoritative; this is display-only).
 */
const SPECIES_FOR_ROOM_TYPE = {
  dog_standard: "dog",
  dog_large: "dog",
  dog_family: "dog",
  daycare_dog: "dog",
  cat_condo: "cat",
  cat_suite: "cat",
  daycare_cat: "cat",
  daycare_mixed: "dog, cat",
  small_pet: "bird, fish, reptile, other",
};

const formatCurrency = (value) => `₱${Number(value || 0).toFixed(2)}`;

/**
 * Unified service-catalog management for every staff role.
 *
 * Props:
 *   apiBase       — role endpoint prefix ("/receptionist" | "/manager" |
 *                   "/veterinary" | "/admin"). All mounts hit the same
 *                   canonical backend controllers.
 *   categoryScope — "all" shows every category; "vet" limits forms to
 *                   medical categories (the backend enforces this too).
 *   tabs          — which tabs to render; vets pass ["services"] since the
 *                   veterinary mount exposes no room endpoints.
 */
const ServiceCatalogManager = ({
  apiBase = "/receptionist",
  categoryScope = "all",
  tabs = ["services", "rooms"],
  title = "Manage Services",
  subtitle = "Configure the service catalog, hotel rooms, and boarding options",
}) => {
  const visibleTabs = ALL_TABS.filter((t) => tabs.includes(t.key));
  const [activeTab, setActiveTab] = useState(visibleTabs[0]?.key || "services");
  // The entity currently being managed — drives endpoint, form, and table.
  // "rooms" is the boarding/daycare room catalog; legacy hotel_rooms are
  // deprecated for new bookings and not managed here.
  const entity = activeTab === "services" ? "services" : "boarding-rooms";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [deletingKey, setDeletingKey] = useState("");

  // Services
  const [services, setServices] = useState([]);
  const [categories, setCategories] = useState([]);
  const [serviceSummary, setServiceSummary] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("all");

  // Boarding rooms
  const [boardingRooms, setBoardingRooms] = useState([]);
  const [boardingMeta, setBoardingMeta] = useState({ roomTypes: [], hotelCategories: [] });

  // Form modal
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null); // null | 'new' handled by editing===null + record
  const [form, setForm] = useState({});

  const showMessage = useCallback((type, message) => {
    if (type === "success") {
      setSuccess(message);
      window.clearTimeout(window.scmSuccessTimer);
      window.scmSuccessTimer = window.setTimeout(() => setSuccess(""), 3000);
    } else {
      setError(message);
      window.clearTimeout(window.scmErrorTimer);
      window.scmErrorTimer = window.setTimeout(() => setError(""), 5000);
    }
  }, []);

  const fetchServices = useCallback(async () => {
    const res = await apiRequest(`${apiBase}/services`);
    const list = normalizeList(res, ["data"]);
    setServices(list);
    const all = res?.categories || [];
    const vet = res?.vet_categories || all;
    setCategories(categoryScope === "vet" ? vet : all);
    setServiceSummary(res?.summary || null);
  }, [apiBase, categoryScope]);

  const fetchBoardingRooms = useCallback(async () => {
    const res = await apiRequest(`${apiBase}/boarding-rooms`);
    setBoardingRooms(normalizeList(res, ["rooms"]));
    setBoardingMeta({
      roomTypes: res?.valid_room_types || [],
      hotelCategories: res?.hotel_categories || [],
    });
  }, [apiBase]);

  const fetchTab = useCallback(
    async (tab, { silent = false } = {}) => {
      if (!silent) setLoading(true);
      try {
        if (tab === "services") await fetchServices();
        else await fetchBoardingRooms();
      } catch (err) {
        showMessage("error", err.message || "Failed to load data.");
      } finally {
        setLoading(false);
      }
    },
    [fetchServices, fetchBoardingRooms, showMessage]
  );

  useEffect(() => {
    fetchTab(entity);
    setSearch("");
    setCategoryFilter("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  // ─── Form helpers ──────────────────────────────────────────────────────

  const openCreate = () => {
    setEditing(null);
    if (entity === "services") {
      setForm({ ...EMPTY_SERVICE_FORM, category: categories[0] || "" });
    } else {
      setForm({ ...EMPTY_BOARDING_FORM });
    }
    setImageFile(null);
    setImagePreview("");
    setFormOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({ ...item });
    setImageFile(null);
    setImagePreview(item.image_url || "");
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    setForm({});
    setImageFile(null);
    setImagePreview("");
  };

  const pickImage = (file) => {
    setImageFile(file || null);
    setImagePreview(file ? URL.createObjectURL(file) : "");
  };

  const updateField = (field, value) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // ─── Save ──────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    const isNew = !editing;
    try {
      let endpoint = "";
      let payload = { ...form };

      if (entity === "services") {
        endpoint = isNew ? `${apiBase}/services` : `${apiBase}/services/${editing.id}`;
        payload.price = Number(payload.price) || 0;
        payload.duration_minutes = payload.duration_minutes
          ? Number(payload.duration_minutes)
          : null;
      } else {
        endpoint = isNew ? `${apiBase}/boarding-rooms` : `${apiBase}/boarding-rooms/${editing.id}`;
        payload.daily_rate = Number(payload.daily_rate) || 0;
        payload.max_capacity = Number(payload.max_capacity) || 1;
        payload.total_rooms = Number(payload.total_rooms) || 1;
        // Species is derived from room_type server-side — never sent.
        delete payload.allowed_species;
      }

      if (imageFile) {
        const fd = new FormData();
        Object.entries(payload).forEach(([k, v]) => {
          if (v === null || v === undefined) return;
          fd.append(k, typeof v === "boolean" ? (v ? "1" : "0") : v);
        });
        fd.append("image", imageFile);
        if (!isNew) fd.append("_method", "PUT");
        await apiRequest(endpoint, "POST", fd);
      } else {
        await apiRequest(endpoint, {
          method: isNew ? "POST" : "PUT",
          body: JSON.stringify(payload),
        });
      }
      showMessage("success", isNew ? "Created successfully." : "Updated successfully.");
      closeForm();
      fetchTab(entity, { silent: true });
    } catch (err) {
      showMessage("error", err.message || "Operation failed.");
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete (reason always required by the backend) ────────────────────

  const handleDelete = async (item) => {
    const isService = entity === "services";
    const itemName =
      item.name || item.room_name || item.room_code || item.room_number || `#${item.id}`;
    const itemType = isService ? "service" : "boarding room";

    const promptTitle = isService ? "Delete Service" : "Delete Boarding Room";
    const confirmLabel = isService ? "Delete Service" : "Delete Room";

    const reason = await showReasonPrompt(
      `Delete ${itemType} "${itemName}"? Existing booking history will be retained. This action is logged — please state why.`,
      promptTitle,
      confirmLabel,
      isService ? SERVICE_DELETE_REASONS : null
    );
    if (reason === null) return;

    const base = entity;

    setDeletingKey(`${entity}:${item.id}`);
    try {
      await apiRequest(`${apiBase}/${base}/${item.id}`, {
        method: "DELETE",
        body: JSON.stringify({ reason }),
      });
      showMessage("success", "Deleted successfully.");
      fetchTab(entity, { silent: true });
    } catch (err) {
      showMessage("error", err.message || "Delete failed.");
    } finally {
      setDeletingKey("");
    }
  };

  // ─── Toggle active / status ────────────────────────────────────────────

  const toggleService = async (service) => {
    const disabling = !!service.is_active;
    let reason = null;
    if (disabling) {
      reason = await showReasonPrompt(
        `Disable "${service.name}"? It will be unavailable for new bookings but kept on record. This action is logged — please state why.`,
        "Disable Service",
        "Disable Service",
        SERVICE_DISABLE_REASONS
      );
      if (reason === null) return;
    }
    try {
      await apiRequest(`${apiBase}/services/${service.id}`, {
        method: "PUT",
        body: JSON.stringify({
          is_active: !disabling,
          ...(reason ? { reason } : {}),
        }),
      });
      showMessage("success", `Service ${disabling ? "disabled" : "enabled"}.`);
      fetchServices();
    } catch (err) {
      showMessage("error", err.message || "Toggle failed.");
    }
  };

  const toggleBoardingRoom = async (room) => {
    const disabling = !!room.is_active;
    let reason = null;
    if (disabling) {
      reason = await showReasonPrompt(
        `Deactivate boarding room "${room.room_name || room.room_code}"? It will be unavailable for new bookings. Please state why.`,
        "Deactivate Room",
        "Deactivate",
        SERVICE_DISABLE_REASONS
      );
      if (reason === null) return;
    }
    try {
      await apiRequest(`${apiBase}/boarding-rooms/${room.id}`, {
        method: "PUT",
        body: JSON.stringify({
          is_active: !disabling,
          ...(reason ? { reason } : {}),
        }),
      });
      showMessage("success", `Room ${disabling ? "deactivated" : "activated"}.`);
      fetchBoardingRooms();
    } catch (err) {
      showMessage("error", err.message || "Toggle failed.");
    }
  };

  // ─── Filtering & stats ─────────────────────────────────────────────────

  const keyword = search.trim().toLowerCase();

  const filteredServices = useMemo(
    () =>
      services.filter(
        (s) =>
          (categoryFilter === "all" || s.category === categoryFilter) &&
          (!keyword ||
            s.name?.toLowerCase().includes(keyword) ||
            s.category?.toLowerCase().includes(keyword))
      ),
    [services, keyword, categoryFilter]
  );

  const filteredBoardingRooms = useMemo(
    () =>
      boardingRooms.filter(
        (r) =>
          !keyword ||
          r.room_name?.toLowerCase().includes(keyword) ||
          r.room_code?.toLowerCase().includes(keyword) ||
          r.room_type?.toLowerCase().includes(keyword)
      ),
    [boardingRooms, keyword]
  );

  // ─── Render: tables ────────────────────────────────────────────────────

  const renderServicesTable = () => (
    <div className="scm-table-wrap">
      <table className="scm-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Category</th>
            <th>Price</th>
            <th>Duration</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredServices.map((service) => (
            <tr key={service.id} className={!service.is_active ? "scm-row--inactive" : ""}>
              <td>
                <div className="scm-name-cell">
                  {service.image_url && (
                    <img className="scm-thumb" src={resolveAvatarUrl(service.image_url)} alt="" />
                  )}
                  <div>
                    <strong>{service.name}</strong>
                    {service.description && <small>{service.description}</small>}
                  </div>
                </div>
              </td>
              <td>{service.category}</td>
              <td>{formatCurrency(service.price)}</td>
              <td>{service.duration_minutes ? `${service.duration_minutes} min` : "—"}</td>
              <td>
                <StatusBadge className="status-badge" variant={service.is_active ? "success" : "neutral"}>
                  {service.is_active ? "Active" : "Inactive"}
                </StatusBadge>
              </td>
              <td>
                <RowActionPopover rowLabel={service.name}>
                  <div className="scm-actions">
                    <button
                      type="button"
                      className="scm-action-btn toggle-btn"
                      onClick={() => toggleService(service)}
                      title={service.is_active ? "Disable" : "Enable"}
                    >
                      <FontAwesomeIcon icon={service.is_active ? faToggleOn : faToggleOff} />
                    </button>
                    <button
                      type="button"
                      className="scm-action-btn edit-btn"
                      onClick={() => openEdit(service)}
                      title="Edit"
                    >
                      <FontAwesomeIcon icon={faEdit} />
                    </button>
                    <button
                      type="button"
                      className="scm-action-btn scm-action-btn--danger delete-btn"
                      onClick={() => handleDelete(service)}
                      disabled={
                        deletingKey === `services:${service.id}` ||
                        service.has_active_appointments
                      }
                      title={
                        service.has_active_appointments
                          ? "Has active appointments — disable instead"
                          : "Delete"
                      }
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </div>
                </RowActionPopover>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {filteredServices.length === 0 && (
        <div className="scm-empty">
          <FontAwesomeIcon icon={faWrench} size="3x" />
          <h3>No services found</h3>
          <p>Try adjusting your search or add a new service.</p>
        </div>
      )}
    </div>
  );

  const renderBoardingRoomsTable = () => (
    <div className="scm-table-wrap">
      <table className="scm-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Type</th>
            <th>Category</th>
            <th>Species</th>
            <th>Capacity</th>
            <th>Available</th>
            <th>Daily Rate</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredBoardingRooms.map((room) => (
            <tr key={room.id} className={!room.is_active ? "scm-row--inactive" : ""}>
              <td>{room.room_code}</td>
              <td>
                <div className="scm-name-cell">
                  {room.image_url && (
                    <img className="scm-thumb" src={resolveAvatarUrl(room.image_url)} alt="" />
                  )}
                  <div>
                    <strong>{room.room_name}</strong>
                    {room.notes && <small>{room.notes}</small>}
                  </div>
                </div>
              </td>
              <td className="scm-cap">{String(room.room_type || "").replace(/_/g, " ")}</td>
              <td className="scm-cap">
                {String(room.hotel_category || "").replace(/_/g, " ")}
              </td>
              <td>{Array.isArray(room.allowed_species) ? room.allowed_species.join(", ") : room.allowed_species}</td>
              <td>{room.max_capacity}</td>
              <td>
                {room.available_rooms ?? room.total_rooms}/{room.total_rooms}
              </td>
              <td>{formatCurrency(room.daily_rate)}</td>
              <td>
                <StatusBadge className="status-badge" variant={room.is_active ? "success" : "neutral"}>
                  {room.is_active ? "Active" : "Inactive"}
                </StatusBadge>
              </td>
              <td>
                <RowActionPopover rowLabel={room.room_name || room.room_code}>
                  <div className="scm-actions">
                    <button
                      type="button"
                      className="scm-action-btn toggle-btn"
                      onClick={() => toggleBoardingRoom(room)}
                      title={room.is_active ? "Deactivate" : "Activate"}
                    >
                      <FontAwesomeIcon icon={room.is_active ? faToggleOn : faToggleOff} />
                    </button>
                    <button
                      type="button"
                      className="scm-action-btn edit-btn"
                      onClick={() => openEdit(room)}
                      title="Edit"
                    >
                      <FontAwesomeIcon icon={faEdit} />
                    </button>
                    <button
                      type="button"
                      className="scm-action-btn scm-action-btn--danger delete-btn"
                      onClick={() => handleDelete(room)}
                      disabled={deletingKey === `boarding-rooms:${room.id}`}
                      title="Delete"
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </div>
                </RowActionPopover>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {filteredBoardingRooms.length === 0 && (
        <div className="scm-empty">
          <FontAwesomeIcon icon={faPaw} size="3x" />
          <h3>No boarding rooms found</h3>
          <p>Try adjusting your search or add a new room type.</p>
        </div>
      )}
    </div>
  );

  // ─── Render: form fields ───────────────────────────────────────────────


  const renderPhotoField = () => (
    <div className="scm-field">
      <label>Photo</label>
      <label className="scm-photo-drop">
        {imagePreview ? (
          <img className="scm-photo-preview" src={resolveAvatarUrl(imagePreview)} alt="Preview" />
        ) : (
          <span className="scm-photo-placeholder">
            <FontAwesomeIcon icon={faImage} />
            Click to upload a photo
          </span>
        )}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => pickImage(e.target.files?.[0] || null)}
        />
      </label>
      <small className="scm-helper">JPG, PNG or WebP — max 5 MB.</small>
    </div>
  );

  const renderServiceForm = () => (
    <>
      <div className="scm-form-grid">
        <div className="scm-field">
          <label>Name *</label>
          <input
            type="text"
            value={form.name || ""}
            onChange={(e) => updateField("name", e.target.value)}
            required
            placeholder="e.g. Full Grooming Small Breed"
          />
        </div>
        <div className="scm-field">
          <label>Category *</label>
          <select
            value={form.category || ""}
            onChange={(e) => updateField("category", e.target.value)}
            required
          >
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="scm-field">
          <label>Price (₱) *</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.price ?? ""}
            onChange={(e) => updateField("price", e.target.value)}
            required
            placeholder="0.00"
          />
        </div>
        <div className="scm-field">
          <label>Duration (minutes)</label>
          <input
            type="number"
            min="0"
            value={form.duration_minutes ?? ""}
            onChange={(e) => updateField("duration_minutes", e.target.value)}
            placeholder="e.g. 60"
          />
        </div>
      </div>
      <div className="scm-field">
        <label>Description</label>
        <textarea
          rows={3}
          value={form.description || ""}
          onChange={(e) => updateField("description", e.target.value)}
          placeholder="Brief description of the service..."
        />
      </div>
      {renderPhotoField()}
      <label className="scm-toggle">
        <input
          type="checkbox"
          checked={!!form.is_active}
          onChange={(e) => updateField("is_active", e.target.checked)}
        />
        <span>Active</span>
      </label>
    </>
  );

  const renderBoardingForm = () => (
    <>
      <div className="scm-form-grid">
        <div className="scm-field">
          <label>Room Code *</label>
          <input
            type="text"
            value={form.room_code || ""}
            onChange={(e) => updateField("room_code", e.target.value)}
            required
            placeholder="e.g. DOG-STD-01"
          />
        </div>
        <div className="scm-field">
          <label>Room Name *</label>
          <input
            type="text"
            value={form.room_name || ""}
            onChange={(e) => updateField("room_name", e.target.value)}
            required
            placeholder="e.g. Standard Kennel A"
          />
        </div>
        <div className="scm-field">
          <label>Type *</label>
          <select
            value={form.room_type || ""}
            onChange={(e) => updateField("room_type", e.target.value)}
            required
          >
            {(boardingMeta.roomTypes.length
              ? boardingMeta.roomTypes
              : [{ value: form.room_type, label: form.room_type }]
            ).map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div className="scm-field">
          <label>Hotel Category</label>
          <select
            value={form.hotel_category || ""}
            onChange={(e) => updateField("hotel_category", e.target.value)}
          >
            {boardingMeta.hotelCategories.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div className="scm-field">
          <label>Max Pets per Room *</label>
          <input
            type="number"
            min="1"
            value={form.max_capacity ?? 1}
            onChange={(e) => updateField("max_capacity", e.target.value)}
            required
          />
        </div>
        <div className="scm-field">
          <label>Total Rooms *</label>
          <input
            type="number"
            min="1"
            value={form.total_rooms ?? 1}
            onChange={(e) => updateField("total_rooms", e.target.value)}
            required
          />
        </div>
        <div className="scm-field">
          <label>Daily Rate (₱) *</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.daily_rate ?? ""}
            onChange={(e) => updateField("daily_rate", e.target.value)}
            required
            placeholder="0.00"
          />
        </div>
      </div>
      <div className="scm-field">
        <label>Allowed Species</label>
        <p className="scm-hint">
          Set automatically by room type — <strong>{SPECIES_FOR_ROOM_TYPE[form.room_type] || "other"}</strong>.
        </p>
      </div>
      <div className="scm-field">
        <label>Notes</label>
        <textarea
          rows={2}
          value={form.notes || ""}
          onChange={(e) => updateField("notes", e.target.value)}
        />
      </div>
      {renderPhotoField()}
      <div className="scm-toggle-row">
        <label className="scm-toggle">
          <input
            type="checkbox"
            checked={!!form.is_active}
            onChange={(e) => updateField("is_active", e.target.checked)}
          />
          <span>Active</span>
        </label>
        <label className="scm-toggle">
          <input
            type="checkbox"
            checked={!!form.customer_selectable}
            onChange={(e) => updateField("customer_selectable", e.target.checked)}
          />
          <span>Customer-selectable</span>
        </label>
      </div>
    </>
  );

  const formTitle = `${editing ? "Edit" : "Add"} ${
    entity === "services" ? "Service" : "Boarding Room"
  }`;

  // ─── Stats chips ───────────────────────────────────────────────────────

  const stats = () => {
    if (entity === "services") {
      const s = serviceSummary || {
        total: services.length,
        active: services.filter((x) => x.is_active).length,
        inactive: services.filter((x) => !x.is_active).length,
      };
      return [
        { label: "Total Services", value: s.total },
        { label: "Active", value: s.active },
        { label: "Inactive", value: s.inactive },
      ];
    }
    const total = boardingRooms.length;
    const active = boardingRooms.filter((r) => r.is_active).length;
    const bookable = boardingRooms.reduce(
      (sum, r) => sum + (r.available_rooms ?? 0),
      0
    );
    return [
      { label: "Room Types", value: total },
      { label: "Active", value: active },
      { label: "Inactive", value: total - active },
      { label: "Rooms Available", value: bookable },
    ];
  };

  // ─── Main render ───────────────────────────────────────────────────────

  return (
    <div className="scm-page">
      {(title || subtitle) && (
        <div className="scm-header">
          <div>
            {title && (
              <h1>
                <FontAwesomeIcon icon={faWrench} /> {title}
              </h1>
            )}
            {subtitle && <p>{subtitle}</p>}
          </div>
        </div>
      )}

      {error && (
        <div className="scm-alert scm-alert--error">
          <FontAwesomeIcon icon={faExclamationTriangle} /> {error}
        </div>
      )}
      {success && (
        <div className="scm-alert scm-alert--success">
          <FontAwesomeIcon icon={faCheckCircle} /> {success}
        </div>
      )}

      <div className="scm-tabs">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`scm-tab ${activeTab === tab.key ? "active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <FontAwesomeIcon icon={tab.icon} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="scm-stats">
        {stats().map((s) => (
          <div key={s.label} className="scm-stat">
            <strong>{s.value}</strong>
            <span>{s.label}</span>
          </div>
        ))}
      </div>

      <div className="scm-toolbar">
        <input
          type="text"
          className="scm-search"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {entity === "services" && (
          <select
            className="scm-filter"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
        <button type="button" className="scm-btn scm-btn--primary" onClick={openCreate}>
          <FontAwesomeIcon icon={faPlus} /> Add
        </button>
      </div>

      {loading ? (
        <div className="scm-loading">
          <FontAwesomeIcon icon={faSpinner} spin size="2x" />
          <p>Loading...</p>
        </div>
      ) : entity === "services" ? (
        renderServicesTable()
      ) : (
        renderBoardingRoomsTable()
      )}

      {formOpen && (
        <Modal
          onClose={closeForm}
          title={formTitle}
          icon={editing ? faEdit : faPlus}
          size="lg"
          footer={
            <>
              <button
                type="button"
                className="scm-btn scm-btn--secondary"
                onClick={closeForm}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="scm-btn scm-btn--primary"
                onClick={handleSave}
                disabled={saving}
              >
                <FontAwesomeIcon icon={saving ? faSpinner : faSave} spin={saving} />
                {saving ? " Saving..." : " Save"}
              </button>
            </>
          }
        >
          <div className="scm-form">
            {entity === "services" ? renderServiceForm() : renderBoardingForm()}
          </div>
        </Modal>
      )}
    </div>
  );
};

export default ServiceCatalogManager;
