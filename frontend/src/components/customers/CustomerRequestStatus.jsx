import React, { useEffect, useState } from "react";
import {
  FaClipboardList,
  FaSearch,
  FaClock,
  FaCheckCircle,
  FaTimesCircle,
  FaCashRegister,
  FaPaw,
} from "react-icons/fa";
import "./CustomerRequestStatus.css";
import { apiRequest } from "../../api/client";
import { normalizeList } from "../../utils/normalizeList";
import { showSuccess, showError } from "../../utils/alert";

const safeLower = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.toLowerCase();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).toLowerCase();
  }
  return "";
};

const safeText = (value, fallback = "N/A") => {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
};

const getCustomerName = (item) =>
  safeText(item?.customer_name || item?.customer?.name || item?.customer?.email || item?.customer, "N/A");

const getPetName = (item) =>
  safeText(item?.pet_name || item?.pet?.name || item?.pet, "N/A");

const CustomerRequestStatus = () => {
  const [requests, setRequests] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [uploadingId, setUploadingId] = useState(null);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      const email = localStorage.getItem("email");

      if (!email) {
        console.error("No email found in localStorage");
        setRequests([]);
        return;
      }

      const [requestsData, ordersData, boardingsData] = await Promise.all([
        apiRequest(`/customer/my-requests?email=${encodeURIComponent(email)}`),
        apiRequest("/customer/store/orders"),
        apiRequest("/customer/boarding-requests"),
      ]);

      const serviceRequests = normalizeList(requestsData, ["requests", "service_requests", "grooming_requests"]).map((item) => ({
        ...item,
        source: "service_request",
        type_label: item.service_name || item.service || item.request_type || "Service Request",
      }));
      const orders = normalizeList(ordersData, ["orders", "data"]).map((item) => ({
        ...item,
        source: "store_order",
        type_label: item.order_number || "Store Order",
        service_name: item.order_name || "Store Order",
      }));
      const boardings = normalizeList(boardingsData, ["boarding_requests", "boardings", "data"]).map((item) => ({
        ...item,
        source: "boarding",
        type_label: item.room?.name || item.hotel_room?.name || "Pet Hotel / Boarding",
        service_name: item.room?.name || item.hotel_room?.name || "Pet Hotel / Boarding",
      }));

      setRequests(normalizeList([...serviceRequests, ...orders, ...boardings]));
    } catch (error) {
      console.error("Failed to fetch customer requests:", error);
      setRequests([]);
    }
  };

  const filteredRequests = Array.isArray(requests)
    ? requests.filter((item) => {
        const search = safeLower(searchTerm);
        const status = safeLower(item?.status || item?.order_status);

        const searchableText = [
          item?.service_type,
          item?.type,
          item?.type_label,
          getCustomerName(item),
          item?.customer_email,
          getPetName(item),
          item?.pet_type,
          item?.service,
          item?.service_name,
          item?.preferred_date,
          item?.scheduled_date,
          item?.date,
          item?.request_date,
          item?.id,
          status,
        ]
          .map(safeLower)
          .join(" ");

        return !search || searchableText.includes(search);
      })
    : [];

  const getStatusIcon = (status) => {
    const normalizedStatus = safeLower(status);
    if (normalizedStatus === "approved") return <FaCheckCircle />;
    if (normalizedStatus === "rejected") return <FaTimesCircle />;
    return <FaClock />;
  };

  const canPay = (item) => {
    const status = safeLower(item?.status || item?.order_status);
    const paymentStatus = safeLower(item?.payment_status || item?.payment || "unpaid");
    return ["approved", "scheduled"].includes(status) && ["unpaid", "rejected"].includes(paymentStatus);
  };

  const uploadPaymentProof = async (item, file) => {
    if (!file) return;

    const formData = new FormData();
    formData.append("payment_method", "Online Payment");
    formData.append("payment_reference", `REF-${Date.now()}`);
    formData.append("payment_proof", file);

    try {
      setUploadingId(`${item.source}-${item.id}`);
      if (item.source === "store_order") {
        await apiRequest(`/customer/store/orders/${item.id}/payment-proof`, "POST", formData);
      } else if (item.source === "boarding") {
        await apiRequest(`/customer/boarding-requests/${item.id}/payment-proof`, "POST", formData);
      } else {
        await apiRequest(`/customer/requests/${item.id}/payment-proof`, "POST", formData);
      }
      await fetchRequests();
      showSuccess("Payment proof uploaded. Your payment is pending cashier verification.");
    } catch (error) {
      showError(error.message || "Failed to upload payment proof.");
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <div className="customer-status-page">
      <section className="customer-status-hero">
        <span className="customer-status-badge">Customer Portal</span>
        <h1>My Booking Requests</h1>
        <p>
          Track your submitted pet service requests and see whether they are
          pending, approved, rejected, or waiting for payment.
        </p>
      </section>

      <section className="customer-status-toolbar">
        <div className="customer-status-search">
          <FaSearch />
          <input
            type="text"
            placeholder="Search request, pet, or service..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </section>

      <section className="customer-status-grid">
        {filteredRequests.map((item) => {
          const status = safeText(item.status || item.order_status, "pending");
          const paymentStatus = safeText(item.payment_status || item.payment, "unpaid");

          return (
          <div className="customer-status-card" key={`${item.source || "request"}-${item.id}`}>
            <div className="status-card-top">
              <div className="status-card-icon">
                <FaPaw />
              </div>

              <div>
                <h3>{safeText(item.service || item.service_name || item.type_label, "Service Request")}</h3>
                <p>Request #{item.id}</p>
              </div>
            </div>

            <div className="status-card-details">
              <p>
                <strong>Customer:</strong> {getCustomerName(item)}
              </p>
              <p>
                <strong>Pet:</strong> {getPetName(item)}
              </p>
              <p>
                <strong>Date:</strong>{" "}
                {(item.date || item.request_date) ? new Date(item.date || item.request_date).toLocaleDateString() : "N/A"}
              </p>
              <p>
                <strong>Time:</strong> {item.time || item.request_time || "N/A"}
              </p>
            </div>

            <div className="status-card-footer">
              <span className={`customer-status-pill ${safeLower(status)}`}>
                {getStatusIcon(status)}
                {status}
              </span>

              <span className={`customer-payment-pill ${safeLower(paymentStatus)}`}>
                <FaCashRegister />
                {paymentStatus}
              </span>
            </div>

            {canPay(item) && (
              <div className="status-card-footer">
                <input
                  id={`pay-${item.source}-${item.id}`}
                  type="file"
                  accept="image/*,.pdf"
                  style={{ display: "none" }}
                  onChange={(event) => uploadPaymentProof(item, event.target.files?.[0])}
                />
                <label className="customer-pay-btn" htmlFor={`pay-${item.source}-${item.id}`}>
                  {uploadingId === `${item.source}-${item.id}` ? "Uploading..." : "Pay"}
                </label>
              </div>
            )}
          </div>
        );
        })}

        {filteredRequests.length === 0 && (
          <div className="customer-status-empty">
            <FaClipboardList />
            <h3>No requests found</h3>
            <p>Your booking requests will appear here after submission.</p>
          </div>
        )}
      </section>
    </div>
  );
};

export default CustomerRequestStatus;
