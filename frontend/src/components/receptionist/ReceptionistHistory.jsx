import React, { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../../api/client";
import HistoryTimeline from "../shared/HistoryTimeline";

const TYPE_OPTIONS = [
  { value: "appointment", label: "Appointments" },
  { value: "boarding",    label: "Boardings" },
  { value: "order",       label: "Orders" },
];

const ReceptionistHistory = () => {
  const [entries, setEntries]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [appts, boardings, orders] = await Promise.allSettled([
        apiRequest("/receptionist/appointments").catch(() => []),
        apiRequest("/receptionist/boardings").catch(() => []),
        apiRequest("/receptionist/orders").catch(() => []),
      ]);

      const mapped = [];

      if (appts.status === "fulfilled") {
        const items = appts.value?.appointments || appts.value?.data || (Array.isArray(appts.value) ? appts.value : []);
        items.forEach((a) => mapped.push({
          id: `APT-${a.id}`, reference_id: `APT-${a.id}`,
          action: `Appointment ${a.status || "scheduled"}`,
          description: `${a.service?.name || a.service_name || "Service"} for ${a.pet?.name || a.pet_name || "Pet"}`,
          status: a.status || "scheduled", category: "appointment",
          actor: a.customer?.name || a.customer_name || "Client", actor_role: "customer",
          pet_name: a.pet?.name || a.pet_name, service_name: a.service?.name || a.service_name,
          created_at: a.scheduled_at || a.created_at,
        }));
      }

      if (boardings.status === "fulfilled") {
        const items = boardings.value?.boardings || boardings.value?.data || (Array.isArray(boardings.value) ? boardings.value : []);
        items.forEach((b) => mapped.push({
          id: `BRD-${b.id}`, reference_id: `BRD-${b.id}`,
          action: `Boarding ${b.status || "scheduled"}`,
          description: `${b.pet?.name || b.pet_name || "Pet"} — Room ${b.room?.room_number || b.room_id || "N/A"}`,
          status: b.status || "scheduled", category: "boarding",
          actor: b.customer?.name || b.customer_name || "Client", actor_role: "customer",
          amount: Number(b.total_amount || 0),
          created_at: b.check_in_date || b.created_at,
        }));
      }

      if (orders.status === "fulfilled") {
        const items = orders.value?.orders || orders.value?.data || (Array.isArray(orders.value) ? orders.value : []);
        items.forEach((o) => mapped.push({
          id: `ORD-${o.id}`, reference_id: `ORD-${o.id}`,
          action: `Order ${o.status || "pending"}`,
          description: `Order #${o.id} — ${o.payment_method || "N/A"}`,
          status: o.status || "pending", category: "order",
          actor: o.customer?.name || o.customer_name || "Customer", actor_role: "customer",
          amount: Number(o.total_amount || 0),
          created_at: o.created_at,
        }));
      }

      const now = Date.now();
      const keyword = searchTerm.toLowerCase();
      const filtered = mapped
        .filter((e) => typeFilter === "all" || e.category === typeFilter)
        .filter((e) => !keyword || (e.actor || "").toLowerCase().includes(keyword)
          || (e.description || "").toLowerCase().includes(keyword)
          || (e.reference_id || "").toLowerCase().includes(keyword))
        .filter((e) => {
          if (dateFilter === "all") return true;
          const d = new Date(e.created_at).getTime();
          if (dateFilter === "today") return new Date(e.created_at).toDateString() === new Date().toDateString();
          if (dateFilter === "week")  return now - d < 7 * 86400000;
          if (dateFilter === "month") return now - d < 30 * 86400000;
          return true;
        })
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setEntries(filtered);
    } catch (err) {
      setError(err.message || "Failed to load receptionist history.");
    } finally {
      setLoading(false);
    }
  }, [searchTerm, dateFilter, typeFilter]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const exportCSV = useCallback(() => {
    if (!entries.length) return;
    const headers = ["Reference","Type","Actor","Description","Status","Amount","Date"];
    const rows = entries.map((e) => [
      e.reference_id, e.category, e.actor, e.description, e.status,
      e.amount ? Number(e.amount).toLocaleString("en-PH", { style: "currency", currency: "PHP" }) : "N/A",
      e.created_at ? new Date(e.created_at).toLocaleString("en-PH") : "N/A",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" })),
      download: `receptionist-history-${Date.now()}.csv`,
    });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }, [entries]);

  return (
    <HistoryTimeline
      entries={entries} loading={loading} error={error}
      onRefresh={fetchHistory} onExport={exportCSV}
      roleAccent="#d97706" roleLabel="Receptionist"
      emptyMessage="No activity records found."
      searchTerm={searchTerm} onSearchChange={setSearchTerm}
      dateFilter={dateFilter} onDateFilterChange={setDateFilter}
      categoryFilter={typeFilter} onCategoryFilterChange={setTypeFilter}
      categoryOptions={TYPE_OPTIONS}
    />
  );
};

export default ReceptionistHistory;
