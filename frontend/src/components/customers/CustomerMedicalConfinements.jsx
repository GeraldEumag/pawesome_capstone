import React, { useEffect, useState } from "react";
import { apiRequest } from "../../api/client";
import { showWarning, showSuccess, showError } from "../../utils/alert.jsx";
import "./CustomerMedicalConfinements.css";
import PaymentUploadModal from "../shared/PaymentUploadModal";

const list = (result, key) => (Array.isArray(result?.[key]) ? result[key] : Array.isArray(result) ? result : []);

const getStatusClass = (status) => {
  const s = (status || "").toLowerCase();
  if (["discharged", "completed"].includes(s)) return "discharged";
  if (["active", "ongoing", "admitted"].includes(s)) return "active";
  if (s === "pending") return "pending";
  if (s === "cancelled") return "cancelled";
  return "";
};

const CustomerMedicalConfinements = () => {
  const [records, setRecords] = useState([]);
  const [notes, setNotes] = useState({});
  const [logs, setLogs] = useState({});
  const [uploadModal, setUploadModal] = useState({ open: false, endpoint: "", title: "" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiRequest("/customer/medical-confinements");
      setRecords(list(data, "medical_confinements"));
    } catch (err) {
      setError(err.message || "Failed to load medical confinements.");
      showError(err.message || "Failed to load medical confinements.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openPaymentModal = (record) => {
    setUploadModal({
      open: true,
      endpoint: `/customer/medical-confinements/${record.id}/payment-proof`,
      title: `Confinement #${record.id}`,
    });
  };

  const loadNotes = async (record) => {
    try {
      const [noteData, logData] = await Promise.all([
        apiRequest(`/customer/medical-confinements/${record.id}/medical-notes`),
        apiRequest(`/customer/medical-confinements/${record.id}/care-logs`),
      ]);
      setNotes((prev) => ({ ...prev, [record.id]: list(noteData, "medical_notes") }));
      setLogs((prev) => ({ ...prev, [record.id]: list(logData, "care_logs") }));
    } catch (err) {
      showError(err.message || "Failed to load notes.");
    }
  };

  const hasNotesLoaded = (id) => notes[id] !== undefined || logs[id] !== undefined;

  return (
    <section className="customer-medical-confinements">
      <header className="medical-page-header">
        <div>
          <span className="medical-eyebrow">Customer Portal</span>
          <h2>Medical Confinements</h2>
          <p>Track veterinary observation stays, discharge status, and care notes.</p>
        </div>
      </header>

      {message && (
        <div className="medical-feedback success" role="status">
          {message}
        </div>
      )}
      {error && (
        <div className="medical-feedback error" role="alert">
          {error}
        </div>
      )}

      <div className="medical-panel">
        <div className="medical-panel-header">
          <h3>Confinement Records</h3>
          {records.length > 0 && (
            <span className="medical-count-badge">{records.length} record{records.length !== 1 ? "s" : ""}</span>
          )}
        </div>

        {loading ? (
          <div className="medical-empty">
            <p>Loading records...</p>
          </div>
        ) : records.length === 0 ? (
          <div className="medical-empty">
            <h3>No confinement records</h3>
            <p>You don't have any medical confinement records yet.</p>
          </div>
        ) : (
          <div className="confinement-list">
            {records.map((record) => (
              <div key={record.id} className="confinement-card">
                <div className="confinement-card-header">
                  <div className="confinement-id">
                    Confinement #{record.id}
                  </div>
                  <span className={`status-badge ${getStatusClass(record.status)}`}>
                    {record.status || "Unknown"}
                  </span>
                </div>

                <div className="confinement-details">
                  <div className="detail-row">
                    <span className="label">Pet</span>
                    <span className="value">{record.pet?.name || record.pet_name || "N/A"}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Diagnosis</span>
                    <span className="value">{record.diagnosis || "N/A"}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Payment Status</span>
                    <span className="value">{record.payment_status || "N/A"}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Room</span>
                    <span className="value">{record.room?.name || record.room?.room_number || "Pending assignment"}</span>
                  </div>
                </div>

                {["unpaid", "rejected", "partial"].includes(record.payment_status) && (
                  <div className="confinement-actions">
                    <button
                      className="confinement-action-btn primary"
                      onClick={() => openPaymentModal(record)}
                    >
                      Upload Payment Proof
                    </button>
                  </div>
                )}

                <div className="confinement-actions">
                  <button
                    className="confinement-action-btn secondary"
                    onClick={() => loadNotes(record)}
                  >
                    {hasNotesLoaded(record.id) ? "Refresh Notes & Logs" : "View Notes & Care Logs"}
                  </button>
                </div>

                {hasNotesLoaded(record.id) && (
                  <div className="care-logs-section">
                    {(notes[record.id] || []).length > 0 && (
                      <>
                        <div className="care-logs-title">Medical Notes</div>
                        {notes[record.id].map((note) => (
                          <div key={`n-${note.id}`} className="care-log-item">
                            <strong>{note.note_type || "Note"}</strong>
                            <p>{note.treatment_given || note.recommendations || note.diagnosis_update || "No details."}</p>
                          </div>
                        ))}
                      </>
                    )}
                    {(logs[record.id] || []).length > 0 && (
                      <>
                        <div className="care-logs-title">Care Logs</div>
                        {logs[record.id].map((log) => (
                          <div key={`l-${log.id}`} className="care-log-item">
                            <strong>{log.log_type || "Log"}</strong>
                            <p>{log.notes || "No details."}</p>
                          </div>
                        ))}
                      </>
                    )}
                    {(notes[record.id] || []).length === 0 && (logs[record.id] || []).length === 0 && (
                      <div className="care-log-item">
                        <p style={{ color: "var(--color-muted)" }}>No notes or logs available for this record.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <PaymentUploadModal
        open={uploadModal.open}
        onClose={() => setUploadModal({ open: false, endpoint: "", title: "" })}
        onSuccess={load}
        endpoint={uploadModal.endpoint}
        title={uploadModal.title}
      />
    </section>
  );
};

export default CustomerMedicalConfinements;
