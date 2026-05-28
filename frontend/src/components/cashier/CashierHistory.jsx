import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../api/client";
import HistoryTimeline from "../shared/HistoryTimeline";
import "./CashierHistory.css";

const METHOD_OPTIONS = [
  { value: "cash",          label: "Cash" },
  { value: "gcash",         label: "GCash" },
  { value: "card",          label: "Card" },
  { value: "bank_transfer", label: "Bank Transfer" },
];

const CashierHistory = () => {
  const [entries, setEntries]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [searchTerm, setSearchTerm]   = useState("");
  const [dateFilter, setDateFilter]   = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [page, setPage]               = useState(1);
  const [meta, setMeta]               = useState(null);

  const fetchHistory = useCallback(async (p = 1) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: p,
        per_page: 25,
        ...(searchTerm     && { search:      searchTerm     }),
        ...(dateFilter !== "all"   && { date_filter:   dateFilter   }),
        ...(methodFilter !== "all" && { method:        methodFilter }),
      });
      const res = await apiRequest(`/cashier/transactions?${params}`);
      const items = res?.transactions || res?.data || (Array.isArray(res) ? res : []);
      const mapped = items.map((t, i) => ({
        id:           t.id || `TRX-${i + 1}`,
        reference_id: t.id || `TRX-${i + 1}`,
        action:       "Transaction",
        description:  `${t.customer || t.customer_name || "Walk-in"} · ${t.method || t.payment_method || "cash"}`,
        amount:       Number(t.amount || t.total || 0),
        status:       t.status || "completed",
        category:     t.type || "pos_sale",
        actor:        t.customer || t.customer_name || "Walk-in",
        actor_role:   "cashier",
        method:       t.method || t.payment_method || "cash",
        receipt_number: t.receipt_number,
        payment_reference: t.payment_reference,
        created_at:   t.date || t.created_at,
      }));
      setEntries(mapped);
      setMeta(res?.meta || null);
    } catch (err) {
      setError(err.message || "Failed to load cashier history.");
    } finally {
      setLoading(false);
    }
  }, [searchTerm, dateFilter, methodFilter]);

  useEffect(() => { fetchHistory(page); }, [fetchHistory, page]);

  const handlePageChange = (p) => { setPage(p); fetchHistory(p); };

  const exportCSV = useCallback(() => {
    if (!entries.length) return;
    const headers = ["Reference","Customer","Amount","Method","Status","Date"];
    const rows = entries.map((e) => [
      e.reference_id, e.actor,
      Number(e.amount).toLocaleString("en-PH", { style: "currency", currency: "PHP" }),
      e.method, e.status,
      e.created_at ? new Date(e.created_at).toLocaleString("en-PH") : "N/A",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" })),
      download: `cashier-history-${Date.now()}.csv`,
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
      roleAccent="#0891b2"
      roleLabel="Cashier"
      emptyMessage="No transactions found. Adjust filters or refresh."
      searchTerm={searchTerm}
      onSearchChange={(v) => { setSearchTerm(v); setPage(1); }}
      dateFilter={dateFilter}
      onDateFilterChange={(v) => { setDateFilter(v); setPage(1); }}
      categoryFilter={methodFilter}
      onCategoryFilterChange={(v) => { setMethodFilter(v); setPage(1); }}
      categoryOptions={METHOD_OPTIONS}
      meta={meta}
      onPageChange={handlePageChange}
    />
  );
};

export default CashierHistory;

