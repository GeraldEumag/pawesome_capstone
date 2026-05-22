import React, { useState, useMemo, useCallback, useEffect } from "react";
import { apiRequest } from "../../api/client";
import { exportToCSV, exportToPDF } from "../../utils/reportExport";
import { useRealTimeSync } from "../../hooks/useRealTimeSync";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import DatePickerInput from "../../components/shared/DatePickerInput";
import {
  faUsers,
  faChartBar,
  faSearch,
  faFilter,
  faCalendarAlt,
  faFileCsv,
  faFilePdf,
  faEye,
  faUser,
  faEnvelope,
  faPhone,
  faShoppingCart,
  faCreditCard,
  faPaw,
  faClock,
  faCheckCircle,
  faExclamationTriangle,
  faSpinner,
  faSync,
} from "@fortawesome/free-solid-svg-icons";
import "./CustomerReport.css";

const CustomerReport = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const [filters, setFilters] = useState({
    startDate: "",
    endDate: "",
    status: "",
    search: "",
  });
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Normalize API response safely
  const normalizeResponse = (result) => {
    if (Array.isArray(result)) return result;
    return result?.data?.customers || result?.customers || result?.data || result?.items || [];
  };

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (filters.startDate) params.append("start_date", filters.startDate);
    if (filters.endDate) params.append("end_date", filters.endDate);
    if (filters.status) params.append("status", filters.status);
    if (filters.search) params.append("search", filters.search);
    return params.toString();
  }, [filters.startDate, filters.endDate, filters.status, filters.search]);

  const fetchCustomerReports = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      
      const response = await apiRequest(`/admin/reports/customers?${buildParams()}`);
      
      if (response?.success) {
        setCustomers(normalizeResponse(response));
        setSummary(response?.summary || {});
        setError("");
      } else {
        setError("Failed to load customer reports");
        setCustomers([]);
      }
    } catch (err) {
      console.error("Error fetching customer reports:", err);
      setError("Failed to load customer reports. Please try again.");
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  // Use real-time sync hook for automatic polling every 30 seconds
  useRealTimeSync(fetchCustomerReports, [
    filters.startDate, 
    filters.endDate, 
    filters.status, 
    filters.search
  ], 30000);

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleExport = async (format) => {
    try {
      const columns = [
        { key: "customer_id", label: "Customer ID" },
        { key: "name", label: "Name" },
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
        { key: "status", label: "Status" },
        { key: "total_orders", label: "Total Orders" },
        { key: "total_order_amount", label: "Order Amount", format: "currency" },
        { key: "total_payments", label: "Payments", format: "currency" },
        { key: "balance_amount", label: "Balance", format: "currency" },
      ];

      if (format === "csv") {
        exportToCSV(filteredCustomers, columns, "customer-reports");
      } else if (format === "pdf") {
        await apiRequest(`/admin/reports/customers/export-pdf?${buildParams()}`);
        exportToPDF(filteredCustomers, columns, "Customer Reports", "customer-reports");
      }
    } catch (err) {
      console.error("Export error:", err);
      setError("Failed to export report");
    }
  };

  const viewCustomerDetail = async (customerId) => {
    try {
      const response = await apiRequest(`/admin/reports/customers/${customerId}`);
      
      if (response?.success) {
        setSelectedCustomer(response?.customer);
        setShowDetailModal(true);
      } else {
        setError(response?.message || "Failed to fetch customer details");
      }
    } catch (err) {
      console.error("Error fetching customer details:", err);
      setError("Failed to load customer details");
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
    }).format(amount || 0);
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case "active":
        return "#10b981";
      case "inactive":
        return "#ef4444";
      case "pending":
        return "#f59e0b";
      default:
        return "#6b7280";
    }
  };

  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        return (
          customer.name?.toLowerCase().includes(searchLower) ||
          customer.email?.toLowerCase().includes(searchLower) ||
          customer.phone?.toLowerCase().includes(searchLower)
        );
      }
      return true;
    });
  }, [customers, filters.search]);

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / pageSize));
  const paginatedCustomers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCustomers.slice(start, start + pageSize);
  }, [filteredCustomers, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters.startDate, filters.endDate, filters.status, filters.search]);

  const SummaryCards = () => (
    <div className="summary-grid">
      <div className="summary-card">
        <div className="summary-icon">
          <FontAwesomeIcon icon={faUsers} />
        </div>
        <div className="summary-content">
          <div className="summary-value">{summary.total_customers || 0}</div>
          <div className="summary-label">Total Customers</div>
        </div>
      </div>
      
      <div className="summary-card">
        <div className="summary-icon">
          <FontAwesomeIcon icon={faCheckCircle} />
        </div>
        <div className="summary-content">
          <div className="summary-value">{summary.active_customers || 0}</div>
          <div className="summary-label">Active Customers</div>
        </div>
      </div>
      
      <div className="summary-card">
        <div className="summary-icon">
          <FontAwesomeIcon icon={faShoppingCart} />
        </div>
        <div className="summary-content">
          <div className="summary-value">{summary.total_orders || 0}</div>
          <div className="summary-label">Total Orders</div>
        </div>
      </div>
      
      <div className="summary-card">
        <div className="summary-icon">
          <FontAwesomeIcon icon={faCreditCard} />
        </div>
        <div className="summary-content">
          <div className="summary-value">{formatCurrency(summary.total_revenue)}</div>
          <div className="summary-label">Total Revenue</div>
        </div>
      </div>
      
      <div className="summary-card">
        <div className="summary-icon">
          <FontAwesomeIcon icon={faPaw} />
        </div>
        <div className="summary-content">
          <div className="summary-value">{formatCurrency(summary.outstanding_balance)}</div>
          <div className="summary-label">Outstanding Balance</div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="customer-report-container">
      <div className="report-header">
        <h1>
          <FontAwesomeIcon icon={faUsers} />
          Customer Reports
        </h1>
        <p>Comprehensive customer analytics and insights</p>
      </div>

      <div className="filters-section">
        <div className="filter-card">
          <h3>
            <FontAwesomeIcon icon={faFilter} />
            Filters
          </h3>
          <div className="filter-grid">
            <div className="filter-group">
              <label>
                <FontAwesomeIcon icon={faCalendarAlt} />
                Start Date
              </label>
              <DatePickerInput
                selected={filters.startDate ? new Date(filters.startDate) : null}
                onChange={(date) => handleFilterChange("startDate", date ? date.toISOString().split("T")[0] : "")}
                placeholderText="From..."
              />
            </div>
            
            <div className="filter-group">
              <label>
                <FontAwesomeIcon icon={faCalendarAlt} />
                End Date
              </label>
              <DatePickerInput
                selected={filters.endDate ? new Date(filters.endDate) : null}
                onChange={(date) => handleFilterChange("endDate", date ? date.toISOString().split("T")[0] : "")}
                placeholderText="To..."
              />
            </div>
            
            <div className="filter-group">
              <label>
                <FontAwesomeIcon icon={faChartBar} />
                Status
              </label>
              <select
                value={filters.status}
                onChange={(e) => handleFilterChange("status", e.target.value)}
              >
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="pending">Pending</option>
              </select>
            </div>
            
            <div className="filter-group">
              <label>
                <FontAwesomeIcon icon={faSearch} />
                Search
              </label>
              <input
                type="text"
                placeholder="Search by name, email, or phone..."
                value={filters.search}
                onChange={(e) => handleFilterChange("search", e.target.value)}
              />
            </div>
          </div>
          
          <div className="filter-actions">
            <button onClick={fetchCustomerReports} className="btn btn-primary">
              <FontAwesomeIcon icon={faSync} />
              Apply Filters
            </button>
            <div className="export-buttons">
              <button
                onClick={() => handleExport("csv")}
                className="btn btn-secondary"
                title="Export to CSV"
              >
                <FontAwesomeIcon icon={faFileCsv} />
                CSV
              </button>
              <button
                onClick={() => handleExport("pdf")}
                className="btn btn-secondary"
                title="Export to PDF"
              >
                <FontAwesomeIcon icon={faFilePdf} />
                PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      <SummaryCards />

      {summary.report_period && (
        <div className="report-period">
          <FontAwesomeIcon icon={faClock} />
          Report Period: {summary.report_period.start_date} to {summary.report_period.end_date} ({summary.report_period.days} days)
        </div>
      )}

      <div className="table-container">
        <div className="table-header">
          <h2>
            <FontAwesomeIcon icon={faUsers} />
            Customer List
          </h2>
          <div className="table-info">
            Showing {filteredCustomers.length} of {customers.length} customers
          </div>
        </div>

        {loading ? (
          <div className="loading-container">
            <FontAwesomeIcon icon={faSpinner} spin />
            <p>Loading customer reports...</p>
          </div>
        ) : error ? (
          <div className="error-container">
            <FontAwesomeIcon icon={faExclamationTriangle} />
            <p>{error}</p>
            <button onClick={fetchCustomerReports} className="btn btn-primary">
              <FontAwesomeIcon icon={faSync} />
              Retry
            </button>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="customer-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Total Orders</th>
                  <th>Total Amount</th>
                  <th>Paid Amount</th>
                  <th>Balance</th>
                  <th>Last Order</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedCustomers.map((customer) => (
                  <tr key={customer.customer_id}>
                    <td>{customer.customer_id}</td>
                    <td>
                      <div className="customer-name">
                        <FontAwesomeIcon icon={faUser} />
                        {customer.name}
                      </div>
                    </td>
                    <td>
                      <div className="customer-email">
                        <FontAwesomeIcon icon={faEnvelope} />
                        {customer.email}
                      </div>
                    </td>
                    <td>
                      <div className="customer-phone">
                        <FontAwesomeIcon icon={faPhone} />
                        {customer.phone}
                      </div>
                    </td>
                    <td>
                      <span
                        className="status-badge"
                        style={{ backgroundColor: getStatusColor(customer.status) }}
                      >
                        {customer.status}
                      </span>
                    </td>
                    <td>{customer.total_orders}</td>
                    <td>{formatCurrency(customer.total_order_amount)}</td>
                    <td>{formatCurrency(customer.total_payments)}</td>
                    <td>
                      <span
                        className={`balance-amount ${
                          customer.balance_amount > 0 ? "negative" : "positive"
                        }`}
                      >
                        {formatCurrency(customer.balance_amount)}
                      </span>
                    </td>
                    <td>{formatDate(customer.last_order_date)}</td>
                    <td>
                      <button
                        onClick={() => viewCustomerDetail(customer.customer_id)}
                        className="btn-action"
                        title="View Details"
                      >
                        <FontAwesomeIcon icon={faEye} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredCustomers.length > pageSize && (
              <div className="standard-table-pagination">
                <span>
                  Showing {(currentPage - 1) * pageSize + 1}-
                  {Math.min(currentPage * pageSize, filteredCustomers.length)} of {filteredCustomers.length}
                </span>
                <div className="pagination-actions">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </button>
                  <strong>{currentPage} / {totalPages}</strong>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Customer Detail Modal */}
      {showDetailModal && selectedCustomer && (
        <div className="modal-overlay" onClick={() => setShowDetailModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                <FontAwesomeIcon icon={faUser} />
                Customer Details
              </h2>
              <button
                className="modal-close"
                onClick={() => setShowDetailModal(false)}
              >
                ×
              </button>
            </div>
            
            <div className="modal-body">
              <div className="customer-info-section">
                <h3>Customer Information</h3>
                <div className="info-grid">
                  <div className="info-item">
                    <label>Customer ID:</label>
                    <span>{selectedCustomer.customer_info?.id}</span>
                  </div>
                  <div className="info-item">
                    <label>Name:</label>
                    <span>{selectedCustomer.customer_info?.name}</span>
                  </div>
                  <div className="info-item">
                    <label>Email:</label>
                    <span>{selectedCustomer.customer_info?.email}</span>
                  </div>
                  <div className="info-item">
                    <label>Phone:</label>
                    <span>{selectedCustomer.customer_info?.phone}</span>
                  </div>
                  <div className="info-item">
                    <label>Address:</label>
                    <span>{selectedCustomer.customer_info?.address || "N/A"}</span>
                  </div>
                  <div className="info-item">
                    <label>Status:</label>
                    <span
                      className="status-badge"
                      style={{ backgroundColor: getStatusColor(selectedCustomer.customer_info?.status) }}
                    >
                      {selectedCustomer.customer_info?.status}
                    </span>
                  </div>
                  <div className="info-item">
                    <label>Loyalty Points:</label>
                    <span>{selectedCustomer.customer_info?.loyalty_points || 0}</span>
                  </div>
                  <div className="info-item">
                    <label>Pets Count:</label>
                    <span>{selectedCustomer.customer_info?.pets_count || 0}</span>
                  </div>
                </div>
              </div>

              <div className="orders-section">
                <h3>Order History</h3>
                <div className="orders-list">
                  {selectedCustomer.order_history?.map((order) => (
                    <div key={order.id} className="order-item">
                      <div className="order-header">
                        <strong>Order #{order.id}</strong>
                        <span
                          className="status-badge"
                          style={{ backgroundColor: getStatusColor(order.status) }}
                        >
                          {order.status}
                        </span>
                      </div>
                      <div className="order-details">
                        <div className="order-amount">
                          <label>Amount:</label>
                          <span>{formatCurrency(order.total_amount)}</span>
                        </div>
                        <div className="order-date">
                          <label>Date:</label>
                          <span>{formatDate(order.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="service-requests-section">
                <h3>Service Requests</h3>
                <div className="service-requests-list">
                  {(Array.isArray(selectedCustomer.service_requests)
                    ? selectedCustomer.service_requests.length
                    : selectedCustomer.service_requests?.total) > 0 ? (
                    (Array.isArray(selectedCustomer.service_requests)
                      ? selectedCustomer.service_requests
                      : selectedCustomer.service_requests?.statuses || []
                    ).map((status, index) => (
                      <div key={index} className="service-status-item">
                        <span className="service-status">{status.service_name || status.service_type || status.status}</span>
                        <span className="service-count">{status.count || status.status}</span>
                      </div>
                    ))
                  ) : (
                    <p>No service requests found</p>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setShowDetailModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerReport;
