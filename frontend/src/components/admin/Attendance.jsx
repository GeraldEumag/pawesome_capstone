import React, { useEffect, useMemo, useState } from "react";
import "./Attendance.css";
import { attendanceApi } from "../../api/attendance";
import { apiRequest } from "../../api/client";
import { showAlert, showError } from "../../utils/alert";

const Attendance = () => {
  const [search, setSearch] = useState("");
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    user_id: "",
    date: selectedDate,
    check_in: "",
    check_out: "",
    status: "present",
    notes: "",
  });

  useEffect(() => {
    loadAttendance();
  }, [selectedDate, search]);

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    try {
      const data = await apiRequest("/admin/users");

      if (data.success) {
        setEmployees(data.data || []);
      } else {
        setEmployees(data.users || data.data || data || []);
      }
    } catch (err) {
      setEmployees([]);
    }
  };

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

  const openModal = () => {
    setFormData({
      user_id: "",
      date: selectedDate,
      check_in: "",
      check_out: "",
      status: "present",
      notes: "",
    });

    setShowModal(true);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSave = async () => {
    if (!formData.user_id) {
      showAlert("Please select an employee.");
      return;
    }

    try {
      const payload = {
        user_id: formData.user_id,
        date: formData.date,
        check_in: formData.check_in || null,
        check_out: formData.check_out || null,
        status: formData.status,
        notes: formData.notes,
      };

      const response = await attendanceApi.create(payload);

      if (response.success) {
        setShowModal(false);
        await loadAttendance();
      }
    } catch (err) {
      showError(err.message || "Failed to save attendance.");
    }
  };

  return (
    <div className="attendance">
      <div className="section-header">
        <div>
          <h2>Attendance Tracking</h2>
          <p className="section-subtitle">
            Monitor daily employee attendance, status, and working records.
          </p>
        </div>

        <div className="actions">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="date-picker"
          />

          <input
            type="text"
            placeholder="Search employee..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-bar"
          />

          <button className="mark-btn" onClick={openModal}>
            + Mark Attendance
          </button>
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
        <h3>Today’s Attendance Overview</h3>

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

      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Mark Attendance</h3>

            <form className="attendance-form">
              <label>
                Employee
                <select
                  name="user_id"
                  value={formData.user_id}
                  onChange={handleChange}
                >
                  <option value="">Select employee</option>

                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.user_id || emp.id}>
                      {emp.name || emp.full_name || emp.employee_name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Date
                <input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleChange}
                />
              </label>

              <label>
                Check In
                <input
                  type="time"
                  name="check_in"
                  value={formData.check_in}
                  onChange={handleChange}
                />
              </label>

              <label>
                Check Out
                <input
                  type="time"
                  name="check_out"
                  value={formData.check_out}
                  onChange={handleChange}
                />
              </label>

              <label>
                Status
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                >
                  <option value="present">Present</option>
                  <option value="working">Working</option>
                  <option value="absent">Absent</option>
                </select>
              </label>

              <label>
                Notes
                <input
                  type="text"
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  placeholder="Optional notes"
                />
              </label>
            </form>

            <div className="modal-actions">
              <button type="button" onClick={() => setShowModal(false)}>
                Cancel
              </button>

              <button type="button" className="confirm-btn" onClick={handleSave}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Attendance;
