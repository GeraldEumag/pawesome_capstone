import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import DatePickerInput from "../../components/shared/DatePickerInput";
import {
  faArrowLeft,
  faSave,
  faSpinner,
  faExclamationTriangle,
  faUser,
  faPaw,
  faCalendarAlt,
  faNotesMedical,
  faSearch,
} from "@fortawesome/free-solid-svg-icons";
import toast from "react-hot-toast";
import { apiRequest } from "../../api/client";
import PetAvatar from "../shared/PetAvatar";
import "./theme.css";
import "./VetEditAppointment_PinkGlass.css";

const VetEditAppointment = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [appointmentId] = useState(id);

  const [pageLoading, setPageLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [serviceWarning, setServiceWarning] = useState("");

  const [customers, setCustomers] = useState([]);
  const [pets, setPets] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedPet, setSelectedPet] = useState(null);
  const [selectedService, setSelectedService] = useState(null);

  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerResults, setShowCustomerResults] = useState(false);
  const [petsLoading, setPetsLoading] = useState(false);

  const [formData, setFormData] = useState({
    customer_id: "",
    pet_id: "",
    service_id: "",
    appointment_date: "",
    appointment_time: "",
    notes: "",
  });

  const safeArray = (value) => {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.data)) return value.data;
    if (Array.isArray(value?.services)) return value.services;
    if (Array.isArray(value?.customers)) return value.customers;
    if (Array.isArray(value?.pets)) return value.pets;
    if (Array.isArray(value?.records)) return value.records;
    if (Array.isArray(value?.result)) return value.result;
    if (Array.isArray(value?.results)) return value.results;
    if (Array.isArray(value?.data?.data)) return value.data.data;
    return [];
  };

  const getServiceName = (service) =>
    service?.name || service?.service_name || service?.title || "Service";

  const getServiceCategory = (service) => service?.category || "Other";

  const getServicePrice = (service) =>
    service?.price || service?.service_price || service?.amount || 0;

  const getServiceDuration = (service) =>
    service?.duration_minutes || service?.duration || "";

  const formatCurrency = (value) => {
    const number = Number(value || 0);
    return `₱${number.toFixed(2)}`;
  };

  const getCustomerName = (customer) =>
    customer?.name || customer?.customer_name || "Unknown Customer";

  const getCustomerPhone = (customer) =>
    customer?.phone || customer?.contact_number || customer?.mobile || "No contact";

  const getPetName = (pet) => pet?.name || pet?.pet_name || "Unnamed Pet";

  const getPetSpecies = (pet) => pet?.species || pet?.type || "Pet";

  const getPetBreed = (pet) => pet?.breed || "Unknown breed";

  const fetchCustomerPets = useCallback(async (customerId) => {
    try {
      setPetsLoading(true);
      const data = await apiRequest(`/customers/${customerId}/pets`);
      const petsList = safeArray(data);
      setPets(petsList);
      return petsList;
    } catch (err) {
      console.error("Failed to fetch customer pets:", err);
      setPets([]);
      toast.error("Failed to load customer pets.");
      return [];
    } finally {
      setPetsLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadInitialData = async () => {
      setPageLoading(true);
      setError("");
      setServiceWarning("");

      let customersList = [];
      let servicesList = [];
      let appointmentData = null;

      try {
        const customersData = await apiRequest("/customers");
        customersList = safeArray(customersData);
      } catch (customerErr) {
        console.error("Customers API failed:", customerErr);
        toast.error("Failed to load customers.");
      }

      try {
        const adminServicesData = await apiRequest("/admin/services");
        servicesList = safeArray(adminServicesData);
      } catch {
        servicesList = [];
      }

      if (servicesList.length === 0) {
        setServiceWarning("No live veterinary services found. Add services before editing appointments.");
      }

      try {
        const appointmentResponse = await apiRequest(`/veterinary/appointments/${appointmentId}`);
        appointmentData = appointmentResponse?.appointment || appointmentResponse;
      } catch (appointmentErr) {
        console.error("Failed to load appointment:", appointmentErr);
        setError("Failed to load appointment details.");
        toast.error("Failed to load appointment details.");
      }

      if (appointmentData) {
        setFormData({
          customer_id: appointmentData.customer_id || "",
          pet_id: appointmentData.pet_id || "",
          service_id: appointmentData.service_id || "",
          appointment_date: appointmentData.appointment_date || (appointmentData.scheduled_at ? new Date(appointmentData.scheduled_at).toISOString().split("T")[0] : ""),
          appointment_time: appointmentData.appointment_time || (appointmentData.scheduled_at ? new Date(appointmentData.scheduled_at).toTimeString().slice(0, 5) : ""),
          notes: appointmentData.notes || "",
        });

        if (appointmentData.customer_id) {
          const customer = customersList.find(c => c.id === appointmentData.customer_id);
          if (customer) {
            setSelectedCustomer(customer);
            const customerPets = await fetchCustomerPets(customer.id);

            if (appointmentData.pet_id) {
              const pet = customerPets.find(p => String(p.id) === String(appointmentData.pet_id));
              if (pet) setSelectedPet(pet);
            }
          }
        }

        if (appointmentData.service_id) {
          const service = servicesList.find(s => s.id === appointmentData.service_id);
          if (service) setSelectedService(service);
        }
      }

      setCustomers(customersList);
      setServices(servicesList);
      setPageLoading(false);
    };

    loadInitialData();
  }, [appointmentId, fetchCustomerPets]);

  const handleCustomerSelect = (customer) => {
    setSelectedCustomer(customer);
    setSelectedPet(null);
    setPets([]);
    setFormData((prev) => ({
      ...prev,
      customer_id: customer.id,
      pet_id: "",
    }));

    fetchCustomerPets(customer.id);
  };

  const handlePetSelect = (pet) => {
    setSelectedPet(pet);
    setFormData((prev) => ({
      ...prev,
      pet_id: pet.id,
    }));
  };

  const handleServiceSelect = (serviceId) => {
    const service = services.find((s) => s.id === parseInt(serviceId));
    setSelectedService(service);
    setFormData((prev) => ({
      ...prev,
      service_id: serviceId,
    }));
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const validateForm = () => {
    if (!formData.customer_id) return "Please select a customer.";
    if (!formData.pet_id) return "Please select a pet.";
    if (!formData.service_id) return "Please select a service.";
    if (!formData.appointment_date) return "Please select an appointment date.";
    if (!formData.appointment_time) return "Please select an appointment time.";
    return "";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const validationMessage = validateForm();
    if (validationMessage) {
      setError(validationMessage);
      toast.error(validationMessage);
      return;
    }

    try {
      setSubmitting(true);
      setError("");

      const appointmentDateTime = new Date(
        `${formData.appointment_date}T${formData.appointment_time}:00`
      );

      const appointmentData = {
        customer_id: formData.customer_id,
        pet_id: formData.pet_id,
        service_id: formData.service_id,
        scheduled_at: appointmentDateTime.toISOString(),
        appointment_date: formData.appointment_date,
        appointment_time: formData.appointment_time,
        notes: formData.notes.trim(),
      };

      await apiRequest(`/veterinary/appointments/${appointmentId}`, {
        method: "PUT",
        body: JSON.stringify(appointmentData),
      });

      toast.success("Appointment updated successfully.");
      navigate("/veterinary/appointments");
    } catch (err) {
      console.error("Failed to update appointment:", err);
      const message = err?.message || "Failed to update appointment. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    navigate("/veterinary/appointments");
  };

  if (pageLoading) {
    return (
      <div className="new-appointment-container">
        <div className="loading-container">
          <FontAwesomeIcon icon={faSpinner} className="spin" />
          <strong>Loading appointment details...</strong>
          <p>Preparing appointment form for editing.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="new-appointment-container">
      <div className="new-appointment-header">
        <button className="back-button" onClick={handleBack}>
          <FontAwesomeIcon icon={faArrowLeft} />
          Back to Appointments
        </button>
        <h1>Edit Appointment</h1>
        <p>Update appointment details and information.</p>
      </div>

      {error && (
        <div className="new-appointment-alert">
          <FontAwesomeIcon icon={faExclamationTriangle} />
          <span>{error}</span>
        </div>
      )}

      {serviceWarning && (
        <div className="new-appointment-alert">
          <FontAwesomeIcon icon={faExclamationTriangle} />
          <span>{serviceWarning}</span>
        </div>
      )}

      <form className="new-appointment-layout" onSubmit={handleSubmit}>
        <section className="new-appointment-form-card">
          <div className="form-card-header">
            <h2>
              <FontAwesomeIcon icon={faCalendarAlt} />
              Appointment Details
            </h2>
            <p>Update the appointment information</p>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="appointment_date">Appointment Date</label>
              <DatePickerInput
                id="appointment_date"
                selected={formData.appointment_date ? new Date(formData.appointment_date) : null}
                onChange={(date) => handleInputChange({ target: { name: "appointment_date", value: date ? date.toISOString().split("T")[0] : "" } })}
                placeholderText="Pick a date..."
                minDate={new Date()}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="appointment_time">Appointment Time</label>
              <input
                type="time"
                id="appointment_time"
                name="appointment_time"
                value={formData.appointment_time}
                onChange={handleInputChange}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="notes">Additional Notes</label>
            <textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              rows={4}
              placeholder="Enter any additional notes or special instructions..."
            />
          </div>
        </section>

        <section className="new-appointment-form-card">
          <div className="form-card-header">
            <h2>
              <FontAwesomeIcon icon={faUser} />
              Customer & Pet Selection
            </h2>
            <p>Select the customer and pet for this appointment</p>
          </div>

          <div className="form-group">
            <label htmlFor="customer_search">Search Customer</label>
            <div className="search-container">
              <input
                type="text"
                id="customer_search"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Type to search customers..."
                onFocus={() => setShowCustomerResults(true)}
              />
              <FontAwesomeIcon icon={faSearch} className="search-icon" />
            </div>

            {showCustomerResults && customerSearch && (
              <div className="customer-search-results">
                {customers
                  .filter((customer) =>
                    getCustomerName(customer)
                      .toLowerCase()
                      .includes(customerSearch.toLowerCase())
                  )
                  .slice(0, 5)
                  .map((customer) => (
                    <div
                      key={customer.id}
                      className="customer-result-item"
                      onClick={() => {
                        handleCustomerSelect(customer);
                        setCustomerSearch("");
                        setShowCustomerResults(false);
                      }}
                    >
                      <span>
                        <strong>{getCustomerName(customer)}</strong>
                        <small>{getCustomerPhone(customer)}</small>
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {selectedCustomer && (
            <div className="selected-customer-display">
              <div className="selected-customer-info">
                <FontAwesomeIcon icon={faUser} />
                <span>
                  <strong>{getCustomerName(selectedCustomer)}</strong>
                  <small>{getCustomerPhone(selectedCustomer)}</small>
                </span>
              </div>
            </div>
          )}

          {!selectedCustomer && (
            <div className="helper-empty-box">
              <FontAwesomeIcon icon={faUser} />
              <h4>Select a customer first</h4>
              <p>Customer pets will appear after choosing a customer.</p>
            </div>
          )}

          {selectedCustomer && petsLoading && (
            <div className="helper-empty-box">
              <FontAwesomeIcon icon={faSpinner} className="spin" />
              <h4>Loading pets...</h4>
              <p>Please wait while we fetch customer pets.</p>
            </div>
          )}

          {selectedCustomer && !petsLoading && pets.length === 0 && (
            <div className="helper-empty-box warning">
              <FontAwesomeIcon icon={faExclamationTriangle} />
              <h4>No pets found</h4>
              <p>This customer has no pet records yet.</p>
            </div>
          )}

          {selectedCustomer && !petsLoading && pets.length > 0 && (
            <div className="pet-selection-grid">
              {pets.map((pet) => (
                <button
                  key={pet.id}
                  type="button"
                  className={`pet-option ${String(formData.pet_id) === String(pet.id) ? "selected" : ""}`}
                  onClick={() => handlePetSelect(pet)}
                >
                  <PetAvatar pet={pet} size={36} />
                  <span>
                    <strong>{getPetName(pet)}</strong>
                    <small>
                      {getPetSpecies(pet)} • {getPetBreed(pet)}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="new-appointment-form-card">
          <div className="form-card-header">
            <h2>
              <FontAwesomeIcon icon={faNotesMedical} />
              Service Selection
            </h2>
            <p>Select the veterinary service for this appointment</p>
          </div>

          <div className="form-group">
            <label htmlFor="service_id">Select Service</label>
            <select
              id="service_id"
              name="service_id"
              value={formData.service_id}
              onChange={handleServiceSelect}
              required
            >
              <option value="">Choose a service...</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {getServiceName(service)} • {getServiceCategory(service)} -{" "}
                  {formatCurrency(getServicePrice(service))}
                </option>
              ))}
            </select>

            <small className="service-count-helper">
              {services.length} services loaded
            </small>
          </div>

          {selectedService && (
            <div className="selected-service-preview">
              <div>
                <strong>{getServiceName(selectedService)}</strong>
                <p>
                  {getServiceCategory(selectedService)} •{" "}
                  {formatCurrency(getServicePrice(selectedService))}
                  {getServiceDuration(selectedService)
                    ? ` • ${getServiceDuration(selectedService)} mins`
                    : ""}
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="new-appointment-form-card">
          <div className="form-card-header">
            <h2>
              <FontAwesomeIcon icon={faCalendarAlt} />
              Appointment Summary
            </h2>
            <p>Review the appointment details before saving</p>
          </div>

          <div className="appointment-summary">
            <div className="summary-row">
              <small>Customer</small>
              <strong>{selectedCustomer ? getCustomerName(selectedCustomer) : "Not selected"}</strong>
            </div>

            <div className="summary-row">
              <small>Pet</small>
              <strong>{selectedPet ? getPetName(selectedPet) : "Not selected"}</strong>
            </div>

            <div className="summary-row">
              <small>Service</small>
              <strong>{selectedService ? getServiceName(selectedService) : "Not selected"}</strong>
            </div>

            <div className="summary-row">
              <small>Date & Time</small>
              <strong>
                {formData.appointment_date && formData.appointment_time
                  ? `${formData.appointment_date} at ${formData.appointment_time}`
                  : "Not set"}
              </strong>
            </div>

            {selectedService && (
              <div className="summary-row price">
                <small>Estimated Price</small>
                <strong>{formatCurrency(getServicePrice(selectedService))}</strong>
              </div>
            )}
          </div>
        </section>

        <div className="form-actions">
          <button type="button" className="cancel-btn" onClick={handleBack}>
            Cancel
          </button>

          <button className="save-appointment-btn" type="submit" disabled={submitting}>
            {submitting ? (
              <>
                <FontAwesomeIcon icon={faSpinner} className="spin" />
                Updating Appointment...
              </>
            ) : (
              <>
                <FontAwesomeIcon icon={faSave} />
                Update Appointment
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default VetEditAppointment;
