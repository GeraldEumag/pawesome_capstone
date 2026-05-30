import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faSpinner,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../../api/client";
import "./NewWalkInBookingModal.css";

const initialForm = {
  customerId: "",
  petId: "",
  ownerName: "",
  petName: "",
  petType: "",
  breed: "",
  appointmentDate: "",
  appointmentTime: "10:00",
  service: "",
  duration: "1 day",
  roomType: "Standard Room",
  symptoms: "",
  medicalNotes: "",
  specialRequests: "",
  bookingType: "hotel",
  paymentMethod: "cash",
  paidAmount: "0",
};

const roomRates = {
  "Standard Room": 50,
  "Deluxe Suite": 80,
  "Presidential Suite": 120,
};

const safeArray = (data, key) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.[key])) return data[key];
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.data?.[key])) return data.data[key];
  if (Array.isArray(data?.records)) return data.records;
  if (Array.isArray(data?.items)) return data.items;
  return [];
};

const formatCurrency = (value) => {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(amount);
};

const parseDurationDays = (duration) => {
  if (!duration) return 1;
  const match = String(duration).match(/(\d+)/);
  return match ? Number(match[1]) : 1;
};

const getPaymentStatusFromAmount = (amount, paid) => {
  const total = Number(amount || 0);
  const paidAmt = Number(paid || 0);
  if (paidAmt >= total && total > 0) return "paid";
  if (paidAmt > 0 && paidAmt < total) return "partial";
  return "pending";
};

const combineDateTime = (date, time) => {
  if (!date || !time) return date;
  const d = new Date(date);
  const [h, m] = String(time).split(":");
  d.setHours(Number(h || 0), Number(m || 0), 0, 0);
  return d.toISOString();
};

const NewWalkInBookingModal = ({ onClose, onSuccess }) => {
  const [form, setForm] = useState(initialForm);
  const [customers, setCustomers] = useState([]);
  const [pets, setPets] = useState([]);
  const [services, setServices] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const [cData, pData, sData] = await Promise.all([
          apiRequest("/customers").catch(() => null),
          apiRequest("/pets").catch(() => null),
          apiRequest("/services").catch(() => null),
        ]);
        setCustomers(safeArray(cData, "customers"));
        setPets(safeArray(pData, "pets"));
        setServices(safeArray(sData, "services"));
      } catch {
        setCustomers([]);
        setPets([]);
        setServices([]);
      }
    };
    load();
  }, []);

  const vetServices = useMemo(() => {
    return services.filter((service) => {
      const category = String(service.category || "").toLowerCase();
      return !category.includes("groom") && !category.includes("boarding") && !category.includes("hotel");
    });
  }, [services]);

  const groomingServices = useMemo(() => {
    return services.filter((service) =>
      String(service.category || "").toLowerCase().includes("groom")
    );
  }, [services]);

  const selectedService = useMemo(() => {
    return services.find(
      (service) =>
        String(service.id) === String(form.service) ||
        String(service.name) === String(form.service)
    );
  }, [services, form.service]);

  const calculatedAmount = useMemo(() => {
    if (form.bookingType === "hotel") {
      const dailyRate = roomRates[form.roomType] || roomRates["Standard Room"];
      return dailyRate * parseDurationDays(form.duration);
    }
    if (selectedService) {
      return Number(selectedService.price || selectedService.amount || 0);
    }
    return 0;
  }, [form.bookingType, form.roomType, form.duration, selectedService]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => {
      if (name === "bookingType") {
        return { ...prev, bookingType: value, service: "" };
      }
      return { ...prev, [name]: value };
    });
  };

  const handleCustomerChange = (customerId) => {
    const customer = customers.find((item) => String(item.id) === String(customerId));
    if (customer) {
      setForm((prev) => ({
        ...prev,
        customerId,
        petId: "",
        ownerName: customer.name || customer.full_name || "",
      }));
    } else {
      setForm((prev) => ({ ...prev, customerId, petId: "", ownerName: "" }));
    }
  };

  const handlePetChange = (petId) => {
    const pet = pets.find((item) => String(item.id) === String(petId));
    if (pet) {
      setForm((prev) => ({
        ...prev,
        petId,
        petName: pet.name || "",
        petType: pet.type || pet.species || "",
        breed: pet.breed || "",
      }));
    } else {
      setForm((prev) => ({ ...prev, petId, petName: "", petType: "", breed: "" }));
    }
  };

  const getAvailablePets = () => {
    if (!form.customerId) return [];
    return pets.filter(
      (pet) =>
        String(pet.customer_id || pet.customerId || pet.owner_id || pet.user_id) ===
        String(form.customerId)
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.customerId || !form.petId || !form.appointmentDate) {
      setError("Please select a customer, pet, and appointment date.");
      return;
    }
    if (form.bookingType !== "hotel" && !form.service) {
      setError("Please select a service.");
      return;
    }

    try {
      setProcessing(true);
      setError("");
      const amount = calculatedAmount;
      const paidAmount = Number(form.paidAmount || 0);
      const paymentStatus = getPaymentStatusFromAmount(amount, paidAmount);

      let endpoint = "";
      let payload = {};

      if (form.bookingType === "hotel") {
        endpoint = "/boardings";
        payload = {
          pet_id: form.petId,
          customer_id: form.customerId,
          hotel_room_id: form.roomType,
          room_type: form.roomType,
          check_in: form.appointmentDate,
          check_out: form.appointmentDate,
          total_amount: amount,
          payment_status: paymentStatus,
          paid_amount: paidAmount,
          payment_method: form.paymentMethod,
          notes: form.specialRequests,
        };
      }

      if (form.bookingType === "vet") {
        endpoint = "/receptionist/appointments";
        payload = {
          pet_id: form.petId,
          customer_id: form.customerId,
          service_id: form.service,
          scheduled_at: combineDateTime(form.appointmentDate, form.appointmentTime),
          price: amount,
          payment_status: paymentStatus,
          paid_amount: paidAmount,
          payment_method: form.paymentMethod,
          symptoms: form.symptoms,
          medical_notes: form.medicalNotes,
          notes: form.specialRequests,
        };
      }

      if (form.bookingType === "grooming") {
        endpoint = "/grooming";
        payload = {
          pet_id: form.petId,
          customer_id: form.customerId,
          service_id: form.service,
          scheduled_at: combineDateTime(form.appointmentDate, form.appointmentTime),
          price: amount,
          payment_status: paymentStatus,
          paid_amount: paidAmount,
          payment_method: form.paymentMethod,
          special_requests: form.specialRequests,
        };
      }

      await apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setForm(initialForm);
      onSuccess();
    } catch (err) {
      setError(err.message || "Failed to create booking. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="hub-modal-overlay" onClick={onClose}>
      <div className="hub-modal hub-booking-modal" onClick={(e) => e.stopPropagation()}>
        <div className="hub-modal-header">
          <div>
            <span className="hub-eyebrow">
              <FontAwesomeIcon icon={faPlus} />
              Walk-in Transaction
            </span>
            <h2>New Booking</h2>
          </div>
          <button type="button" onClick={onClose} disabled={processing}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="hub-modal-body">
          {error && <div className="hub-form-error">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="hub-form-section">
              <h4>Customer &amp; Pet Information</h4>
              <div className="hub-form-grid">
                <div className="hub-form-group">
                  <label>Booking Type *</label>
                  <select name="bookingType" value={form.bookingType} onChange={handleInputChange} required>
                    <option value="hotel">Hotel</option>
                    <option value="vet">Veterinary</option>
                    <option value="grooming">Grooming</option>
                  </select>
                </div>

                <div className="hub-form-group">
                  <label>Select Customer *</label>
                  <select
                    name="customerId"
                    value={form.customerId}
                    onChange={(e) => handleCustomerChange(e.target.value)}
                    required
                  >
                    <option value="">Choose a customer...</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name || customer.full_name || "Customer"} ({customer.phone || "No phone"})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="hub-form-group">
                  <label>Select Pet *</label>
                  <select
                    name="petId"
                    value={form.petId}
                    onChange={(e) => handlePetChange(e.target.value)}
                    required
                    disabled={!form.customerId}
                  >
                    <option value="">
                      {form.customerId ? "Choose a pet..." : "Select customer first"}
                    </option>
                    {getAvailablePets().map((pet) => (
                      <option key={pet.id} value={pet.id}>
                        {pet.name} ({pet.type || pet.species || "Pet"} - {pet.breed || "Unknown breed"})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="hub-form-group">
                  <label>Pet Name</label>
                  <input value={form.petName} disabled />
                </div>
                <div className="hub-form-group">
                  <label>Pet Type</label>
                  <input value={form.petType} disabled />
                </div>
                <div className="hub-form-group">
                  <label>Breed</label>
                  <input value={form.breed} disabled />
                </div>
                <div className="hub-form-group">
                  <label>Owner Name</label>
                  <input value={form.ownerName} disabled />
                </div>
              </div>
            </div>

            <div className="hub-form-section">
              <h4>Schedule &amp; Service</h4>
              <div className="hub-form-grid">
                <div className="hub-form-group">
                  <label>Appointment Date *</label>
                  <input
                    type="date"
                    name="appointmentDate"
                    value={form.appointmentDate}
                    onChange={handleInputChange}
                    min={new Date().toISOString().split("T")[0]}
                    required
                  />
                </div>

                <div className="hub-form-group">
                  <label>Appointment Time</label>
                  <select name="appointmentTime" value={form.appointmentTime} onChange={handleInputChange}>
                    <option value="09:00">9:00 AM</option>
                    <option value="10:00">10:00 AM</option>
                    <option value="11:00">11:00 AM</option>
                    <option value="14:00">2:00 PM</option>
                    <option value="15:00">3:00 PM</option>
                    <option value="16:00">4:00 PM</option>
                    <option value="17:00">5:00 PM</option>
                  </select>
                </div>

                {form.bookingType === "hotel" && (
                  <>
                    <div className="hub-form-group">
                      <label>Room Type *</label>
                      <select name="roomType" value={form.roomType} onChange={handleInputChange} required>
                        <option value="Standard Room">Standard Room</option>
                        <option value="Deluxe Suite">Deluxe Suite</option>
                        <option value="Presidential Suite">Presidential Suite</option>
                      </select>
                    </div>
                    <div className="hub-form-group">
                      <label>Duration *</label>
                      <select name="duration" value={form.duration} onChange={handleInputChange} required>
                        <option value="1 day">1 day</option>
                        <option value="2 days">2 days</option>
                        <option value="3 days">3 days</option>
                        <option value="1 week">1 week</option>
                      </select>
                    </div>
                    <div className="hub-form-group">
                      <label>Service *</label>
                      <select name="service" value={form.service || "Pet Hotel Stay"} onChange={handleInputChange} required>
                        <option value="Pet Hotel Stay">Pet Hotel Stay</option>
                        <option value="Day Care">Day Care</option>
                        <option value="Pet Training">Pet Training</option>
                      </select>
                    </div>
                  </>
                )}

                {form.bookingType === "vet" && (
                  <>
                    <div className="hub-form-group">
                      <label>Service *</label>
                      <select name="service" value={form.service} onChange={handleInputChange} required>
                        <option value="">Select a service</option>
                        {vetServices.map((service) => (
                          <option key={service.id} value={service.id}>
                            {service.name} - {formatCurrency(service.price)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="hub-form-group full">
                      <label>Symptoms</label>
                      <textarea name="symptoms" value={form.symptoms} onChange={handleInputChange} placeholder="Describe symptoms or reason for visit..." />
                    </div>
                    <div className="hub-form-group full">
                      <label>Medical Notes</label>
                      <textarea name="medicalNotes" value={form.medicalNotes} onChange={handleInputChange} placeholder="Optional medical notes..." />
                    </div>
                  </>
                )}

                {form.bookingType === "grooming" && (
                  <div className="hub-form-group">
                    <label>Service *</label>
                    <select name="service" value={form.service} onChange={handleInputChange} required>
                      <option value="">Select a service</option>
                      {groomingServices.map((service) => (
                        <option key={service.id} value={service.id}>
                          {service.name} - {formatCurrency(service.price)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="hub-form-group full">
                  <label>Special Requests</label>
                  <textarea name="specialRequests" value={form.specialRequests} onChange={handleInputChange} placeholder="Any special requests or notes..." />
                </div>
              </div>
            </div>

            <div className="hub-form-section">
              <h4>Payment Information</h4>
              <div className="hub-payment-preview">
                <div><span>Estimated Amount</span><strong>{formatCurrency(calculatedAmount)}</strong></div>
                <div><span>Paid Amount</span><strong>{formatCurrency(form.paidAmount)}</strong></div>
                <div><span>Payment Status</span><strong>{getPaymentStatusFromAmount(calculatedAmount, form.paidAmount)}</strong></div>
              </div>
              <div className="hub-form-grid">
                <div className="hub-form-group">
                  <label>Payment Method *</label>
                  <select name="paymentMethod" value={form.paymentMethod} onChange={handleInputChange} required>
                    <option value="cash">Cash</option>
                    <option value="card">Credit Card</option>
                    <option value="gcash">GCash</option>
                    <option value="bank">Bank Transfer</option>
                  </select>
                </div>
                <div className="hub-form-group">
                  <label>Paid Amount</label>
                  <input
                    type="number"
                    name="paidAmount"
                    value={form.paidAmount}
                    onChange={handleInputChange}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
            </div>

            <div className="hub-modal-actions">
              <button type="button" className="hub-modal-btn secondary" onClick={onClose} disabled={processing}>
                Cancel
              </button>
              <button type="submit" className="hub-modal-btn approve" disabled={processing}>
                {processing && <FontAwesomeIcon icon={faSpinner} spin />} Create Booking
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default NewWalkInBookingModal;
