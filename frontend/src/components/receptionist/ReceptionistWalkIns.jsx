import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faInfoCircle,
  faCheckCircle,
  faPlus,
  faHistory,
  faWalking,
  faHotel,
  faStethoscope,
  faCut,
  faShieldAlt,
  faKey,
  faClipboardCheck,
  faArrowRight,
  faPaw,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import WalkInBookingModal from "./modals/WalkInBookingModal";
import { apiRequest } from "../../api/client";
import "./ReceptionistWalkIns.css";

const TYPE_META = {
  hotel: { icon: faHotel, label: "Hotel" },
  veterinary: { icon: faStethoscope, label: "Vet" },
  grooming: { icon: faCut, label: "Grooming" },
};

const formatStatus = (s) => String(s || "pending").replace(/_/g, " ");

const formatPeso = (v) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(v || 0));

const formatDate = (value) => {
  if (!value) return "—";
  const d = new Date(String(value).slice(0, 10) + "T00:00:00");
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
};

const formatTime = (value) => {
  if (!value) return "";
  const [h, m] = String(value).split(":");
  if (h == null || m == null) return value;
  const hour = Number(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${m.slice(0, 2)} ${ampm}`;
};

const ReceptionistWalkIns = () => {
  const [showModal, setShowModal] = useState(false);
  const [selectedServiceType, setSelectedServiceType] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [recentWalkIns, setRecentWalkIns] = useState([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentError, setRecentError] = useState("");

  const fetchRecent = useCallback(async () => {
    try {
      setRecentLoading(true);
      setRecentError("");
      const res = await apiRequest("/receptionist/walk-ins");
      setRecentWalkIns(Array.isArray(res?.data) ? res.data : []);
    } catch (e) {
      setRecentWalkIns([]);
      setRecentError(e.message || "Failed to load recent walk-ins.");
    } finally {
      setRecentLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecent();
  }, [fetchRecent]);

  const handleNewWalkIn = (serviceType) => {
    setSelectedServiceType(serviceType);
    setShowModal(true);
  };

  const handleSuccess = (message) => {
    setSuccessMessage(message);
    setShowModal(false);
    setSelectedServiceType(null);
    fetchRecent();

    // Clear success message after 5 seconds
    setTimeout(() => {
      setSuccessMessage("");
    }, 5000);
  };

  const serviceTypes = [
    {
      key: "hotel",
      label: "Hotel / Boarding",
      icon: faHotel,
      description: "Create a hotel or boarding reservation for a walk-in customer",
      color: "#8b5cf6",
      gradient: "linear-gradient(135deg, #8b5cf6, #a78bfa)",
      badge: "Boarding",
    },
    {
      key: "veterinary",
      label: "Veterinary",
      icon: faStethoscope,
      description: "Schedule a veterinary appointment for a walk-in customer",
      color: "#ef4444",
      gradient: "linear-gradient(135deg, #ef4444, #f87171)",
      badge: "Appointment",
    },
    {
      key: "grooming",
      label: "Grooming",
      icon: faCut,
      description: "Book a grooming service for a walk-in customer",
      color: "#10b981",
      gradient: "linear-gradient(135deg, #10b981, #34d399)",
      badge: "Service",
    },
  ];

  const importantNotes = [
    {
      icon: faKey,
      title: "Account Setup",
      desc: "New customers receive a secure email link to choose their password.",
    },
    {
      icon: faShieldAlt,
      title: "Inform Customers",
      desc: "Let customers know to follow the password setup link in their email.",
    },
    {
      icon: faClipboardCheck,
      title: "Fill Fields Correctly",
      desc: "Ensure all required fields are completed to avoid booking errors.",
    },
  ];

  return (
    <div className="walkins-page">

      {/* Success Toast */}
      {successMessage && (
        <div className="walkins-toast">
          <FontAwesomeIcon icon={faCheckCircle} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Hero Banner */}
      <div className="walkins-hero">
        <div className="walkins-hero-left">
          <div className="walkins-hero-badge">
            <FontAwesomeIcon icon={faWalking} />
            Walk-in Desk
          </div>
          <h1 className="walkins-hero-title">Walk-in Customers</h1>
          <p className="walkins-hero-sub">
            Create bookings instantly for walk-in customers — with or without an existing account.
          </p>
          <div className="walkins-hero-stats">
            <span className="hero-stat-chip">
              <FontAwesomeIcon icon={faHotel} /> Hotel
            </span>
            <span className="hero-stat-chip">
              <FontAwesomeIcon icon={faStethoscope} /> Veterinary
            </span>
            <span className="hero-stat-chip">
              <FontAwesomeIcon icon={faCut} /> Grooming
            </span>
          </div>
        </div>
        <div className="walkins-hero-right">
          <div className="walkins-notes-card">
            <div className="notes-card-header">
              <FontAwesomeIcon icon={faInfoCircle} />
              <span>Staff Notes</span>
            </div>
            <ul className="notes-list">
              {importantNotes.map((note, i) => (
                <li key={i} className="note-item">
                  <div className="note-icon-wrap">
                    <FontAwesomeIcon icon={note.icon} />
                  </div>
                  <div className="note-text">
                    <strong>{note.title}</strong>
                    <span>{note.desc}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Service Selection */}
      <div className="walkins-services">
        <div className="services-section-header">
          <span className="services-eyebrow">Quick Action</span>
          <h2 className="services-title">Select a Service to Book</h2>
          <p className="services-sub">Choose the service type for this walk-in customer</p>
        </div>

        <div className="service-cards-grid">
          {serviceTypes.map((service) => (
            <div
              key={service.key}
              className="service-card"
              style={{ "--svc-color": service.color, "--svc-gradient": service.gradient }}
            >
              {/* Card accent top */}
              <div className="svc-card-top">
                <div className="svc-icon-ring">
                  <FontAwesomeIcon icon={service.icon} />
                </div>
                <span className="svc-badge">{service.badge}</span>
              </div>

              {/* Card body */}
              <div className="svc-card-body">
                <h3 className="svc-label">{service.label}</h3>
                <p className="svc-desc">{service.description}</p>
              </div>

              {/* CTA */}
              <button
                type="button"
                className="svc-cta-btn"
                onClick={() => handleNewWalkIn(service.key)}
              >
                <FontAwesomeIcon icon={faPlus} />
                New Booking
                <FontAwesomeIcon icon={faArrowRight} className="cta-arrow" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Walk-ins */}
      <div className="walkins-recent">
        <div className="recent-header">
          <div className="recent-header-left">
            <FontAwesomeIcon icon={faHistory} className="recent-icon" />
            <div>
              <h2 className="recent-title">Recent Walk-in Bookings</h2>
              <p className="recent-sub">Latest walk-in bookings across all services</p>
            </div>
          </div>
        </div>

        {recentLoading ? (
          <div className="recent-empty" role="status">
            <FontAwesomeIcon icon={faSpinner} spin className="recent-loading-icon" />
            <p className="empty-heading">Loading walk-ins…</p>
          </div>
        ) : recentError ? (
          <div className="recent-empty" role="alert">
            <div className="empty-icon-wrap">
              <FontAwesomeIcon icon={faInfoCircle} />
            </div>
            <p className="empty-heading">Couldn't load walk-ins</p>
            <span className="empty-hint">{recentError}</span>
            <button type="button" className="walkins-retry-btn" onClick={fetchRecent}>Retry</button>
          </div>
        ) : recentWalkIns.length === 0 ? (
          <div className="recent-empty">
            <div className="empty-icon-wrap">
              <FontAwesomeIcon icon={faPaw} />
            </div>
            <p className="empty-heading">No walk-ins yet</p>
            <span className="empty-hint">Use the service cards above to create a new walk-in booking.</span>
          </div>
        ) : (
          <ul className="recent-list">
            {recentWalkIns.map((item) => {
              const meta = TYPE_META[item.request_type] || TYPE_META.grooming;
              const serviceType = String(item.request_type || "").toLowerCase();
              const path = serviceType === "hotel"
                ? "/receptionist/bookings/hotel"
                : serviceType === "veterinary"
                  ? "/receptionist/bookings/veterinary"
                  : "/receptionist/bookings/grooming";
              return (
                <li key={item.id} className="recent-item">
                  <div className={`recent-type-icon type-${item.request_type}`}>
                    <FontAwesomeIcon icon={meta.icon} />
                  </div>
                  <div className="recent-item-main">
                    <div className="recent-item-top">
                      <strong>{item.pet_name || "Pet"}</strong>
                      <span className="recent-owner">— {item.customer_name || "Walk-in"}</span>
                    </div>
                    <span className="recent-service">
                      {meta.label} · {item.service_name || "Service"}
                    </span>
                  </div>
                  <div className="recent-item-when">
                    <span className="recent-date">{formatDate(item.request_date)}</span>
                    {item.request_time && <span className="recent-time">{formatTime(item.request_time)}</span>}
                  </div>
                  <div className="recent-item-side">
                    <span className={`recent-badge status-${String(item.status || "pending").toLowerCase()}`}>
                      {formatStatus(item.status)}
                    </span>
                    {item.price > 0 && <span className="recent-price">{formatPeso(item.price)}</span>}
                    <Link className="recent-open-link" to={path}>Open list</Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Walk-in Booking Modal */}
      {showModal && (
        <WalkInBookingModal
          serviceType={selectedServiceType}
          onClose={() => {
            setShowModal(false);
            setSelectedServiceType(null);
          }}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
};

export default ReceptionistWalkIns;
