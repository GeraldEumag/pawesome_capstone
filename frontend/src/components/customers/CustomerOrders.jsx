import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBox,
  faSearch,
  faClock,
  faCheckCircle,
  faTimesCircle,
  faCreditCard,
  faReceipt,
  faEye,
  faSpinner,
  faExclamationTriangle,
  faBan,
} from "@fortawesome/free-solid-svg-icons";
import Swal from "sweetalert2";
import "./CustomerOrders.css";
import { apiRequest } from "../../api/client";
import { showError } from "../../utils/alert.jsx";

const CustomerOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState(null);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      
      // Fetch both store orders and boarding requests
      const [storeOrdersResponse, boardingRequestsResponse] = await Promise.allSettled([
        apiRequest("/customer/store/orders"),
        apiRequest("/customer/boarding-requests")
      ]);

      let allOrders = [];

      // Process store orders
      if (storeOrdersResponse.status === 'fulfilled') {
        const storeData = storeOrdersResponse.value;
        const storeOrders = Array.isArray(storeData) ? storeData : (storeData.orders || storeData.data || []);
        allOrders = allOrders.concat(storeOrders.map(order => ({
          ...order,
          order_type: 'store',
          type: 'Store Order',
          service_name: null
        })));
      }

      // Process boarding requests
      if (boardingRequestsResponse.status === 'fulfilled') {
        const boardingData = boardingRequestsResponse.value;
        const boardingRequests = Array.isArray(boardingData) ? boardingData : (boardingData.data || []);
        allOrders = allOrders.concat(boardingRequests.map(request => ({
          ...request,
          order_type: 'boarding',
          type: 'Boarding',
          service_name: request.service_type || 'Boarding Service',
          total_amount: request.total_amount || request.amount || 0,
          payment_status: request.payment_status || 'unpaid',
          status: request.status || 'pending'
        })));
      }

      // Sort by creation date (most recent first)
      allOrders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      setOrders(allOrders);
      setError("");
    } catch (err) {
      setError(err.message || "Failed to load orders");
      showError(err.message || "Failed to load orders");
      console.error("Customer orders fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status?.toLowerCase()) {
      case "pending":
        return <FontAwesomeIcon icon={faClock} className="status-icon pending" />;
      case "approved":
        return <FontAwesomeIcon icon={faCheckCircle} className="status-icon approved" />;
      case "rejected":
        return <FontAwesomeIcon icon={faTimesCircle} className="status-icon rejected" />;
      case "cancelled":
        return <FontAwesomeIcon icon={faBan} className="status-icon cancelled" />;
      case "completed":
        return <FontAwesomeIcon icon={faCheckCircle} className="status-icon completed" />;
      default:
        return <FontAwesomeIcon icon={faClock} className="status-icon" />;
    }
  };

  const getPaymentStatusIcon = (status) => {
    switch (status?.toLowerCase()) {
      case "unpaid":
        return <FontAwesomeIcon icon={faTimesCircle} className="status-icon unpaid" />;
      case "pending":
        return <FontAwesomeIcon icon={faClock} className="status-icon pending" />;
      case "paid":
        return <FontAwesomeIcon icon={faCheckCircle} className="status-icon paid" />;
      case "rejected":
        return <FontAwesomeIcon icon={faTimesCircle} className="status-icon rejected" />;
      default:
        return <FontAwesomeIcon icon={faClock} className="status-icon" />;
    }
  };

  const cancelOrder = async (orderId) => {
    const { value: reason } = await Swal.fire({
      icon: "warning",
      title: "Cancel Order",
      input: "textarea",
      inputLabel: "Cancellation Reason",
      inputPlaceholder: "Please provide a reason for cancellation...",
      inputValidator: (value) => {
        if (!value) {
          return "Cancellation reason is required";
        }
      },
      showCancelButton: true,
      confirmButtonText: "Cancel Order",
      cancelButtonText: "Keep Order",
      confirmButtonColor: "#ef4444",
    });

    if (!reason) return;

    try {
      setUpdatingId(orderId);

      const result = await apiRequest(`/customer/store/orders/${orderId}/cancel`, "POST", {
        cancellation_reason: reason
      });

      if (result.success) {
        await Swal.fire({
          icon: "success",
          title: "Order Cancelled",
          html: `
            <div style="text-align: left;">
              <p>Your order has been cancelled successfully.</p>
              <p><strong>Reason:</strong> ${reason}</p>
              <p>The receptionist has been notified.</p>
            </div>
          `,
          timer: 3000,
          showConfirmButton: false,
        });

        await fetchOrders();
      }
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Cancellation Failed",
        text: err.message || "Failed to cancel order",
        confirmButtonColor: "#ff5f93",
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const getActionButtons = (order) => {
    const buttons = [];

    // View Details button (always available)
    buttons.push(
      <button key="view" className="action-btn primary" onClick={() => viewOrderDetails(order)}>
        <FontAwesomeIcon icon={faEye} />
        View Details
      </button>
    );

    // Handle boarding requests differently
    if (order.order_type === 'boarding') {
      // Cancel boarding request (only for pending)
      if (order.status === "pending") {
        buttons.push(
          <button 
            key="cancel" 
            className="action-btn danger" 
            onClick={() => cancelBoardingRequest(order.id)}
            disabled={updatingId === order.id}
          >
            <FontAwesomeIcon icon={faBan} />
            {updatingId === order.id ? "Cancelling..." : "Cancel Request"}
          </button>
        );
      }

      // Upload payment proof for boarding (only for approved + unpaid/rejected)
      if (order.status === "approved" && (order.payment_status === "unpaid" || order.payment_status === "rejected")) {
        buttons.push(
          <button key="payment" className="action-btn warning" onClick={() => uploadBoardingPayment(order)}>
            <FontAwesomeIcon icon={faCreditCard} />
            {order.payment_status === "rejected" ? "Re-upload Payment" : "Upload Payment"}
          </button>
        );
      }

      // View receipt for boarding (only for paid)
      if (order.payment_status === "paid") {
        buttons.push(
          <button key="receipt" className="action-btn success" onClick={() => viewBoardingReceipt(order)}>
            <FontAwesomeIcon icon={faReceipt} />
            View Receipt
          </button>
        );
      }
    } else {
      // Store order actions
      // Cancel Order button (only for pending orders)
      if (order.status === "pending") {
        buttons.push(
          <button 
            key="cancel" 
            className="action-btn danger" 
            onClick={() => cancelOrder(order.id)}
            disabled={updatingId === order.id}
          >
            <FontAwesomeIcon icon={faBan} />
            {updatingId === order.id ? "Cancelling..." : "Cancel Order"}
          </button>
        );
      }

      // Upload Payment Proof button (only for approved + unpaid/rejected orders)
      if (order.status === "approved" && (order.payment_status === "unpaid" || order.payment_status === "rejected")) {
        buttons.push(
          <button key="payment" className="action-btn warning" onClick={() => uploadPaymentProof(order)}>
            <FontAwesomeIcon icon={faCreditCard} />
            {order.payment_status === "rejected" ? "Re-upload Payment" : "Upload Payment"}
          </button>
        );
      }

      // View Receipt button (only for paid orders)
      if (order.payment_status === "paid") {
        buttons.push(
          <button key="receipt" className="action-btn success" onClick={() => viewReceipt(order)}>
            <FontAwesomeIcon icon={faReceipt} />
            View Receipt
          </button>
        );
      }
    }

    return buttons;
  };

  const viewOrderDetails = async (order) => {
    try {
      let orderDetails = order;
      
      // Fetch detailed order information based on type
      if (order.order_type === 'boarding') {
        try {
          const result = await apiRequest(`/customer/boarding-requests/${order.id}`);
          orderDetails = result.data || result || order;
        } catch (err) {
          // Use the order data we have if API call fails
          orderDetails = order;
        }
      } else {
        try {
          const result = await apiRequest(`/customer/store/orders/${order.id}`);
          orderDetails = Array.isArray(result) ? (result.find(o => o.id === order.id) || order) : (result.data || order);
        } catch (err) {
          // Use the order data we have if API call fails
          orderDetails = order;
        }
      }
      
      const title = order.order_type === 'boarding' 
        ? `Boarding Request #${orderDetails.id || orderDetails.request_number}`
        : `Order #${orderDetails.order_number || orderDetails.id}`;
      
      Swal.fire({
        title,
        html: `
          <div style="text-align: left;">
            <div style="margin-bottom: 20px;">
              <h4>${order.order_type === 'boarding' ? 'Boarding Request Information' : 'Order Information'}</h4>
              <p><strong>${order.order_type === 'boarding' ? 'Request Number' : 'Order Number'}:</strong> ${orderDetails.order_number || orderDetails.request_number || orderDetails.id}</p>
              <p><strong>Reference:</strong> ${orderDetails.reference_number || 'N/A'}</p>
              <p><strong>Type:</strong> ${order.order_type === 'boarding' ? 'Boarding Service' : (orderDetails.order_type || 'Store Order')}</p>
              ${order.order_type === 'boarding' ? `
                <p><strong>Pet Name:</strong> ${orderDetails.pet_name || 'N/A'}</p>
                <p><strong>Service Type:</strong> ${orderDetails.service_type || 'Boarding'}</p>
                <p><strong>Start Date:</strong> ${orderDetails.start_date ? new Date(orderDetails.start_date).toLocaleDateString() : 'N/A'}</p>
                <p><strong>End Date:</strong> ${orderDetails.end_date ? new Date(orderDetails.end_date).toLocaleDateString() : 'N/A'}</p>
              ` : ''}
              <p><strong>Total Amount:</strong> ₱${Number(orderDetails.total_amount || 0).toLocaleString()}</p>
              <p><strong>Payment Method:</strong> ${orderDetails.payment_method || 'N/A'}</p>
              <p><strong>Status:</strong> <span style="color: ${getStatusColor(orderDetails.status)}">${orderDetails.status?.toUpperCase() || 'PENDING'}</span></p>
              <p><strong>Payment Status:</strong> <span style="color: ${getPaymentStatusColor(orderDetails.payment_status)}">${orderDetails.payment_status?.toUpperCase() || 'UNPAID'}</span></p>
              <p><strong>Created:</strong> ${new Date(orderDetails.created_at).toLocaleDateString()}</p>
              ${orderDetails.approved_at ? `<p><strong>Approved:</strong> ${new Date(orderDetails.approved_at).toLocaleDateString()}</p>` : ''}
              ${orderDetails.paid_at ? `<p><strong>Paid:</strong> ${new Date(orderDetails.paid_at).toLocaleDateString()}</p>` : ''}
              ${orderDetails.receipt_number ? `<p><strong>Receipt:</strong> #${orderDetails.receipt_number}</p>` : ''}
            </div>
            
            <div>
              <h4>${order.order_type === 'boarding' ? 'Service Details' : 'Order Items'}</h4>
              ${order.order_type === 'boarding' ? `
                <div style="border: 1px solid #e5e7eb; padding: 10px; margin-bottom: 8px; border-radius: 5px;">
                  <p><strong>${orderDetails.service_type || 'Boarding Service'}</strong></p>
                  <p>Duration: ${orderDetails.duration || 'N/A'} days</p>
                  <p>Rate: ₱${Number(orderDetails.daily_rate || orderDetails.amount || 0).toLocaleString()} per day</p>
                </div>
              ` : (orderDetails.items?.length ? orderDetails.items.map(item => `
                <div style="border: 1px solid #e5e7eb; padding: 10px; margin-bottom: 8px; border-radius: 5px;">
                  <p><strong>${item.product_name || item.name}</strong></p>
                  <p>Quantity: ${item.quantity} × ₱${Number(item.price).toLocaleString()} = ₱${Number(item.subtotal || item.price * item.quantity).toLocaleString()}</p>
                </div>
              `).join('') : '<p>No items found</p>')}
            </div>
            
            ${orderDetails.rejection_reason ? `
              <div style="margin-top: 20px; padding: 10px; background: #fef2f2; border-radius: 5px;">
                <h4 style="color: #ef4444;">Rejection Reason</h4>
                <p>${orderDetails.rejection_reason}</p>
              </div>
            ` : ''}
            
            ${orderDetails.cashier_remarks ? `
              <div style="margin-top: 20px; padding: 10px; background: #f0f9ff; border-radius: 5px;">
                <h4 style="color: #3b82f6;">Cashier Remarks</h4>
                <p>${orderDetails.cashier_remarks}</p>
              </div>
            ` : ''}
            
            <div style="margin-top: 20px; padding: 10px; background: #f8f9fa; border-radius: 5px; font-size: 12px;">
              <h4>Workflow Status</h4>
              ${order.order_type === 'boarding' ? `
                <p>• <strong>Pending:</strong> Waiting for receptionist approval</p>
                <p>• <strong>Approved:</strong> Ready for payment upload</p>
                <p>• <strong>Payment Pending:</strong> Waiting for cashier verification</p>
                <p>• <strong>Paid:</strong> Payment verified, boarding confirmed</p>
                <p>• <strong>Rejected/Cancelled:</strong> Request cancelled</p>
              ` : `
                <p>• <strong>Pending:</strong> Waiting for receptionist approval</p>
                <p>• <strong>Approved:</strong> Ready for payment upload</p>
                <p>• <strong>Payment Pending:</strong> Waiting for cashier verification</p>
                <p>• <strong>Paid:</strong> Payment verified, order complete</p>
                <p>• <strong>Rejected/Cancelled:</strong> Order cancelled</p>
              `}
            </div>
          </div>
        `,
        width: "600px",
        confirmButtonColor: "#ff5f93",
      });
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "Failed to load order details",
        confirmButtonColor: "#ff5f93",
      });
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: "#f59e0b",
      approved: "#3b82f6",
      paid: "#10b981",
      preparing: "#8b5cf6",
      completed: "#22c55e",
      rejected: "#ef4444",
      cancelled: "#6b7280",
    };
    return colors[status] || "#6b7280";
  };

  const getPaymentStatusColor = (status) => {
    const colors = {
      unpaid: "#f59e0b",
      pending: "#3b82f6",
      paid: "#10b981",
      rejected: "#ef4444",
    };
    return colors[status] || "#6b7280";
  };

  const uploadPaymentProof = (order) => {
    // Navigate to payment upload page with order pre-selected
    window.location.href = `/customer/payments?order_id=${order.id}`;
  };

  const viewReceipt = async (order) => {
    try {
      const data = await apiRequest(`/customer/store/orders/${order.id}/receipt`, "GET");
      const receipt = data?.receipt || data;
      if (!receipt) {
        throw new Error("Receipt details not found.");
      }
      await Swal.fire({
        icon: "info",
        title: `Receipt ${receipt.receipt_number || "N/A"}`,
        html: `
          <div style="text-align:left;">
            <p><strong>Order #</strong> ${order.id}</p>
            <p><strong>Amount:</strong> ₱${Number(receipt.total_amount || order.total_amount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p>
            <p><strong>Paid At:</strong> ${receipt.paid_at || "N/A"}</p>
            <p><strong>Verified By:</strong> ${receipt.verified_by || "Cashier"}</p>
            <p><strong>Remarks:</strong> ${receipt.cashier_remarks || "None"}</p>
          </div>
        `,
        confirmButtonColor: "#ff5f93",
      });
    } catch (err) {
      Swal.fire({ icon: "error", title: "Receipt Unavailable", text: err.message || "Receipt is not available yet.", confirmButtonColor: "#ef4444" });
    }
  };

  const cancelBoardingRequest = async (boardingId) => {
    const { value: reason } = await Swal.fire({
      icon: "warning",
      title: "Cancel Boarding Request",
      input: "textarea",
      inputLabel: "Cancellation Reason",
      inputPlaceholder: "Please provide a reason for cancellation...",
      inputValidator: (value) => {
        if (!value) {
          return "Cancellation reason is required";
        }
      },
      showCancelButton: true,
      confirmButtonText: "Cancel Request",
      cancelButtonText: "Keep Request",
      confirmButtonColor: "#ef4444",
    });

    if (!reason) return;

    try {
      setUpdatingId(boardingId);

      const result = await apiRequest(`/customer/boarding-requests/${boardingId}/cancel`, "POST", {
        cancellation_reason: reason
      });

      if (result.success) {
        await Swal.fire({
          icon: "success",
          title: "Boarding Request Cancelled",
          html: `
            <div style="text-align: left;">
              <p>Your boarding request has been cancelled successfully.</p>
              <p><strong>Reason:</strong> ${reason}</p>
              <p>The receptionist has been notified.</p>
            </div>
          `,
          timer: 3000,
          showConfirmButton: false,
        });

        await fetchOrders();
      }
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Cancellation Failed",
        text: err.message || "Failed to cancel boarding request",
        confirmButtonColor: "#ff5f93",
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const uploadBoardingPayment = (boardingRequest) => {
    // Navigate to payment upload page with boarding request pre-selected
    window.location.href = `/customer/payments?boarding_id=${boardingRequest.id}`;
  };

  const viewBoardingReceipt = async (boardingRequest) => {
    try {
      const data = await apiRequest(`/customer/boarding-requests/${boardingRequest.id}/receipt`, "GET");
      const receipt = data?.receipt || data;
      if (!receipt) {
        throw new Error("Boarding receipt is not available yet.");
      }
      await Swal.fire({
        icon: "info",
        title: `Receipt ${receipt.receipt_number || "N/A"}`,
        html: `
          <div style="text-align:left;">
            <p><strong>Boarding #</strong> ${boardingRequest.id}</p>
            <p><strong>Pet:</strong> ${boardingRequest.pet_name || "N/A"}</p>
            <p><strong>Amount:</strong> ₱${Number(receipt.total_amount || boardingRequest.total_amount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p>
            <p><strong>Paid At:</strong> ${receipt.paid_at || "N/A"}</p>
            <p><strong>Verified By:</strong> ${receipt.verified_by || "Cashier"}</p>
            <p><strong>Remarks:</strong> ${receipt.cashier_remarks || "None"}</p>
          </div>
        `,
        confirmButtonColor: "#ff5f93",
      });
    } catch (err) {
      Swal.fire({ icon: "error", title: "Receipt Unavailable", text: err.message || "Receipt is not available yet.", confirmButtonColor: "#ef4444" });
    }
  };

  const filteredOrders = orders.filter((order) => {
    const keyword = searchTerm.toLowerCase();
    return (
      order.order_id?.toLowerCase().includes(keyword) ||
      order.reference_number?.toLowerCase().includes(keyword) ||
      order.customer_name?.toLowerCase().includes(keyword) ||
      order.status?.toLowerCase().includes(keyword) ||
      order.type?.toLowerCase().includes(keyword) ||
      order.order_type?.toLowerCase().includes(keyword)
    );
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
      <div className="customer-orders">
        <div className="orders-loading">
          <FontAwesomeIcon icon={faSpinner} spin className="loading-spinner" />
          <p>Loading your orders...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="customer-orders">
        <div className="orders-error">
          <FontAwesomeIcon icon={faExclamationTriangle} />
          <h3>Failed to load orders</h3>
          <p>{error}</p>
          <button onClick={fetchOrders} className="retry-btn">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="customer-orders">
      <section className="orders-hero">
        <span className="orders-badge">Customer Portal</span>
        <h1>My Orders</h1>
        <p>
          Track your store orders, upload payment proof after approval, and view receipts.
        </p>
      </section>

      <section className="orders-toolbar">
        <div className="orders-search-box">
          <FontAwesomeIcon icon={faSearch} />
          <input
            type="text"
            placeholder="Search order number, reference, or customer name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </section>

      <section className="orders-grid">
        {filteredOrders.length === 0 ? (
          <div className="orders-empty">
            <FontAwesomeIcon icon={faBox} />
            <h3>No orders found</h3>
            <p>
              {searchTerm
                ? "No orders match your search criteria."
                : "You haven't placed any store orders yet."}
            </p>
          </div>
        ) : (
          filteredOrders.map((order) => (
            <article className="order-card" key={order.id}>
              <div className="order-header">
                <div className="order-info">
                  <h3>Order #{order.order_id || order.id}</h3>
                  <p>{formatDate(order.created_at)}</p>
                </div>
                <div className="order-amount">
                  <strong>₱{order.total_amount || 0}</strong>
                  <small>Total Amount</small>
                </div>
              </div>

              <div className="order-details">
                <div className="order-meta">
                  <span className={`order-status ${order.status}`}>
                    {getStatusIcon(order.status)}
                    {order.status}
                  </span>
                  <span className={`payment-status ${order.payment_status}`}>
                    {getPaymentStatusIcon(order.payment_status)}
                    {order.payment_status}
                  </span>
                </div>

                <div className="order-customer">
                  <strong>Customer:</strong> {order.customer_name || "Guest"}
                </div>

                <div className="order-reference">
                  <strong>Reference:</strong> {order.reference_number || "N/A"}
                </div>

                {order.items && order.items.length > 0 && (
                  <div className="order-items">
                    <strong>Items ({order.items.length}):</strong>
                    <div className="items-list">
                      {order.items.slice(0, 3).map((item, index) => (
                        <div key={index} className="order-item">
                          <span>{item.name || item.product_name}</span>
                          <small>Qty: {item.quantity} × ₱{item.price}</small>
                        </div>
                      ))}
                      {order.items.length > 3 && (
                        <small className="more-items">+{order.items.length - 3} more items</small>
                      )}
                    </div>
                  </div>
                )}

                {order.rejection_reason && (
                  <div className="order-rejection">
                    <strong>Rejection Reason:</strong> {order.rejection_reason}
                  </div>
                )}

                {order.cashier_remarks && (
                  <div className="order-remarks">
                    <strong>Cashier Remarks:</strong> {order.cashier_remarks}
                  </div>
                )}
              </div>

              <div className="order-actions">
                {getActionButtons(order)}
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
};

export default CustomerOrders;
