import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMoneyBillWave,
  faCheckCircle,
  faSpinner,
  faReceipt,
  faCashRegister,
  faSearch,
  faFilter,
  faEye,
  faStethoscope,
  faScissors,
  faHotel
} from "@fortawesome/free-solid-svg-icons";
import toast from "react-hot-toast";
import { apiRequest } from "../../api/client";
import Modal from "./Modal";
import "./ServiceBillingCashierPanel.css";

const ServiceBillingCashierPanel = () => {
  const [unpaidServices, setUnpaidServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const [paymentData, setPaymentData] = useState({
    method: "cash",
    amount: 0,
    reference_number: "",
    notes: ""
  });
  const [processing, setProcessing] = useState(false);
  const [filter, setFilter] = useState({
    service_type: "",
    search: ""
  });

  useEffect(() => {
    fetchUnpaidServices();
  }, []);

  const fetchUnpaidServices = async () => {
    try {
      setLoading(true);
      const response = await apiRequest("/billing/unpaid-services");
      if (response.success) {
        setUnpaidServices(response.services || []);
      }
    } catch (error) {
      console.error("Failed to fetch unpaid services:", error);
      toast.error("Failed to load unpaid services");
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (service) => {
    setSelectedService(service);
    setSelectedItems([]);
    setPaymentData({
      method: "cash",
      amount: service.billing.balance_due,
      reference_number: "",
      notes: ""
    });
    setShowPaymentModal(true);
  };

  const handleItemSelection = (itemId) => {
    setSelectedItems(prev => {
      if (prev.includes(itemId)) {
        return prev.filter(id => id !== itemId);
      } else {
        return [...prev, itemId];
      }
    });
  };

  const handleSelectAllItems = () => {
    const allItemIds = selectedService?.billing.items.map(item => item.id) || [];
    setSelectedItems(allItemIds);
  };

  const calculateSelectedTotal = () => {
    if (!selectedService) return 0;
    return selectedService.billing.items
      .filter(item => selectedItems.includes(item.id))
      .reduce((total, item) => total + item.total_price, 0);
  };

  const handlePayment = async () => {
    if (selectedItems.length === 0) {
      toast.error("Please select at least one billing item to pay");
      return;
    }

    try {
      setProcessing(true);
      
      const response = await apiRequest("/billing/items/mark-paid", {
        method: "PATCH",
        body: JSON.stringify({
          item_ids: selectedItems
        })
      });

      if (response.success) {
        toast.success(`Payment verified for ${response.items_updated} items`);
        setShowPaymentModal(false);
        setSelectedService(null);
        setSelectedItems([]);
        fetchUnpaidServices();
      } else {
        toast.error(response.message || "Failed to process payment");
      }
    } catch (error) {
      console.error("Failed to process payment:", error);
      toast.error("Failed to process payment");
    } finally {
      setProcessing(false);
    }
  };

  const getServiceIcon = (serviceType) => {
    const icons = {
      "veterinary": faStethoscope,
      "grooming": faScissors,
      "boarding": faHotel
    };
    return icons[serviceType] || faReceipt;
  };

  const getServiceTypeLabel = (serviceType) => {
    return serviceType.charAt(0).toUpperCase() + serviceType.slice(1);
  };

  const filteredServices = unpaidServices.filter(service => {
    const matchesType = !filter.service_type || service.service_type === filter.service_type;
    const matchesSearch = !filter.search || 
      service.service?.pet_name?.toLowerCase().includes(filter.search.toLowerCase()) ||
      service.service?.customer_name?.toLowerCase().includes(filter.search.toLowerCase());
    return matchesType && matchesSearch;
  });

  if (loading) {
    return (
      <div className="billing-cashier-panel loading">
        <FontAwesomeIcon icon={faSpinner} spin />
        <span>Loading unpaid services...</span>
      </div>
    );
  }

  return (
    <div className="service-billing-cashier-panel">
      <div className="cashier-header">
        <h2>
          <FontAwesomeIcon icon={faCashRegister} />
          Service Billing - Unpaid Balances
        </h2>
        <div className="header-stats">
          <div className="stat-item">
            <span className="stat-value">{unpaidServices.length}</span>
            <span className="stat-label">Unpaid Services</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">
              ₱{unpaidServices.reduce((total, service) => total + service.billing.balance_due, 0).toFixed(2)}
            </span>
            <span className="stat-label">Total Unpaid</span>
          </div>
        </div>
      </div>

      <div className="filters">
        <div className="filter-group">
          <FontAwesomeIcon icon={faFilter} />
          <select
            value={filter.service_type}
            onChange={(e) => setFilter(prev => ({ ...prev, service_type: e.target.value }))}
          >
            <option value="">All Services</option>
            <option value="veterinary">Veterinary</option>
            <option value="grooming">Grooming</option>
            <option value="boarding">Boarding</option>
          </select>
        </div>
        <div className="filter-group">
          <FontAwesomeIcon icon={faSearch} />
          <input
            type="text"
            placeholder="Search by pet or customer name..."
            value={filter.search}
            onChange={(e) => setFilter(prev => ({ ...prev, search: e.target.value }))}
          />
        </div>
      </div>

      <div className="services-list">
        {filteredServices.length === 0 ? (
          <div className="no-services">
            <FontAwesomeIcon icon={faReceipt} />
            <h3>No unpaid services found</h3>
            <p>All services have been fully paid</p>
          </div>
        ) : (
          filteredServices.map((service, index) => (
            <div key={`${service.service_type}-${service.service_id}`} className="service-card">
              <div className="service-header">
                <div className="service-icon">
                  <FontAwesomeIcon icon={getServiceIcon(service.service_type)} />
                </div>
                <div className="service-info">
                  <h4>{getServiceTypeLabel(service.service_type)} Service</h4>
                  <div className="service-details">
                    <span className="pet-name">{service.service?.pet_name}</span>
                    <span className="separator">•</span>
                    <span className="customer-name">{service.service?.customer_name}</span>
                  </div>
                  <div className="service-meta">
                    <span className="service-id">#{service.service_id}</span>
                    <span className="created-date">
                      {new Date(service.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="service-balance">
                  <div className="balance-amount">
                    ₱{service.billing.balance_due.toFixed(2)}
                  </div>
                  <div className="balance-label">Balance Due</div>
                </div>
                <button
                  className="view-details-btn"
                  onClick={() => handleViewDetails(service)}
                >
                  <FontAwesomeIcon icon={faEye} />
                  View & Pay
                </button>
              </div>
              
              <div className="billing-summary">
                <div className="summary-row">
                  <span>Total Bill:</span>
                  <span>₱{service.billing.total_bill.toFixed(2)}</span>
                </div>
                <div className="summary-row">
                  <span>Amount Paid:</span>
                  <span>₱{service.billing.total_paid.toFixed(2)}</span>
                </div>
                <div className="summary-row unpaid">
                  <span>Balance Due:</span>
                  <span>₱{service.billing.balance_due.toFixed(2)}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showPaymentModal && selectedService && (
        <Modal
          onClose={() => setShowPaymentModal(false)}
          title="Process Payment"
          icon={faMoneyBillWave}
          size="lg"
        >
            <div className="service-summary">
              <h4>{getServiceTypeLabel(selectedService.service_type)} Service</h4>
              <div className="service-details">
                <span>Pet: {selectedService.service?.pet_name}</span>
                <span>Customer: {selectedService.service?.customer_name}</span>
                <span>Balance Due: ₱{selectedService.billing.balance_due.toFixed(2)}</span>
              </div>
            </div>

            <div className="billing-items">
              <div className="items-header">
                <h4>Billing Items</h4>
                <div className="item-actions">
                  <button
                    className="select-all-btn"
                    onClick={handleSelectAllItems}
                  >
                    Select All
                  </button>
                  <span className="selected-count">
                    {selectedItems.length} of {selectedService.billing.items.length} selected
                  </span>
                </div>
              </div>

              <div className="items-list">
                {selectedService.billing.items.map((item) => (
                  <div
                    key={item.id}
                    className={`billing-item ${selectedItems.includes(item.id) ? 'selected' : ''}`}
                    onClick={() => handleItemSelection(item.id)}
                  >
                    <div className="item-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedItems.includes(item.id)}
                        onChange={() => handleItemSelection(item.id)}
                      />
                    </div>
                    <div className="item-details">
                      <div className="item-description">{item.description}</div>
                      <div className="item-meta">
                        <span className="quantity">{item.quantity} {item.unit}</span>
                        <span className="unit-price">₱{item.unit_price.toFixed(2)} each</span>
                      </div>
                    </div>
                    <div className="item-total">
                      ₱{item.total_price.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="payment-summary">
                <div className="summary-row">
                  <span>Selected Items Total:</span>
                  <span>₱{calculateSelectedTotal().toFixed(2)}</span>
                </div>
                <div className="summary-row">
                  <span>Original Balance:</span>
                  <span>₱{selectedService.billing.balance_due.toFixed(2)}</span>
                </div>
                <div className="summary-row highlight">
                  <span>Amount to Collect:</span>
                  <span>₱{calculateSelectedTotal().toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="payment-form">
              <div className="form-row">
                <div className="form-group">
                  <label>Payment Method</label>
                  <select
                    value={paymentData.method}
                    onChange={(e) => setPaymentData(prev => ({ ...prev, method: e.target.value }))}
                  >
                    <option value="cash">Cash</option>
                    <option value="credit_card">Credit Card</option>
                    <option value="debit_card">Debit Card</option>
                    <option value="gcash">GCash</option>
                    <option value="maya">Maya</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="check">Check</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Reference Number</label>
                  <input
                    type="text"
                    value={paymentData.reference_number}
                    onChange={(e) => setPaymentData(prev => ({ ...prev, reference_number: e.target.value }))}
                    placeholder="Transaction reference..."
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea
                  value={paymentData.notes}
                  onChange={(e) => setPaymentData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Payment notes..."
                  rows="2"
                />
              </div>
            </div>

            <div className="modal-actions">
              <button
                className="cancel-btn"
                onClick={() => setShowPaymentModal(false)}
              >
                Cancel
              </button>
              <button
                className="process-payment-btn"
                onClick={handlePayment}
                disabled={processing || selectedItems.length === 0}
              >
                {processing ? (
                  <FontAwesomeIcon icon={faSpinner} spin />
                ) : (
                  <FontAwesomeIcon icon={faCheckCircle} />
                )}
                Process Payment
              </button>
            </div>
        </Modal>
      )}
    </div>
  );
};

export default ServiceBillingCashierPanel;
