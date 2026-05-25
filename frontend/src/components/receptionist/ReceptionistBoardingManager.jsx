import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSearch,
  faCheckCircle,
  faCalendarAlt,
  faPaw,
  faUser,
  faRefresh,
  faSpinner,
  faHotel,
  faDoorOpen,
  faSignOutAlt,
  faClock,
  faEye,
  faTimes,
  faClipboardList,
  faFilter,
  faBed,
  faPhone,
  faInfoCircle,
} from "@fortawesome/free-solid-svg-icons";
import "./ReceptionistCheckInForm.css";
import { apiRequest, getAuthenticatedFileUrl } from "../../api/client";
import PetAvatar from "../shared/PetAvatar";
import {
  normalizeList,
  normalizeStatus,
  formatStatus,
  formatDate,
  getPetName,
  getPetType,
  getCustomerName,
  getCustomerPhone,
  getCheckInDate,
  getCheckOutDate,
  getRoomName,
  getNotes,
  isHotelRequest,
} from "../../utils/apiNormalize";
import { showConfirm } from "../../utils/alert";

const TABS = [
  { key: "queue", label: "Queue", icon: faClipboardList },
  { key: "inhouse", label: "In-House", icon: faBed },
  { key: "completed", label: "Completed", icon: faCheckCircle },
];

const STATUS_READY_FOR_CHECKIN = ["approved", "scheduled", "confirmed"];

const ReceptionistBoardingManager = () => {
  const [activeTab, setActiveTab] = useState("queue");
  const [bookings, setBookings] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionId, setActionId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [selectedBooking, setSelectedBooking] = useState(null);

  const showMessage = (type, message) => {
    if (type === "success") {
      setSuccess(message);
      window.clearTimeout(window.boardingSuccessTimer);
      window.boardingSuccessTimer = window.setTimeout(() => setSuccess(""), 3000);
      return;
    }
    setError(message);
    window.clearTimeout(window.boardingErrorTimer);
    window.boardingErrorTimer = window.setTimeout(() => setError(""), 5000);
  };

  const loadBookings = useCallback(async ({ silent = false } = {}) => {
    try {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError("");

      const data = await apiRequest("/receptionist/requests");
      const list = normalizeList(data);
      setBookings(list.map((item) => ({ ...item, status: normalizeStatus(item.status) })));
      setLastUpdated(new Date().toLocaleString("en-PH"));
    } catch (err) {
      showMessage("error", err.message || "Failed to load boarding reservations.");
      setBookings([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  const tabBookings = useMemo(() => {
    if (activeTab === "queue") {
      return bookings.filter(
        (item) => isHotelRequest(item) && STATUS_READY_FOR_CHECKIN.includes(item.status)
      );
    }
    if (activeTab === "inhouse") {
      return bookings.filter(
        (item) => isHotelRequest(item) && item.status === "checked_in"
      );
    }
    if (activeTab === "completed") {
      return bookings.filter(
        (item) =>
          isHotelRequest(item) && ["completed", "checked_out"].includes(item.status)
      );
    }
    return [];
  }, [bookings, activeTab]);

  const filteredBookings = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return tabBookings.filter((item) => {
      const searchableText = [
        item.id,
        getPetName(item),
        getPetType(item),
        getCustomerName(item),
        getCustomerPhone(item),
        getRoomName(item),
        getCheckInDate(item),
        getCheckOutDate(item),
        getNotes(item),
        item.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesSearch = !query || searchableText.includes(query);
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [tabBookings, searchQuery, statusFilter]);

  const stats = useMemo(() => {
    const allHotel = bookings.filter(isHotelRequest);
    return {
      queue: allHotel.filter((i) => STATUS_READY_FOR_CHECKIN.includes(i.status)).length,
      inhouse: allHotel.filter((i) => i.status === "checked_in").length,
      completed: allHotel.filter((i) => ["completed", "checked_out"].includes(i.status)).length,
    };
  }, [bookings]);

  const tryCheckInEndpoint = async (id) => {
    try {
      await apiRequest(`/receptionist/boarding-requests/${id}/check-in`, { method: "POST" });
    } catch {
      await apiRequest(`/receptionist/requests/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "checked_in" }),
      });
    }
  };

  const handleCheckIn = async (booking) => {
    const confirmed = await showConfirm(
      `Confirm check-in for ${getPetName(booking)} owned by ${getCustomerName(booking)}?`
    );
    if (!confirmed) return;
    try {
      setActionId(booking.id);
      await tryCheckInEndpoint(booking.id);
      showMessage("success", "Guest checked in successfully.");
      setSelectedBooking(null);
      await loadBookings({ silent: true });
    } catch (err) {
      showMessage("error", err.message || "Failed to process check-in.");
    } finally {
      setActionId(null);
    }
  };

  const handleCheckOut = async (booking) => {
    const confirmed = await showConfirm(
      `Confirm check-out for ${getPetName(booking)} owned by ${getCustomerName(booking)}?`
    );
    if (!confirmed) return;
    try {
      setActionId(booking.id);
      await apiRequest(`/receptionist/requests/${booking.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "completed" }),
      });
      showMessage("success", "Guest checked out successfully.");
      setSelectedBooking(null);
      await loadBookings({ silent: true });
    } catch (err) {
      showMessage("error", err.message || "Failed to process check-out.");
    } finally {
      setActionId(null);
    }
  };

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
  };

  return (
    <div className="checkin-form">
      {success && (
        <div className="checkin-toast success">
          <FontAwesomeIcon icon={faCheckCircle} />
          <span>{success}</span>
        </div>
      )}
      {error && (
        <div className="checkin-toast error">
          <FontAwesomeIcon icon={faTimes} />
          <span>{error}</span>
        </div>
      )}

      <section className="checkin-hero">
        <div>
          <span className="checkin-eyebrow">
            <FontAwesomeIcon icon={faHotel} />
            Boarding Manager
          </span>
          <h1>Pet Hotel & Boarding</h1>
          <p>Manage boarding lifecycle from queue to check-out.</p>
          <small>Last updated: {lastUpdated || "Not refreshed yet"}</small>
        </div>
        <div className="checkin-hero-actions">
          <button
            type="button"
            className={`checkin-secondary-btn ${refreshing ? "loading" : ""}`}
            onClick={() => loadBookings({ silent: true })}
            disabled={refreshing || loading}
          >
            <FontAwesomeIcon icon={refreshing ? faSpinner : faRefresh} spin={refreshing} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </section>

      <section className="checkin-summary-grid">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`checkin-summary-card ${activeTab === t.key ? "active" : ""}`}
            onClick={() => { setActiveTab(t.key); setStatusFilter("all"); }}
          >
            <span><FontAwesomeIcon icon={t.icon} /></span>
            <div>
              <strong>{stats[t.key]}</strong>
              <p>{t.label}</p>
            </div>
          </button>
        ))}
      </section>

      <section className="checkin-toolbar">
        <div className="checkin-search">
          <FontAwesomeIcon icon={faSearch} />
          <input
            type="text"
            placeholder="Search by pet, customer, room, date..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="checkin-filters">
          <div className="checkin-select-wrap">
            <FontAwesomeIcon icon={faFilter} />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All Status</option>
              {activeTab === "queue" && (
                <>
                  <option value="approved">Approved</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="confirmed">Confirmed</option>
                </>
              )}
              {activeTab === "inhouse" && <option value="checked_in">Checked In</option>}
              {activeTab === "completed" && (
                <>
                  <option value="completed">Completed</option>
                  <option value="checked_out">Checked Out</option>
                </>
              )}
            </select>
          </div>
          <button type="button" className="checkin-clear-btn" onClick={clearFilters}>
            <FontAwesomeIcon icon={faTimes} />
            Clear
          </button>
        </div>
      </section>

      {loading ? (
        <div className="checkin-empty">
          <FontAwesomeIcon icon={faSpinner} spin />
          <p>Loading boarding reservations…</p>
        </div>
      ) : (
        <section className="checkin-list">
          {filteredBookings.map((booking) => (
            <div key={booking.id} className="checkin-card">
              <div className="checkin-card-header">
                <div className="checkin-card-avatar">
                  <PetAvatar name={getPetName(booking)} size={56} />
                </div>
                <div className="checkin-card-info">
                  <h4>
                    <FontAwesomeIcon icon={faPaw} />
                    {getPetName(booking)}
                  </h4>
                  <p className="checkin-card-meta">
                    <span>
                      <FontAwesomeIcon icon={faUser} />
                      {getCustomerName(booking)}
                    </span>
                    <span>
                      <FontAwesomeIcon icon={faPhone} />
                      {getCustomerPhone(booking)}
                    </span>
                    <span>
                      <FontAwesomeIcon icon={faHotel} />
                      {getRoomName(booking)}
                    </span>
                  </p>
                  <span className={`checkin-status ${booking.status}`}>
                    {formatStatus(booking.status)}
                  </span>
                </div>
                <div className="checkin-card-actions">
                  {activeTab === "queue" && (
                    <button
                      type="button"
                      className="checkin-primary-btn"
                      onClick={() => handleCheckIn(booking)}
                      disabled={actionId === booking.id}
                    >
                      <FontAwesomeIcon icon={actionId === booking.id ? faSpinner : faDoorOpen} spin={actionId === booking.id} />
                      {actionId === booking.id ? "Checking In…" : "Check In"}
                    </button>
                  )}
                  {activeTab === "inhouse" && (
                    <button
                      type="button"
                      className="checkin-primary-btn checkout"
                      onClick={() => handleCheckOut(booking)}
                      disabled={actionId === booking.id}
                    >
                      <FontAwesomeIcon icon={actionId === booking.id ? faSpinner : faSignOutAlt} spin={actionId === booking.id} />
                      {actionId === booking.id ? "Checking Out…" : "Check Out"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="checkin-secondary-btn"
                    onClick={() =>
                      setSelectedBooking(
                        selectedBooking?.id === booking.id ? null : booking
                      )
                    }
                  >
                    <FontAwesomeIcon icon={faEye} />
                    {selectedBooking?.id === booking.id ? "Hide" : "Details"}
                  </button>
                </div>
              </div>

              {selectedBooking?.id === booking.id && (
                <div className="checkin-card-details">
                  <div className="checkin-detail-row">
                    <span>
                      <FontAwesomeIcon icon={faCalendarAlt} />
                      <strong>Check-in:</strong> {formatDate(getCheckInDate(booking))}
                    </span>
                    <span>
                      <FontAwesomeIcon icon={faCalendarAlt} />
                      <strong>Check-out:</strong> {formatDate(getCheckOutDate(booking))}
                    </span>
                  </div>
                  <div className="checkin-detail-row">
                    <span>
                      <FontAwesomeIcon icon={faInfoCircle} />
                      <strong>Notes:</strong> {getNotes(booking)}
                    </span>
                  </div>
                  {booking.vaccination_card && (
                    <div className="checkin-detail-row">
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
                              booking.vaccination_card_url || `/files/vaccination-cards/${booking.id}/view`
                            );
                            win.location.href = url;
                          } catch (err) {
                            win.close();
                            console.error("Vaccination card open error:", err);
                            alert(err.message || "Failed to open vaccination card.");
                          }
                        }}
                      >
                        <FontAwesomeIcon icon={faEye} />
                        View Vaccination Card
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {filteredBookings.length === 0 && (
            <div className="checkin-empty">
              <FontAwesomeIcon icon={faClipboardList} />
              <p>
                No {activeTab} reservations found.
              </p>
              {searchQuery && (
                <button type="button" className="checkin-clear-btn" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default ReceptionistBoardingManager;
