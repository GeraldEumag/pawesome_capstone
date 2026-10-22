import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiRequest, API_URL } from "../../api/client";
import { clearAuth } from "../../utils/auth";
import { getPaymentProofUrl } from "../../utils/secureFileAccess";
import { getRoomName } from "../../utils/apiNormalize";
import { useAuth } from "../../context/AuthContext";
import "./CustomerPayments.css";
import { showAlert, showError, showSuccess } from "../../utils/alert.jsx";
import { printReceipt } from "../../utils/receiptPrinter";
import { downloadReceiptPdf } from "../../utils/receiptPdf";
import PaymentUploadModal from "../shared/PaymentUploadModal";

const formatCurrency = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const getPaymentStatus = (item) =>
  String(item.payment_status || "unpaid").toLowerCase();

// Maps each payment source to the SecureFileController {type} segment.
const PROOF_ROUTE_TYPES = {
  service_request: "service-request",
  store_order: "customer-order",
  boarding: "boarding",
  medical_confinement: "medical_confinement",
  grooming: "grooming",
  appointment: "appointment",
  service_billing_payment: "service-billing-payment",
};

const resolveApiUrl = (url) => {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  const base = API_URL.replace(/\/+$/, "");
  const path = url.startsWith("/api/") ? url.slice(4) : url.startsWith("/") ? url : `/${url}`;
  return `${base}${path}`;
};

// proof_url (when the API sends it) is an auth-gated /api/files/... route —
// a bare <a target="_blank"> never sends the Bearer token, so it 401s.
// When only a raw payment_proof storage path exists, derive the view route
// from the payment source instead.
const getProofViewUrl = (payment) => {
  const direct = payment.proof_url || payment.payment_proof_url || payment.receipt_url;
  if (direct) return resolveApiUrl(direct);
  if (!payment.payment_proof) return null;
  const type = PROOF_ROUTE_TYPES[payment.payment_source];
  if (!type) return null;
  const id = payment.payment_source === "service_billing_payment"
    ? (payment.payment_request_id || payment.id)
    : payment.id;
  return id ? `${API_URL.replace(/\/+$/, "")}/files/payment-proofs/${type}/${id}/view` : null;
};

const paymentLabels = {
  unpaid: "Not yet paid",
  pending: "Under cashier verification",
  paid: "Payment verified",
  rejected: "Payment rejected",
  refunded: "Refunded",
};

const CustomerPayments = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [onlineBillingPayment, setOnlineBillingPayment] = useState({ open: false, endpoint: "", title: "" });
  const [billingSubmitting, setBillingSubmitting] = useState(null);
  const highlightId = searchParams.get("order_id") || searchParams.get("boarding_id");
  const highlightRef = useRef(null);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      setError("");

      const email = user?.email || "customer@example.com";

      // Fetch service requests
      const requestsResult = await apiRequest(
        `/customer/my-requests?email=${encodeURIComponent(email)}`,
        "GET"
      );

      // Fetch store orders
      const ordersResult = await apiRequest(
        "/customer/store/orders",
        "GET"
      );

      const boardingsResult = await apiRequest(
        "/customer/boarding-requests",
        "GET"
      );
      const billingResult = await apiRequest("/customer/billing", "GET").catch(() => ({ invoices: [] }));

      const requests = Array.isArray(requestsResult)
        ? requestsResult
        : requestsResult.data || requestsResult.payments || requestsResult.orders || requestsResult.requests || requestsResult.service_requests || [];
      const orders = Array.isArray(ordersResult)
        ? ordersResult
        : ordersResult.data || ordersResult.payments || ordersResult.orders || ordersResult.requests || [];
      const boardings = Array.isArray(boardingsResult)
        ? boardingsResult
        : boardingsResult.data || boardingsResult.payments || boardingsResult.orders || boardingsResult.requests || boardingsResult.boarding_requests || boardingsResult.boardings || [];
      const invoices = Array.isArray(billingResult)
        ? billingResult
        : billingResult.invoices || billingResult.data || [];

      // Process service requests
      const payableRequests = requests
        .filter((request) => {
          const status = String(request.status || "").toLowerCase();
          const paymentStatus = String(
            request.payment_status || request.payment || "unpaid"
          ).toLowerCase();

          return (
            status === "approved" &&
            Number(request.additional_charges || 0) <= 0 &&
            ["unpaid", "pending", "rejected"].includes(paymentStatus)
          );
        })
        .map((request) => {
          return {
            ...request,
            payment_source: "service_request",
            display_id: `REQ-${request.id}`,
            display_type: "Service Request",
            display_name:
              request.service_name ||
              request.service ||
              request.request_type ||
              request.service_type ||
              "Service Request",
            total_amount:
              request.total_amount ||
              request.price ||
              request.service_price ||
              request.amount ||
              500,
            order_status: request.status || "approved",
            payment_status: request.payment_status || request.payment || "unpaid",
            created_at: request.created_at || request.request_date || request.appointment_date || request.date || request.scheduled_date || null,
            verified_at: request.verified_at || request.paid_at || request.date_verified || request.updated_at || null,
            items: [
              {
                product_name:
                  request.service_name ||
                  request.service ||
                  request.request_type ||
                  request.service_type ||
                  "Service Request",
                quantity: 1,
              },
            ],
          };
        });

      const payableOrders = orders
        .filter((order) => {
          const status = String(order.status || order.order_status || "").toLowerCase();
          const paymentStatus = String(order.payment_status || "unpaid").toLowerCase();

          return (
            status === "approved" &&
            ["unpaid", "pending", "rejected"].includes(paymentStatus)
          );
        })
        .map((order) => ({
          ...order,
          payment_source: "store_order",
          display_id: order.order_number || order.order_id || `ORD-${order.id}`,
          display_type: "Store Order",
          display_name: "Store Purchase",
          total_amount: order.total_amount || order.total || 0,
          order_status: order.status || order.order_status || "approved",
          payment_status: order.payment_status || "unpaid",
          created_at: order.created_at || order.order_date || order.date || order.submitted_at || null,
          verified_at: order.verified_at || order.paid_at || order.date_verified || order.updated_at || null,
          items: order.items || [],
        }));

      const payableBoardings = boardings
        .filter((boarding) => {
          const status = String(boarding.status || "").toLowerCase();
          const paymentStatus = String(boarding.payment_status || "unpaid").toLowerCase();

          return (
            ["approved", "scheduled"].includes(status) &&
            ["unpaid", "pending", "rejected"].includes(paymentStatus)
          );
        })
        .map((boarding) => ({
          ...boarding,
          payment_source: "boarding",
          display_id: `BOARD-${boarding.id}`,
          display_type: "Pet Hotel / Boarding",
          display_name:
            getRoomName(boarding) !== "Unassigned"
              ? getRoomName(boarding)
              : boarding.service_name || "Pet Hotel / Boarding",
          total_amount: boarding.total_amount || boarding.amount || 0,
          order_status: boarding.status || "approved",
          payment_status: boarding.payment_status || "unpaid",
          pet_name: boarding.pet?.name || boarding.pet_name,
          customer_name: boarding.customer?.name || boarding.customer_name,
          created_at: boarding.created_at || boarding.check_in || boarding.request_date || null,
          verified_at: boarding.verified_at || boarding.paid_at || boarding.date_verified || boarding.updated_at || null,
          items: [
            {
              product_name: "Pet Hotel / Boarding",
              quantity: 1,
            },
          ],
        }));

      const payableBillingInvoices = invoices
        .map((invoice) => {
          const requestStatus = String(invoice.payment_request_status || "").toLowerCase();
          const balanceDue = Number(invoice.balance_due || 0);
          const paymentStatus = requestStatus === "pending_verification" || requestStatus === "awaiting_cashier"
            ? "pending"
            : requestStatus === "rejected"
              ? "rejected"
              : balanceDue > 0
                ? (String(invoice.payment_status || "").toLowerCase() === "pending" ? "pending" : "unpaid")
                : "paid";
          const totalAmount = balanceDue > 0 ? balanceDue : Number(invoice.payment_request_amount || 0);
          if (totalAmount <= 0) return null;

          return {
            ...invoice,
            payment_source: "service_billing_payment",
            payable_type: "service_billing_payment",
            display_id: `VET-BILL-${invoice.appointment_id}`,
            display_type: "Veterinary Bill",
            display_name: invoice.service_name || "Veterinary service billing",
            total_amount: totalAmount,
            order_status: invoice.appointment_status || "approved",
            payment_status: paymentStatus,
            payment_available: Boolean(invoice.payment_available),
            payment_block_reason: invoice.payment_block_reason,
            payment_request_status: invoice.payment_request_status,
            payment_channel: invoice.payment_channel,
            payment_method: invoice.payment_method,
            payment_request_id: invoice.payment_request_id,
            receipt_number: invoice.payment_request_receipt_number,
            created_at: invoice.created_at || invoice.scheduled_at,
            verified_at: invoice.payment_request_verified_at,
            paid_at: invoice.payment_request_paid_at,
            payment_reference: invoice.payment_reference,
            payment_proof: invoice.proof_url,
            rejection_reason: invoice.rejection_reason,
            items: invoice.items || [],
          };
        })
        .filter(Boolean);

      const historyResult = await apiRequest("/customer/payments/history", "GET");
      const historyList = Array.isArray(historyResult)
        ? historyResult
        : historyResult.data || historyResult.payments || historyResult.orders || historyResult.requests || [];

      const historyPayments = historyList.map((payment) => ({
        ...payment,
        payment_source: payment.payment_source || payment.type || "payment",
        display_id: payment.receipt_number || payment.reference_number || payment.reference_id || `PAY-${payment.id}`,
        display_type: payment.service_type || payment.order_type || payment.type || "Payment",
        display_name: payment.description || payment.service_name || payment.order_name || payment.type || "Payment record",
        total_amount: payment.amount || payment.total_amount || payment.total || 0,
        order_status: payment.status || payment.request_status || "recorded",
        payment_status: payment.payment_status || payment.status || "pending",
        created_at: payment.created_at || payment.date_submitted || payment.submitted_at,
        verified_at: payment.verified_at || payment.paid_at || payment.date_verified,
      }));

      const allPayments = [...payableRequests, ...payableOrders, ...payableBoardings, ...payableBillingInvoices, ...historyPayments];
      setPayments(allPayments);
    } catch (err) {
      console.error("LOAD CUSTOMER PAYMENTS ERROR:", err);
      
      // Check for authentication errors
      if (err.message && (err.message.includes("session expired") || err.message.includes("Unauthenticated") || err.message.includes("401"))) {
        // Clear session and redirect to login
        clearAuth();
        window.location.href = "/login";
        return;
      }
      
      setError(err.message || "Failed to load payments.");
      showError(err.message || "Failed to load payments.");
      setPayments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll to highlighted row after payments load
  useEffect(() => {
    if (highlightId && !loading && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightId, loading]);

  const summary = useMemo(() => {
    const paid = payments.filter((item) => getPaymentStatus(item) === "paid");
    const pending = payments.filter((item) => getPaymentStatus(item) === "pending");

    return {
      totalTransactions: payments.length,
      totalPaid: paid.reduce((sum, item) => sum + Number(item.total_amount || 0), 0),
      pendingCount: pending.length,
    };
  }, [payments]);

  const payBillingOnline = (payment) => {
    setOnlineBillingPayment({
      open: true,
      endpoint: `/customer/billing/veterinary/${payment.appointment_id}/online-payment`,
      title: payment.display_name || "Veterinary bill",
      referenceNumber: payment.payment_reference || "",
      paymentStatus: payment.payment_status || "",
      rejectionReason: payment.rejection_reason || "",
      paymentMethod: payment.payment_method || "gcash",
    });
  };

  const requestCashierPayment = async (payment) => {
    try {
      setBillingSubmitting(payment.appointment_id);
      await apiRequest(`/customer/billing/veterinary/${payment.appointment_id}/cashier-payment`, "POST", {});
      showSuccess("Your bill is now waiting at the cashier. Pay the full balance at the front desk.");
      await fetchPayments();
    } catch (err) {
      showError(err.message || "Unable to send this bill to the cashier.");
    } finally {
      setBillingSubmitting(null);
    }
  };

  const viewProof = async (payment) => {
    const proofUrl = getProofViewUrl(payment);
    if (!proofUrl) {
      showError("Proof file is not available yet.");
      return;
    }
    try {
      const blobUrl = await getPaymentProofUrl(proofUrl);
      if (!blobUrl) throw new Error("Proof file is not available.");
      window.open(blobUrl, "_blank", "noopener,noreferrer");
    } catch {
      showError("Unable to load the payment proof. Please try again.");
    }
  };

  const viewReceipt = async (payment, output = "print") => {
    const outputReceipt = async (options) => {
      if (output === "pdf") return await downloadReceiptPdf(options);
      return printReceipt({ ...options, vat: undefined });
    };
    try {
      if (payment.payment_source === "service_billing_payment") {
        const data = await apiRequest(`/customer/billing/payment-requests/${payment.payment_request_id}/receipt`, "GET");
        const receipt = data?.receipt;
        if (!receipt) throw new Error("Billing receipt is not available yet.");
        const amount = Number(receipt.total_amount || payment.total_amount || 0);
        await outputReceipt({
          title: "Veterinary Bill Receipt",
          receiptNumber: receipt.receipt_number || `VET-BILL-${payment.appointment_id}`,
          date: receipt.paid_at || new Date().toLocaleString("en-PH"),
          customer: receipt.customer_name || user?.name || "Customer",
          paymentMethod: receipt.payment_method || "Payment",
          paymentStatus: "paid",
          verifiedBy: receipt.verified_by || "Cashier",
          items: (Array.isArray(receipt.items) ? receipt.items : []).map((item) => {
            const quantity = Number(item.quantity || 1);
            const unitPrice = Number(item.price || 0);
            return {
              name: item.product_name || "Veterinary service item",
              quantity,
              unitPrice,
              total: Number(item.subtotal ?? item.total ?? unitPrice * quantity),
            };
          }),
          subtotal: amount,
          netAmount: receipt.breakdown?.net_amount ?? receipt.net_amount,
          vat: receipt.breakdown?.vat_amount ?? receipt.vat_amount,
          total: amount,
          footerText: "Thank you for choosing Pawesome Retreat Inc.!",
        });
        return;
      }

      if (payment.payment_source === "service_request" || payment.type === "service_request" || payment.payable_type === "service_request") {
        const data = await apiRequest(`/customer/requests/${payment.id}/receipt`, "GET");
        const receipt = data?.receipt || data?.data || data;
        if (!receipt) throw new Error("Service receipt is not available yet.");

        const amount = Number(receipt.total_amount || payment.total_amount || 0);
        const serviceName = receipt.service_type || receipt.request_type || receipt.service_name || "Service";

        await outputReceipt({
          title: "Service Invoice",
          receiptNumber: receipt.receipt_number || payment.receipt_number || `SR-${payment.id}`,
          date: receipt.paid_at || payment.paid_at || new Date().toLocaleString("en-PH"),
          customer: receipt.customer_name || user?.name || "Customer",
          paymentMethod: receipt.payment_method || payment.payment_method || "Online Payment",
          paymentStatus: "paid",
          verifiedBy: receipt.verified_by || "Cashier",
          items: [{ name: `${serviceName} — Pet: ${receipt.pet_name || payment.pet_name || "N/A"}`, quantity: 1, unitPrice: amount, total: amount }],
          subtotal: amount,
          netAmount: receipt.breakdown?.net_amount ?? receipt.net_amount,
          vat: receipt.breakdown?.vat_amount ?? receipt.vat_amount,
          total: amount,
          footerText: "Thank you for choosing Pawesome Retreat Inc.!",
        });
        return;
      }

      if (payment.payment_source === "boarding") {
        if (!payment.receipt_number) throw new Error("Boarding receipt is not available yet.");

        const amount = Number(payment.total_amount || 0);
        await outputReceipt({
          title: "Boarding Invoice",
          receiptNumber: payment.receipt_number || `BRD-${payment.id}`,
          date: payment.paid_at || new Date().toLocaleString("en-PH"),
          customer: user?.name || "Customer",
          paymentMethod: payment.payment_method || "Online Payment",
          paymentStatus: "paid",
          verifiedBy: payment.verified_by || "Cashier",
          items: [{ name: `Pet Boarding — Pet: ${payment.pet_name || "N/A"}`, quantity: 1, unitPrice: amount, total: amount }],
          subtotal: amount,
          netAmount: payment.breakdown?.net_amount ?? payment.net_amount,
          vat: payment.breakdown?.vat_amount ?? payment.vat_amount,
          total: amount,
          footerText: "Thank you for choosing Pawesome Retreat Inc.!",
        });
        return;
      }

      // Store order receipt
      const data = await apiRequest(`/customer/store/orders/${payment.id}/receipt`, "GET");
      const receipt = data?.receipt;
      if (!receipt) throw new Error("Receipt details not found.");

      const amount = Number(receipt.total_amount || 0);
      const items = (Array.isArray(receipt.items) ? receipt.items : []).map((item) => {
        const quantity = Number(item.quantity || 1);
        const unitPrice = Number(item.unit_price || item.price || 0);
        return {
          name: item.item_name || item.name || item.product_name || "Item",
          quantity,
          unitPrice,
          total: Number(item.total_price ?? item.total ?? unitPrice * quantity),
        };
      });

      await outputReceipt({
        title: "Sales Invoice",
        receiptNumber: receipt.receipt_number || `ORD-${payment.id}`,
        date: receipt.paid_at || new Date().toLocaleString("en-PH"),
        customer: receipt.customer_name || user?.name || "Customer",
        paymentMethod: receipt.payment_method || payment.payment_method || "Online Payment",
        paymentStatus: "paid",
        verifiedBy: receipt.verified_by || "Cashier",
        items: items.length > 0 ? items : [{ name: "Store Order", quantity: 1, unitPrice: amount, total: amount }],
        subtotal: amount,
        netAmount: receipt.breakdown?.net_amount ?? receipt.net_amount,
        vat: receipt.breakdown?.vat_amount ?? receipt.vat_amount,
        discount: receipt.discount ?? 0,
        total: amount,
        footerText: "Thank you for shopping at Pawesome Retreat Inc.!",
      });
    } catch (err) {
      showError(err.message || "Receipt is not available yet.");
    }
  };

  return (
    <section className="customer-payments-page">
      <div className="customer-payments-header customer-payments-actions">
        <button type="button" className="customer-payments-main-btn" onClick={fetchPayments}>
          Refresh
        </button>
      </div>

      {error && (
        <div className="customer-payments-error">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="customer-payments-summary-grid">
        <article className="customer-payment-summary-card">
          <div className="summary-icon">#</div>
          <div>
            <h4>{summary.totalTransactions}</h4>
            <p>Total Records</p>
          </div>
        </article>

        <article className="customer-payment-summary-card">
          <div className="summary-icon">₱</div>
          <div>
            <h4>{formatCurrency(summary.totalPaid)}</h4>
            <p>Total Paid</p>
          </div>
        </article>

        <article className="customer-payment-summary-card">
          <div className="summary-icon">...</div>
          <div>
            <h4>{summary.pendingCount}</h4>
            <p>Under Verification</p>
          </div>
        </article>
      </div>

      <div className="customer-payments-panel">
        <div className="customer-payments-panel-header">
          <div>
            <span className="customer-payments-kicker">Payments</span>
            <h4>Orders, Services, and Receipts</h4>
            <p>Receipt and proof links appear when available.</p>
          </div>
        </div>

        <div className="customer-payments-table-wrapper">
          <table className="customer-payments-table">
            <thead>
              <tr>
                <th>Reference / Receipt</th>
                <th>Date Submitted</th>
                <th>Service / Order Type</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Payment</th>
                <th>Date Verified</th>
                <th>Receipt / Proof</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="9">Loading payments...</td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan="9">
                    No approved orders or service requests ready for payment yet.
                  </td>
                </tr>
              ) : (
                payments.map((payment) => {
                  const rowKey = `${payment.payment_source}-${payment.id}`;
                  const paymentStatus = getPaymentStatus(payment);
                  const proofUrl = getProofViewUrl(payment);
                  const isHighlighted = highlightId && String(payment.id) === String(highlightId);

                  return (
                    <tr
                      key={rowKey}
                      ref={isHighlighted ? highlightRef : null}
                      className={isHighlighted ? "payment-row-highlight" : undefined}
                    >
                      <td>
                          <strong>{payment.display_id || payment.receipt_number || payment.reference_number || "N/A"}</strong>
                      </td>

                      <td>
                          {payment.created_at
                          ? new Date(payment.created_at).toLocaleString("en-PH")
                          : "N/A"}
                      </td>

                      <td>
                        <span className="payment-method-badge">
                          {payment.display_type || payment.payment_source || "Payment"}
                        </span>
                        <strong>{payment.display_name}</strong>
                        {payment.pet_name && <div>Pet: {payment.pet_name}</div>}
                        {payment.customer_name && <div>Customer: {payment.customer_name}</div>}
                        {payment.payment_source === "service_billing_payment" && (payment.items || []).map((item) => (
                          <div className="customer-billing-line" key={`${item.id || item.description}-${item.item_type}`}>
                            <span>{item.description || "Veterinary service item"}</span>
                            <span>{item.item_type === "discount" ? "−" : ""}{formatCurrency(item.total_price)}{item.is_paid ? " · Paid" : ""}</span>
                          </div>
                        ))}
                      </td>

                      <td className="payment-amount">
                        {formatCurrency(payment.total_amount)}
                      </td>

                      <td>{payment.payment_method || "N/A"}</td>

                      <td>
                        <span className={`payment-status ${paymentStatus}`}>
                          {payment.payment_request_status === "awaiting_cashier" ? "Waiting at cashier" : (paymentLabels[paymentStatus] || paymentStatus)}
                        </span>
                      </td>

                      <td>
                        {payment.verified_at ? new Date(payment.verified_at).toLocaleString("en-PH") : "N/A"}
                      </td>

                      <td>
                        {paymentStatus === "paid" ? (
                          <div className="customer-receipt-actions">
                            <button
                              type="button"
                              className="receipt-btn"
                              onClick={() => viewReceipt(payment, "print")}
                            >
                              {payment.receipt_number ? `Print ${payment.receipt_number}` : "Print Receipt"}
                            </button>
                            <button
                              type="button"
                              className="receipt-btn"
                              onClick={() => viewReceipt(payment, "pdf")}
                              title="Download 58mm receipt PDF"
                            >
                              PDF
                            </button>
                          </div>
                        ) : proofUrl ? (
                          <button
                            type="button"
                            className="receipt-btn"
                            onClick={() => viewProof(payment)}
                          >
                            View Proof
                          </button>
                        ) : payment.payment_proof ? (
                          <span style={{ color: '#16a34a', fontSize: '0.85rem' }}>
                            Proof uploaded
                          </span>
                        ) : (
                          <>
                            {payment.rejection_reason && (
                              <div>Reason: {payment.rejection_reason}</div>
                            )}
                            {payment.cashier_remarks && (
                              <div>Cashier: {payment.cashier_remarks}</div>
                            )}
                            {payment.paid_at && (
                              <div>
                                Paid: {new Date(payment.paid_at).toLocaleString("en-PH")}
                              </div>
                            )}
                          </>
                        )}
                      </td>

                      <td>
                        {payment.payment_source === "service_billing_payment" && payment.payment_available ? (
                          <div className="customer-billing-actions">
                            <button
                              type="button"
                              className="receipt-btn"
                              onClick={() => payBillingOnline(payment)}
                            >
                              Pay Online
                            </button>
                            <button
                              type="button"
                              className="receipt-btn"
                              onClick={() => requestCashierPayment(payment)}
                              disabled={billingSubmitting === payment.appointment_id}
                            >
                              {billingSubmitting === payment.appointment_id ? "Sending..." : "Pay at Cashier"}
                            </button>
                          </div>
                        ) : payment.payment_source === "service_billing_payment" ? (
                          <span>{payment.payment_block_reason || (payment.payment_request_status === "pending_verification" ? "Online proof is awaiting verification." : payment.payment_request_status === "awaiting_cashier" ? "Pay the full balance at the cashier." : "No balance due.")}</span>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PaymentUploadModal
        open={onlineBillingPayment.open}
        onClose={() => setOnlineBillingPayment({ open: false, endpoint: "", title: "" })}
        onSuccess={() => {
          setOnlineBillingPayment({ open: false, endpoint: "", title: "" });
          fetchPayments();
        }}
        endpoint={onlineBillingPayment.endpoint}
        title={onlineBillingPayment.title}
        referenceNumber={onlineBillingPayment.referenceNumber}
        paymentStatus={onlineBillingPayment.paymentStatus}
        rejectionReason={onlineBillingPayment.rejectionReason}
        paymentMethod={onlineBillingPayment.paymentMethod}
      />
    </section>
  );
};

export default CustomerPayments;
