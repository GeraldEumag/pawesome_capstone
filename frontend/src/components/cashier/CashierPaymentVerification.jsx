import React, { useEffect, useState } from "react";
import { apiRequest } from "../../api/client";
import CashierSidebar from "./CashierSidebar";
import { normalizeList } from "../../utils/normalizeList";
import "./CashierPaymentVerification.css";
import { showAlert, showSuccess, showError, showPrompt } from "../../utils/alert";

const CashierPaymentVerification = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = async () => {
    try {
      setLoading(true);

      const data = await apiRequest("/cashier/payment-requests");

      const list = normalizeList(data, ["payments", "requests", "data"]);

      setRequests(list);
    } catch (err) {
      console.error("Failed to load payment requests:", err);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  const verifyPayment = async (payment) => {
    try {
      const data = await apiRequest(`/cashier/payment-requests/${payment.id}/verify`, "POST", {
        type: payment.payable_type || payment.type || payment.payment_source || "service_request",
        cashier_remarks: "Payment verified by cashier",
      });

      if (data && data.success) {
        printReceipt(data, payment);
        showSuccess(data.message || `Payment verified. Receipt: ${data.receipt_number || "Generated"}`);
        fetchRequests();
      } else {
        showAlert(data?.message || "Failed to verify payment.");
      }
    } catch (err) {
      console.error("Failed to verify payment:", err);
      showError(err.message || "Failed to verify payment.");
    }
  };

  const printReceipt = (data, payment) => {
    const receiptNumber = data.receipt_number || data.receipt?.receipt_number || `REC-${payment.id}`;
    const amount = Number(data.amount || data.receipt?.total_amount || payment.amount || payment.total_amount || 0);
    const date = new Date().toLocaleString("en-PH");
    const cashier = localStorage.getItem("name") || localStorage.getItem("user_id") || "Cashier";
    const customer = payment.customer_name || payment.customer?.name || "Customer";
    const service = payment.service_name || payment.service?.name || payment.order_name || payment.request_type || payment.type || "Payment";
    const method = payment.payment_method || data.payment_method || "Online Payment";

    const w = window.open("", "_blank", "width=420,height=700");
    if (!w) return;

    w.document.write(`<!doctype html><html><head><title>${receiptNumber}</title>
      <style>
        body{font-family:'Courier New',monospace;max-width:360px;margin:auto;padding:20px;color:#111}
        h2{text-align:center;font-size:18px;margin:0 0 4px}
        .center{text-align:center;font-size:12px;color:#555;margin-bottom:12px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        td{padding:4px 0;vertical-align:top}
        hr{border:0;border-top:1px dashed #bbb;margin:10px 0}
        .total td{font-size:14px;font-weight:bold;border-top:1px dashed #bbb;padding-top:8px}
        @media print{button{display:none}}
      </style></head><body>
      <h2>Pawesome Retreat Inc.</h2>
      <div class="center">Official Cashier Receipt<br>${date}</div>
      <hr>
      <table>
        <tr><td>Receipt</td><td style="text-align:right">${receiptNumber}</td></tr>
        <tr><td>Cashier</td><td style="text-align:right">${cashier}</td></tr>
        <tr><td>Customer</td><td style="text-align:right">${customer}</td></tr>
        <tr><td>Payment</td><td style="text-align:right">${method}</td></tr>
        <tr><td>Status</td><td style="text-align:right">paid</td></tr>
      </table>
      <hr>
      <table>
        <tr><td>${service}<br><small>Qty 1 x ₱${amount.toFixed(2)}</small></td><td style="text-align:right">₱${amount.toFixed(2)}</td></tr>
        <tr class="total"><td>Total</td><td style="text-align:right">₱${amount.toFixed(2)}</td></tr>
      </table>
      <hr>
      <div class="center">Please keep this receipt.</div>
      <button onclick="window.print()">Print</button>
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const rejectPayment = async (payment) => {
    const cashier_remarks = await showPrompt("Reason for rejecting this payment proof:");
    if (cashier_remarks === null) return;

    try {
      const data = await apiRequest(`/cashier/payment-requests/${payment.id}/reject`, "POST", {
        type: payment.payable_type || payment.type || payment.payment_source || "service_request",
        cashier_remarks,
        rejection_reason: cashier_remarks,
      });

      if (data && data.success) {
        showSuccess(data.message || 'Payment rejected.');
        fetchRequests();
      } else {
        showAlert(data?.message || 'Failed to reject payment.');
      }
    } catch (err) {
      console.error("Failed to reject payment:", err);
      showError(err.message || "Failed to reject payment.");
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  return (
    <div className="app-dashboard cashier-payment-page">
      <CashierSidebar />

      <main className="app-main">
        <header className="app-topbar">
          <div>
            <h1>Payment Verification</h1>
            <p>Verify and process approved bookings and orders</p>
          </div>
        </header>

        <section className="app-content">
          <div className="cashier-payment-verification">
            <div className="payment-hero premium-card fade-up">
              <h1>Approved Requests</h1>
              <p>Process payments for customer-approved bookings and orders</p>
              <div className="badge badge-info">Payment Control Panel</div>
            </div>

            {loading ? (
              <div className="loading-container">
                <p>Loading payment requests...</p>
              </div>
            ) : requests.length === 0 ? (
              <div className="payment-card">
                <p>No approved requests pending payment.</p>
              </div>
            ) : (
              <div className="payment-card">
                <h2>Pending Payments</h2>
                <div className="payment-table-wrapper">
                  <table className="payment-table">
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Type</th>
                        <th>Service / Order</th>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Proof</th>
                        <th>Payment</th>
                        <th>Action</th>
                      </tr>
                    </thead>

                    <tbody>
                      {requests.map((item) => (
                        <tr key={item.id}>
                          <td>{item.customer_name || item.customer?.name || "Customer"}</td>
                          <td>{item.request_type || item.type || "Request"}</td>
                          <td>{item.service_name || item.service?.name || item.order_name || "N/A"}</td>
                          <td>{item.request_date || item.date || "N/A"}</td>
                          <td>₱{Number(item.amount || item.total_amount || 0).toLocaleString("en-PH")}</td>
                          <td>
                            {item.proof_url ? (
                              <a
                                href={item.proof_url}
                                target="_blank"
                                rel="noreferrer"
                                className="proof-link"
                              >
                                View Proof
                              </a>
                            ) : (
                              "No proof uploaded"
                            )}
                          </td>
                          <td>
                            <span className={`status-badge ${String(item.payment_status || "pending").toLowerCase()}`}>
                              {item.payment_status || "pending"}
                            </span>
                          </td>
                          <td className="payment-actions">
                            <button
                              className="verify-btn"
                              type="button"
                              onClick={() => verifyPayment(item)}
                            >
                              Verify Payment
                            </button>
                            <button
                              className="reject-btn"
                              type="button"
                              onClick={() => rejectPayment(item)}
                            >
                              Reject
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default CashierPaymentVerification;
