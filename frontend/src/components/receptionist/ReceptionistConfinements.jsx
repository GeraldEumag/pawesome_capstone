import React, { useEffect, useState } from "react";
import { apiRequest } from "../../api/client";
import RowActionPopover from "../shared/RowActionPopover";
import "./ReceptionistHotelBookings.css";

const normalizeList = (result, keys = []) => {
  if (Array.isArray(result)) return result;
  for (const key of keys) if (Array.isArray(result?.[key])) return result[key];
  if (Array.isArray(result?.medical_confinements)) return result.medical_confinements;
  if (Array.isArray(result?.ward_beds)) return result.ward_beds;
  return [];
};

const STATUS_LABELS = {
  recommended: "Recommended",
  consented: "Consented",
  bed_assigned: "Bed Assigned",
  approved_for_admission: "Bed Assigned",
  admitted: "Admitted",
  under_care: "Under Care",
  under_observation: "Under Care",
  under_treatment: "Under Care",
  ready_for_discharge: "Ready for Discharge",
  discharged: "Discharged",
  transferred: "Transferred",
  deceased: "Deceased",
  completed: "Discharged",
  cancelled: "Cancelled",
};

const PRE_ADMISSION = ["recommended", "consented", "bed_assigned", "approved_for_admission"];
const IN_CARE = ["admitted", "under_care", "under_observation", "under_treatment"];

const ReceptionistConfinements = () => {
  const [records, setRecords] = useState([]);
  const [beds, setBeds] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    const [confinements, bedData] = await Promise.all([
      apiRequest("/receptionist/medical-confinements"),
      apiRequest("/receptionist/ward-beds?all=1"),
    ]);
    setRecords(normalizeList(confinements, ["medical_confinements"]));
    setBeds(normalizeList(bedData, ["ward_beds"]));
  };

  useEffect(() => {
    load().catch((err) => setError(err.message || "Failed to load medical confinements."));
  }, []);

  const action = async (record, url, body, ok) => {
    try {
      setError("");
      setMessage("");
      await apiRequest(url, { method: "POST", body: body ? JSON.stringify(body) : undefined });
      setMessage(ok);
      await load();
    } catch (err) {
      setError(err.message || "Action failed.");
    }
  };

  const bedLabel = (record) => {
    if (record.ward_bed) {
      return `${record.ward_bed.name} (${record.ward_bed.ward}${record.ward_bed.is_isolation ? ", isolation" : ""})`;
    }
    return record.room?.name || record.room?.room_number || "Unassigned";
  };

  return (
    <section className="hotel-bookings">
      {error && <div className="alert alert-error" style={{ margin: 20 }}>{error}</div>}
      {message && <div className="alert alert-success" style={{ margin: 20 }}>{message}</div>}
      <div className="bookings-header">
        <div className="header-left">
          <h1>Medical Confinement Admissions</h1>
          <p>Assign ward beds, admit consented patients, and release after vet clearance and payment</p>
        </div>
      </div>

      <div className="hotel-table-card">
        <div className="hotel-table-scroll">
        <table className="bookings-table">
          <thead>
            <tr>
              <th>Pet</th>
              <th>Customer</th>
              <th>Diagnosis</th>
              <th>Status</th>
              <th>Payment</th>
              <th>Ward Bed</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => {
              const draft = drafts[record.id] || {};
              return (
                <tr key={record.id}>
                  <td>{record.pet?.name || record.pet_name}</td>
                  <td>{record.customer?.name || record.customer_name}</td>
                  <td>{record.diagnosis}</td>
                  <td>{STATUS_LABELS[record.status] || record.status}</td>
                  <td>{record.payment_status}</td>
                  <td>{bedLabel(record)}</td>
                  <td className="actions">
                    <RowActionPopover rowLabel={record.pet?.name || record.pet_name || record.id}>
                    {PRE_ADMISSION.includes(record.status) && (
                      <>
                        <select aria-label="Assign ward bed" value={draft.ward_bed_id || ""} onChange={(e) => setDrafts((prev) => ({ ...prev, [record.id]: { ...draft, ward_bed_id: e.target.value } }))}>
                          <option value="">Ward bed</option>
                          {beds.map((bed) => <option key={bed.id} value={bed.id}>{bed.name} — {bed.ward}{bed.is_isolation ? " (isolation)" : ""} ({bed.status})</option>)}
                        </select>
                        <button onClick={() => action(record, `/receptionist/medical-confinements/${record.id}/assign-bed`, { ward_bed_id: draft.ward_bed_id }, "Ward bed assigned.")}>Assign Bed</button>
                        <button onClick={() => action(record, `/receptionist/medical-confinements/${record.id}/admit`, null, "Pet admitted.")}>Admit</button>
                      </>
                    )}
                    {IN_CARE.includes(record.status) && (
                      <button onClick={() => action(record, `/receptionist/medical-confinements/${record.id}/care-logs`, { log_type: "general_update", notes: "Routine care update recorded by receptionist." }, "Care log added.")}>Add Care Log</button>
                    )}
                    {record.status === "ready_for_discharge" && (
                      <>
                        <button onClick={() => action(record, `/receptionist/medical-confinements/${record.id}/release`, null, "Pet released.")}>Release</button>
                        {record.payment_status !== "paid" && (
                          <>
                            <input
                              type="text"
                              aria-label="Manager override reason"
                              placeholder="Override reason (manager only)"
                              value={draft.override_reason || ""}
                              onChange={(e) => setDrafts((prev) => ({ ...prev, [record.id]: { ...draft, override_reason: e.target.value } }))}
                            />
                            <button onClick={() => action(record, `/receptionist/medical-confinements/${record.id}/release`, { override_reason: draft.override_reason }, "Released by manager override.")}>Override Release</button>
                          </>
                        )}
                      </>
                    )}
                    </RowActionPopover>
                  </td>
                </tr>
              );
            })}
            {records.length === 0 && <tr><td colSpan="7">No medical confinement admissions yet.</td></tr>}
          </tbody>
        </table>
        </div>
      </div>
    </section>
  );
};

export default ReceptionistConfinements;
