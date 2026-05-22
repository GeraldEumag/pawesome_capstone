import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaPlus,
  FaClipboardList,
  FaHotel,
  FaCut,
  FaStethoscope,
  FaPaw,
  FaCalendarAlt,
} from "react-icons/fa";
import CustomerRequestStatus from "./CustomerRequestStatus";
import "./CustomerServices.css";

const SERVICE_CARDS = [
  {
    key: "hotel",
    title: "Pet Hotel / Boarding",
    description: "Book a comfortable stay for your pet.",
    icon: <FaHotel />,
    route: "/customer/hotel",
    color: "#4f46e5",
  },
  {
    key: "grooming",
    title: "Grooming",
    description: "Schedule a grooming session.",
    icon: <FaCut />,
    route: "/customer/grooming",
    color: "#ec4899",
  },
  {
    key: "vet",
    title: "Veterinary",
    description: "Book a vet consultation.",
    icon: <FaStethoscope />,
    route: "/customer/vet",
    color: "#10b981",
  },
];

const CustomerServices = () => {
  const [activeTab, setActiveTab] = useState("new");
  const navigate = useNavigate();

  return (
    <div className="customer-services-page">
      <section className="cs-hero">
        <span className="cs-badge">Customer Portal</span>
        <h1>Services</h1>
        <p>Request new services or track your existing bookings.</p>
      </section>

      <div className="cs-tabs">
        <button
          className={`cs-tab ${activeTab === "new" ? "active" : ""}`}
          onClick={() => setActiveTab("new")}
        >
          <FaPlus />
          New Request
        </button>
        <button
          className={`cs-tab ${activeTab === "my" ? "active" : ""}`}
          onClick={() => setActiveTab("my")}
        >
          <FaClipboardList />
          My Requests
        </button>
      </div>

      {activeTab === "new" && (
        <section className="cs-new-request">
          <div className="cs-cards">
            {SERVICE_CARDS.map((svc) => (
              <div
                key={svc.key}
                className="cs-card"
                onClick={() => navigate(svc.route)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && navigate(svc.route)}
              >
                <div className="cs-card-icon" style={{ color: svc.color }}>
                  {svc.icon}
                </div>
                <h3>{svc.title}</h3>
                <p>{svc.description}</p>
                <span className="cs-card-action" style={{ background: svc.color }}>
                  Book Now
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === "my" && <CustomerRequestStatus />}
    </div>
  );
};

export default CustomerServices;
