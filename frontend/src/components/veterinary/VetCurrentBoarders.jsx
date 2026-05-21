import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHotel,
  faPaw,
  faUser,
  faCalendarAlt,
  faSpinner,
  faExclamationTriangle,
  faBed,
  faPhone,
  faStethoscope,
  faSearch,
  faRotateRight,
  faXmark,
  faClipboardList,
  faDoorOpen,
  faEye,
  faShieldHeart,
} from "@fortawesome/free-solid-svg-icons";
import toast from "react-hot-toast";
import { apiRequest } from "../../api/client";
import { formatCurrency } from "../../utils/currency";
import PetAvatar from "../shared/PetAvatar";
import "./VetCurrentBoarders.css";

const VetCurrentBoarders = () => {
  const [boarders, setBoarders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBoarder, setSelectedBoarder] = useState(null);

  const safeArray = (value) => {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.boarders)) return value.boarders;
    if (Array.isArray(value?.data)) return value.data;
    if (Array.isArray(value?.records)) return value.records;
    return [];
  };

  const getPetName = (boarder) =>
    boarder?.pet?.name || boarder?.pet_name || "Unknown Pet";

  const getPetSpecies = (boarder) =>
    boarder?.pet?.species || boarder?.pet_species || "Pet";

  const getPetBreed = (boarder) =>
    boarder?.pet?.breed || boarder?.pet_breed || "Unknown breed";

  const getOwnerName = (boarder) =>
    boarder?.customer?.name ||
    boarder?.owner?.name ||
    boarder?.customer_name ||
    boarder?.owner_name ||
    "N/A";

  const getOwnerPhone = (boarder) =>
    boarder?.customer?.phone ||
    boarder?.owner?.phone ||
    boarder?.customer_phone ||
    boarder?.phone ||
    "N/A";

  const getOwnerEmail = (boarder) =>
    boarder?.customer?.email ||
    boarder?.owner?.email ||
    boarder?.customer_email ||
    boarder?.email ||
    "N/A";

  const getRoomNumber = (boarder) =>
    boarder?.hotel_room?.room_number ||
    boarder?.room_number ||
    boarder?.room ||
    "N/A";

  const getRoomType = (boarder) =>
    boarder?.hotel_room?.type ||
    boarder?.room_type ||
    "Standard";

  const getCheckIn = (boarder) =>
    boarder?.check_in ||
    boarder?.checkin_date ||
    boarder?.check_in_date ||
    boarder?.start_date ||
    null;

  const getCheckOut = (boarder) =>
    boarder?.check_out ||
    boarder?.checkout_date ||
    boarder?.check_out_date ||
    boarder?.end_date ||
    null;

  const formatDate = (value) => {
    if (!value) return "N/A";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "N/A";

    return date.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatDateKey = (value) => {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    return date.toISOString().split("T")[0];
  };

  const fetchCurrentBoarders = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      const data = await apiRequest("/veterinary/boardings/current-boarders");
      setBoarders(safeArray(data));
      setError("");
    } catch (err) {
      console.error("Failed to fetch current boarders:", err);
      setError("Failed to load current boarders. Please try again.");
      setBoarders([]);

      if (!silent) {
        toast.error("Failed to load current boarders.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchCurrentBoarders({ silent: false });

    const interval = setInterval(() => {
      fetchCurrentBoarders({ silent: true });
    }, 15000);

    return () => clearInterval(interval);
  }, [fetchCurrentBoarders]);

  const filteredBoarders = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    if (!keyword) return boarders;

    return boarders.filter((boarder) => {
      const searchableText = [
        getPetName(boarder),
        getPetSpecies(boarder),
        getPetBreed(boarder),
        getOwnerName(boarder),
        getOwnerPhone(boarder),
        getOwnerEmail(boarder),
        getRoomNumber(boarder),
        getRoomType(boarder),
        boarder?.status,
        boarder?.special_requests,
        boarder?.emergency_contact,
        boarder?.emergency_phone,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(keyword);
    });
  }, [boarders, searchTerm]);

  const todayKey = new Date().toISOString().split("T")[0];

  const stats = useMemo(() => {
    const checkoutsToday = boarders.filter(
      (boarder) => formatDateKey(getCheckOut(boarder)) === todayKey
    ).length;

    const emergencyContacts = boarders.filter(
      (boarder) => boarder?.emergency_contact || boarder?.emergency_phone
    ).length;

    const roomsUsed = new Set(
      boarders.map((boarder) => getRoomNumber(boarder)).filter(Boolean)
    ).size;

    return {
      active: boarders.length,
      checkoutsToday,
      emergencyContacts,
      roomsUsed,
    };
  }, [boarders, todayKey]);

  const handleRefresh = () => {
    fetchCurrentBoarders({ silent: true });
    toast.success("Current boarders refreshed.");
  };

  if (loading) {
    return (
      <section className="app-content vet-current-boarders">
        <div className="premium-card vet-loading-state">
          <FontAwesomeIcon icon={faSpinner} className="spin-animation" />
          <span>Loading current boarders...</span>
        </div>
      </section>
    );
  }

  return (
    <section className="app-content vet-current-boarders">
      <div className="premium-card vet-boarders-hero">
        <div className="vet-boarders-hero-copy">
          <span className="vet-boarders-eyebrow">
            <FontAwesomeIcon icon={faShieldHeart} />
            Hotel Care Monitoring
          </span>

          <h2 className="premium-title">
            <FontAwesomeIcon icon={faHotel} />
            Current Boarders
          </h2>

          <p className="premium-muted">
            Monitor pets currently checked in at the hotel for veterinary and emergency access.
          </p>
        </div>

        <button
          className={`vet-boarders-refresh-btn ${refreshing ? "refreshing" : ""}`}
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <FontAwesomeIcon icon={faRotateRight} />
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="premium-card vet-boarders-error-banner">
          <FontAwesomeIcon icon={faExclamationTriangle} />
          <span>{error}</span>
        </div>
      )}

      <div className="vet-boarders-stats">
        <article className="premium-card vet-boarders-stat-card">
          <span>
            <FontAwesomeIcon icon={faPaw} />
          </span>
          <div>
            <h3>{stats.active}</h3>
            <p>Active Boarders</p>
          </div>
        </article>

        <article className="premium-card vet-boarders-stat-card">
          <span>
            <FontAwesomeIcon icon={faCalendarAlt} />
          </span>
          <div>
            <h3>{stats.checkoutsToday}</h3>
            <p>Checkouts Today</p>
          </div>
        </article>

        <article className="premium-card vet-boarders-stat-card">
          <span>
            <FontAwesomeIcon icon={faPhone} />
          </span>
          <div>
            <h3>{stats.emergencyContacts}</h3>
            <p>Emergency Contacts</p>
          </div>
        </article>

        <article className="premium-card vet-boarders-stat-card">
          <span>
            <FontAwesomeIcon icon={faDoorOpen} />
          </span>
          <div>
            <h3>{stats.roomsUsed}</h3>
            <p>Rooms Used</p>
          </div>
        </article>
      </div>

      <div className="premium-card vet-boarders-search">
        <div className="vet-search-box">
          <FontAwesomeIcon icon={faSearch} />
          <input
            type="text"
            placeholder="Search by pet, owner, room, species, contact, or special request..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />

          {searchTerm && (
            <button
              className="vet-boarders-clear-search"
              type="button"
              onClick={() => setSearchTerm("")}
              aria-label="Clear search"
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          )}
        </div>

        <div className="vet-boarders-search-meta">
          Showing <strong>{filteredBoarders.length}</strong> of{" "}
          <strong>{boarders.length}</strong> boarders
        </div>
      </div>

      {filteredBoarders.length === 0 ? (
        <div className="premium-card vet-empty-state">
          <FontAwesomeIcon icon={faBed} />
          <h3>No current boarders found</h3>
          <p>
            {searchTerm
              ? "Try another pet name, owner, room, species, or contact."
              : "There are no pets currently checked in at the hotel."}
          </p>
        </div>
      ) : (
        <div className="vet-boarders-grid">
          {filteredBoarders.map((boarder) => (
            <article key={boarder.id} className="premium-card vet-boarder-card">
              <div className="vet-boarder-top">
                <div className="vet-boarder-pet">
                  <PetAvatar pet={boarder.pet} size={44} />

                  <div>
                    <h4>{getPetName(boarder)}</h4>
                    <p>
                      {getPetSpecies(boarder)} • {getPetBreed(boarder)}
                    </p>
                    <p className="vet-pet-meta">
                      <FontAwesomeIcon icon={faBed} /> Room {getRoomNumber(boarder)}
                    </p>
                  </div>
                </div>

                <span className="vet-boarder-status">
                  {boarder.status || "Checked In"}
                </span>
              </div>

              <div className="vet-boarder-details">
                <div className="vet-boarder-row">
                  <FontAwesomeIcon icon={faUser} />
                  <div>
                    <strong>Owner</strong>
                    <span>{getOwnerName(boarder)}</span>
                  </div>
                </div>

                <div className="vet-boarder-row">
                  <FontAwesomeIcon icon={faHotel} />
                  <div>
                    <strong>Room</strong>
                    <span>
                      {getRoomNumber(boarder)} ({getRoomType(boarder)})
                    </span>
                  </div>
                </div>

                <div className="vet-boarder-row">
                  <FontAwesomeIcon icon={faCalendarAlt} />
                  <div>
                    <strong>Check-out</strong>
                    <span>{formatDate(getCheckOut(boarder))}</span>
                  </div>
                </div>

                {(boarder.emergency_phone || boarder.emergency_contact) && (
                  <div className="vet-boarder-row vet-emergency">
                    <FontAwesomeIcon icon={faPhone} />
                    <div>
                      <strong>Emergency</strong>
                      <span>
                        {boarder.emergency_contact || "Emergency Contact"} •{" "}
                        {boarder.emergency_phone || "No phone"}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {boarder.special_requests && (
                <div className="vet-boarder-special">
                  <FontAwesomeIcon icon={faClipboardList} />
                  <span>{boarder.special_requests}</span>
                </div>
              )}

              <button
                className="vet-view-btn"
                onClick={() => setSelectedBoarder(boarder)}
                type="button"
              >
                <FontAwesomeIcon icon={faEye} />
                View Medical Info
              </button>
            </article>
          ))}
        </div>
      )}

      {selectedBoarder && (
        <div
          className="vet-boarder-modal-overlay"
          onClick={() => setSelectedBoarder(null)}
          role="dialog"
        >
          <div
            className="vet-boarder-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="vet-boarder-modal-header">
              <div>
                <span className="vet-boarders-eyebrow">
                  <FontAwesomeIcon icon={faStethoscope} />
                  Medical Access
                </span>

                <h3>
                  <FontAwesomeIcon icon={faPaw} />
                  {getPetName(selectedBoarder)}
                </h3>

                <p>
                  Room {getRoomNumber(selectedBoarder)} • {getPetSpecies(selectedBoarder)}
                </p>
              </div>

              <button
                className="vet-boarder-modal-close"
                onClick={() => setSelectedBoarder(null)}
                type="button"
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            <div className="vet-boarder-modal-body">
              <div className="vet-info-section">
                <h4>
                  <FontAwesomeIcon icon={faPaw} />
                  Pet Information
                </h4>

                <div className="vet-info-grid">
                  <p>
                    <strong>Name</strong>
                    <span>{getPetName(selectedBoarder)}</span>
                  </p>

                  <p>
                    <strong>Species</strong>
                    <span>{getPetSpecies(selectedBoarder)}</span>
                  </p>

                  <p>
                    <strong>Breed</strong>
                    <span>{getPetBreed(selectedBoarder)}</span>
                  </p>
                </div>
              </div>

              <div className="vet-info-section">
                <h4>
                  <FontAwesomeIcon icon={faUser} />
                  Owner Information
                </h4>

                <div className="vet-info-grid">
                  <p>
                    <strong>Name</strong>
                    <span>{getOwnerName(selectedBoarder)}</span>
                  </p>

                  <p>
                    <strong>Phone</strong>
                    <span>{getOwnerPhone(selectedBoarder)}</span>
                  </p>

                  <p>
                    <strong>Email</strong>
                    <span>{getOwnerEmail(selectedBoarder)}</span>
                  </p>
                </div>
              </div>

              <div className="vet-info-section">
                <h4>
                  <FontAwesomeIcon icon={faHotel} />
                  Stay Details
                </h4>

                <div className="vet-info-grid">
                  <p>
                    <strong>Room</strong>
                    <span>
                      {getRoomNumber(selectedBoarder)} ({getRoomType(selectedBoarder)})
                    </span>
                  </p>

                  <p>
                    <strong>Check-in</strong>
                    <span>{formatDate(getCheckIn(selectedBoarder))}</span>
                  </p>

                  <p>
                    <strong>Check-out</strong>
                    <span>{formatDate(getCheckOut(selectedBoarder))}</span>
                  </p>

                  <p>
                    <strong>Total Amount</strong>
                    <span>
                      {selectedBoarder.total_amount
                        ? formatCurrency(selectedBoarder.total_amount)
                        : "N/A"}
                    </span>
                  </p>
                </div>
              </div>

              {selectedBoarder.special_requests && (
                <div className="vet-info-section">
                  <h4>
                    <FontAwesomeIcon icon={faClipboardList} />
                    Special Requests
                  </h4>

                  <p className="vet-special-requests">
                    {selectedBoarder.special_requests}
                  </p>
                </div>
              )}

              {(selectedBoarder.emergency_contact || selectedBoarder.emergency_phone) && (
                <div className="vet-info-section vet-emergency-section">
                  <h4>
                    <FontAwesomeIcon icon={faPhone} />
                    Emergency Contact
                  </h4>

                  <div className="vet-info-grid">
                    <p>
                      <strong>Name</strong>
                      <span>{selectedBoarder.emergency_contact || "N/A"}</span>
                    </p>

                    <p>
                      <strong>Phone</strong>
                      <span>{selectedBoarder.emergency_phone || "N/A"}</span>
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="vet-boarder-modal-actions">
              <button
                className="vet-boarders-refresh-btn"
                type="button"
                onClick={() => setSelectedBoarder(null)}
              >
                Close
              </button>

              <button
                className="vet-view-btn"
                type="button"
                onClick={() => {
                  toast.success("Medical record view ready for connection.");
                }}
              >
                <FontAwesomeIcon icon={faStethoscope} />
                Open Medical Record
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default VetCurrentBoarders;