import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../api/client";
import { showError } from "../../utils/alert";
import HistoryTimeline from "../shared/HistoryTimeline";
import "./History.css";

const CATEGORY_OPTIONS = [
  { value: "transaction", label: "Transactions" },
  { value: "editing",     label: "Editing Activities" },
  { value: "login",       label: "Staff Logins" },
  { value: "general",     label: "General" },
];

const History = () => {
  const [historyLogs, setHistoryLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterDate, setFilterDate] = useState("all");

  const fetchHistoryLogs = async () => {
    try {
      setLoading(true);
      setError("");

      const [
        activityLogs,
        loginLogs,
        chatbotLogs,
        inventoryLogs,
        salesData,
        appointmentsData,
      ] = await Promise.allSettled([
        apiRequest("/admin/activity-logs").catch(() => []),
        apiRequest("/admin/login-logs").catch(() => []),
        apiRequest("/admin/chatbot/logs").catch(() => []),
        apiRequest("/inventory/logs").catch(() => []),
        apiRequest("/cashier/transactions").catch(() => []),
        apiRequest("/admin/appointments").catch(() => []),
      ]);

      const historyEntries = [];
      let idCounter = 1;

      if (activityLogs.status === "fulfilled") {
        const activities = activityLogs.value?.data || activityLogs.value || [];
        activities.forEach((log) => {
          historyEntries.push({
            id: idCounter++,
            category: log.category || "general",
            subcategory: log.subcategory || "activity",
            user_name: log.user?.name || log.user_name || "System",
            user_email: log.user?.email || log.user_email || "N/A",
            user_role: log.user?.role || log.user_role || "admin",
            account_name: log.account_name || "System",
            action: log.action || "Activity performed",
            description: log.description || "System activity",
            reference_id: log.reference_id || `ACT-${log.id || idCounter}`,
            status: log.status || "completed",
            created_at: log.created_at || new Date().toISOString(),
            metadata: log.metadata || {},
          });
        });
      }

      if (loginLogs.status === "fulfilled") {
        const logs = loginLogs.value?.data || loginLogs.value || [];
        logs.forEach((log) => {
          historyEntries.push({
            id: idCounter++,
            category: "login",
            subcategory: log.action === "logout" ? "logout" : "login",
            user_name: log.user?.name || log.email || "Unknown User",
            user_email: log.email || log.user?.email || "N/A",
            user_role: log.user?.role || "unknown",
            account_name: log.account_name || "Authentication",
            action: log.action === "logout" ? "Logged out" : "Logged in",
            description:
              log.status === "success"
                ? "Successful authentication"
                : `Failed: ${log.failure_reason || "Invalid credentials"}`,
            reference_id: `LOGIN-${log.id || idCounter}`,
            status: log.status || "completed",
            created_at: log.created_at || log.login_at || new Date().toISOString(),
            metadata: {
              ip_address: log.ip_address || "N/A",
              user_agent: log.user_agent || "N/A",
            },
          });
        });
      }

      if (chatbotLogs.status === "fulfilled" && Array.isArray(chatbotLogs.value)) {
        chatbotLogs.value.forEach((log) => {
          historyEntries.push({
            id: idCounter++,
            category: "editing",
            subcategory: "chatbot",
            user_name: log.user?.name || "Customer",
            user_email: log.user?.email || "N/A",
            user_role: log.user?.role || "customer",
            account_name: "Chatbot",
            action: "Chatbot interaction",
            description: log.message?.substring(0, 100) || "Chat message",
            reference_id: `CHAT-${log.id || idCounter}`,
            status: "completed",
            created_at: log.created_at || new Date().toISOString(),
            metadata: {
              session_id: log.session_id || "N/A",
            },
          });
        });
      }

      if (inventoryLogs.status === "fulfilled" && Array.isArray(inventoryLogs.value)) {
        inventoryLogs.value.forEach((log) => {
          historyEntries.push({
            id: idCounter++,
            category: "editing",
            subcategory: "inventory",
            user_name: log.user?.name || "Inventory Staff",
            user_email: log.user?.email || "N/A",
            user_role: "inventory",
            account_name: "Inventory",
            action: `Inventory ${log.action || "updated"}`,
            description: `${log.inventory_item?.name || "Item"} - ${
              log.quantity || 0
            } units`,
            reference_id: `INV-${log.id || idCounter}`,
            status: "completed",
            created_at: log.created_at || new Date().toISOString(),
            metadata: {
              item_id: log.inventory_item_id || "N/A",
            },
          });
        });
      }

      if (salesData.status === "fulfilled") {
        const sales = Array.isArray(salesData.value)
          ? salesData.value
          : salesData.value?.transactions || [];

        sales.forEach((sale) => {
          historyEntries.push({
            id: idCounter++,
            category: "transaction",
            subcategory: "sale",
            user_name: sale.cashier?.name || "Cashier",
            user_email: sale.cashier?.email || "N/A",
            user_role: "cashier",
            account_name: "Cashier",
            action: "Sale completed",
            description: `Transaction #${sale.id}`,
            amount: parseFloat(sale.amount) || 0,
            currency: "PHP",
            reference_id: `SALE-${sale.id || idCounter}`,
            status: "completed",
            created_at: sale.created_at || new Date().toISOString(),
            metadata: {
              type: sale.type || "sale",
            },
          });
        });
      }

      if (appointmentsData.status === "fulfilled") {
        const appointments = Array.isArray(appointmentsData.value)
          ? appointmentsData.value
          : appointmentsData.value?.data || [];

        appointments.slice(0, 20).forEach((apt) => {
          historyEntries.push({
            id: idCounter++,
            category: "editing",
            subcategory: "appointment",
            user_name: apt.customer?.name || "Customer",
            user_email: apt.customer?.email || "N/A",
            user_role: "customer",
            account_name: "Appointments",
            action: `Appointment ${apt.status || "updated"}`,
            description: `${apt.service?.name || "Service"} for ${
              apt.pet?.name || "Pet"
            }`,
            reference_id: `APT-${apt.id || idCounter}`,
            status: apt.status || "completed",
            created_at: apt.scheduled_at || apt.created_at || new Date().toISOString(),
            metadata: {
              pet_name: apt.pet?.name || "N/A",
              service: apt.service?.name || "N/A",
            },
          });
        });
      }

      historyEntries.sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );

      setHistoryLogs(historyEntries);

      if (historyEntries.length === 0) {
        setError("No history data available. Please check your backend logs.");
      }
    } catch (err) {
      console.error("Fetch history logs error:", err);
      setError(err.message || "Failed to fetch history logs");
      showError(err.message || "Failed to fetch history logs");
      setHistoryLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistoryLogs();
  }, []);

  const filteredHistoryLogs = useMemo(() => {
    if (!Array.isArray(historyLogs)) return [];
    const keyword = searchTerm.toLowerCase();
    const now = Date.now();
    return historyLogs.filter((log) => {
      const matchesSearch = !keyword ||
        log.user_name?.toLowerCase().includes(keyword) ||
        log.action?.toLowerCase().includes(keyword) ||
        log.description?.toLowerCase().includes(keyword) ||
        log.reference_id?.toLowerCase().includes(keyword) ||
        log.account_name?.toLowerCase().includes(keyword);

      const matchesCategory = filterCategory === "all" || log.category === filterCategory;

      const createdDate = new Date(log.created_at);
      const matchesDate =
        filterDate === "all" ||
        (filterDate === "today" && createdDate.toDateString() === new Date().toDateString()) ||
        (filterDate === "week"  && now - createdDate.getTime() < 7 * 24 * 60 * 60 * 1000) ||
        (filterDate === "month" && now - createdDate.getTime() < 30 * 24 * 60 * 60 * 1000);

      return matchesSearch && matchesCategory && matchesDate;
    });
  }, [historyLogs, searchTerm, filterCategory, filterDate]);

  const exportHistory = useCallback(() => {
    if (!filteredHistoryLogs.length) return;
    const fmtD = (v) => v ? new Date(v).toLocaleDateString("en-PH") : "N/A";
    const fmtT = (v) => v ? new Date(v).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }) : "N/A";
    const headers = ["ID","Category","User","Role","Account","Action","Description","Amount","Reference","Date","Time","Status"];
    const rows = filteredHistoryLogs.map((log) => [
      log.id, log.category, log.user_name, log.user_role, log.account_name || "N/A",
      log.action, log.description, log.amount ?? "N/A", log.reference_id,
      fmtD(log.created_at), fmtT(log.created_at), log.status,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = `admin-history-${Date.now()}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }, [filteredHistoryLogs]);

  return (
    <HistoryTimeline
      entries={filteredHistoryLogs}
      loading={loading}
      error={error}
      onRefresh={fetchHistoryLogs}
      onExport={exportHistory}
      roleAccent="#e11d48"
      roleLabel="Audit Trail Center"
      emptyMessage="No history data found. Adjust filters or refresh records."
      searchTerm={searchTerm}
      onSearchChange={setSearchTerm}
      dateFilter={filterDate}
      onDateFilterChange={setFilterDate}
      categoryFilter={filterCategory}
      onCategoryFilterChange={setFilterCategory}
      categoryOptions={CATEGORY_OPTIONS}
    />
  );
};

export default History;

