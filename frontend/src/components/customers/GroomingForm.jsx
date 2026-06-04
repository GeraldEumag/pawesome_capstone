import { useEffect, useState, useCallback } from "react";
import "./GroomingForm.css";
import { apiRequest, normalizeList } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import DatePickerInput from "../../components/shared/DatePickerInput";
import {
  validateServiceCompatibility,
  getUnavailableServiceMessage,
} from "../../config/petServiceRules";
import { showAlert, showSuccess, showError } from "../../utils/alert";

const GroomingForm = () => {
  const { user } = useAuth();
  const customerEmail = user?.email;
  const customerName = user?.name || "Customer";

  const [activeTab, setActiveTab] = useState("book");
  const [appointments, setAppointments] = useState([]);
  const [pets, setPets] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [groomingAvailability, setGroomingAvailability] = useState(null);
  const [dateAvailable, setDateAvailable] = useState(true);

  const [formData, setFormData] = useState({
    customer_name: customerName,
    customer_email: customerEmail || "",
    pet_id: "",
    pet_name: "",
    service_type: "grooming",
    service_name: "",
    request_date: "",
    request_time: "",
    notes: "",
  });

  const fetchAppointments = useCallback(async () => {
    try {
      const data = await apiRequest("/customer/grooming");
      const list = normalizeList(data, ["appointments", "data", "grooming"]);
      setAppointments(list);
    } catch (error) {
      console.error("Failed to load grooming appointments:", error);
      setAppointments([]);
    }
  }, []);

  const fetchPets = useCallback(async () => {
    try {
      const data = await apiRequest("/customer/pets");
      const activePets = normalizeList(data, ["pets", "data"]).filter(
        (pet) => pet.status !== "archived" && !pet.archived_at
      );
      setPets(activePets);
    } catch (error) {
      console.error("Failed to load pets:", error);
      setPets([]);
    }
  }, []);

  const fetchServices = useCallback(async () => {
    try {
      const data = await apiRequest("/customer/services");
      const list = normalizeList(data, ["services", "data"]);
      setServices(list);
    } catch (error) {
      console.error("Failed to load services:", error);
      setServices([]);
    }
  }, []);

  useEffect(() => {
    fetchAppointments();
    fetchPets();
    fetchServices();
  }, [fetchAppointments, fetchPets, fetchServices]);

  const selectedPet = pets.find((pet) => String(pet.id) === String(formData.pet_id));

  const calculateAge = (birthdate) => {
    if (!birthdate) return null;
    const today = new Date();
    const birth = new Date(birthdate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    if (age <= 0) return "Less than 1 year";
    return `${age} year${age > 1 ? "s" : ""}`;
  };

  const getPetDisplayInfo = (pet) => {
    if (!pet) return null;
    const typeOfPet = pet.species || pet.type || "Pet";
    const birthdate = pet.birthdate || pet.birth_date || pet.date_of_birth;
    const age = calculateAge(birthdate);
    return {
      typeOfPet,
      birthdate,
      age,
    };
  };

  const petDisplayInfo = getPetDisplayInfo(selectedPet);

  const compatibility = selectedPet
    ? validateServiceCompatibility(selectedPet.species || selectedPet.type, "grooming")
    : null;
  const typeMessage = selectedPet && compatibility && !compatibility.isValid
    ? compatibility.message || getUnavailableServiceMessage(selectedPet.species || selectedPet.type, "grooming")
    : "";

  const fetchGroomingAvailability = async (date) => {
    try {
      setAvailabilityLoading(true);
      
      const data = await apiRequest(`/customer/availability/grooming?date=${date}`);
      
      if (data.success) {
        setGroomingAvailability(data);
        setDateAvailable(data.available);
      } else {
        setGroomingAvailability(null);
        setDateAvailable(false);
        showAlert(data.message || "This grooming date is already reserved. Please choose another date.");
      }
    } catch (error) {
      console.error("Error fetching grooming availability:", error);
      setGroomingAvailability(null);
      setDateAvailable(false);
      showError("Failed to check availability. Please try again.");
    } finally {
      setAvailabilityLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "pet_id") {
      const pet = pets.find((item) => String(item.id) === String(value));
      setFormData((prev) => ({
        ...prev,
        pet_id: value,
        pet_name: pet?.name || "",
      }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));

    // Check availability when date changes
    if (name === "request_date" && value) {
      fetchGroomingAvailability(value);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Check availability before submitting
    if (!formData.pet_id) {
      showAlert("Please select an active pet for this grooming appointment.");
      return;
    }

    if (compatibility && !compatibility.isValid) {
      showAlert(typeMessage || "This service is not available for this pet type.");
      return;
    }

    // Check availability before submitting
    if (!dateAvailable) {
      showAlert("This grooming date is already reserved. Please choose another date.");
      return;
    }

    try {
      setLoading(true);

      const data = await apiRequest("/customer/requests", {
        method: "POST",
        body: JSON.stringify(formData),
      });

      if (data.success) {
        showSuccess("Grooming appointment submitted! Waiting for receptionist approval.");

        setFormData({
          customer_name: customerName,
          customer_email: customerEmail || "",
          pet_id: "",
          pet_name: "",
          service_type: "grooming",
          service_name: "",
          request_date: "",
          request_time: "",
          notes: "",
        });

        setGroomingAvailability(null);
        setDateAvailable(true);

        await fetchAppointments();
        setActiveTab("my");
      } else {
        showAlert(data.message || "Failed to submit grooming appointment");
      }
    } catch (error) {
      console.error("Submit error:", error);
      showError("Failed to submit grooming appointment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="grooming-container">
      <div className="grooming-header">
        <h1>Pet Grooming</h1>
        <p>Book grooming services for your pet.</p>
      </div>

      <div className="grooming-tabs">
        <button
          className={activeTab === "book" ? "active" : ""}
          onClick={() => setActiveTab("book")}
        >
          New Appointment
        </button>

        <button
          className={activeTab === "my" ? "active" : ""}
          onClick={() => setActiveTab("my")}
        >
          My Appointments ({appointments.length})
        </button>
      </div>

      {activeTab === "book" && (
        <div className="grooming-card">
          <h2>Grooming Appointment Form</h2>

          <form className="grooming-form" onSubmit={handleSubmit}>
            <input
              type="text"
              name="customer_name"
              placeholder="Customer Name"
              value={formData.customer_name}
              onChange={handleChange}
              required
              readOnly
              style={{ backgroundColor: "#f0f0f0" }}
            />

            <select
              name="pet_id"
              value={formData.pet_id}
              onChange={handleChange}
              required
            >
              <option value="">Select active pet</option>
              {pets.map((pet) => {
                const info = getPetDisplayInfo(pet);
                return (
                  <option key={pet.id} value={pet.id}>
                    {pet.name} — {info?.typeOfPet || "Pet"}
                    {info?.age ? ` (${info.age})` : ""}
                  </option>
                );
              })}
            </select>

            {selectedPet && petDisplayInfo && (
              <div className="grooming-selected-pet-info">
                <p><strong>Type of Pet:</strong> {petDisplayInfo.typeOfPet}</p>
                {petDisplayInfo.birthdate && (
                  <p><strong>Birthdate:</strong> {new Date(petDisplayInfo.birthdate).toLocaleDateString()}</p>
                )}
                {petDisplayInfo.age && (
                  <p><strong>Age:</strong> {petDisplayInfo.age}</p>
                )}
              </div>
            )}

            {typeMessage && (
              <div className="no-availability">
                <span>⚠</span>
                <span>{typeMessage}</span>
              </div>
            )}

            <select
              name="service_name"
              value={formData.service_name}
              onChange={handleChange}
              required
            >
              <option value="">Select a grooming service...</option>
              {services
                .filter((s) => ["grooming", "daycare"].includes((s.category || "").toLowerCase()))
                .map((service) => (
                  <option key={service.id || service.name} value={service.name}>
                    {service.name}
                    {service.price ? ` \u2014 \u20b1${Number(service.price).toFixed(2)}` : ""}
                  </option>
                ))}
            </select>
            {services.length === 0 && (
              <small className="service-loading">Loading services...</small>
            )}

            <DatePickerInput
              selected={formData.request_date ? new Date(formData.request_date) : null}
              onChange={(date) =>
                handleChange({
                  target: {
                    name: "request_date",
                    value: date ? date.toISOString().split("T")[0] : "",
                  },
                })
              }
              placeholderText="Pick a date..."
              minDate={new Date()}
              required
            />

            {/* Availability Display */}
            {groomingAvailability && (
              <div className="grooming-availability">
                {dateAvailable ? (
                  <div className="availability-success">
                    <span>✓</span>
                    <span>This grooming date is available for booking.</span>
                  </div>
                ) : (
                  <div className="no-availability">
                    <span>⚠</span>
                    <span>This grooming date is already reserved. Please choose another date.</span>
                    {groomingAvailability.existing_appointment && (
                      <div className="existing-booking">
                        <small>Existing booking: {groomingAvailability.existing_appointment.pet_name} - {groomingAvailability.existing_appointment.service}</small>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {availabilityLoading && (
              <div className="availability-loading">
                <span>Checking availability...</span>
              </div>
            )}

            <input
              type="time"
              name="request_time"
              value={formData.request_time}
              onChange={handleChange}
              required
            />

            <textarea
              name="notes"
              placeholder="Notes or special instructions"
              value={formData.notes}
              onChange={handleChange}
            />

            <button
              type="submit"
              disabled={loading || (compatibility && !compatibility.isValid)}
            >
              {loading ? "Submitting..." : "Submit Request"}
            </button>
          </form>
        </div>
      )}

      {activeTab === "my" && (
        <div className="grooming-card">
          {appointments.length === 0 ? (
            <p>No grooming appointments yet.</p>
          ) : (
            appointments.map((item) => (
              <div key={item.id} className="grooming-item">
                <h3>{item.pet}</h3>
                <p>Service: {item.service}</p>
                <p>Date: {item.date}</p>
                <p>Time: {item.time}</p>
                <p>Notes: {item.notes || "None"}</p>

                <span className={`status ${item.status}`}>
                  {item.status}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
};

export default GroomingForm;
