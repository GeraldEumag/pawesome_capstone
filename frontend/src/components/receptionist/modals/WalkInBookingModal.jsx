import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTimes,
  faSearch,
  faSpinner,
  faUser,
  faPaw,
  faHotel,
  faStethoscope,
  faCut,
  faCheckCircle,
  faExclamationTriangle,
  faArrowRight,
  faArrowLeft,
  faPlus,
  faInfoCircle,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../../api/client";
import { showConfirm } from "../../../utils/alert.jsx";
import "./WalkInBookingModal.css";

const WalkInBookingModal = ({ serviceType, onClose, onSuccess }) => {
  const [step, setStep] = useState(1);
  const [customerMode, setCustomerMode] = useState(null); // 'existing' or 'new'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [veterinarians, setVeterinarians] = useState([]);
  const [hotelRooms, setHotelRooms] = useState([]);
  const [services, setServices] = useState([]);

  // Customer search
  const [customerSearch, setCustomerSearch] = useState("");
  const [allCustomers, setAllCustomers] = useState([]);
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedPet, setSelectedPet] = useState(null);

  // New customer form
  const [customerForm, setCustomerForm] = useState({
    first_name: "",
    middle_name: "",
    last_name: "",
    suffix: "",
    email: "",
    phone: "",
    address: "",
  });

  // Pet form
  const [petForm, setPetForm] = useState({
    name: "",
    species: "",
    breed: "",
    age: "",
    sex: "",
    weight: "",
  });

  // Booking form
  const [bookingForm, setBookingForm] = useState({
    service_name: "",
    request_date: "",
    request_time: "",
    notes: "",
    // Hotel specific
    check_out_date: "",
    room_type: "",
    special_requests: "",
    // Veterinary specific
    veterinarian_id: "",
    reason: "",
    urgency: "medium",
    symptoms: "",
    // Grooming specific
    grooming_instructions: "",
  });

  const serviceConfig = {
    hotel: {
      icon: faHotel,
      title: "Hotel Walk-in Booking",
      color: "#8b5cf6",
    },
    veterinary: {
      icon: faStethoscope,
      title: "Veterinary Walk-in Booking",
      color: "#ef4444",
    },
    grooming: {
      icon: faCut,
      title: "Grooming Walk-in Booking",
      color: "#10b981",
    },
  };

  const config = serviceConfig[serviceType];

  // AbortController for cleanup
  const abortControllerRef = useRef(null);

  // Fetch veterinarians, rooms, and customers on mount
  useEffect(() => {
    // Abort any pending requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    if (serviceType === "veterinary") {
      fetchVeterinarians(signal);
    }
    if (serviceType === "hotel") {
      fetchHotelRooms(signal);
    }
    fetchServices(signal);
    fetchAllCustomers(signal);

    // Cleanup function
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [serviceType]);

  const fetchVeterinarians = async (signal) => {
    try {
      const response = await apiRequest("/receptionist/veterinarians/available", { signal });
      const vets = response.veterinarians || response.data || response;
      setVeterinarians(Array.isArray(vets) ? vets : []);
    } catch (err) {
      if (err.message !== 'Request was cancelled') {
        console.error("Failed to fetch veterinarians:", err);
      }
    }
  };

  const fetchHotelRooms = async () => {
    try {
      const response = await apiRequest("/receptionist/hotel-rooms");
      setHotelRooms(response.rooms || []);
    } catch (err) {
      console.error("Failed to fetch hotel rooms:", err);
    }
  };

  const fetchServices = async () => {
    try {
      const response = await apiRequest("/receptionist/services");
      const allServices = response.data || [];
      // Filter by service type
      const filtered = allServices.filter((s) => {
        if (serviceType === "hotel") return s.category === "Hotel";
        if (serviceType === "veterinary") 
          return ["Consultation", "Vaccination", "Surgery", "Dental", "Diagnostics"].includes(s.category);
        if (serviceType === "grooming") return s.category === "Grooming";
        return true;
      });
      setServices(filtered);
    } catch (err) {
      console.error("Failed to fetch services:", err);
    }
  };

  // Fetch all customers for dropdown (using search endpoint with empty query)
  const fetchAllCustomers = async (signal) => {
    try {
      const response = await apiRequest("/receptionist/customers/search?q=", { signal });
      const customers = response.data || response || [];
      setAllCustomers(customers);
      setFilteredCustomers(customers);
    } catch (err) {
      if (err.message !== 'Request was cancelled') {
        console.error("Failed to fetch customers:", err);
      }
    }
  };

  // Filter customers locally based on search
  const filterCustomersLocally = (searchTerm) => {
    if (!searchTerm.trim()) {
      setFilteredCustomers(allCustomers);
      return;
    }
    const filtered = allCustomers.filter((c) => {
      const fullName = `${c.first_name} ${c.last_name}`.toLowerCase();
      return (
        fullName.includes(searchTerm.toLowerCase()) ||
        (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.phone && c.phone.includes(searchTerm))
      );
    });
    setFilteredCustomers(filtered);
  };

  // Handle search input change with debounce
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setCustomerSearch(value);
    filterCustomersLocally(value);
  };

  // Backend search for more results
  const handleBackendSearch = async () => {
    if (!customerSearch.trim()) return;
    try {
      setLoading(true);
      const response = await apiRequest(
        `/receptionist/customers/search?q=${encodeURIComponent(customerSearch)}`
      );
      const results = response.data || response || [];
      setFilteredCustomers(results);
    } catch (err) {
      console.error("Failed to search customers:", err);
      setError("Failed to search customers. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const selectCustomer = (customer) => {
    setSelectedCustomer(customer);
    setSelectedPet(null);
  };

  // Form validation
  const validateCustomerForm = () => {
    if (!customerForm.first_name.trim()) return "First name is required";
    if (!customerForm.last_name.trim()) return "Last name is required";
    if (!customerForm.email.trim()) return "Email is required";
    if (!customerForm.phone.trim()) return "Contact number is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerForm.email)) {
      return "Please enter a valid email address";
    }
    return null;
  };

  const validatePetForm = () => {
    if (!petForm.name.trim()) return "Pet name is required";
    if (!petForm.species.trim()) return "Species is required";
    return null;
  };

  const validateBookingForm = () => {
    if (!bookingForm.service_name) return "Please select a service";
    if (!bookingForm.request_date) return "Please select a date";
    if (!bookingForm.request_time) return "Please select a time";
    
    if (serviceType === "hotel" && !bookingForm.check_out_date) {
      return "Check-out date is required";
    }
    if (serviceType === "veterinary" && !bookingForm.reason.trim()) {
      return "Reason for visit is required";
    }
    return null;
  };

  // Submit walk-in booking
  const handleSubmit = async () => {
    const error = validateBookingForm();
    if (error) {
      setError(error);
      return;
    }

    if (customerMode === "new") {
      const customerError = validateCustomerForm();
      if (customerError) {
        setError(customerError);
        return;
      }
      const petError = validatePetForm();
      if (petError) {
        setError(petError);
        return;
      }
    }

    if (customerMode === "existing" && (!selectedCustomer || !selectedPet)) {
      setError("Please select a customer and pet");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const payload = {
        customer_mode: customerMode,
        customer: customerMode === "new" ? customerForm : undefined,
        pet: customerMode === "new" ? petForm : undefined,
        customer_id: customerMode === "existing" ? selectedCustomer.id : undefined,
        pet_id: customerMode === "existing" ? selectedPet.id : undefined,
        booking: {
          service_type: serviceType,
          service_name: bookingForm.service_name,
          request_date: bookingForm.request_date,
          request_time: bookingForm.request_time,
          notes: bookingForm.notes || "",
          ...(serviceType === "hotel" && {
            check_out_date: bookingForm.check_out_date,
            room_type: bookingForm.room_type,
            special_requests: bookingForm.special_requests,
          }),
          ...(serviceType === "veterinary" && {
            veterinarian_id: bookingForm.veterinarian_id,
            reason: bookingForm.reason,
            urgency: bookingForm.urgency,
            symptoms: bookingForm.symptoms,
          }),
          ...(serviceType === "grooming" && {
            grooming_instructions: bookingForm.grooming_instructions,
          }),
        },
      };

      // Remove undefined values
      Object.keys(payload).forEach((key) => {
        if (payload[key] === undefined) delete payload[key];
      });

      await apiRequest("/receptionist/walk-ins", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const message = customerMode === "new" 
        ? `Walk-in booking created successfully. New account created with email: ${customerForm.email} and default password: Password123!`
        : "Walk-in booking created successfully.";
      
      onSuccess(message);
    } catch (err) {
      setError(err.message || "Failed to create walk-in booking. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Navigation
  const nextStep = () => {
    if (step === 2 && customerMode === "existing" && (!selectedCustomer || !selectedPet)) {
      setError("Please select a customer and pet");
      return;
    }
    if (step === 2 && customerMode === "new") {
      const customerError = validateCustomerForm();
      if (customerError) {
        setError(customerError);
        return;
      }
    }
    if (step === 3 && customerMode === "new") {
      const petError = validatePetForm();
      if (petError) {
        setError(petError);
        return;
      }
    }
    setError("");
    setStep(step + 1);
  };

  const prevStep = () => {
    setError("");
    setStep(step - 1);
    if (step === 3) {
      setSelectedCustomer(null);
      setSelectedPet(null);
    }
  };

  // Render steps
  const renderStep1 = () => (
    <div className="step-content">
      <h3 className="step-title">Select Customer Type</h3>
      <p className="step-description">
        Does the walk-in customer already have an account with us?
      </p>

      <div className="mode-selection">
        <button
          type="button"
          className={`mode-card ${customerMode === "existing" ? "selected" : ""}`}
          onClick={() => setCustomerMode("existing")}
        >
          <FontAwesomeIcon icon={faUser} />
          <h4>Existing Customer</h4>
          <p>Customer already has an account</p>
        </button>

        <button
          type="button"
          className={`mode-card ${customerMode === "new" ? "selected" : ""}`}
          onClick={() => setCustomerMode("new")}
        >
          <FontAwesomeIcon icon={faPlus} />
          <h4>New Customer</h4>
          <p>Create a new account for this customer</p>
        </button>
      </div>

      {customerMode === "new" && (
        <div className="info-box warning">
          <FontAwesomeIcon icon={faInfoCircle} />
          <p>
            A new account will be created with default password: <strong>Password123!</strong>
            <br />
            Please inform the customer to change their password after first login.
          </p>
        </div>
      )}
    </div>
  );

  const renderStep2Existing = () => (
    <div className="step-content">
      <h3 className="step-title">Select Customer</h3>
      <p className="step-description">Search and select an existing customer</p>

      {/* Search Bar */}
      <div className="search-box large">
        <FontAwesomeIcon icon={faSearch} />
        <input
          type="text"
          placeholder="Search customers by name, email or phone..."
          value={customerSearch}
          onChange={handleSearchChange}
          onKeyPress={(e) => e.key === "Enter" && handleBackendSearch()}
        />
        <button
          type="button"
          className="search-btn"
          onClick={handleBackendSearch}
          disabled={loading}
        >
          {loading ? <FontAwesomeIcon icon={faSpinner} spin /> : "Search"}
        </button>
      </div>

      {/* Customer Dropdown */}
      <div className="form-group">
        <label>Customer *</label>
        <select
          value={selectedCustomer?.id || ""}
          onChange={(e) => {
            const customerId = parseInt(e.target.value);
            const customer = filteredCustomers.find((c) => c.id === customerId);
            if (customer) {
              setSelectedCustomer(customer);
              setSelectedPet(null);
            }
          }}
          className="customer-select"
        >
          <option value="">-- Select Customer --</option>
          {filteredCustomers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.first_name} {customer.last_name} - {customer.email} - {customer.phone}
            </option>
          ))}
        </select>
        {filteredCustomers.length === 0 && !loading && (
          <small className="helper-text">
            No customers found. Try searching or typing to filter.
          </small>
        )}
      </div>

      {/* Pet Dropdown - Shows after customer selected */}
      {selectedCustomer && (
        <div className="form-group">
          <label>Pet *</label>
          <select
            value={selectedPet?.id || ""}
            onChange={(e) => {
              const petId = parseInt(e.target.value);
              const pet = selectedCustomer.pets?.find((p) => p.id === petId);
              setSelectedPet(pet || null);
            }}
            className="pet-select"
          >
            <option value="">-- Select Pet --</option>
            {selectedCustomer.pets?.map((pet) => (
              <option key={pet.id} value={pet.id}>
                {pet.name} ({pet.species})
              </option>
            ))}
          </select>
          {(!selectedCustomer.pets || selectedCustomer.pets.length === 0) && (
            <small className="error-text">
              No pets found for this customer.
            </small>
          )}
        </div>
      )}

      {/* Selected Info Panel */}
      {selectedCustomer && selectedPet && (
        <div className="selected-summary">
          <div className="summary-item">
            <FontAwesomeIcon icon={faUser} />
            <span>{selectedCustomer.first_name} {selectedCustomer.last_name}</span>
          </div>
          <div className="summary-item">
            <FontAwesomeIcon icon={faPaw} />
            <span>{selectedPet.name} ({selectedPet.species})</span>
          </div>
        </div>
      )}
    </div>
  );

  const renderStep2New = () => (
    <div className="step-content">
      <h3 className="step-title">Customer Information</h3>
      <p className="step-description">Enter the customer's details</p>

      <div className="form-grid">
        <div className="form-group">
          <label>First Name *</label>
          <input
            type="text"
            value={customerForm.first_name}
            onChange={(e) =>
              setCustomerForm({ ...customerForm, first_name: e.target.value })
            }
            placeholder="Juan"
          />
        </div>

        <div className="form-group">
          <label>Middle Name</label>
          <input
            type="text"
            value={customerForm.middle_name}
            onChange={(e) =>
              setCustomerForm({ ...customerForm, middle_name: e.target.value })
            }
            placeholder="(Optional)"
          />
        </div>

        <div className="form-group">
          <label>Last Name *</label>
          <input
            type="text"
            value={customerForm.last_name}
            onChange={(e) =>
              setCustomerForm({ ...customerForm, last_name: e.target.value })
            }
            placeholder="Dela Cruz"
          />
        </div>

        <div className="form-group">
          <label>Suffix</label>
          <input
            type="text"
            value={customerForm.suffix}
            onChange={(e) =>
              setCustomerForm({ ...customerForm, suffix: e.target.value })
            }
            placeholder="Jr., Sr., III (Optional)"
          />
        </div>

        <div className="form-group full-width">
          <label>Email Address *</label>
          <input
            type="email"
            value={customerForm.email}
            onChange={(e) =>
              setCustomerForm({ ...customerForm, email: e.target.value })
            }
            placeholder="customer@example.com"
          />
          <small>This will be the username for their new account</small>
        </div>

        <div className="form-group full-width">
          <label>Contact Number *</label>
          <input
            type="tel"
            value={customerForm.phone}
            onChange={(e) =>
              setCustomerForm({ ...customerForm, phone: e.target.value })
            }
            placeholder="09171234567"
          />
        </div>

        <div className="form-group full-width">
          <label>Address</label>
          <textarea
            value={customerForm.address}
            onChange={(e) =>
              setCustomerForm({ ...customerForm, address: e.target.value })
            }
            placeholder="(Optional)"
            rows={2}
          />
        </div>
      </div>
    </div>
  );

  const renderStep3New = () => (
    <div className="step-content">
      <h3 className="step-title">Pet Information</h3>
      <p className="step-description">Enter the pet's details</p>

      <div className="form-grid">
        <div className="form-group">
          <label>Pet Name *</label>
          <input
            type="text"
            value={petForm.name}
            onChange={(e) => setPetForm({ ...petForm, name: e.target.value })}
            placeholder="Buddy"
          />
        </div>

        <div className="form-group">
          <label>Species / Type *</label>
          <select
            value={petForm.species}
            onChange={(e) => setPetForm({ ...petForm, species: e.target.value })}
          >
            <option value="">Select species</option>
            <option value="Dog">Dog</option>
            <option value="Cat">Cat</option>
            <option value="Bird">Bird</option>
            <option value="Rabbit">Rabbit</option>
            <option value="Other">Other</option>
          </select>
        </div>

        <div className="form-group">
          <label>Breed</label>
          <input
            type="text"
            value={petForm.breed}
            onChange={(e) => setPetForm({ ...petForm, breed: e.target.value })}
            placeholder="e.g., Shih Tzu (Optional)"
          />
        </div>

        <div className="form-group">
          <label>Age</label>
          <input
            type="text"
            value={petForm.age}
            onChange={(e) => setPetForm({ ...petForm, age: e.target.value })}
            placeholder="e.g., 2 years (Optional)"
          />
        </div>

        <div className="form-group">
          <label>Gender</label>
          <select
            value={petForm.sex}
            onChange={(e) => setPetForm({ ...petForm, sex: e.target.value })}
          >
            <option value="">Select gender</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
        </div>

        <div className="form-group">
          <label>Weight</label>
          <input
            type="text"
            value={petForm.weight}
            onChange={(e) => setPetForm({ ...petForm, weight: e.target.value })}
            placeholder="e.g., 5 kg (Optional)"
          />
        </div>
      </div>
    </div>
  );

  const renderStep3Existing = () => (
    <div className="step-content">
      <h3 className="step-title">Select Pet</h3>
      <p className="step-description">Choose a pet for this booking</p>

      <div className="pet-selection large">
        {selectedCustomer?.pets?.map((pet) => (
          <button
            key={pet.id}
            type="button"
            className={`pet-card large ${selectedPet?.id === pet.id ? "selected" : ""}`}
            onClick={() => setSelectedPet(pet)}
          >
            <FontAwesomeIcon icon={faPaw} />
            <div>
              <strong>{pet.name}</strong>
              <span>{pet.species}</span>
              {pet.breed && <small>{pet.breed}</small>}
            </div>
            {selectedPet?.id === pet.id && (
              <FontAwesomeIcon icon={faCheckCircle} className="selected-icon" />
            )}
          </button>
        ))}
        {(!selectedCustomer?.pets || selectedCustomer.pets.length === 0) && (
          <div className="no-pets-message">
            <FontAwesomeIcon icon={faExclamationTriangle} />
            <p>No pets found for this customer</p>
            <small>Please create a pet record first or select "New Customer" mode</small>
          </div>
        )}
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="step-content">
      <h3 className="step-title">Booking Details</h3>
      <p className="step-description">Enter the {serviceType} booking information</p>

      <div className="form-grid">
        <div className="form-group full-width">
          <label>Service *</label>
          <select
            value={bookingForm.service_name}
            onChange={(e) =>
              setBookingForm({ ...bookingForm, service_name: e.target.value })
            }
          >
            <option value="">Select a service</option>
            {services.map((service) => (
              <option key={service.id} value={service.name}>
                {service.name} - ₱{service.price}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Date *</label>
          <input
            type="date"
            value={bookingForm.request_date}
            onChange={(e) =>
              setBookingForm({ ...bookingForm, request_date: e.target.value })
            }
          />
        </div>

        <div className="form-group">
          <label>Time *</label>
          <input
            type="time"
            value={bookingForm.request_time}
            onChange={(e) =>
              setBookingForm({ ...bookingForm, request_time: e.target.value })
            }
          />
        </div>

        {/* Hotel-specific fields */}
        {serviceType === "hotel" && (
          <>
            <div className="form-group">
              <label>Check-out Date *</label>
              <input
                type="date"
                value={bookingForm.check_out_date}
                onChange={(e) =>
                  setBookingForm({ ...bookingForm, check_out_date: e.target.value })
                }
              />
            </div>

            <div className="form-group">
              <label>Room Type</label>
              <select
                value={bookingForm.room_type}
                onChange={(e) =>
                  setBookingForm({ ...bookingForm, room_type: e.target.value })
                }
              >
                <option value="">Select room type</option>
                {hotelRooms.map((room) => (
                  <option key={room.id} value={room.type}>
                    {room.name} ({room.type}) - ₱{room.daily_rate}/day
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group full-width">
              <label>Special Requests</label>
              <textarea
                value={bookingForm.special_requests}
                onChange={(e) =>
                  setBookingForm({ ...bookingForm, special_requests: e.target.value })
                }
                placeholder="Any special care instructions..."
                rows={2}
              />
            </div>
          </>
        )}

        {/* Veterinary-specific fields */}
        {serviceType === "veterinary" && (
          <>
            <div className="form-group full-width">
              <label>Assign Veterinarian</label>
              <select
                value={bookingForm.veterinarian_id}
                onChange={(e) =>
                  setBookingForm({ ...bookingForm, veterinarian_id: e.target.value })
                }
              >
                <option value="">Auto-assign (optional)</option>
                {veterinarians.map((vet) => (
                  <option key={vet.id} value={vet.id}>
                    {vet.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Urgency Level</label>
              <select
                value={bookingForm.urgency}
                onChange={(e) =>
                  setBookingForm({ ...bookingForm, urgency: e.target.value })
                }
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            <div className="form-group full-width">
              <label>Reason for Visit *</label>
              <textarea
                value={bookingForm.reason}
                onChange={(e) =>
                  setBookingForm({ ...bookingForm, reason: e.target.value })
                }
                placeholder="Main reason for the veterinary visit..."
                rows={2}
              />
            </div>

            <div className="form-group full-width">
              <label>Symptoms / Observations</label>
              <textarea
                value={bookingForm.symptoms}
                onChange={(e) =>
                  setBookingForm({ ...bookingForm, symptoms: e.target.value })
                }
                placeholder="Any symptoms or health observations..."
                rows={2}
              />
            </div>
          </>
        )}

        {/* Grooming-specific fields */}
        {serviceType === "grooming" && (
          <div className="form-group full-width">
            <label>Special Grooming Instructions</label>
            <textarea
              value={bookingForm.grooming_instructions}
              onChange={(e) =>
                setBookingForm({ ...bookingForm, grooming_instructions: e.target.value })
              }
              placeholder="Any special grooming instructions or preferences..."
              rows={2}
            />
          </div>
        )}

        <div className="form-group full-width">
          <label>General Notes</label>
          <textarea
            value={bookingForm.notes}
            onChange={(e) =>
              setBookingForm({ ...bookingForm, notes: e.target.value })
            }
            placeholder="Any additional notes..."
            rows={2}
          />
        </div>
      </div>
    </div>
  );

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return renderStep1();
      case 2:
        return customerMode === "existing" ? renderStep2Existing() : renderStep2New();
      case 3:
        return customerMode === "existing" ? renderStep4() : renderStep3New();
      case 4:
        return renderStep4();
      default:
        return null;
    }
  };

  return (
    <div className="walkin-modal-overlay" onClick={onClose}>
      <div className="walkin-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header" style={{ borderColor: config.color }}>
          <div className="header-content">
            <div className="service-icon" style={{ background: config.color }}>
              <FontAwesomeIcon icon={config.icon} />
            </div>
            <div>
              <h2>{config.title}</h2>
              <div className="step-indicator">
                Step {step} of {customerMode === "existing" ? 3 : 4}: {" "}
                {step === 1 && "Customer Type"}
                {step === 2 && (customerMode === "existing" ? "Select Customer & Pet" : "Customer Info")}
                {step === 3 && (customerMode === "existing" ? "Booking Details" : "Pet Info")}
                {step === 4 && "Booking Details"}
              </div>
            </div>
          </div>
          <button type="button" className="close-btn" onClick={onClose}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="modal-error">
            <FontAwesomeIcon icon={faExclamationTriangle} />
            <span>{error}</span>
          </div>
        )}

        {/* Content */}
        <div className="modal-body">{renderStepContent()}</div>

        {/* Footer */}
        <div className="modal-footer">
          {step > 1 && (
            <button type="button" className="secondary-btn" onClick={prevStep}>
              <FontAwesomeIcon icon={faArrowLeft} /> Back
            </button>
          )}

          {step < 4 ? (
            <button
              type="button"
              className="primary-btn"
              onClick={nextStep}
              disabled={step === 1 && !customerMode}
            >
              Next <FontAwesomeIcon icon={faArrowRight} />
            </button>
          ) : (
            <button
              type="button"
              className="primary-btn"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} spin /> Creating...
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faCheckCircle} /> Create Booking
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default WalkInBookingModal;
