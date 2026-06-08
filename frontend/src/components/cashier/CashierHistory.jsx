import React, { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../../api/client";
import { showError } from "../../utils/alert.jsx";
import HistoryTimeline from "../shared/HistoryTimeline";
import { formatCurrency } from "../../utils/currency";
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
        raw_data:     t,
      }));
      setEntries(mapped);
      setMeta(res?.meta || null);
    } catch (err) {
      setError(err.message || "Failed to load cashier history.");
      showError(err.message || "Failed to load cashier history.");
    } finally {
      setLoading(false);
    }
  }, [searchTerm, dateFilter, methodFilter]);

  useEffect(() => { fetchHistory(page); }, [fetchHistory, page]);

  const handlePageChange = (p) => { setPage(p); fetchHistory(p); };

  const handlePrintReceipt = (entry) => {
    const raw = entry.raw_data || {};
    const saleId = raw.transaction_id || raw.id;
    if (!saleId) return;

    const items = (raw.items || raw.products || []).map((item) => ({
      name: item.item_name || item.name || "Item",
      quantity: item.quantity || 1,
      price: Number(item.unit_price || item.price || item.total_price || 0),
    }));

    const receiptWindow = window.open("", "_blank", "width=400,height=600");
    if (!receiptWindow) return;

    const itemsHtml = items
      .map((p) => `<tr><td>${p.name}</td><td>${p.quantity}</td><td>${formatCurrency(p.price)}</td></tr>`)
      .join("");

    receiptWindow.document.write(`
      <html>
        <head>
          <title>Receipt ${entry.reference_id}</title>
          <style>
            body { font-family: monospace; padding: 20px; max-width: 360px; margin: 0 auto; }
            h2 { text-align: center; margin-bottom: 4px; }
            .store { text-align: center; font-size: 12px; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { text-align: left; padding: 4px 0; }
            th { border-bottom: 1px dashed #000; }
            .total { border-top: 1px dashed #000; font-weight: bold; margin-top: 8px; padding-top: 8px; text-align: right; }
            .meta { margin-top: 16px; font-size: 12px; }
            .meta div { margin-bottom: 4px; }
            @media print { button { display: none; } }
          </style>
        </head>
        <body>
          <h2>PAWESOME PET STORE</h2>
          <div class="store">123 Pet Street, Manila, Philippines</div>
          <div class="meta">
            <div><strong>Transaction:</strong> ${entry.reference_id}</div>
            <div><strong>Customer:</strong> ${entry.actor || "Walk-in"}</div>
            <div><strong>Date:</strong> ${entry.created_at ? new Date(entry.created_at).toLocaleString("en-PH") : "N/A"}</div>
            <div><strong>Payment:</strong> ${entry.method || "Cash"}</div>
          </div>
          <table>
            <thead><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead>
            <tbody>${itemsHtml}</tbody>
          </table>
          <div class="total">TOTAL: ${formatCurrency(entry.amount || 0)}</div>
          <div class="meta" style="margin-top:24px; text-align:center;">
            <div>Thank you for shopping!</div>
          </div>
          <button onclick="window.print()" style="margin-top:20px; width:100%; padding:10px; font-size:14px;">Print Receipt</button>
        </body>
      </html>
    `);
    receiptWindow.document.close();
  };

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
      renderEntryMeta={(entry) => (
        <button
          type="button"
          className="ht-receipt-btn"
          onClick={(e) => { e.stopPropagation(); handlePrintReceipt(entry); }}
          title="Print Receipt"
          style={{
            marginLeft: 8,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--ht-accent, #0891b2)",
            fontSize: 12,
          }}
        >
          🧾 Receipt
        </button>
      )}
    />
  );
};

export default CashierHistory;

