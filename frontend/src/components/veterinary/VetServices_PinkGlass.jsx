import React, { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faStethoscope,
  faPlus,
  faEdit,
  faTrash,
  faSearch,
  faSpinner,
  faExclamationTriangle,
  faRotateRight,
  faTimes,
  faSave,
  faPaw,
  faClock,
  faTag,
  faCheckCircle,
  faBan,
} from "@fortawesome/free-solid-svg-icons";
import toast from "react-hot-toast";
import { apiRequest } from "../../api/client";
import "./theme.css";
import "./VetServices_PinkGlass.css";


const VetServices = () => {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [serviceToDelete, setServiceToDelete] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    category: "Consultation",
    price: "",
    description: "",
    duration_minutes: "",
  });

  const categories = [
    "all",
    "Consultation",
    "Grooming",
    "Vaccination",
    "Surgery",
    "Dental",
    "Boarding",
    "Other"
  ];

  const fetchServices = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
        setError("");
      }

      const response = await apiRequest("/admin/services");
      setServices(response.data || []);
    } catch (err) {
      console.error("Failed to fetch services:", err);
      setError("Failed to load services. Please try again.");
      setServices([]);
      
      if (!silent) {
        toast.error("Failed to load services.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchServices(true);
  };

  const handleCreateService = async () => {
    try {
      const response = await apiRequest("/admin/services", {
        method: "POST",
        body: JSON.stringify({
          ...formData,
          price: parseFloat(formData.price),
          duration_minutes: parseInt(formData.duration_minutes) || null,
          is_active: true,
        }),
      });

      setServices([...services, response]);
      setShowCreateModal(false);
      resetForm();
      toast.success("Service created successfully!");
    } catch (err) {
      console.error("Failed to create service:", err);
      toast.error("Failed to create service. Please try again.");
    }
  };

  const handleUpdateService = async () => {
    try {
      const response = await apiRequest(`/admin/services/${selectedService.id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...formData,
          price: parseFloat(formData.price),
          duration_minutes: parseInt(formData.duration_minutes) || null,
        }),
      });

      setServices(services.map(service => 
        service.id === selectedService.id ? response : service
      ));
      setShowEditModal(false);
      resetForm();
      toast.success("Service updated successfully!");
    } catch (err) {
      console.error("Failed to update service:", err);
      toast.error("Failed to update service. Please try again.");
    }
  };

  const handleDeleteService = (serviceId) => {
    setServiceToDelete(serviceId);
    setShowDeleteModal(true);
  };

  const confirmDeleteService = async () => {
    if (!serviceToDelete) return;

    try {
      await apiRequest(`/admin/services/${serviceToDelete}`, {
        method: "DELETE",
      });

      setServices(services.filter(service => service.id !== serviceToDelete));
      setShowDeleteModal(false);
      setServiceToDelete(null);
      toast.success("Service deleted successfully!");
    } catch (err) {
      console.error("Failed to delete service:", err);
      toast.error("Failed to delete service. Please try again.");
    }
  };

  const cancelDeleteService = () => {
    setShowDeleteModal(false);
    setServiceToDelete(null);
  };

  const handleToggleService = async (serviceId, currentStatus) => {
    try {
      await apiRequest(`/admin/services/${serviceId}`, {
        method: "PUT",
        body: JSON.stringify({
          is_active: !currentStatus,
        }),
      });

      setServices(services.map(service => 
        service.id === serviceId 
          ? { ...service, is_active: !currentStatus }
          : service
      ));
      
      toast.success(`Service ${!currentStatus ? 'activated' : 'deactivated'} successfully!`);
    } catch (err) {
      console.error("Failed to toggle service:", err);
      toast.error("Failed to update service status.");
    }
  };

  const openEditModal = (service) => {
    setSelectedService(service);
    setFormData({
      name: service.name,
      category: service.category,
      price: service.price,
      description: service.description || "",
      duration_minutes: service.duration_minutes || "",
    });
    setShowEditModal(true);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      category: "Consultation",
      price: "",
      description: "",
      duration_minutes: "",
    });
    setSelectedService(null);
  };

  const filteredServices = services.filter(service => {
    const matchesSearch = service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         service.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === "all" || service.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const modalFormFields = [
    { label: "Service Name *", key: "name", type: "text", placeholder: "e.g., General Consultation", required: true },
    { label: "Price (₱) *", key: "price", type: "number", placeholder: "0.00", required: true, step: "0.01", min: "0" },
    { label: "Duration (minutes)", key: "duration_minutes", type: "number", placeholder: "e.g., 30", min: "0" },
  ];

  const renderModalBody = () => (
    <div className="vs-modal-body">
      {modalFormFields.map(({ label, key, type, placeholder, step, min, required }) => (
        <div key={key} className="vs-form-group">
          <label className="vs-label">{label}</label>
          <input
            className="vs-input"
            type={type}
            step={step}
            min={min}
            value={formData[key]}
            onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
            placeholder={placeholder}
            required={required}
          />
        </div>
      ))}
      <div className="vs-form-group">
        <label className="vs-label">Category *</label>
        <select
          className="vs-select"
          value={formData.category}
          onChange={(e) => setFormData({ ...formData, category: e.target.value })}
        >
          {categories.filter(cat => cat !== "all").map(category => (
            <option key={category} value={category}>{category}</option>
          ))}
        </select>
      </div>
      <div className="vs-form-group">
        <label className="vs-label">Description</label>
        <textarea
          className="vs-textarea"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Describe the service and what it includes..."
        />
      </div>
    </div>
  );

  return (
    <div className="vs-page">
      <div className="vs-hero">
        <div className="vs-hero-content">
          <h1 className="vs-hero-title">Services Management</h1>
          <p className="vs-hero-subtitle">
            Manage veterinary services offered to customers. Create, edit, and organize services that appear in booking forms.
          </p>
          <div className="vs-hero-actions">
            <button className="vs-btn vs-btn--secondary" onClick={handleRefresh} disabled={refreshing}>
              <FontAwesomeIcon icon={faRotateRight} className={refreshing ? "vs-spin" : ""} />
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
            <button className="vs-btn vs-btn--primary" onClick={() => setShowCreateModal(true)}>
              <FontAwesomeIcon icon={faPlus} />
              Create Service
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="vs-error-alert">
          <FontAwesomeIcon icon={faExclamationTriangle} />
          <span>{error}</span>
        </div>
      )}

      <div className="vs-search-section">
        <div className="vs-search-container">
          <div className="vs-search-icon"><FontAwesomeIcon icon={faSearch} /></div>
          <input
            className="vs-search-input"
            type="text"
            placeholder="Search services by name or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <select
            className="vs-filter-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            {categories.map(category => (
              <option key={category} value={category}>
                {category === "all" ? "All Categories" : category}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="vs-loading-state">
          <FontAwesomeIcon icon={faSpinner} className="vs-spin" />
          <p>Loading services...</p>
        </div>
      ) : filteredServices.length === 0 ? (
        <div className="vs-empty-state">
          <div className="vs-empty-icon"><FontAwesomeIcon icon={faStethoscope} /></div>
          <h3>No services found</h3>
          <p>{searchTerm || categoryFilter !== "all" ? "Try adjusting your search or filters." : "Start by creating your first service."}</p>
        </div>
      ) : (
        <div className="vs-services-grid">
          {filteredServices.map((service) => (
            <div key={service.id} className="vs-service-card">
              <div className="vs-service-header">
                <div className="vs-service-info">
                  <h3 className="vs-service-name">{service.name}</h3>
                  <span className="vs-service-category">
                    <FontAwesomeIcon icon={faTag} />
                    {service.category}
                  </span>
                </div>
                <div className="vs-service-actions">
                  <button
                    className={`vs-action-btn ${service.is_active ? "vs-action-btn--toggle-on" : "vs-action-btn--toggle-off"}`}
                    onClick={() => handleToggleService(service.id, service.is_active)}
                    title={service.is_active ? "Deactivate service" : "Activate service"}
                  >
                    <FontAwesomeIcon icon={service.is_active ? faCheckCircle : faBan} />
                  </button>
                  <button className="vs-action-btn vs-action-btn--edit" onClick={() => openEditModal(service)} title="Edit service">
                    <FontAwesomeIcon icon={faEdit} />
                  </button>
                  <button className="vs-action-btn vs-action-btn--delete" onClick={() => handleDeleteService(service.id)} title="Delete service">
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </div>
              </div>

              <div className="vs-service-details">
                <div className="vs-detail-item">
                  <div className="vs-detail-icon"><FontAwesomeIcon icon={faPaw} /></div>
                  <div className="vs-detail-content">
                    <div className="vs-detail-label">Price</div>
                    <div className="vs-detail-value">₱{parseFloat(service.price).toFixed(2)}</div>
                  </div>
                </div>
                {service.duration_minutes && (
                  <div className="vs-detail-item">
                    <div className="vs-detail-icon"><FontAwesomeIcon icon={faClock} /></div>
                    <div className="vs-detail-content">
                      <div className="vs-detail-label">Duration</div>
                      <div className="vs-detail-value">{service.duration_minutes} minutes</div>
                    </div>
                  </div>
                )}
              </div>

              {service.description && (
                <p className="vs-service-description">{service.description}</p>
              )}

              <span className={`vs-service-status ${service.is_active ? "vs-service-status--active" : "vs-service-status--inactive"}`}>
                <FontAwesomeIcon icon={service.is_active ? faCheckCircle : faBan} />
                {service.is_active ? "Active" : "Inactive"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Create Service Modal */}
      {showCreateModal && (
        <div className="vs-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="vs-modal" onClick={(e) => e.stopPropagation()}>
            <div className="vs-modal-header">
              <h2 className="vs-modal-title">Create New Service</h2>
              <button className="vs-modal-close" onClick={() => setShowCreateModal(false)}><FontAwesomeIcon icon={faTimes} /></button>
            </div>
            {renderModalBody()}
            <div className="vs-modal-actions">
              <button className="vs-btn vs-btn--secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button className="vs-btn vs-btn--primary" onClick={handleCreateService}>
                <FontAwesomeIcon icon={faSave} /> Create Service
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Service Modal */}
      {showEditModal && (
        <div className="vs-modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="vs-modal" onClick={(e) => e.stopPropagation()}>
            <div className="vs-modal-header">
              <h2 className="vs-modal-title">Edit Service</h2>
              <button className="vs-modal-close" onClick={() => setShowEditModal(false)}><FontAwesomeIcon icon={faTimes} /></button>
            </div>
            {renderModalBody()}
            <div className="vs-modal-actions">
              <button className="vs-btn vs-btn--secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
              <button className="vs-btn vs-btn--primary" onClick={handleUpdateService}>
                <FontAwesomeIcon icon={faSave} /> Update Service
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="vs-modal-overlay" onClick={cancelDeleteService}>
          <div className="vs-modal" onClick={(e) => e.stopPropagation()}>
            <div className="vs-modal-header">
              <h2 className="vs-modal-title">Delete Service</h2>
              <button className="vs-modal-close" onClick={cancelDeleteService}><FontAwesomeIcon icon={faTimes} /></button>
            </div>
            <div className="vs-modal-body">
              <p>Are you sure you want to delete this service? This action cannot be undone.</p>
            </div>
            <div className="vs-modal-actions">
              <button className="vs-btn vs-btn--secondary" onClick={cancelDeleteService}>Cancel</button>
              <button className="vs-btn vs-btn--danger" onClick={confirmDeleteService}>
                <FontAwesomeIcon icon={faTrash} /> Delete Service
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VetServices;