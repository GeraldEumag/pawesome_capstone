import React, { useCallback, useEffect, useMemo, useState } from "react";
import { showConfirm } from "../../utils/alert";
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
import { apiRequest } from "../../api/client";
import PetAvatar from "../shared/PetAvatar";
import BoardingInventoryUsage from "../boarding/BoardingInventoryUsage";

const STATUS_READY_FOR_CHECKIN = ["approved", "scheduled", "confirmed"];

const normalizeList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.requests)) return payload.requests;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.requests)) return payload.data.requests;
  if (Array.isArray(payload?.boarding_requests)) return payload.boarding_requests;
  if (Array.isArray(payload?.boardings)) return payload.boardings;
  if (Array.isArray(payload?.records)) return payload.records;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
};

const normalizeStatus = (value) =>
  String(value || "pending").toLowerCase().replace(/\s+/g, "_");

const formatStatus = (value) =>
  String(value || "pending")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatDate = (value) => {
  if (!value) return "TBD";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);

  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
};

const getPetName = (item) =>
  item.pet?.name ||
  item.pet_name ||
  item.petName ||
  item.pet ||
  "Unknown Pet";

const getPetType = (item) =>
  item.pet?.species ||
  item.pet?.type ||
  item.pet_species ||
  item.pet_type ||
  "Pet";

const getCustomerName = (item) =>
  item.customer?.name ||
  item.customer_name ||
  item.owner_name ||
  item.customer ||
  "Unknown Customer";

const getCustomerPhone = (item) =>
  item.customer?.phone ||
  item.customer_phone ||
  item.owner_phone ||
  item.phone ||
  "No phone";

const getCheckInDate = (item) =>
  item.check_in ||
  item.checkin_date ||
  item.booking_date ||
  item.appointment_date ||
  item.date ||
  item.created_at ||
  "";

const getCheckOutDate = (item) =>
  item.check_out ||
  item.checkout_date ||
  item.end_date ||
  item.date_to ||
  "";

const getRoomName = (item) =>
  item.hotel_room?.name ||
  item.hotel_room?.room_number ||
  item.room?.name ||
  item.room_number ||
  item.room_type ||
  item.service ||
  "Room not assigned";

const getNotes = (item) =>
  item.special_requests ||
  item.feeding_instructions ||
  item.notes ||
  item.remarks ||
  "No notes provided";

const isHotelRequest = (item) => {
  const values = [
    item.type,
    item.request_type,
    item.service_type,
    item.category,
    item.source,
    item.service,
    item.service_name,
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  return values.some(
    (value) =>
      value.includes("hotel") ||
      value.includes("boarding") ||
      value.includes("board")
  );
};

const ReceptionistCheckInForm = () => {
  const [bookings, setBookings] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingInId, setCheckingInId] = useState(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  const [selectedBooking, setSelectedBooking] = useState(null);

  const showMessage = (type, message) => {
    if (type === "success") {
      setSuccess(message);
      window.clearTimeout(window.receptionistCheckinSuccessTimer);
      window.receptionistCheckinSuccessTimer = window.setTimeout(() => {
        setSuccess("");
      }, 3000);
      return;
    }

    setError(message);
    window.clearTimeout(window.receptionistCheckinErrorTimer);
    window.receptionistCheckinErrorTimer = window.setTimeout(() => {
      setError("");
    }, 5000);
  };

  const loadBookings = useCallback(async ({ silent = false } = {}) => {
    try {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      const data = await apiRequest("/receptionist/requests");
      const list = normalizeList(data);

      const readyForCheckIn = list
        .filter((item) => {
          const status = normalizeStatus(item.status);
          return isHotelRequest(item) && STATUS_READY_FOR_CHECKIN.includes(status);
        })
        .map((item) => ({
          ...item,
          status: normalizeStatus(item.status),
        }));

      setBookings(readyForCheckIn);
      setLastUpdated(new Date().toLocaleString("en-PH"));
    } catch (err) {
      console.error("Failed to load check-in records:", err);
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

  const filteredBookings = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return bookings.filter((item) => {
      const status = normalizeStatus(item.status);

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
        status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !query || searchableText.includes(query);
      const matchesStatus = statusFilter === "all" || status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [bookings, searchQuery, statusFilter]);

  const stats = useMemo(
    () => ({
      total: bookings.length,
      approved: bookings.filter((item) => normalizeStatus(item.status) === "approved").length,
      scheduled: bookings.filter((item) => normalizeStatus(item.status) === "scheduled").length,
      confirmed: bookings.filter((item) => normalizeStatus(item.status) === "confirmed").length,
    }),
    [bookings]
  );

  const tryCheckInEndpoint = async (id) => {
    try {
      await apiRequest(`/receptionist/boarding-requests/${id}/check-in`, {
        method: "POST",
      });
      return;
    } catch (boardingError) {
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
      setCheckingInId(booking.id);
      setError("");
      setSuccess("");

      await tryCheckInEndpoint(booking.id);

      showMessage("success", "Guest checked in successfully.");
      setSelectedBooking(null);
      await loadBookings({ silent: true });
    } catch (err) {
      console.error("Check-in failed:", err);
      showMessage("error", err.message || "Failed to process check-in.");
    } finally {
      setCheckingInId(null);
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
            <FontAwesomeIcon icon={faDoorOpen} />
            Receptionist Hotel Check-In
          </span>

          <h1>Boarding Check-In</h1>

          <p>
            Search approved hotel boarding reservations, verify customer and pet
            details, then confirm check-in for guests arriving today.
          </p>

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
        <button type="button" className="checkin-summary-card" onClick={() => setStatusFilter("all")}>
          <span>
            <FontAwesomeIcon icon={faHotel} />
          </span>
          <div>
            <strong>{stats.total}</strong>
            <p>Ready for Check-In</p>
          </div>
        </button>

        <button type="button" className="checkin-summary-card approved" onClick={() => setStatusFilter("approved")}>
          <span>
            <FontAwesomeIcon icon={faCheckCircle} />
          </span>
          <div>
            <strong>{stats.approved}</strong>
            <p>Approved</p>
          </div>
        </button>

        <button type="button" className="checkin-summary-card scheduled" onClick={() => setStatusFilter("scheduled")}>
          <span>
            <FontAwesomeIcon icon={faCalendarAlt} />
          </span>
          <div>
            <strong>{stats.scheduled}</strong>
            <p>Scheduled</p>
          </div>
        </button>

        <button type="button" className="checkin-summary-card confirmed" onClick={() => setStatusFilter("confirmed")}>
          <span>
            <FontAwesomeIcon icon={faClock} />
          </span>
          <div>
            <strong>{stats.confirmed}</strong>
            <p>Confirmed</p>
          </div>
        </button>
      </section>

      <section className="checkin-controls">
        <div className="checkin-search-box">
          <FontAwesomeIcon icon={faSearch} />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by pet, customer, phone, room, or notes..."
          />

          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery("")}>
              <FontAwesomeIcon icon={faTimes} />
            </button>
          )}
        </div>

        <label className="checkin-filter-box">
          <FontAwesomeIcon icon={faFilter} />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All Ready Status</option>
            <option value="approved">Approved</option>
            <option value="scheduled">Scheduled</option>
            <option value="confirmed">Confirmed</option>
          </select>
        </label>

        <button type="button" className="checkin-clear-btn" onClick={clearFilters}>
          <FontAwesomeIcon icon={faTimes} />
          Clear
        </button>
      </section>

      <section className="checkin-list-card">
        <div className="checkin-list-header">
          <div>
            <span className="checkin-eyebrow">
              <FontAwesomeIcon icon={faClipboardList} />
              Live Check-In Queue
            </span>

            <h2>Approved Boarding Reservations</h2>

            <p>
              Showing <strong>{filteredBookings.length}</strong> of{" "}
              <strong>{bookings.length}</strong> record(s).
            </p>
          </div>
        </div>

        {loading ? (
          <div className="checkin-state">
            <FontAwesomeIcon icon={faSpinner} spin />
            <h3>Loading available check-ins...</h3>
            <p>Please wait while the system loads approved hotel bookings.</p>
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="checkin-state">
            <FontAwesomeIcon icon={faSearch} />
            <h3>No approved bookings available</h3>
            <p>No hotel reservations are currently ready for check-in.</p>
          </div>
        ) : (
          <div className="boarding-list">
            {filteredBookings.map((booking) => {
              const busy = checkingInId === booking.id;

              return (
                <article key={booking.id} className="boarding-card">
                  <div className="boarding-card-main">
                    <div className="boarding-card-top">
                      <span className="boarding-id">#{booking.id}</span>
                      <span className={`status-badge ${normalizeStatus(booking.status)}`}>
                        {formatStatus(booking.status)}
                      </span>
                    </div>

                    <div className="boarding-pet-row">
                      <PetAvatar pet={booking.pet} size={48} className="pet-avatar" />

                      <div>
                        <h3>{getPetName(booking)}</h3>
                        <p>{getPetType(booking)} boarding guest</p>
                      </div>
                    </div>

                    <div className="boarding-info-grid">
                      <div>
                        <FontAwesomeIcon icon={faUser} />
                        <span>{getCustomerName(booking)}</span>
                      </div>

                      <div>
                        <FontAwesomeIcon icon={faPhone} />
                        <span>{getCustomerPhone(booking)}</span>
                      </div>

                      <div>
                        <FontAwesomeIcon icon={faCalendarAlt} />
                        <span>Check-In: {formatDate(getCheckInDate(booking))}</span>
                      </div>

                      <div>
                        <FontAwesomeIcon icon={faCalendarAlt} />
                        <span>Check-Out: {formatDate(getCheckOutDate(booking))}</span>
                      </div>

                      <div>
                        <FontAwesomeIcon icon={faBed} />
                        <span>{getRoomName(booking)}</span>
                      </div>

                      <div>
                        <FontAwesomeIcon icon={faInfoCircle} />
                        <span>{getNotes(booking)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Boarding Food / Supply Usage Section */}
                  {selectedBooking?.id && (
                    <div className="boarding-inventory-section">
                      <h4>
                        <FontAwesomeIcon icon={faClipboardList} />
                        Boarding Food / Supply Usage
                      </h4>
                      <BoardingInventoryUsage 
                        boardingId={selectedBooking.id}
                        petId={selectedBooking.pet_id || selectedBooking.pet?.id}
                      />
                    </div>
                  )}

                  <div className="boarding-card-actions">
                    <button
                      type="button"
                      className="checkin-secondary-btn"
                      onClick={() => setSelectedBooking(booking)}
                    >
                      <FontAwesomeIcon icon={faEye} />
                      View Details
                    </button>

                    <button
                      type="button"
                      className="checkin-primary-btn"
                      onClick={() => handleCheckIn(booking)}
                      disabled={busy}
                    >
                      <FontAwesomeIcon icon={busy ? faSpinner : faCheckCircle} spin={busy} />
                      {busy ? "Checking In..." : "Confirm Check-In"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {selectedBooking && (
        <div className="checkin-modal-overlay" onClick={() => setSelectedBooking(null)}>
          <div className="checkin-modal" onClick={(event) => event.stopPropagation()}>
            <div className="checkin-modal-header">
              <div>
                <span className="checkin-eyebrow">
                  <FontAwesomeIcon icon={faEye} />
                  Check-In Details
                </span>
                <h2>Reservation #{selectedBooking.id}</h2>
              </div>

              <button
                type="button"
                className="checkin-close-btn"
                onClick={() => setSelectedBooking(null)}
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            <div className="checkin-modal-body">
              <div className="checkin-detail-grid">
                <DetailItem label="Pet" value={getPetName(selectedBooking)} />
                <DetailItem label="Pet Type" value={getPetType(selectedBooking)} />
                <DetailItem label="Customer" value={getCustomerName(selectedBooking)} />
                <DetailItem label="Phone" value={getCustomerPhone(selectedBooking)} />
                <DetailItem label="Check-In" value={formatDate(getCheckInDate(selectedBooking))} />
                <DetailItem label="Check-Out" value={formatDate(getCheckOutDate(selectedBooking))} />
                <DetailItem label="Room" value={getRoomName(selectedBooking)} />
                <DetailItem label="Status" value={formatStatus(selectedBooking.status)} />
                <DetailItem label="Notes" value={getNotes(selectedBooking)} wide />
              </div>
            </div>

            <div className="checkin-modal-actions">
              <button
                type="button"
                className="checkin-secondary-btn"
                onClick={() => setSelectedBooking(null)}
              >
                Close
              </button>

              <button
                type="button"
                className="checkin-primary-btn"
                onClick={() => handleCheckIn(selectedBooking)}
                disabled={checkingInId === selectedBooking.id}
              >
                <FontAwesomeIcon
                  icon={checkingInId === selectedBooking.id ? faSpinner : faCheckCircle}
                  spin={checkingInId === selectedBooking.id}
                />
                {checkingInId === selectedBooking.id ? "Checking In..." : "Confirm Check-In"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const DetailItem = ({ label, value, wide = false }) => (
  <div className={`checkin-detail-item ${wide ? "wide" : ""}`}>
    <small>{label}</small>
    <strong>{value || "N/A"}</strong>
  </div>
);

export default ReceptionistCheckInForm;