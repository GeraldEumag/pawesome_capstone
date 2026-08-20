import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { apiRequest } from "../../../api/client";
import { getToken } from "../../../utils/auth";
import { showSuccess, showError, showPrompt, showConfirm, showAlert } from "../../../utils/alert.jsx";
import { printReceipt as printReceiptUtil } from "../../../utils/receiptPrinter";
import { exportToCSV as exportCSVUtil, exportToPDF, exportToExcel } from "../../../utils/reportExport";

export const usePaymentApprovals = (user) => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const rateLimitedRef = useRef(false);
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("date-desc");
  
  // Bulk selection
  const [selectedIds, setSelectedIds] = useState([]);
  
  // Proof modal
  const [proofModal, setProofModal] = useState(null);

  // Fetch requests
  const fetchRequests = useCallback(async ({ silent = false } = {}) => {
    if (rateLimitedRef.current) return;
    try {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const data = await apiRequest("/cashier/payment-requests");
      const list = data?.data || data?.requests || data?.payments || data || [];
      setRequests(list);
      setLastUpdated(new Date());
    } catch (err) {
      if (err?.message?.toLowerCase().includes("too many") || err?.status === 429) {
        console.warn("Payment requests rate limited — pausing polling for 5 minutes.");
        rateLimitedRef.current = true;
        setTimeout(() => { rateLimitedRef.current = false; }, 5 * 60 * 1000);
      } else {
        console.error("Failed to load payment requests:", err);
      }
      if (!silent) setRequests([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load and auto-refresh
  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchRequests({ silent: true });
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchRequests]);

  // Proof modal handlers
  const openProof = useCallback(async (proofUrl, payment) => {
    setProofModal({ blobUrl: null, isPdf: false, loading: true, error: null, payment: null });
    if (!proofUrl) {
      setProofModal({ blobUrl: null, isPdf: false, loading: false, error: null, payment });
      return;
    }
    try {
      const token = getToken();
      const res = await fetch(proofUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const isPdf = blob.type === "application/pdf";
      setProofModal({ blobUrl, isPdf, loading: false, error: null, payment });
    } catch (err) {
      setProofModal({ blobUrl: null, isPdf: false, loading: false, error: err.message, payment });
    }
  }, []);

  const closeProof = useCallback(() => {
    if (proofModal?.blobUrl) URL.revokeObjectURL(proofModal.blobUrl);
    setProofModal(null);
  }, [proofModal]);

  // Print receipt helper — uses shared receiptPrinter utility
  const printReceipt = useCallback((data, payment, referenceNumber = "") => {
    const receiptNumber = data.receipt_number || data.receipt?.receipt_number || `REC-${payment.id}`;
    const amount = Number(data.amount || data.receipt?.total_amount || payment.amount || payment.total_amount || 0);
    const cashier = user?.name || "Cashier";
    const customer = payment.customer_name || payment.customer?.name || "Customer";
    const service = payment.service_name || payment.service?.name || payment.order_name || payment.request_type || payment.type || "Payment";
    const method = payment.payment_method || data.payment_method || "Online Payment";
    const refNum = referenceNumber || data.payment_reference || "";

    // Build items list — use actual items if available, otherwise single service line
    let items;
    const rawItems = data.receipt?.items || payment.items || [];
    if (rawItems.length > 0) {
      items = rawItems.map((item) => ({
        name: item.item_name || item.name || item.description || "Item",
        quantity: Number(item.quantity || 1),
        unitPrice: Number(item.unit_price || item.price || item.amount || 0),
        total: Number(item.total_price || item.total || item.amount || 0),
      }));
    } else {
      items = [{ name: service, quantity: 1, unitPrice: amount, total: amount }];
    }

    printReceiptUtil({
      title: "Official Payment Receipt",
      receiptNumber,
      date: new Date().toLocaleString("en-PH"),
      cashier,
      customer,
      paymentMethod: method,
      paymentStatus: "paid",
      referenceNumber: refNum,
      verifiedBy: cashier,
      items,
      subtotal: amount,
      total: amount,
    });
  }, [user]);

  // Verify single payment
  const verifyPayment = useCallback(async (payment, referenceNumber = "") => {
    const confirmed = await showConfirm(
      `Verify payment of ₱${Number(payment.amount || payment.total_amount || 0).toLocaleString("en-PH")} from ${payment.customer_name || payment.customer?.name || "Customer"}?`
    );
    if (!confirmed) return;

    try {
      setActionLoading(`${payment.id}-verify`);
      const data = await apiRequest(`/cashier/payment-requests/${payment.id}/verify`, "POST", {
        type: payment.payable_type || payment.type || payment.payment_source || "service_request",
        cashier_remarks: "Payment verified by cashier",
        reference_number: referenceNumber.trim(),
        payment_method: payment.payment_method || "counter",
      });

      if (data && data.success) {
        printReceipt(data, payment, referenceNumber);
        showSuccess(data.message || `Payment verified. Receipt: ${data.receipt_number || "Generated"}`);
        fetchRequests({ silent: true });
        return data;
      } else {
        showAlert(data?.message || "Failed to verify payment.");
        return data;
      }
    } catch (err) {
      console.error("Failed to verify payment:", err);
      showError(err.message || "Failed to verify payment.");
    } finally {
      setActionLoading(null);
    }
  }, [fetchRequests, printReceipt]);

  // Reject single payment
  const rejectPayment = useCallback(async (payment) => {
    const cashier_remarks = await showPrompt("Reason for rejecting this payment proof:");
    if (cashier_remarks === null) return;

    try {
      setActionLoading(`${payment.id}-reject`);
      const data = await apiRequest(`/cashier/payment-requests/${payment.id}/reject`, "POST", {
        type: payment.payable_type || payment.type || payment.payment_source || "service_request",
        cashier_remarks,
        rejection_reason: cashier_remarks,
      });

      if (data && data.success) {
        showSuccess(data.message || 'Payment rejected.');
        fetchRequests({ silent: true });
      } else {
        showAlert(data?.message || 'Failed to reject payment.');
      }
    } catch (err) {
      console.error("Failed to reject payment:", err);
      showError(err.message || "Failed to reject payment.");
    } finally {
      setActionLoading(null);
    }
  }, [fetchRequests]);

  // Bulk verify
  const bulkVerify = useCallback(async () => {
    if (selectedIds.length === 0) return;
    
    const confirmed = await showConfirm(
      `Verify ${selectedIds.length} payment${selectedIds.length > 1 ? 's' : ''}?`
    );
    if (!confirmed) return;

    let successCount = 0;
    for (const id of selectedIds) {
      try {
        const payment = requests.find(r => r.id === id);
        if (!payment) continue;
        
        const data = await apiRequest(`/cashier/payment-requests/${id}/verify`, "POST", {
          type: payment.payable_type || payment.type || payment.payment_source || "service_request",
          cashier_remarks: "Payment verified by cashier (bulk)",
        });
        
        if (data?.success) successCount++;
      } catch (err) {
        console.error(`Failed to verify payment ${id}:`, err);
      }
    }
    
    showSuccess(`${successCount} of ${selectedIds.length} payments verified.`);
    setSelectedIds([]);
    fetchRequests({ silent: true });
  }, [selectedIds, requests, fetchRequests]);

  // Bulk reject
  const bulkReject = useCallback(async () => {
    if (selectedIds.length === 0) return;
    
    const cashier_remarks = await showPrompt(`Reason for rejecting ${selectedIds.length} payment${selectedIds.length > 1 ? 's' : ''}:`);
    if (cashier_remarks === null) return;

    let successCount = 0;
    for (const id of selectedIds) {
      try {
        const payment = requests.find(r => r.id === id);
        if (!payment) continue;
        
        const data = await apiRequest(`/cashier/payment-requests/${id}/reject`, "POST", {
          type: payment.payable_type || payment.type || payment.payment_source || "service_request",
          cashier_remarks,
          rejection_reason: cashier_remarks,
        });
        
        if (data?.success) successCount++;
      } catch (err) {
        console.error(`Failed to reject payment ${id}:`, err);
      }
    }
    
    showSuccess(`${successCount} of ${selectedIds.length} payments rejected.`);
    setSelectedIds([]);
    fetchRequests({ silent: true });
  }, [selectedIds, requests, fetchRequests]);

  // Filtered and sorted requests - MUST be defined before callbacks that use it
  const filteredRequests = useMemo(() => {
    let filtered = requests.filter((item) => {
      const matchesSearch = !searchTerm ||
        (item.customer_name || item.customer?.name || "")
          .toLowerCase()
          .includes(searchTerm.toLowerCase());
      const matchesType = typeFilter === "all" ||
        (item.request_type || item.type || "").toLowerCase() === typeFilter.toLowerCase();
      return matchesSearch && matchesType;
    });

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "date-asc":
          return new Date(a.request_date || a.date) - new Date(b.request_date || b.date);
        case "date-desc":
          return new Date(b.request_date || b.date) - new Date(a.request_date || a.date);
        case "amount-asc":
          return (a.amount || a.total_amount || 0) - (b.amount || b.total_amount || 0);
        case "amount-desc":
          return (b.amount || b.total_amount || 0) - (a.amount || a.total_amount || 0);
        case "name-asc":
          return (a.customer_name || "").localeCompare(b.customer_name || "");
        case "name-desc":
          return (b.customer_name || "").localeCompare(a.customer_name || "");
        default:
          return 0;
      }
    });

    return filtered;
  }, [requests, searchTerm, typeFilter, sortBy]);

  // Selection handlers (now defined after filteredRequests)
  const toggleSelection = useCallback((id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  }, []);

  const selectAll = useCallback(() => {
    const allSelected = filteredRequests.every(r => selectedIds.includes(r.id));
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredRequests.map(r => r.id));
    }
  }, [filteredRequests, selectedIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
  }, []);

  // Export — supports CSV, Excel, and PDF via shared utilities
  const exportColumns = [
    { key: "request_date", label: "Date", format: "date" },
    { key: "customer_name", label: "Customer" },
    { key: "request_type", label: "Type" },
    { key: "service_name", label: "Service" },
    { key: "amount", label: "Amount", format: "currency" },
    { key: "payment_status", label: "Status" },
  ];

  const exportToCSV = useCallback((format = "csv") => {
    const data = filteredRequests;
    if (!data || data.length === 0) { showSuccess("No data to export"); return; }
    if (format === "csv") exportCSVUtil(data, exportColumns, "pending-payments");
    else if (format === "excel") exportToExcel(data, exportColumns, "pending-payments");
    else if (format === "pdf") exportToPDF(data, exportColumns, "Pending Payments Report", "pending-payments");
    showSuccess(`Exported ${data.length} records`);
  }, [filteredRequests]);

  // Stats
  const stats = useMemo(() => {
    const total = filteredRequests.length;
    const totalAmount = filteredRequests.reduce(
      (sum, item) => sum + Number(item.amount || item.total_amount || 0),
      0
    );
    const verifiedToday = requests.filter(r => {
      const verifiedAt = r.verified_at || r.paid_at || r.updated_at;
      if (!verifiedAt) return false;
      const date = new Date(verifiedAt);
      const today = new Date();
      const ps = r.payment_status || "";
      return date.toDateString() === today.toDateString() && (ps === "verified" || ps === "paid");
    }).length;
    
    return { total, totalAmount, verifiedToday };
  }, [filteredRequests, requests]);

  return {
    // Data
    requests,
    filteredRequests,
    loading,
    refreshing,
    actionLoading,
    lastUpdated,
    stats,
    
    // Filters
    searchTerm,
    setSearchTerm,
    typeFilter,
    setTypeFilter,
    sortBy,
    setSortBy,
    
    // Selection
    selectedIds,
    toggleSelection,
    selectAll,
    clearSelection,
    
    // Actions
    fetchRequests,
    verifyPayment,
    rejectPayment,
    bulkVerify,
    bulkReject,
    exportToCSV,
    
    // Proof modal
    proofModal,
    openProof,
    closeProof,
  };
};
