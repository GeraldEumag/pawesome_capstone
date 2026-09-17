import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaPlus,
  FaClipboardList,
  FaHotel,
  FaCut,
  FaStethoscope,
  FaArrowRight,
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
    light: "#818cf8",
  },
  {
    key: "grooming",
    title: "Grooming",
    description: "Schedule a grooming session.",
    icon: <FaCut />,
    route: "/customer/grooming",
    color: "#ec4899",
    light: "#f472b6",
  },
  {
    key: "vet",
    title: "Veterinary",
    description: "Book a vet consultation.",
    icon: <FaStethoscope />,
    route: "/customer/vet",
    color: "#10b981",
    light: "#34d399",
  },
];

const CustomerServices = ({ initialTab = "new" }) => {
  const [activeTab, setActiveTab] = useState(initialTab);
  const navigate = useNavigate();

  return (
    <section className="customer-services-page">
      <header className="cs-header">
        <div>
          <span className="cs-kicker">Customer Portal</span>
          <h3>Services</h3>
          <p>Request new services or track your existing bookings.</p>
        </div>
      </header>

      <div className="cs-panel">
        <div className="cs-panel-header">
          <div>
            <span className="cs-kicker">Services</span>
            <h4>{activeTab === "new" ? "Book a Service" : "My Requests"}</h4>
            <p>
              {activeTab === "new"
                ? "Choose a service below to start a new booking."
                : "Track the status of your submitted service requests."}
            </p>
          </div>

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
        </div>

        <div className="cs-panel-body">
          {activeTab === "new" && (
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
                  <div
                    className="cs-card-icon"
                    style={{
                      background: `linear-gradient(135deg, ${svc.color}, ${svc.light})`,
                      boxShadow: `0 12px 24px ${svc.color}40`,
                    }}
                  >
                    {svc.icon}
                  </div>
                  <h3>{svc.title}</h3>
                  <p>{svc.description}</p>
                  <span
                    className="cs-card-action"
                    style={{ background: svc.color }}
                  >
                    Book Now
                    <FaArrowRight />
                  </span>
                </div>
              ))}
            </div>
          )}

          {activeTab === "my" && <CustomerRequestStatus embedded />}
        </div>
      </div>
    </section>
  );
};

export default CustomerServices;
