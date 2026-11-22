import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBell,
  faCheckDouble,
  faExclamationTriangle,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { notificationApi } from "../../api/notifications";
import { normalizeList } from "../../utils/normalizeList";
import { getNotificationMeta } from "../../utils/notificationIcons";
import { useAuth } from "../../context/AuthContext";
import "./NotificationDropdown.css";

const NotificationDropdown = ({ role }) => {
  const navigate = useNavigate();
  const { token, role: authRole } = useAuth();
  const notificationRole = role || authRole || "";
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const dropdownRef = useRef(null);
  const panelRef = useRef(null);
  const inFlightRef = useRef(false);
  const requestSeq = useRef(0);
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const fetchNotifications = useCallback(async ({ force = false } = {}) => {
    if (!token || !notificationRole) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    // Skip overlapping polls — a slow request must not stack up requests.
    // Mutation handlers pass force so their refresh always runs.
    if (inFlightRef.current && !force) return;
    inFlightRef.current = true;
    // Sequence guard: a slower earlier response must never overwrite
    // fresher state (e.g. a poll started before a mark-read mutation).
    const seq = ++requestSeq.current;
    setLoading(true);

    try {
      const res = await notificationApi.getAll({ unread: filterRef.current === "unread" });
      if (seq !== requestSeq.current) return;
      setNotifications(normalizeList(res, ["notifications", "data", "records"]));
      setUnreadCount(res.unread_count || 0);
      setError(false);
    } catch {
      if (seq === requestSeq.current) setError(true);
    } finally {
      inFlightRef.current = false;
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [notificationRole, token]);

  useEffect(() => {
    if (!token || !notificationRole) return undefined;

    fetchNotifications();

    const interval = setInterval(() => {
      // Pause polling while the tab is hidden to avoid wasted traffic.
      if (document.visibilityState === "visible") {
        fetchNotifications();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchNotifications, notificationRole, token]);

  // Refetch when the All/Unread filter changes — switching filters only
  // changes the query, never any notification's read state.
  useEffect(() => {
    fetchNotifications({ force: true });
  }, [filter, fetchNotifications]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      const clickedButton = dropdownRef.current?.contains(event.target);
      const clickedPanel = panelRef.current?.contains(event.target);

      if (!clickedButton && !clickedPanel) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const markAsRead = async (id) => {
    try {
      const res = await notificationApi.markAsRead(id);
      // Backend returns the authoritative unread count — trust it, then
      // refetch so the active filter's list stays consistent.
      if (typeof res?.unread_count === "number") setUnreadCount(res.unread_count);
      fetchNotifications({ force: true });
    } catch {
      // Failed mutation must not change local state — the badge stays
      // truthful and the next poll resynchronizes.
    }
  };

  const markAllAsRead = async () => {
    try {
      const res = await notificationApi.markAllAsRead();
      setUnreadCount(typeof res?.unread_count === "number" ? res.unread_count : 0);
      fetchNotifications({ force: true });
    } catch {
      // Failed mutation must not change local state.
    }
  };

  const getNotificationDestination = (notification) => {
    const role = notificationRole || "customer";
    const relatedType = String(notification.related_type || notification.type || "").toLowerCase();
    const text = `${notification.title || ""} ${notification.message || ""}`.toLowerCase();

    // Customer navigation
    if (role === "customer") {
      if (relatedType.includes("order") || text.includes("order")) {
        return "/customer/bookings";
      }
      if (relatedType.includes("payment") || text.includes("payment")) {
        return "/customer/payments";
      }
      if (relatedType.includes("service") || relatedType.includes("booking") || text.includes("booking")) {
        return "/customer/bookings";
      }
      return "/customer/notifications";
    }

    if (role === "admin") {
      if (relatedType.includes("payment")) return "/admin/reports/payments";
      if (relatedType.includes("order")) return "/admin/reports/orders";
      if (relatedType.includes("service") || relatedType.includes("booking")) return "/admin/reports/services";
      if (relatedType.includes("appointment") || relatedType.includes("vet")) return "/admin/reports/veterinary";
      if (relatedType.includes("inventory") || relatedType.includes("stock")) return "/admin/reports/inventory";
      if (relatedType.includes("user") || text.includes("user")) return "/admin/users";
      if (relatedType.includes("chatbot")) return "/admin/chatbot";
      return "/admin/reports";
    }

    if (role === "manager") {
      if (relatedType.includes("payroll") || relatedType.includes("salary") || text.includes("payroll") || text.includes("salary")) {
        return "/manager/payroll";
      }
      if (relatedType.includes("attendance") || text.includes("attendance")) {
        return "/manager/attendance";
      }
      if (relatedType.includes("staff") || relatedType.includes("employee") || text.includes("staff") || text.includes("employee")) {
        return "/manager/staff";
      }
      return "/manager/reports";
    }

    if (role === "cashier") {
      if (relatedType.includes("payment") || text.includes("payment") || text.includes("verification")) {
        return "/cashier/payment-verification";
      }
      if (relatedType.includes("sale") || relatedType.includes("transaction") || text.includes("sale") || text.includes("transaction")) {
        return "/cashier/transactions";
      }
      if (relatedType.includes("report") || text.includes("report")) {
        return "/cashier/reports";
      }
      return "/cashier/pos";
    }

    if (role === "inventory") {
      if (relatedType.includes("audit") || text.includes("audit")) {
        return "/inventory/monthly-audit";
      }
      if (relatedType.includes("stock") || text.includes("stock") || text.includes("low")) {
        return "/inventory/stock";
      }
      if (relatedType.includes("product") || relatedType.includes("inventory") || text.includes("product") || text.includes("inventory")) {
        return "/inventory/products";
      }
      if (relatedType.includes("report") || text.includes("report")) {
        return "/inventory/reports";
      }
      return "/inventory/management";
    }

    if (role === "veterinary" || role === "vet") {
      if (relatedType.includes("board") || text.includes("boarding") || text.includes("boarder")) {
        return "/veterinary/current-boarders";
      }
      // Appointment notifications must win over the word "customer" in the
      // message body (e.g. "New appointment with Customer on ...").
      if (relatedType.includes("appointment") || text.includes("appointment")) {
        return "/veterinary/appointments";
      }
      if (relatedType.includes("customer") || relatedType.includes("profile") || text.includes("customer") || text.includes("profile")) {
        return "/veterinary/customer-profiles";
      }
      if (relatedType.includes("report") || text.includes("report")) {
        return "/veterinary/reports";
      }
      return "/veterinary/appointments";
    }

    if (role === "receptionist") {
      if (relatedType.includes("approval") || text.includes("approval") || text.includes("pending")) {
        return "/receptionist/approvals";
      }
      if (relatedType.includes("order") || text.includes("order")) {
        return "/receptionist/orders";
      }
      if (relatedType.includes("customer") || text.includes("customer")) {
        return "/receptionist/customers";
      }
      if (relatedType.includes("appointment") || text.includes("appointment")) {
        return "/receptionist/appointments";
      }
      if (relatedType.includes("booking") || relatedType.includes("service") || text.includes("booking") || text.includes("service")) {
        return "/receptionist/bookings";
      }
      if (relatedType.includes("chatbot") || text.includes("chatbot")) {
        return "/receptionist/chatbot";
      }
      return "/receptionist/dashboard";
    }

    return `/${role}`;
  };

  const handleNotificationClick = (notification) => {
    // Mark as read first
    if (!notification.read) markAsRead(notification.id);

    // Navigate to relevant page
    const destination = getNotificationDestination(notification);
    navigate(destination);

    // Close dropdown
    setIsOpen(false);
  };

  const listEmptyText = filter === "unread" ? "You're all caught up." : "No notifications yet";

  return (
    <div className="pawesome-notification-dropdown" ref={dropdownRef}>
      <button
        className="pawesome-notification-btn"
        type="button"
        aria-label="Notifications"
        aria-expanded={isOpen}
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((current) => !current);
        }}
      >
        <FontAwesomeIcon icon={faBell} />

        {unreadCount > 0 && (
          <span className="pawesome-notification-badge pulse" aria-hidden="true">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
        {unreadCount > 0 && (
          <span className="pawesome-notification-sr-only">{unreadCount} unread notification{unreadCount === 1 ? "" : "s"}</span>
        )}
      </button>

      {isOpen &&
        createPortal(
          <div className="pawesome-notifications-panel" ref={panelRef} role="dialog" aria-label="Notifications">
            <div className="pawesome-notifications-top">
              <div className="pawesome-notifications-heading">
                <h3>Notifications</h3>
                {unreadCount > 0 && (
                  <span className="pawesome-notifications-count">{unreadCount} unread</span>
                )}
              </div>

              <div className="pawesome-notifications-top-actions">
                {unreadCount > 0 && (
                  <button
                    className="pawesome-notifications-clear"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      markAllAsRead();
                    }}
                  >
                    Mark all read
                  </button>
                )}
                <button
                  className="pawesome-notifications-close"
                  type="button"
                  aria-label="Close notifications"
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsOpen(false);
                  }}
                >
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              </div>
            </div>

            <div className="pawesome-notifications-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={filter === "all"}
                className={`pawesome-notifications-tab ${filter === "all" ? "active" : ""}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setFilter("all");
                }}
              >
                All
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filter === "unread"}
                className={`pawesome-notifications-tab ${filter === "unread" ? "active" : ""}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setFilter("unread");
                }}
              >
                Unread
              </button>
            </div>

            <div className="pawesome-notifications-list">
              {loading && notifications.length === 0 ? (
                <div className="pawesome-notification-skeletons" aria-hidden="true">
                  {[0, 1, 2].map((n) => (
                    <div className="pawesome-notification-skeleton" key={`skeleton-${n}`}>
                      <span className="skeleton-icon" />
                      <span className="skeleton-lines">
                        <span className="skeleton-line title" />
                        <span className="skeleton-line" />
                        <span className="skeleton-line short" />
                      </span>
                    </div>
                  ))}
                </div>
              ) : error ? (
                <div className="pawesome-notification-empty">
                  <FontAwesomeIcon icon={faExclamationTriangle} />
                  <span>Couldn't load notifications</span>
                  <button
                    type="button"
                    className="pawesome-notifications-clear"
                    onClick={(event) => {
                      event.stopPropagation();
                      fetchNotifications();
                    }}
                  >
                    Retry
                  </button>
                </div>
              ) : notifications.length === 0 ? (
                <div className="pawesome-notification-empty">
                  <FontAwesomeIcon icon={filter === "unread" ? faCheckDouble : faBell} />
                  <span>{listEmptyText}</span>
                </div>
              ) : (
                notifications.map((item, index) => {
                  const meta = getNotificationMeta(item);
                  return (
                    <div
                      key={`notification-${notificationRole}-${item.id || "no-id"}-${index}`}
                      className={`pawesome-notification-item ${meta.severity} ${!item.read ? "unread" : ""}`}
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleNotificationClick(item);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleNotificationClick(item);
                        }
                      }}
                    >
                      <span className="pawesome-notification-icon">
                        <FontAwesomeIcon icon={meta.icon} />
                      </span>

                      <span className="pawesome-notification-content">
                        <strong>{item.title}</strong>
                        <p>{item.message}</p>
                        <small className="pawesome-notification-time">
                          {item.time || (item.created_at ? new Date(item.created_at).toLocaleString() : "")}
                        </small>
                      </span>

                      <span className="pawesome-notification-side">
                        {!item.read && <span className="pawesome-notification-dot" aria-label="Unread" />}
                        {!item.read && (
                          <button
                            type="button"
                            className="pawesome-notification-markread"
                            title="Mark as read"
                            aria-label="Mark as read"
                            onClick={(event) => {
                              event.stopPropagation();
                              markAsRead(item.id);
                            }}
                          >
                            <FontAwesomeIcon icon={faCheckDouble} />
                          </button>
                        )}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default NotificationDropdown;
