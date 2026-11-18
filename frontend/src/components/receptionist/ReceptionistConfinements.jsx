import React, { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../api/client";
import StatusBadge from "../shared/StatusBadge";
import { showConfirm } from "../../utils/alert";
import { formatCurrency } from "../../utils/currency";
import "./ReceptionistConfinements.css";

const STATUS = {
  recommended: ["Recommended", "info"],
  consented: ["Consented", "info"],
  bed_assigned: ["Bed assigned", "primary"],
  approved_for_admission: ["Bed assigned", "primary"],
  admitted: ["Admitted", "success"],
  under_care: ["Under care", "success"],
  under_observation: ["Under observation", "success"],
  under_treatment: ["Under treatment", "success"],
  ready_for_discharge: ["Ready for release", "warning"],
  discharged: ["Discharged", "neutral"],
  completed: ["Discharged", "neutral"],
  transferred: ["Transferred", "neutral"],
  deceased: ["Deceased", "danger"],
  cancelled: ["Cancelled", "danger"],
};

const PAYMENT = {
  paid: ["Paid", "success"],
  pending: ["Verification pending", "info"],
  rejected: ["Proof rejected", "danger"],
  unpaid: ["Unpaid", "warning"],
};

const PRE_ADMISSION = ["recommended", "consented", "bed_assigned", "approved_for_admission"];
const IN_CARE = ["admitted", "under_care", "under_observation", "under_treatment"];
const CLOSED = ["discharged", "completed", "transferred", "deceased", "cancelled"];

const FILTERS = [
  { key: "active", label: "Active" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

const bedText = (bed) =>
  `${bed.name} · ${bed.ward}${bed.is_isolation ? " · isolation" : ""} · ${formatCurrency(bed.daily_rate)}/day`;

const ReceptionistConfinements = () => {
  const [records, setRecords] = useState([]);
  const [beds, setBeds] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [filter, setFilter] = useState("active");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    const [confinements, bedData] = await Promise.all([
      apiRequest("/receptionist/medical-confinements"),
      apiRequest("/receptionist/ward-beds?all=1"),
    ]);
    setRecords(Array.isArray(confinements?.medical_confinements) ? confinements.medical_confinements : []);
    setBeds(Array.isArray(bedData?.ward_beds) ? bedData.ward_beds : []);
  };

  useEffect(() => {
    load().catch((err) => setError(err.message || "Failed to load medical confinements."));
  }, []);

  const run = async (key, url, body, ok) => {
    setBusy(key);
    setError("");
    setMessage("");
    try {
      await apiRequest(url, { method: "POST", body: body ? JSON.stringify(body) : undefined });
      await load();
      setMessage(ok);
    } catch (err) {
      setError(err.message || "Action failed.");
    } finally {
      setBusy("");
    }
  };

  const setDraft = (id, patch) => setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const cancelConfinement = async (record) => {
    const confirmed = await showConfirm(
      `Cancel the confinement for ${record.pet?.name || record.pet_name}? Any assigned ward bed will be released.`,
      "Cancel confinement",
      "Yes, cancel",
      "Keep",
      "question",
      true
    );
    if (confirmed) run(`cancel-${record.id}`, `/receptionist/medical-confinements/${record.id}/cancel`, null, "Confinement cancelled.");
  };

  const counts = useMemo(() => ({
    needsBed: records.filter((r) => ["recommended", "consented"].includes(r.status)).length,
    readyToAdmit: records.filter((r) => ["bed_assigned", "approved_for_admission"].includes(r.status)).length,
    inCare: records.filter((r) => IN_CARE.includes(r.status)).length,
    readyToRelease: records.filter((r) => r.status === "ready_for_discharge").length,
  }), [records]);

  const visible = records.filter((r) => {
    if (filter === "active") return !CLOSED.includes(r.status);
    if (filter === "closed") return CLOSED.includes(r.status);
    return true;
  });

  const bedLabel = (record) => {
    if (record.ward_bed) return `${record.ward_bed.name} · ${record.ward_bed.ward}`;
    return record.room?.name || record.room?.room_number || "No bed recorded";
  };

  const renderActions = (record) => {
    const draft = drafts[record.id] || {};
    const selectedBed = draft.ward_bed_id ?? String(record.ward_bed_id ?? "");
    const bedOptions = beds.filter((b) => b.status === "available" || b.id === record.ward_bed_id);
    const bedChanged = selectedBed && Number(selectedBed) !== record.ward_bed_id;

    if (PRE_ADMISSION.includes(record.status)) {
      return (
        <div className="rcf-actions">
          <select
            aria-label="Ward bed"
            className="rcf-select"
            value={selectedBed}
            onChange={(e) => setDraft(record.id, { ward_bed_id: e.target.value })}
          >
            <option value="">Choose a ward bed</option>
            {bedOptions.map((bed) => (
              <option key={bed.id} value={bed.id}>{bedText(bed)}</option>
            ))}
          </select>
          <button
            type="button"
            className="rcf-btn rcf-btn--ghost"
            disabled={!bedChanged || busy === `bed-${record.id}`}
            onClick={() => run(`bed-${record.id}`, `/receptionist/medical-confinements/${record.id}/assign-bed`, { ward_bed_id: Number(selectedBed) }, "Ward bed assigned.")}
          >
            {record.ward_bed_id ? "Change bed" : "Assign bed"}
          </button>
          <button
            type="button"
            className="rcf-btn rcf-btn--primary"
            disabled={!record.ward_bed_id || busy === `admit-${record.id}`}
            title={record.ward_bed_id ? "Admit to the assigned bed" : "Assign a ward bed first"}
            onClick={() => run(`admit-${record.id}`, `/receptionist/medical-confinements/${record.id}/admit`, null, "Pet admitted.")}
          >
            Admit
          </button>
          <button
            type="button"
            className="rcf-btn rcf-btn--danger-ghost"
            disabled={busy === `cancel-${record.id}`}
            onClick={() => cancelConfinement(record)}
          >
            Cancel
          </button>
        </div>
      );
    }

    if (IN_CARE.includes(record.status)) {
      return (
        <div className="rcf-actions">
          <button
            type="button"
            className="rcf-btn rcf-btn--ghost"
            disabled={busy === `care-${record.id}`}
            onClick={() => run(`care-${record.id}`, `/receptionist/medical-confinements/${record.id}/care-logs`, { log_type: "general_update", notes: "Routine care update recorded by receptionist." }, "Care log added.")}
          >
            Add care log
          </button>
        </div>
      );
    }

    if (record.status === "ready_for_discharge") {
      const paid = record.payment_status === "paid";
      return (
        <div className="rcf-actions">
          <button
            type="button"
            className="rcf-btn rcf-btn--primary"
            disabled={!paid || busy === `release-${record.id}`}
            title={paid ? "Release the pet" : "The cashier must verify payment before release"}
            onClick={() => run(`release-${record.id}`, `/receptionist/medical-confinements/${record.id}/release`, null, "Pet released.")}
          >
            Release
          </button>
          {!paid && <span className="rcf-hint">Waiting for payment verification</span>}
        </div>
      );
    }

    return <span className="rcf-hint">No action</span>;
  };

  return (
    <section className="rcf-page">
      <header className="rcf-header">
        <h1>Medical Confinement Admissions</h1>
        <p>Assign ward beds, admit consented patients, and release after vet clearance and payment.</p>
      </header>

      {error && <div className="rcf-banner rcf-banner--error" role="alert">{error}</div>}
      {message && <div className="rcf-banner rcf-banner--success" role="status">{message}</div>}

      <div className="rcf-summary">
        <div className="rcf-stat"><span>{counts.needsBed}</span><small>Needs a bed</small></div>
        <div className="rcf-stat"><span>{counts.readyToAdmit}</span><small>Ready to admit</small></div>
        <div className="rcf-stat"><span>{counts.inCare}</span><small>In care</small></div>
        <div className="rcf-stat"><span>{counts.readyToRelease}</span><small>Ready to release</small></div>
      </div>

      <div className="rcf-toolbar">
        <div className="rcf-tabs" role="tablist">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              className={`rcf-tab ${filter === f.key ? "rcf-tab--active" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rcf-card">
        <div className="rcf-table-scroll">
          <table className="rcf-table">
            <thead>
              <tr>
                <th>Pet &amp; owner</th>
                <th>Diagnosis</th>
                <th>Status</th>
                <th>Payment</th>
                <th>Ward bed</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((record) => {
                const [statusLabel, statusVariant] = STATUS[record.status] || [record.status, "neutral"];
                const [payLabel, payVariant] = PAYMENT[record.payment_status] || [record.payment_status, "neutral"];
                return (
                  <tr key={record.id}>
                    <td>
                      <div className="rcf-pet">{record.pet?.name || record.pet_name}</div>
                      <div className="rcf-muted">{record.customer?.name || record.customer_name}</div>
                    </td>
                    <td>{record.diagnosis || "—"}</td>
                    <td><StatusBadge variant={statusVariant}>{statusLabel}</StatusBadge></td>
                    <td><StatusBadge variant={payVariant}>{payLabel}</StatusBadge></td>
                    <td>{bedLabel(record)}</td>
                    <td>{renderActions(record)}</td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan="6" className="rcf-empty">
                    {filter === "closed" ? "No closed confinements." : "No active confinements right now."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};

export default ReceptionistConfinements;
