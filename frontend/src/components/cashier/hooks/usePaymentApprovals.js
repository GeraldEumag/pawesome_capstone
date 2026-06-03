import { useState, useEffect, useCallback, useMemo } from "react";
import { apiRequest } from "../../../api/client";
import { getToken } from "../../../utils/auth";
import { showSuccess, showError, showPrompt, showConfirm, showAlert } from "../../../utils/alert";

export const usePaymentApprovals = (user) => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  
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
      console.error("Failed to load payment requests:", err);
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
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchRequests]);

  // Proof modal handlers
  const openProof = useCallback(async (proofUrl, payment) => {
    setProofModal({ blobUrl: null, isPdf: false, loading: true, error: null, payment: null });
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

  // Print receipt helper
  const printReceipt = useCallback((data, payment, referenceNumber = "") => {
    const receiptNumber = data.receipt_number || data.receipt?.receipt_number || `REC-${payment.id}`;
    const amount = Number(data.amount || data.receipt?.total_amount || payment.amount || payment.total_amount || 0);
    const date = new Date().toLocaleString("en-PH");
    const cashier = user?.name || "Cashier";
    const customer = payment.customer_name || payment.customer?.name || "Customer";
    const service = payment.service_name || payment.service?.name || payment.order_name || payment.request_type || payment.type || "Payment";
    const method = payment.payment_method || data.payment_method || "Online Payment";
    const refNum = referenceNumber || data.payment_reference || "N/A";

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
        .ref-row td{font-size:11px;color:#666}
        @media print{button{display:none}}
      </style></head><body>
      <h2>Pawesome Retreat Inc.</h2>
      <div class="center">Official Cashier Receipt<br>${date}</div>
      <hr>
      <table>
        <tr><td>Receipt #</td><td style="text-align:right">${receiptNumber}</td></tr>
        <tr><td>Cashier</td><td style="text-align:right">${cashier}</td></tr>
        <tr><td>Customer</td><td style="text-align:right">${customer}</td></tr>
        <tr><td>Payment Method</td><td style="text-align:right">${method}</td></tr>
        <tr class="ref-row"><td>Reference #</td><td style="text-align:right">${refNum}</td></tr>
        <tr><td>Status</td><td style="text-align:right">PAID</td></tr>
      </table>
      <hr>
      <table>
        <tr><td>${service}<br><small>Qty 1 x ₱${amount.toFixed(2)}</small></td><td style="text-align:right">₱${amount.toFixed(2)}</td></tr>
        <tr class="total"><td>Total</td><td style="text-align:right">₱${amount.toFixed(2)}</td></tr>
      </table>
      <hr>
      <div class="center">Verified by: ${cashier}<br>Thank you for your business!</div>
      <button onclick="window.print()">Print</button>
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }, [user]);

  // Verify single payment
  const verifyPayment = useCallback(async (payment, referenceNumber = "") => {
    if (!referenceNumber || referenceNumber.trim() === "") {
      showError("Reference number is required to verify payment");
      return;
    }

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

  // Export to CSV
  const exportToCSV = useCallback(() => {
    const data = filteredRequests;
    const headers = ["Date", "Customer", "Type", "Service", "Amount", "Status"];
    const rows = data.map(item => [
      new Date(item.request_date || item.date || item.created_at).toLocaleString("en-PH"),
      item.customer_name || item.customer?.name || "N/A",
      item.request_type || item.type || "-",
      item.service_name || item.service?.name || item.order_name || "-",
      item.amount || item.total_amount || 0,
      item.payment_status || "Pending"
    ]);
    
    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pending-payments-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showSuccess(`Exported ${data.length} records to CSV`);
  }, [filteredRequests]);

  // Stats
  const stats = useMemo(() => {
    const total = filteredRequests.length;
    const totalAmount = filteredRequests.reduce(
      (sum, item) => sum + Number(item.amount || item.total_amount || 0),
      0
    );
    const verifiedToday = requests.filter(r => {
      const verifiedAt = r.verified_at || r.updated_at;
      if (!verifiedAt) return false;
      const date = new Date(verifiedAt);
      const today = new Date();
      return date.toDateString() === today.toDateString() && r.payment_status === "verified";
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
