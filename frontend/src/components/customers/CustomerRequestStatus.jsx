import { useEffect, useState } from "react";
import {
  FaClipboardList,
  FaSearch,
  FaClock,
  FaCheckCircle,
  FaTimesCircle,
  FaCashRegister,
  FaPaw,
  FaTimes,
} from "react-icons/fa";
import gcashQr from "../../assets/PAWESOME TEST GCASH.png";
import "./CustomerRequestStatus.css";
import { apiRequest } from "../../api/client";
import { normalizeList } from "../../utils/normalizeList";
import { showSuccess, showError } from "../../utils/alert.jsx";
import { useAuth } from "../../context/AuthContext";

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
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [uploadingId, setUploadingId] = useState(null);
  const [payModalItem, setPayModalItem] = useState(null);

  useEffect(() => {
    fetchRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchRequests = async () => {
    try {
      const email = user?.email;

      if (!email) {
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
    } catch {
      setRequests([]);
    }
  };

  const getSortDate = (item) => {
    const raw = item.check_in || item.check_in_date || item.preferred_date || item.scheduled_date || item.date || item.request_date || item.created_at;
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  };

  const filteredRequests = Array.isArray(requests)
    ? requests
        .filter((item) => {
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
        .sort((a, b) => {
          const dateA = getSortDate(a);
          const dateB = getSortDate(b);
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          if (!dateA && !dateB) return 0;
          if (!dateA) return 1;
          if (!dateB) return -1;

          const diffA = Math.abs(dateA.getTime() - today.getTime());
          const diffB = Math.abs(dateB.getTime() - today.getTime());

          return diffA - diffB;
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

      <section className="customer-status-table-wrap">
        {filteredRequests.length === 0 ? (
          <div className="customer-status-empty">
            <FaClipboardList />
            <h3>No requests found</h3>
            <p>Your booking requests will appear here after submission.</p>
          </div>
        ) : (
          <table className="customer-status-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Service</th>
                <th>Pet</th>
                <th>Date</th>
                <th>Status</th>
                <th>Payment</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map((item) => {
                const status = safeText(item.status || item.order_status, "pending");
                const paymentStatus = safeText(item.payment_status || item.payment, "unpaid");

                return (
                  <tr key={`${item.source || "request"}-${item.id}`}>
                    <td className="col-id">#{item.id}</td>
                    <td className="col-service">{safeText(item.service || item.service_name || item.type_label, "Service Request")}</td>
                    <td className="col-pet">{getPetName(item)}</td>
                    <td className="col-date">
                      {(item.date || item.request_date) ? new Date(item.date || item.request_date).toLocaleDateString() : "N/A"}
                    </td>
                    <td className="col-status">
                      <span className={`customer-status-pill ${safeLower(status)}`}>
                        {getStatusIcon(status)}
                        {status}
                      </span>
                    </td>
                    <td className="col-payment">
                      <span className={`customer-payment-pill ${safeLower(paymentStatus)}`}>
                        <FaCashRegister />
                        {paymentStatus}
                      </span>
                    </td>
                    <td className="col-action">
                      {canPay(item) ? (
                        <button
                          className="customer-pay-btn"
                          onClick={() => setPayModalItem(item)}
                        >
                          Pay
                        </button>
                      ) : (
                        <span className="no-action">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {payModalItem && (
        <div className="pay-modal-overlay" onClick={() => setPayModalItem(null)}>
          <div className="pay-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pay-modal-header">
              <h3>GCash Payment</h3>
              <button className="pay-modal-close" onClick={() => setPayModalItem(null)}>
                <FaTimes />
              </button>
            </div>

            <div className="pay-modal-body">
              <p className="pay-modal-instruction">
                Scan the QR code or send payment to the number below.
              </p>
              <div className="pay-modal-qr">
                <img src={gcashQr} alt="GCash QR Code" />
              </div>
              <p className="pay-modal-number">GCash No: 0917 123 4567</p>
            </div>

            <div className="pay-modal-footer">
              <input
                id="modal-pay-upload"
                type="file"
                accept="image/*,.pdf"
                style={{ display: "none" }}
                onChange={(event) => {
                  uploadPaymentProof(payModalItem, event.target.files?.[0]);
                  setPayModalItem(null);
                }}
              />
              <label className="customer-pay-btn pay-modal-upload" htmlFor="modal-pay-upload">
                <FaCashRegister />
                Upload Receipt
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerRequestStatus;
