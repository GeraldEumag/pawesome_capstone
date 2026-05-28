import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import DatePickerInput from "../../components/shared/DatePickerInput";
import {
  faArrowLeft,
  faCalendarAlt,
  faCheckCircle,
  faClock,
  faExclamationTriangle,
  faNotesMedical,
  faPaw,
  faSave,
  faSearch,
  faSpinner,
  faStethoscope,
  faUser,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import toast from "react-hot-toast";
import { apiRequest } from "../../api/client";
import PetAvatar from "../shared/PetAvatar";
import "./VetNewAppointment_PinkGlass.css";
import {
  safeArray,
  getEntityName,
  getEntityContact,
  getPetName,
  getPetType,
  getPetBreed,
  getServiceName,
  getServicePrice,
  formatCurrency,
} from "../../utils/apiNormalize";

const VetNewAppointment = () => {
  const navigate = useNavigate();

  const [pageLoading, setPageLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [petsLoading, setPetsLoading] = useState(false);
  const [error, setError] = useState("");
  const [serviceWarning, setServiceWarning] = useState("");

  const [customers, setCustomers] = useState([]);
  const [pets, setPets] = useState([]);
  const [services, setServices] = useState([]);

  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerResults, setShowCustomerResults] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedPet, setSelectedPet] = useState(null);

  const [formData, setFormData] = useState({
    customer_id: "",
    pet_id: "",
    service_id: "",
    appointment_date: "",
    appointment_time: "",
    notes: "",
  });

  const getCustomerName = (customer) => getEntityName(customer, "customer");
  const getCustomerEmail = (customer) => getEntityContact(customer, "email");
  const getCustomerPhone = (customer) => getEntityContact(customer, "phone");
  const getPetSpecies = (pet) => getPetType(pet);
  const getServiceCategory = (service) => service?.category || "Other";
  const getServiceDuration = (service) =>
    service?.duration_minutes || service?.duration || "";

  const todayKey = new Date().toISOString().split("T")[0];

  const timeOptions = useMemo(() => {
    const slots = [];

    for (let hour = 8; hour <= 18; hour += 1) {
      const formattedHour = String(hour).padStart(2, "0");
      slots.push(`${formattedHour}:00`);

      if (hour !== 18) {
        slots.push(`${formattedHour}:30`);
      }
    }

    return slots;
  }, []);

  const selectedService = useMemo(() => {
    return services.find((service) => String(service.id) === String(formData.service_id));
  }, [services, formData.service_id]);

  const filteredCustomers = useMemo(() => {
    const keyword = customerSearch.trim().toLowerCase();

    if (!keyword) return customers.slice(0, 8);

    return customers
      .filter((customer) => {
        const text = [
          getCustomerName(customer),
          getCustomerEmail(customer),
          getCustomerPhone(customer),
        ]
          .join(" ")
          .toLowerCase();

        return text.includes(keyword);
      })
      .slice(0, 8);
  }, [customers, customerSearch]);

  useEffect(() => {
    const loadInitialData = async () => {
      setPageLoading(true);
      setError("");
      setServiceWarning("");

      let customersList = [];
      let servicesList = [];

      try {
        const customersData = await apiRequest("/customers");
        customersList = safeArray(customersData);
      } catch {
        toast.error("Failed to load customers.");
      }

      try {
        const servicesData = await apiRequest("/services");
        servicesList = safeArray(servicesData);
      } catch (serviceErr) {
        try {
          const adminServicesData = await apiRequest("/admin/services");
          servicesList = safeArray(adminServicesData);
        } catch {
          try {
            const receptionistServicesData = await apiRequest("/receptionist/services?active_only=1");
            servicesList = safeArray(receptionistServicesData);
          } catch {
            servicesList = [];
          }
        }
      }

      // Transform services to ensure required fields
      servicesList = servicesList.map((service) => ({
        id: service.id || service.service_id || `service-${Math.random()}`,
        name: service.name || service.service_name || "Unknown Service",
        category: service.category || "General",
        price: Number(service.price || service.cost || 0),
        duration_minutes: Number(service.duration_minutes || service.duration || 30),
      }));

      if (servicesList.length === 0) {
        setServiceWarning(
          "No live veterinary services found. Add services before scheduling appointments."
        );
      }

      setCustomers(customersList);
      setServices(servicesList);
      setPageLoading(false);
    };

    loadInitialData();
  }, []);

  const fetchCustomerPets = async (customerId) => {
    try {
      setPetsLoading(true);

      const data = await apiRequest(`/customers/${customerId}/pets`);
      setPets(safeArray(data));
    } catch {
      setPets([]);
      toast.error("Failed to load customer pets.");
    } finally {
      setPetsLoading(false);
    }
  };

  const updateField = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));

    if (error) setError("");
  };

  const handleCustomerSearch = (value) => {
    setCustomerSearch(value);
    setShowCustomerResults(true);

    if (selectedCustomer) {
      setSelectedCustomer(null);
      setSelectedPet(null);
      setPets([]);
      setFormData((prev) => ({
        ...prev,
        customer_id: "",
        pet_id: "",
      }));
    }
  };

  const handleCustomerSelect = (customer) => {
    setSelectedCustomer(customer);
    setSelectedPet(null);
    setCustomerSearch(`${getCustomerName(customer)} • ${getCustomerEmail(customer)}`);
    setShowCustomerResults(false);

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

    if (error) setError("");
  };

  const clearCustomer = () => {
    setSelectedCustomer(null);
    setSelectedPet(null);
    setCustomerSearch("");
    setShowCustomerResults(false);
    setPets([]);

    setFormData((prev) => ({
      ...prev,
      customer_id: "",
      pet_id: "",
    }));
  };

  const validateForm = () => {
    if (!formData.customer_id) return "Please select a customer.";
    if (!formData.pet_id) return "Please select a pet.";
    if (!formData.service_id) return "Please select a service.";
    if (!formData.appointment_date) return "Please select an appointment date.";
    if (!formData.appointment_time) return "Please select an appointment time.";

    const selectedDateTime = new Date(
      `${formData.appointment_date}T${formData.appointment_time}:00`
    );

    if (Number.isNaN(selectedDateTime.getTime())) {
      return "Please select a valid appointment schedule.";
    }

    if (selectedDateTime < new Date()) {
      return "Appointment schedule cannot be in the past.";
    }

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
        status: "pending",
      };

      await apiRequest("/veterinary/appointments", {
        method: "POST",
        body: JSON.stringify(appointmentData),
      });

      toast.success("Appointment created successfully.");
      navigate("/veterinary/appointments");
    } catch (err) {
      const message = err?.message || "Failed to create appointment. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (pageLoading) {
    return (
      <div className="vet-new-appointment">
        <div className="new-appointment-loading">
          <div className="loading-icon">
            <FontAwesomeIcon icon={faSpinner} />
          </div>
          <strong>Loading appointment form...</strong>
          <p>Preparing customers, pets, and services.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="vet-new-appointment">
      <section className="new-appointment-hero">
        <div className="new-appointment-header-left">
          <button
            className="back-appointment-btn"
            type="button"
            onClick={() => navigate("/veterinary/appointments")}
          >
            <FontAwesomeIcon icon={faArrowLeft} />
            Back
          </button>

          <div>
            <span className="new-appointment-eyebrow">
              <FontAwesomeIcon icon={faCalendarAlt} />
              New Appointment
            </span>

            <h1>Schedule Veterinary Appointment</h1>
            <p>
              Create a new veterinary appointment by selecting a customer, pet,
              service, and schedule.
            </p>
          </div>
        </div>

        <div className="appointment-progress">
          <div className={`progress-step ${formData.customer_id ? "done" : "active"}`}>
            <span>1</span>
            Customer
          </div>

          <div className={`progress-step ${formData.pet_id ? "done" : ""}`}>
            <span>2</span>
            Pet
          </div>

          <div className={`progress-step ${formData.service_id ? "done" : ""}`}>
            <span>3</span>
            Service
          </div>

          <div className={`progress-step ${formData.appointment_date && formData.appointment_time ? "done" : ""}`}>
            <span>4</span>
            Schedule
          </div>
        </div>
      </section>

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
            <div>
              <h2>Appointment Details</h2>
              <p>Complete the required fields below.</p>
            </div>

            <span className="required-hint">Required *</span>
          </div>

          <div className="form-section">
            <div className="section-title">
              <FontAwesomeIcon icon={faUser} />
              <div>
                <h3>Customer Information</h3>
                <p>Search and select the customer who owns the pet.</p>
              </div>
            </div>

            <div className="form-group">
              <label>
                Search Customer <span>*</span>
              </label>

              <div className="customer-search-wrapper">
                <FontAwesomeIcon icon={faSearch} className="search-field-icon" />

                <input
                  type="text"
                  value={customerSearch}
                  placeholder="Search customer by name, email, or contact..."
                  onChange={(e) => handleCustomerSearch(e.target.value)}
                  onFocus={() => setShowCustomerResults(true)}
                />

                {customerSearch && (
                  <button
                    className="clear-customer-btn"
                    type="button"
                    onClick={clearCustomer}
                    aria-label="Clear selected customer"
                  >
                    <FontAwesomeIcon icon={faXmark} />
                  </button>
                )}

                {showCustomerResults && customerSearch && !selectedCustomer && (
                  <div className="customer-results">
                    {(filteredCustomers || []).length > 0 ? (
                      (filteredCustomers || []).map((customer) => (
                        <button
                          key={customer.id}
                          type="button"
                          className="customer-result"
                          onClick={() => handleCustomerSelect(customer)}
                        >
                          <span className="customer-avatar">
                            {getCustomerName(customer).charAt(0).toUpperCase()}
                          </span>

                          <span>
                            <strong>{getCustomerName(customer)}</strong>
                            <small>
                              {getCustomerEmail(customer)} • {getCustomerPhone(customer)}
                            </small>
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="customer-no-result">
                        <strong>No customers found</strong>
                        <small>Try another name, email, or contact number.</small>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {selectedCustomer && (
              <div className="selected-customer-card">
                <div className="selected-customer-avatar">
                  {getCustomerName(selectedCustomer).charAt(0).toUpperCase()}
                </div>

                <div>
                  <strong>{getCustomerName(selectedCustomer)}</strong>
                  <p>{getCustomerEmail(selectedCustomer)}</p>
                  <small>{getCustomerPhone(selectedCustomer)}</small>
                </div>

                <FontAwesomeIcon icon={faCheckCircle} className="selected-check" />
              </div>
            )}
          </div>

          <div className="form-section">
            <div className="section-title">
              <FontAwesomeIcon icon={faPaw} />
              <div>
                <h3>Pet Selection</h3>
                <p>Choose the patient for this appointment.</p>
              </div>
            </div>

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

            {selectedCustomer && !petsLoading && (pets || []).length > 0 && (
              <div className="pet-selection-grid">
                {(pets || []).map((pet) => (
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
                        {pet?.age ? ` • ${pet.age}` : ""}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="form-section">
            <div className="section-title">
              <FontAwesomeIcon icon={faStethoscope} />
              <div>
                <h3>Service Details</h3>
                <p>Select what veterinary service will be scheduled.</p>
              </div>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label>
                  Veterinary Service <span>*</span>
                </label>

                <select
                  value={formData.service_id}
                  onChange={(e) => updateField("service_id", e.target.value)}
                >
                  <option value="">Choose a service...</option>

                  {(services || []).map((service) => (
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

              <div className="selected-service-preview">
                {selectedService ? (
                  <>
                    <span className="service-preview-icon">
                      <FontAwesomeIcon icon={faStethoscope} />
                    </span>

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
                  </>
                ) : (
                  <>
                    <span className="service-preview-icon muted">
                      <FontAwesomeIcon icon={faStethoscope} />
                    </span>

                    <div>
                      <strong>No service selected</strong>
                      <p>Select a service to preview details.</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="section-title">
              <FontAwesomeIcon icon={faClock} />
              <div>
                <h3>Schedule</h3>
                <p>Choose the appointment date and time slot.</p>
              </div>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label>
                  Appointment Date <span>*</span>
                </label>

                <DatePickerInput
                  selected={formData.appointment_date ? new Date(formData.appointment_date) : null}
                  onChange={(date) => updateField("appointment_date", date ? date.toISOString().split("T")[0] : "")}
                  placeholderText="Pick a date..."
                  minDate={new Date()}
                />
              </div>

              <div className="form-group">
                <label>
                  Appointment Time <span>*</span>
                </label>

                <select
                  value={formData.appointment_time}
                  onChange={(e) => updateField("appointment_time", e.target.value)}
                >
                  <option value="">Select time...</option>

                  {(timeOptions || []).map((time) => (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="section-title">
              <FontAwesomeIcon icon={faNotesMedical} />
              <div>
                <h3>Additional Notes</h3>
                <p>Add symptoms, reason for visit, or special instructions.</p>
              </div>
            </div>

            <div className="form-group">
              <label>Notes</label>

              <textarea
                value={formData.notes}
                placeholder="Example: Follow-up checkup, vaccination, grooming concern, appetite issue..."
                onChange={(e) => updateField("notes", e.target.value)}
              />
            </div>
          </div>

          <div className="new-appointment-actions">
            <button
              className="cancel-appointment-btn"
              type="button"
              onClick={() => navigate("/veterinary/appointments")}
              disabled={submitting}
            >
              <FontAwesomeIcon icon={faArrowLeft} />
              Cancel
            </button>

            <button className="save-appointment-btn" type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} className="spin" />
                  Creating...
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faSave} />
                  Create Appointment
                </>
              )}
            </button>
          </div>
        </section>

        <aside className="appointment-summary-card">
          <div className="summary-card-header">
            <span>
              <FontAwesomeIcon icon={faCalendarAlt} />
            </span>

            <div>
              <h3>Appointment Summary</h3>
              <p>Review before creating.</p>
            </div>
          </div>

          <div className="summary-list">
            <div className="summary-row">
              <small>Customer</small>
              <strong>
                {selectedCustomer ? getCustomerName(selectedCustomer) : "Not selected"}
              </strong>
            </div>

            <div className="summary-row">
              <small>Pet</small>
              <strong>{selectedPet ? getPetName(selectedPet) : "Not selected"}</strong>
            </div>

            <div className="summary-row">
              <small>Service</small>
              <strong>
                {selectedService ? getServiceName(selectedService) : "Not selected"}
              </strong>
            </div>

            <div className="summary-row">
              <small>Date</small>
              <strong>{formData.appointment_date || "Not selected"}</strong>
            </div>

            <div className="summary-row">
              <small>Time</small>
              <strong>{formData.appointment_time || "Not selected"}</strong>
            </div>

            <div className="summary-price">
              <small>Estimated Fee</small>
              <strong>
                {selectedService
                  ? formatCurrency(getServicePrice(selectedService))
                  : formatCurrency(0)}
              </strong>
            </div>
          </div>

          <div className="summary-note">
            <FontAwesomeIcon icon={faExclamationTriangle} />
            <p>
              This appointment will be created as <strong>Pending</strong> until
              confirmed by the workflow.
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
};

export default VetNewAppointment;
