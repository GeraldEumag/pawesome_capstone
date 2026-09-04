import React, { useState } from "react";
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
} from "@fortawesome/free-solid-svg-icons";
import WalkInBookingModal from "./modals/WalkInBookingModal";
import "./ReceptionistWalkIns.css";

const ReceptionistWalkIns = () => {
  const [showModal, setShowModal] = useState(false);
  const [selectedServiceType, setSelectedServiceType] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");

  const handleNewWalkIn = (serviceType) => {
    setSelectedServiceType(serviceType);
    setShowModal(true);
  };

  const handleSuccess = (message) => {
    setSuccessMessage(message);
    setShowModal(false);
    setSelectedServiceType(null);

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
      title: "Default Password",
      desc: "New accounts are created with Password123! — remind customers to change it.",
    },
    {
      icon: faShieldAlt,
      title: "Inform Customers",
      desc: "Always notify customers to update their password after first login.",
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
              onClick={() => handleNewWalkIn(service.key)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && handleNewWalkIn(service.key)}
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
                onClick={(e) => { e.stopPropagation(); handleNewWalkIn(service.key); }}
                tabIndex={-1}
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
              <p className="recent-sub">Bookings created today will appear here</p>
            </div>
          </div>
        </div>

        <div className="recent-empty">
          <div className="empty-icon-wrap">
            <FontAwesomeIcon icon={faPaw} />
          </div>
          <p className="empty-heading">No walk-ins yet today</p>
          <span className="empty-hint">Use the service cards above to create a new walk-in booking.</span>
        </div>
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
