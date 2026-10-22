import React, { useState, useEffect, useCallback } from "react";
import { showConfirm, showWarning, showSuccess, showError, showReasonPrompt, CUSTOMER_CANCEL_REASONS } from "../../utils/alert.jsx";
import BookingReviewModal from "../shared/BookingReviewModal";
import CustomerPetDetails, { getPetDisplayInfo } from "../shared/CustomerPetDetails";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import PaymentUploadModal from "../../components/shared/PaymentUploadModal";
import catHotelImg from "../../assets/CATHOTEL.jpg";
import dogHotelImg from "../../assets/DOGHOTEL.jpg";
import daycareImg from "../../assets/PETDAYCARE.jpg";
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
import { useBlockedHolidays } from "../../hooks/useBlockedHolidays";
import { getDraft, clearDraft } from "../../utils/preBookingDraft";
import DatePickerInput from "../../components/shared/DatePickerInput";
import CustomerBookingsBoard from "./CustomerBookingsBoard";
import BackToServices from "./BackToServices";
import { formatDateOnly, parseDateOnly } from "../../utils/date";
import { getRoomName } from "../../utils/apiNormalize";


const CATEGORY_CONFIG = {
  dog_hotel: { img: dogHotelImg, label: "Dog Hotel",  badge: "#f97316" },
  cat_hotel: { img: catHotelImg, label: "Cat Hotel",  badge: "#8b5cf6" },
  daycare:   { img: daycareImg,  label: "Daycare",    badge: "#10b981" },
  other:     { img: null,        label: "Other",      badge: "#64748b" },
};

const getRoomConfig = (room) => {
  const cat = room.hotel_category ||
    (room.room_type?.startsWith("dog") || room.room_type === "kennel" ? "dog_hotel" :
     room.room_type?.startsWith("cat") || room.room_type === "cattery" ? "cat_hotel" :
     room.room_type?.startsWith("daycare") ? "daycare" : "other");
  return CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.other;
};

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
  const { excludeDates: blockedDates, hint: holidayHint } = useBlockedHolidays();
  const [activeTab, setActiveTab] = useState("book");
  const [boardKey, setBoardKey] = useState(0);
  const [pets, setPets] = useState([]);
  const [careLogs, setCareLogs] = useState({});
  const [uploadModal, setUploadModal] = useState({ open: false, endpoint: "", title: "", referenceNumber: "", paymentStatus: "", rejectionReason: "", paymentMethod: "gcash", amount: null, awaitingBookingApproval: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [boardingAvailability, setBoardingAvailability] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [vaccinationUploadId, setVaccinationUploadId] = useState(null);

  const [bookingForm, setBookingForm] = useState({
    pet_id: "",
    pet_name: "",
    pet_type: "",
    check_in_date: "",
    boarding_type: "standard",
    notes: "",
  });
  const [vaccinationCard, setVaccinationCard] = useState(null);
  const [vaccinationPreview, setVaccinationPreview] = useState(null);

  const fetchPets = useCallback(async () => {
    try {
      const result = await apiRequest("/customer/pets");
      setPets(normalizeList(result, ["pets"]));
    } catch {
      setPets([]);
    }
  }, []);

  useEffect(() => {
    fetchPets();
  }, [fetchPets]);

  useEffect(() => {
    const draft = getDraft();
    if (!draft || draft.service_type !== "hotel") return;

    const updates = {};
    // Pet identity resolves to a registered pet once the list loads —
    // the draft's name/species are only matching hints, never submitted raw.
    if (draft.form_data?.pet_id) updates.pet_id = draft.form_data.pet_id;
    if (draft.form_data?.pet_name) updates.pet_name = draft.form_data.pet_name;
    if (draft.form_data?.pet_type) updates.pet_type = draft.form_data.pet_type;
    if (draft.form_data?.check_in_date) updates.check_in_date = draft.form_data.check_in_date;
    if (draft.form_data?.room_type) updates.boarding_type = draft.form_data.room_type;
    if (draft.form_data?.special_care_instructions) updates.notes = draft.form_data.special_care_instructions;

    setBookingForm((prev) => ({ ...prev, ...updates }));
    clearDraft();

    const merged = { ...bookingForm, ...updates };
    if (merged.check_in_date && (merged.pet_id || merged.pet_type)) {
      fetchBoardingAvailability(merged);
    }

    if (Object.keys(updates).length > 0) {
      showSuccess("We have restored your booking details. Please select your registered pet to continue.");
    }
  }, []);

  // Once pets finish loading, resolve a draft's pet hint to a real pet so the
  // booking is always linked — a restored name is never submitted as-is.
  useEffect(() => {
    if (pets.length === 0) return;

    if (bookingForm.pet_id) {
      // Draft carried a pet_id — fill derived display fields from the record.
      const selected = pets.find((p) => String(p.id) === String(bookingForm.pet_id));
      if (!selected || bookingForm.pet_name) return;
      const updatedForm = {
        ...bookingForm,
        pet_name: selected.name,
        pet_type: selected.species || selected.type || "",
      };
      setBookingForm(updatedForm);
      if (updatedForm.check_in_date) fetchBoardingAvailability(updatedForm);
      return;
    }

    if (!bookingForm.pet_name && !bookingForm.pet_type) return;

    const name = (bookingForm.pet_name || "").toLowerCase();
    const species = (bookingForm.pet_type || "").toLowerCase();
    const byName = name ? pets.filter((p) => (p.name || "").toLowerCase() === name) : [];
    const bySpecies = species
      ? pets.filter((p) => (p.species || p.type || "").toLowerCase() === species)
      : [];
    const pet = byName.length === 1 ? byName[0] : bySpecies.length === 1 ? bySpecies[0] : null;
    if (!pet) return;

    const updatedForm = {
      ...bookingForm,
      pet_id: pet.id,
      pet_name: pet.name,
      pet_type: pet.species || pet.type || "",
    };
    setBookingForm(updatedForm);
    if (updatedForm.check_in_date) fetchBoardingAvailability(updatedForm);
  }, [pets, bookingForm.pet_id, bookingForm.pet_name, bookingForm.pet_type]);

  const selectedPet = pets.find((pet) => String(pet.id) === String(bookingForm.pet_id));


  const petDisplayInfo = getPetDisplayInfo(selectedPet);

  const handleRoomSelect = (room) => {
    setSelectedRoom(room);
    const isLegacy = String(room.id).startsWith("hotel_");
    const realId = isLegacy ? String(room.id).replace("hotel_", "") : room.id;
    setBookingForm(prev => ({
      ...prev,
      room_id: isLegacy ? undefined : realId,
      hotel_room_id: isLegacy ? realId : undefined,
    }));
  };

  const [reviewOpen, setReviewOpen] = useState(false);

  const handleCreateBooking = (e) => {
    e.preventDefault();

    if (!selectedRoom) {
      setError("Please select an available room for your stay.");
      showWarning("Please select an available room for your stay.");
      return;
    }

    if (boardingAvailability && !boardingAvailability.rooms?.find(room => room.id === selectedRoom.id && room.available)) {
      setError("Selected room is no longer available. Please choose another room.");
      showWarning("Selected room is no longer available. Please choose another room.");
      return;
    }

    if (!bookingForm.pet_id || !selectedPet) {
      setError("Please select one of your registered pets for this booking.");
      showWarning("Please select one of your registered pets for this booking.");
      return;
    }

    if (!vaccinationCard) {
      setError("Upload your pet's vaccination card before submitting a hotel booking.");
      showWarning("Upload your pet's vaccination card before submitting a hotel booking.");
      return;
    }

    setReviewOpen(true);
  };

  const confirmBooking = async ({ payNow = false } = {}) => {
    try {
      setLoading(true);
      setError("");

      const formData = new FormData();
      formData.append("pet_id", bookingForm.pet_id);
      formData.append("pet_name", selectedPet.name || "");
      formData.append("pet_type", selectedPet.type || selectedPet.species || "");
      formData.append("pet_breed", selectedPet.breed || "");
      formData.append("check_in_date", bookingForm.check_in_date);
      formData.append("number_of_days", "1");
      if (bookingForm.room_id) {
        formData.append("room_id", bookingForm.room_id);
      }
      if (bookingForm.hotel_room_id) {
        formData.append("hotel_room_id", bookingForm.hotel_room_id);
      }
      formData.append("notes", bookingForm.notes || "");
      if (vaccinationCard) {
        formData.append("vaccination_card", vaccinationCard);
      }

      const data = await apiRequest("/customer/boardings", {
        method: "POST",
        body: formData,
      });

      const booking = data.boarding;
      setReviewOpen(false);
      setSuccessMessage("Pet boarding request submitted successfully.");
      if (!payNow) showSuccess("Pet boarding request submitted successfully.");
      setBookingForm({
        pet_id: "",
        pet_name: "",
        pet_type: "",
        check_in_date: "",
        boarding_type: "standard",
        notes: "",
      });
      setVaccinationCard(null);
      setVaccinationPreview(null);
      if (payNow && booking?.id) {
        setUploadModal({
          open: true,
          endpoint: `/customer/boarding-requests/${booking.id}/payment-proof`,
          title: `Boarding — ${booking.pet_name || selectedPet.name || "Pet"}`,
          referenceNumber: booking.payment_reference || "",
          paymentStatus: booking.payment_status || "unpaid",
          rejectionReason: booking.rejection_reason || "",
          paymentMethod: booking.payment_method || "gcash",
          amount: booking.total_amount ?? pricing.total,
          awaitingBookingApproval: true,
        });
      }
      setBoardKey((key) => key + 1);
      setActiveTab("my-bookings");
    } catch (err) {
      setError(err.message || "Failed to create boarding request.");
      showError(err.message || "Failed to create boarding request.");
    } finally {
      setLoading(false);
    }
  };

  const renderHotelExtras = (item) => {
    const logs = careLogs[item.id] || [];
    const awaitingCard = item.actions.includes("vaccination");
    if (!awaitingCard && !item.actions.includes("care_logs") && logs.length === 0) return null;
    return (
      <>
        {awaitingCard && (
          <div className={`booking-vaccination-status ${item.vaccination_verified ? "verified" : "pending"}`}>
            <strong>Vaccination Card</strong>
            <span>
              {item.vaccination_verified
                ? "Verified by reception"
                : item.has_vaccination_card
                  ? "Uploaded — waiting for reception verification"
                  : "Required before reception can approve this booking"}
            </span>
            <label>
              {item.has_vaccination_card ? "Replace unverified card" : "Upload vaccination card"}
              <input
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                aria-label={`${item.has_vaccination_card ? "Replace" : "Upload"} vaccination card for boarding ${item.id}`}
                disabled={vaccinationUploadId === item.id}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  uploadVaccinationCard({ id: item.id, vaccination_card: item.has_vaccination_card }, file);
                }}
              />
            </label>
          </div>
        )}
        {item.actions.includes("care_logs") && (
          <button type="button" className="bc-action primary" onClick={() => fetchCareLogs(item.id)}>
            <FontAwesomeIcon icon={faClipboardList} /> Care Logs
          </button>
        )}
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
      </>
    );
  };

  const uploadVaccinationCard = async (booking, file) => {
    if (!file || vaccinationUploadId) return;
    const body = new FormData();
    body.append("vaccination_card", file);

    try {
      setVaccinationUploadId(booking.id);
      const result = await apiRequest(`/customer/boarding-requests/${booking.id}/vaccination-card`, {
        method: "POST",
        body,
      });
      setBoardKey((key) => key + 1);
      showSuccess(result.message || "Vaccination card uploaded for receptionist verification.");
    } catch (err) {
      showError(err.message || "Failed to upload vaccination card.");
    } finally {
      setVaccinationUploadId(null);
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

  const fetchBoardingAvailability = async (form = bookingForm) => {
    const pet = pets.find((p) => String(p.id) === String(form.pet_id));
    const species = (pet?.species || pet?.type || form.pet_type || "").toLowerCase().trim();
    if (!form?.check_in_date || !species) {
      setBoardingAvailability(null);
      return;
    }

    try {
      setAvailabilityLoading(true);
      setError("");

      // Same-day stay: check-out equals check-in
      const params = new URLSearchParams({
        species,
        check_in_date: form.check_in_date,
        check_out_date: form.check_in_date,
      });

      if (form.pet_id) {
        params.append('pet_id', form.pet_id);
      }

      if (form.room_type) {
        params.append('room_type', form.room_type);
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

    // Pet identity always comes from the selected registered pet — never
    // typed manually — so the booking stays linked to a real pets row.
    if (name === "pet_id") {
      const pet = pets.find((item) => String(item.id) === String(value));
      const updatedForm = {
        ...bookingForm,
        pet_id: value,
        pet_name: pet?.name || "",
        pet_type: pet?.species || pet?.type || "",
      };
      setBookingForm((prev) => ({
        ...prev,
        pet_id: value,
        pet_name: pet?.name || "",
        pet_type: pet?.species || pet?.type || "",
      }));
      setSelectedRoom(null);
      if (value && updatedForm.check_in_date && updatedForm.pet_type) {
        fetchBoardingAvailability(updatedForm);
      } else {
        setBoardingAvailability(null);
      }
      return;
    }

    setBookingForm((prev) => ({ ...prev, [name]: value }));

    if (name === "check_in_date") {
      const updatedForm = { ...bookingForm, [name]: value };
      // A previous selection is only valid for the exact pet+date pair
      setSelectedRoom(null);
      if (value && updatedForm.check_in_date && updatedForm.pet_id) {
        // Pass updatedForm — bookingForm state here is still pre-change
        fetchBoardingAvailability(updatedForm);
      } else {
        setBoardingAvailability(null);
      }
    }
  };

  // Calculate total amount when room is selected (same-day stay = 1 day)
  const calculateTotal = () => {
    if (!selectedRoom || !bookingForm.check_in_date) {
      return { total: 0, days: 0, dailyRate: 0 };
    }

    const days = 1;
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
      <BackToServices />
      <header className="hotel-header">
        <div>
          <h3><FontAwesomeIcon icon={faHotel} /> Pet Hotel</h3>
        </div>
      </header>

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
          <FontAwesomeIcon icon={faBed} /> My Bookings
        </button>
      </div>

      {activeTab === "book" && (
        <div className="book-tab">
          <div className="booking-form-section">
            <h3><FontAwesomeIcon icon={faCalendarAlt} /> Boarding Request</h3>

            <form onSubmit={handleCreateBooking}>
              <div className="form-group">
                <label>Pet *</label>
                <select name="pet_id" value={bookingForm.pet_id} onChange={handleChange} required>
                  <option value="">Select your pet</option>
                  {pets.map((pet) => {
                    const info = getPetDisplayInfo(pet);
                    return (
                      <option key={pet.id} value={pet.id}>
                        {pet.name} — {info?.typeOfPet || "Pet"}
                        {info?.breed && info.breed !== "Not provided" ? ` · ${info.breed}` : ""}
                        {info?.age ? ` (${info.age})` : ""}
                      </option>
                    );
                  })}
                </select>
                {pets.length === 0 && (
                  <p className="hotel-no-pets-notice">
                    You need a registered pet to book a hotel stay.{" "}
                    <a href="/customer/pets">Register a pet first</a>, then come
                    back to book.
                  </p>
                )}
              </div>

              {selectedPet && <CustomerPetDetails pet={selectedPet} />}

              <div className="form-row">
                <div className="form-group">
                  <label>Stay Date *</label>
                  <DatePickerInput
                    selected={parseDateOnly(bookingForm.check_in_date)}
                    onChange={(date) =>
                      handleChange({
                        target: {
                          name: "check_in_date",
                          value: formatDateOnly(date),
                        },
                      })
                    }
                    placeholderText="mm/dd/yyyy"
                    minDate={new Date()}
                    excludeDates={blockedDates}
                    helperText={holidayHint}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Stay Duration</label>
                  <input type="text" value="Same-day stay — check-out by 6:00 PM" disabled readOnly />
                </div>
              </div>

              {/* Availability Display */}
              {boardingAvailability && (
                <div className="hotel-availability">
                  <h4>Rooms for Your Stay</h4>
                  {boardingAvailability.rooms && boardingAvailability.rooms.length > 0 ? (
                    <div className="rooms-grid">
                      {boardingAvailability.rooms.map((room) => {
                        const cfg = getRoomConfig(room);
                        const isSelected = String(selectedRoom?.id) === String(room.id);
                        return (
                          <button
                            key={room.id}
                            type="button"
                            className={`room-card ${!room.available ? 'unavailable' : ''} ${isSelected ? 'selected' : ''}`}
                            onClick={() => room.available && handleRoomSelect(room)}
                            disabled={!room.available}
                            aria-pressed={isSelected}
                          >
                            <div className="room-card-img-wrap">
                              {cfg.img
                                ? <img src={cfg.img} alt={cfg.label} className="room-card-img" />
                                : <div className="room-card-img-placeholder"><FontAwesomeIcon icon={faBed} /></div>
                              }
                              <span className="room-card-badge" style={{ "--room-accent": cfg.badge }}>{cfg.label}</span>
                              {!room.available && <div className="room-card-unavailable-overlay">Unavailable</div>}
                            </div>
                            <div className="room-card-body">
                              <div className="room-header">
                                <span className="room-name">{room.room_name}</span>
                                <span className="room-type">{room.room_type?.replace(/_/g, ' ')}</span>
                              </div>
                              {String(selectedRoom?.id) === String(room.id) && (
                                <span className="room-selected-label">Selected for this booking</span>
                              )}
                              <div className="room-details">
                                {room.capacity || room.max_capacity ? (
                                  <span className="room-capacity">👥 Capacity: {room.capacity ?? room.max_capacity}</span>
                                ) : null}
                                {room.available_rooms != null && (
                                  <span className={`room-slots ${room.available_rooms <= 1 ? 'low' : ''}`}>
                                    {room.available_rooms} slot{room.available_rooms !== 1 ? 's' : ''} left
                                  </span>
                                )}
                              </div>
                              <div className="room-card-foot">
                                <span className="room-rate">₱{Number(room.daily_rate).toLocaleString('en-PH')}<small>/day</small></span>
                                <span className={`room-status ${room.available ? 'avail' : 'unavail'} ${isSelected ? 'sel' : ''}`}>
                                  {isSelected
                                    ? <><FontAwesomeIcon icon={faCheckCircle} /> Selected</>
                                    : room.available ? 'Available' : room.reason || 'Not Available'}
                                </span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
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
                      <span>Duration:</span>
                      <span>Same-day stay</span>
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

              <div className="form-group">
                <label>Notes</label>
                <textarea name="notes" value={bookingForm.notes} onChange={handleChange} rows={3} placeholder="Any additional notes..." />
              </div>

              <div className="form-group">
                <label>Vaccination Card <span className="required">*</span></label>
                <small className="vaccination-required-note">Reception must verify this card before approving your booking.</small>
                <input
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  required
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setVaccinationCard(file);
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => setVaccinationPreview(reader.result);
                      reader.readAsDataURL(file);
                    } else {
                      setVaccinationPreview(null);
                    }
                  }}
                />
                {vaccinationPreview && vaccinationCard?.type?.startsWith("image/") && (
                  <div className="vaccination-preview">
                    <img src={vaccinationPreview} alt="Vaccination card preview" />
                  </div>
                )}
                {vaccinationCard && !vaccinationCard.type?.startsWith("image/") && (
                  <div className="vaccination-preview-file">{vaccinationCard.name}</div>
                )}
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
          <CustomerBookingsBoard key={boardKey} serviceFilter="hotel" embedded renderExtra={renderHotelExtras} />
        </div>
      )}

      <PaymentUploadModal
        open={uploadModal.open}
        onClose={() => setUploadModal({ open: false, endpoint: "", title: "", referenceNumber: "", paymentStatus: "", rejectionReason: "", paymentMethod: "gcash" })}
        onSuccess={() => setBoardKey((key) => key + 1)}
        endpoint={uploadModal.endpoint}
        title={uploadModal.title}
        referenceNumber={uploadModal.referenceNumber}
        paymentStatus={uploadModal.paymentStatus}
        rejectionReason={uploadModal.rejectionReason}
        paymentMethod={uploadModal.paymentMethod}
        amount={uploadModal.amount}
        awaitingBookingApproval={uploadModal.awaitingBookingApproval}
      />

      <BookingReviewModal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        onConfirm={confirmBooking}
        loading={loading}
        badge="Pet Hotel"
        pet={selectedPet ? {
          name: selectedPet.name,
          species: selectedPet.species || selectedPet.type,
          breed: selectedPet.breed,
          age: petDisplayInfo?.age,
        } : null}
        details={[
          { label: "Check-in", value: bookingForm.check_in_date && new Date(`${bookingForm.check_in_date}T00:00:00`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) },
          { label: "Stay length", value: `${pricing.days} day${pricing.days !== 1 ? "s" : ""}` },
          { label: "Room", value: selectedRoom?.room_name },
          { label: "Room type", value: selectedRoom?.room_type?.replace(/_/g, " ") },
          selectedRoom?.capacity || selectedRoom?.max_capacity
            ? { label: "Capacity", value: `${selectedRoom.capacity ?? selectedRoom.max_capacity} pet${(selectedRoom.capacity ?? selectedRoom.max_capacity) !== 1 ? "s" : ""}` }
            : null,
          bookingForm.boarding_type ? { label: "Boarding type", value: bookingForm.boarding_type.replace(/_/g, " ") } : null,
        ].filter(Boolean)}
        pricing={selectedRoom ? {
          rows: [
            { label: `${selectedRoom.room_name || "Room"} — ₱${Number(selectedRoom.daily_rate).toLocaleString("en-PH")}/day × ${pricing.days}`, value: `₱${Number(pricing.roomSubtotal).toLocaleString("en-PH", { minimumFractionDigits: 2 })}` },
          ],
          total: `₱${Number(pricing.total).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`,
        } : null}
        allowPayNow
        notes={bookingForm.notes}
        attachment={vaccinationCard ? {
          name: vaccinationCard.name,
          previewUrl: vaccinationPreview,
          isImage: vaccinationCard.type?.startsWith("image/"),
        } : null}
      />
    </div>
  );
};

export default HotelForm;
