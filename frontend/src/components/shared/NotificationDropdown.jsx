import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBell,
  faCheckCircle,
  faInfoCircle,
  faExclamationTriangle,
  faTimesCircle,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import { notificationApi } from "../../api/notifications";
import { normalizeList } from "../../utils/normalizeList";
import { useAuth } from "../../context/AuthContext";
import "./NotificationDropdown.css";

const NotificationDropdown = ({ role }) => {
  const navigate = useNavigate();
  const { token, role: authRole } = useAuth();
  const notificationRole = role || authRole || "manager";
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);
  const panelRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    if (!token || !notificationRole) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const res = await notificationApi.getAll(notificationRole);
      setNotifications(normalizeList(res, ["notifications", "data", "records"]));
      setUnreadCount(res.unread_count || 0);
    } catch {
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, [notificationRole, token]);

  useEffect(() => {
    if (!token || !notificationRole) return undefined;

    fetchNotifications();

    const interval = setInterval(fetchNotifications, 10000);

    return () => clearInterval(interval);
  }, [fetchNotifications, notificationRole, token]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      const clickedButton = dropdownRef.current?.contains(event.target);
      const clickedPanel = panelRef.current?.contains(event.target);

      if (!clickedButton && !clickedPanel) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const markAsRead = async (id) => {
    try {
      await notificationApi.markAsRead(id);
      fetchNotifications();
    } catch {
      // Notification actions are optional and should not interrupt dashboard demos.
    }
  };

  const markAllAsRead = async () => {
    try {
      await notificationApi.markAllAsRead(notificationRole);
      fetchNotifications();
    } catch {
      // Notification actions are optional and should not interrupt dashboard demos.
    }
  };

  const getIcon = (type) => {
    if (type === "success") return faCheckCircle;
    if (type === "warning") return faExclamationTriangle;
    if (type === "danger" || type === "error") return faTimesCircle;
    return faInfoCircle;
  };

  const getNotificationDestination = (notification) => {
    const role = notificationRole || "customer";
    const relatedType = String(notification.related_type || notification.type || "").toLowerCase();
    const text = `${notification.title || ""} ${notification.message || ""}`.toLowerCase();
    
    // Customer navigation
    if (role === "customer") {
      if (relatedType.includes("order") || text.includes("order")) {
        return "/customer/orders";
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
      if (relatedType.includes("service") || relatedType.includes("booking")) return "/admin/reports/service-requests";
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
        return "/vet/current-boarders";
      }
      if (relatedType.includes("customer") || relatedType.includes("profile") || text.includes("customer") || text.includes("profile")) {
        return "/vet/customer-profiles";
      }
      if (relatedType.includes("report") || text.includes("report")) {
        return "/vet/reports";
      }
      return "/vet/appointments";
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
    markAsRead(notification.id);
    
    // Navigate to relevant page
    const destination = getNotificationDestination(notification);
    navigate(destination);
    
    // Close dropdown
    setIsOpen(false);
  };

  return (
    <div className="pawesome-notification-dropdown" ref={dropdownRef}>
      <button
        className="icon-btn pawesome-notification-btn"
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
          <span className="pawesome-notification-badge pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen &&
        createPortal(
          <div className="pawesome-notifications-panel" ref={panelRef}>
            <div className="pawesome-notifications-header">
              <h3>Notifications</h3>

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
            </div>

            <div className="pawesome-notifications-list">
              {loading ? (
                <div className="pawesome-notification-empty">
                  <FontAwesomeIcon icon={faSpinner} spin />
                  <span>Loading notifications...</span>
                </div>
              ) : notifications.length === 0 ? (
                <div className="pawesome-notification-empty">
                  <FontAwesomeIcon icon={faBell} />
                  <span>No notifications yet</span>
                </div>
              ) : (
                notifications.map((item, index) => (
                  <button
                    key={`notification-${notificationRole}-${item.id || "no-id"}-${index}`}
                    className={`pawesome-notification-item ${item.type} ${!item.read ? "unread" : ""}`}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleNotificationClick(item);
                    }}
                  >
                    <span className="pawesome-notification-icon">
                      <FontAwesomeIcon icon={getIcon(item.type)} />
                    </span>

                    <span className="pawesome-notification-content">
                      <strong>{item.title}</strong>
                      <p>{item.message}</p>
                      <small className="pawesome-notification-time">
                        {item.created_at ? new Date(item.created_at).toLocaleString() : item.time}
                      </small>
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default NotificationDropdown;
