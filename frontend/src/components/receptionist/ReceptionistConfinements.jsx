import React, { useEffect, useState } from "react";
import { apiRequest } from "../../api/client";
import RowActionPopover from "../shared/RowActionPopover";

const normalizeList = (result, keys = []) => {
  if (Array.isArray(result)) return result;
  for (const key of keys) if (Array.isArray(result?.[key])) return result[key];
  if (Array.isArray(result?.medical_confinements)) return result.medical_confinements;
  if (Array.isArray(result?.rooms)) return result.rooms;
  return [];
};

const ReceptionistConfinements = () => {
  const [records, setRecords] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    const [confinements, roomData] = await Promise.all([
      apiRequest("/receptionist/medical-confinements"),
      apiRequest("/receptionist/boarding-rooms"),
    ]);
    setRecords(normalizeList(confinements, ["medical_confinements"]));
    setRooms(normalizeList(roomData, ["rooms", "hotel_rooms"]));
  };

  useEffect(() => {
    load().catch((err) => setError(err.message || "Failed to load medical confinements."));
  }, []);

  const action = async (record, url, body, ok) => {
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
    <section className="hotel-bookings">
      {error && <div className="alert alert-error" style={{ margin: 20 }}>{error}</div>}
      {message && <div className="alert alert-success" style={{ margin: 20 }}>{message}</div>}
      <div className="bookings-header">
        <div className="header-left">
          <h1>Medical Confinement Admissions</h1>
          <p>Assign rooms, admit medically recommended pets, add care logs, and release after vet clearance</p>
        </div>
      </div>

      <div className="bookings-table-container">
        <table className="bookings-table">
          <thead>
            <tr>
              <th>Pet</th>
              <th>Customer</th>
              <th>Diagnosis</th>
              <th>Status</th>
              <th>Payment</th>
              <th>Room</th>
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
                  <td>{record.status}</td>
                  <td>{record.payment_status}</td>
                  <td>{record.room?.name || record.room?.room_number || "Unassigned"}</td>
                  <td className="actions">
                    <RowActionPopover rowLabel={record.pet?.name || record.pet_name || record.id}>
                    {["recommended", "approved_for_admission"].includes(record.status) && (
                      <>
                        <select aria-label="Assign room" value={draft.room_id || ""} onChange={(e) => setDrafts((prev) => ({ ...prev, [record.id]: { ...draft, room_id: e.target.value } }))}>
                          <option value="">Room</option>
                          {rooms.map((room) => <option key={room.id} value={room.id}>{room.name || room.room_number} ({room.status})</option>)}
                        </select>
                        <button onClick={() => action(record, `/receptionist/medical-confinements/${record.id}/assign-room`, { room_id: draft.room_id }, "Room assigned.")}>Assign</button>
                        <button onClick={() => action(record, `/receptionist/medical-confinements/${record.id}/admit`, null, "Pet admitted.")}>Admit</button>
                      </>
                    )}
                    {["admitted", "under_observation", "under_treatment"].includes(record.status) && (
                      <button onClick={() => action(record, `/receptionist/medical-confinements/${record.id}/care-logs`, { log_type: "general_update", notes: "Routine care update recorded by receptionist." }, "Care log added.")}>Add Care Log</button>
                    )}
                    {record.status === "ready_for_discharge" && (
                      <button onClick={() => action(record, `/receptionist/medical-confinements/${record.id}/release`, null, "Pet released.")}>Release</button>
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
    </section>
  );
};

export default ReceptionistConfinements;
