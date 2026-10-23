import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHospital,
  faPaw,
  faStethoscope,
  faHeartPulse,
  faClipboardList,
  faFlask,
  faCheckCircle,
  faExclamationTriangle,
  faRotateRight,
  faSpinner,
  faNotesMedical,
  faSyringe,
  faEye,
  faXmark,
  faChevronDown,
  faChevronUp,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import { showSuccess, showError } from "../../utils/alert.jsx";
import "./theme.css";
import "./VetMedicalConfinements.css";

const normalizeList = (result) => {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.medical_confinements)) return result.medical_confinements;
  if (Array.isArray(result?.data)) return result.data;
  return [];
};

const ACTIVE_STATUSES = ["admitted", "under_care", "under_observation", "under_treatment"];

const STATUS_CONFIG = {
  recommended: {
    label: "Recommended",
    icon: faNotesMedical,
    className: "conf-badge--default",
  },
  consented: {
    label: "Consented",
    icon: faCheckCircle,
    className: "conf-badge--observation",
  },
  bed_assigned: {
    label: "Bed Assigned",
    icon: faHospital,
    className: "conf-badge--observation",
  },
  approved_for_admission: {
    label: "Bed Assigned",
    icon: faCheckCircle,
    className: "conf-badge--observation",
  },
  admitted: {
    label: "Admitted",
    icon: faHospital,
    className: "conf-badge--admitted",
  },
  under_care: {
    label: "Under Care",
    icon: faHeartPulse,
    className: "conf-badge--treatment",
  },
  under_observation: {
    label: "Under Care — Observation",
    icon: faEye,
    className: "conf-badge--observation",
  },
  under_treatment: {
    label: "Under Care — Treatment",
    icon: faSyringe,
    className: "conf-badge--treatment",
  },
  ready_for_discharge: {
    label: "Ready for Discharge",
    icon: faCheckCircle,
    className: "conf-badge--discharged",
  },
  discharged: {
    label: "Discharged",
    icon: faCheckCircle,
    className: "conf-badge--discharged",
  },
  transferred: {
    label: "Transferred",
    icon: faHospital,
    className: "conf-badge--discharged",
  },
  deceased: {
    label: "Deceased",
    icon: faXmark,
    className: "conf-badge--default",
  },
  completed: {
    label: "Discharged",
    icon: faCheckCircle,
    className: "conf-badge--discharged",
  },
  cancelled: {
    label: "Cancelled",
    icon: faXmark,
    className: "conf-badge--default",
  },
};

const CARE_LEVEL_LABELS = {
  observation: "Observation",
  treatment: "Treatment",
  critical: "Critical",
};

const NOTE_TYPES = [
  { value: "progress_update", label: "Progress Update" },
  { value: "diagnosis", label: "Diagnosis" },
  { value: "treatment", label: "Treatment" },
  { value: "medication", label: "Medication" },
  { value: "observation", label: "Observation" },
  { value: "discharge_clearance", label: "Discharge Clearance" },
];

const EMPTY_NOTE = {
  note_type: "progress_update",
  treatment_given: "",
  medication_given: "",
  recommendations: "",
};

const EMPTY_MAR = {
  inventory_item_id: "",
  medication_name: "",
  dose: "",
  route: "",
  scheduled_at: "",
  notes: "",
};

/**
 * Medication Administration Record panel — schedule and confirm doses for a
 * confined patient. Stock only moves on Administer.
 */
const MarPanel = ({ confinementId, items, onChanged }) => {
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState(EMPTY_MAR);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadMar = async () => {
    try {
      const data = await apiRequest(`/veterinary/medical-confinements/${confinementId}/mar`);
      setEntries(Array.isArray(data?.mar) ? data.mar : []);
    } catch (err) {
      showError(err.message || "Failed to load medication records.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadMar(); }, [confinementId]);

  const schedule = async () => {
    if (!form.inventory_item_id && !form.medication_name.trim()) {
      showError("Pick an inventory item or enter a medication name.");
      return;
    }
    try {
      setBusy(true);
      await apiRequest(`/veterinary/medical-confinements/${confinementId}/mar`, {
        method: "POST",
        body: JSON.stringify({
          inventory_item_id: form.inventory_item_id || undefined,
          medication_name: form.medication_name || undefined,
          dose: form.dose || undefined,
          route: form.route || undefined,
          scheduled_at: form.scheduled_at || undefined,
          notes: form.notes || undefined,
        }),
      });
      showSuccess("Medication scheduled.");
      setForm(EMPTY_MAR);
      await loadMar();
      onChanged?.();
    } catch (err) {
      showError(err.message || "Failed to schedule medication.");
    } finally {
      setBusy(false);
    }
  };

  const act = async (path, body, successMsg) => {
    try {
      setBusy(true);
      await apiRequest(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
      showSuccess(successMsg);
      await loadMar();
      onChanged?.();
    } catch (err) {
      showError(err.message || "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="conf-note-form" style={{ marginTop: "12px" }}>
      <div className="conf-note-form-header">
        <FontAwesomeIcon icon={faSyringe} />
        <span>Medication Administration (MAR)</span>
      </div>

      <div className="conf-form-group">
        <label>Medication (inventory item)</label>
        <select
          value={form.inventory_item_id}
          onChange={(e) => setForm((f) => ({ ...f, inventory_item_id: e.target.value }))}
        >
          <option value="">— Free-text medication —</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} (stock: {item.stock ?? item.available_stock ?? 0})
            </option>
          ))}
        </select>
      </div>
      {!form.inventory_item_id && (
        <div className="conf-form-group">
          <label>Medication name</label>
          <input
            type="text"
            value={form.medication_name}
            onChange={(e) => setForm((f) => ({ ...f, medication_name: e.target.value }))}
            placeholder="e.g. Amoxicillin 250mg"
          />
        </div>
      )}
      <div className="conf-form-group">
        <label>Dose / Route</label>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            type="text"
            placeholder="10mg/kg"
            value={form.dose}
            onChange={(e) => setForm((f) => ({ ...f, dose: e.target.value }))}
          />
          <input
            type="text"
            placeholder="IV / Oral"
            value={form.route}
            onChange={(e) => setForm((f) => ({ ...f, route: e.target.value }))}
          />
        </div>
      </div>
      <div className="conf-form-group">
        <label>Scheduled at (optional)</label>
        <input
          type="datetime-local"
          value={form.scheduled_at}
          onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))}
        />
      </div>
      <div className="conf-note-form-footer">
        <button type="button" className="conf-submit-note-btn" onClick={schedule} disabled={busy}>
          {busy ? <FontAwesomeIcon icon={faSpinner} className="conf-spin" /> : <FontAwesomeIcon icon={faSyringe} />}
          Schedule Dose
        </button>
      </div>

      {loading ? (
        <p style={{ opacity: 0.7 }}><FontAwesomeIcon icon={faSpinner} className="conf-spin" /> Loading…</p>
      ) : entries.length === 0 ? (
        <p style={{ opacity: 0.7 }}>No medication records yet.</p>
      ) : (
        <div>
          {entries.map((entry) => (
            <div key={entry.id} className="conf-info-row" style={{ alignItems: "center" }}>
              <div className="conf-info-icon"><FontAwesomeIcon icon={faSyringe} /></div>
              <div style={{ flex: 1 }}>
                <strong>{entry.medication_name}</strong>
                <p>
                  {[entry.dose, entry.route].filter(Boolean).join(" • ")}
                  {entry.scheduled_at && ` • due ${new Date(entry.scheduled_at).toLocaleString()}`}
                  {" — "}{entry.status}
                  {entry.administered_at && ` at ${new Date(entry.administered_at).toLocaleString()}`}
                  {entry.administered_by?.name && ` by ${entry.administered_by.name}`}
                </p>
              </div>
              {entry.status === "scheduled" && (
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    type="button"
                    className="conf-action-btn conf-action-btn--treat"
                    disabled={busy}
                    onClick={() => act(`/veterinary/medical-confinements/${confinementId}/mar/${entry.id}/administer`, null, "Administration confirmed — stock deducted.")}
                  >
                    Administer
                  </button>
                  <button
                    type="button"
                    className="conf-action-btn"
                    disabled={busy}
                    onClick={() => act(`/veterinary/medical-confinements/${confinementId}/mar/${entry.id}/status`, { status: "skipped" }, "Marked skipped.")}
                  >
                    Skip
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const VetMedicalConfinements = () => {
  const [records, setRecords] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState({});
  const [expandedNotes, setExpandedNotes] = useState({});
  const [expandedMar, setExpandedMar] = useState({});
  const [notes, setNotes] = useState({});

  const load = async ({ silent = false } = {}) => {
    try {
      if (silent) setRefreshing(true);
      else setLoading(true);
      const data = await apiRequest("/veterinary/medical-confinements");
      const list = normalizeList(data);
      setRecords(list);
      const initialNotes = {};
      list.forEach((r) => { initialNotes[r.id] = { ...EMPTY_NOTE }; });
      setNotes((prev) => ({ ...initialNotes, ...prev }));
      setError("");
    } catch (err) {
      setError(err.message || "Failed to load confinements.");
      showError(err.message || "Failed to load confinements.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadItems = async () => {
    try {
      const data = await apiRequest("/veterinary/inventory-items");
      const list = Array.isArray(data) ? data : (data?.items || data?.inventory_items || data?.data || []);
      setItems(list);
    } catch {
      // MAR item picker is optional — free-text medications still work.
    }
  };

  useEffect(() => { load(); loadItems(); }, []);

  const post = async (url, body, successMsg, recordId) => {
    try {
      setActionLoading((prev) => ({ ...prev, [`${recordId}-${url}`]: true }));
      setError("");
      await apiRequest(url, { method: "POST", body: body ? JSON.stringify(body) : undefined });
      showSuccess(successMsg);
      await load({ silent: true });
    } catch (err) {
      setError(err.message || "Action failed.");
      showError(err.message || "Action failed.");
    } finally {
      setActionLoading((prev) => ({ ...prev, [`${recordId}-${url}`]: false }));
    }
  };

  const updateNote = (recordId, field, value) => {
    setNotes((prev) => ({
      ...prev,
      [recordId]: { ...(prev[recordId] || EMPTY_NOTE), [field]: value },
    }));
  };

  const toggleNoteForm = (recordId) => {
    setExpandedNotes((prev) => ({ ...prev, [recordId]: !prev[recordId] }));
  };

  const careLevelOf = (r) =>
    r.status === "under_care" ? (r.care_level || "observation")
    : r.status === "under_observation" ? "observation"
    : r.status === "under_treatment" ? "treatment"
    : null;

  const stats = useMemo(() => ({
    total: records.length,
    admitted: records.filter((r) => r.status === "admitted").length,
    observation: records.filter((r) => careLevelOf(r) === "observation").length,
    treatment: records.filter((r) => careLevelOf(r) === "treatment").length,
    critical: records.filter((r) => careLevelOf(r) === "critical").length,
    discharged: records.filter((r) => r.status === "ready_for_discharge").length,
  }), [records]);

  if (loading) {
    return (
      <section className="vet-confinements">
        <div className="conf-loading-state">
          <FontAwesomeIcon icon={faSpinner} className="conf-spin" />
          <span>Loading medical confinements...</span>
        </div>
      </section>
    );
  }

  return (
    <section className="vet-confinements">

      {/* Hero */}
      <div className="conf-hero">
        <div className="conf-hero-copy">
          <span className="conf-eyebrow">
            <FontAwesomeIcon icon={faHospital} />
            Medical Confinement
          </span>
          <h2 className="conf-title">
            <FontAwesomeIcon icon={faHeartPulse} />
            Observation &amp; Treatment
          </h2>
          <p className="conf-subtitle">
            Manage admitted patients — add progress notes and clear pets for discharge.
          </p>
        </div>

        {refreshing && <FontAwesomeIcon icon={faRotateRight} spin />}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="conf-error-banner">
          <FontAwesomeIcon icon={faExclamationTriangle} />
          <span>{error}</span>
          <button type="button" className="conf-dismiss-btn" onClick={() => setError("")}>
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
      )}

      {/* Stats Row */}
      <div className="conf-stats">
        {[
          { label: "Total Confined", value: stats.total, icon: faClipboardList, className: "conf-stat--total" },
          { label: "Admitted", value: stats.admitted, icon: faHospital, className: "conf-stat--admitted" },
          { label: "Observation", value: stats.observation, icon: faEye, className: "conf-stat--observation" },
          { label: "Treatment", value: stats.treatment, icon: faSyringe, className: "conf-stat--treatment" },
          { label: "Critical", value: stats.critical, icon: faHeartPulse, className: "conf-stat--admitted" },
          { label: "Ready for Discharge", value: stats.discharged, icon: faCheckCircle, className: "conf-stat--discharged" },
        ].map(({ label, value, icon, className }) => (
          <article key={label} className={`conf-stat-card ${className}`}>
            <span className="conf-stat-icon">
              <FontAwesomeIcon icon={icon} />
            </span>
            <div className="conf-stat-body">
              <strong>{value}</strong>
              <p>{label}</p>
            </div>
          </article>
        ))}
      </div>

      {/* Record Cards */}
      {records.length === 0 ? (
        <div className="conf-empty-state">
          <FontAwesomeIcon icon={faPaw} />
          <h3>No active medical confinements</h3>
          <p>Pets admitted for observation or treatment will appear here.</p>
        </div>
      ) : (
        <div className="conf-records-list">
          {records.map((record) => {
            const petName = record.pet?.name || record.pet_name || "Unknown Pet";
            const petSpecies = record.pet?.species || record.pet_species || "";
            const petBreed = record.pet?.breed || record.pet_breed || "";
            const isActive = ACTIVE_STATUSES.includes(record.status);
            const statusCfg = STATUS_CONFIG[record.status] || {
              label: record.status,
              icon: faStethoscope,
              className: "conf-badge--default",
            };
            const noteForm = notes[record.id] || EMPTY_NOTE;
            const noteExpanded = expandedNotes[record.id];
            const marExpanded = expandedMar[record.id];
            const careLevel = careLevelOf(record);
            const isPosting = actionLoading[`${record.id}-/veterinary/medical-confinements/${record.id}/progress-notes`];
            const isObserving = actionLoading[`${record.id}-/veterinary/medical-confinements/${record.id}/mark-under-observation`];
            const isTreating = actionLoading[`${record.id}-/veterinary/medical-confinements/${record.id}/mark-under-treatment`];
            const isCritical = actionLoading[`${record.id}-/veterinary/medical-confinements/${record.id}/mark-critical`];
            const isDischarging = actionLoading[`${record.id}-/veterinary/medical-confinements/${record.id}/clear-for-discharge`];

            return (
              <article key={record.id} className={`conf-record-card${isActive ? " conf-record-card--active" : ""}`}>

                {/* Card Header */}
                <div className="conf-record-header">
                  <div className="conf-record-pet">
                    <div className="conf-pet-avatar">
                      <FontAwesomeIcon icon={faPaw} />
                    </div>
                    <div className="conf-pet-info">
                      <h3>{petName}</h3>
                      {(petSpecies || petBreed) && (
                        <p>{[petSpecies, petBreed].filter(Boolean).join(" • ")}</p>
                      )}
                    </div>
                  </div>

                  <span className={`conf-badge ${statusCfg.className}`}>
                    <FontAwesomeIcon icon={statusCfg.icon} />
                    {statusCfg.label}
                    {record.status === "under_care" && careLevel ? ` — ${CARE_LEVEL_LABELS[careLevel]}` : ""}
                  </span>
                </div>

                {/* Clinical Info */}
                <div className="conf-record-body">
                  {record.diagnosis && (
                    <div className="conf-info-row">
                      <div className="conf-info-icon">
                        <FontAwesomeIcon icon={faStethoscope} />
                      </div>
                      <div>
                        <strong>Diagnosis</strong>
                        <p>{record.diagnosis}</p>
                      </div>
                    </div>
                  )}

                  {record.reason_for_confinement && (
                    <div className="conf-info-row">
                      <div className="conf-info-icon">
                        <FontAwesomeIcon icon={faClipboardList} />
                      </div>
                      <div>
                        <strong>Reason for Confinement</strong>
                        <p>{record.reason_for_confinement}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Active Patient Actions */}
                {isActive && (
                  <div className="conf-record-actions-section">

                    {/* Status Action Buttons */}
                    <div className="conf-status-actions">
                      <button
                        type="button"
                        className="conf-action-btn conf-action-btn--observe"
                        onClick={() => post(
                          `/veterinary/medical-confinements/${record.id}/mark-under-observation`,
                          null,
                          "Marked under observation.",
                          record.id
                        )}
                        disabled={isObserving || careLevel === "observation"}
                      >
                        {isObserving ? <FontAwesomeIcon icon={faSpinner} className="conf-spin" /> : <FontAwesomeIcon icon={faEye} />}
                        Observation
                      </button>

                      <button
                        type="button"
                        className="conf-action-btn conf-action-btn--treat"
                        onClick={() => post(
                          `/veterinary/medical-confinements/${record.id}/mark-under-treatment`,
                          null,
                          "Marked under treatment.",
                          record.id
                        )}
                        disabled={isTreating || careLevel === "treatment"}
                      >
                        {isTreating ? <FontAwesomeIcon icon={faSpinner} className="conf-spin" /> : <FontAwesomeIcon icon={faSyringe} />}
                        Treatment
                      </button>

                      <button
                        type="button"
                        className="conf-action-btn conf-action-btn--discharge"
                        onClick={() => post(
                          `/veterinary/medical-confinements/${record.id}/mark-critical`,
                          null,
                          "Marked critical.",
                          record.id
                        )}
                        disabled={isCritical || careLevel === "critical"}
                      >
                        {isCritical ? <FontAwesomeIcon icon={faSpinner} className="conf-spin" /> : <FontAwesomeIcon icon={faHeartPulse} />}
                        Critical
                      </button>

                      <button
                        type="button"
                        className="conf-action-btn conf-action-btn--discharge"
                        onClick={() => post(
                          `/veterinary/medical-confinements/${record.id}/clear-for-discharge`,
                          { recommendations: noteForm.recommendations },
                          "Cleared for discharge.",
                          record.id
                        )}
                        disabled={isDischarging}
                      >
                        {isDischarging ? <FontAwesomeIcon icon={faSpinner} className="conf-spin" /> : <FontAwesomeIcon icon={faCheckCircle} />}
                        Clear for Discharge
                      </button>
                    </div>

                    {/* MAR Toggle */}
                    <button
                      type="button"
                      className="conf-toggle-notes-btn"
                      onClick={() => setExpandedMar((prev) => ({ ...prev, [record.id]: !prev[record.id] }))}
                    >
                      <FontAwesomeIcon icon={faSyringe} />
                      <span>Medication Administration</span>
                      <FontAwesomeIcon icon={marExpanded ? faChevronUp : faChevronDown} className="conf-chevron" />
                    </button>
                    {marExpanded && (
                      <MarPanel confinementId={record.id} items={items} onChanged={() => load({ silent: true })} />
                    )}

                    {/* Progress Note Toggle */}
                    <button
                      type="button"
                      className="conf-toggle-notes-btn"
                      onClick={() => toggleNoteForm(record.id)}
                    >
                      <FontAwesomeIcon icon={faNotesMedical} />
                      <span>Add Progress Note</span>
                      <FontAwesomeIcon icon={noteExpanded ? faChevronUp : faChevronDown} className="conf-chevron" />
                    </button>

                    {/* Progress Note Form */}
                    {noteExpanded && (
                      <div className="conf-note-form">
                        <div className="conf-note-form-header">
                          <FontAwesomeIcon icon={faFlask} />
                          <span>Progress Note</span>
                        </div>

                        <div className="conf-form-group">
                          <label htmlFor={`note-type-${record.id}`}>Note Type</label>
                          <select
                            id={`note-type-${record.id}`}
                            value={noteForm.note_type}
                            onChange={(e) => updateNote(record.id, "note_type", e.target.value)}
                          >
                            {NOTE_TYPES.map(({ value, label }) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                        </div>

                        <div className="conf-form-group">
                          <label htmlFor={`treatment-${record.id}`}>Treatment Given</label>
                          <textarea
                            id={`treatment-${record.id}`}
                            placeholder="Describe the treatment administered..."
                            value={noteForm.treatment_given}
                            onChange={(e) => updateNote(record.id, "treatment_given", e.target.value)}
                          />
                        </div>

                        <div className="conf-form-group">
                          <label htmlFor={`medication-${record.id}`}>Medication Given</label>
                          <textarea
                            id={`medication-${record.id}`}
                            placeholder="List medications administered with dosages..."
                            value={noteForm.medication_given}
                            onChange={(e) => updateNote(record.id, "medication_given", e.target.value)}
                          />
                        </div>

                        <div className="conf-form-group">
                          <label htmlFor={`recommendations-${record.id}`}>Recommendations</label>
                          <textarea
                            id={`recommendations-${record.id}`}
                            placeholder="Follow-up recommendations or care instructions..."
                            value={noteForm.recommendations}
                            onChange={(e) => updateNote(record.id, "recommendations", e.target.value)}
                          />
                        </div>

                        <div className="conf-note-form-footer">
                          <button
                            type="button"
                            className="conf-submit-note-btn"
                            onClick={() => post(
                              `/veterinary/medical-confinements/${record.id}/progress-notes`,
                              noteForm,
                              "Progress note added.",
                              record.id
                            )}
                            disabled={isPosting}
                          >
                            {isPosting ? (
                              <FontAwesomeIcon icon={faSpinner} className="conf-spin" />
                            ) : (
                              <FontAwesomeIcon icon={faNotesMedical} />
                            )}
                            {isPosting ? "Saving..." : "Save Progress Note"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Discharge State Banner */}
                {record.status === "ready_for_discharge" && (
                  <div className="conf-discharged-banner">
                    <FontAwesomeIcon icon={faCheckCircle} />
                    <span>This patient is ready for discharge.</span>
                  </div>
                )}
                {["discharged", "completed"].includes(record.status) && (
                  <div className="conf-discharged-banner">
                    <FontAwesomeIcon icon={faCheckCircle} />
                    <span>This patient has been discharged.</span>
                  </div>
                )}
                {record.status === "transferred" && (
                  <div className="conf-discharged-banner">
                    <FontAwesomeIcon icon={faHospital} />
                    <span>This patient was transferred to another facility.</span>
                  </div>
                )}
                {record.status === "deceased" && (
                  <div className="conf-discharged-banner">
                    <FontAwesomeIcon icon={faXmark} />
                    <span>This patient died in care.</span>
                  </div>
                )}
                {["recommended", "consented", "bed_assigned", "approved_for_admission"].includes(record.status) && (
                  <div className="conf-discharged-banner">
                    <FontAwesomeIcon icon={faExclamationTriangle} />
                    <span>This patient is waiting for admission.</span>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default VetMedicalConfinements;
