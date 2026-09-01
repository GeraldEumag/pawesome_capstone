import React, { useCallback, useEffect, useState, useMemo } from "react";
import { apiRequest } from "../../api/client";
import HistoryTimeline from "../shared/HistoryTimeline";

const ACTION_OPTIONS = [
  { value: "add",                label: "Stock Added" },
  { value: "remove",             label: "Stock Removed" },
  { value: "manual_adjustment",  label: "Manual Adjustment" },
  { value: "sale_deduction",     label: "Sale / POS" },
  { value: "initial",            label: "Initial Stock" },
  { value: "vet_usage",          label: "Vet Usage" },
  { value: "grooming_usage",     label: "Grooming Usage" },
  { value: "boarding_food_usage",label: "Boarding Food" },
];

const InventoryHistory_Polished = () => {
  const [rawEntries, setRawEntries]       = useState([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState("");
  const [searchTerm, setSearchTerm]       = useState("");
  const [dateFilter, setDateFilter]       = useState("all");
  const [actionFilter, setActionFilter]   = useState("all");

  // Fetch all logs once on mount; no refetch on filter change
  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiRequest("/inventory/logs");
      const items = Array.isArray(res) ? res : (res?.logs || res?.data || []);
      const mapped = items.map((log) => ({
        id: `LOG-${log.id}`,
        reference_id: `LOG-${log.id}`,
        action: log.action || log.movement_type || log.type || "Stock update",
        description: `${log.inventory_item?.name || log.item_name || "Item"} · ${(log.quantity || 0) > 0 ? "+" : ""}${log.quantity || 0} units`,
        status: "completed",
        // category matches backend movement_type for accurate filtering
        category: log.movement_type || log.action || log.type || "manual_adjustment",
        actor: log.user?.name || log.user_name || "Staff",
        actor_role: log.user?.role || "inventory",
        amount: null,
        item_name: log.inventory_item?.name || log.item_name,
        quantity: log.quantity,
        created_at: log.created_at,
      }));
      setRawEntries(mapped);
    } catch (err) {
      setError(err.message || "Failed to load inventory history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // Client-side filtering via useMemo — no extra API calls
  const entries = useMemo(() => {
    const now = Date.now();
    const keyword = searchTerm.trim().toLowerCase();
    return rawEntries
      .filter((e) => actionFilter === "all" || e.category === actionFilter)
      .filter((e) => !keyword
        || (e.item_name || "").toLowerCase().includes(keyword)
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
  }, [rawEntries, searchTerm, dateFilter, actionFilter]);

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
