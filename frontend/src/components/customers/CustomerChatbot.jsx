import React from "react";
import RoleAwareChatbot from "../chatbot/RoleAwareChatbot";
import "./CustomerChatbot.css";

export default function CustomerChatbot() {
  const botFeatures = [
    {
      icon: "📅",
      title: "Book Appointments",
      description: "Chat your way through booking vet, grooming, or hotel stays — step by step.",
    },
    {
      icon: "🐾",
      title: "Pet Support",
      description: "Get help about pet profiles, services, and appointment details.",
    },
    {
      icon: "�",
      title: "Live Staff Chat",
      description: "Request a live chat and a receptionist will respond directly in the chatbot.",
    },
    {
      icon: "👩‍💼",
      title: "Receptionist Approval",
      description: "Booking requests are reviewed and approved by the receptionist.",
    },
  ];

  return (
    <section className="customer-chatbot-page">
      <div className="chatbot-hero-card">
        <div className="chatbot-hero-left">
          <span className="chatbot-eyebrow">AI Customer Support</span>
          <h1>Customer Assistant</h1>
          <p>
            Ask about bookings, services, pets, payments, and receptionist approval status.
            The assistant helps guide you, while official booking approval is handled by
            the receptionist.
          </p>

          <div className="chatbot-status-pill">
            <span className="status-dot"></span>
            Online assistant ready
          </div>
        </div>

        <div className="chatbot-hero-bot">
          <div className="bot-glow"></div>
          <div className="bot-face">
            <span>🐶</span>
          </div>
          <strong>Pawesome Bot</strong>
          <small>Customer Care Assistant</small>
        </div>
      </div>

      <div className="chatbot-feature-grid">
        {botFeatures.map((feature) => (
          <article className="chatbot-feature-card" key={feature.title}>
            <span className="feature-icon">{feature.icon}</span>
            <div>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </div>
          </article>
        ))}
      </div>

      <div className="chatbot-reminder-card">
        <strong>Important:</strong>
        <span>
          The chatbot can guide customers, but booking approval, rejection,
          rescheduling, and payment verification should be handled by the receptionist.
        </span>
      </div>

      <div className="customer-chatbot-shell">
        <RoleAwareChatbot
          mode="embedded"
          title="Customer Assistant"
          subtitle="Bookings, services, pets, and support"
          role="customer"
        />
      </div>
    </section>
  );
}
