import React, { useEffect, useMemo, useState } from "react";
import "./Attendance.css";
import { attendanceApi } from "../../api/attendance";
import DatePickerInput from "../../components/shared/DatePickerInput";
import { showError } from "../../utils/alert.jsx";

const Attendance = () => {
  const [search, setSearch] = useState("");
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  useEffect(() => {
    loadAttendance();
  }, [selectedDate, search]);

  const formatTime = (time) => {
    if (!time) return "-";

    return new Date(`2000-01-01T${time}`).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const transformRecord = (record) => ({
    id: record.id,
    employee: record.user?.name || record.employee_name || "Unknown",
    employeeId: record.user?.id || record.user_id || "-",
    date: record.date || "-",
    checkIn: formatTime(record.check_in),
    checkOut: formatTime(record.check_out),
    status: record.status
      ? record.status.charAt(0).toUpperCase() + record.status.slice(1)
      : "Present",
    rawStatus: record.status || "present",
  });

  const loadAttendance = async () => {
    setLoading(true);

    try {
      const params = { date: selectedDate };
      if (search.trim()) params.search = search.trim();

      const response = await attendanceApi.getAll(params);

      if (response.success) {
        setRecords((response.data || []).map(transformRecord));
      }
    } catch (err) {
      showError(err.message || "Failed to load attendance data.");
    } finally {
      setLoading(false);
    }
  };

  const summary = useMemo(() => {
    const total = records.length;
    const present = records.filter((r) => r.rawStatus === "present").length;
    const working = records.filter((r) => r.rawStatus === "working").length;
    const absent = records.filter((r) => r.rawStatus === "absent").length;

    return { total, present, working, absent };
  }, [records]);

  return (
    <div className="attendance">
      <div className="section-header">
        <div>
          <h2>Attendance Overview</h2>
          <p className="section-subtitle">
            View daily employee attendance, status, and working records (read-only).
          </p>
        </div>

        <div className="actions">
          <DatePickerInput
            selected={selectedDate ? new Date(selectedDate) : null}
            onChange={(date) => setSelectedDate(date ? date.toISOString().split("T")[0] : "")}
            placeholderText="Pick a date..."
          />

          <input
            type="text"
            placeholder="Search employee..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-bar"
          />
        </div>
      </div>

      <div className="attendance-summary">
        <div className="summary-card">
          <span>Total Records</span>
          <strong>{summary.total}</strong>
        </div>

        <div className="summary-card present-card">
          <span>Present</span>
          <strong>{summary.present}</strong>
        </div>

        <div className="summary-card working-card">
          <span>Working</span>
          <strong>{summary.working}</strong>
        </div>

        <div className="summary-card absent-card">
          <span>Absent</span>
          <strong>{summary.absent}</strong>
        </div>
      </div>

      <div className="attendance-chart">
        <h3>Today's Attendance Overview</h3>

        <div className="chart-bars">
          <div>
            <span>Present</span>
            <div className="bar">
              <div
                className="bar-fill present-fill"
                style={{
                  width: summary.total
                    ? `${(summary.present / summary.total) * 100}%`
                    : "0%",
                }}
              />
            </div>
          </div>

          <div>
            <span>Working</span>
            <div className="bar">
              <div
                className="bar-fill working-fill"
                style={{
                  width: summary.total
                    ? `${(summary.working / summary.total) * 100}%`
                    : "0%",
                }}
              />
            </div>
          </div>

          <div>
            <span>Absent</span>
            <div className="bar">
              <div
                className="bar-fill absent-fill"
                style={{
                  width: summary.total
                    ? `${(summary.absent / summary.total) * 100}%`
                    : "0%",
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading attendance data...</div>
      ) : (
        <div className="attendance-table-wrap">
          <table className="attendance-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>User ID</th>
                <th>Date</th>
                <th>Check In</th>
                <th>Check Out</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {records.length > 0 ? (
                records.map((rec) => (
                  <tr key={rec.id}>
                    <td>{rec.employee}</td>
                    <td>{rec.employeeId}</td>
                    <td>{rec.date}</td>
                    <td>{rec.checkIn}</td>
                    <td>{rec.checkOut}</td>
                    <td>
                      <span className={`status ${rec.rawStatus}`}>
                        {rec.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="empty-table">
                    No attendance records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Attendance;
