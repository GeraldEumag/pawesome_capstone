import React, { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../../api/client";
import HistoryTimeline from "../shared/HistoryTimeline";

const CATEGORY_OPTIONS = [
  { value: "transaction",     label: "Sales" },
  { value: "appointment",     label: "Appointments" },
  { value: "service_request", label: "Service Requests" },
  { value: "order",           label: "Customer Orders" },
];

const ManagerHistory = () => {
  const [entries, setEntries]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [searchTerm, setSearchTerm]   = useState("");
  const [dateFilter, setDateFilter]   = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [page, setPage]               = useState(1);
  const [meta, setMeta]               = useState(null);

  const fetchHistory = useCallback(async (p = 1) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: p,
        per_page: 25,
        ...(searchTerm                 && { search:       searchTerm      }),
        ...(dateFilter !== "all"       && { date_filter:  dateFilter      }),
        ...(categoryFilter !== "all"   && { category:     categoryFilter  }),
      });
      const res = await apiRequest(`/manager/history?${params}`);
      const items = res?.history || res?.data || (Array.isArray(res) ? res : []);
      const mapped = items.map((item, i) => ({
        id:           item.reference_id || `ITEM-${i + 1}`,
        reference_id: item.reference_id || `ITEM-${i + 1}`,
        action:       item.action || "Activity",
        description:  item.description || "",
        amount:       Number(item.amount || 0),
        status:       item.status || "completed",
        category:     item.category || "general",
        actor:        item.actor || item.user_name || "System",
        actor_role:   item.actor_role || item.user_role || "",
        created_at:   item.created_at,
      }));
      setEntries(mapped);
      setMeta(res?.meta || null);
    } catch (err) {
      setError(err.message || "Failed to load manager history.");
    } finally {
      setLoading(false);
    }
  }, [searchTerm, dateFilter, categoryFilter]);

  useEffect(() => { fetchHistory(page); }, [fetchHistory, page]);

  const handlePageChange = (p) => { setPage(p); fetchHistory(p); };

  const exportCSV = useCallback(() => {
    if (!entries.length) return;
    const headers = ["Reference","Category","Actor","Action","Description","Amount","Status","Date"];
    const rows = entries.map((e) => [
      e.reference_id, e.category, e.actor, e.action, e.description,
      Number(e.amount).toLocaleString("en-PH", { style: "currency", currency: "PHP" }),
      e.status,
      e.created_at ? new Date(e.created_at).toLocaleString("en-PH") : "N/A",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" })),
      download: `manager-history-${Date.now()}.csv`,
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
      roleAccent="#7c3aed"
      roleLabel="Manager — Business Activity"
      emptyMessage="No business activity records found."
      searchTerm={searchTerm}
      onSearchChange={(v) => { setSearchTerm(v); setPage(1); }}
      dateFilter={dateFilter}
      onDateFilterChange={(v) => { setDateFilter(v); setPage(1); }}
      categoryFilter={categoryFilter}
      onCategoryFilterChange={(v) => { setCategoryFilter(v); setPage(1); }}
      categoryOptions={CATEGORY_OPTIONS}
      meta={meta}
      onPageChange={handlePageChange}
    />
  );
};

export default ManagerHistory;
