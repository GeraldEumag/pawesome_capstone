import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTimes, faHotel, faScissors, faStethoscope, faCalendarAlt, faClock, faPaw, faPaperPlane, faPlusCircle, faTimesCircle, faUser, faEnvelope, faBed, faHeartbeat } from "@fortawesome/free-solid-svg-icons";
import "./ServiceBookingModal.css";
import DatePickerInput from "../shared/DatePickerInput";
import { apiRequest } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { saveDraft } from "../../utils/preBookingDraft";
import { showSuccess, showError, showAlert } from "../../utils/alert.jsx";

const SERVICE_CONFIG = {
  hotel: { title: "Book Pet Hotel", icon: faHotel, accent: "hotel-accent" },
  grooming: { title: "Book Grooming", icon: faScissors, accent: "grooming-accent" },
  vet: { title: "Book Vet Visit", icon: faStethoscope, accent: "vet-accent" },
};

const ROOM_TYPES = [{ value: "", label: "Select room type" }, { value: "standard", label: "Standard Room" }, { value: "deluxe", label: "Deluxe Room" }, { value: "suite", label: "Suite" }, { value: "kennel", label: "Kennel" }, { value: "cattery", label: "Cattery" }];
const GROOMING_TYPES = [{ value: "", label: "Select grooming service" }, { value: "full_grooming", label: "Full Grooming" }, { value: "bath_and_brush", label: "Bath and Brush" }, { value: "nail_trim", label: "Nail Trim" }, { value: "ear_cleaning", label: "Ear Cleaning" }, { value: "teeth_cleaning", label: "Teeth Cleaning" }, { value: "spa_treatment", label: "Spa Treatment" }];
const VET_TYPES = [{ value: "", label: "Select veterinary service" }, { value: "consultation", label: "General Consultation" }, { value: "vaccination", label: "Vaccination" }, { value: "checkup", label: "Routine Checkup" }, { value: "dental", label: "Dental Care" }, { value: "surgery", label: "Surgery" }, { value: "emergency", label: "Emergency Care" }, { value: "diagnostics", label: "Diagnostics / Lab Tests" }];
const ENERGY_LEVELS = [{ value: "", label: "Select energy level" }, { value: "normal", label: "Normal" }, { value: "lethargic", label: "Lethargic" }, { value: "hyperactive", label: "Hyperactive" }, { value: "fluctuating", label: "Fluctuating" }];
const APPETITE_OPTIONS = [{ value: "", label: "Select appetite condition" }, { value: "normal", label: "Normal" }, { value: "increased", label: "Increased" }, { value: "decreased", label: "Decreased" }, { value: "none", label: "Not eating at all" }];
const URGENCY_LEVELS = [{ value: "", label: "Select urgency" }, { value: "low", label: "Low — Routine checkup" }, { value: "medium", label: "Medium — Should be seen within a few days" }, { value: "high", label: "High — Needs attention soon" }, { value: "critical", label: "Critical — Emergency" }];

const generateTimeSlots = () => {
  const slots = [];
  const start = new Date(); start.setHours(9, 0, 0, 0);
  const end = new Date(); end.setHours(18, 0, 0, 0);
  while (start < end) {
    const value = start.toTimeString().slice(0, 5);
    const label = start.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", hour12: true });
    slots.push({ value, label });
    start.setMinutes(start.getMinutes() + 30);
  }
  return slots;
};

const timeSlots = generateTimeSlots();

const getInitialForm = (serviceType) => {
  const base = { customer_name: "", customer_email: "", pet_name: "", pet_type: "" };
  if (serviceType === "hotel") return { ...base, check_in_date: "", check_out_date: "", preferred_time: "", room_type: "", special_care_instructions: "" };
  if (serviceType === "grooming") return { ...base, grooming_service_type: "", preferred_date: "", preferred_time: "", special_grooming_instructions: "" };
  return { ...base, veterinary_service_type: "", preferred_date: "", preferred_time: "", main_reason_for_visit: "", flu_symptoms: "", observed_issues: "", appetite_condition: "", energy_level: "", symptom_duration: "", medications_taken: "", recent_exposure: "", urgency_level: "" };
};

const ServiceBookingModal = ({ serviceType, onClose }) => {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const config = SERVICE_CONFIG[serviceType];
  const [formData, setFormData] = useState(() => getInitialForm(serviceType));
  const [loading, setLoading] = useState(false);
  const [showHealthInfo, setShowHealthInfo] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (isAuthenticated && user?.name) {
      setFormData((prev) => ({ ...prev, customer_name: user.name || "", customer_email: user.email || "" }));
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleEsc);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", handleEsc); document.body.style.overflow = ""; };
  }, [onClose]);

  const handleChange = (e) => { const { name, value } = e.target; setFormData((prev) => ({ ...prev, [name]: value })); setErrors((prev) => ({ ...prev, [name]: "" })); };
  const handleDateChange = (name, date) => { setFormData((prev) => ({ ...prev, [name]: date ? date.toISOString().split("T")[0] : "" })); setErrors((prev) => ({ ...prev, [name]: "" })); };

  const validate = () => {
    const ne = {};
    if (!formData.customer_name.trim()) ne.customer_name = "Customer name is required.";
    if (!formData.customer_email.trim()) { ne.customer_email = "Email is required."; } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.customer_email)) { ne.customer_email = "Enter a valid email address."; }
    if (!formData.pet_name.trim()) ne.pet_name = "Pet name is required.";
    if (!formData.pet_type.trim()) ne.pet_type = "Pet type is required.";
    if (serviceType === "hotel") {
      if (!formData.check_in_date) ne.check_in_date = "Check-in date is required.";
      if (!formData.check_out_date) ne.check_out_date = "Check-out date is required.";
      if (formData.check_in_date && formData.check_out_date) { const inDate = new Date(formData.check_in_date); const outDate = new Date(formData.check_out_date); if (outDate <= inDate) ne.check_out_date = "Check-out must be after check-in."; }
      if (!formData.preferred_time) ne.preferred_time = "Preferred time is required.";
    }
    if (serviceType === "grooming") { if (!formData.grooming_service_type) ne.grooming_service_type = "Grooming service type is required."; if (!formData.preferred_date) ne.preferred_date = "Preferred date is required."; if (!formData.preferred_time) ne.preferred_time = "Preferred time is required."; }
    if (serviceType === "vet") { if (!formData.veterinary_service_type) ne.veterinary_service_type = "Veterinary service type is required."; if (!formData.preferred_date) ne.preferred_date = "Preferred date is required."; if (!formData.preferred_time) ne.preferred_time = "Preferred time is required."; if (!formData.main_reason_for_visit.trim()) ne.main_reason_for_visit = "Reason for visit is required."; }
    setErrors(ne);
    return Object.keys(ne).length === 0;
  };

  const buildPayload = useCallback(() => {
    const base = { customer_name: formData.customer_name.trim(), customer_email: formData.customer_email.trim(), pet_name: formData.pet_name.trim(), pet_type: formData.pet_type.trim() };
    if (serviceType === "hotel") return { ...base, request_type: "hotel", service_name: "Pet Hotel", requested_date: formData.check_in_date, requested_time: formData.preferred_time, check_in_date: formData.check_in_date, check_out_date: formData.check_out_date, room_type: formData.room_type, notes: formData.special_care_instructions || "", special_request: formData.special_care_instructions || "" };
    if (serviceType === "grooming") return { ...base, request_type: "grooming", service_name: formData.grooming_service_type, requested_date: formData.preferred_date, requested_time: formData.preferred_time, notes: formData.special_grooming_instructions || "", special_request: formData.special_grooming_instructions || "" };
    const healthParts = [];
    if (formData.flu_symptoms) healthParts.push(`Flu-like symptoms: ${formData.flu_symptoms}`);
    if (formData.observed_issues) healthParts.push(`Observed issues: ${formData.observed_issues}`);
    if (formData.appetite_condition) healthParts.push(`Appetite: ${formData.appetite_condition}`);
    if (formData.energy_level) healthParts.push(`Energy: ${formData.energy_level}`);
    if (formData.symptom_duration) healthParts.push(`Duration: ${formData.symptom_duration}`);
    if (formData.medications_taken) healthParts.push(`Medications: ${formData.medications_taken}`);
    if (formData.recent_exposure) healthParts.push(`Recent exposure: ${formData.recent_exposure}`);
    if (formData.urgency_level) healthParts.push(`Urgency: ${formData.urgency_level}`);
    const notes = [formData.main_reason_for_visit || ""];
    if (healthParts.length > 0) { notes.push("Additional health information:"); notes.push(...healthParts); }
    return { ...base, request_type: "vet", service_name: formData.veterinary_service_type, requested_date: formData.preferred_date, requested_time: formData.preferred_time, notes: notes.filter(Boolean).join("\n"), special_request: notes.filter(Boolean).join("\n") };
  }, [formData, serviceType]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    saveDraft(serviceType, formData);

    if (serviceType === "hotel") {
      if (!isAuthenticated) {
        showAlert("Please create an account first so we can process your booking request.");
      }
      navigate("/customer/hotel");
      return;
    }

    if (!isAuthenticated) { showAlert("Please create an account first so we can process your booking request."); navigate("/register"); return; }

    const payload = buildPayload();
    try {
      setLoading(true);
      const data = await apiRequest("/customer/requests", { method: "POST", body: JSON.stringify(payload) });
      if (data.success) { showSuccess("Booking request submitted successfully. Please wait for receptionist approval."); onClose(); } else { showAlert(data.message || "Failed to submit request."); }
    } catch (error) {
      const message = error.response?.data?.message || error.response?.data?.error || error.message || "Server error while submitting booking request.";
      showError(message);
    } finally { setLoading(false); }
  };

  const fe = (name) => errors[name] ? <span className="modal-field-error">{errors[name]}</span> : null;

  const renderCommonFields = () => (
    <>
      <div className="modal-form-row">
        <label className="modal-form-group">
          <span><FontAwesomeIcon icon={faUser} /> Customer Name *</span>
          <input type="text" name="customer_name" value={formData.customer_name} onChange={handleChange} placeholder="Your full name" readOnly={isAuthenticated} className={errors.customer_name ? "has-error" : ""} />
          {fe("customer_name")}
        </label>
        <label className="modal-form-group">
          <span><FontAwesomeIcon icon={faEnvelope} /> Email *</span>
          <input type="email" name="customer_email" value={formData.customer_email} onChange={handleChange} placeholder="you@example.com" readOnly={isAuthenticated} className={errors.customer_email ? "has-error" : ""} />
          {fe("customer_email")}
        </label>
      </div>
      <div className="modal-form-row">
        <label className="modal-form-group">
          <span><FontAwesomeIcon icon={faPaw} /> Pet Name *</span>
          <input type="text" name="pet_name" value={formData.pet_name} onChange={handleChange} placeholder="e.g., Buddy" className={errors.pet_name ? "has-error" : ""} />
          {fe("pet_name")}
        </label>
        <label className="modal-form-group">
          <span><FontAwesomeIcon icon={faPaw} /> Pet Type / Species *</span>
          <input type="text" name="pet_type" value={formData.pet_type} onChange={handleChange} placeholder="e.g., Dog, Cat, Rabbit" className={errors.pet_type ? "has-error" : ""} />
          {fe("pet_type")}
        </label>
      </div>
    </>
  );

  const renderHotelFields = () => (
    <>
      <div className="modal-form-row">
        <label className="modal-form-group">
          <span><FontAwesomeIcon icon={faCalendarAlt} /> Check-in Date *</span>
          <DatePickerInput selected={formData.check_in_date ? new Date(formData.check_in_date) : null} onChange={(date) => handleDateChange("check_in_date", date)} placeholderText="Pick check-in..." minDate={new Date()} required className={errors.check_in_date ? "has-error" : ""} />
          {fe("check_in_date")}
        </label>
        <label className="modal-form-group">
          <span><FontAwesomeIcon icon={faCalendarAlt} /> Check-out Date *</span>
          <DatePickerInput selected={formData.check_out_date ? new Date(formData.check_out_date) : null} onChange={(date) => handleDateChange("check_out_date", date)} placeholderText="Pick check-out..." minDate={formData.check_in_date ? new Date(formData.check_in_date) : new Date()} required className={errors.check_out_date ? "has-error" : ""} />
          {fe("check_out_date")}
        </label>
      </div>
      <div className="modal-form-row">
        <label className="modal-form-group">
          <span><FontAwesomeIcon icon={faClock} /> Preferred Time *</span>
          <select name="preferred_time" value={formData.preferred_time} onChange={handleChange} className={errors.preferred_time ? "has-error" : ""}>
            <option value="">Select time</option>
            {timeSlots.map((slot) => <option key={slot.value} value={slot.value}>{slot.label}</option>)}
          </select>
          {fe("preferred_time")}
        </label>
        <label className="modal-form-group">
          <span><FontAwesomeIcon icon={faBed} /> Room Type</span>
          <select name="room_type" value={formData.room_type} onChange={handleChange}>{ROOM_TYPES.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select>
        </label>
      </div>
      <label className="modal-form-group full">
        <span>Special Care Instructions</span>
        <textarea name="special_care_instructions" value={formData.special_care_instructions} onChange={handleChange} rows={3} placeholder="Dietary needs, medication, behavior notes..." />
      </label>
    </>
  );

  const renderGroomingFields = () => (
    <>
      <div className="modal-form-row">
        <label className="modal-form-group">
          <span><FontAwesomeIcon icon={faScissors} /> Grooming Service Type *</span>
          <select name="grooming_service_type" value={formData.grooming_service_type} onChange={handleChange} className={errors.grooming_service_type ? "has-error" : ""}>
            {GROOMING_TYPES.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
          {fe("grooming_service_type")}
        </label>
        <label className="modal-form-group">
          <span><FontAwesomeIcon icon={faCalendarAlt} /> Preferred Date *</span>
          <DatePickerInput selected={formData.preferred_date ? new Date(formData.preferred_date) : null} onChange={(date) => handleDateChange("preferred_date", date)} placeholderText="Pick a date..." minDate={new Date()} required className={errors.preferred_date ? "has-error" : ""} />
          {fe("preferred_date")}
        </label>
      </div>
      <div className="modal-form-row">
        <label className="modal-form-group">
          <span><FontAwesomeIcon icon={faClock} /> Preferred Time *</span>
          <select name="preferred_time" value={formData.preferred_time} onChange={handleChange} className={errors.preferred_time ? "has-error" : ""}>
            <option value="">Select time</option>
            {timeSlots.map((slot) => <option key={slot.value} value={slot.value}>{slot.label}</option>)}
          </select>
          {fe("preferred_time")}
        </label>
      </div>
      <label className="modal-form-group full">
        <span>Special Grooming Instructions</span>
        <textarea name="special_grooming_instructions" value={formData.special_grooming_instructions} onChange={handleChange} rows={3} placeholder="Sensitive skin, preferred products, style requests..." />
      </label>
    </>
  );

  const renderVetFields = () => (
    <>
      <div className="modal-form-row">
        <label className="modal-form-group">
          <span><FontAwesomeIcon icon={faStethoscope} /> Veterinary Service Type *</span>
          <select name="veterinary_service_type" value={formData.veterinary_service_type} onChange={handleChange} className={errors.veterinary_service_type ? "has-error" : ""}>
            {VET_TYPES.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
          {fe("veterinary_service_type")}
        </label>
        <label className="modal-form-group">
          <span><FontAwesomeIcon icon={faCalendarAlt} /> Preferred Date *</span>
          <DatePickerInput selected={formData.preferred_date ? new Date(formData.preferred_date) : null} onChange={(date) => handleDateChange("preferred_date", date)} placeholderText="Pick a date..." minDate={new Date()} required className={errors.preferred_date ? "has-error" : ""} />
          {fe("preferred_date")}
        </label>
      </div>
      <div className="modal-form-row">
        <label className="modal-form-group">
          <span><FontAwesomeIcon icon={faClock} /> Preferred Time *</span>
          <select name="preferred_time" value={formData.preferred_time} onChange={handleChange} className={errors.preferred_time ? "has-error" : ""}>
            <option value="">Select time</option>
            {timeSlots.map((slot) => <option key={slot.value} value={slot.value}>{slot.label}</option>)}
          </select>
          {fe("preferred_time")}
        </label>
      </div>
      <label className="modal-form-group full">
        <span>Main Reason for Visit *</span>
        <textarea name="main_reason_for_visit" value={formData.main_reason_for_visit} onChange={handleChange} rows={3} placeholder="Describe symptoms, concerns, or the reason for the visit..." className={errors.main_reason_for_visit ? "has-error" : ""} />
        {fe("main_reason_for_visit")}
      </label>
      {!showHealthInfo && (
        <button type="button" className="modal-add-health-btn" onClick={() => setShowHealthInfo(true)}>
          <FontAwesomeIcon icon={faPlusCircle} /> Add Additional Health Information
        </button>
      )}
      {showHealthInfo && (
        <div className="modal-health-section">
          <div className="modal-health-header">
            <h4><FontAwesomeIcon icon={faHeartbeat} /> Additional Health Information</h4>
            <button type="button" className="modal-health-cancel" onClick={() => { setShowHealthInfo(false); setFormData((prev) => ({ ...prev, flu_symptoms: "", observed_issues: "", appetite_condition: "", energy_level: "", symptom_duration: "", medications_taken: "", recent_exposure: "", urgency_level: "" })); }}>
              <FontAwesomeIcon icon={faTimesCircle} /> Cancel
            </button>
          </div>
          <div className="modal-form-row">
            <label className="modal-form-group"><span>Flu-like Symptoms</span><input type="text" name="flu_symptoms" value={formData.flu_symptoms} onChange={handleChange} placeholder="e.g., sneezing, coughing..." /></label>
            <label className="modal-form-group"><span>Symptoms or Observed Issues</span><input type="text" name="observed_issues" value={formData.observed_issues} onChange={handleChange} placeholder="e.g., limping, scratching..." /></label>
          </div>
          <div className="modal-form-row">
            <label className="modal-form-group"><span>Appetite Condition</span><select name="appetite_condition" value={formData.appetite_condition} onChange={handleChange}>{APPETITE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></label>
            <label className="modal-form-group"><span>Energy Level</span><select name="energy_level" value={formData.energy_level} onChange={handleChange}>{ENERGY_LEVELS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></label>
          </div>
          <div className="modal-form-row">
            <label className="modal-form-group"><span>Symptom Duration</span><input type="text" name="symptom_duration" value={formData.symptom_duration} onChange={handleChange} placeholder="e.g., 2 days, 1 week..." /></label>
            <label className="modal-form-group"><span>Medication or Vitamins Taken</span><input type="text" name="medications_taken" value={formData.medications_taken} onChange={handleChange} placeholder="List any current medications..." /></label>
          </div>
          <div className="modal-form-row">
            <label className="modal-form-group"><span>Recent Exposure or Possible Cause</span><input type="text" name="recent_exposure" value={formData.recent_exposure} onChange={handleChange} placeholder="e.g., new food, other sick pet..." /></label>
            <label className="modal-form-group"><span>Urgency Level</span><select name="urgency_level" value={formData.urgency_level} onChange={handleChange}>{URGENCY_LEVELS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></label>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="service-modal-backdrop" onClick={onClose}>
      <div className={`service-modal-card ${config.accent}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="service-modal-title">
        <button className="service-modal-close" onClick={onClose} aria-label="Close"><FontAwesomeIcon icon={faTimes} /></button>
        <div className="service-modal-header">
          <div className="service-modal-icon"><FontAwesomeIcon icon={config.icon} /></div>
          <h2 id="service-modal-title">{config.title}</h2>
          <p>Fill in the details and we will handle the rest.</p>
        </div>
        <form className="service-modal-form" onSubmit={handleSubmit} noValidate>
          {renderCommonFields()}
          {serviceType === "hotel" && renderHotelFields()}
          {serviceType === "grooming" && renderGroomingFields()}
          {serviceType === "vet" && renderVetFields()}
          {!isAuthenticated && (
            <div className="modal-auth-notice">
              <p>A free customer account is required to process your booking. After submitting, you will be guided to create an account.</p>
            </div>
          )}
          <button type="submit" className="modal-submit-btn" disabled={loading}>
            <FontAwesomeIcon icon={faPaperPlane} /> {loading ? "Submitting..." : "Submit Booking Request"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ServiceBookingModal;
