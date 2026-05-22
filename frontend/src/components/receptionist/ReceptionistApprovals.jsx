import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaCalendarAlt,
  FaCheckCircle,
  FaClock,
  FaCut,
  FaDownload,
  FaEye,
  FaFilter,
  FaHotel,
  FaInfoCircle,
  FaPaw,
  FaSearch,
  FaSpinner,
  FaSyncAlt,
  FaTimes,
  FaTimesCircle,
  FaUser,
  FaUserMd,
} from "react-icons/fa";
import { apiRequest } from "../../api/client";
import "./ReceptionistApprovals.css";

const TYPE_FILTERS = [
  { value: "all", label: "All Types" },
  { value: "vet", label: "Veterinary" },
  { value: "grooming", label: "Grooming" },
  { value: "hotel", label: "Hotel / Boarding" },
  { value: "order", label: "Orders" },
  { value: "other", label: "Other" },
];

const VET_FILTERS = [
  { value: "all", label: "All Vet Assignment" },
  { value: "needs_assignment", label: "Needs Vet Assignment" },
  { value: "assigned", label: "Assigned Vet" },
];

const normalizeList = (result, keys = []) => {
  if (Array.isArray(result)) return result;

  for (const key of keys) {
    if (Array.isArray(result?.[key])) return result[key];
    if (Array.isArray(result?.data?.[key])) return result.data[key];
    if (Array.isArray(result?.[key]?.data)) return result[key].data;
    if (Array.isArray(result?.data?.[key]?.data)) return result.data[key].data;
  }

  if (Array.isArray(result?.data)) return result.data;
  if (Array.isArray(result?.data?.data)) return result.data.data;
  if (Array.isArray(result?.boardings)) return result.boardings;
  if (Array.isArray(result?.boarding_requests)) return result.boarding_requests;
  if (Array.isArray(result?.requests)) return result.requests;
  if (Array.isArray(result?.service_requests)) return result.service_requests;
  if (Array.isArray(result?.pending_requests)) return result.pending_requests;

  return [];
};

const safeText = (value) => String(value || "").trim();

const normalizeStatus = (value) =>
  safeText(value || "pending").toLowerCase().replace(/\s+/g, "_");

const formatLabel = (value) =>
  safeText(value || "N/A")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatDate = (value) => {
  if (!value) return "No date";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
};

const formatTime = (value) => {
  if (!value) return "";

  if (String(value).includes("AM") || String(value).includes("PM")) {
    return value;
  }

  const [hour, minute] = String(value).split(":");
  if (!hour || !minute) return value;

  const date = new Date();
  date.setHours(Number(hour), Number(minute), 0, 0);

  return date.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  });
};

const getRequestId = (item) =>
  item.id || item.request_id || item.service_request_id || item.booking_id;

const getCustomerName = (item) =>
  item.customer_name ||
  item.customer?.name ||
  item.customer ||
  item.client_name ||
  "Unknown Customer";

const getPetName = (item) =>
  item.pet_name || item.pet?.name || item.pet || item.petName || "N/A";

const getServiceName = (item) =>
  item.service_name ||
  item.service?.name ||
  item.service ||
  item.name ||
  "Service Request";

const getRequestDate = (item) =>
  item.request_date ||
  item.booking_date ||
  item.appointment_date ||
  item.scheduled_date ||
  item.date ||
  item.created_at ||
  "";

const getRequestTime = (item) =>
  item.request_time ||
  item.booking_time ||
  item.appointment_time ||
  item.scheduled_time ||
  item.time ||
  "";

const getRawType = (item) =>
  safeText(
    item.request_type ||
      item.service_type ||
      item.type ||
      item.category ||
      item.source ||
      getServiceName(item)
  );

const getRequestType = (item) => {
  const values = [
    item.request_type,
    item.service_type,
    item.type,
    item.category,
    item.source,
    item.service_name,
    item.service?.name,
    item.service,
    item.name,
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  if (
    values.some(
      (value) =>
        value === "vet" ||
        value === "veterinary" ||
        value.includes("veterinary") ||
        value.includes("consult") ||
        value.includes("vaccination") ||
        value.includes("medical")
    )
  ) {
    return "vet";
  }

  if (values.some((value) => value.includes("groom"))) {
    return "grooming";
  }

  if (
    values.some(
      (value) =>
        value.includes("hotel") ||
        value.includes("boarding") ||
        value.includes("board")
    )
  ) {
    return "hotel";
  }

  if (values.some((value) => value.includes("order") || value.includes("store"))) {
    return "order";
  }

  return "other";
};

const getTypeLabel = (type) => {
  if (type === "vet") return "Veterinary";
  if (type === "grooming") return "Grooming";
  if (type === "hotel") return "Hotel";
  if (type === "order") return "Order";
  return "Other";
};

const getTypeIcon = (type) => {
  if (type === "vet") return <FaUserMd />;
  if (type === "grooming") return <FaCut />;
  if (type === "hotel") return <FaHotel />;
  if (type === "order") return <FaClock />;
  return <FaPaw />;
};

const normalizeBoardingApproval = (boarding) => ({
  ...boarding,
  approval_source: "boarding",
  request_type: "hotel_boarding",
  service_type: "hotel_boarding",
  type: "hotel_boarding",
  service_name: boarding.service_name || "Pet Hotel / Boarding",
  request_date: boarding.check_in || boarding.check_in_date || boarding.created_at,
  request_time: boarding.check_in_time,
  date: boarding.check_in || boarding.check_in_date,
  time: boarding.check_in_time,
  pet_name: boarding.pet_name || boarding.pet?.name,
  customer_name: boarding.customer_name || boarding.customer?.name,
  customer_email: boarding.customer_email || boarding.customer?.email,
  notes:
    boarding.special_requests ||
    boarding.feeding_instructions ||
    boarding.medication_notes ||
    boarding.notes,
});

const ReceptionistApprovals = () => {
  const [requests, setRequests] = useState([]);
  const [veterinarians, setVeterinarians] = useState([]);
  const [vetAssignments, setVetAssignments] = useState({});

  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [vetFilter, setVetFilter] = useState("all");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState(null);

  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [vetError, setVetError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  const [selectedRequest, setSelectedRequest] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);
  const [actionType, setActionType] = useState("");
  const [actionForm, setActionForm] = useState({
    veterinarianId: "",
    remarks: "",
    rejectionReason: "",
  });
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkActionOpen, setBulkActionOpen] = useState(false);
  const [bulkActionType, setBulkActionType] = useState("");

  const showMessage = (type, message) => {
    if (type === "success") {
      setSuccess(message);
      window.clearTimeout(window.approvalsSuccessTimer);
      window.approvalsSuccessTimer = window.setTimeout(() => setSuccess(""), 3000);
      return;
    }

    setError(message);
    window.clearTimeout(window.approvalsErrorTimer);
    window.approvalsErrorTimer = window.setTimeout(() => setError(""), 5000);
  };

  const isVetRequest = (item) => getRequestType(item) === "vet";

  const fetchRequests = useCallback(async ({ silent = false } = {}) => {
    try {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const [result, boardingResult] = await Promise.all([
        apiRequest("/receptionist/requests/pending", { method: "GET" }),
        apiRequest("/receptionist/boarding-requests/pending", { method: "GET" }),
      ]);

      const list = normalizeList(result, [
        "requests",
        "service_requests",
        "pending_requests",
        "data",
      ]);
      const boardings = normalizeList(boardingResult, [
        "boarding_requests",
        "boardings",
        "data",
      ]).map(normalizeBoardingApproval);

      setRequests([...(Array.isArray(list) ? list : []), ...boardings]);
      setLastUpdated(new Date().toLocaleString("en-PH"));
    } catch (err) {
      setRequests([]);
      showMessage("error", err.message || "Failed to load pending requests.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchVeterinarians = useCallback(async () => {
    try {
      const result = await apiRequest("/receptionist/veterinarians/available", {
        method: "GET",
      });

      const list = normalizeList(result, ["veterinarians", "data"]);

      setVeterinarians(Array.isArray(list) ? list : []);
      setVetError(
        Array.isArray(list) && list.length === 0
          ? "No active veterinarian accounts found. Create or activate a veterinarian before approving veterinary requests."
          : ""
      );
    } catch (err) {
      setVeterinarians([]);
      setVetError("Could not load veterinarians. Refresh before approving veterinary requests.");
    }
  }, []);

  useEffect(() => {
    fetchRequests();
    fetchVeterinarians();
  }, [fetchRequests, fetchVeterinarians]);

  const stats = useMemo(() => {
    const vet = requests.filter((item) => getRequestType(item) === "vet").length;
    const grooming = requests.filter((item) => getRequestType(item) === "grooming").length;
    const hotel = requests.filter((item) => getRequestType(item) === "hotel").length;
    const needsVet = requests.filter(
      (item) => isVetRequest(item) && !vetAssignments[getRequestId(item)]
    ).length;

    return {
      total: requests.length,
      vet,
      grooming,
      hotel,
      needsVet,
    };
  }, [requests, vetAssignments]);

  const filteredRequests = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    return requests.filter((item) => {
      const requestId = getRequestId(item);
      const requestType = getRequestType(item);
      const vetRequest = isVetRequest(item);
      const hasVetAssignment = Boolean(vetAssignments[requestId]);

      const searchableText = [
        requestId,
        getRawType(item),
        getCustomerName(item),
        getPetName(item),
        getServiceName(item),
        getRequestDate(item),
        getRequestTime(item),
        item.notes,
        item.remarks,
        item.description,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !keyword || searchableText.includes(keyword);
      const matchesType = typeFilter === "all" || requestType === typeFilter;

      const matchesVetFilter =
        vetFilter === "all" ||
        (vetFilter === "needs_assignment" && vetRequest && !hasVetAssignment) ||
        (vetFilter === "assigned" && vetRequest && hasVetAssignment);

      return matchesSearch && matchesType && matchesVetFilter;
    });
  }, [requests, searchTerm, typeFilter, vetFilter, vetAssignments]);

  const openDetails = (item) => {
    setSelectedRequest(item);
    setDetailsOpen(true);
  };

  const closeDetails = () => {
    setSelectedRequest(null);
    setDetailsOpen(false);
  };

  const openActionModal = (item, type) => {
    const requestId = getRequestId(item);

    setSelectedRequest(item);
    setActionType(type);
    setActionForm({
      veterinarianId: vetAssignments[requestId] || "",
      remarks: "",
      rejectionReason: "",
    });
    setActionOpen(true);
  };

  const closeActionModal = () => {
    setActionOpen(false);
    setActionType("");
    setSelectedRequest(null);
    setActionForm({
      veterinarianId: "",
      remarks: "",
      rejectionReason: "",
    });
  };

  const approveRequest = async () => {
    if (!selectedRequest) return;

    const requestId = getRequestId(selectedRequest);
    const vetRequest = isVetRequest(selectedRequest);
    const hotelRequest = getRequestType(selectedRequest) === "hotel";
    const veterinarianId = actionForm.veterinarianId || vetAssignments[requestId];

    if (vetRequest && !veterinarianId) {
      showMessage("error", "Please choose a veterinarian before approving this request.");
      return;
    }

    try {
      setProcessingId(requestId);

      const payload = {
        receptionist_remarks:
          actionForm.remarks.trim() || "Approved by receptionist",
      };

      if (vetRequest) {
        payload.veterinarian_id = Number(veterinarianId);
      }

      await apiRequest(
        hotelRequest
          ? `/receptionist/boarding-requests/${requestId}/approve`
          : `/receptionist/requests/${requestId}/approve`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      setVetAssignments((current) => {
        const next = { ...current };
        delete next[requestId];
        return next;
      });

      showMessage("success", "Request approved successfully.");
      closeActionModal();
      await fetchRequests({ silent: true });
    } catch (err) {
      // Handle specific double booking conflict errors
      if (err.message?.includes('already has an appointment at selected date and time')) {
        showMessage("error", "This veterinarian already has an appointment at the selected date and time.");
      } else if (err.message?.includes('already reserved')) {
        showMessage("error", "This grooming slot is already reserved.");
      } else if (err.message?.includes('already booked for selected date range')) {
        showMessage("error", "This room/kennel is already booked for the selected date range.");
      } else {
        showMessage("error", err.message || "Failed to approve request.");
      }
    } finally {
      setProcessingId(null);
    }
  };

  const rejectRequest = async () => {
    if (!selectedRequest) return;

    const requestId = getRequestId(selectedRequest);
    const reason = actionForm.rejectionReason.trim();
    const hotelRequest = getRequestType(selectedRequest) === "hotel";

    if (!reason) {
      showMessage("error", "Rejection reason is required.");
      return;
    }

    try {
      setProcessingId(requestId);

      await apiRequest(
        hotelRequest
          ? `/receptionist/boarding-requests/${requestId}/reject`
          : `/receptionist/requests/${requestId}/reject`,
        {
          method: "POST",
          body: JSON.stringify({
            rejection_reason: reason,
            receptionist_remarks: actionForm.remarks.trim() || reason,
          }),
        }
      );

      showMessage("success", "Request rejected successfully.");
      closeActionModal();
      await fetchRequests({ silent: true });
    } catch (err) {
      showMessage("error", err.message || "Failed to reject request.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleActionSubmit = (event) => {
    event.preventDefault();

    if (actionType === "approve") {
      approveRequest();
      return;
    }

    rejectRequest();
  };

  const toggleSelectId = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allIds = new Set(filteredRequests.map(getRequestId));
    setSelectedIds((prev) => {
      if (prev.size === allIds.size) return new Set();
      return allIds;
    });
  };

  const openBulkAction = (type) => {
    setBulkActionType(type);
    setBulkActionOpen(true);
    setActionForm({ veterinarianId: "", remarks: "", rejectionReason: "" });
  };

  const closeBulkAction = () => {
    setBulkActionOpen(false);
    setBulkActionType("");
  };

  const runBulkApprove = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    let successCount = 0;
    let failCount = 0;
    for (const id of ids) {
      const item = requests.find((r) => getRequestId(r) === id);
      if (!item) continue;
      try {
        const vetRequest = isVetRequest(item);
        const hotelRequest = getRequestType(item) === "hotel";
        const veterinarianId = actionForm.veterinarianId || vetAssignments[id];
        if (vetRequest && !veterinarianId) {
          failCount++;
          continue;
        }
        const payload = { receptionist_remarks: actionForm.remarks.trim() || "Approved by receptionist" };
        if (vetRequest) payload.veterinarian_id = Number(veterinarianId);
        await apiRequest(
          hotelRequest
            ? `/receptionist/boarding-requests/${id}/approve`
            : `/receptionist/requests/${id}/approve`,
          { method: "POST", body: JSON.stringify(payload) }
        );
        successCount++;
      } catch {
        failCount++;
      }
    }
    showMessage("success", `Approved ${successCount} request(s). ${failCount > 0 ? `${failCount} failed.` : ""}`);
    setSelectedIds(new Set());
    closeBulkAction();
    await fetchRequests({ silent: true });
  };

  const runBulkReject = async () => {
    const ids = Array.from(selectedIds);
    const reason = actionForm.rejectionReason.trim();
    if (!reason) {
      showMessage("error", "Rejection reason is required.");
      return;
    }
    let successCount = 0;
    let failCount = 0;
    for (const id of ids) {
      const item = requests.find((r) => getRequestId(r) === id);
      if (!item) continue;
      try {
        const hotelRequest = getRequestType(item) === "hotel";
        await apiRequest(
          hotelRequest
            ? `/receptionist/boarding-requests/${id}/reject`
            : `/receptionist/requests/${id}/reject`,
          { method: "POST", body: JSON.stringify({ rejection_reason: reason, receptionist_remarks: actionForm.remarks.trim() || reason }) }
        );
        successCount++;
      } catch {
        failCount++;
      }
    }
    showMessage("success", `Rejected ${successCount} request(s). ${failCount > 0 ? `${failCount} failed.` : ""}`);
    setSelectedIds(new Set());
    closeBulkAction();
    await fetchRequests({ silent: true });
  };

  const exportCSV = () => {
    if (filteredRequests.length === 0) {
      showMessage("error", "No pending requests to export.");
      return;
    }

    const headers = [
      "Request ID",
      "Type",
      "Service",
      "Customer",
      "Pet",
      "Schedule Date",
      "Schedule Time",
      "Status",
      "Notes",
    ];

    const rows = filteredRequests.map((item) => [
      getRequestId(item),
      getTypeLabel(getRequestType(item)),
      getServiceName(item),
      getCustomerName(item),
      getPetName(item),
      getRequestDate(item),
      getRequestTime(item),
      item.status || "pending",
      item.notes || item.remarks || item.description || "",
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `receptionist-approvals-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();

    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setSearchTerm("");
    setTypeFilter("all");
    setVetFilter("all");
  };

  const isProcessing = (item) => processingId === getRequestId(item);

  return (
    <div className="approvals-page">
      {success && (
        <div className="approval-toast success">
          <FaCheckCircle />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="approval-toast error">
          <FaTimesCircle />
          <span>{error}</span>
        </div>
      )}

      <section className="approvals-hero">
        <div>
          <span className="approval-eyebrow">
            <FaCheckCircle />
            Receptionist Approval Center
          </span>

          <h1>Booking & Service Approvals</h1>

          <p>
            Review pending customer requests, assign veterinarians when required,
            and approve or reject requests before service processing.
          </p>

          <small>Last updated: {lastUpdated || "Not refreshed yet"}</small>
        </div>

        <div className="approval-hero-actions">
          <button
            type="button"
            className={`secondary-btn ${refreshing ? "loading" : ""}`}
            onClick={() => {
              fetchRequests({ silent: true });
              fetchVeterinarians();
            }}
            disabled={refreshing || loading}
          >
            {refreshing ? <FaSpinner /> : <FaSyncAlt />}
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>

          <button type="button" className="secondary-btn" onClick={exportCSV}>
            <FaDownload />
            Export CSV
          </button>
        </div>
      </section>

      <section className="approval-summary-grid">
        <button type="button" className="approval-summary-card" onClick={() => setTypeFilter("all")}>
          <span>
            <FaClock />
          </span>
          <div>
            <strong>{stats.total}</strong>
            <p>Total Pending</p>
          </div>
        </button>

        <button type="button" className="approval-summary-card vet" onClick={() => setTypeFilter("vet")}>
          <span>
            <FaUserMd />
          </span>
          <div>
            <strong>{stats.vet}</strong>
            <p>Veterinary</p>
          </div>
        </button>

        <button type="button" className="approval-summary-card grooming" onClick={() => setTypeFilter("grooming")}>
          <span>
            <FaCut />
          </span>
          <div>
            <strong>{stats.grooming}</strong>
            <p>Grooming</p>
          </div>
        </button>

        <button type="button" className="approval-summary-card hotel" onClick={() => setTypeFilter("hotel")}>
          <span>
            <FaHotel />
          </span>
          <div>
            <strong>{stats.hotel}</strong>
            <p>Hotel</p>
          </div>
        </button>

        <button
          type="button"
          className="approval-summary-card warning"
          onClick={() => setVetFilter("needs_assignment")}
        >
          <span>
            <FaUserMd />
          </span>
          <div>
            <strong>{stats.needsVet}</strong>
            <p>Needs Vet</p>
          </div>
        </button>
      </section>

      <section className="approvals-controls">
        <div className="approvals-search-box">
          <FaSearch />
          <input
            type="text"
            placeholder="Search customer, pet, service, type, notes, or request ID..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />

          {searchTerm && (
            <button type="button" onClick={() => setSearchTerm("")}>
              <FaTimes />
            </button>
          )}
        </div>

        <label className="approvals-filter-box">
          <FaFilter />
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
          >
            {TYPE_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="approvals-filter-box">
          <FaUserMd />
          <select
            value={vetFilter}
            onChange={(event) => setVetFilter(event.target.value)}
          >
            {VET_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <button type="button" className="clear-btn" onClick={clearFilters}>
          <FaTimes />
          Clear
        </button>
      </section>

      <section className="approval-card">
        <div className="approval-card-header">
          <div>
            <span className="approval-eyebrow">
              <FaClock />
              Live Pending Queue
            </span>

            <h2>Pending Requests</h2>

            <p>
              Showing <strong>{filteredRequests.length}</strong> of{" "}
              <strong>{requests.length}</strong> request(s).
            </p>
          </div>

          <div className="approval-counter">
            <FaClock />
            <span>{filteredRequests.length}</span>
          </div>
        </div>

        {filteredRequests.length > 0 && (
          <div className="approval-bulk-bar">
            <label className="approval-bulk-select">
              <input
                type="checkbox"
                checked={selectedIds.size > 0 && selectedIds.size === filteredRequests.length}
                onChange={toggleSelectAll}
              />
              <span>
                {selectedIds.size === 0
                  ? "Select All"
                  : `${selectedIds.size} selected`}
              </span>
            </label>
            {selectedIds.size > 0 && (
              <div className="approval-bulk-actions">
                <button type="button" className="approve-btn" onClick={() => openBulkAction("approve")}>
                  <FaCheckCircle /> Bulk Approve
                </button>
                <button type="button" className="reject-btn" onClick={() => openBulkAction("reject")}>
                  <FaTimesCircle /> Bulk Reject
                </button>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="approval-state">
            <FaSpinner className="spin" />
            <h3>Loading pending requests...</h3>
            <p>Please wait while receptionist approvals are loaded.</p>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="approval-state">
            <FaPaw />
            <h3>No pending requests found</h3>
            <p>New customer bookings and service requests will appear here.</p>
          </div>
        ) : (
          <div className="approval-list">
            {filteredRequests.map((item) => {
              const requestId = getRequestId(item);
              const requestType = getRequestType(item);
              const vetRequest = isVetRequest(item);

              return (
                <article className="approval-item" key={requestId}>
                  <div className="approval-main">
                    <div className="approval-item-top">
                      <span className={`type-pill ${requestType}`}>
                        {getTypeIcon(requestType)}
                        {getTypeLabel(requestType)}
                      </span>

                      <span className="request-id">#{requestId}</span>
                    </div>
                    <label className="approval-item-select">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(requestId)}
                        onChange={() => toggleSelectId(requestId)}
                      />
                    </label>

                    <h3>{getServiceName(item)}</h3>

                    <div className="approval-info-grid">
                      <InfoLine icon={<FaUser />} label="Customer" value={getCustomerName(item)} />
                      <InfoLine icon={<FaPaw />} label="Pet" value={getPetName(item)} />
                      <InfoLine
                        icon={<FaCalendarAlt />}
                        label="Schedule"
                        value={`${formatDate(getRequestDate(item))}${
                          getRequestTime(item) ? ` at ${formatTime(getRequestTime(item))}` : ""
                        }`}
                      />
                      <InfoLine
                        icon={<FaInfoCircle />}
                        label="Status"
                        value={formatLabel(normalizeStatus(item.status || "pending"))}
                      />
                    </div>

                    {(item.notes || item.remarks || item.description) && (
                      <div className="approval-note">
                        <strong>Notes</strong>
                        <p>{item.notes || item.remarks || item.description}</p>
                      </div>
                    )}

                    {vetRequest && (
                      <label className="vet-assignment-field">
                        <span>
                          <FaUserMd />
                          Veterinarian Assignment
                        </span>

                        <select
                          value={vetAssignments[requestId] || ""}
                          onChange={(event) =>
                            setVetAssignments((current) => ({
                              ...current,
                              [requestId]: event.target.value,
                            }))
                          }
                        >
                          <option value="">
                            {veterinarians.length ? "Choose veterinarian" : "No active veterinarians"}
                          </option>

                          {veterinarians.map((vet) => (
                            <option key={vet.id} value={vet.id}>
                              {vet.name || vet.full_name || `Veterinarian #${vet.id}`}
                            </option>
                          ))}
                        </select>

                        {vetError && <small>{vetError}</small>}
                      </label>
                    )}
                  </div>

                  <div className="approval-actions">
                    <button
                      type="button"
                      className="view-btn"
                      onClick={() => openDetails(item)}
                      disabled={isProcessing(item)}
                    >
                      <FaEye />
                      View
                    </button>

                    <button
                      type="button"
                      className="approve-btn"
                      onClick={() => openActionModal(item, "approve")}
                      disabled={isProcessing(item) || (vetRequest && veterinarians.length === 0)}
                    >
                      {isProcessing(item) ? <FaSpinner className="spin" /> : <FaCheckCircle />}
                      Approve
                    </button>

                    <button
                      type="button"
                      className="reject-btn"
                      onClick={() => openActionModal(item, "reject")}
                      disabled={isProcessing(item)}
                    >
                      <FaTimesCircle />
                      Reject
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {detailsOpen && selectedRequest && (
        <div className="approval-modal-overlay" onClick={closeDetails}>
          <div className="approval-modal" onClick={(event) => event.stopPropagation()}>
            <div className="approval-modal-header">
              <div>
                <span className="approval-eyebrow">
                  <FaEye />
                  Request Details
                </span>
                <h2>Request #{getRequestId(selectedRequest)}</h2>
              </div>

              <button type="button" className="close-modal-btn" onClick={closeDetails}>
                <FaTimes />
              </button>
            </div>

            <div className="approval-modal-body">
              <div className="approval-detail-grid">
                <DetailItem label="Request Type" value={getTypeLabel(getRequestType(selectedRequest))} />
                <DetailItem label="Service" value={getServiceName(selectedRequest)} />
                <DetailItem label="Customer" value={getCustomerName(selectedRequest)} />
                <DetailItem label="Pet" value={getPetName(selectedRequest)} />
                <DetailItem label="Date" value={formatDate(getRequestDate(selectedRequest))} />
                <DetailItem label="Time" value={formatTime(getRequestTime(selectedRequest)) || "No time"} />
                <DetailItem label="Raw Type" value={getRawType(selectedRequest) || "N/A"} />
                <DetailItem label="Status" value={formatLabel(selectedRequest.status || "pending")} />
                <DetailItem
                  label="Notes"
                  value={
                    selectedRequest.notes ||
                    selectedRequest.remarks ||
                    selectedRequest.description ||
                    "No notes provided."
                  }
                  wide
                />
              </div>
            </div>

            <div className="approval-modal-actions">
              <button type="button" className="secondary-btn" onClick={closeDetails}>
                Close
              </button>

              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  setDetailsOpen(false);
                  openActionModal(selectedRequest, "approve");
                }}
              >
                <FaCheckCircle />
                Approve
              </button>

              <button
                type="button"
                className="danger-btn"
                onClick={() => {
                  setDetailsOpen(false);
                  openActionModal(selectedRequest, "reject");
                }}
              >
                <FaTimesCircle />
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {actionOpen && selectedRequest && (
        <div className="approval-modal-overlay" onClick={closeActionModal}>
          <div className="approval-modal" onClick={(event) => event.stopPropagation()}>
            <div className="approval-modal-header">
              <div>
                <span className="approval-eyebrow">
                  {actionType === "approve" ? <FaCheckCircle /> : <FaTimesCircle />}
                  {actionType === "approve" ? "Approve Request" : "Reject Request"}
                </span>

                <h2>Request #{getRequestId(selectedRequest)}</h2>
              </div>

              <button type="button" className="close-modal-btn" onClick={closeActionModal}>
                <FaTimes />
              </button>
            </div>

            <form className="approval-modal-body" onSubmit={handleActionSubmit}>
              <div className="approval-action-summary">
                <strong>{getServiceName(selectedRequest)}</strong>
                <span>{getCustomerName(selectedRequest)} | {getPetName(selectedRequest)}</span>
              </div>

              {actionType === "approve" && isVetRequest(selectedRequest) && (
                <div className="form-group">
                  <label>Assign Veterinarian *</label>
                  <select
                    value={actionForm.veterinarianId}
                    onChange={(event) =>
                      setActionForm((current) => ({
                        ...current,
                        veterinarianId: event.target.value,
                      }))
                    }
                    required
                  >
                    <option value="">Choose veterinarian</option>

                    {veterinarians.map((vet) => (
                      <option key={vet.id} value={vet.id}>
                        {vet.name || vet.full_name || `Veterinarian #${vet.id}`}
                      </option>
                    ))}
                  </select>

                  {vetError && <small className="form-error">{vetError}</small>}
                </div>
              )}

              {actionType === "reject" && (
                <div className="form-group">
                  <label>Rejection Reason *</label>
                  <textarea
                    value={actionForm.rejectionReason}
                    onChange={(event) =>
                      setActionForm((current) => ({
                        ...current,
                        rejectionReason: event.target.value,
                      }))
                    }
                    placeholder="Enter a clear reason for rejection."
                    required
                  />
                </div>
              )}

              <div className="form-group">
                <label>Receptionist Remarks</label>
                <textarea
                  value={actionForm.remarks}
                  onChange={(event) =>
                    setActionForm((current) => ({
                      ...current,
                      remarks: event.target.value,
                    }))
                  }
                  placeholder="Optional remarks for this action."
                />
              </div>

              <div className="approval-modal-actions">
                <button type="button" className="secondary-btn" onClick={closeActionModal}>
                  Cancel
                </button>

                <button
                  type="submit"
                  className={actionType === "approve" ? "primary-btn" : "danger-btn"}
                  disabled={processingId === getRequestId(selectedRequest)}
                >
                  {processingId === getRequestId(selectedRequest) ? (
                    <FaSpinner className="spin" />
                  ) : actionType === "approve" ? (
                    <FaCheckCircle />
                  ) : (
                    <FaTimesCircle />
                  )}
                  {actionType === "approve" ? "Approve Request" : "Reject Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {bulkActionOpen && (
        <div className="approval-modal-overlay" onClick={closeBulkAction}>
          <div className="approval-modal" onClick={(event) => event.stopPropagation()}>
            <div className="approval-modal-header">
              <div>
                <span className="approval-eyebrow">
                  {bulkActionType === "approve" ? <FaCheckCircle /> : <FaTimesCircle />}
                  {bulkActionType === "approve" ? "Bulk Approve" : "Bulk Reject"}
                </span>
                <h2>{selectedIds.size} Request(s) Selected</h2>
              </div>
              <button type="button" className="close-modal-btn" onClick={closeBulkAction}>
                <FaTimes />
              </button>
            </div>

            <form className="approval-modal-body" onSubmit={(e) => { e.preventDefault(); bulkActionType === "approve" ? runBulkApprove() : runBulkReject(); }}>
              {bulkActionType === "approve" && (
                <div className="form-group">
                  <label>Default Veterinarian (for vet requests)</label>
                  <select
                    value={actionForm.veterinarianId}
                    onChange={(event) =>
                      setActionForm((current) => ({
                        ...current,
                        veterinarianId: event.target.value,
                      }))
                    }
                  >
                    <option value="">Use per-request assignment</option>
                    {veterinarians.map((vet) => (
                      <option key={vet.id} value={vet.id}>
                        {vet.name || vet.full_name || `Veterinarian #${vet.id}`}
                      </option>
                    ))}
                  </select>
                  {vetError && <small className="form-error">{vetError}</small>}
                </div>
              )}

              {bulkActionType === "reject" && (
                <div className="form-group">
                  <label>Rejection Reason *</label>
                  <textarea
                    value={actionForm.rejectionReason}
                    onChange={(event) =>
                      setActionForm((current) => ({
                        ...current,
                        rejectionReason: event.target.value,
                      }))
                    }
                    placeholder="Enter a clear reason for rejection."
                    required
                  />
                </div>
              )}

              <div className="form-group">
                <label>Receptionist Remarks</label>
                <textarea
                  value={actionForm.remarks}
                  onChange={(event) =>
                    setActionForm((current) => ({
                      ...current,
                      remarks: event.target.value,
                    }))
                  }
                  placeholder="Optional remarks for this action."
                />
              </div>

              <div className="approval-modal-actions">
                <button type="button" className="secondary-btn" onClick={closeBulkAction}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className={bulkActionType === "approve" ? "primary-btn" : "danger-btn"}
                >
                  {bulkActionType === "approve" ? <FaCheckCircle /> : <FaTimesCircle />}
                  {bulkActionType === "approve" ? "Bulk Approve" : "Bulk Reject"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const InfoLine = ({ icon, label, value }) => (
  <div className="info-line">
    <span>{icon}</span>
    <div>
      <small>{label}</small>
      <strong>{value || "N/A"}</strong>
    </div>
  </div>
);

const DetailItem = ({ label, value, wide = false }) => (
  <div className={`approval-detail-item ${wide ? "wide" : ""}`}>
    <small>{label}</small>
    <strong>{value || "N/A"}</strong>
  </div>
);

export default ReceptionistApprovals;
