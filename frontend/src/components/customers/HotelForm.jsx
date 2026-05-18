import React, { useState, useEffect, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHotel,
  faPlus,
  faBed,
  faCalendarAlt,
  faPaw,
  faCheckCircle,
  faTimesCircle,
  faReceipt,
  faClipboardList,
} from "@fortawesome/free-solid-svg-icons";
import "./HotelForm.css";
import { apiRequest } from "../../api/client";

const normalizeList = (result, keys = []) => {
  if (Array.isArray(result)) return result;

  for (const key of keys) {
    if (Array.isArray(result?.[key])) return result[key];
    if (Array.isArray(result?.[key]?.data)) return result[key].data;
  }

  if (Array.isArray(result?.data)) return result.data;
  if (Array.isArray(result?.items)) return result.items;
  if (Array.isArray(result?.requests)) return result.requests;
  if (Array.isArray(result?.boarding_requests)) return result.boarding_requests;
  if (Array.isArray(result?.boardings?.data)) return result.boardings.data;
  if (Array.isArray(result?.care_logs)) return result.care_logs;

  return [];
};

const HotelForm = () => {
  const [activeTab, setActiveTab] = useState("book");
  const [myBookings, setMyBookings] = useState([]);
  const [pets, setPets] = useState([]);
  const [careLogs, setCareLogs] = useState({});
  const [paymentFiles, setPaymentFiles] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [boardingAvailability, setBoardingAvailability] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);

  const [bookingForm, setBookingForm] = useState({
    pet_id: "",
    pet_name: "",
    pet_type: "",
    pet_breed: "",
    check_in_date: "",
    check_out_date: "",
    check_in_time: "",
    check_out_time: "",
    boarding_type: "standard",
    special_instructions: "",
    feeding_instructions: "",
    medication_notes: "",
    emergency_contact: "",
    notes: "",
  });

  const fetchPets = useCallback(async () => {
    try {
      const result = await apiRequest("/customer/pets");
      setPets(normalizeList(result, ["pets"]));
    } catch {
      setPets([]);
    }
  }, []);

  const fetchMyBookings = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await apiRequest("/customer/boarding-requests");
      setMyBookings(normalizeList(data, ["boarding_requests", "boardings"]));
    } catch (err) {
      setError(err.message || "Failed to load boarding requests.");
      setMyBookings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPets();
    fetchMyBookings();
  }, [fetchPets, fetchMyBookings]);

  const selectedPet = pets.find((pet) => String(pet.id) === String(bookingForm.pet_id));

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

  const handleRoomSelect = (room) => {
    setSelectedRoom(room);
    setBookingForm(prev => ({ ...prev, hotel_room_id: room.id }));
  };

  const handleCreateBooking = async (e) => {
    e.preventDefault();

    // Check if a room is selected
    if (!selectedRoom) {
      setError("Please select an available room for your stay.");
      return;
    }

    // Check if selected room is still available
    if (boardingAvailability && !boardingAvailability.rooms?.find(room => room.id === selectedRoom.id && room.available)) {
      setError("Selected room is no longer available. Please choose another room.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const payload = {
        pet_id: bookingForm.pet_id || undefined,
        pet_name: selectedPet?.name || bookingForm.pet_name,
        pet_type: selectedPet?.type || selectedPet?.species || bookingForm.pet_type,
        pet_breed: selectedPet?.breed || bookingForm.pet_breed,
        check_in_date: bookingForm.check_in_date,
        check_out_date: bookingForm.check_out_date,
        check_in_time: bookingForm.check_in_time,
        check_out_time: bookingForm.check_out_time,
        room_id: selectedRoom?.id,
        special_requests: bookingForm.special_instructions,
        feeding_instructions: bookingForm.feeding_instructions,
        medication_notes: bookingForm.medication_notes,
        emergency_contact: bookingForm.emergency_contact,
        notes: bookingForm.notes,
      };

      await apiRequest("/customer/boarding-requests", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setSuccessMessage("Pet boarding request submitted successfully.");
      setBookingForm({
        pet_id: "",
        pet_name: "",
        pet_type: "",
        pet_breed: "",
        check_in_date: "",
        check_out_date: "",
        check_in_time: "",
        check_out_time: "",
        boarding_type: "standard",
        special_instructions: "",
        feeding_instructions: "",
        medication_notes: "",
        emergency_contact: "",
        notes: "",
      });
      await fetchMyBookings();
      setActiveTab("my-bookings");
    } catch (err) {
      setError(err.message || "Failed to create boarding request.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelBooking = async (bookingId) => {
    if (!window.confirm("Cancel this pending boarding request?")) return;

    try {
      setLoading(true);
      await apiRequest(`/customer/boarding-requests/${bookingId}/cancel`, { method: "POST" });
      setSuccessMessage("Boarding request cancelled.");
      await fetchMyBookings();
    } catch (err) {
      setError(err.message || "Failed to cancel reservation.");
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentUpload = async (booking) => {
    const file = paymentFiles[booking.id];
    if (!file) {
      setError("Choose a payment proof file first.");
      return;
    }

    const formData = new FormData();
    formData.append("payment_method", "online_transfer");
    formData.append("payment_proof", file);

    try {
      setLoading(true);
      await apiRequest(`/customer/boarding-requests/${booking.id}/payment-proof`, {
        method: "POST",
        body: formData,
      });
      setSuccessMessage("Payment proof submitted for cashier verification.");
      setPaymentFiles((prev) => ({ ...prev, [booking.id]: null }));
      await fetchMyBookings();
    } catch (err) {
      setError(err.message || "Failed to upload payment proof.");
    } finally {
      setLoading(false);
    }
  };

  const fetchCareLogs = async (bookingId) => {
    try {
      const data = await apiRequest(`/customer/boarding-requests/${bookingId}/care-logs`);
      setCareLogs((prev) => ({ ...prev, [bookingId]: normalizeList(data, ["care_logs"]) }));
    } catch (err) {
      setError(err.message || "Failed to load care logs.");
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: { bg: "#fef3c7", color: "#d97706" },
      approved: { bg: "#dbeafe", color: "#2563eb" },
      scheduled: { bg: "#ede9fe", color: "#7c3aed" },
      checked_in: { bg: "#dcfce7", color: "#16a34a" },
      in_care: { bg: "#dcfce7", color: "#16a34a" },
      ready_for_pickup: { bg: "#cffafe", color: "#0891b2" },
      completed: { bg: "#fce7f3", color: "#be185d" },
      rejected: { bg: "#fee2e2", color: "#dc2626" },
      cancelled: { bg: "#f3f4f6", color: "#4b5563" },
    };
    return styles[status] || styles.pending;
  };

  const canUploadPayment = (booking) =>
    ["approved", "scheduled"].includes(booking.status) &&
    ["unpaid", "rejected"].includes(booking.payment_status || "unpaid");

  const fetchBoardingAvailability = async (roomType = null) => {
    if (!bookingForm.pet_id || !bookingForm.check_in_date || !bookingForm.check_out_date) {
      setBoardingAvailability(null);
      return;
    }

    try {
      setAvailabilityLoading(true);
      setError("");
      
      const params = new URLSearchParams({
        pet_id: bookingForm.pet_id,
        check_in_date: bookingForm.check_in_date,
        check_out_date: bookingForm.check_out_date,
      });
      
      if (roomType) {
        params.append('room_type', roomType);
      }
      
      const data = await apiRequest(`/boarding/rooms/available?${params}`);
      
      if (data.success) {
        setBoardingAvailability(data);
      } else {
        setBoardingAvailability(null);
        setError(data.message || "No rooms available for the selected dates.");
      }
    } catch (err) {
      setError(err.message || "Failed to check availability.");
      setBoardingAvailability(null);
    } finally {
      setAvailabilityLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setBookingForm((prev) => ({ ...prev, [name]: value }));

    // Check availability when pet or dates are selected
    if ((name === "pet_id" || name === "check_in_date" || name === "check_out_date") && value) {
      const updatedForm = { ...bookingForm, [name]: value };
      if (updatedForm.pet_id && updatedForm.check_in_date && updatedForm.check_out_date) {
        fetchBoardingAvailability(updatedForm.room_type);
      }
    }
  };

  // Calculate total amount when room is selected
  const calculateTotal = () => {
    if (!selectedRoom || !bookingForm.check_in_date || !bookingForm.check_out_date) {
      return { total: 0, days: 0, dailyRate: 0 };
    }

    const checkIn = new Date(bookingForm.check_in_date);
    const checkOut = new Date(bookingForm.check_out_date);
    const days = Math.max(1, Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24)));
    const roomSubtotal = selectedRoom.daily_rate * days;
    const total = roomSubtotal;

    return {
      total,
      days,
      dailyRate: selectedRoom.daily_rate,
      roomSubtotal,
    };
  };

  const pricing = calculateTotal();

  return (
    <div className="customer-hotel-reservation">
      <div className="hotel-header">
        <div className="header-left">
          <h1><FontAwesomeIcon icon={faHotel} /> Pet Hotel</h1>
          <p>Book and track a live pet boarding stay</p>
        </div>
      </div>

      {error && (
        <div className="hotel-error">
          <span>x</span>
          <p>{error}</p>
        </div>
      )}
      {successMessage && (
        <div className="alert alert-success">
          <FontAwesomeIcon icon={faCheckCircle} /> {successMessage}
        </div>
      )}

      <div className="hotel-tabs">
        <button className={`hotel-tab ${activeTab === "book" ? "active" : ""}`} onClick={() => setActiveTab("book")}>
          <FontAwesomeIcon icon={faPlus} /> New Reservation
        </button>
        <button className={`hotel-tab ${activeTab === "my-bookings" ? "active" : ""}`} onClick={() => setActiveTab("my-bookings")}>
          <FontAwesomeIcon icon={faBed} /> My Bookings ({myBookings.length})
        </button>
      </div>

      {activeTab === "book" && (
        <div className="book-tab">
          <div className="booking-form-section">
            <h3><FontAwesomeIcon icon={faCalendarAlt} /> Boarding Request</h3>

            <form onSubmit={handleCreateBooking}>
              <div className="form-group">
                <label>Saved Pet</label>
                <select name="pet_id" value={bookingForm.pet_id} onChange={handleChange}>
                  <option value="">Enter pet details manually</option>
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
              </div>

              {selectedPet && petDisplayInfo && (
                <div className="hotel-selected-pet-info">
                  <p><strong>Type of Pet:</strong> {petDisplayInfo.typeOfPet}</p>
                  {petDisplayInfo.birthdate && (
                    <p><strong>Birthdate:</strong> {new Date(petDisplayInfo.birthdate).toLocaleDateString()}</p>
                  )}
                  {petDisplayInfo.age && (
                    <p><strong>Age:</strong> {petDisplayInfo.age}</p>
                  )}
                </div>
              )}

              {!bookingForm.pet_id && (
                <>
                  <div className="form-group">
                    <label>Pet Name *</label>
                    <input type="text" name="pet_name" value={bookingForm.pet_name} onChange={handleChange} required placeholder="Enter pet name" />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Type of Pet *</label>
                      <input type="text" name="pet_type" value={bookingForm.pet_type} onChange={handleChange} required placeholder="Dog, cat, etc." />
                    </div>
                    <div className="form-group">
                      <label>Breed</label>
                      <input type="text" name="pet_breed" value={bookingForm.pet_breed} onChange={handleChange} />
                    </div>
                  </div>
                </>
              )}

              <div className="form-row">
                <div className="form-group">
                  <label>Check-in Date *</label>
                  <input type="date" name="check_in_date" value={bookingForm.check_in_date} onChange={handleChange} required min={new Date().toISOString().split("T")[0]} />
                </div>
                <div className="form-group">
                  <label>Check-out Date *</label>
                  <input type="date" name="check_out_date" value={bookingForm.check_out_date} onChange={handleChange} required min={bookingForm.check_in_date || new Date().toISOString().split("T")[0]} />
                </div>
              </div>

              {/* Availability Display */}
              {boardingAvailability && (
                <div className="hotel-availability">
                  <h4>Available Rooms for Your Stay</h4>
                  {boardingAvailability.rooms && boardingAvailability.rooms.length > 0 ? (
                    <div className="rooms-grid">
                      {boardingAvailability.rooms.map((room) => (
                        <button
                          key={room.id}
                          type="button"
                          className={`room-card ${!room.available ? 'unavailable' : ''} ${selectedRoom?.id === room.id ? 'selected' : ''}`}
                          onClick={() => room.available && handleRoomSelect(room)}
                          disabled={!room.available}
                        >
                          <div className="room-header">
                            <span className="room-name">{room.room_name}</span>
                            <span className="room-type">{room.room_type}</span>
                          </div>
                          <div className="room-details">
                            <span className="room-capacity">Capacity: {room.capacity}</span>
                            <span className="room-rate">₱{room.daily_rate}/day</span>
                            <span className="room-size">{room.size_allowed}</span>
                          </div>
                          <span className="room-status">
                            {room.available ? 'Available' : room.reason || 'Not Available'}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="no-availability">
                      <p>No rooms or kennels are available for the selected date range.</p>
                    </div>
                  )}
                </div>
              )}

              {availabilityLoading && (
                <div className="availability-loading">
                  <span>Checking room availability...</span>
                </div>
              )}

              {bookingForm.check_in_date && bookingForm.check_out_date && !boardingAvailability && !availabilityLoading && (
                <div className="availability-prompt">
                  <p>Please select both dates to check available rooms.</p>
                </div>
              )}

              {/* Pricing Summary */}
              {selectedRoom && pricing.total > 0 && (
                <div className="pricing-summary">
                  <h4><FontAwesomeIcon icon={faReceipt} /> Pricing Summary</h4>
                  <div className="pricing-details">
                    <div className="pricing-row">
                      <span>Room:</span>
                      <span>{selectedRoom.room_name}</span>
                    </div>
                    <div className="pricing-row">
                      <span>Daily Rate:</span>
                      <span>₱{pricing.dailyRate}</span>
                    </div>
                    <div className="pricing-row">
                      <span>Number of Days:</span>
                      <span>{pricing.days}</span>
                    </div>
                    <div className="pricing-row">
                      <span>Room Subtotal:</span>
                      <span>₱{pricing.roomSubtotal}</span>
                    </div>
                    <div className="pricing-row total">
                      <span>Total Amount:</span>
                      <span>₱{pricing.total}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="form-row">
                <div className="form-group">
                  <label>Check-in Time</label>
                  <input type="time" name="check_in_time" value={bookingForm.check_in_time} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label>Check-out Time</label>
                  <input type="time" name="check_out_time" value={bookingForm.check_out_time} onChange={handleChange} />
                </div>
              </div>

              <div className="form-group">
                <label>Feeding Instructions</label>
                <textarea name="feeding_instructions" value={bookingForm.feeding_instructions} onChange={handleChange} rows={2} />
              </div>

              <div className="form-group">
                <label>Medication Notes</label>
                <textarea name="medication_notes" value={bookingForm.medication_notes} onChange={handleChange} rows={2} />
              </div>

              <div className="form-group">
                <label>Emergency Contact</label>
                <input type="text" name="emergency_contact" value={bookingForm.emergency_contact} onChange={handleChange} />
              </div>

              <div className="form-group">
                <label>Special Instructions</label>
                <textarea name="special_instructions" value={bookingForm.special_instructions} onChange={handleChange} rows={3} />
              </div>

              <button type="submit" disabled={loading}>
                {loading ? "Submitting..." : "Submit Boarding Request"}
              </button>
            </form>
          </div>
        </div>
      )}

      {activeTab === "my-bookings" && (
        <div className="my-bookings-tab">
          {myBookings.length === 0 ? (
            <div className="no-bookings">
              <FontAwesomeIcon icon={faBed} />
              <p>No boarding requests yet.</p>
              <button onClick={() => setActiveTab("book")}><FontAwesomeIcon icon={faPlus} /> Make Reservation</button>
            </div>
          ) : (
            <div className="bookings-list">
              {myBookings.map((booking) => {
                const statusStyle = getStatusBadge(booking.status);
                const logs = careLogs[booking.id] || [];

                return (
                  <div key={booking.id} className="booking-card">
                    <div className="booking-header">
                      <div className="booking-id">Boarding #{booking.id}</div>
                      <span className="status-badge" style={{ backgroundColor: statusStyle.bg, color: statusStyle.color }}>
                        {booking.status}
                      </span>
                    </div>

                    <div className="booking-details">
                      <div className="detail-row"><span className="label"><FontAwesomeIcon icon={faPaw} /> Pet:</span><span className="value">{booking.pet?.name || booking.pet_name}</span></div>
                      <div className="detail-row"><span className="label"><FontAwesomeIcon icon={faBed} /> Room:</span><span className="value">{booking.hotel_room?.name || booking.hotel_room?.room_number || booking.boarding_type || "Pending assignment"}</span></div>
                      <div className="detail-row"><span className="label"><FontAwesomeIcon icon={faCalendarAlt} /> Stay:</span><span className="value">{booking.check_in?.slice(0, 10)} to {booking.check_out?.slice(0, 10)}</span></div>
                      <div className="detail-row"><span className="label"><FontAwesomeIcon icon={faReceipt} /> Payment:</span><span className="value">{booking.payment_status || "unpaid"}</span></div>
                      {booking.rejection_reason && <div className="detail-row"><span className="label">Reason:</span><span className="value">{booking.rejection_reason}</span></div>}
                    </div>

                    <div className="booking-actions">
                      {booking.status === "pending" && (
                        <button className="cancel-btn" onClick={() => handleCancelBooking(booking.id)} disabled={loading}>
                          <FontAwesomeIcon icon={faTimesCircle} /> Cancel
                        </button>
                      )}

                      {canUploadPayment(booking) && (
                        <div className="payment-upload-inline">
                          <input type="file" accept="image/*,.pdf" onChange={(e) => setPaymentFiles((prev) => ({ ...prev, [booking.id]: e.target.files?.[0] }))} />
                          <button type="button" onClick={() => handlePaymentUpload(booking)} disabled={loading || !paymentFiles[booking.id]}>
                            <FontAwesomeIcon icon={faReceipt} /> Upload Proof
                          </button>
                        </div>
                      )}

                      {["checked_in", "in_care", "ready_for_pickup", "completed"].includes(booking.status) && (
                        <button type="button" onClick={() => fetchCareLogs(booking.id)}>
                          <FontAwesomeIcon icon={faClipboardList} /> View Care Logs
                        </button>
                      )}
                    </div>

                    {logs.length > 0 && (
                      <div className="care-log-list">
                        {logs.map((log) => (
                          <div key={log.id} className="care-log-item">
                            <strong>{log.title || log.log_type}</strong>
                            <p>{log.notes}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default HotelForm;
