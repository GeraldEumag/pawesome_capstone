import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPaw,
  faHotel,
  faScissors,
  faStethoscope,
  faTimes,
  faRotate,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { parseDateOnly } from "../../utils/date";
import "./BookingTracker.css";

const SEEN_KEY = "pawesome_tracker_seen";
const POLL_MS = 30000;

const TYPE_META = {
  hotel: { icon: faHotel, tone: "hotel" },
  grooming: { icon: faScissors, tone: "grooming" },
  vet: { icon: faStethoscope, tone: "vet" },
};

const STEPS = {
  boarding: ["Booked", "Approved", "Checked In", "In Care", "Ready for Pickup", "Picked Up"],
  appointment: ["Requested", "Approved", "Scheduled", "In Progress", "Treated", "Done"],
  grooming: ["Requested", "Approved", "Scheduled", "In Progress", "Done"],
  request: ["Requested", "Approved", "Scheduled", "Confirmed"],
};

const loadSeen = () => {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY)) || {};
  } catch {
    return {};
  }
};

const formatDate = (value) => {
  const date = parseDateOnly(value);
  if (!date) return "";
  return date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
};

const formatTime = (value) => {
  if (!value) return "";
  const match = /^(\d{2}):(\d{2})/.exec(String(value));
  if (!match) return "";
  const hour = Number(match[1]);
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${match[2]} ${suffix}`;
};

const countdownText = (item) => {
  const liveStatuses = ["checked_in", "in_care", "ready_for_pickup", "in_progress"];
  if (item.status === "ready_for_pickup") return "Ready for pickup now";
  if (liveStatuses.includes(item.status) && item.check_out) {
    const out = parseDateOnly(item.check_out);
    if (out) {
      const days = Math.ceil((out - new Date(new Date().toDateString())) / 86400000);
      if (days <= 0) return "Check-out today";
      if (days === 1) return "Check-out tomorrow";
      return `Check-out in ${days} days`;
    }
    return "Currently in our care";
  }
  const date = parseDateOnly(item.date);
  if (!date) return "";
  const days = Math.ceil((date - new Date(new Date().toDateString())) / 86400000);
  if (days < 0) return "";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
};

const BookingTracker = () => {
  const navigate = useNavigate();
  const { isAuthenticated, role } = useAuth();
  const enabled = isAuthenticated && role === "customer";

  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasUpdate, setHasUpdate] = useState(false);

  const fetchItems = useCallback(async (silent = true) => {
    if (!silent) setRefreshing(true);
    try {
      const data = await apiRequest("/customer/tracking");
      const list = Array.isArray(data?.items) ? data.items : [];
      setItems(list);
      const seen = loadSeen();
      setHasUpdate(list.some((item) => seen[item.id] !== item.status));
    } catch {
      // Stay hidden on failure — never surface noise for a convenience widget
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    fetchItems();
    const timer = setInterval(fetchItems, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchItems();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, fetchItems]);

  useEffect(() => {
    if (open && items.length === 0) setOpen(false);
  }, [items, open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleEsc = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open]);

  if (!enabled || items.length === 0) return null;

  const toggleOpen = () => {
    setOpen((prev) => {
      const next = !prev;
      if (next) {
        const seen = loadSeen();
        items.forEach((item) => {
          seen[item.id] = item.status;
        });
        localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
        setHasUpdate(false);
      }
      return next;
    });
  };

  const primary = items[0];
  const urgent = items.some((item) => item.status === "ready_for_pickup");
  const pillText =
    items.length === 1
      ? `${primary.pet_name || "Booking"} · ${primary.status_label}`
      : `${items.length} bookings`;

  return (
    <div className={`bt-widget ${open ? "bt-open" : ""}`}>
      {open && (
        <div className="bt-panel" role="dialog" aria-modal="false" aria-label="Booking tracker">
          <div className="bt-grabber" aria-hidden="true" />
          <header className="bt-header">
            <div className="bt-header-title">
              <span className="bt-header-icon">
                <FontAwesomeIcon icon={faPaw} />
              </span>
              <div>
                <h3>Your Bookings</h3>
                <p>
                  {items.length} active {items.length === 1 ? "booking" : "bookings"}
                </p>
              </div>
            </div>
            <div className="bt-header-actions">
              <button
                type="button"
                className="bt-icon-btn"
                onClick={() => fetchItems(false)}
                aria-label="Refresh bookings"
                title="Refresh"
              >
                <FontAwesomeIcon icon={faRotate} spin={refreshing} />
              </button>
              <button
                type="button"
                className="bt-icon-btn"
                onClick={() => setOpen(false)}
                aria-label="Close tracker"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
          </header>

          <div className="bt-list">
            {items.map((item) => {
              const meta = TYPE_META[item.service_type] || TYPE_META.vet;
              const steps = STEPS[item.kind] || STEPS.request;
              const countdown = countdownText(item);
              return (
                <article key={item.id} className={`bt-card bt-tone-${meta.tone}`}>
                  <div className="bt-card-top">
                    <span className="bt-card-icon">
                      <FontAwesomeIcon icon={meta.icon} />
                    </span>
                    <div className="bt-card-heading">
                      <strong>{item.service_label}</strong>
                      <span>{item.pet_name || "Your pet"}</span>
                    </div>
                    <span className={`bt-status bt-status-${item.status}`}>
                      {item.status_label}
                    </span>
                  </div>

                  <div className="bt-card-meta">
                    {item.date && (
                      <span>
                        {formatDate(item.date)}
                        {formatTime(item.time) ? ` · ${formatTime(item.time)}` : ""}
                      </span>
                    )}
                    {item.room_name && <span>{item.room_name}</span>}
                    {item.payment_status && (
                      <span className={`bt-pay bt-pay-${item.payment_status}`}>
                        {item.payment_status === "paid" ? "Paid" : item.payment_status === "unpaid" ? "Unpaid" : item.payment_status}
                      </span>
                    )}
                  </div>

                  {countdown && <div className="bt-countdown">{countdown}</div>}

                  <div className="bt-steps" aria-label={`Progress: ${item.status_label}`}>
                    {steps.slice(0, item.step_count).map((label, idx) => (
                      <div
                        key={label}
                        className={`bt-step ${idx < item.step_index ? "done" : ""} ${idx === item.step_index ? "current" : ""}`}
                      >
                        <span className="bt-step-dot" />
                        <span className="bt-step-label">{label}</span>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>

          <footer className="bt-footer">
            <button
              type="button"
              className="bt-view-all"
              onClick={() => {
                setOpen(false);
                navigate("/customer/bookings");
              }}
            >
              View all bookings
            </button>
          </footer>
        </div>
      )}

      <button
        type="button"
        className={`bt-toggle ${urgent ? "bt-urgent" : ""}`}
        onClick={toggleOpen}
        aria-label={open ? "Close booking tracker" : "Open booking tracker"}
        aria-expanded={open}
      >
        <span className="bt-toggle-icon">
          <FontAwesomeIcon icon={open ? faTimes : faPaw} />
        </span>
        <span className="bt-toggle-text">{open ? "Close" : pillText}</span>
        {hasUpdate && !open && <span className="bt-badge" aria-label="Booking status updated" />}
      </button>
    </div>
  );
};

export default BookingTracker;
