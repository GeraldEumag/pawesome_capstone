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
  faTriangleExclamation,
  faPills,
  faPlus,
  faTrash,
  faFileInvoiceDollar,
  faCalendarAlt,
} from "@fortawesome/free-solid-svg-icons";
import toast from "react-hot-toast";
import { apiRequest } from "../../api/client";
import { addMedicalRecordAddendum } from "../../api/medicalRecords";
import { VET_STARTED_STATUSES } from "./vetStatus";
import VetEstimatePanel from "./VetEstimatePanel";
import VetDiagnosticsPanel from "./VetDiagnosticsPanel";
import VetConsentPanel from "./VetConsentPanel";
import VetDispensePanel from "./VetDispensePanel";
import PetAvatar from "../shared/PetAvatar";
import RowActionPopover from "../shared/RowActionPopover"
import "./theme.css";
import "./VetConsultation.css";

// ── Vet-friendly status label map ────────────────────────────
const getVetStatusLabel = (status) =>
  ({
    requested: "Requested",
    scheduled: "Scheduled",
    checked_in: "Checked In",
    in_consultation: "In Consultation",
    in_treatment: "In Treatment",
    awaiting_results: "Awaiting Results",
    clinical_complete: "Clinically Complete",
    checkout: "At Checkout",
    completed: "Completed",
    cancelled: "Cancelled",
    no_show: "No Show",
  }[status] || String(status || "").replace(/_/g, " "));

const emptyForm = {
  chief_complaint: "",
  symptoms: "",
  diagnosis: "",
  treatment_plan: "",
  weight_kg: "",
  temperature_celsius: "",
  heart_rate: "",
  respiratory_rate: "",
  notes: "",
};

const emptyPrescriptionRow = () => ({
  inventory_item_id: null,
  custom: false,
  medication_name: "",
  dosage: "",
  frequency: "",
  duration: "",
  instructions: "",
});

// Dated corrections on a finalized record. Original content is never edited.
const RecordAddenda = ({ recordId, addenda = [], canAdd, onAdded }) => {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!body.trim()) {
      toast.error("Addendum text is required.");
      return;
    }
    try {
      setSubmitting(true);
      await addMedicalRecordAddendum(recordId, body.trim());
      setBody("");
      toast.success("Addendum added.");
      onAdded();
    } catch (err) {
      toast.error(err.message || "Failed to add addendum.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="consult-section-card">
      <div className="consult-section-header">
        <div className="consult-section-icon">
          <FontAwesomeIcon icon={faFileMedical} />
        </div>
        <div className="consult-section-title-group">
          <h3>Addenda</h3>
          <p>Dated corrections. The finalized record above is never changed.</p>
        </div>
      </div>

      {addenda.length === 0 ? (
        <div className="consult-rx-empty">No addenda recorded.</div>
      ) : (
        <ul>
          {addenda.map((item) => (
            <li key={item.id}>
              <strong>{item.author?.name || "Veterinarian"}</strong>{" "}
              <small>{item.created_at ? new Date(item.created_at).toLocaleString() : ""}</small>
              <p>{item.body}</p>
            </li>
          ))}
        </ul>
      )}

      {canAdd && (
        <>
          <label className="consult-label">
            <span>New addendum</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Correction or follow-up detail…"
            />
          </label>
          <button
            type="button"
            className="consult-btn consult-btn--secondary"
            onClick={submit}
            disabled={submitting}
          >
            {submitting ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faSave} />}
            Add Addendum
          </button>
        </>
      )}
    </div>
  );
};

const VetConsultation = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [appointment, setAppointment] = useState(null);
  const [record, setRecord] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── Prescription state ──────────────────────────────────────
  const [prescriptions, setPrescriptions] = useState([]);
  const [showPrescriptions, setShowPrescriptions] = useState(false);
  const [medItems, setMedItems] = useState([]);

  // ── Confinement state ───────────────────────────────────────
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
  const isStarted = VET_STARTED_STATUSES.includes(appointmentStatus);
  const isFinalized =
    record?.status === "finalized" ||
    record?.status === "locked" ||
    ["clinical_complete", "checkout", "completed"].includes(appointmentStatus);
  const isConsultationComplete = ["clinical_complete", "checkout", "completed"].includes(appointmentStatus);

  const serviceLabel = useMemo(() => {
    const service = appointment?.service;
    return service?.name || appointment?.service_name || "Veterinary Consultation";
  }, [appointment]);

  const fillFormFromRecord = useCallback(
    (medicalRecord) => {
      if (!medicalRecord) {
        // Seed chief_complaint from appointment notes if no record yet
        setForm((f) => ({
          ...emptyForm,
          chief_complaint: appointment?.notes || "",
        }));
        return;
      }
      setForm({
        chief_complaint: medicalRecord.chief_complaint || "",
        symptoms: medicalRecord.symptoms || "",
        diagnosis: medicalRecord.diagnosis || "",
        treatment_plan: medicalRecord.treatment_plan || "",
        weight_kg: medicalRecord.weight_kg || "",
        temperature_celsius: medicalRecord.temperature_celsius || "",
        heart_rate: medicalRecord.heart_rate || "",
        respiratory_rate: medicalRecord.respiratory_rate || "",
        notes: medicalRecord.notes || "",
      });
      // Load prescriptions from the record if any
      if (Array.isArray(medicalRecord.prescriptions) && medicalRecord.prescriptions.length > 0) {
        setPrescriptions(
          medicalRecord.prescriptions.map((p) => ({
            inventory_item_id: p.inventory_item_id || null,
            custom: !p.inventory_item_id,
            medication_name: p.medication_name || "",
            dosage: p.dosage || "",
            frequency: p.frequency || "",
            duration: p.duration || "",
            instructions: p.instructions || "",
          }))
        );
        setShowPrescriptions(true);
      }
    },
    [appointment?.notes]
  );

  const loadConsultation = useCallback(async () => {
    try {
      setLoading(true);
      const appointmentResponse = await apiRequest(`/veterinary/appointments/${id}`);
      const nextAppointment = appointmentResponse?.appointment || appointmentResponse;
      setAppointment(nextAppointment);

      if (nextAppointment?.pet_id) {
        const recordsResponse = await apiRequest(
          `/veterinary/pets/${nextAppointment.pet_id}/medical-records`
        );
        const records = Array.isArray(recordsResponse?.records)
          ? recordsResponse.records
          : [];
        const existing = records.find(
          (item) => Number(item.appointment_id) === Number(id)
        );
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

  // In-store medication list for the prescription picker (custom entries stay allowed)
  useEffect(() => {
    let cancelled = false;
    apiRequest("/veterinary/inventory-items")
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res) ? res : (res?.items || res?.inventory_items || res?.data || []);
        setMedItems(list);
      })
      .catch(() => { /* picker falls back to custom entry only */ });
    return () => { cancelled = true; };
  }, []);

  // Auto-seed chief complaint from appointment notes when no record exists
  useEffect(() => {
    if (!record && appointment?.notes && !form.chief_complaint) {
      setForm((f) => ({ ...f, chief_complaint: appointment.notes }));
    }
  }, [appointment, record]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  // ── Prescription helpers ──────────────────────────────────
  const addPrescriptionRow = () => {
    setPrescriptions((prev) => [...prev, emptyPrescriptionRow()]);
    setShowPrescriptions(true);
  };

  const updatePrescriptionRow = (index, field, value) => {
    setPrescriptions((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  };

  const selectPrescriptionItem = (index, selectValue) => {
    if (selectValue === "__custom__") {
      setPrescriptions((prev) =>
        prev.map((row, i) =>
          i === index ? { ...row, custom: true, inventory_item_id: null } : row
        )
      );
      return;
    }
    const item = medItems.find((m) => String(m.id) === selectValue);
    setPrescriptions((prev) =>
      prev.map((row, i) =>
        i === index
          ? {
              ...row,
              custom: false,
              inventory_item_id: item ? item.id : null,
              medication_name: item ? item.name : row.medication_name,
            }
          : row
      )
    );
  };

  const removePrescriptionRow = (index) => {
    setPrescriptions((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Payload builder ─────────────────────────────────────
  const buildPayload = (status = "draft") => ({
    ...form,
    pet_id: appointment?.pet_id,
    appointment_id: appointment?.id,
    visit_date: new Date().toISOString(),
    status,
    prescriptions: prescriptions
      .filter((p) => p.inventory_item_id || p.medication_name.trim())
      .map((p) => ({
        inventory_item_id: p.inventory_item_id || undefined,
        medication_name: p.medication_name,
        dosage: p.dosage,
        frequency: p.frequency,
        duration: p.duration,
        instructions: p.instructions,
      })),
  });

  // ── Start consultation ───────────────────────────────────
  const startAppointment = async () => {
    try {
      setSaving(true);
      const response = await apiRequest(`/veterinary/consultations/${id}/start`, {
        method: "POST",
        body: JSON.stringify({ notes: "Consultation started by veterinarian" }),
      });
      toast.success("Consultation started.");
      // Backend returns { consultation: {...} } — fall back gracefully
      setAppointment(response?.consultation || response?.appointment || appointment);
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

  // ── Save draft / finalize ────────────────────────────────
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
      toast.success(
        status === "finalized" ? "Consultation finalized." : "Draft saved."
      );
      return nextRecord;
    } catch (err) {
      toast.error(err.message || "Failed to save consultation.");
      return null;
    } finally {
      setSaving(false);
    }
  };

  // ── Finalize record and proceed to billing review ─────────
  // The vet reviews itemized charges on the billing page, then sends the
  // bill to the cashier; the visit auto-completes once payment is verified.
  const finalizeAndReviewBill = async () => {
    const finalized = ["finalized", "locked"].includes(record?.status)
      ? record
      : await saveRecord("finalized");
    if (!finalized) return;
    toast.success("Record finalized. Review the bill, then send it to the cashier.");
    navigate(`/veterinary/appointments/${id}/billing`);
  };

  // ── Recommend confinement ────────────────────────────────
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
          treatment_plan: form.treatment_plan,
          medication_plan: confinementForm.medication_plan,
          observation_instructions: confinementForm.observation_instructions,
          special_care_instructions: confinementForm.special_care_instructions,
          estimated_cost: confinementForm.estimated_cost || undefined,
        }),
      });
      toast.success(
        "Medical confinement recommended. Receptionist can now admit and assign a room."
      );
      await loadConsultation();
    } catch (err) {
      toast.error(err.message || "Failed to recommend confinement.");
    } finally {
      setSaving(false);
    }
  };

  // ── Loading / empty states ───────────────────────────────
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
    {
      icon: faThermometer,
      label: "Temperature",
      field: "temperature_celsius",
      unit: "°C",
    },
    { icon: faHeartPulse, label: "Heart Rate", field: "heart_rate", unit: "bpm" },
    {
      icon: faLungs,
      label: "Resp. Rate",
      field: "respiratory_rate",
      unit: "/min",
    },
  ];

  return (
    <section className="vet-consultation">

      {/* ── Header ─────────────────────────────────── */}
      <div className="consult-header">
        <button
          type="button"
          className="consult-back"
          onClick={() => navigate("/veterinary/appointments")}
        >
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
        <span
          className={`consult-apt-badge consult-apt-badge--${appointmentStatus.replace(/_/g, "-")}`}
        >
          {getVetStatusLabel(appointmentStatus)}
        </span>
      </div>

      {/* ── Patient Summary ─────────────────────────── */}
      <div className="consult-section-card">
        <div className="consult-section-header">
          <div className="consult-section-icon">
            <FontAwesomeIcon icon={faPaw} />
          </div>
          <div className="consult-section-title-group">
            <h3>Patient Summary</h3>
            <p>Appointment details and patient information</p>
          </div>
        </div>
        <div className="consult-summary">
          <article>
            <PetAvatar pet={appointment.pet} size={40} />
            <span>Pet</span>
            <strong>{appointment.pet?.name || "Unknown"}</strong>
            <small>
              {appointment.pet?.species || "Pet"}
              {appointment.pet?.breed ? ` · ${appointment.pet.breed}` : ""}
            </small>
          </article>
          <article>
            <FontAwesomeIcon icon={faUser} />
            <span>Owner</span>
            <strong>{appointment.customer?.name || "Unknown owner"}</strong>
            <small>
              {appointment.customer?.phone ||
                appointment.customer?.email ||
                "No contact"}
            </small>
          </article>
          <article>
            <FontAwesomeIcon icon={faStethoscope} />
            <span>Service</span>
            <strong>{serviceLabel}</strong>
            <small>
              {appointment.service?.category || "Veterinary service"}
            </small>
          </article>
          <article>
            <FontAwesomeIcon icon={faCalendarAlt} />
            <span>Appointment</span>
            <strong>
              {appointment.scheduled_at
                ? new Date(appointment.scheduled_at).toLocaleDateString(
                    "en-PH",
                    { month: "short", day: "numeric", year: "numeric" }
                  )
                : "TBD"}
            </strong>
            <small>
              {appointment.scheduled_at
                ? new Date(appointment.scheduled_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : ""}
            </small>
          </article>
          <article>
            <FontAwesomeIcon icon={faNotesMedical} />
            <span>Record</span>
            <strong>
              {record
                ? record.status.replace(/_/g, " ")
                : "No record yet"}
            </strong>
            <small>
              {record
                ? `ID #${record.id}`
                : "Start consultation to create"}
            </small>
          </article>
        </div>
      </div>

      {/* ── Status Alert Panels ─────────────────────── */}
      {!isStarted && !isConsultationComplete && (
        <div className="consult-start-panel">
          <div className="consult-start-panel-copy">
            <div className="consult-start-icon-wrap">
              <FontAwesomeIcon icon={faPlay} />
            </div>
            <div>
              <strong>Ready to Begin</strong>
              <p>
                Start the consultation to open a medical record for this
                patient.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="consult-start-btn"
            onClick={startAppointment}
            disabled={saving}
          >
            {saving ? (
              <FontAwesomeIcon icon={faSpinner} spin />
            ) : (
              <FontAwesomeIcon icon={faPlay} />
            )}
            Start Consultation
          </button>
        </div>
      )}
      {isConsultationComplete && (
        <div className="consult-start-panel consult-start-panel--complete">
          <div className="consult-start-panel-copy">
            <div className="consult-start-icon-wrap consult-start-icon-wrap--complete">
              <FontAwesomeIcon icon={faCircleCheck} />
            </div>
            <div>
              <strong>Consultation Complete</strong>
              <p>
                Consultation is complete. Billing is being processed by the
                cashier.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="consult-btn consult-btn--billing"
            onClick={() => navigate(`/veterinary/appointments/${id}/billing`)}
          >
            <FontAwesomeIcon icon={faFileInvoiceDollar} />
            View Billing
          </button>
        </div>
      )}

      {/* ── Clinical Assessment ──────────────────────── */}
      <div className="consult-section-card">
        <div className="consult-section-header">
          <div className="consult-section-icon">
            <FontAwesomeIcon icon={faNotesMedical} />
          </div>
          <div className="consult-section-title-group">
            <h3>Clinical Assessment</h3>
            <p>
              Medical observations, diagnosis, and treatment plan
            </p>
          </div>
        </div>
        <div className="consult-form">
          <label className="consult-label consult-label--full">
            Chief Complaint
            <textarea
              value={form.chief_complaint}
              onChange={(e) => updateField("chief_complaint", e.target.value)}
              disabled={isFinalized}
              placeholder="Reason the pet was brought in…"
            />
          </label>
          <label className="consult-label consult-label--full">
            Examination / Findings
            <textarea
              value={form.symptoms}
              onChange={(e) => updateField("symptoms", e.target.value)}
              disabled={isFinalized}
              placeholder="Physical examination observations and clinical findings…"
            />
          </label>
          <label className="consult-label consult-label--full">
            Diagnosis
            <textarea
              value={form.diagnosis}
              onChange={(e) => updateField("diagnosis", e.target.value)}
              disabled={isFinalized}
              placeholder="Clinical diagnosis or assessment…"
            />
          </label>
          <label className="consult-label consult-label--full">
            Treatment / Prescription
            <textarea
              value={form.treatment_plan}
              onChange={(e) => updateField("treatment_plan", e.target.value)}
              disabled={isFinalized}
              placeholder="Treatment plan, procedures, and recommendations…"
            />
          </label>
          <label className="consult-label consult-label--full consult-label--secondary">
            Notes <span className="consult-optional">(Optional)</span>
            <textarea
              value={form.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              disabled={isFinalized}
              placeholder="Additional observations or follow-up notes…"
              className="consult-textarea--secondary"
            />
          </label>
        </div>
      </div>

      {/* ── Vital Signs ─────────────────────────────── */}
      <div className="consult-section-card">
        <div className="consult-section-header">
          <div className="consult-section-icon">
            <FontAwesomeIcon icon={faHeartPulse} />
          </div>
          <div className="consult-section-title-group">
            <h3>Vital Signs</h3>
            <p>Physical measurements — all fields are optional</p>
          </div>
        </div>
        <div className="consult-vitals-grid consult-vitals-grid--4">
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

      {/* ── Prescriptions ────────────────────────────── */}
      <div className="consult-section-card">
        <div className="consult-section-header">
          <div className="consult-section-icon">
            <FontAwesomeIcon icon={faPills} />
          </div>
          <div className="consult-section-title-group">
            <h3>Prescriptions</h3>
            <p>Structured medication records — optional</p>
          </div>
          {!isFinalized && (
            <button
              type="button"
              className="consult-btn consult-btn--secondary consult-btn--sm"
              onClick={addPrescriptionRow}
            >
              <FontAwesomeIcon icon={faPlus} />
              Add Prescription
            </button>
          )}
        </div>

        {showPrescriptions && prescriptions.length > 0 ? (
          <div className="consult-rx-table-wrap">
            <table className="consult-rx-table">
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th>Dosage</th>
                  <th>Frequency</th>
                  <th>Duration</th>
                  <th>Instructions</th>
                  {!isFinalized && <th></th>}
                </tr>
              </thead>
              <tbody>
                {prescriptions.map((row, index) => (
                  <tr key={index}>
                    <td>
                      {isFinalized ? (
                        <span className="consult-rx-med-name">{row.medication_name || "—"}</span>
                      ) : (
                        <>
                          <select
                            className="consult-rx-select"
                            value={
                              row.custom
                                ? "__custom__"
                                : row.inventory_item_id
                                  ? String(row.inventory_item_id)
                                  : ""
                            }
                            onChange={(e) =>
                              selectPrescriptionItem(index, e.target.value)
                            }
                          >
                            <option value="">Select medicine…</option>
                            {medItems.map((item) => (
                              <option key={item.id} value={String(item.id)}>
                                {item.name}
                                
                                {" — stock "}{item.stock ?? item.available_stock ?? 0}
                              </option>
                            ))}
                            {/* Keep a linked-but-removed item visible */}
                            {row.inventory_item_id &&
                              !medItems.some((m) => Number(m.id) === Number(row.inventory_item_id)) && (
                                <option value={String(row.inventory_item_id)} disabled>
                                  {row.medication_name || `Item #${row.inventory_item_id}`} (unavailable)
                                </option>
                              )}
                            <option value="__custom__">Not in store — enter manually</option>
                          </select>
                          {row.custom && (
                            <input
                              type="text"
                              className="consult-rx-custom-input"
                              value={row.medication_name}
                              onChange={(e) =>
                                updatePrescriptionRow(
                                  index,
                                  "medication_name",
                                  e.target.value
                                )
                              }
                              placeholder="e.g. Amoxicillin"
                            />
                          )}
                        </>
                      )}
                    </td>
                    <td>
                      <input
                        type="text"
                        value={row.dosage}
                        onChange={(e) =>
                          updatePrescriptionRow(index, "dosage", e.target.value)
                        }
                        disabled={isFinalized}
                        placeholder="e.g. 250mg"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={row.frequency}
                        onChange={(e) =>
                          updatePrescriptionRow(
                            index,
                            "frequency",
                            e.target.value
                          )
                        }
                        disabled={isFinalized}
                        placeholder="e.g. Twice daily"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={row.duration}
                        onChange={(e) =>
                          updatePrescriptionRow(
                            index,
                            "duration",
                            e.target.value
                          )
                        }
                        disabled={isFinalized}
                        placeholder="e.g. 7 days"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={row.instructions}
                        onChange={(e) =>
                          updatePrescriptionRow(
                            index,
                            "instructions",
                            e.target.value
                          )
                        }
                        disabled={isFinalized}
                        placeholder="e.g. After meals"
                      />
                    </td>
                    {!isFinalized && (
                      <td>
                        <RowActionPopover rowLabel={row.medication_name || `Prescription ${index + 1}`}>
                        <button
                          type="button"
                          className="consult-rx-remove"
                          onClick={() => removePrescriptionRow(index)}
                          title="Remove row"
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                        </RowActionPopover>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!isFinalized && (
              <button
                type="button"
                className="consult-btn consult-btn--secondary consult-btn--sm consult-rx-add"
                onClick={addPrescriptionRow}
              >
                <FontAwesomeIcon icon={faPlus} />
                Add Row
              </button>
            )}
          </div>
        ) : (
          <div className="consult-rx-empty">
            {isFinalized
              ? "No prescriptions recorded."
              : "No prescriptions added yet. Click \"Add Prescription\" to begin."}
          </div>
        )}
      </div>

      {/* ── Estimate, Diagnostics & Consents ───────────────── */}
      {isStarted && (
        <>
          <VetEstimatePanel
            appointmentId={id}
            disabled={isFinalized}
            emergency={!!appointment?.emergency}
          />
          <VetDiagnosticsPanel
            appointmentId={id}
            disabled={isFinalized}
            canOrder={!isConsultationComplete}
          />
          <VetConsentPanel appointmentId={id} disabled={isFinalized} />
          <VetDispensePanel appointmentId={id} disabled={isFinalized} />
        </>
      )}

      {/* ── Confinement Recommendation ──────────────── */}
      <div className="consult-section-card">
        <div className="consult-section-header">
          <div className="consult-section-icon consult-section-icon--warning">
            <FontAwesomeIcon icon={faHospital} />
          </div>
          <div className="consult-section-title-group">
            <h3>Medical Confinement Recommendation</h3>
            <p>Recommend this patient for admission and in-patient care</p>
          </div>
          {appointment?.confinement_recommended && (
            <span className="consult-apt-badge consult-apt-badge--submitted">
              Submitted
            </span>
          )}
        </div>
        <div className="consult-form">
          <label className="consult-label">
            Reason for Confinement
            <textarea
              value={confinementForm.reason_for_confinement}
              onChange={(e) =>
                setConfinementForm((current) => ({
                  ...current,
                  reason_for_confinement: e.target.value,
                }))
              }
              disabled={appointment?.confinement_recommended}
            />
          </label>
          <label className="consult-label">
            Medication Plan
            <textarea
              value={confinementForm.medication_plan}
              onChange={(e) =>
                setConfinementForm((current) => ({
                  ...current,
                  medication_plan: e.target.value,
                }))
              }
              disabled={appointment?.confinement_recommended}
            />
          </label>
          <label className="consult-label">
            Observation Instructions
            <textarea
              value={confinementForm.observation_instructions}
              onChange={(e) =>
                setConfinementForm((current) => ({
                  ...current,
                  observation_instructions: e.target.value,
                }))
              }
              disabled={appointment?.confinement_recommended}
            />
          </label>
          <label className="consult-label">
            Special Care Instructions
            <textarea
              value={confinementForm.special_care_instructions}
              onChange={(e) =>
                setConfinementForm((current) => ({
                  ...current,
                  special_care_instructions: e.target.value,
                }))
              }
              disabled={appointment?.confinement_recommended}
            />
          </label>
        </div>
        <div className="consult-vitals-grid consult-vitals-grid--3">
          <div className="consult-vital-field">
            <div className="consult-vital-icon-wrap consult-vital-icon-wrap--warning">
              <FontAwesomeIcon icon={faTriangleExclamation} />
            </div>
            <span className="consult-vital-label">Urgency Level</span>
            <div className="consult-vital-input-wrap">
              <select
                value={confinementForm.urgency_level}
                onChange={(e) =>
                  setConfinementForm((current) => ({
                    ...current,
                    urgency_level: e.target.value,
                  }))
                }
                disabled={appointment?.confinement_recommended}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
          <div className="consult-vital-field">
            <div className="consult-vital-icon-wrap">
              <FontAwesomeIcon icon={faNotesMedical} />
            </div>
            <span className="consult-vital-label">Expected Days</span>
            <div className="consult-vital-input-wrap">
              <input
                type="number"
                min="1"
                value={confinementForm.expected_stay_days}
                onChange={(e) =>
                  setConfinementForm((current) => ({
                    ...current,
                    expected_stay_days: e.target.value,
                  }))
                }
                disabled={appointment?.confinement_recommended}
                placeholder="—"
              />
              <span className="consult-vital-unit">days</span>
            </div>
          </div>
          <div className="consult-vital-field">
            <div className="consult-vital-icon-wrap">
              <FontAwesomeIcon icon={faFileMedical} />
            </div>
            <span className="consult-vital-label">Estimated Cost</span>
            <div className="consult-vital-input-wrap">
              <span className="consult-vital-prefix">PHP</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={confinementForm.estimated_cost}
                onChange={(e) =>
                  setConfinementForm((current) => ({
                    ...current,
                    estimated_cost: e.target.value,
                  }))
                }
                disabled={appointment?.confinement_recommended}
                placeholder="0.00"
              />
            </div>
          </div>
        </div>
      </div>

      {record && (isFinalized || record.addenda?.length > 0) && (
        <RecordAddenda
          recordId={record.id}
          addenda={record.addenda || []}
          canAdd={isFinalized}
          onAdded={loadConsultation}
        />
      )}

      {/* ── Sticky Actions ──────────────────────────── */}
      <div className="consult-actions">
        <button
          type="button"
          className="consult-btn consult-btn--secondary"
          onClick={() => saveRecord("draft")}
          disabled={!isStarted || saving || isFinalized}
        >
          {saving ? (
            <FontAwesomeIcon icon={faSpinner} spin />
          ) : (
            <FontAwesomeIcon icon={faSave} />
          )}
          Save Draft
        </button>
        <button
          type="button"
          className="consult-btn consult-btn--secondary"
          onClick={recommendConfinement}
          disabled={!isStarted || saving || appointment?.confinement_recommended}
        >
          <FontAwesomeIcon icon={faHospital} />
          Needs Confinement
        </button>
        {isConsultationComplete ? (
          <>
            <button
              type="button"
              className="consult-btn consult-btn--billing"
              onClick={() =>
                navigate(`/veterinary/appointments/${id}/billing`)
              }
            >
              <FontAwesomeIcon icon={faFileInvoiceDollar} />
              View Billing
            </button>
            {["clinical_complete", "checkout"].includes(appointmentStatus) && (
              <span className="consult-apt-badge">
                {appointment?.payment_status === "paid"
                  ? "Closing visit…"
                  : "Closes automatically after payment"}
              </span>
            )}
          </>
        ) : (
          <button
            type="button"
            className="consult-btn consult-btn--primary"
            onClick={finalizeAndReviewBill}
            disabled={!isStarted || saving}
          >
            {saving ? (
              <FontAwesomeIcon icon={faSpinner} spin />
            ) : (
              <FontAwesomeIcon icon={faFileInvoiceDollar} />
            )}
            Finalize &amp; Review Bill
          </button>
        )}
      </div>
    </section>
  );
};

export default VetConsultation;
