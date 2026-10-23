import React, { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFileSignature,
  faPlus,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import toast from "react-hot-toast";
import { apiRequest } from "../../api/client";

const CONSENT_TYPES = {
  general_treatment: "General Treatment",
  surgery: "Surgery",
  anesthesia: "Anesthesia",
  confinement: "Confinement",
  euthanasia: "Euthanasia",
  other: "Other",
};

/**
 * Signed treatment consents for the visit. Confinement admission requires a
 * signed 'confinement' consent (emergency visits are exempt).
 */
const VetConsentPanel = ({ appointmentId, disabled }) => {
  const [consents, setConsents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    type: "general_treatment",
    title: "",
    signer_name: "",
    signer_relationship: "owner",
    body: "",
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiRequest(`/veterinary/appointments/${appointmentId}/consents`);
      setConsents(Array.isArray(res?.consents) ? res.consents : []);
    } catch (err) {
      toast.error(err.message || "Failed to load consents.");
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => {
    load();
  }, [load]);

  const record = async () => {
    try {
      setBusy(true);
      if (!form.signer_name.trim() || !form.title.trim()) {
        throw new Error("Signer name and consent title are required.");
      }
      await apiRequest(`/veterinary/consents`, "POST", {
        consentable_type: "appointment",
        consentable_id: Number(appointmentId),
        type: form.type,
        title: form.title.trim(),
        body: form.body || undefined,
        signer_name: form.signer_name.trim(),
        signer_relationship: form.signer_relationship,
      });
      toast.success("Consent recorded.");
      setForm({ type: "general_treatment", title: "", signer_name: "", signer_relationship: "owner", body: "" });
      setShowForm(false);
      await load();
    } catch (err) {
      toast.error(err.message || "Failed to record consent.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="consult-section-card">
      <div className="consult-section-header">
        <div className="consult-section-icon">
          <FontAwesomeIcon icon={faFileSignature} />
        </div>
        <div className="consult-section-title-group">
          <h3>Signed Consents</h3>
          <p>Owner authorizations recorded for this visit</p>
        </div>
        {!disabled && (
          <button
            type="button"
            className="consult-btn consult-btn--secondary consult-btn--sm"
            onClick={() => setShowForm((v) => !v)}
          >
            <FontAwesomeIcon icon={faPlus} /> Record Consent
          </button>
        )}
      </div>

      {showForm && !disabled && (
        <div className="consult-form dx-order-form">
          <div className="dx-order-grid">
            <label className="consult-label">
              Consent Type
              <select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              >
                {Object.entries(CONSENT_TYPES).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="consult-label">
              Title
              <input
                type="text"
                value={form.title}
                placeholder="e.g. Consent to surgery"
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </label>
            <label className="consult-label">
              Signer Name
              <input
                type="text"
                value={form.signer_name}
                placeholder="Owner or authorized representative"
                onChange={(e) => setForm((f) => ({ ...f, signer_name: e.target.value }))}
              />
            </label>
            <label className="consult-label">
              Relationship
              <select
                value={form.signer_relationship}
                onChange={(e) => setForm((f) => ({ ...f, signer_relationship: e.target.value }))}
              >
                <option value="owner">Owner</option>
                <option value="authorized_representative">Authorized representative</option>
                <option value="guardian">Guardian</option>
              </select>
            </label>
          </div>
          <label className="consult-label consult-label--full">
            Consent Text <span className="consult-optional">(Optional)</span>
            <textarea
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              placeholder="The signer authorizes…"
            />
          </label>
          <button
            type="button"
            className="consult-btn consult-btn--primary"
            onClick={record}
            disabled={busy}
          >
            {busy ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faFileSignature} />}
            Record Signed Consent
          </button>
        </div>
      )}

      {loading ? (
        <div className="consult-rx-empty">
          <FontAwesomeIcon icon={faSpinner} spin /> Loading consents…
        </div>
      ) : consents.length === 0 ? (
        <div className="consult-rx-empty">No consents recorded for this visit.</div>
      ) : (
        <ul className="dx-order-list">
          {consents.map((consent) => (
            <li key={consent.id} className="dx-order">
              <div className="dx-order-head">
                <div>
                  <strong>{consent.title}</strong>
                  <small>
                    {CONSENT_TYPES[consent.type] || consent.type} · signed by{" "}
                    {consent.signer_name} ({consent.signer_relationship})
                    {consent.signed_at
                      ? ` · ${new Date(consent.signed_at).toLocaleString()}`
                      : ""}
                  </small>
                </div>
                <span className={`consult-apt-badge ${consent.status === "signed" ? "dx-badge--reviewed" : "dx-badge--cancelled"}`}>
                  {consent.status}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default VetConsentPanel;
