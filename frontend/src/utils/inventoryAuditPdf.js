import { showAlert } from "./alert";

/**
 * Generate PDF for inventory audit report
 * Uses browser print API for simplicity (production-ready)
 */

export const generateInventoryAuditPdf = (logs) => {
  if (!logs || logs.length === 0) {
    showAlert("No logs to export");
    return;
  }

  // Calculate stats
  const additions = logs
    .filter((l) => l.quantity_change > 0)
    .reduce((sum, l) => sum + l.quantity_change, 0);
  const removals = logs
    .filter((l) => l.quantity_change < 0)
    .reduce((sum, l) => sum + Math.abs(l.quantity_change), 0);
  const adjustments = logs.filter((l) => l.action === "adjustment").length;

  // Get top user
  const userCounts = logs.reduce((acc, log) => {
    acc[log.user_name || "System"] = (acc[log.user_name || "System"] || 0) + 1;
    return acc;
  }, {});
  const topUser = Object.entries(userCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Create print window
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    showAlert("Please allow popups to export PDF");
    return;
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Inventory Audit Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: Arial, sans-serif; 
      padding: 40px; 
      color: #333;
      line-height: 1.6;
    }
    .header { 
      text-align: center; 
      margin-bottom: 30px; 
      border-bottom: 3px solid #ff5f93; 
      padding-bottom: 20px;
    }
    .header h1 { color: #ff5f93; font-size: 24px; margin-bottom: 8px; }
    .header p { color: #666; font-size: 12px; }
    .summary { 
      display: grid; 
      grid-template-columns: repeat(4, 1fr); 
      gap: 15px; 
      margin-bottom: 30px;
      background: #fff1f7;
      padding: 20px;
      border-radius: 8px;
    }
    .summary-item { text-align: center; }
    .summary-item h3 { 
      font-size: 24px; 
      color: #ff5f93; 
      margin-bottom: 4px;
    }
    .summary-item p { font-size: 11px; color: #666; }
    .analytics {
      background: #f0f9ff;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 30px;
      font-size: 12px;
    }
    .analytics-row {
      display: flex;
      gap: 30px;
      flex-wrap: wrap;
    }
    table { 
      width: 100%; 
      border-collapse: collapse; 
      font-size: 11px;
      margin-top: 20px;
    }
    th { 
      background: #ff5f93; 
      color: white; 
      padding: 10px; 
      text-align: left;
      font-weight: 600;
    }
    td { 
      padding: 8px 10px; 
      border-bottom: 1px solid #eee;
    }
    tr:nth-child(even) { background: #fafafa; }
    .positive { color: #16a34a; font-weight: 600; }
    .negative { color: #dc2626; font-weight: 600; }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge-restock { background: #dcfce7; color: #166534; }
    .badge-sale { background: #dbeafe; color: #1e40af; }
    .badge-adjustment { background: #fef3c7; color: #92400e; }
    .badge-remove { background: #fee2e2; color: #991b1b; }
    .badge-expired { background: #f3f4f6; color: #374151; }
    .footer {
      margin-top: 30px;
      text-align: center;
      font-size: 10px;
      color: #999;
      border-top: 1px solid #eee;
      padding-top: 20px;
    }
    @media print {
      body { padding: 20px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>📦 Inventory Audit Report</h1>
    <p>Generated on ${new Date().toLocaleString("en-PH")}</p>
    <p>Pawesome Petcare Inventory System</p>
  </div>

  <div class="summary">
    <div class="summary-item">
      <h3>+${additions}</h3>
      <p>Stock Added</p>
    </div>
    <div class="summary-item">
      <h3>-${removals}</h3>
      <p>Stock Removed</p>
    </div>
    <div class="summary-item">
      <h3>${adjustments}</h3>
      <p>Adjustments</p>
    </div>
    <div class="summary-item">
      <h3>${logs.length}</h3>
      <p>Total Entries</p>
    </div>
  </div>

  <div class="analytics">
    <div class="analytics-row">
      <div><strong>Most Active Item:</strong> ${logs[0]?.item_name || "N/A"}</div>
      <div><strong>Top User:</strong> ${topUser}</div>
      <div><strong>Net Change:</strong> ${additions - removals > 0 ? "+" : ""}${additions - removals}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Date & Time</th>
        <th>Item</th>
        <th>Action</th>
        <th>Change</th>
        <th>Result</th>
        <th>Reason</th>
        <th>User</th>
      </tr>
    </thead>
    <tbody>
      ${logs
        .map(
          (log) => `
        <tr>
          <td>${formatDate(log.created_at)}</td>
          <td>${log.item_name || `Item #${log.inventory_item_id}`}</td>
          <td><span class="badge badge-${log.action}">${log.action}</span></td>
          <td class="${log.quantity_change > 0 ? "positive" : log.quantity_change < 0 ? "negative" : ""}">
            ${log.quantity_change > 0 ? "+" : ""}${log.quantity_change}
          </td>
          <td>${log.quantity_after} total</td>
          <td>${log.reason || "N/A"}</td>
          <td>${log.user_name || "System"}</td>
        </tr>
      `
        )
        .join("")}
    </tbody>
  </table>

  <div class="footer">
    <p>This is an official audit report from the Pawesome Petcare Inventory Management System.</p>
    <p>© ${new Date().getFullYear()} Pawesome Petcare. All rights reserved.</p>
  </div>

  <script>
    window.onload = () => {
      setTimeout(() => {
        window.print();
        // Close window after print dialog (optional)
        // setTimeout(() => window.close(), 500);
      }, 500);
    };
  </script>
</body>
</html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
};
