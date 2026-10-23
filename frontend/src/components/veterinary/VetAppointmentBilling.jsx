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
  faPaperPlane,
  faTriangleExclamation,
  faCircleInfo,
} from "@fortawesome/free-solid-svg-icons";
import toast from "react-hot-toast";
import { apiRequest } from "../../api/client";
import PetAvatar from "../shared/PetAvatar";
import ServiceBillingPanel from "../shared/ServiceBillingPanel";
import { VET_STARTED_STATUSES, VET_POST_CLINICAL_STATUSES } from "./vetStatus";
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
  const [record, setRecord] = useState(null);
  const [recordLoaded, setRecordLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [billingSummary, setBillingSummary] = useState(null);

  const loadRecord = useCallback(async (apt) => {
    if (!apt?.pet_id) {
      setRecordLoaded(true);
      return;
    }
    try {
      const res = await apiRequest(`/veterinary/pets/${apt.pet_id}/medical-records`);
      const records = Array.isArray(res) ? res : (Array.isArray(res?.records) ? res.records : []);
      setRecord(
        records.find((item) => Number(item.appointment_id) === Number(apt.id)) || null
      );
    } catch {
      setRecord(null);
    } finally {
      setRecordLoaded(true);
    }
  }, []);

  const loadAppointment = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiRequest(`/veterinary/appointments/${id}`);
      const apt = response?.appointment || response;
      setAppointment(apt);
      await loadRecord(apt);
    } catch (err) {
      toast.error(err.message || "Failed to load appointment.");
    } finally {
      setLoading(false);
    }
  }, [id, loadRecord]);

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

  // ── Handoff state ─────────────────────────────────────────
  const status = appointment?.status || "";
  const isStarted = VET_STARTED_STATUSES.includes(status);
  const recordFinalized = ["finalized", "locked"].includes(record?.status);
  const sentToCashier = ["clinical_complete", "checkout"].includes(status);
  const isCompleted = status === "completed";
  const canSend = isStarted && recordFinalized && recordLoaded;

  const sendToCashier = async () => {
    try {
      setSending(true);
      await apiRequest(
        `/veterinary/consultations/${appointment.id}/complete`,
        "POST",
        {},
        { headers: { "Idempotency-Key": `vet-complete-${appointment.id}` } }
      );
      toast.success(
        "Bill sent to the cashier. The visit closes automatically once payment is verified."
      );
      await loadAppointment();
    } catch (err) {
      // A second click after the visit already moved on is not an error.
      try {
        const res = await apiRequest(`/veterinary/appointments/${id}`);
        const fresh = res?.appointment || res;
        setAppointment(fresh);
        if (VET_POST_CLINICAL_STATUSES.includes(fresh?.status)) {
          toast.success("Bill is already with the cashier.");
          return;
        }
      } catch {
        /* fall through to the error toast */
      }
      toast.error(err.message || "Failed to send the bill to the cashier.");
    } finally {
      setSending(false);
    }
  };

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
              {VET_POST_CLINICAL_STATUSES.includes(appointment.status)
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

      {/* ── Cashier Handoff ─────────────────────────── */}
      {isStarted && recordLoaded && !recordFinalized && (
        <div className="billing-handoff billing-handoff--warning">
          <div className="billing-handoff-icon">
            <FontAwesomeIcon icon={faTriangleExclamation} />
          </div>
          <div className="billing-handoff-copy">
            <strong>Finalize the consultation record first</strong>
            <p>
              The medical record for this visit is not finalized yet. Save and
              finalize it on the consultation page before sending the bill to
              the cashier.
            </p>
          </div>
          <button
            type="button"
            className="billing-send-btn billing-send-btn--muted"
            onClick={() => navigate(`/veterinary/appointments/${id}/consult`)}
          >
            <FontAwesomeIcon icon={faFileMedical} />
            Back to Consultation
          </button>
        </div>
      )}

      {canSend && (
        <div className="billing-handoff billing-handoff--send">
          <div className="billing-handoff-icon">
            <FontAwesomeIcon icon={faPaperPlane} />
          </div>
          <div className="billing-handoff-copy">
            <strong>Review the charges, then send to the cashier</strong>
            <p>
              Check the itemized bill below — consultation fee, prescriptions,
              and any additional charges. Once sent, the customer pays at the
              cashier and the visit closes automatically.
            </p>
          </div>
          <button
            type="button"
            className="billing-send-btn"
            onClick={sendToCashier}
            disabled={sending}
          >
            {sending ? (
              <FontAwesomeIcon icon={faSpinner} spin />
            ) : (
              <FontAwesomeIcon icon={faPaperPlane} />
            )}
            Send to Cashier
          </button>
        </div>
      )}

      {sentToCashier && (
        <div className="billing-handoff billing-handoff--sent">
          <div className="billing-handoff-icon">
            <FontAwesomeIcon icon={faCircleCheck} />
          </div>
          <div className="billing-handoff-copy">
            <strong>Sent to the cashier — awaiting payment</strong>
            <p>
              The visit closes automatically once the cashier verifies payment.
              You can still add late charges below if something was missed.
            </p>
          </div>
          <span className={`billing-badge ${paymentBadge.cls}`}>
            {paymentBadge.label}
          </span>
        </div>
      )}

      {isCompleted && (
        <div className="billing-handoff billing-handoff--done">
          <div className="billing-handoff-icon">
            <FontAwesomeIcon icon={faCircleCheck} />
          </div>
          <div className="billing-handoff-copy">
            <strong>Visit completed</strong>
            <p>Payment has been verified and this visit is closed.</p>
          </div>
          <span className={`billing-badge ${paymentBadge.cls}`}>
            {paymentBadge.label}
          </span>
        </div>
      )}

      {!isStarted && !sentToCashier && !isCompleted && (
        <div className="billing-handoff billing-handoff--muted">
          <div className="billing-handoff-icon">
            <FontAwesomeIcon icon={faCircleInfo} />
          </div>
          <div className="billing-handoff-copy">
            <strong>Consultation has not started</strong>
            <p>
              The bill can only be sent to the cashier after the veterinarian
              finalizes the consultation.
            </p>
          </div>
        </div>
      )}

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
