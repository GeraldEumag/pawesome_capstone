import React, { useEffect, useState } from "react";
import { apiRequest } from "../../api/client";
import { useTheme } from "../../utils/theme";
import "./theme.css";

const normalizeList = (result) => {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.medical_confinements)) return result.medical_confinements;
  if (Array.isArray(result?.data)) return result.data;
  return [];
};

const VetMedicalConfinements = () => {
  useTheme();
  const [records, setRecords] = useState([]);
  const [note, setNote] = useState({ note_type: "progress_update", treatment_given: "", medication_given: "", recommendations: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    const data = await apiRequest("/veterinary/medical-confinements");
    setRecords(normalizeList(data));
  };

  useEffect(() => {
    load().catch((err) => setError(err.message || "Failed to load confinements."));
  }, []);

  const post = async (url, body, ok) => {
    try {
      setError("");
      await apiRequest(url, { method: "POST", body: body ? JSON.stringify(body) : undefined });
      setMessage(ok);
      await load();
    } catch (err) {
      setError(err.message || "Action failed.");
    }
  };

  return (
    <section className="vet-consultation">
      {error && <div className="consult-empty">{error}</div>}
      {message && <div className="consult-start-panel"><p>{message}</p></div>}
      <div className="consult-header">
        <div>
          <span className="consult-eyebrow">Medical Confinement</span>
          <h2>Observation and Treatment</h2>
          <p>Veterinary progress notes and discharge clearance</p>
        </div>
      </div>

      <div className="consult-form">
        {records.map((record) => (
          <article key={record.id} className="consult-start-panel">
            <h3>{record.pet?.name || record.pet_name} - {record.status}</h3>
            <p>{record.diagnosis}</p>
            <p>{record.reason_for_confinement}</p>
            {["admitted", "under_observation", "under_treatment"].includes(record.status) && (
              <>
                <select value={note.note_type} onChange={(e) => setNote((current) => ({ ...current, note_type: e.target.value }))}>
                  <option value="progress_update">Progress Update</option>
                  <option value="diagnosis">Diagnosis</option>
                  <option value="treatment">Treatment</option>
                  <option value="medication">Medication</option>
                  <option value="observation">Observation</option>
                </select>
                <textarea placeholder="Treatment given" value={note.treatment_given} onChange={(e) => setNote((current) => ({ ...current, treatment_given: e.target.value }))} />
                <textarea placeholder="Medication given" value={note.medication_given} onChange={(e) => setNote((current) => ({ ...current, medication_given: e.target.value }))} />
                <textarea placeholder="Recommendations" value={note.recommendations} onChange={(e) => setNote((current) => ({ ...current, recommendations: e.target.value }))} />
                <button onClick={() => post(`/veterinary/medical-confinements/${record.id}/progress-notes`, note, "Progress note added.")}>Add Progress Note</button>
                <button onClick={() => post(`/veterinary/medical-confinements/${record.id}/mark-under-observation`, null, "Marked under observation.")}>Under Observation</button>
                <button onClick={() => post(`/veterinary/medical-confinements/${record.id}/mark-under-treatment`, null, "Marked under treatment.")}>Under Treatment</button>
                <button onClick={() => post(`/veterinary/medical-confinements/${record.id}/clear-for-discharge`, { recommendations: note.recommendations }, "Cleared for discharge.")}>Clear for Discharge</button>
              </>
            )}
          </article>
        ))}
        {records.length === 0 && <div className="consult-empty">No active medical confinements.</div>}
      </div>
    </section>
  );
};

export default VetMedicalConfinements;
