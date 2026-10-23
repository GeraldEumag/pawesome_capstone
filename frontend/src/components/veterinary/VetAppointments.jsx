import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { showCancellationReasonPrompt } from "../../utils/alert.jsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarAlt,
  faPaw,
  faStethoscope,
  faEdit,
  faTrash,
  faClock,
  faCheckCircle,
  faTimesCircle,
  faSpinner,
  faExclamationTriangle,
  faRotateRight,
  faEye,
  faCircleCheck,
  faPlay,
  faFilter,
  faCalendarDay,
  faChartLine,
  faXmark,
  faMoneyBillWave,
  faClipboardCheck,
} from "@fortawesome/free-solid-svg-icons";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { apiRequest } from "../../api/client";
import StandardTable from "../shared/StandardTable";
import { VET_CANCEL_RESTRICTED_STATUSES, VET_POST_CLINICAL_STATUSES, VET_STARTABLE_STATUSES, VET_STARTED_STATUSES } from "./vetStatus";
import "./theme.css";
import "../../styles/bookingModal.css";
import "./VetAppointments.css";

const isRequestCancelled = (error, signal) =>
  signal?.aborted ||
  error?.name === "AbortError" ||
  error?.message === "Request was cancelled";

const isGenericFetchFailure = (error) =>
  error?.name === "TypeError" && error?.message === "Failed to fetch";

const VetAppointments = () => {
  const navigate = useNavigate();
  const mountedRef = useRef(true);
  const fetchAbortRef = useRef(null);
  const [appointments, setAppointments] = useState([]);
  const [historyAppointments, setHistoryAppointments] = useState([]);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [sortKey, setSortKey] = useState("scheduledAt");
  const [sortDirection, setSortDirection] = useState("asc");

  const safeArray = (value) => {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.appointments)) return value.appointments;
    if (Array.isArray(value?.data)) return value.data;
    if (Array.isArray(value?.records)) return value.records;
    return [];
  };

  const formatDate = (value) => {
    if (!value) return "TBD";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "TBD";

    return date.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatDateKey = (value) => {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    return date.toISOString().split("T")[0];
  };

  const formatTime = (value) => {
    if (!value) return "TBD";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "TBD";

    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const normalizeStatus = (status) => {
    return String(status || "requested").toLowerCase().replace(/\s+/g, "_");
  };

  const transformAppointment = useCallback((apt) => {
    const scheduledAt =
      apt?.scheduled_at ||
      apt?.appointment_date ||
      apt?.date ||
      apt?.schedule ||
      null;

    const petName =
      apt?.pet?.name ||
      apt?.pet_name ||
      apt?.patient_name ||
      "Unknown Pet";

    const ownerName =
      apt?.customer?.name ||
      apt?.owner?.name ||
      apt?.customer_name ||
      apt?.owner_name ||
      "Unknown Owner";

    const ownerPhone =
      apt?.customer?.phone ||
      apt?.owner?.phone ||
      apt?.customer_phone ||
      apt?.phone ||
      "N/A";

    const serviceName =
      apt?.service?.name ||
      apt?.service_name ||
      apt?.appointment_type ||
      apt?.type ||
      "General Consultation";

    return {
      id: apt?.id,
      raw: apt,
      pet: petName,
      owner: ownerName,
      ownerPhone,
      species: apt?.pet?.species || apt?.species || "Pet",
      breed: apt?.pet?.breed || apt?.breed || "Unknown breed",
      date: formatDate(scheduledAt),
      dateKey: formatDateKey(scheduledAt),
      time: formatTime(scheduledAt),
      service: serviceName,
      price: apt?.price || apt?.amount || apt?.total_amount || null,
      status: normalizeStatus(apt?.status),
      paymentStatus: normalizeStatus(apt?.payment_status),
      notes: apt?.notes || apt?.reason || apt?.description || "",
      scheduledAt,
      createdAt: apt?.created_at || apt?.createdAt || null,
    };
  }, []);

  const fetchAppointments = useCallback(async ({ silent = false } = {}) => {
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    const signal = controller.signal;

    try {
      if (!silent) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      const [data, historyData] = await Promise.all([
        apiRequest("/veterinary/appointments", { signal }),
        apiRequest("/veterinary/history?status=completed,cancelled&per_page=500", {
          signal,
        }).catch(() => null),
      ]);
      const appointmentsData = safeArray(data);
      const transformedAppointments = appointmentsData.map(transformAppointment);
      const transformedHistory = safeArray(historyData).map(transformAppointment);

      if (!mountedRef.current || signal?.aborted) return;

      setAppointments(transformedAppointments);
      if (historyData !== null) {
        setHistoryAppointments(transformedHistory);
      }
      setLastUpdated(new Date());
      setError("");
    } catch (err) {
      if (isRequestCancelled(err, signal) || !mountedRef.current) return;

      if (!isGenericFetchFailure(err)) {
        console.error("Failed to fetch appointments:", err);
      }
      setError("Failed to load appointments. Please try again.");
      setAppointments([]);

      if (!silent) {
        toast.error("Failed to load veterinary appointments.");
      }
    } finally {
      if (mountedRef.current && !signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [transformAppointment]);

  useEffect(() => {
    mountedRef.current = true;

    fetchAppointments({ silent: false });

    const interval = setInterval(() => {
      fetchAppointments({ silent: true });
    }, 15000);

    return () => {
      mountedRef.current = false;
      fetchAbortRef.current?.abort();
      clearInterval(interval);
    };
  }, [fetchAppointments]);

  const statusOptions = useMemo(
    () => [
      { key: "all", label: "All Active" },
      { key: "requested", label: "Incoming" },
      { key: "scheduled", label: "Scheduled" },
      { key: "checked_in", label: "Checked In" },
      { key: "in_consultation", label: "In Consultation" },
      { key: "in_treatment", label: "In Treatment" },
      { key: "awaiting_results", label: "Awaiting Results" },
      { key: "clinical_complete", label: "Clinical Complete" },
      { key: "checkout", label: "At Checkout" },
      { key: "completed", label: "Completed" },
      { key: "cancelled", label: "Cancelled" },
    ],
    []
  );

  const statusCounts = useMemo(() => {
    const counts = { all: appointments.length };

    appointments.forEach((appointment) => {
      counts[appointment.status] = (counts[appointment.status] || 0) + 1;
    });
    historyAppointments.forEach((appointment) => {
      counts[appointment.status] = (counts[appointment.status] || 0) + 1;
    });

    return counts;
  }, [appointments, historyAppointments]);

  const filteredAppointments = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    const source =
      filter === "completed" || filter === "cancelled"
        ? historyAppointments
        : appointments;

    return source.filter((appointment) => {
      const matchesFilter = filter === "all" || appointment.status === filter;

      const searchableText = [
        appointment.pet,
        appointment.owner,
        appointment.ownerPhone,
        appointment.species,
        appointment.breed,
        appointment.service,
        appointment.status,
        appointment.notes,
        appointment.date,
        appointment.time,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !keyword || searchableText.includes(keyword);

      return matchesFilter && matchesSearch;
    });
  }, [appointments, historyAppointments, filter, searchTerm]);

  const handleSort = useCallback((key, direction) => {
    setSortKey(key);
    setSortDirection(direction);
  }, []);

  const sortedAppointments = useMemo(() => {
    if (!sortKey) return filteredAppointments;
    const direction = sortDirection === "desc" ? -1 : 1;
    return [...filteredAppointments].sort((a, b) => {
      const va = a[sortKey] ?? "";
      const vb = b[sortKey] ?? "";
      return direction * String(va).localeCompare(String(vb), undefined, { numeric: true });
    });
  }, [filteredAppointments, sortKey, sortDirection]);

  const todayKey = new Date().toISOString().split("T")[0];

  const dashboardStats = useMemo(() => {
    const todayCount = appointments.filter((item) => item.dateKey === todayKey).length;
    const completedCount = historyAppointments.filter(
      (item) => item.status === "completed"
    ).length;
    const pendingCount = appointments.filter((item) => item.status === "requested").length;
    const approvedCount = appointments.filter((item) => item.status === "scheduled").length;
    const ongoingCount = appointments.filter((item) => VET_STARTED_STATUSES.includes(item.status)).length;
    const awaitingPaymentCount = appointments.filter((item) => item.status === "checkout").length;
    const totalVisits = appointments.length + historyAppointments.length;
    const completionRate =
      totalVisits > 0
        ? Math.round((completedCount / totalVisits) * 100)
        : 0;

    return {
      todayCount,
      completedCount,
      pendingCount,
      approvedCount,
      ongoingCount,
      awaitingPaymentCount,
      completionRate,
    };
  }, [appointments, historyAppointments, todayKey]);

  const getStatusIcon = (status) => {
    switch (status) {
      case "scheduled":
        return faCheckCircle;
      case "checked_in":
        return faCircleCheck;
      case "in_consultation":
      case "in_treatment":
        return faPlay;
      case "awaiting_results":
        return faSpinner;
      case "clinical_complete":
        return faClipboardCheck;
      case "checkout":
        return faMoneyBillWave;
      case "completed":
        return faCircleCheck;
      case "cancelled":
      case "canceled":
      case "rejected":
        return faTimesCircle;
      case "requested":
      default:
        return faClock;
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case "requested":
        return "Requested";
      case "checked_in":
        return "Checked In";
      case "in_consultation":
        return "In Consultation";
      case "in_treatment":
        return "In Treatment";
      case "awaiting_results":
        return "Awaiting Results";
      case "clinical_complete":
        return "Clinical Complete";
      case "checkout":
        return "At Checkout";
      case "no_show":
        return "No Show";
      default:
        return String(status || "Requested")
          .replace(/_/g, " ")
          .replace(/\b\w/g, (char) => char.toUpperCase());
    }
  };

  const updateAppointmentStatus = async (appointmentId, nextStatus, extras = {}) => {
    if (!appointmentId) {
      toast.error("Appointment ID not found.");
      return;
    }

    try {
      setActionLoadingId(`${appointmentId}-${nextStatus}`);

      if (nextStatus === "in_consultation") {
        await apiRequest(`/veterinary/appointments/${appointmentId}/start`, {
          method: "POST",
          body: JSON.stringify({ notes: "Appointment started by veterinarian" }),
        });
      } else {
        await apiRequest(`/veterinary/appointments/${appointmentId}/status`, {
          method: "PATCH",
          body: JSON.stringify({
            status: nextStatus,
            ...extras,
          }),
        });
      }

      toast.success(`Appointment marked as ${getStatusLabel(nextStatus)}.`);
      await fetchAppointments({ silent: true });

      if (nextStatus === "in_consultation") {
        navigate(`/veterinary/appointments/${appointmentId}/consult`);
      }
    } catch (err) {
      console.error("Failed to update appointment:", err);
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to update appointment status.";
      toast.error(errorMessage);
    } finally {
      setActionLoadingId(null);
    }
  };

  const cancelAppointment = async (appointmentId) => {
    if (!appointmentId) {
      toast.error("Appointment ID not found.");
      return;
    }

    const selection = await showCancellationReasonPrompt(
      "Select a reason for cancelling this appointment — it will be recorded.",
      "Cancel Appointment"
    );

    if (!selection) return;

    await updateAppointmentStatus(appointmentId, "cancelled", {
      cancellation_reason_code: selection.code,
      cancellation_note: selection.note,
    });
  };

  const appointmentColumns = useMemo(
    () => [
      {
        key: "scheduledAt",
        label: "Schedule",
        sortable: true,
        render: (_value, apt) => (
          <div className="apt-cell-stack">
            <strong>{apt.date}</strong>
            <small>{apt.time}</small>
          </div>
        ),
      },
      {
        key: "pet",
        label: "Patient",
        sortable: true,
        render: (_value, apt) => (
          <div className="apt-cell-stack">
            <strong>
              <FontAwesomeIcon icon={faPaw} /> {apt.pet}
            </strong>
            <small>
              {apt.species}
              {apt.breed ? ` · ${apt.breed}` : ""}
            </small>
          </div>
        ),
      },
      {
        key: "owner",
        label: "Owner",
        sortable: true,
        render: (_value, apt) => (
          <div className="apt-cell-stack">
            <strong>{apt.owner}</strong>
            <small>{apt.ownerPhone}</small>
          </div>
        ),
      },
      { key: "service", label: "Service" },
      {
        key: "status",
        label: "Status",
        sortable: true,
        render: (_value, apt) => {
          const isUnassignedPending =
            apt.status === "requested" &&
            !apt.raw?.veterinarian_id &&
            apt.raw?.veterinarian_id !== 0;
          return (
            <span className={`appointment-status ${apt.status}`}>
              <FontAwesomeIcon icon={getStatusIcon(apt.status)} />
              {isUnassignedPending ? "Incoming" : getStatusLabel(apt.status)}
              {isUnassignedPending && <em className="apt-unassigned">Unassigned</em>}
            </span>
          );
        },
      },
      {
        key: "paymentStatus",
        label: "Payment",
        render: (_value, apt) => (
          <span className={`apt-pay-badge apt-pay-badge--${apt.paymentStatus || "unpaid"}`}>
            {String(apt.paymentStatus || "unpaid").replace(/_/g, " ")}
          </span>
        ),
      },
      {
        key: "actions",
        label: "Actions",
        render: (_value, appointment) => {
          const isCompleted = appointment.status === "completed";
          const isCancelled = ["cancelled", "canceled", "rejected"].includes(
            appointment.status
          );
          const isUnassignedPending =
            appointment.status === "requested" &&
            !appointment.raw?.veterinarian_id &&
            appointment.raw?.veterinarian_id !== 0;
          const canStart = VET_STARTABLE_STATUSES.includes(appointment.status);
          const canConsult = VET_STARTED_STATUSES.includes(appointment.status);
          const isPostClinical = VET_POST_CLINICAL_STATUSES.includes(
            appointment.status
          );

          return (
            <>
              <button
                className="action-btn view-btn"
                type="button"
                onClick={() => setSelectedAppointment(appointment)}
              >
                <FontAwesomeIcon icon={faEye} /> View
              </button>
              {!isUnassignedPending && (
                <>
                  <button
                    className="action-btn start-btn"
                    type="button"
                    disabled={
                      !canStart ||
                      actionLoadingId === `${appointment.id}-in_consultation`
                    }
                    onClick={() =>
                      updateAppointmentStatus(appointment.id, "in_consultation")
                    }
                  >
                    <FontAwesomeIcon icon={faPlay} /> Start
                  </button>
                  <button
                    className="action-btn complete-btn"
                    type="button"
                    disabled={!canConsult && !isPostClinical}
                    title={
                      isPostClinical && appointment.status !== "completed"
                        ? "Closes automatically once the cashier verifies payment"
                        : undefined
                    }
                    onClick={() =>
                      navigate(`/veterinary/appointments/${appointment.id}/consult`)
                    }
                  >
                    <FontAwesomeIcon icon={faCircleCheck} />
                    {isPostClinical ? "View Consultation" : "Consult"}
                  </button>
                  <button
                    className="action-btn edit-btn"
                    type="button"
                    disabled={isPostClinical}
                    onClick={() =>
                      navigate(`/veterinary/appointments/${appointment.id}/edit`)
                    }
                  >
                    <FontAwesomeIcon icon={faEdit} /> Edit
                  </button>
                  <button
                    className="action-btn delete-btn"
                    type="button"
                    disabled={
                      isCompleted ||
                      isCancelled ||
                      VET_CANCEL_RESTRICTED_STATUSES.includes(appointment.status)
                    }
                    onClick={() => cancelAppointment(appointment.id)}
                  >
                    <FontAwesomeIcon icon={faTrash} /> Cancel
                  </button>
                </>
              )}
            </>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actionLoadingId, navigate]
  );


  if (loading) {
    return (
      <section className="app-content vet-appointments">
        <div className="vet-loading">
          <div className="vet-loader" />
          <span>Loading veterinary appointments...</span>
        </div>
      </section>
    );
  }

  return (
    <section className="app-content vet-appointments">
      <div className="appointments-hero">
        <div className="header-content">
          <span className="appointments-eyebrow">
            <FontAwesomeIcon icon={faStethoscope} />
            Veterinary Schedule
          </span>
          <h2>
            <FontAwesomeIcon icon={faCalendarAlt} />
            Appointments Management
          </h2>
          <p>Manage veterinary consultations, monitor schedules, and update appointment status.</p>
        </div>
        <div className="appointments-header-actions">
          {refreshing && <FontAwesomeIcon icon={faRotateRight} spin />}
        </div>
      </div>

      {error && (
        <div className="error-message">
          <FontAwesomeIcon icon={faExclamationTriangle} />
          <span>{error}</span>
        </div>
      )}

      <div className="appointments-summary">
        <div className="summary-card">
          <div className="summary-icon today">
            <FontAwesomeIcon icon={faCalendarDay} />
          </div>
          <div>
            <h3>Today</h3>
            <div className="today-count">{dashboardStats.todayCount} appointments</div>
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-icon pending">
            <FontAwesomeIcon icon={faClock} />
          </div>
          <div>
            <h3>Incoming</h3>
            <div className="today-count">{dashboardStats.pendingCount} waiting</div>
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-icon approved">
            <FontAwesomeIcon icon={faCheckCircle} />
          </div>
          <div>
            <h3>Scheduled</h3>
            <div className="today-count">{dashboardStats.approvedCount} ready</div>
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-icon completed">
            <FontAwesomeIcon icon={faChartLine} />
          </div>
          <div>
            <h3>Completion Rate</h3>
            <div className="today-count">{dashboardStats.completionRate}%</div>
          </div>
        </div>
      </div>

      <div className="appointments-controls">
        <div className="search-filter">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search by pet, owner, service, status, or notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                className="clear-search-btn"
                type="button"
                onClick={() => setSearchTerm("")}
                aria-label="Clear search"
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            )}
          </div>

          <div className="filter-panel-label">
            <FontAwesomeIcon icon={faFilter} />
            Filters
          </div>

          <div className="filter-buttons">
            {statusOptions.map((status) => (
              <button
                key={status.key}
                className={`filter-btn${filter === status.key ? " active" : ""}`}
                type="button"
                onClick={() => setFilter(status.key)}
              >
                {status.label} ({statusCounts[status.key] || 0})
              </button>
            ))}
          </div>
        </div>

        <div className="appointments-last-updated">
          <FontAwesomeIcon icon={faClock} />
          Last updated:{" "}
          {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>

      <div className="apt-table-wrap">
        <StandardTable
          data={sortedAppointments}
          columns={appointmentColumns}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={handleSort}
          pageSize={15}
          compact
          emptyMessage={
            searchTerm
              ? "Try another pet name, owner name, service, or status."
              : "No appointments match the current filter."
          }
          rowClassName={(apt) => (apt.raw?.emergency ? "apt-row--emergency" : "")}
        />
      </div>

      {selectedAppointment && (
        <div className="hbk-overlay" onClick={() => setSelectedAppointment(null)}>
          <div className="hbk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="hbk-head">
              <div>
                <h3>{selectedAppointment.pet}</h3>
                <p>{selectedAppointment.owner}</p>
              </div>
              <button
                className="close-btn"
                type="button"
                onClick={() => setSelectedAppointment(null)}
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            <div className="hbk-body">
              <div className="modal-detail">
                <strong>Status</strong>
                <span className={`appointment-status ${selectedAppointment.status}`}>
                  <FontAwesomeIcon icon={getStatusIcon(selectedAppointment.status)} />
                  {getStatusLabel(selectedAppointment.status)}
                </span>
              </div>

              <div className="modal-detail">
                <strong>Date</strong>
                <p>{selectedAppointment.date}</p>
              </div>

              <div className="modal-detail">
                <strong>Time</strong>
                <p>{selectedAppointment.time}</p>
              </div>

              <div className="modal-detail">
                <strong>Service</strong>
                <p>{selectedAppointment.service}</p>
              </div>

              <div className="modal-detail">
                <strong>Patient</strong>
                <p>{selectedAppointment.species} • {selectedAppointment.breed}</p>
              </div>

              <div className="modal-detail">
                <strong>Owner Contact</strong>
                <p>{selectedAppointment.ownerPhone}</p>
              </div>

              <div className="modal-detail full">
                <strong>Notes</strong>
                <p>{selectedAppointment.notes || "No notes provided."}</p>
              </div>
            </div>

            <div className="hbk-foot">
              <button
                className="action-btn start-btn"
                type="button"
                disabled={!VET_STARTABLE_STATUSES.includes(selectedAppointment.status)}
                onClick={() => updateAppointmentStatus(selectedAppointment.id, "in_consultation")}
              >
                <FontAwesomeIcon icon={faPlay} /> Start
              </button>

              <button
                className="action-btn complete-btn"
                type="button"
                disabled={![...VET_STARTED_STATUSES, ...VET_POST_CLINICAL_STATUSES].includes(selectedAppointment.status)}
                title={["clinical_complete", "checkout"].includes(selectedAppointment.status) ? "Closes automatically once the cashier verifies payment" : undefined}
                onClick={() => navigate(`/veterinary/appointments/${selectedAppointment.id}/consult`)}
              >
                <FontAwesomeIcon icon={faCircleCheck} />
                {VET_POST_CLINICAL_STATUSES.includes(selectedAppointment.status) ? "View Consultation" : "Consult"}
              </button>

              <button
                className="action-btn delete-btn"
                type="button"
                disabled={
                  selectedAppointment.status === "completed" ||
                  selectedAppointment.status === "cancelled" ||
                  VET_CANCEL_RESTRICTED_STATUSES.includes(selectedAppointment.status)
                }
                onClick={() => cancelAppointment(selectedAppointment.id)}
              >
                <FontAwesomeIcon icon={faTrash} /> Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default VetAppointments;

