import React, { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../../api/client";
import HistoryTimeline from "../shared/HistoryTimeline";

const ACTION_OPTIONS = [
  { value: "add",      label: "Stock Added" },
  { value: "remove",   label: "Stock Removed" },
  { value: "adjust",   label: "Adjusted" },
  { value: "transfer", label: "Transfer" },
];

const InventoryHistory_Polished = () => {
  const [entries, setEntries]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState("");
  const [searchTerm, setSearchTerm]     = useState("");
  const [dateFilter, setDateFilter]     = useState("all");
  const [actionFilter, setActionFilter] = useState("all");

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiRequest("/inventory/logs");
      const items = Array.isArray(res) ? res : (res?.logs || res?.data || []);
      const now = Date.now();
      const keyword = searchTerm.toLowerCase();
      const mapped = items.map((log) => ({
        id: `LOG-${log.id}`, reference_id: `LOG-${log.id}`,
        action: log.action || log.type || "Stock update",
        description: `${log.inventory_item?.name || log.item_name || "Item"} · ${(log.quantity || 0) > 0 ? "+" : ""}${log.quantity || 0} units`,
        status: "completed", category: log.action || log.type || "adjust",
        actor: log.user?.name || log.user_name || "Staff",
        actor_role: log.user?.role || "inventory",
        amount: null,
        item_name: log.inventory_item?.name || log.item_name,
        quantity: log.quantity,
        created_at: log.created_at,
      }));
      const filtered = mapped
        .filter((e) => actionFilter === "all" || e.category === actionFilter)
        .filter((e) => !keyword || (e.item_name || "").toLowerCase().includes(keyword)
          || (e.actor || "").toLowerCase().includes(keyword)
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
      setError(err.message || "Failed to load inventory history.");
    } finally {
      setLoading(false);
    }
  }, [searchTerm, dateFilter, actionFilter]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const exportColumns = [
    { key: "reference_id", label: "Reference" },
    { key: "item_name", label: "Item" },
    { key: "action", label: "Action" },
    { key: "quantity", label: "Quantity" },
    { key: "actor", label: "Staff" },
    { key: "created_at", label: "Date", format: "date" },
  ];

  return (
    <HistoryTimeline
      entries={entries} loading={loading} error={error}
      onRefresh={fetchHistory}
      exportColumns={exportColumns}
      exportFilename="inventory-history"
      exportTitle="Inventory Stock Movement History"
      roleAccent="#ff5f93" roleLabel="Inventory"
      emptyMessage="No stock log records found."
      searchTerm={searchTerm} onSearchChange={setSearchTerm}
      dateFilter={dateFilter} onDateFilterChange={setDateFilter}
      categoryFilter={actionFilter} onCategoryFilterChange={setActionFilter}
      categoryOptions={ACTION_OPTIONS}
    />
  );
};

export default InventoryHistory_Polished;
