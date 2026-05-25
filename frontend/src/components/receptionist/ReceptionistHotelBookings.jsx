import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarAlt,
  faCheckCircle,
  faClipboardList,
  faClock,
  faDoorOpen,
  faDownload,
  faEye,
  faFilter,
  faHotel,
  faInfoCircle,
  faMoneyBillWave,
  faPaw,
  faRefresh,
  faSearch,
  faSpinner,
  faTimes,
  faTimesCircle,
} from "@fortawesome/free-solid-svg-icons";
import "./ReceptionistHotelBookings.css";
import { apiRequest, getAuthenticatedFileUrl } from "../../api/client";
import DatePickerInput from "../../components/shared/DatePickerInput";
import PetAvatar from "../shared/PetAvatar";
import {
  normalizeList,
  normalizeStatus,
  normalizePaymentStatus,
  formatStatus,
  formatDate,
  formatDateTime,
  formatCurrency,
  getDateValue,
  getPetName,
  getCustomerName,
  getCustomerPhone,
  getRoomName,
} from "../../utils/apiNormalize";

const STATUS_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "scheduled", label: "Scheduled" },
  { value: "checked_in", label: "Checked In" },
  { value: "in_care", label: "In Care" },
  { value: "ready_for_pickup", label: "Ready for Pickup" },
  { value: "completed", label: "Completed" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

const PAYMENT_OPTIONS = [
  { value: "all", label: "All Payments" },
  { value: "unpaid", label: "Unpaid" },
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
  { value: "partial", label: "Partial" },
  { value: "rejected", label: "Rejected" },
];

const CARE_LOG_TYPES = [
  { value: "feeding", label: "Feeding" },
  { value: "water", label: "Water" },
  { value: "walk", label: "Walk" },
  { value: "playtime", label: "Playtime" },
  { value: "medication", label: "Medication" },
  { value: "cleaning", label: "Cleaning" },
  { value: "behavior", label: "Behavior" },
  { value: "health_observation", label: "Health Observation" },
  { value: "general_update", label: "General Update" },
];

const getRoomOptionName = (room) =>
  room.name || room.room_number || room.room_name || `Room #${room.id}`;

const ReceptionistHotelBookings = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPayment, setFilterPayment] = useState("all");

  const [selectedBooking, setSelectedBooking] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [rooms, setRooms] = useState([]);

  const [processingId, setProcessingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  const [scheduleDraft, setScheduleDraft] = useState({});
  const [careDraft, setCareDraft] = useState({
    log_type: "general_update",
    notes: "",
  });

  const showMessage = (type, message) => {
    if (type === "success") {
      setSuccessMessage(message);
      window.clearTimeout(window.hotelSuccessTimer);
      window.hotelSuccessTimer = window.setTimeout(() => setSuccessMessage(""), 3000);
      return;
    }

    setError(message);
    window.clearTimeout(window.hotelErrorTimer);
    window.hotelErrorTimer = window.setTimeout(() => setError(""), 5000);
  };

  const fetchBookings = useCallback(async ({ silent = false } = {}) => {
    try {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      const data = await apiRequest("/receptionist/boarding-requests");
      const list = normalizeList(data, ["boarding_requests", "boardings", "requests"]);

      setBookings(
        list.map((item) => ({
          ...item,
          status: normalizeStatus(item.status),
          payment_status: normalizePaymentStatus(item.payment_status),
        }))
      );

      setLastUpdated(new Date().toLocaleString("en-PH"));
    } catch (err) {
      showMessage("error", err.message || "Failed to load boarding requests.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchRooms = useCallback(async () => {
    try {
      const data = await apiRequest("/receptionist/boarding-rooms");
      setRooms(normalizeList(data, ["rooms", "hotel_rooms", "available_rooms"]));
    } catch (err) {
      setRooms([]);
    }
  }, []);

  useEffect(() => {
    fetchBookings();
    fetchRooms();

    const intervalId = setInterval(() => {
      fetchBookings({ silent: true });
      fetchRooms();
    }, 30000);

    return () => clearInterval(intervalId);
  }, [fetchBookings, fetchRooms]);

  const stats = useMemo(
    () => ({
      total: bookings.length,
      pending: bookings.filter((item) => normalizeStatus(item.status) === "pending").length,
      scheduled: bookings.filter((item) =>
        ["approved", "scheduled"].includes(normalizeStatus(item.status))
      ).length,
      active: bookings.filter((item) =>
        ["checked_in", "in_care"].includes(normalizeStatus(item.status))
      ).length,
      ready: bookings.filter((item) => normalizeStatus(item.status) === "ready_for_pickup")
        .length,
      completed: bookings.filter((item) => normalizeStatus(item.status) === "completed")
        .length,
    }),
    [bookings]
  );

  const filteredBookings = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    return bookings.filter((booking) => {
      const status = normalizeStatus(booking.status);
      const paymentStatus = normalizePaymentStatus(booking.payment_status);

      const haystack = [
        booking.id,
        getPetName(booking),
        getCustomerName(booking),
        getCustomerPhone(booking),
        booking.customer_email,
        getRoomName(booking),
        booking.special_requests,
        booking.feeding_instructions,
        booking.notes,
        status,
        paymentStatus,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !keyword || haystack.includes(keyword);
      const matchesStatus = filterStatus === "all" || status === filterStatus;
      const matchesPayment = filterPayment === "all" || paymentStatus === filterPayment;

      return matchesSearch && matchesStatus && matchesPayment;
    });
  }, [bookings, searchTerm, filterStatus, filterPayment]);

  const runAction = async (booking, endpoint, message, body = null, method = "POST") => {
    try {
      setProcessingId(booking.id);
      setError("");

      await apiRequest(endpoint, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      showMessage("success", message);
      await fetchBookings({ silent: true });
      await fetchRooms();
    } catch (err) {
      // Handle specific double booking conflict errors
      if (err.message?.includes('already booked for selected date range')) {
        showMessage("error", "This room/kennel is already booked for the selected date range.");
      } else {
        showMessage("error", err.message || "Action failed.");
      }
    } finally {
      setProcessingId(null);
    }
  };

  const updateScheduleDraft = (bookingId, field, value) => {
    setScheduleDraft((prev) => ({
      ...prev,
      [bookingId]: {
        ...(prev[bookingId] || {}),
        [field]: value,
      },
    }));
  };

  const scheduleBooking = async (booking) => {
    const draft = scheduleDraft[booking.id] || {};

    if (!draft.hotel_room_id) {
      showMessage("error", "Select a room before scheduling.");
      return;
    }

    await runAction(
      booking,
      `/receptionist/boarding-requests/${booking.id}/schedule`,
      "Boarding scheduled successfully.",
      {
        hotel_room_id: draft.hotel_room_id,
        check_in: draft.check_in || getDateValue(booking.check_in),
        check_out: draft.check_out || getDateValue(booking.check_out),
        check_in_time: draft.check_in_time || booking.check_in_time || "09:00",
        check_out_time: draft.check_out_time || booking.check_out_time || "17:00",
        total_amount: draft.total_amount || booking.total_amount || booking.amount || 0,
      }
    );
  };

  const addCareLog = async (booking) => {
    if (!careDraft.notes.trim()) {
      showMessage("error", "Care log notes are required.");
      return;
    }

    await runAction(
      booking,
      `/receptionist/boarding-requests/${booking.id}/care-logs`,
      "Care log added successfully.",
      careDraft
    );

    setCareDraft({ log_type: "general_update", notes: "" });
  };

  const clearFilters = () => {
    setSearchTerm("");
    setFilterStatus("all");
    setFilterPayment("all");
  };

  const exportCSV = () => {
    if (filteredBookings.length === 0) {
      showMessage("error", "No hotel boarding records to export.");
      return;
    }

    const headers = [
      "ID",
      "Pet",
      "Customer",
      "Phone",
      "Check In",
      "Check Out",
      "Room",
      "Payment",
      "Status",
      "Amount",
    ];

    const rows = filteredBookings.map((booking) => [
      booking.id,
      getPetName(booking),
      getCustomerName(booking),
      getCustomerPhone(booking),
      getDateValue(booking.check_in),
      getDateValue(booking.check_out),
      getRoomName(booking),
      normalizePaymentStatus(booking.payment_status),
      normalizeStatus(booking.status),
      booking.total_amount || booking.amount || 0,
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `hotel-boarding-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();

    URL.revokeObjectURL(url);
    showMessage("success", "Hotel boarding records exported.");
  };

  const getStatusClass = (status) => {
    const value = normalizeStatus(status);

    if (["approved", "scheduled", "completed"].includes(value)) return "success";
    if (["pending", "checked_in", "in_care", "ready_for_pickup"].includes(value)) {
      return "warning";
    }
    if (["rejected", "cancelled"].includes(value)) return "danger";

    return "secondary";
  };

  const getStatusIcon = (status) => {
    const value = normalizeStatus(status);

    if (["approved", "scheduled", "completed"].includes(value)) return faCheckCircle;
    if (["rejected", "cancelled"].includes(value)) return faTimesCircle;

    return faClock;
  };

  const getPaymentClass = (status) => {
    const value = normalizePaymentStatus(status);

    if (value === "paid") return "paid";
    if (value === "partial") return "partial";
    if (value === "pending") return "pending";
    if (value === "rejected") return "rejected";

    return "unpaid";
  };

  const isProcessing = (booking) => processingId === booking.id;

  return (
    <div className="hotel-bookings">
      {error && (
        <div className="hotel-toast error">
          <FontAwesomeIcon icon={faTimesCircle} />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="hotel-toast success">
          <FontAwesomeIcon icon={faCheckCircle} />
          <span>{successMessage}</span>
        </div>
      )}

      <section className="hotel-hero">
        <div>
          <span className="hotel-eyebrow">
            <FontAwesomeIcon icon={faHotel} />
            Receptionist Hotel Operations
          </span>

          <h1>Hotel Boarding Management</h1>

          <p>
            Approve boarding requests, assign rooms, check pets in, add care logs,
            prepare pickup, and complete hotel stay workflows.
          </p>

          <small>Last updated: {lastUpdated || "Not refreshed yet"}</small>
        </div>

        <div className="hotel-hero-actions">
          <button
            type="button"
            className={`secondary-btn ${refreshing ? "loading" : ""}`}
            onClick={() => {
              fetchBookings({ silent: true });
              fetchRooms();
            }}
            disabled={refreshing}
          >
            <FontAwesomeIcon icon={refreshing ? faSpinner : faRefresh} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>

          <button type="button" className="secondary-btn" onClick={exportCSV}>
            <FontAwesomeIcon icon={faDownload} />
            Export CSV
          </button>
        </div>
      </section>

      <section className="hotel-summary-grid">
        <button type="button" className="hotel-summary-card" onClick={() => setFilterStatus("all")}>
          <span>
            <FontAwesomeIcon icon={faHotel} />
          </span>
          <div>
            <strong>{stats.total}</strong>
            <p>Total Requests</p>
          </div>
        </button>

        <button type="button" className="hotel-summary-card warning" onClick={() => setFilterStatus("pending")}>
          <span>
            <FontAwesomeIcon icon={faClock} />
          </span>
          <div>
            <strong>{stats.pending}</strong>
            <p>Pending</p>
          </div>
        </button>

        <button type="button" className="hotel-summary-card info" onClick={() => setFilterStatus("scheduled")}>
          <span>
            <FontAwesomeIcon icon={faCalendarAlt} />
          </span>
          <div>
            <strong>{stats.scheduled}</strong>
            <p>Approved / Scheduled</p>
          </div>
        </button>

        <button type="button" className="hotel-summary-card active" onClick={() => setFilterStatus("in_care")}>
          <span>
            <FontAwesomeIcon icon={faDoorOpen} />
          </span>
          <div>
            <strong>{stats.active}</strong>
            <p>In Care</p>
          </div>
        </button>

        <button type="button" className="hotel-summary-card success" onClick={() => setFilterStatus("completed")}>
          <span>
            <FontAwesomeIcon icon={faCheckCircle} />
          </span>
          <div>
            <strong>{stats.completed}</strong>
            <p>Completed</p>
          </div>
        </button>
      </section>

      <section className="hotel-controls">
        <div className="hotel-search-box">
          <FontAwesomeIcon icon={faSearch} />
          <input
            type="text"
            placeholder="Search pet, customer, room, phone, notes..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />

          {searchTerm && (
            <button type="button" onClick={() => setSearchTerm("")}>
              <FontAwesomeIcon icon={faTimes} />
            </button>
          )}
        </div>

        <label className="hotel-filter-box">
          <FontAwesomeIcon icon={faFilter} />
          <select
            value={filterStatus}
            onChange={(event) => setFilterStatus(event.target.value)}
          >
            {STATUS_OPTIONS.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="hotel-filter-box">
          <FontAwesomeIcon icon={faMoneyBillWave} />
          <select
            value={filterPayment}
            onChange={(event) => setFilterPayment(event.target.value)}
          >
            {PAYMENT_OPTIONS.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <button type="button" className="clear-btn" onClick={clearFilters}>
          <FontAwesomeIcon icon={faTimes} />
          Clear
        </button>
      </section>

      <section className="hotel-table-card">
        <div className="hotel-table-header">
          <div>
            <span className="hotel-eyebrow">
              <FontAwesomeIcon icon={faClipboardList} />
              Live Boarding Queue
            </span>
            <h2>Hotel Boarding Requests</h2>
            <p>
              Showing <strong>{filteredBookings.length}</strong> of{" "}
              <strong>{bookings.length}</strong> record(s).
            </p>
          </div>
        </div>

        {loading ? (
          <div className="hotel-state">
            <FontAwesomeIcon icon={faSpinner} spin />
            <h3>Loading hotel boarding requests...</h3>
            <p>Please wait while the system loads live boarding data.</p>
          </div>
        ) : (
          <div className="hotel-table-scroll">
            <table className="bookings-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Pet</th>
                  <th>Customer</th>
                  <th>Stay</th>
                  <th>Room</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredBookings.length === 0 && (
                  <tr>
                    <td colSpan="8">
                      <div className="hotel-empty-state">
                        <FontAwesomeIcon icon={faSearch} />
                        <h3>No hotel boarding records found</h3>
                        <p>Try adjusting the search keyword, status, or payment filter.</p>
                      </div>
                    </td>
                  </tr>
                )}

                {filteredBookings.map((booking) => {
                  const status = normalizeStatus(booking.status);
                  const paymentStatus = normalizePaymentStatus(booking.payment_status);

                  return (
                    <tr key={booking.id} className="booking-row">
                      <td className="booking-id">
                        <span className="id-badge">#{booking.id}</span>
                      </td>

                      <td className="pet-info">
                        <div className="pet-details">
                          <PetAvatar pet={booking.pet} size={40} className="pet-avatar" />
                          <div>
                            <span className="pet-name">{getPetName(booking)}</span>
                            <small>
                              {booking.pet?.species ||
                                booking.pet_species ||
                                booking.pet_type ||
                                "Pet"}
                            </small>
                          </div>
                        </div>
                      </td>

                      <td className="customer">
                        <strong>{getCustomerName(booking)}</strong>
                        <small>{getCustomerPhone(booking)}</small>
                      </td>

                      <td className="date">
                        <FontAwesomeIcon icon={faCalendarAlt} />
                        <span>
                          {formatDate(booking.check_in)} to {formatDate(booking.check_out)}
                        </span>
                      </td>

                      <td className="room">
                        <span>{getRoomName(booking)}</span>
                      </td>

                      <td className="payment">
                        <span className={`payment-badge ${getPaymentClass(paymentStatus)}`}>
                          {formatStatus(paymentStatus)}
                        </span>
                      </td>

                      <td className="status">
                        <span className={`status-badge ${getStatusClass(status)}`}>
                          <FontAwesomeIcon icon={getStatusIcon(status)} />
                          {formatStatus(status)}
                        </span>
                      </td>

                      <td className="actions">
                        <button
                          type="button"
                          className="action-btn view-btn"
                          onClick={() => setSelectedBooking(booking)}
                          title="View / Manage"
                        >
                          <FontAwesomeIcon icon={faEye} />
                        </button>

                        {status === "pending" && (
                          <>
                            <button
                              type="button"
                              className="action-btn approve-btn"
                              onClick={() =>
                                runAction(
                                  booking,
                                  `/receptionist/boarding-requests/${booking.id}/approve`,
                                  "Boarding approved."
                                )
                              }
                              disabled={isProcessing(booking)}
                              title="Approve"
                            >
                              <FontAwesomeIcon
                                icon={isProcessing(booking) ? faSpinner : faCheckCircle}
                                spin={isProcessing(booking)}
                              />
                            </button>

                            <button
                              type="button"
                              className="action-btn reject-btn"
                              onClick={() =>
                                runAction(
                                  booking,
                                  `/receptionist/boarding-requests/${booking.id}/reject`,
                                  "Boarding rejected."
                                )
                              }
                              disabled={isProcessing(booking)}
                              title="Reject"
                            >
                              <FontAwesomeIcon icon={faTimesCircle} />
                            </button>
                          </>
                        )}

                        {["approved", "scheduled"].includes(status) && (
                          <button
                            type="button"
                            className="action-btn check-btn"
                            onClick={() =>
                              runAction(
                                booking,
                                `/receptionist/boarding-requests/${booking.id}/check-in`,
                                "Pet checked in."
                              )
                            }
                            disabled={isProcessing(booking)}
                            title="Check In"
                          >
                            <FontAwesomeIcon icon={faDoorOpen} />
                          </button>
                        )}

                        {["checked_in", "in_care"].includes(status) && (
                          <button
                            type="button"
                            className="action-btn approve-btn"
                            onClick={() =>
                              runAction(
                                booking,
                                `/receptionist/boarding-requests/${booking.id}/ready-for-pickup`,
                                "Pet marked ready for pickup."
                              )
                            }
                            disabled={isProcessing(booking)}
                            title="Ready for Pickup"
                          >
                            <FontAwesomeIcon icon={faCheckCircle} />
                          </button>
                        )}

                        {status === "ready_for_pickup" && (
                          <button
                            type="button"
                            className="action-btn check-btn"
                            onClick={() =>
                              runAction(
                                booking,
                                `/receptionist/boarding-requests/${booking.id}/check-out`,
                                "Pet checked out."
                              )
                            }
                            disabled={isProcessing(booking)}
                            title="Check Out"
                          >
                            <FontAwesomeIcon icon={faDoorOpen} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedBooking && (
        <div className="booking-modal-overlay" onClick={() => setSelectedBooking(null)}>
          <div className="booking-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="hotel-eyebrow">
                  <FontAwesomeIcon icon={faInfoCircle} />
                  Boarding Details
                </span>
                <h2>Boarding #{selectedBooking.id}</h2>
              </div>

              <button
                type="button"
                className="close-btn"
                onClick={() => setSelectedBooking(null)}
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            <div className="modal-content">
              <div className="info-grid">
                <InfoItem label="Pet" value={getPetName(selectedBooking)} />
                <InfoItem label="Customer" value={getCustomerName(selectedBooking)} />
                <InfoItem label="Phone" value={getCustomerPhone(selectedBooking)} />
                <InfoItem label="Room" value={getRoomName(selectedBooking)} />
                <InfoItem label="Check In" value={formatDate(selectedBooking.check_in)} />
                <InfoItem label="Check Out" value={formatDate(selectedBooking.check_out)} />
                <InfoItem
                  label="Payment"
                  value={formatStatus(normalizePaymentStatus(selectedBooking.payment_status))}
                />
                <InfoItem
                  label="Status"
                  value={formatStatus(normalizeStatus(selectedBooking.status))}
                />
                <InfoItem
                  label="Amount"
                  value={formatCurrency(
                    selectedBooking.total_amount || selectedBooking.amount || 0
                  )}
                />
                <InfoItem
                  label="Instructions"
                  value={selectedBooking.notes || "None"}
                  wide
                />
                {selectedBooking.vaccination_card && (
                  <div className="info-item wide">
                    <span className="info-label">Vaccination Card</span>
                    <button
                      type="button"
                      className="vaccination-link"
                      onClick={async () => {
                        const win = window.open("", "_blank");
                        if (!win) {
                          alert("Popup blocked. Please allow popups for this site.");
                          return;
                        }
                        try {
                          const url = await getAuthenticatedFileUrl(
                            selectedBooking.vaccination_card_url || `/files/vaccination-cards/${selectedBooking.id}/view`
                          );
                          win.location.href = url;
                        } catch (err) {
                          win.close();
                          console.error("Vaccination card open error:", err);
                          alert(err.message || "Failed to open vaccination card.");
                        }
                      }}
                    >
                      <FontAwesomeIcon icon={faEye} /> View Vaccination Card
                    </button>
                  </div>
                )}
              </div>

              {["pending", "approved"].includes(normalizeStatus(selectedBooking.status)) && (
                <div className="booking-form">
                  <div className="form-title">
                    <h3>Schedule / Assign Room</h3>
                    <p>Select an available room and finalize the stay details.</p>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Room / Kennel</label>
                      <select
                        value={scheduleDraft[selectedBooking.id]?.hotel_room_id || ""}
                        onChange={(event) =>
                          updateScheduleDraft(
                            selectedBooking.id,
                            "hotel_room_id",
                            event.target.value
                          )
                        }
                      >
                        <option value="">Select room</option>
                        {rooms.map((room) => (
                          <option key={room.id} value={room.id}>
                            {getRoomOptionName(room)} ({room.status || "available"})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Total Amount</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={scheduleDraft[selectedBooking.id]?.total_amount || ""}
                        onChange={(event) =>
                          updateScheduleDraft(
                            selectedBooking.id,
                            "total_amount",
                            event.target.value
                          )
                        }
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Check In Date</label>
                      <DatePickerInput
                        selected={(() => {
                          const val = scheduleDraft[selectedBooking.id]?.check_in || getDateValue(selectedBooking.check_in);
                          return val ? new Date(val) : null;
                        })()}
                        onChange={(date) =>
                          updateScheduleDraft(selectedBooking.id, "check_in", date ? date.toISOString().split("T")[0] : "")
                        }
                        placeholderText="Pick check-in..."
                      />
                    </div>

                    <div className="form-group">
                      <label>Check Out Date</label>
                      <DatePickerInput
                        selected={(() => {
                          const val = scheduleDraft[selectedBooking.id]?.check_out || getDateValue(selectedBooking.check_out);
                          return val ? new Date(val) : null;
                        })()}
                        onChange={(date) =>
                          updateScheduleDraft(selectedBooking.id, "check_out", date ? date.toISOString().split("T")[0] : "")
                        }
                        placeholderText="Pick check-out..."
                      />
                    </div>
                  </div>

                  <div className="form-actions">
                    <button
                      type="button"
                      className="submit-btn"
                      onClick={() => scheduleBooking(selectedBooking)}
                      disabled={isProcessing(selectedBooking)}
                    >
                      {isProcessing(selectedBooking) && (
                        <FontAwesomeIcon icon={faSpinner} spin />
                      )}
                      Schedule Boarding
                    </button>
                  </div>
                </div>
              )}

              {["checked_in", "in_care"].includes(normalizeStatus(selectedBooking.status)) && (
                <div className="booking-form">
                  <div className="form-title">
                    <h3>Add Care Log</h3>
                    <p>Record feeding, cleaning, walking, medication, or care updates.</p>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Care Log Type</label>
                      <select
                        value={careDraft.log_type}
                        onChange={(event) =>
                          setCareDraft((prev) => ({
                            ...prev,
                            log_type: event.target.value,
                          }))
                        }
                      >
                        {CARE_LOG_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group full-width">
                      <label>Notes</label>
                      <textarea
                        rows="4"
                        value={careDraft.notes}
                        onChange={(event) =>
                          setCareDraft((prev) => ({
                            ...prev,
                            notes: event.target.value,
                          }))
                        }
                        placeholder="Write care notes here..."
                      />
                    </div>
                  </div>

                  <div className="form-actions">
                    <button
                      type="button"
                      className="submit-btn"
                      onClick={() => addCareLog(selectedBooking)}
                      disabled={isProcessing(selectedBooking)}
                    >
                      {isProcessing(selectedBooking) && (
                        <FontAwesomeIcon icon={faSpinner} spin />
                      )}
                      Add Care Log
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setSelectedBooking(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const InfoItem = ({ label, value, wide = false }) => (
  <div className={`info-item ${wide ? "full-width" : ""}`}>
    <label>{label}</label>
    <span>{value || "N/A"}</span>
  </div>
);

export default ReceptionistHotelBookings;