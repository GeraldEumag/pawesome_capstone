import React, { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../../api/client";
import Modal from "../shared/Modal";

const time = (value) => value ? String(value).slice(0, 5) : "—";

export default function ManagerAttendanceCorrections() {
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [error, setError] = useState("");
  const [rejecting, setRejecting] = useState(null);
  const [remarks, setRemarks] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiRequest(`/manager/attendance/corrections?status=${status}`);
      setRows(Array.isArray(response?.data?.data) ? response.data.data : []);
    } catch (e) {
      setError(e.message || "Unable to load attendance corrections.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const review = async (row, action, body = {}) => {
    if (activeId !== null) return;
    setActiveId(row.id);
    setError("");
    try {
      await apiRequest(`/manager/attendance/corrections/${row.id}/${action}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setRejecting(null);
      setRemarks("");
      await load();
    } catch (e) {
      setError(e.message || "The correction was not updated.");
      await load();
    } finally {
      setActiveId(null);
    }
  };

  return (
    <main className="manager-attendance-corrections">
      <h1>Attendance Corrections</h1>
      <p>Review employee-submitted punch changes. The server remains authoritative.</p>
      <label>
        Review status{" "}
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="">All</option>
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
      {loading ? <p>Loading corrections…</p> : rows.length === 0 ? <p>No correction requests.</p> : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr>
              <th>Employee</th><th>Date</th><th>Original</th><th>Requested</th>
              <th>Reason</th><th>Status / Review</th><th>Actions</th>
            </tr></thead>
            <tbody>{rows.map((row) => (
              <tr key={row.id}>
                <td>{row.user?.name || "Unknown"}<br /><small>{row.user?.employee_no || `ID ${row.user_id}`}</small></td>
                <td>{String(row.date || "").slice(0, 10)}</td>
                <td>
                  In: {time(row.original_check_in ?? row.attendance?.check_in)}<br />
                  Out: {time(row.original_check_out ?? row.attendance?.check_out)}
                </td>
                <td>In: {time(row.requested_check_in)}<br />Out: {time(row.requested_check_out)}</td>
                <td>{row.reason || "—"}{row.remarks && <p>Review note: {row.remarks}</p>}</td>
                <td>{row.status}<br />
                  {row.reviewer?.name && <small>{row.reviewer.name} · {row.reviewed_at || ""}</small>}
                </td>
                <td>
                  {row.status === "pending" && <>
                    <button disabled={activeId !== null} onClick={() => review(row, "approve")}>
                      {activeId === row.id ? "Saving…" : "Approve"}
                    </button>{" "}
                    <button disabled={activeId !== null} onClick={() => { setRejecting(row); setRemarks(""); }}>
                      Reject
                    </button>
                  </>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <Modal
        isOpen={Boolean(rejecting)}
        title="Reject attendance correction"
        onClose={() => { setRejecting(null); setRemarks(""); }}
        footer={<>
          <button disabled={!remarks.trim() || activeId !== null}
            onClick={() => rejecting && review(rejecting, "reject", { remarks })}>
            Confirm rejection
          </button>
          <button disabled={activeId !== null} onClick={() => setRejecting(null)}>Cancel</button>
        </>}
      >
        <p>{rejecting?.user?.name} · {String(rejecting?.date || "").slice(0, 10)}</p>
        <label>Rejection reason (required)
          <textarea value={remarks} maxLength={500} onChange={(e) => setRemarks(e.target.value)} />
        </label>
      </Modal>
    </main>
  );
}
