import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPrint,
  faDownload,
  faTimes,
  faFileInvoice,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import { formatCurrency } from "../../utils/currency";
import { STORE_INFO } from "../../utils/storeInfo";
import { downloadReceiptPdf } from "../../utils/receiptPdf";
import { showError } from "../../utils/alert.jsx";
import "./theme.css";
import "./VetReceipt.css";

const VetReceipt = () => {
  const [receiptData, setReceiptData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');
    if (id) {
      fetchReceipt(id);
    } else {
      setLoading(false);
    }
  }, []);

  const fetchReceipt = async (id) => {
    try {
      setLoading(true);
      const data = await apiRequest(`/veterinary/receipt/${id}`);
      const receipt = data?.receipt || data;

      if (!receipt || typeof receipt !== "object") {
        throw new Error("Receipt not found");
      }

      setReceiptData({
        id: receipt.id,
        date: receipt.date,
        time: new Date(receipt.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        service_type: receipt.service_name || 'service',
        vet_name: receipt.vet_name || 'Unknown',
        pet_name: receipt.pet_name || 'Unknown',
        owner_name: receipt.customer_name || 'Unknown',
        service_name: receipt.service_name || 'Service',
        service_cost: receipt.amount || 0,
        description: receipt.notes || 'No description',
        subtotal: receipt.subtotal ?? receipt.amount ?? 0,
        net_amount: receipt.breakdown?.net_amount ?? receipt.net_amount ?? null,
        tax: receipt.tax ?? receipt.breakdown?.vat_amount ?? receipt.vat_amount ?? 0,
        total: receipt.total || receipt.amount || 0,
        payment_method: receipt.payment_method || 'cash',
        payment_status: receipt.status || 'pending',
        receipt_number: receipt.receipt_number || null,
        paid_date: receipt.paid_date || null,
        verified_by: receipt.verified_by || null,
        reference_number: receipt.reference_number || null,
        cash_received: receipt.cash_received ?? null,
        change: receipt.change ?? null,
        breakdown: receipt.breakdown || null,
        pet_breed: receipt.pet_breed || null,
        pet_age: receipt.pet_age || null,
        additional_services: Array.isArray(receipt.additional_services) ? receipt.additional_services : [],
      });
      setError("");
    } catch (err) {
      setError(err.message || "Failed to fetch receipt");
      showError(err.message || "Failed to fetch receipt");
      console.error("Receipt fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = () => {
    try {
      if (!receiptData) return;
      downloadReceiptPdf({
        title: "Service Invoice",
        receiptNumber: receiptData.receipt_number || receiptData.id,
        date: receiptData.paid_date || receiptData.date,
        customer: receiptData.owner_name,
        paymentMethod: receiptData.payment_method,
        paymentStatus: receiptData.payment_status,
        referenceNumber: receiptData.reference_number,
        verifiedBy: receiptData.verified_by,
        amountReceived: receiptData.cash_received,
        change: receiptData.change,
        items: [
          {
            name: `${receiptData.service_name} — ${receiptData.description}`,
            quantity: 1,
            unitPrice: receiptData.service_cost,
            total: receiptData.service_cost,
          },
          ...receiptData.additional_services.map((service) => ({
            name: service.name || "Additional service",
            quantity: 1,
            unitPrice: service.cost,
            total: service.cost,
          })),
        ],
        subtotal: receiptData.subtotal,
        netAmount: receiptData.net_amount,
        vat: receiptData.breakdown?.vat_amount ?? receiptData.tax,
        total: receiptData.total,
        footerText: `Thank you for trusting ${STORE_INFO.name} with your pet's health!`,
      });
    } catch (err) {
      showError(err.message || "Failed to download PDF");
      console.error(err);
    }
  };

  const handleClose = () => {
    setReceiptData(null);
    window.history.back();
  };

  if (loading) {
    return (
      <section className="app-content vet-receipt">
        <div className="vr-status">
          <FontAwesomeIcon icon={faSpinner} spin />
          <span>Loading receipt…</span>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="app-content vet-receipt">
        <div className="vr-status vr-status--error">
          <span>⚠ {error}</span>
        </div>
      </section>
    );
  }

  if (!receiptData) {
    return (
      <section className="app-content vet-receipt">
        <div className="vr-status">
          <FontAwesomeIcon icon={faFileInvoice} style={{ fontSize: "2rem" }} />
          <h3>No receipt selected</h3>
          <p>Please select a receipt from the reports page.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="app-content vet-receipt">

      {/* ── Receipt content ── */}
      <div className="vr-paper" id="receipt-content">

        {/* Store header */}
        <div className="vr-hd">
          <div className="vr-name">{STORE_INFO.name.toUpperCase()}</div>
          {STORE_INFO.address.split("\n").map((line) => (
            <div className="vr-addr" key={line}>{line}</div>
          ))}
          <div className="vr-email">{STORE_INFO.email}</div>
          <div className="vr-title">SERVICE INVOICE</div>
        </div>

        {/* Transaction info */}
        <div className="vr-row"><span>Receipt #</span><span>{receiptData.receipt_number || receiptData.id}</span></div>
        <div className="vr-row"><span>Date</span><span>{new Date(receiptData.date).toLocaleDateString()}</span></div>
        <div className="vr-row"><span>Time</span><span>{receiptData.time}</span></div>
        <div className="vr-row"><span>Type</span><span>{receiptData.service_type?.toUpperCase()}</span></div>
        <div className="vr-row"><span>Veterinarian</span><span>Dr. {receiptData.vet_name}</span></div>


        {/* Patient info */}
        <div className="vr-row"><span>Pet Name</span><span>{receiptData.pet_name}</span></div>
        <div className="vr-row"><span>Owner</span><span>{receiptData.owner_name}</span></div>
        <div className="vr-row"><span>Breed</span><span>{receiptData.pet_breed || "N/A"}</span></div>
        <div className="vr-row"><span>Age</span><span>{receiptData.pet_age || "N/A"}</span></div>


        {/* Service items */}
        <div className="vr-item">
          <div className="vr-item-name">{receiptData.service_name}</div>
          <div className="vr-item-desc">{receiptData.description}</div>
          <div className="vr-item-price">{formatCurrency(receiptData.service_cost)}</div>
        </div>

        {receiptData.additional_services.length > 0 && (
          <>
    
            <div className="vr-section-label">ADDITIONAL SERVICES</div>
            {receiptData.additional_services.map((svc, i) => (
              <div className="vr-item" key={i}>
                <div className="vr-item-name">{svc.name}</div>
                <div className="vr-item-price">{formatCurrency(svc.cost)}</div>
              </div>
            ))}
          </>
        )}


        {/* Totals */}
        <div className="vr-row"><span>Subtotal (incl. VAT)</span><span>{formatCurrency(receiptData.subtotal)}</span></div>
        <div className="vr-row"><span>VAT 12%</span><span>-{formatCurrency(Math.abs(Number(receiptData.breakdown?.vat_amount ?? receiptData.tax ?? 0) || 0))}</span></div>
        <div className="vr-total">
          <span>TOTAL</span>
          <span>{formatCurrency(receiptData.total)}</span>
        </div>

        {/* Payment info */}
        <div className="vr-row"><span>Payment Method</span><span>{receiptData.payment_method?.toUpperCase()}</span></div>
        <div className="vr-row"><span>Status</span><span>{receiptData.payment_status?.toUpperCase()}</span></div>
        {receiptData.paid_date && (
          <div className="vr-row"><span>Paid on</span><span>{new Date(receiptData.paid_date).toLocaleDateString()}</span></div>
        )}


        {/* Footer */}
        <div className="vr-footer">
          <p>Thank you for trusting {STORE_INFO.name}<br />with your pet's health!</p>
        </div>

      </div>
      {/* ── End receipt content ── */}

      {/* Action buttons — screen only, excluded from PDF/print */}
      <div className="vr-actions">
        <button className="vr-btn vr-btn--primary" onClick={handlePrint}>
          <FontAwesomeIcon icon={faPrint} /> Print
        </button>
        <button className="vr-btn vr-btn--secondary" onClick={handleDownloadPDF}>
          <FontAwesomeIcon icon={faDownload} /> Download PDF
        </button>
        <button className="vr-btn vr-btn--ghost" onClick={handleClose}>
          <FontAwesomeIcon icon={faTimes} /> Close
        </button>
      </div>

    </section>
  );
};

export default VetReceipt;
