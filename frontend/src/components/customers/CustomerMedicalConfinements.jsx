import React, { useEffect, useState } from "react";
import { apiRequest } from "../../api/client";

const list = (result, key) => (Array.isArray(result?.[key]) ? result[key] : Array.isArray(result) ? result : []);

const CustomerMedicalConfinements = () => {
  const [records, setRecords] = useState([]);
  const [notes, setNotes] = useState({});
  const [logs, setLogs] = useState({});
  const [files, setFiles] = useState({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    const data = await apiRequest("/customer/medical-confinements");
    setRecords(list(data, "medical_confinements"));
  };

  useEffect(() => {
    load().catch((err) => setError(err.message || "Failed to load medical confinements."));
  }, []);

  const uploadPayment = async (record) => {
    const file = files[record.id];
    if (!file) {
      setError("Choose a proof file first.");
      return;
    }
    const form = new FormData();
    form.append("payment_method", "online_transfer");
    form.append("payment_proof", file);
    await apiRequest(`/customer/medical-confinements/${record.id}/payment-proof`, { method: "POST", body: form });
    setMessage("Payment proof submitted.");
    await load();
  };

  const loadNotes = async (record) => {
    const [noteData, logData] = await Promise.all([
      apiRequest(`/customer/medical-confinements/${record.id}/medical-notes`),
      apiRequest(`/customer/medical-confinements/${record.id}/care-logs`),
    ]);
    setNotes((current) => ({ ...current, [record.id]: list(noteData, "medical_notes") }));
    setLogs((current) => ({ ...current, [record.id]: list(logData, "care_logs") }));
  };

  return (
    <section className="customer-medical-confinements">
      <div className="medical-header"><div className="header-left"><h1>Medical Confinements</h1><p>Track veterinary observation stays and discharge status</p></div></div>
      {error && <div className="medical-error"><span>x</span><p>{error}</p></div>}
      {message && <div className="alert alert-success">{message}</div>}
      <div className="confinement-list">
        {records.map((record) => (
          <div key={record.id} className="confinement-card">
            <div className="confinement-header"><div className="confinement-id">Confinement #{record.id}</div><span className="status-badge">{record.status}</span></div>
            <div className="confinement-details">
              <div className="detail-row"><span className="label">Pet:</span><span className="value">{record.pet?.name || record.pet_name}</span></div>
              <div className="detail-row"><span className="label">Diagnosis:</span><span className="value">{record.diagnosis}</span></div>
              <div className="detail-row"><span className="label">Payment:</span><span className="value">{record.payment_status}</span></div>
              <div className="detail-row"><span className="label">Room:</span><span className="value">{record.room?.name || record.room?.room_number || "Pending assignment"}</span></div>
            </div>
            {["unpaid", "rejected", "partial"].includes(record.payment_status) && (
              <div className="confinement-actions">
                <input type="file" accept="image/*,.pdf" onChange={(e) => setFiles((current) => ({ ...current, [record.id]: e.target.files?.[0] }))} />
                <button onClick={() => uploadPayment(record)}>Upload Payment Proof</button>
              </div>
            )}
            <div className="confinement-actions"><button onClick={() => loadNotes(record)}>View Notes and Care Logs</button></div>
            {(notes[record.id] || []).map((note) => <div key={`n-${note.id}`} className="care-log-item"><strong>{note.note_type}</strong><p>{note.treatment_given || note.recommendations || note.diagnosis_update}</p></div>)}
            {(logs[record.id] || []).map((log) => <div key={`l-${log.id}`} className="care-log-item"><strong>{log.log_type}</strong><p>{log.notes}</p></div>)}
          </div>
        ))}
        {records.length === 0 && <div className="no-confinements">No medical confinement records yet.</div>}
      </div>
    </section>
  );
};

export default CustomerMedicalConfinements;
