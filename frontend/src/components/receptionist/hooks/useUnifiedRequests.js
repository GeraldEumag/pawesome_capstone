import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../../api/client";
import {
  safeArray,
  normalizeList,
  normalizeAppointment,
  normalizeBoarding,
  normalizeGrooming,
  normalizeGenericRequest,
  mergeRequests,
  normalizeStatus,
} from "../utils/requestNormalization";

export const useUnifiedRequests = ({ autoRefresh = true, refreshInterval = 30000 } = {}) => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  const notify = (type, message) => {
    if (type === "success") {
      setSuccess(message);
      window.clearTimeout(window.unifiedHubSuccessTimer);
      window.unifiedHubSuccessTimer = window.setTimeout(() => setSuccess(""), 3000);
      return;
    }
    setError(message);
    window.clearTimeout(window.unifiedHubErrorTimer);
    window.unifiedHubErrorTimer = window.setTimeout(() => setError(""), 5000);
  };

  const fetchAll = useCallback(async ({ silent = false } = {}) => {
    try {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError("");

      const [
        genericData,
        appointmentsData,
        boardingsData,
        groomingData,
      ] = await Promise.all([
        apiRequest("/receptionist/requests", { method: "GET" }).catch(() => null),
        apiRequest("/receptionist/appointment/list").catch(() => null),
        apiRequest("/boardings").catch(() => null),
        apiRequest("/grooming").catch(() => null),
      ]);

      const genericList = normalizeList(genericData).map((item, idx) => normalizeGenericRequest(item, idx));
      const appointmentList = safeArray(appointmentsData, "appointments").map(normalizeAppointment);
      const boardingList = safeArray(boardingsData, "boardings").map(normalizeBoarding);
      const groomingList = safeArray(groomingData, "groomings").map(normalizeGrooming);

      const merged = mergeRequests(genericList, appointmentList, boardingList, groomingList);
      setRequests(merged);
      setLastUpdated(new Date().toLocaleString("en-PH"));
    } catch (err) {
      console.error("Fetch unified requests error:", err);
      notify("error", err.message || "Failed to load requests.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => fetchAll({ silent: true }), refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchAll]);

  const updateItemStatus = useCallback((id, newStatus) => {
    setRequests((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: normalizeStatus(newStatus) } : item))
    );
  }, []);

  const stats = useMemo(() => {
    const pending = requests.filter((r) => r.status === "pending").length;
    const approved = requests.filter((r) => r.status === "approved").length;
    const inProgress = requests.filter((r) => r.status === "in_progress").length;
    const checkedIn = requests.filter((r) => r.status === "checked_in").length;
    const completed = requests.filter((r) => r.status === "completed" || r.status === "checked_out").length;
    const rejected = requests.filter((r) => r.status === "rejected" || r.status === "cancelled").length;
    const forPayment = requests.filter((r) => r.paymentStatus === "pending" || r.paymentStatus === "unpaid").length;
    const vetCount = requests.filter((r) => r.type === "vet").length;
    const hotelCount = requests.filter((r) => r.type === "hotel").length;
    const groomingCount = requests.filter((r) => r.type === "grooming").length;

    return {
      total: requests.length,
      pending,
      approved,
      inProgress,
      checkedIn,
      completed,
      rejected,
      forPayment,
      vet: vetCount,
      hotel: hotelCount,
      grooming: groomingCount,
    };
  }, [requests]);

  return {
    requests,
    setRequests,
    loading,
    refreshing,
    error,
    success,
    lastUpdated,
    stats,
    fetchAll,
    updateItemStatus,
    notify,
  };
};
