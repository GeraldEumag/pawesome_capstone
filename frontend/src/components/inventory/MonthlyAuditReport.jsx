import React, { useState, useEffect, useMemo } from "react";
import { inventoryApi } from "../../api/inventory.jsx";
import { STORE_INFO } from "../../utils/storeInfo";
import { exportFormalReportPDF } from "../../utils/formalReportPdf";
import { getRole, getUserData } from "../../utils/auth";
import { exportToCSV } from "../../utils/reportExport";
import "./MonthlyInventoryAudit.css";
import { showAlert } from "../../utils/alert.jsx";

const auditItem = (audit) => audit?.item || audit || {};

const getCurrentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const MonthlyAuditReport = () => {
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(getCurrentMonth());

  const fetchAuditReport = async () => {
    try {
      setLoading(true);
      const res = await inventoryApi.getMonthlyAuditReport(month);
      setAudits(res.items || res.data || []);
    } catch (err) {
      console.error("Failed to load audit report:", err);
      setAudits([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditReport();
  }, [month]);

  const stats = useMemo(() => {
    const total = audits.length;
    const matched = audits.filter((audit) => audit.status === "matched").length;
    const discrepancy = audits.filter((audit) => audit.status === "discrepancy").length;
    const totalVariance = audits.reduce((sum, audit) => sum + Number(audit.variance || 0), 0);

    return {
      total,
      matched,
      discrepancy,
      totalVariance,
      matchRate: total > 0 ? ((matched / total) * 100).toFixed(1) : "0.0",
    };
  }, [audits]);

  const handleExportCSV = () => {
    if (audits.length === 0) {
      showAlert("No audit data to export.");
      return;
    }

    const columns = [
      { key: "product_name", label: "Product Name" },
      { key: "sku", label: "SKU" },
      { key: "category", label: "Category" },
      { key: "system_stock", label: "System Stock" },
      { key: "actual_stock", label: "Actual Stock" },
      { key: "variance", label: "Variance" },
      { key: "unit_cost", label: "Unit Cost", format: "currency" },
      { key: "variance_value", label: "Estimated Variance Value", format: "currency" },
      { key: "status", label: "Audit Status" },
      { key: "reason", label: "Reason" },
      { key: "audit_date", label: "Audit Date" },
    ];
    const rows = audits.map((audit) => {
      const item = auditItem(audit);
      const auditDate = audit.created_at ? new Date(audit.created_at) : null;
      const unitCost = Number(audit.unit_cost ?? item.cost ?? 0);
      const variance = Number(audit.variance || 0);
      return {
        product_name: item.name || "Unknown",
        sku: item.sku || "N/A",
        category: item.category || "N/A",
        system_stock: Number(audit.system_stock || 0),
        actual_stock: Number(audit.actual_stock || 0),
        variance,
        unit_cost: unitCost,
        variance_value: variance * unitCost,
        status: audit.status || "",
        reason: audit.reason || "",
        audit_date: auditDate && !Number.isNaN(auditDate.getTime()) ? auditDate.toLocaleDateString() : "N/A",
      };
    });

    exportToCSV(rows, columns, `${STORE_INFO.name.replace(/\s+/g, "-")}-audit-report-${month}`, {
      title: "Monthly Inventory Audit Report",
      periodLabel: month,
    });
  };

  const handleExportPDF = () => {
    if (audits.length === 0) {
      showAlert("No audit data to export.");
      return;
    }

    const currency = (value) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value || 0);
    const costOf = (audit) => Number(audit.unit_cost ?? auditItem(audit).cost ?? 0);
    const valueOf = (audit) => Number(audit.variance || 0) * costOf(audit);
    const discrepancies = audits.filter((audit) => audit.status === "discrepancy");
    const netValue = audits.reduce((sum, audit) => sum + valueOf(audit), 0);
    const shortageValue = discrepancies.reduce((sum, audit) => sum + Math.max(0, -valueOf(audit)), 0);
    const auditor = audits.find((audit) => audit.checked_by)?.checked_by || getUserData().name || "Authorized Staff";
    const reasonGroups = new Map();
    discrepancies.forEach((audit) => {
      const reason = audit.reason || "Reason not recorded";
      const current = reasonGroups.get(reason) || { reason, items: 0, units: 0, value: 0 };
      current.items += 1;
      current.units += Number(audit.variance || 0);
      current.value += valueOf(audit);
      reasonGroups.set(reason, current);
    });
    const findings = discrepancies.length
      ? [`${discrepancies.length} of ${audits.length} completed audit line(s) have a stock variance. Estimated net book value is ${currency(netValue)}; estimated shortage value is ${currency(shortageValue)}.`]
      : [`All ${stats.matched} reported item(s) match the recorded system quantity for ${month}.`];

    exportFormalReportPDF({
      docRef: `MIA-${month}`,
      title: "Monthly Inventory Audit Report",
      subtitle: "Completed Stock Count Reconciliation and Variance Assessment",
      periodLabel: month,
      orientation: "landscape",
      infoFields: [
        { label: "Completed Audit Lines", value: audits.length },
        { label: "Auditor", value: auditor },
        { label: "Valuation Basis", value: "Current item unit cost; estimates only" },
      ],
      summaryCards: [
        { label: "Items Audited", value: stats.total },
        { label: "Matched", value: `${stats.matched} (${stats.matchRate}%)` },
        { label: "Discrepancies", value: stats.discrepancy },
        { label: "Net Variance", value: `${stats.totalVariance} units` },
        { label: "Variance Value", value: currency(netValue) },
      ],
      analysis: {
        title: "Discrepancy Analysis by Reason",
        columns: [
          { header: "Reason", key: "reason" },
          { header: "Items", key: "items", align: "right" },
          { header: "Net Units", key: "units", align: "right" },
          { header: "Est. Value", key: "value", format: currency, align: "right" },
        ],
        rows: [...reasonGroups.values()],
      },
      table: {
        title: "Detailed Audit Schedule",
        fontSize: 6.5,
        columns: [
          { header: "Product", value: (audit) => auditItem(audit).name || "Unknown" },
          { header: "SKU", value: (audit) => auditItem(audit).sku || "N/A" },
          { header: "Category", value: (audit) => auditItem(audit).category || "N/A" },
          { header: "System", key: "system_stock", align: "right" },
          { header: "Actual", key: "actual_stock", align: "right" },
          { header: "Variance", key: "variance", align: "right" },
          { header: "Unit Cost", value: (audit) => currency(costOf(audit)), align: "right" },
          { header: "Variance Value", value: (audit) => currency(valueOf(audit)), align: "right" },
          { header: "Status", key: "status" },
          { header: "Reason", key: "reason" },
          { header: "Auditor", key: "checked_by" },
        ],
        rows: audits,
        foot: ["TOTAL", "", "", "", "", stats.totalVariance, "", currency(netValue), "", "", ""],
      },
      findings,
      recommendations: discrepancies.length
        ? ["Recount discrepant stock, document supporting evidence, and obtain approval before finalizing any stock correction.", "Review recurring reasons for variance and assign an owner and corrective-action date."]
        : ["Continue the documented physical count and retain the signed report with monthly inventory records."],
      certification: "I certify that this report reflects the completed audit records for the stated month. Peso values are estimates calculated using the current item cost and do not replace a financial valuation or approved adjustment.",
      signatures: [
        { role: "Prepared by", name: auditor, caption: getRole() || "Inventory Auditor" },
        { role: "Reviewed by", name: "", caption: "Inventory Supervisor" },
        { role: "Noted by", name: "", caption: "Store Manager" },
      ],
      filename: `${STORE_INFO.name.replace(/\s+/g, "-")}-audit-report-${month}`,
    });
  };

  return (
    <div className="monthly-audit-page">
      <div className="monthly-audit-hero">
        <div>
          <h2>Monthly Audit Report</h2>
          <p>{STORE_INFO.name} — view and export completed inventory audit results.</p>
        </div>

        <div className="audit-month-control">
          <label>Report Month</label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
      </div>

      <div className="audit-stats-grid">
        <div className="audit-stat-card">
          <span>Total Items</span>
          <strong>{stats.total}</strong>
        </div>

        <div className="audit-stat-card good">
          <span>Matched</span>
          <strong>{stats.matched}</strong>
        </div>

        <div className="audit-stat-card warning">
          <span>Discrepancies</span>
          <strong>{stats.discrepancy}</strong>
        </div>

        <div className="audit-stat-card">
          <span>Match Rate</span>
          <strong>{stats.matchRate}%</strong>
        </div>

        <div className="audit-stat-card">
          <span>Total Variance</span>
          <strong>{stats.totalVariance}</strong>
        </div>
      </div>

      {loading ? (
        <div className="audit-loading-card">
          <div className="spinner"></div>
          <p>Loading audit report...</p>
        </div>
      ) : (
        <div className="audit-table-card">
          <div className="audit-table-header">
            <div>
              <h3>Audit Results</h3>
              <p>Completed audit items and discrepancies for {month}.</p>
            </div>

            <div className="audit-header-actions">
              <button onClick={handleExportCSV} className="btn-export-csv">
                Export CSV
              </button>
              <button onClick={handleExportPDF} className="btn-export-pdf">
                Export PDF
              </button>
            </div>
          </div>

          <div className="audit-table-scroll">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Category</th>
                  <th>System Stock</th>
                  <th>Actual Stock</th>
                  <th>Variance</th>
                  <th>Status</th>
                  <th>Reason</th>
                </tr>
              </thead>

              <tbody>
                {audits.map((audit) => {
                  const item = auditItem(audit);
                  return (
                  <tr key={audit.id} className={audit.status}>
                    <td>
                      <strong>{item.name || "Unknown"}</strong>
                      <small>{item.brand || "No brand"}</small>
                    </td>

                    <td>{item.sku || "N/A"}</td>
                    <td>{item.category || "N/A"}</td>
                    <td>{audit.system_stock}</td>
                    <td>{audit.actual_stock}</td>
                    <td className={Number(audit.variance) < 0 ? "negative" : Number(audit.variance) > 0 ? "positive" : ""}>
                      {audit.variance}
                    </td>

                    <td>
                      <span className={`audit-status ${audit.status}`}>
                        {audit.status}
                      </span>
                    </td>

                    <td>{audit.reason || "-"}</td>
                  </tr>
                  );
                })}

                {audits.length === 0 && (
                  <tr>
                    <td colSpan="8" className="audit-empty">
                      No audit data found for {month}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default MonthlyAuditReport;
