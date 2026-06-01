import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHotel,
  faPaw,
  faBed,
  faPhone,
  faCalendarAlt,
  faNotesMedical,
  faExclamationTriangle,
  faSearch,
  faSync,
  faUser,
  faFilter,
} from "@fortawesome/free-solid-svg-icons";

import { apiRequest } from "../../api/client";
import { useTheme } from "../../utils/theme";
import PetAvatar from "../shared/PetAvatar";
import toast from "react-hot-toast";
import "./theme.css";
import "./VeterinaryCurrentBoarders.css";

const VeterinaryCurrentBoarders = () => {
  useTheme();
  const [boarders, setBoarders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterSpecies, setFilterSpecies] = useState("all");
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const fetchBoarders = async () => {
    try {
      setLoading(true);
      const data = await apiRequest("/veterinary/boardings/current-boarders");
      setBoarders(Array.isArray(data) ? data : []);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Failed to fetch boarders:", err);
      toast.error("Failed to load current boarders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBoarders();
    // Refresh every 30 seconds
    const interval = setInterval(fetchBoarders, 30000);
    return () => clearInterval(interval);
  }, []);

  const filteredBoarders = boarders.filter((boarder) => {
    const matchesSearch = 
      (boarder.pet?.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (boarder.customer?.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (boarder.hotel_room?.room_number || "").toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesSpecies = filterSpecies === "all" || 
      (boarder.pet?.species || "").toLowerCase() === filterSpecies.toLowerCase();

    return matchesSearch && matchesSpecies;
  });

  const getUniqueSpecies = () => {
    const species = [...new Set(boarders.map(b => b.pet?.species).filter(Boolean))];
    return species;
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      'checked_in': { class: 'badge-success', text: 'Checked In' },
      'confirmed': { class: 'badge-info', text: 'Confirmed' },
      'pending': { class: 'badge-warning', text: 'Pending' },
      'checked_out': { class: 'badge-secondary', text: 'Checked Out' },
    };
    return statusConfig[status] || { class: 'badge-secondary', text: status || 'Unknown' };
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="veterinary-boarders-page">
      <div className="page-header">
        <div className="header-content">
          <h1>
            <FontAwesomeIcon icon={faHotel} /> Pet Hotel Boarders
          </h1>
          <p>View and monitor all pets currently staying at the hotel</p>
        </div>
        <div className="header-actions">
          <button className="btn-primary" onClick={fetchBoarders}>
            <FontAwesomeIcon icon={faSync} /> Refresh
          </button>
        </div>
      </div>

      <div className="boarders-stats">
        <div className="stat-card">
          <div className="stat-icon">
            <FontAwesomeIcon icon={faPaw} />
          </div>
          <div className="stat-content">
            <h3>{boarders.length}</h3>
            <p>Total Boarders</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <FontAwesomeIcon icon={faBed} />
          </div>
          <div className="stat-content">
            <h3>{boarders.filter(b => b.status === 'checked_in').length}</h3>
            <p>Currently Checked In</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <FontAwesomeIcon icon={faCalendarAlt} />
          </div>
          <div className="stat-content">
            <h3>{boarders.filter(b => {
              const today = new Date().toISOString().split('T')[0];
              const checkout = b.check_out_date || b.check_out;
              return checkout && checkout.startsWith(today);
            }).length}</h3>
            <p>Checking Out Today</p>
          </div>
        </div>
      </div>

      <div className="boarders-filters">
        <div className="search-box">
          <FontAwesomeIcon icon={faSearch} />
          <input
            type="text"
            placeholder="Search by pet name, owner, or room..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="filter-box">
          <FontAwesomeIcon icon={faFilter} />
          <select
            value={filterSpecies}
            onChange={(e) => setFilterSpecies(e.target.value)}
          >
            <option value="all">All Species</option>
            {getUniqueSpecies().map(species => (
              <option key={species} value={species.toLowerCase()}>
                {species}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="boarders-list">
        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading boarders...</p>
          </div>
        ) : filteredBoarders.length === 0 ? (
          <div className="empty-state">
            <FontAwesomeIcon icon={faHotel} className="empty-icon" />
            <h3>No boarders found</h3>
            <p>
              {searchTerm || filterSpecies !== "all" 
                ? "No boarders match your search criteria." 
                : "There are currently no pets staying at the hotel."}
            </p>
          </div>
        ) : (
          <div className="boarders-grid">
            {filteredBoarders.map((boarder) => (
              <div key={boarder.id} className="boarder-card">
                <div className="boarder-header">
                  <div className="pet-info">
                    <PetAvatar pet={boarder.pet} size={44} className="pet-avatar" />
                    <div>
                      <h3>{boarder.pet?.name || "Unknown"}</h3>
                      <p className="pet-details">
                        {boarder.pet?.species || "Unknown"} • {boarder.pet?.breed || "Unknown"}
                      </p>
                    </div>
                  </div>
                  <span className={`status-badge ${getStatusBadge(boarder.status).class}`}>
                    {getStatusBadge(boarder.status).text}
                  </span>
                </div>

                <div className="boarder-body">
                  <div className="info-row">
                    <div className="info-item">
                      <FontAwesomeIcon icon={faUser} />
                      <div>
                        <strong>Owner</strong>
                        <p>{boarder.customer?.name || "Unknown"}</p>
                      </div>
                    </div>
                    <div className="info-item">
                      <FontAwesomeIcon icon={faPhone} />
                      <div>
                        <strong>Contact</strong>
                        <p>{boarder.customer?.phone || "N/A"}</p>
                      </div>
                    </div>
                  </div>

                  <div className="info-row">
                    <div className="info-item">
                      <FontAwesomeIcon icon={faBed} />
                      <div>
                        <strong>Room</strong>
                        <p>{boarder.hotel_room?.room_number || boarder.roomReservation?.room?.room_name || "N/A"}</p>
                      </div>
                    </div>
                    <div className="info-item">
                      <FontAwesomeIcon icon={faCalendarAlt} />
                      <div>
                        <strong>Check-out</strong>
                        <p>{formatDate(boarder.check_out_date || boarder.check_out)}</p>
                      </div>
                    </div>
                  </div>

                  {boarder.special_requests && (
                    <div className="special-requests">
                      <FontAwesomeIcon icon={faExclamationTriangle} />
                      <span>{boarder.special_requests}</span>
                    </div>
                  )}

                  {boarder.medication_notes && (
                    <div className="medication-notes">
                      <FontAwesomeIcon icon={faNotesMedical} />
                      <div>
                        <strong>Medication Notes</strong>
                        <p>{boarder.medication_notes}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="page-footer">
        <small>
          Last updated: {lastUpdated.toLocaleTimeString()} • 
          Total: {filteredBoarders.length} boarder{filteredBoarders.length !== 1 ? 's' : ''}
        </small>
      </div>
    </div>
  );
};

export default VeterinaryCurrentBoarders;
