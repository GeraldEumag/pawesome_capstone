import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faFileMedical,
  faFileInvoiceDollar,
  faPaw,
  faUser,
  faStethoscope,
  faSpinner,
  faCircleCheck,
  faClock,
  faMoneyBillWave,
} from "@fortawesome/free-solid-svg-icons";
import toast from "react-hot-toast";
import { apiRequest } from "../../api/client";
import PetAvatar from "../shared/PetAvatar";
import ServiceBillingPanel from "../shared/ServiceBillingPanel";
import "./theme.css";
import "./VetAppointmentBilling.css";

// Payment status display helper
const getPaymentBadge = (status) => {
  const map = {
    paid: { label: "Paid", cls: "billing-badge--paid" },
    partial: { label: "Partially Paid", cls: "billing-badge--partial" },
    unpaid: { label: "Unpaid", cls: "billing-badge--unpaid" },
    pending: { label: "Pending", cls: "billing-badge--pending" },
  };
  return (
    map[String(status || "unpaid").toLowerCase()] || {
      label: String(status || "unpaid").replace(/_/g, " "),
      cls: "billing-badge--unpaid",
    }
  );
};

const VetAppointmentBilling = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [appointment, setAppointment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [billingSummary, setBillingSummary] = useState(null);

  const loadAppointment = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiRequest(`/veterinary/appointments/${id}`);
      setAppointment(response?.appointment || response);
    } catch (err) {
      toast.error(err.message || "Failed to load appointment.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadAppointment();
  }, [loadAppointment]);

  const handleBillingUpdate = useCallback((billing) => {
    setBillingSummary(billing || null);
  }, []);

  const serviceLabel = useMemo(() => {
    const service = appointment?.service;
    return service?.name || appointment?.service_name || "Veterinary Consultation";
  }, [appointment]);

  if (loading) {
    return (
      <section className="vet-billing-page">
        <div className="billing-loading">
          <FontAwesomeIcon icon={faSpinner} spin />
          <span>Loading billing details...</span>
        </div>
      </section>
    );
  }

  if (!appointment) {
    return (
      <section className="vet-billing-page">
        <div className="billing-empty">Appointment not found.</div>
      </section>
    );
  }

  const paymentBadge = getPaymentBadge(
    billingSummary?.payment_status || appointment?.payment_status
  );

  return (
    <section className="vet-billing-page">

      {/* ── Header ─────────────────────────────────── */}
      <div className="billing-header">
        <button
          type="button"
          className="billing-back"
          onClick={() => navigate(`/veterinary/appointments/${id}/consult`)}
        >
          <FontAwesomeIcon icon={faArrowLeft} />
          Back to Consultation
        </button>
        <div className="billing-header-copy">
          <span className="billing-eyebrow">
            <FontAwesomeIcon icon={faFileInvoiceDollar} />
            Billing
          </span>
          <h2>{appointment.pet?.name || "Patient"} — Billing Details</h2>
          <p>{serviceLabel}</p>
        </div>
      </div>

      {/* ── Patient Summary ─────────────────────────── */}
      <div className="billing-section-card">
        <div className="billing-section-header">
          <div className="billing-section-icon">
            <FontAwesomeIcon icon={faPaw} />
          </div>
          <div className="billing-section-title-group">
            <h3>Patient Summary</h3>
            <p>Appointment information</p>
          </div>
        </div>
        <div className="billing-summary-grid">
          <article>
            <PetAvatar pet={appointment.pet} size={40} />
            <span>Pet</span>
            <strong>{appointment.pet?.name || "Unknown"}</strong>
            <small>
              {appointment.pet?.species || "Pet"}
              {appointment.pet?.breed ? ` · ${appointment.pet.breed}` : ""}
            </small>
          </article>
          <article>
            <FontAwesomeIcon icon={faUser} />
            <span>Owner</span>
            <strong>{appointment.customer?.name || "Unknown owner"}</strong>
            <small>
              {appointment.customer?.phone ||
                appointment.customer?.email ||
                "No contact"}
            </small>
          </article>
          <article>
            <FontAwesomeIcon icon={faStethoscope} />
            <span>Service</span>
            <strong>{serviceLabel}</strong>
            <small>{appointment.service?.category || "Veterinary service"}</small>
          </article>
          <article>
            <FontAwesomeIcon icon={faClock} />
            <span>Date</span>
            <strong>
              {appointment.scheduled_at
                ? new Date(appointment.scheduled_at).toLocaleDateString("en-PH", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "TBD"}
            </strong>
            <small>
              {appointment.scheduled_at
                ? new Date(appointment.scheduled_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : ""}
            </small>
          </article>
          <article>
            <FontAwesomeIcon icon={faCircleCheck} />
            <span>Consultation</span>
            <strong>
              {["awaiting_payment", "completed"].includes(appointment.status)
                ? "Complete"
                : String(appointment.status || "").replace(/_/g, " ")}
            </strong>
            <small>
              <span className={`billing-badge ${paymentBadge.cls}`}>
                {paymentBadge.label}
              </span>
            </small>
          </article>
        </div>
      </div>

      {/* ── Billing Summary ──────────────────────────── */}
      {billingSummary && (
        <div className="billing-section-card">
          <div className="billing-section-header">
            <div className="billing-section-icon">
              <FontAwesomeIcon icon={faMoneyBillWave} />
            </div>
            <div className="billing-section-title-group">
              <h3>Billing Overview</h3>
              <p>Current charges and payment status</p>
            </div>
          </div>
          <div className="billing-totals-grid">
            <div className="billing-total-item">
              <span className="billing-total-label">Total Bill</span>
              <span className="billing-total-value">
                PHP {Number(billingSummary.total_bill || 0).toFixed(2)}
              </span>
            </div>
            <div className="billing-total-item">
              <span className="billing-total-label">Amount Paid</span>
              <span className="billing-total-value">
                PHP {Number(billingSummary.total_paid || 0).toFixed(2)}
              </span>
            </div>
            <div className="billing-total-item billing-total-item--highlight">
              <span className="billing-total-label">Balance Due</span>
              <span className="billing-total-value billing-total-value--accent">
                PHP {Number(billingSummary.balance_due || 0).toFixed(2)}
              </span>
            </div>
            <div className="billing-total-item">
              <span className="billing-total-label">Payment Status</span>
              <span className={`billing-badge ${paymentBadge.cls}`}>
                {paymentBadge.label}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Service Billing Panel ────────────────────── */}
      <div className="billing-section-card">
        <div className="billing-section-header">
          <div className="billing-section-icon">
            <FontAwesomeIcon icon={faFileMedical} />
          </div>
          <div className="billing-section-title-group">
            <h3>Service Charges</h3>
            <p>
              Itemized billing — additional charges can be added here (e.g.
              medications, injections, lab tests)
            </p>
          </div>
        </div>
        <div className="billing-panel-body">
          <ServiceBillingPanel
            serviceType="veterinary"
            serviceId={appointment.id}
            petId={appointment.pet_id}
            onBillingUpdate={handleBillingUpdate}
          />
        </div>
      </div>

    </section>
  );
};

export default VetAppointmentBilling;
