import React from "react";
import { useNavigate } from "react-router-dom";
import {
  FaHotel,
  FaCut,
  FaStethoscope,
  FaArrowRight,
} from "react-icons/fa";
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

const CustomerServices = () => {
  const navigate = useNavigate();

  return (
    <section className="customer-services-page">
      <div className="cs-panel">
        <div className="cs-panel-header">
          <div>
            <span className="cs-kicker">Services</span>
            <h4>Book a Service</h4>
            <p>Choose a service below to start a new booking.</p>
          </div>

        </div>

        <div className="cs-panel-body">
          <div className="cs-cards">
              {SERVICE_CARDS.map((svc) => (
                <div key={svc.key} className="cs-card">
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
                  <button
                    type="button"
                    className="cs-card-action"
                    style={{ background: svc.color }}
                    onClick={() => navigate(svc.route)}
                  >
                    Book Now
                    <FaArrowRight />
                  </button>
                </div>
              ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default CustomerServices;
