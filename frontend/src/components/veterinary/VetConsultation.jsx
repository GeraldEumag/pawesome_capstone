import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faCircleCheck,
  faFileMedical,
  faNotesMedical,
  faPaw,
  faPlay,
  faSave,
  faSpinner,
  faStethoscope,
  faUser,
  faHospital,
  faWeightScale,
  faThermometer,
  faHeartPulse,
  faLungs,
  faStar,
  faMoneyBillWave,
  faBriefcaseMedical,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import toast from "react-hot-toast";
import { apiRequest } from "../../api/client";
import PetAvatar from "../shared/PetAvatar";
import ServiceBillingPanel from "../shared/ServiceBillingPanel";
import "./theme.css";
import "./VetConsultation.css";

const emptyForm = {
  chief_complaint: "",
  symptoms: "",
  physical_examination: "",
  diagnosis: "",
  treatment_plan: "",
  weight_kg: "",
  temperature_celsius: "",
  heart_rate: "",
  respiratory_rate: "",
  body_condition_score: "",
  notes: "",
};

const VetConsultation = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [appointment, setAppointment] = useState(null);
  const [record, setRecord] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [billingSummary, setBillingSummary] = useState({
    total_bill: 0,
    total_paid: 0,
    balance_due: 0,
    payment_status: appointment?.payment_status || "unpaid",
  });
  const [completionStatus, setCompletionStatus] = useState({
    can_complete: true,
    balance_due: 0,
    message: "",
  });
  const [confinementForm, setConfinementForm] = useState({
    reason_for_confinement: "",
    urgency_level: "normal",
    expected_stay_days: "",
    medication_plan: "",
    observation_instructions: "",
    special_care_instructions: "",
    estimated_cost: "",
  });

  const appointmentStatus = appointment?.status || "";
  const isStarted = ["in_progress", "in_consultation", "treated"].includes(appointmentStatus);
  const isFinalized = record?.status === "finalized" || record?.status === "locked";

  const serviceLabel = useMemo(() => {
    const service = appointment?.service;
    return service?.name || appointment?.service_name || "Veterinary consultation";
  }, [appointment]);

  const fillFormFromRecord = useCallback((medicalRecord) => {
    if (!medicalRecord) {
      setForm(emptyForm);
      return;
    }

    setForm({
      chief_complaint: medicalRecord.chief_complaint || "",
      symptoms: medicalRecord.symptoms || "",
      physical_examination: medicalRecord.physical_examination || "",
      diagnosis: medicalRecord.diagnosis || "",
      treatment_plan: medicalRecord.treatment_plan || "",
      weight_kg: medicalRecord.weight_kg || "",
      temperature_celsius: medicalRecord.temperature_celsius || "",
      heart_rate: medicalRecord.heart_rate || "",
      respiratory_rate: medicalRecord.respiratory_rate || "",
      body_condition_score: medicalRecord.body_condition_score || "",
      notes: medicalRecord.notes || "",
    });
  }, []);

  const loadConsultation = useCallback(async () => {
    try {
      setLoading(true);
      const appointmentResponse = await apiRequest(`/veterinary/appointments/${id}`);
      const nextAppointment = appointmentResponse?.appointment || appointmentResponse;
      setAppointment(nextAppointment);

      if (nextAppointment?.pet_id) {
        const recordsResponse = await apiRequest(`/veterinary/pets/${nextAppointment.pet_id}/medical-records`);
        const records = Array.isArray(recordsResponse?.records) ? recordsResponse.records : [];
        const existing = records.find((item) => Number(item.appointment_id) === Number(id));
        setRecord(existing || null);
        fillFormFromRecord(existing || null);
      }
    } catch (err) {
      toast.error(err.message || "Failed to load consultation.");
    } finally {
      setLoading(false);
    }
  }, [fillFormFromRecord, id]);

  useEffect(() => {
    loadConsultation();
  }, [loadConsultation]);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleBillingUpdate = useCallback((billing, completion) => {
    setBillingSummary(billing || {
      total_bill: 0,
      total_paid: 0,
      balance_due: 0,
      payment_status: appointment?.payment_status || "unpaid",
    });
    setCompletionStatus(completion || {
      can_complete: true,
      balance_due: 0,
      message: "",
    });
  }, [appointment?.payment_status]);

  const buildPayload = (status = "draft") => ({
    ...form,
    pet_id: appointment?.pet_id,
    appointment_id: appointment?.id,
    visit_date: new Date().toISOString(),
    status,
  });

  const startAppointment = async () => {
    try {
      setSaving(true);
      const response = await apiRequest(`/veterinary/consultations/${id}/start`, {
        method: "POST",
        body: JSON.stringify({ notes: "Consultation started by veterinarian" }),
      });

      toast.success("Consultation started.");
      setAppointment(response?.appointment || appointment);
      if (response?.medical_record) {
        setRecord(response.medical_record);
        fillFormFromRecord(response.medical_record);
      } else {
        await loadConsultation();
      }
    } catch (err) {
      toast.error(err.message || "Failed to start consultation.");
    } finally {
      setSaving(false);
    }
  };

  const saveRecord = async (status = "draft") => {
    if (!isStarted) {
      toast.error("Start the appointment before writing consultation notes.");
      return null;
    }

    try {
      setSaving(true);
      const payload = buildPayload(status);
      const response = record?.id
        ? await apiRequest(`/veterinary/medical-records/${record.id}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          })
        : await apiRequest("/veterinary/medical-records", {
            method: "POST",
            body: JSON.stringify(payload),
          });

      const nextRecord = response?.record || response;
      setRecord(nextRecord);
      fillFormFromRecord(nextRecord);
      toast.success(status === "finalized" ? "Consultation finalized." : "Consultation draft saved.");
      return nextRecord;
    } catch (err) {
      toast.error(err.message || "Failed to save consultation.");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const finalizeAndComplete = async () => {
    const finalized = await saveRecord("finalized");
    if (!finalized) return;

    try {
      setSaving(true);
      await apiRequest(`/veterinary/consultations/${id}/complete`, {
        method: "POST",
        body: JSON.stringify({
          diagnosis: form.diagnosis,
          treatment_notes: form.treatment_plan,
          prescription: "",
          vet_remarks: form.notes,
        }),
      });
      toast.success("Consultation finalized. Awaiting payment at cashier.");
      await loadConsultation();
    } catch (err) {
      toast.error(err.message || "Failed to finalize consultation.");
    } finally {
      setSaving(false);
    }
  };

  const recommendConfinement = async () => {
    if (!isStarted) {
      toast.error("Start the consultation before recommending confinement.");
      return;
    }

    if (!form.diagnosis.trim() || !confinementForm.reason_for_confinement.trim()) {
      toast.error("Diagnosis and confinement reason are required.");
      return;
    }

    try {
      setSaving(true);
      await apiRequest(`/veterinary/consultations/${id}/recommend-confinement`, {
        method: "POST",
        body: JSON.stringify({
          diagnosis: form.diagnosis,
          reason_for_confinement: confinementForm.reason_for_confinement,
          urgency_level: confinementForm.urgency_level,
          expected_stay_days: confinementForm.expected_stay_days || undefined,
          treatment_plan: form.treatment_plan || form.procedure_notes,
          medication_plan: confinementForm.medication_plan,
          observation_instructions: confinementForm.observation_instructions,
          special_care_instructions: confinementForm.special_care_instructions,
          estimated_cost: confinementForm.estimated_cost || undefined,
        }),
      });
      toast.success("Medical confinement recommended. Receptionist can now admit and assign a room.");
      await loadConsultation();
    } catch (err) {
      toast.error(err.message || "Failed to recommend confinement.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="vet-consultation">
        <div className="consult-loading">
          <FontAwesomeIcon icon={faSpinner} spin />
          <span>Loading consultation...</span>
        </div>
      </section>
    );
  }

  if (!appointment) {
    return (
      <section className="vet-consultation">
        <div className="consult-empty">Appointment not found.</div>
      </section>
    );
  }

  const vitalFields = [
    { icon: faWeightScale, label: "Weight", field: "weight_kg", unit: "kg" },
    { icon: faThermometer, label: "Temperature", field: "temperature_celsius", unit: "°C" },
    { icon: faHeartPulse, label: "Heart Rate", field: "heart_rate", unit: "bpm" },
    { icon: faLungs, label: "Resp. Rate", field: "respiratory_rate", unit: "/min" },
    { icon: faStar, label: "Body Score", field: "body_condition_score", unit: "/9" },
  ];

  const paymentItems = [
    { label: "Base Amount", value: `PHP ${Number((billingSummary.total_bill || 0) - (billingSummary.additional_charges || 0)).toFixed(2)}` },
    { label: "Additional Charges", value: `PHP ${Number(billingSummary.additional_charges || 0).toFixed(2)}` },
    { label: "Amount Paid", value: `PHP ${Number(billingSummary.total_paid || 0).toFixed(2)}` },
    { label: "Balance Due", value: `PHP ${Number(billingSummary.balance_due || 0).toFixed(2)}`, highlight: true },
    { label: "Payment Status", value: String(appointment?.payment_status || billingSummary.payment_status || "unpaid").replace(/_/g, " ") },
  ];

  return (
    <section className="vet-consultation">

      {/* ── Header ─────────────────────────────────── */}
      <div className="consult-header">
        <button type="button" className="consult-back" onClick={() => navigate("/veterinary/appointments")}>
          <FontAwesomeIcon icon={faArrowLeft} />
          Back to Appointments
        </button>
        <div className="consult-header-copy">
          <span className="consult-eyebrow">
            <FontAwesomeIcon icon={faFileMedical} />
            Consultation
          </span>
          <h2>{appointment.pet?.name || "Patient"}</h2>
          <p>{serviceLabel}</p>
        </div>
      </div>

      {/* ── Patient Summary ─────────────────────────── */}
      <div className="consult-section-card">
        <div className="consult-section-header">
          <div className="consult-section-icon"><FontAwesomeIcon icon={faPaw} /></div>
          <div className="consult-section-title-group">
            <h3>Patient Summary</h3>
            <p>Appointment details and current status</p>
          </div>
          <span className={`consult-apt-badge consult-apt-badge--${appointmentStatus.replace(/_/g, "-")}`}>
            {appointmentStatus.replace(/_/g, " ")}
          </span>
        </div>
        <div className="consult-summary">
          <article>
            <PetAvatar pet={appointment.pet} size={40} />
            <span>Pet</span>
            <strong>{appointment.pet?.name || "Unknown"}</strong>
            <small>{appointment.pet?.species || "Pet"}{appointment.pet?.breed ? ` · ${appointment.pet.breed}` : ""}</small>
          </article>
          <article>
            <FontAwesomeIcon icon={faUser} />
            <span>Owner</span>
            <strong>{appointment.customer?.name || "Unknown owner"}</strong>
            <small>{appointment.customer?.phone || appointment.customer?.email || "No contact"}</small>
          </article>
          <article>
            <FontAwesomeIcon icon={faStethoscope} />
            <span>Service</span>
            <strong>{serviceLabel}</strong>
            <small>{appointment.service?.category || "Veterinary service"}</small>
          </article>
          <article>
            <FontAwesomeIcon icon={faNotesMedical} />
            <span>Record</span>
            <strong>{record ? record.status.replace(/_/g, " ") : "No record yet"}</strong>
            <small>{record ? `ID #${record.id}` : "Start consultation to create"}</small>
          </article>
          <article>
            <FontAwesomeIcon icon={faCircleCheck} />
            <span>Payment</span>
            <strong>{String(appointment?.payment_status || billingSummary.payment_status || "unpaid").replace(/_/g, " ")}</strong>
            <small>Balance: PHP {Number(billingSummary.balance_due || 0).toFixed(2)}</small>
          </article>
        </div>
      </div>

      {/* ── Status Alert Panels ─────────────────────── */}
      {!isStarted && appointmentStatus !== "awaiting_payment" && (
        <div className="consult-start-panel">
          <div className="consult-start-panel-copy">
            <div className="consult-start-icon-wrap"><FontAwesomeIcon icon={faPlay} /></div>
            <div>
              <strong>Ready to Begin</strong>
              <p>Start the consultation to open a medical record for this patient.</p>
            </div>
          </div>
          <button type="button" className="consult-start-btn" onClick={startAppointment} disabled={saving}>
            {saving ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faPlay} />}
            Start Consultation
          </button>
        </div>
      )}
      {appointmentStatus === "awaiting_payment" && (
        <div className="consult-start-panel consult-start-panel--payment">
          <div className="consult-start-panel-copy">
            <div className="consult-start-icon-wrap consult-start-icon-wrap--payment"><FontAwesomeIcon icon={faCircleCheck} /></div>
            <div>
              <strong>Consultation Finalized</strong>
              <p>This consultation has been finalized and is awaiting payment at the cashier.</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Clinical Notes ──────────────────────────── */}
      <div className="consult-section-card">
        <div className="consult-section-header">
          <div className="consult-section-icon"><FontAwesomeIcon icon={faNotesMedical} /></div>
          <div className="consult-section-title-group">
            <h3>Clinical Notes</h3>
            <p>Medical observations, diagnosis, and treatment plan</p>
          </div>
        </div>
        <div className="consult-form">
          <label className="consult-label">
            Chief Complaint
            <textarea value={form.chief_complaint} onChange={(e) => updateField("chief_complaint", e.target.value)} disabled={isFinalized} />
          </label>
          <label className="consult-label">
            Symptoms
            <textarea value={form.symptoms} onChange={(e) => updateField("symptoms", e.target.value)} disabled={isFinalized} />
          </label>
          <label className="consult-label">
            Physical Examination
            <textarea value={form.physical_examination} onChange={(e) => updateField("physical_examination", e.target.value)} disabled={isFinalized} />
          </label>
          <label className="consult-label">
            Diagnosis
            <textarea value={form.diagnosis} onChange={(e) => updateField("diagnosis", e.target.value)} disabled={isFinalized} />
          </label>
          <label className="consult-label">
            Treatment Plan
            <textarea value={form.treatment_plan} onChange={(e) => updateField("treatment_plan", e.target.value)} disabled={isFinalized} />
          </label>
          <label className="consult-label">
            General Notes
            <textarea value={form.notes} onChange={(e) => updateField("notes", e.target.value)} disabled={isFinalized} />
          </label>
        </div>
      </div>

      {/* ── Vital Signs ─────────────────────────────── */}
      <div className="consult-section-card">
        <div className="consult-section-header">
          <div className="consult-section-icon"><FontAwesomeIcon icon={faHeartPulse} /></div>
          <div className="consult-section-title-group">
            <h3>Vital Signs</h3>
            <p>Physical measurements and body condition assessment</p>
          </div>
        </div>
        <div className="consult-vitals-grid">
          {vitalFields.map(({ icon, label, field, unit }) => (
            <div key={field} className="consult-vital-field">
              <div className="consult-vital-icon-wrap">
                <FontAwesomeIcon icon={icon} />
              </div>
              <span className="consult-vital-label">{label}</span>
              <div className="consult-vital-input-wrap">
                <input
                  type="number"
                  step="0.01"
                  value={form[field]}
                  onChange={(e) => updateField(field, e.target.value)}
                  disabled={isFinalized}
                  placeholder="—"
                />
                <span className="consult-vital-unit">{unit}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Payment Summary ─────────────────────────── */}
      <div className="consult-section-card">
        <div className="consult-section-header">
          <div className="consult-section-icon"><FontAwesomeIcon icon={faMoneyBillWave} /></div>
          <div className="consult-section-title-group">
            <h3>Payment Summary</h3>
            <p>Billing overview for this consultation</p>
          </div>
        </div>
        <div className="consult-payment-grid">
          {paymentItems.map(({ label, value, highlight }) => (
            <div key={label} className={`consult-payment-item${highlight ? " consult-payment-item--highlight" : ""}`}>
              <span className="consult-payment-label">{label}</span>
              <span className="consult-payment-value">{value}</span>
            </div>
          ))}
        </div>
        {!completionStatus.can_complete && completionStatus.message && (
          <div className="consult-payment-warning">
            <FontAwesomeIcon icon={faTriangleExclamation} />
            <span>{completionStatus.message}</span>
          </div>
        )}
      </div>

      {/* ── Service Billing ─────────────────────────── */}
      <div className="consult-section-card">
        <div className="consult-section-header">
          <div className="consult-section-icon"><FontAwesomeIcon icon={faBriefcaseMedical} /></div>
          <div className="consult-section-title-group">
            <h3>Service Billing</h3>
            <p>Manage service charges and additional billing items</p>
          </div>
        </div>
        <div className="consult-billing-body">
          <ServiceBillingPanel
            serviceType="veterinary"
            serviceId={appointment.id}
            petId={appointment.pet_id}
            onBillingUpdate={handleBillingUpdate}
          />
        </div>
      </div>

      {/* ── Confinement Recommendation ──────────────── */}
      <div className="consult-section-card">
        <div className="consult-section-header">
          <div className="consult-section-icon consult-section-icon--warning"><FontAwesomeIcon icon={faHospital} /></div>
          <div className="consult-section-title-group">
            <h3>Medical Confinement Recommendation</h3>
            <p>Recommend this patient for admission and in-patient care</p>
          </div>
          {appointmentStatus === "needs_confinement" && (
            <span className="consult-apt-badge consult-apt-badge--submitted">Submitted</span>
          )}
        </div>
        <div className="consult-form">
          <label className="consult-label">
            Reason for Confinement
            <textarea value={confinementForm.reason_for_confinement} onChange={(e) => setConfinementForm((current) => ({ ...current, reason_for_confinement: e.target.value }))} disabled={appointmentStatus === "needs_confinement"} />
          </label>
          <label className="consult-label">
            Medication Plan
            <textarea value={confinementForm.medication_plan} onChange={(e) => setConfinementForm((current) => ({ ...current, medication_plan: e.target.value }))} disabled={appointmentStatus === "needs_confinement"} />
          </label>
          <label className="consult-label">
            Observation Instructions
            <textarea value={confinementForm.observation_instructions} onChange={(e) => setConfinementForm((current) => ({ ...current, observation_instructions: e.target.value }))} disabled={appointmentStatus === "needs_confinement"} />
          </label>
          <label className="consult-label">
            Special Care Instructions
            <textarea value={confinementForm.special_care_instructions} onChange={(e) => setConfinementForm((current) => ({ ...current, special_care_instructions: e.target.value }))} disabled={appointmentStatus === "needs_confinement"} />
          </label>
        </div>
        <div className="consult-vitals-grid consult-vitals-grid--3">
          <div className="consult-vital-field">
            <div className="consult-vital-icon-wrap consult-vital-icon-wrap--warning"><FontAwesomeIcon icon={faTriangleExclamation} /></div>
            <span className="consult-vital-label">Urgency Level</span>
            <div className="consult-vital-input-wrap">
              <select value={confinementForm.urgency_level} onChange={(e) => setConfinementForm((current) => ({ ...current, urgency_level: e.target.value }))} disabled={appointmentStatus === "needs_confinement"}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
          <div className="consult-vital-field">
            <div className="consult-vital-icon-wrap"><FontAwesomeIcon icon={faNotesMedical} /></div>
            <span className="consult-vital-label">Expected Days</span>
            <div className="consult-vital-input-wrap">
              <input type="number" min="1" value={confinementForm.expected_stay_days} onChange={(e) => setConfinementForm((current) => ({ ...current, expected_stay_days: e.target.value }))} disabled={appointmentStatus === "needs_confinement"} placeholder="—" />
              <span className="consult-vital-unit">days</span>
            </div>
          </div>
          <div className="consult-vital-field">
            <div className="consult-vital-icon-wrap"><FontAwesomeIcon icon={faMoneyBillWave} /></div>
            <span className="consult-vital-label">Estimated Cost</span>
            <div className="consult-vital-input-wrap">
              <span className="consult-vital-prefix">PHP</span>
              <input type="number" min="0" step="0.01" value={confinementForm.estimated_cost} onChange={(e) => setConfinementForm((current) => ({ ...current, estimated_cost: e.target.value }))} disabled={appointmentStatus === "needs_confinement"} placeholder="0.00" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Sticky Actions ──────────────────────────── */}
      <div className="consult-actions">
        <button type="button" className="consult-btn consult-btn--secondary" onClick={() => saveRecord("draft")} disabled={!isStarted || saving || isFinalized}>
          {saving ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faSave} />}
          Save Draft
        </button>
        <button type="button" className="consult-btn consult-btn--secondary" onClick={recommendConfinement} disabled={!isStarted || saving || appointmentStatus === "needs_confinement"}>
          <FontAwesomeIcon icon={faHospital} />
          Needs Confinement
        </button>
        <button type="button" className="consult-btn consult-btn--primary" onClick={finalizeAndComplete} disabled={!isStarted || saving}>
          {saving ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faCircleCheck} />}
          Finalize &amp; Send to Billing
        </button>
      </div>
    </section>
  );
};

export default VetConsultation;
