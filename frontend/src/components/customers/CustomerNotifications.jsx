import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBell,
  faCheckCircle,
  faExclamationTriangle,
  faSpinner,
  faEye,
  faClock,
  faReceipt,
  faCreditCard,
  faCalendarAlt,
  faBox,
} from "@fortawesome/free-solid-svg-icons";
import "./CustomerNotifications.css";
import { apiRequest } from "../../api/client";
import { showError } from "../../utils/alert";

const CustomerNotifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const data = await apiRequest("/notifications");
      setNotifications(Array.isArray(data) ? data : data.notifications || []);
      setError("");
    } catch (err) {
      setError(err.message || "Failed to load notifications");
      showError(err.message || "Failed to load notifications");
      console.error("Customer notifications fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id) => {
    try {
      await apiRequest(`/notifications/${id}/read`, {
        method: "POST",
      });
      fetchNotifications();
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await apiRequest("/notifications/mark-all-read", {
        method: "POST",
      });
      fetchNotifications();
    } catch (err) {
      console.error("Failed to mark all notifications as read:", err);
    }
  };

  const getNotificationIcon = (type) => {
    switch (type?.toLowerCase()) {
      case "success":
        return <FontAwesomeIcon icon={faCheckCircle} className="notification-icon success" />;
      case "warning":
        return <FontAwesomeIcon icon={faExclamationTriangle} className="notification-icon warning" />;
      case "error":
      case "danger":
        return <FontAwesomeIcon icon={faExclamationTriangle} className="notification-icon error" />;
      case "info":
        return <FontAwesomeIcon icon={faBell} className="notification-icon info" />;
      case "order_submitted":
        return <FontAwesomeIcon icon={faBox} className="notification-icon" />;
      case "order_approved":
        return <FontAwesomeIcon icon={faCheckCircle} className="notification-icon success" />;
      case "order_rejected":
        return <FontAwesomeIcon icon={faExclamationTriangle} className="notification-icon error" />;
      case "payment_uploaded":
        return <FontAwesomeIcon icon={faCreditCard} className="notification-icon warning" />;
      case "payment_verified":
        return <FontAwesomeIcon icon={faReceipt} className="notification-icon success" />;
      case "payment_rejected":
        return <FontAwesomeIcon icon={faExclamationTriangle} className="notification-icon error" />;
      case "service_submitted":
        return <FontAwesomeIcon icon={faCalendarAlt} className="notification-icon info" />;
      case "service_approved":
        return <FontAwesomeIcon icon={faCheckCircle} className="notification-icon success" />;
      case "service_scheduled":
        return <FontAwesomeIcon icon={faClock} className="notification-icon info" />;
      case "service_completed":
        return <FontAwesomeIcon icon={faCheckCircle} className="notification-icon success" />;
      default:
        return <FontAwesomeIcon icon={faBell} className="notification-icon" />;
    }
  };

  const getNotificationColor = (type) => {
    switch (type?.toLowerCase()) {
      case "success":
      case "info":
      case "warning":
      case "error":
      case "danger":
        return type === "danger" ? "error" : type;
      case "order_submitted":
      return "info";
      case "order_approved":
        return "success";
      case "order_rejected":
        return "error";
      case "payment_uploaded":
        return "warning";
      case "payment_verified":
        return "success";
      case "payment_rejected":
        return "error";
      case "service_submitted":
        return "info";
      case "service_approved":
        return "success";
      case "service_scheduled":
        return "info";
      case "service_completed":
        return "success";
      default:
        return "default";
    }
  };

  const filteredNotifications = notifications.filter((notification) => {
    if (filter === "all") return true;
    const searchable = [
      notification.type,
      notification.title,
      notification.message,
      notification.related_type,
    ].join(" ").toLowerCase();

    return searchable.includes(filter.toLowerCase());
  });

  const formatDate = (dateString) => {
    if (!dateString) return "No date";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "Invalid date";
    return date.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="customer-notifications">
        <div className="notifications-loading">
          <FontAwesomeIcon icon={faSpinner} spin className="loading-spinner" />
          <p>Loading notifications...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="customer-notifications">
        <div className="notifications-error">
          <FontAwesomeIcon icon={faExclamationTriangle} />
          <h3>Failed to load notifications</h3>
          <p>{error}</p>
          <button onClick={fetchNotifications} className="retry-btn">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="customer-notifications">
      <section className="notifications-hero">
        <span className="notifications-badge">Customer Portal</span>
        <h1>Notifications</h1>
        <p>Stay updated with your orders, service requests, and payment status.</p>
      </section>

      <section className="notifications-toolbar">
        <div className="notifications-filter">
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All Notifications</option>
            <option value="order">Orders</option>
            <option value="payment">Payments</option>
            <option value="service">Services</option>
          </select>
        </div>

        <div className="notifications-actions">
          <button 
            onClick={markAllAsRead} 
            disabled={notifications.filter(n => !n.read).length === 0}
            className="mark-all-read-btn"
          >
            <FontAwesomeIcon icon={faCheckCircle} />
            Mark All Read
          </button>
        </div>
      </section>

      <section className="notifications-grid">
        {filteredNotifications.length === 0 ? (
          <div className="notifications-empty">
            <FontAwesomeIcon icon={faBell} />
            <h3>No notifications</h3>
            <p>
              {filter === "all" 
                ? "You don't have any notifications yet." 
                : `No ${filter} notifications found.`}
            </p>
          </div>
        ) : (
          filteredNotifications.map((notification) => (
            <article 
              key={notification.id} 
              className={`notification-item ${getNotificationColor(notification.type)} ${!notification.read ? "unread" : ""}`}
            >
              <div className="notification-header">
                <div className="notification-icon">
                  {getNotificationIcon(notification.type)}
                </div>
                <div className="notification-meta">
                  <h3>{notification.title}</h3>
                  <span className="notification-time">
                    {formatDate(notification.created_at)}
                  </span>
                  {!notification.read && <span className="unread-indicator">New</span>}
                </div>
              </div>

              <div className="notification-content">
                <p>{notification.message}</p>
                {(notification.order_id || notification.related_type === "order") && (
                  <small className="notification-reference">
                    Order #{notification.order_id || notification.related_id}
                  </small>
                )}
                {(notification.service_request_id || notification.related_type === "service_request") && (
                  <small className="notification-reference">
                    Request #{notification.service_request_id || notification.related_id}
                  </small>
                )}
              </div>

              <div className="notification-actions">
                {!notification.read && (
                  <button 
                    onClick={() => markAsRead(notification.id)}
                    className="mark-read-btn"
                  >
                    <FontAwesomeIcon icon={faEye} />
                    Mark as Read
                  </button>
                )}
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
};

export default CustomerNotifications;
