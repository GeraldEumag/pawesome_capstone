import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSearch,
  faSignOutAlt,
  faCalendarAlt,
  faPaw,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
import "./ReceptionistCheckOutForm.css";
import { showConfirm } from "../../utils/alert";
import { apiRequest } from "../../api/client";
import { normalizeList } from "../../utils/apiNormalize";

const ReceptionistCheckOutForm = () => {
  const [bookings, setBookings] = useState([]);
  const [filteredBookings, setFilteredBookings] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [checkingOutId, setCheckingOutId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadBookings = async () => {
    setLoading(true);
    setError("");

    try {
      const data = await apiRequest("/receptionist/requests");
      const requests = normalizeList(data, ["requests", "data"]);

      // Filter only hotel requests that are checked_in (ready for check-out)
      const hotelCheckedIn = requests.filter(
        item => item.type === "hotel" && item.status === "checked_in"
      );

      setBookings(hotelCheckedIn);
    } catch (err) {
      setError("Failed to load boarding reservations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBookings();
  }, []);

  useEffect(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      setFilteredBookings(bookings);
      return;
    }

    setFilteredBookings(
      bookings.filter((item) => {
        const petName = item.pet?.toLowerCase() || "";
        const customerName = item.customer?.toLowerCase() || "";

        return (
          petName.includes(query) ||
          customerName.includes(query)
        );
      })
    );
  }, [searchQuery, bookings]);

  const handleCheckOut = async (id) => {
    const confirmCheckout = await showConfirm("Confirm this guest check-out?");
    if (!confirmCheckout) return;

    setError("");
    setSuccess("");
    setCheckingOutId(id);

    try {
      await apiRequest(`/receptionist/requests/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "checked_out" }),
      });
      
      setSuccess("Guest checked out successfully.");
      await loadBookings();
    } catch (err) {
      setError("Failed to process check-out");
    } finally {
      setCheckingOutId(null);
    }
  };

  return (
    <div className="checkout-form">
      <div className="form-header">
        <div>
          <h1>Receptionist Check-Out</h1>
          <p>Complete check-outs for pets currently staying with us.</p>
        </div>

        <button className="btn-secondary" type="button" onClick={loadBookings}>
          Refresh
        </button>
      </div>

      <div className="checkout-controls">
        <div className="search-row">
          <FontAwesomeIcon icon={faSearch} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by pet or customer..."
          />
        </div>
      </div>

      {success && <div className="alert alert-success">{success}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="loading-state">Loading check-out candidates...</div>
      ) : (
        <div className="boarding-list">
          {filteredBookings.length === 0 ? (
            <div className="no-data">
              No checked-in pets available for check-out.
            </div>
          ) : (
            filteredBookings.map((booking) => (
              <div key={booking.id} className="boarding-card">
                <div className="card-header">
                  <h3>{booking.pet || "Unknown Pet"}</h3>
                  <span className="status-badge status-checked-in">
                    Checked In
                  </span>
                </div>

                <div className="card-body">
                  <p>
                    <FontAwesomeIcon icon={faUser} />{" "}
                    {booking.customer || "Unknown Owner"}
                  </p>
                  <p>
                    <FontAwesomeIcon icon={faPaw} />{" "}
                    Hotel Stay
                  </p>
                  <p>
                    <FontAwesomeIcon icon={faCalendarAlt} /> Date:{" "}
                    {booking.date || "TBD"}
                  </p>
                  <p>Room: {booking.service || "TBD"}</p>
                </div>

                <button
                  className="btn-primary"
                  onClick={() => handleCheckOut(booking.id)}
                  disabled={checkingOutId === booking.id}
                >
                  <FontAwesomeIcon icon={faSignOutAlt} />
                  {checkingOutId === booking.id
                    ? "Checking out..."
                    : "Confirm Check-Out"}
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default ReceptionistCheckOutForm;
