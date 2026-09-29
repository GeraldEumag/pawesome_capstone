import { showAlert } from "./alert.jsx";
import { exportFormalReportPDF } from "./formalReportPdf";
import { getRole, getUserData } from "./auth";
import { STORE_INFO } from "./storeInfo";

export const generateInventoryAuditPdf = (logs) => {
  if (!logs || logs.length === 0) {
    showAlert("No logs to export");
    return;
  }

  const additions = logs.filter((log) => Number(log.quantity_change) > 0).reduce((sum, log) => sum + Number(log.quantity_change), 0);
  const removals = logs.filter((log) => Number(log.quantity_change) < 0).reduce((sum, log) => sum + Math.abs(Number(log.quantity_change)), 0);
  const adjustments = logs.filter((log) => log.action === "adjustment").length;
  const userCounts = logs.reduce((counts, log) => {
    const user = log.user_name || "System";
    counts[user] = (counts[user] || 0) + 1;
    return counts;
  }, {});
  const topUser = Object.entries(userCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";
  const actionGroups = Object.values(logs.reduce((groups, log) => {
    const action = log.action || "Other";
    const current = groups[action] || { action, count: 0, change: 0 };
    current.count += 1;
    current.change += Number(log.quantity_change || 0);
    groups[action] = current;
    return groups;
  }, {}));
  const preparedBy = logs.find((log) => log.user_name)?.user_name || getUserData().name || "Authorized Staff";
  const dateText = (value) => value ? new Date(value).toLocaleString("en-PH") : "N/A";
  const rows = [...logs].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  const netChange = additions - removals;

  exportFormalReportPDF({
    docRef: `INV-MOV-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`,
    title: "Inventory Movement Audit Report",
    subtitle: "Inventory additions, removals, and adjustment activity",
    periodLabel: rows.length ? `${dateText(rows[0].created_at)} – ${dateText(rows[rows.length - 1].created_at)}` : "No period recorded",
    orientation: "landscape",
    infoFields: [
      { label: "Prepared By", value: preparedBy },
      { label: "Most Active User", value: topUser },
      { label: "Entries Reviewed", value: logs.length },
    ],
    summaryCards: [
      { label: "Stock Added", value: `+${additions}` },
      { label: "Stock Removed", value: `-${removals}` },
      { label: "Adjustments", value: adjustments },
      { label: "Net Change", value: `${netChange > 0 ? "+" : ""}${netChange}` },
      { label: "Total Entries", value: logs.length },
    ],
    analysis: {
      title: "Movement Activity by Type",
      columns: [
        { header: "Action", key: "action" },
        { header: "Entries", key: "count", align: "right" },
        { header: "Net Quantity Change", key: "change", align: "right" },
      ],
      rows: actionGroups,
    },
    table: {
      title: "Detailed Movement Register",
      fontSize: 6.5,
      columns: [
        { header: "Date & Time", value: (log) => dateText(log.created_at) },
        { header: "Item", value: (log) => log.item_name || `Item #${log.inventory_item_id}` },
        { header: "SKU", key: "sku" },
        { header: "Action", key: "action" },
        { header: "Change", value: (log) => `${Number(log.quantity_change) > 0 ? "+" : ""}${Number(log.quantity_change || 0)}`, align: "right" },
        { header: "Resulting Stock", key: "quantity_after", align: "right" },
        { header: "Reason", key: "reason" },
        { header: "Performed By", key: "user_name" },
      ],
      rows,
      foot: ["TOTAL", "", "", "", `${netChange > 0 ? "+" : ""}${netChange}`, "", "", ""],
    },
    findings: [
      `${logs.length} inventory movement entry/entries were reviewed. Additions totaled ${additions} unit(s), removals totaled ${removals} unit(s), and net quantity movement was ${netChange > 0 ? "+" : ""}${netChange} unit(s).`,
      `The user with the most recorded activity was ${topUser} (${userCounts[topUser] || 0} entries).`,
    ],
    recommendations: ["Investigate unusual or repeated adjustments and retain source documents for receipts, sales, transfers, and write-offs."],
    certification: "This report summarizes inventory movement records maintained by the Pawesome inventory system. It should be reconciled against source transactions and supporting documents before approval.",
    signatures: [
      { role: "Prepared by", name: preparedBy, caption: getRole() || "Inventory Personnel" },
      { role: "Reviewed by", name: "", caption: "Inventory Supervisor" },
      { role: "Approved by", name: "", caption: "Authorized Manager" },
    ],
    filename: `${STORE_INFO.name.replace(/\s+/g, "-")}-inventory-movement-audit`,
  });
};
