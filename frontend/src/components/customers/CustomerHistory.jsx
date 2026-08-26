import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../api/client";
import { showError } from "../../utils/alert.jsx";
import HistoryTimeline from "../shared/HistoryTimeline";

const TYPE_OPTIONS = [
  { value: "order",       label: "Orders" },
  { value: "appointment", label: "Appointments" },
  { value: "boarding",    label: "Boardings" },
];

const CustomerHistory = () => {
  const [rawEntries, setRawEntries]   = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [searchTerm, setSearchTerm]   = useState("");
  const [dateFilter, setDateFilter]   = useState("all");
  const [typeFilter, setTypeFilter]   = useState("all");

  // Fetch raw data once on mount — no filter deps to avoid repeated API calls
  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [orders, appts, boardings] = await Promise.allSettled([
        apiRequest("/customer/store/orders").catch(() => []),
        apiRequest("/customer/appointments").catch(() => []),
        apiRequest("/customer/boardings").catch(() => []),
      ]);
      const mapped = [];
      if (orders.status === "fulfilled") {
        const items = orders.value?.orders || orders.value?.data || (Array.isArray(orders.value) ? orders.value : []);
        items.forEach((o) => mapped.push({
          id: `ORD-${o.id}`, reference_id: `ORD-${o.id}`,
          action: `Order ${o.status || "pending"}`,
          description: `Order #${o.order_number || o.id} — ${o.payment_method || "N/A"}`,
          status: o.status || "pending", category: "order",
          actor: "You", actor_role: "customer",
          amount: Number(o.total_amount || 0), method: o.payment_method,
          created_at: o.created_at,
        }));
      }
      if (appts.status === "fulfilled") {
        const items = appts.value?.appointments || appts.value?.data || (Array.isArray(appts.value) ? appts.value : []);
        items.forEach((a) => mapped.push({
          id: `APT-${a.id}`, reference_id: `APT-${a.id}`,
          action: `Appointment ${a.status || "scheduled"}`,
          description: `${a.service?.name || a.service_name || "Service"} for ${a.pet?.name || a.pet_name || "Pet"}`,
          status: a.status || "scheduled", category: "appointment",
          actor: "You", actor_role: "customer",
          pet_name: a.pet?.name || a.pet_name, service_name: a.service?.name || a.service_name,
          created_at: a.scheduled_at || a.created_at,
        }));
      }
      if (boardings.status === "fulfilled") {
        const items = boardings.value?.boardings || boardings.value?.data || (Array.isArray(boardings.value) ? boardings.value : []);
        items.forEach((b) => mapped.push({
          id: `BRD-${b.id}`, reference_id: `BRD-${b.id}`,
          action: `Boarding ${b.status || "scheduled"}`,
          description: `${b.pet?.name || b.pet_name || "Pet"} · Room ${b.room?.room_number || "N/A"}`,
          status: b.status || "scheduled", category: "boarding",
          actor: "You", actor_role: "customer",
          amount: Number(b.total_amount || 0),
          created_at: b.check_in_date || b.created_at,
        }));
      }
      setRawEntries(mapped);
    } catch (err) {
      setError(err.message || "Failed to load activity history.");
      showError(err.message || "Failed to load activity history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // Apply filters client-side — no extra API calls
  const entries = useMemo(() => {
    const now = Date.now();
    const keyword = searchTerm.toLowerCase();
    return rawEntries
      .filter((e) => typeFilter === "all" || e.category === typeFilter)
      .filter((e) => !keyword || (e.description || "").toLowerCase().includes(keyword)
        || (e.reference_id || "").toLowerCase().includes(keyword)
        || (e.service_name || "").toLowerCase().includes(keyword)
        || (e.pet_name || "").toLowerCase().includes(keyword))
      .filter((e) => {
        if (dateFilter === "all") return true;
        const d = new Date(e.created_at).getTime();
        if (dateFilter === "today") return new Date(e.created_at).toDateString() === new Date().toDateString();
        if (dateFilter === "week")  return now - d < 7 * 86400000;
        if (dateFilter === "month") return now - d < 30 * 86400000;
        return true;
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [rawEntries, searchTerm, dateFilter, typeFilter]);

  const exportColumns = [
    { key: "reference_id", label: "Reference" },
    { key: "category", label: "Type" },
    { key: "description", label: "Description" },
    { key: "status", label: "Status" },
    { key: "amount", label: "Amount", format: "currency" },
    { key: "created_at", label: "Date", format: "date" },
  ];

  return (
    <HistoryTimeline
      entries={entries} loading={loading} error={error}
      onRefresh={fetchHistory}
      exportColumns={exportColumns}
      exportFilename="customer-history"
      exportTitle="My Activity History"
      roleAccent="#0284c7" roleLabel="My Activity"
      emptyMessage="No activity history found."
      searchTerm={searchTerm} onSearchChange={setSearchTerm}
      dateFilter={dateFilter} onDateFilterChange={setDateFilter}
      categoryFilter={typeFilter} onCategoryFilterChange={setTypeFilter}
      categoryOptions={TYPE_OPTIONS}
    />
  );
};

export default CustomerHistory;
