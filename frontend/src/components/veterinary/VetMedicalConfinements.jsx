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

const ACTIVE_STATUSES = ["admitted", "under_observation", "under_treatment"];

const STATUS_CONFIG = {
  admitted: {
    label: "Admitted",
    icon: faHospital,
    className: "conf-badge--admitted",
  },
  under_observation: {
    label: "Under Observation",
    icon: faEye,
    className: "conf-badge--observation",
  },
  under_treatment: {
    label: "Under Treatment",
    icon: faSyringe,
    className: "conf-badge--treatment",
  },
  cleared_for_discharge: {
    label: "Cleared for Discharge",
    icon: faCheckCircle,
    className: "conf-badge--discharged",
  },
};

const NOTE_TYPES = [
  { value: "progress_update", label: "Progress Update" },
  { value: "diagnosis", label: "Diagnosis" },
  { value: "treatment", label: "Treatment" },
  { value: "medication", label: "Medication" },
  { value: "observation", label: "Observation" },
];

const EMPTY_NOTE = {
  note_type: "progress_update",
  treatment_given: "",
  medication_given: "",
  recommendations: "",
};

const VetMedicalConfinements = () => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState({});
  const [expandedNotes, setExpandedNotes] = useState({});
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

  useEffect(() => { load(); }, []);

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

  const stats = useMemo(() => ({
    total: records.length,
    admitted: records.filter((r) => r.status === "admitted").length,
    observation: records.filter((r) => r.status === "under_observation").length,
    treatment: records.filter((r) => r.status === "under_treatment").length,
    discharged: records.filter((r) => r.status === "cleared_for_discharge").length,
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

        <button
          type="button"
          className={`conf-refresh-btn${refreshing ? " refreshing" : ""}`}
          onClick={() => load({ silent: true })}
          disabled={refreshing}
        >
          <FontAwesomeIcon icon={faRotateRight} />
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
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
          { label: "Discharged", value: stats.discharged, icon: faCheckCircle, className: "conf-stat--discharged" },
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
            const isPosting = actionLoading[`${record.id}-/veterinary/medical-confinements/${record.id}/progress-notes`];
            const isObserving = actionLoading[`${record.id}-/veterinary/medical-confinements/${record.id}/mark-under-observation`];
            const isTreating = actionLoading[`${record.id}-/veterinary/medical-confinements/${record.id}/mark-under-treatment`];
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
                        disabled={isObserving || record.status === "under_observation"}
                      >
                        {isObserving ? <FontAwesomeIcon icon={faSpinner} className="conf-spin" /> : <FontAwesomeIcon icon={faEye} />}
                        Under Observation
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
                        disabled={isTreating || record.status === "under_treatment"}
                      >
                        {isTreating ? <FontAwesomeIcon icon={faSpinner} className="conf-spin" /> : <FontAwesomeIcon icon={faSyringe} />}
                        Under Treatment
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

                {/* Discharged Banner */}
                {!isActive && (
                  <div className="conf-discharged-banner">
                    <FontAwesomeIcon icon={faCheckCircle} />
                    <span>This patient has been cleared for discharge.</span>
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
