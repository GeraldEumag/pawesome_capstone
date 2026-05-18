import React, { useEffect, useState, useCallback } from "react";
import "./VetForm.css";
import { apiRequest, normalizeList } from "../../api/client";
import {
  validateServiceCompatibility,
  getSpecialCareWarning,
} from "../../config/petServiceRules";

const VetForm = () => {
  const [activeTab, setActiveTab] = useState("book");
  const [appointments, setAppointments] = useState([]);
  const [pets, setPets] = useState([]);
  const [loading, setLoading] = useState(false);

  const customerEmail = localStorage.getItem("email");
  const customerName = localStorage.getItem("name") || "Customer";

  const [formData, setFormData] = useState({
    customer_name: customerName,
    customer_email: customerEmail || "",
    pet_id: "",
    pet_name: "",
    service_type: "vet",
    service_name: "Checkup",
    request_date: "",
    request_time: "",
    notes: "",
  });

  const fetchAppointments = useCallback(async () => {
    try {
      const data = await apiRequest(`/customer/my-requests?email=${customerEmail}`);
      
      // Filter only vet requests
      const vetOnly = data.requests.filter(item => item.type === "vet");
      setAppointments(vetOnly);
    } catch (error) {
      console.error("Failed to load vet appointments:", error);
    }
  }, [customerEmail]);

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

  useEffect(() => {
    fetchAppointments();
    fetchPets();
  }, [fetchAppointments, fetchPets]);

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
    ? validateServiceCompatibility(selectedPet.species || selectedPet.type, "veterinary")
    : null;
  const serviceMessage = selectedPet
    ? getSpecialCareWarning(selectedPet.species || selectedPet.type, "veterinary")
    : "";

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
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (!formData.pet_id) {
        alert("Please select an active pet for this appointment.");
        return;
      }

      if (compatibility && !compatibility.isValid) {
        alert(compatibility.message || "This service is not available for this pet type.");
        return;
      }

      setLoading(true);

      const data = await apiRequest("/customer/requests", {
        method: "POST",
        body: JSON.stringify(formData),
      });

      if (data.success) {
        alert("Vet appointment submitted! Waiting for receptionist approval.");

        setFormData({
          customer_name: customerName,
          customer_email: customerEmail || "",
          pet_id: "",
          pet_name: "",
          service_type: "vet",
          service_name: "Checkup",
          request_date: "",
          request_time: "",
          notes: "",
        });

        await fetchAppointments();
        setActiveTab("my");
      } else {
        alert(data.message || "Failed to submit vet appointment");
      }
    } catch (error) {
      alert("Failed to submit vet appointment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="vet-container">
      <div className="vet-header">
        <h1>Veterinary Appointment</h1>
        <p>Book checkups, vaccinations, and veterinary services for your pet.</p>
      </div>

      <div className="vet-tabs">
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
        <div className="vet-card">
          <h2>Vet Appointment Form</h2>

          <form className="vet-form" onSubmit={handleSubmit}>
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
              <div className="vet-selected-pet-info">
                <p><strong>Type of Pet:</strong> {petDisplayInfo.typeOfPet}</p>
                {petDisplayInfo.birthdate && (
                  <p><strong>Birthdate:</strong> {new Date(petDisplayInfo.birthdate).toLocaleDateString()}</p>
                )}
                {petDisplayInfo.age && (
                  <p><strong>Age:</strong> {petDisplayInfo.age}</p>
                )}
              </div>
            )}

            {selectedPet && serviceMessage && (
              <div className="vet-service-note">{serviceMessage}</div>
            )}

            {selectedPet && compatibility && !compatibility.isValid && (
              <div className="vet-service-note error">
                {compatibility.message || "This service is not available for this pet type."}
              </div>
            )}

            <select
              name="service_name"
              value={formData.service_name}
              onChange={handleChange}
            >
              <option value="Checkup">Checkup</option>
              <option value="Vaccination">Vaccination</option>
              <option value="Surgery">Surgery</option>
              <option value="Dental">Dental Cleaning</option>
            </select>

            <input
              type="date"
              name="request_date"
              value={formData.request_date}
              onChange={handleChange}
              required
            />

            <input
              type="time"
              name="request_time"
              value={formData.request_time}
              onChange={handleChange}
              required
            />

            <textarea
              name="notes"
              placeholder="Describe pet concern or symptoms"
              value={formData.notes}
              onChange={handleChange}
              required
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
        <div className="vet-card">
          {appointments.length === 0 ? (
            <p>No vet appointments yet.</p>
          ) : (
            appointments.map((item) => (
              <div key={item.id} className="vet-item">
                <h3>{item.pet_name}</h3>
                <p>Service: {item.service_name}</p>
                <p>Date: {item.request_date}</p>
                <p>Time: {item.request_time}</p>
                <p>Concern: {item.notes || "None"}</p>

                <span className={`vet-status ${item.status}`}>
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

export default VetForm;
