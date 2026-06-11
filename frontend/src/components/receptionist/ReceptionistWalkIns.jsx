import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUserPlus,
  faInfoCircle,
  faExclamationTriangle,
  faCheckCircle,
  faPlus,
  faHistory,
  faWalking,
  faHotel,
  faStethoscope,
  faCut,
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
    },
    {
      key: "veterinary",
      label: "Veterinary",
      icon: faStethoscope,
      description: "Schedule a veterinary appointment for a walk-in customer",
      color: "#ef4444",
    },
    {
      key: "grooming",
      label: "Grooming",
      icon: faCut,
      description: "Book a grooming service for a walk-in customer",
      color: "#10b981",
    },
  ];

  return (
    <div className="walkins-page">
      {/* Header */}
      <div className="walkins-header">
        <div className="header-title">
          <h1>
            <FontAwesomeIcon icon={faWalking} /> Walk-in Customers
          </h1>
          <p>Create bookings for walk-in customers with or without accounts</p>
        </div>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="alert alert-success">
          <FontAwesomeIcon icon={faCheckCircle} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Info Banner */}
      <div className="info-banner">
        <FontAwesomeIcon icon={faInfoCircle} />
        <div>
          <strong>Important Notes:</strong>
          <ul>
            <li>For customers without accounts, the system will automatically create one with a default password: <strong>Password123!</strong></li>
            <li>Please inform customers to change their password after their first login.</li>
            <li>Ensure all required fields are filled correctly to avoid booking errors.</li>
          </ul>
        </div>
      </div>

      {/* Service Type Selection */}
      <div className="service-selection">
        <h2>Select Service Type</h2>
        <div className="service-cards">
          {serviceTypes.map((service) => (
            <button
              key={service.key}
              type="button"
              className="service-card"
              onClick={() => handleNewWalkIn(service.key)}
              style={{ "--service-color": service.color }}
            >
              <div className="card-icon" style={{ background: service.color }}>
                <FontAwesomeIcon icon={service.icon} />
              </div>
              <div className="card-content">
                <h3>{service.label}</h3>
                <p>{service.description}</p>
              </div>
              <div className="card-action">
                <FontAwesomeIcon icon={faPlus} />
                <span>New Booking</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Recent Walk-ins Section (Placeholder for future enhancement) */}
      <div className="recent-walkins">
        <div className="section-header">
          <FontAwesomeIcon icon={faHistory} />
          <h2>Recent Walk-in Bookings</h2>
        </div>
        <div className="empty-state">
          <FontAwesomeIcon icon={faWalking} size="3x" />
          <p>No recent walk-in bookings to display</p>
          <small>Walk-in bookings created today will appear here</small>
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
