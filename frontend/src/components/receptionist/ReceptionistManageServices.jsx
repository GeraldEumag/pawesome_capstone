import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faEdit,
  faTrash,
  faSave,
  faSyncAlt,
  faStethoscope,
  faHotel,
  faPaw,
  faWrench,
  faToggleOn,
  faToggleOff,
  faSearch,
  faSpinner,
  faTimes,
  faBed,
  faCut,
  faCheckCircle,
  faExclamationTriangle,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import { showConfirm } from "../../utils/alert.jsx";
import "./ReceptionistManageServices.css";

const TABS = [
  { key: "services", label: "Services", icon: faWrench },
  { key: "hotel-rooms", label: "Hotel Rooms", icon: faHotel },
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

const ReceptionistManageServices = () => {
  const [activeTab, setActiveTab] = useState("services");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Services state
  const [services, setServices] = useState([]);
  const [serviceSearch, setServiceSearch] = useState("");
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [serviceForm, setServiceForm] = useState({
    name: "",
    category: "Grooming",
    price: "",
    description: "",
    duration_minutes: "",
    is_active: true,
  });

  // Hotel rooms state
  const [rooms, setRooms] = useState([]);
  const [roomSearch, setRoomSearch] = useState("");
  const [showRoomForm, setShowRoomForm] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [roomForm, setRoomForm] = useState({
    room_number: "",
    name: "",
    description: "",
    type: "standard",
    size: "medium",
    capacity: 1,
    daily_rate: "",
    status: "available",
    amenities: [],
    notes: "",
  });

  const showMessage = (type, message) => {
    if (type === "success") {
      setSuccess(message);
      window.clearTimeout(window.servicesSuccessTimer);
      window.servicesSuccessTimer = window.setTimeout(() => setSuccess(""), 3000);
    } else {
      setError(message);
      window.clearTimeout(window.servicesErrorTimer);
      window.servicesErrorTimer = window.setTimeout(() => setError(""), 5000);
    }
  };

  // Fetch data on mount
  useEffect(() => {
    fetchServices();
    fetchRooms();
  }, []);

  const fetchServices = async () => {
    try {
      setLoading(true);
      const response = await apiRequest("/receptionist/services");
      setServices(response.data || []);
    } catch (err) {
      showMessage("error", "Failed to load services.");
    } finally {
      setLoading(false);
    }
  };

  const fetchRooms = async () => {
    try {
      const response = await apiRequest("/receptionist/hotel-rooms");
      setRooms(response.rooms || []);
    } catch (err) {
      console.error("Failed to load rooms:", err);
    }
  };

  // Service CRUD operations
  const handleSaveService = async () => {
    try {
      if (editingService) {
        await apiRequest(`/receptionist/services/${editingService.id}`, {
          method: "PUT",
          body: JSON.stringify(serviceForm),
        });
        showMessage("success", "Service updated successfully");
      } else {
        await apiRequest("/receptionist/services", {
          method: "POST",
          body: JSON.stringify(serviceForm),
        });
        showMessage("success", "Service created successfully");
      }
      await fetchServices();
      closeServiceForm();
    } catch (err) {
      showMessage("error", err.message || "Failed to save service");
    }
  };

  const handleDeleteService = async (id) => {
    if (!(await showConfirm("Are you sure you want to delete this service?"))) return;
    try {
      await apiRequest(`/receptionist/services/${id}`, { method: "DELETE" });
      showMessage("success", "Service deleted successfully");
      await fetchServices();
    } catch (err) {
      showMessage("error", err.message || "Failed to delete service");
    }
  };

  const handleToggleServiceStatus = async (service) => {
    try {
      await apiRequest(`/receptionist/services/${service.id}`, {
        method: "PUT",
        body: JSON.stringify({ is_active: !service.is_active }),
      });
      showMessage("success", `Service ${service.is_active ? "disabled" : "enabled"}`);
      await fetchServices();
    } catch (err) {
      showMessage("error", err.message || "Failed to toggle service status");
    }
  };

  // Room CRUD operations
  const handleSaveRoom = async () => {
    try {
      if (editingRoom) {
        await apiRequest(`/receptionist/hotel-rooms/${editingRoom.id}`, {
          method: "PUT",
          body: JSON.stringify(roomForm),
        });
        showMessage("success", "Room updated successfully");
      } else {
        await apiRequest("/receptionist/hotel-rooms", {
          method: "POST",
          body: JSON.stringify(roomForm),
        });
        showMessage("success", "Room created successfully");
      }
      await fetchRooms();
      closeRoomForm();
    } catch (err) {
      showMessage("error", err.message || "Failed to save room");
    }
  };

  const handleDeleteRoom = async (id) => {
    if (!(await showConfirm("Are you sure you want to delete this room?"))) return;
    try {
      await apiRequest(`/receptionist/hotel-rooms/${id}`, { method: "DELETE" });
      showMessage("success", "Room deleted successfully");
      await fetchRooms();
    } catch (err) {
      showMessage("error", err.message || "Failed to delete room");
    }
  };

  // Form helpers
  const openServiceForm = (service = null) => {
    if (service) {
      setEditingService(service);
      setServiceForm({
        name: service.name || "",
        category: service.category || "Grooming",
        price: service.price || "",
        description: service.description || "",
        duration_minutes: service.duration_minutes || "",
        is_active: service.is_active !== false,
      });
    } else {
      setEditingService(null);
      setServiceForm({
        name: "",
        category: "Grooming",
        price: "",
        description: "",
        duration_minutes: "",
        is_active: true,
      });
    }
    setShowServiceForm(true);
  };

  const closeServiceForm = () => {
    setShowServiceForm(false);
    setEditingService(null);
  };

  const openRoomForm = (room = null) => {
    if (room) {
      setEditingRoom(room);
      setRoomForm({
        room_number: room.room_number || "",
        name: room.name || "",
        description: room.description || "",
        type: room.type || "standard",
        size: room.size || "medium",
        capacity: room.capacity || 1,
        daily_rate: room.daily_rate || "",
        status: room.status || "available",
        amenities: room.amenities || [],
        notes: room.notes || "",
      });
    } else {
      setEditingRoom(null);
      setRoomForm({
        room_number: "",
        name: "",
        description: "",
        type: "standard",
        size: "medium",
        capacity: 1,
        daily_rate: "",
        status: "available",
        amenities: [],
        notes: "",
      });
    }
    setShowRoomForm(true);
  };

  const closeRoomForm = () => {
    setShowRoomForm(false);
    setEditingRoom(null);
  };

  // Filter functions
  const filteredServices = useMemo(() => {
    const keyword = serviceSearch.toLowerCase();
    return services.filter(
      (s) =>
        s.name.toLowerCase().includes(keyword) ||
        s.category.toLowerCase().includes(keyword)
    );
  }, [services, serviceSearch]);

  const filteredRooms = useMemo(() => {
    const keyword = roomSearch.toLowerCase();
    return rooms.filter(
      (r) =>
        r.name.toLowerCase().includes(keyword) ||
        r.room_number.toLowerCase().includes(keyword) ||
        r.type.toLowerCase().includes(keyword)
    );
  }, [rooms, roomSearch]);

  // Stats
  const serviceStats = useMemo(() => {
    const total = services.length;
    const active = services.filter((s) => s.is_active).length;
    const inactive = total - active;
    const byCategory = {};
    services.forEach((s) => {
      byCategory[s.category] = (byCategory[s.category] || 0) + 1;
    });
    return { total, active, inactive, byCategory };
  }, [services]);

  const roomStats = useMemo(() => {
    const total = rooms.length;
    const available = rooms.filter((r) => r.status === "available").length;
    const occupied = rooms.filter((r) => r.status === "occupied").length;
    const maintenance = rooms.filter((r) => r.status === "maintenance").length;
    return { total, available, occupied, maintenance };
  }, [rooms]);

  return (
    <div className="manage-services-page">
      {/* Header */}
      <div className="services-header">
        <div className="header-title">
          <h1>
            <FontAwesomeIcon icon={faWrench} /> Manage Services
          </h1>
          <p>Configure service catalog, hotel rooms, and boarding options</p>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="alert alert-error">
          <FontAwesomeIcon icon={faExclamationTriangle} /> {error}
        </div>
      )}
      {success && (
        <div className="alert alert-success">
          <FontAwesomeIcon icon={faCheckCircle} /> {success}
        </div>
      )}

      {/* Tabs */}
      <div className="services-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`tab-btn ${activeTab === tab.key ? "active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <FontAwesomeIcon icon={tab.icon} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Services Tab */}
      {activeTab === "services" && (
        <div className="tab-content">
          {/* Stats */}
          <div className="services-stats">
            <div className="stat-card">
              <FontAwesomeIcon icon={faWrench} />
              <div>
                <strong>{serviceStats.total}</strong>
                <span>Total Services</span>
              </div>
            </div>
            <div className="stat-card">
              <FontAwesomeIcon icon={faToggleOn} />
              <div>
                <strong>{serviceStats.active}</strong>
                <span>Active</span>
              </div>
            </div>
            <div className="stat-card">
              <FontAwesomeIcon icon={faToggleOff} />
              <div>
                <strong>{serviceStats.inactive}</strong>
                <span>Inactive</span>
              </div>
            </div>
          </div>

          {/* Toolbar */}
          <div className="services-toolbar">
            <div className="search-box">
              <FontAwesomeIcon icon={faSearch} />
              <input
                type="text"
                placeholder="Search services..."
                value={serviceSearch}
                onChange={(e) => setServiceSearch(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="primary-btn"
              onClick={() => openServiceForm()}
            >
              <FontAwesomeIcon icon={faPlus} /> Add Service
            </button>
          </div>

          {/* Services Table */}
          {loading ? (
            <div className="loading-state">
              <FontAwesomeIcon icon={faSpinner} spin size="2x" />
              <p>Loading services...</p>
            </div>
          ) : (
            <div className="services-table-container">
              <table className="services-table">
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
                    <tr key={service.id}>
                      <td>
                        <div className="service-name-cell">
                          {service.category === "Grooming" && (
                            <FontAwesomeIcon icon={faCut} />
                          )}
                          {service.category === "Hotel" && (
                            <FontAwesomeIcon icon={faBed} />
                          )}
                          {(service.category === "Consultation" ||
                            service.category === "Vaccination" ||
                            service.category === "Surgery") && (
                            <FontAwesomeIcon icon={faStethoscope} />
                          )}
                          <span>{service.name}</span>
                        </div>
                      </td>
                      <td>{service.category}</td>
                      <td>₱{service.price}</td>
                      <td>
                        {service.duration_minutes
                          ? `${service.duration_minutes} mins`
                          : "N/A"}
                      </td>
                      <td>
                        <span
                          className={`status-badge ${
                            service.is_active ? "active" : "inactive"
                          }`}
                        >
                          {service.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button
                            type="button"
                            className="action-btn toggle-btn"
                            onClick={() => handleToggleServiceStatus(service)}
                            title={
                              service.is_active ? "Disable" : "Enable"
                            }
                          >
                            <FontAwesomeIcon
                              icon={service.is_active ? faToggleOn : faToggleOff}
                            />
                          </button>
                          <button
                            type="button"
                            className="action-btn edit-btn"
                            onClick={() => openServiceForm(service)}
                            title="Edit"
                          >
                            <FontAwesomeIcon icon={faEdit} />
                          </button>
                          <button
                            type="button"
                            className="action-btn delete-btn"
                            onClick={() => handleDeleteService(service.id)}
                            title="Delete"
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredServices.length === 0 && (
                <div className="empty-state">
                  <FontAwesomeIcon icon={faWrench} size="3x" />
                  <h3>No services found</h3>
                  <p>Try adjusting your search or add a new service</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Hotel Rooms Tab */}
      {activeTab === "hotel-rooms" && (
        <div className="tab-content">
          {/* Stats */}
          <div className="services-stats">
            <div className="stat-card">
              <FontAwesomeIcon icon={faHotel} />
              <div>
                <strong>{roomStats.total}</strong>
                <span>Total Rooms</span>
              </div>
            </div>
            <div className="stat-card">
              <FontAwesomeIcon icon={faCheckCircle} />
              <div>
                <strong>{roomStats.available}</strong>
                <span>Available</span>
              </div>
            </div>
            <div className="stat-card">
              <FontAwesomeIcon icon={faPaw} />
              <div>
                <strong>{roomStats.occupied}</strong>
                <span>Occupied</span>
              </div>
            </div>
            <div className="stat-card">
              <FontAwesomeIcon icon={faWrench} />
              <div>
                <strong>{roomStats.maintenance}</strong>
                <span>Maintenance</span>
              </div>
            </div>
          </div>

          {/* Toolbar */}
          <div className="services-toolbar">
            <div className="search-box">
              <FontAwesomeIcon icon={faSearch} />
              <input
                type="text"
                placeholder="Search rooms..."
                value={roomSearch}
                onChange={(e) => setRoomSearch(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="primary-btn"
              onClick={() => openRoomForm()}
            >
              <FontAwesomeIcon icon={faPlus} /> Add Room
            </button>
          </div>

          {/* Rooms Grid */}
          {loading ? (
            <div className="loading-state">
              <FontAwesomeIcon icon={faSpinner} spin size="2x" />
              <p>Loading rooms...</p>
            </div>
          ) : (
            <div className="rooms-grid">
              {filteredRooms.map((room) => (
                <div key={room.id} className="room-card">
                  <div className="room-header">
                    <div className="room-title">
                      <h3>{room.name}</h3>
                      <span className="room-number">#{room.room_number}</span>
                    </div>
                    <span className={`room-status ${room.status}`}>
                      {room.status}
                    </span>
                  </div>

                  <div className="room-details">
                    <div className="detail-row">
                      <span>Type:</span>
                      <span>{room.type}</span>
                    </div>
                    <div className="detail-row">
                      <span>Size:</span>
                      <span>{room.size}</span>
                    </div>
                    <div className="detail-row">
                      <span>Capacity:</span>
                      <span>{room.capacity} pets</span>
                    </div>
                    <div className="detail-row">
                      <span>Rate:</span>
                      <span>₱{room.daily_rate}/day</span>
                    </div>
                  </div>

                  <div className="room-actions">
                    <button
                      type="button"
                      className="action-btn edit-btn"
                      onClick={() => openRoomForm(room)}
                      title="Edit"
                    >
                      <FontAwesomeIcon icon={faEdit} />
                    </button>
                    <button
                      type="button"
                      className="action-btn delete-btn"
                      onClick={() => handleDeleteRoom(room.id)}
                      title="Delete"
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </div>
                </div>
              ))}

              {filteredRooms.length === 0 && (
                <div className="empty-state">
                  <FontAwesomeIcon icon={faHotel} size="3x" />
                  <h3>No rooms found</h3>
                  <p>Try adjusting your search or add a new room</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Service Form Modal */}
      {showServiceForm && (
        <div className="modal-overlay" onClick={closeServiceForm}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {editingService ? (
                  <>
                    <FontAwesomeIcon icon={faEdit} /> Edit Service
                  </>
                ) : (
                  <>
                    <FontAwesomeIcon icon={faPlus} /> Add Service
                  </>
                )}
              </h2>
              <button
                type="button"
                className="close-btn"
                onClick={closeServiceForm}
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>Service Name *</label>
                <input
                  type="text"
                  value={serviceForm.name}
                  onChange={(e) =>
                    setServiceForm({ ...serviceForm, name: e.target.value })
                  }
                  placeholder="e.g., Full Grooming Package"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Category *</label>
                  <select
                    value={serviceForm.category}
                    onChange={(e) =>
                      setServiceForm({ ...serviceForm, category: e.target.value })
                    }
                  >
                    {SERVICE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Price (₱) *</label>
                  <input
                    type="number"
                    value={serviceForm.price}
                    onChange={(e) =>
                      setServiceForm({ ...serviceForm, price: e.target.value })
                    }
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Duration (minutes)</label>
                  <input
                    type="number"
                    value={serviceForm.duration_minutes}
                    onChange={(e) =>
                      setServiceForm({
                        ...serviceForm,
                        duration_minutes: e.target.value,
                      })
                    }
                    placeholder="e.g., 60"
                    min="0"
                  />
                </div>

                <div className="form-group">
                  <label>Status</label>
                  <div className="toggle-group">
                    <button
                      type="button"
                      className={`toggle-btn ${serviceForm.is_active ? "active" : ""}`}
                      onClick={() =>
                        setServiceForm({ ...serviceForm, is_active: true })
                      }
                    >
                      <FontAwesomeIcon icon={faToggleOn} /> Active
                    </button>
                    <button
                      type="button"
                      className={`toggle-btn ${!serviceForm.is_active ? "inactive" : ""}`}
                      onClick={() =>
                        setServiceForm({ ...serviceForm, is_active: false })
                      }
                    >
                      <FontAwesomeIcon icon={faToggleOff} /> Inactive
                    </button>
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={serviceForm.description}
                  onChange={(e) =>
                    setServiceForm({
                      ...serviceForm,
                      description: e.target.value,
                    })
                  }
                  placeholder="Describe the service..."
                  rows={3}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="secondary-btn"
                onClick={closeServiceForm}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={handleSaveService}
                disabled={!serviceForm.name || !serviceForm.price}
              >
                <FontAwesomeIcon icon={faSave} /> Save Service
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Room Form Modal */}
      {showRoomForm && (
        <div className="modal-overlay" onClick={closeRoomForm}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {editingRoom ? (
                  <>
                    <FontAwesomeIcon icon={faEdit} /> Edit Room
                  </>
                ) : (
                  <>
                    <FontAwesomeIcon icon={faPlus} /> Add Room
                  </>
                )}
              </h2>
              <button
                type="button"
                className="close-btn"
                onClick={closeRoomForm}
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Room Number *</label>
                  <input
                    type="text"
                    value={roomForm.room_number}
                    onChange={(e) =>
                      setRoomForm({ ...roomForm, room_number: e.target.value })
                    }
                    placeholder="e.g., A101"
                  />
                </div>

                <div className="form-group">
                  <label>Room Name *</label>
                  <input
                    type="text"
                    value={roomForm.name}
                    onChange={(e) =>
                      setRoomForm({ ...roomForm, name: e.target.value })
                    }
                    placeholder="e.g., Deluxe Suite 1"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Type *</label>
                  <select
                    value={roomForm.type}
                    onChange={(e) =>
                      setRoomForm({ ...roomForm, type: e.target.value })
                    }
                  >
                    {HOTEL_ROOM_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Size *</label>
                  <select
                    value={roomForm.size}
                    onChange={(e) =>
                      setRoomForm({ ...roomForm, size: e.target.value })
                    }
                  >
                    {HOTEL_ROOM_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size.charAt(0).toUpperCase() + size.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Capacity (pets) *</label>
                  <input
                    type="number"
                    value={roomForm.capacity}
                    onChange={(e) =>
                      setRoomForm({
                        ...roomForm,
                        capacity: parseInt(e.target.value) || 1,
                      })
                    }
                    min="1"
                  />
                </div>

                <div className="form-group">
                  <label>Daily Rate (₱) *</label>
                  <input
                    type="number"
                    value={roomForm.daily_rate}
                    onChange={(e) =>
                      setRoomForm({ ...roomForm, daily_rate: e.target.value })
                    }
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Status</label>
                <select
                  value={roomForm.status}
                  onChange={(e) =>
                    setRoomForm({ ...roomForm, status: e.target.value })
                  }
                >
                  {HOTEL_ROOM_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={roomForm.description}
                  onChange={(e) =>
                    setRoomForm({ ...roomForm, description: e.target.value })
                  }
                  placeholder="Room description..."
                  rows={2}
                />
              </div>

              <div className="form-group">
                <label>Notes</label>
                <textarea
                  value={roomForm.notes}
                  onChange={(e) =>
                    setRoomForm({ ...roomForm, notes: e.target.value })
                  }
                  placeholder="Internal notes..."
                  rows={2}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="secondary-btn"
                onClick={closeRoomForm}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={handleSaveRoom}
                disabled={
                  !roomForm.room_number || !roomForm.name || !roomForm.daily_rate
                }
              >
                <FontAwesomeIcon icon={faSave} /> Save Room
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReceptionistManageServices;
