import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPrint,
  faDownload,
  faTimes,
  faPaw,
  faUser,
  faDollarSign,
  faFileInvoice,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import { formatCurrency } from "../../utils/currency";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { useTheme } from "../../utils/theme";
import "./theme.css";
import "./VetReceipt.css";

const VetReceipt = () => {
  useTheme();
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
        subtotal: receipt.amount || 0,
        tax: 0,
        total: receipt.amount || 0,
        payment_method: 'Cash',
        payment_status: receipt.status || 'pending',
      });
      setError("");
    } catch (err) {
      setError(err.message || "Failed to fetch receipt");
      console.error("Receipt fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    try {
      if (!receiptData) return;
      const element = document.getElementById("receipt-content");

      const canvas = await html2canvas(element);
      const imgData = canvas.toDataURL("image/png");

      const pdf = new jsPDF("p", "mm", "a4");
      const width = pdf.internal.pageSize.getWidth();

      pdf.addImage(imgData, "PNG", 10, 10, width - 20, 0);
      pdf.save(`receipt-${receiptData.id}.pdf`);
    } catch (err) {
      setError("Failed to download PDF");
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
        <div className="premium-card vet-loading-state">
          <FontAwesomeIcon icon={faSpinner} className="spin-animation" />
          <span>Loading receipt...</span>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="app-content vet-receipt">
        <div className="premium-card vet-error-banner">
          <span>⚠️ {error}</span>
        </div>
      </section>
    );
  }

  if (!receiptData) {
    return (
      <section className="app-content vet-receipt">
        <div className="premium-card vet-empty-state">
          <FontAwesomeIcon icon={faFileInvoice} />
          <h3>No receipt selected</h3>
          <p>Please select a receipt from the reports page to view details</p>
        </div>
      </section>
    );
  }

  return (
    <section className="app-content vet-receipt" id="receipt-content">
      <div className="receipt-container">
        <div className="premium-card receipt-card">
          <div className="receipt-header">
            <h1>Payment Receipt</h1>
            <p>Pawesome Pet Care Center</p>
            <p>Receipt #{receiptData.id}</p>
          </div>

          <div className="receipt-body">
          <div className="receipt-section">
            <h3>Service Information</h3>
            <div className="receipt-info">
              <div className="info-label">Date:</div>
              <div className="info-value">{new Date(receiptData.date).toLocaleDateString()}</div>
            </div>
            <div className="receipt-info">
              <div className="info-label">Time:</div>
              <div className="info-value">{receiptData.time}</div>
            </div>
            <div className="receipt-info">
              <div className="info-label">Type:</div>
              <div className="info-value">{receiptData.service_type?.toUpperCase()}</div>
            </div>
            <div className="receipt-info">
              <div className="info-label">Veterinarian:</div>
              <div className="info-value">Dr. {receiptData.vet_name}</div>
            </div>
          </div>

          <div className="receipt-section">
            <h3>Patient Information</h3>
            <div className="receipt-info">
              <div className="info-label">Pet Name:</div>
              <div className="info-value">
                <FontAwesomeIcon icon={faPaw} /> {receiptData.pet_name}
              </div>
            </div>
            <div className="receipt-info">
              <div className="info-label">Owner:</div>
              <div className="info-value">
                <FontAwesomeIcon icon={faUser} /> {receiptData.owner_name}
              </div>
            </div>
            <div className="receipt-info">
              <div className="info-label">Breed:</div>
              <div className="info-value">{receiptData.pet_breed || "N/A"}</div>
            </div>
            <div className="receipt-info">
              <div className="info-label">Age:</div>
              <div className="info-value">{receiptData.pet_age || "N/A"}</div>
            </div>
          </div>

          <div className="receipt-section">
            <h3>Service Details</h3>
            <div className="service-item">
              <div className="service-header">
                <div className="service-name">{receiptData.service_name}</div>
                <div className="service-price">
                  <FontAwesomeIcon icon={faDollarSign} />
                  {formatCurrency(receiptData.service_cost)}
                </div>
              </div>
              <div className="service-details">
                {receiptData.description}
              </div>
            </div>
            
            {receiptData.additional_services && receiptData.additional_services.length > 0 && (
              <div className="service-item">
                <div className="service-header">
                  <div className="service-name">Additional Services</div>
                  <div className="service-price">
                    <FontAwesomeIcon icon={faDollarSign} />
                    {formatCurrency(receiptData.additional_services.reduce((sum, service) => sum + (service.cost || 0), 0))}
                  </div>
                </div>
                <div className="service-details">
                  {(receiptData?.additional_services || []).map((service, index) => (
                    <div key={index} className="additional-service">
                      {service.name} - {formatCurrency(service.cost)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="receipt-footer">
            <div className="total-section">
              <div className="total-label">Subtotal:</div>
              <div className="total-amount">{formatCurrency(receiptData.subtotal)}</div>
            </div>
            
            {receiptData.tax && (
              <div className="total-section">
                <div className="total-label">Tax:</div>
                <div className="total-amount">{formatCurrency(receiptData.tax)}</div>
              </div>
            )}
            
            <div className="total-section">
              <div className="total-label">Total:</div>
              <div className="total-amount">{formatCurrency(receiptData.total)}</div>
            </div>
            
            <div className="payment-info">
              <p><strong>Payment Method:</strong> {receiptData.payment_method}</p>
              <p><strong>Status:</strong>{" "}
                <span className={`badge ${
                  receiptData.payment_status === "paid"
                    ? "badge-success"
                    : receiptData.payment_status === "pending"
                    ? "badge-warning"
                    : "badge-danger"
                }`}>
                  {receiptData.payment_status?.toUpperCase()}
                </span>
              </p>
              {receiptData.paid_date && (
                <p><strong>Paid on:</strong> {new Date(receiptData.paid_date).toLocaleDateString()}</p>
              )}
            </div>
          </div>

          <div className="receipt-actions">
            <button className="btn-primary" onClick={handlePrint}>
              <FontAwesomeIcon icon={faPrint} /> Print
            </button>
            <button className="btn-secondary" onClick={handleDownloadPDF}>
              <FontAwesomeIcon icon={faDownload} /> Download PDF
            </button>
            <button className="btn-secondary" onClick={handleClose}>
              <FontAwesomeIcon icon={faTimes} /> Close
            </button>
          </div>
        </div>
        </div>
      </div>
    </section>
  );
};

export default VetReceipt;
