import React, { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../../api/client";
import { showError } from "../../utils/alert";
import HistoryTimeline from "../shared/HistoryTimeline";
import "./theme.css";

const STATUS_OPTIONS = [
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show",   label: "No Show" },
];

const VetHistory = () => {
  const [entries, setEntries]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [searchTerm, setSearchTerm]   = useState("");
  const [dateFilter, setDateFilter]   = useState("all");
  const [statusFilter, setStatusFilter] = useState("completed,cancelled");
  const [page, setPage]               = useState(1);
  const [meta, setMeta]               = useState(null);

  const fetchHistory = useCallback(async (p = 1) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: p,
        per_page: 25,
        status: statusFilter,
        ...(searchTerm           && { search:       searchTerm   }),
        ...(dateFilter !== "all" && { date_filter:  dateFilter   }),
      });
      const res = await apiRequest(`/veterinary/history?${params}`);
      const items = res?.appointments || res?.history || res?.data || (Array.isArray(res) ? res : []);
      const mapped = items.map((a) => ({
        id:           `APT-${a.id}`,
        reference_id: `APT-${a.id}`,
        action:       `Appointment ${a.status || "completed"}`,
        description:  `${a.service?.name || a.service_name || "Service"} for ${a.pet?.name || a.pet_name || "Pet"} (${a.customer?.name || a.customer_name || "Client"})`,
        amount:       Number(a.service?.price || a.amount || 0),
        status:       a.status || "completed",
        category:     "appointment",
        actor:        a.veterinarian?.name || a.vet_name || "Veterinarian",
        actor_role:   "veterinary",
        customer:     a.customer?.name || a.customer_name,
        pet_name:     a.pet?.name || a.pet_name,
        service_name: a.service?.name || a.service_name,
        created_at:   a.scheduled_at || a.created_at,
      }));
      setEntries(mapped);
      setMeta(res?.meta || null);
    } catch (err) {
      setError(err.message || "Failed to load veterinary history.");
      showError(err.message || "Failed to load veterinary history.");
    } finally {
      setLoading(false);
    }
  }, [searchTerm, dateFilter, statusFilter]);

  useEffect(() => { fetchHistory(page); }, [fetchHistory, page]);

  const handlePageChange = (p) => { setPage(p); fetchHistory(p); };

  const exportCSV = useCallback(() => {
    if (!entries.length) return;
    const headers = ["Reference","Service","Pet","Customer","Vet","Status","Date"];
    const rows = entries.map((e) => [
      e.reference_id, e.service_name || "N/A", e.pet_name || "N/A",
      e.customer || "N/A", e.actor, e.status,
      e.created_at ? new Date(e.created_at).toLocaleString("en-PH") : "N/A",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" })),
      download: `vet-history-${Date.now()}.csv`,
    });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }, [entries]);

  return (
    <HistoryTimeline
      entries={entries}
      loading={loading}
      error={error}
      onRefresh={() => fetchHistory(page)}
      onExport={exportCSV}
      roleAccent="#059669"
      roleLabel="Veterinary"
      emptyMessage="No appointment history found."
      searchTerm={searchTerm}
      onSearchChange={(v) => { setSearchTerm(v); setPage(1); }}
      dateFilter={dateFilter}
      onDateFilterChange={(v) => { setDateFilter(v); setPage(1); }}
      categoryFilter={statusFilter}
      onCategoryFilterChange={(v) => { setStatusFilter(v); setPage(1); }}
      categoryOptions={STATUS_OPTIONS}
      meta={meta}
      onPageChange={handlePageChange}
    />
  );
};

export default VetHistory;
