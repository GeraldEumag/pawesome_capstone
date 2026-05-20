import React, { useState, useEffect, useMemo } from "react";
import { inventoryApi } from "../../api/inventory";
import { exportToCSV } from "../../utils/reportExport";
import "./MonthlyInventoryAudit.css";
import { showAlert } from "../../utils/alert";

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
      setAudits(res.audits || []);
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
      { key: "item_name", label: "Product Name" },
      { key: "sku", label: "SKU" },
      { key: "category", label: "Category" },
      { key: "system_stock", label: "System Stock" },
      { key: "actual_stock", label: "Actual Stock" },
      { key: "variance", label: "Variance" },
      { key: "status", label: "Audit Status" },
      { key: "reason", label: "Reason" },
      { key: "audit_date", label: "Audit Date" },
    ];

    const exportData = audits.map((audit) => ({
      ...audit,
      item_name: audit.item?.name || "Unknown",
      sku: audit.item?.sku || "N/A",
      category: audit.item?.category || "N/A",
      system_stock: Number(audit.system_stock || 0),
      actual_stock: Number(audit.actual_stock || 0),
      variance: Number(audit.variance || 0),
      audit_date: audit.created_at ? new Date(audit.created_at).toLocaleDateString() : "N/A",
    }));

    exportToCSV(exportData, columns, `audit-report-${month}`);
  };

  const handleExportPDF = () => {
    if (audits.length === 0) {
      showAlert("No audit data to export.");
      return;
    }

    // Create print-friendly HTML content
    const printContent = `
      <html>
        <head>
          <title>Monthly Inventory Audit Report - ${month}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
              color: #333;
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
              border-bottom: 2px solid #ff5f93;
              padding-bottom: 20px;
            }
            .header h1 {
              color: #ff5f93;
              margin: 0;
              font-size: 24px;
            }
            .header p {
              margin: 5px 0;
              color: #666;
            }
            .stats {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 15px;
              margin-bottom: 30px;
            }
            .stat-card {
              border: 1px solid #ddd;
              padding: 15px;
              text-align: center;
              border-radius: 8px;
            }
            .stat-card h3 {
              margin: 0 0 5px 0;
              color: #ff5f93;
              font-size: 24px;
            }
            .stat-card p {
              margin: 0;
              font-size: 14px;
              color: #666;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 20px;
            }
            th, td {
              border: 1px solid #ddd;
              padding: 12px;
              text-align: left;
            }
            th {
              background-color: #f5f5f5;
              font-weight: bold;
            }
            .matched {
              background-color: #d4edda;
            }
            .discrepancy {
              background-color: #f8d7da;
            }
            @media print {
              .no-print {
                display: none;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Monthly Inventory Audit Report</h1>
            <p>Audit Month: ${month}</p>
            <p>Generated: ${new Date().toLocaleDateString()}</p>
          </div>
          
          <div class="stats">
            <div class="stat-card">
              <h3>${stats.total}</h3>
              <p>Total Items</p>
            </div>
            <div class="stat-card">
              <h3>${stats.matched}</h3>
              <p>Matched</p>
            </div>
            <div class="stat-card">
              <h3>${stats.discrepancy}</h3>
              <p>Discrepancies</p>
            </div>
            <div class="stat-card">
              <h3>${stats.totalVariance}</h3>
              <p>Total Variance</p>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Product Name</th>
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
              ${audits.map((audit) => `
                <tr class="${audit.status}">
                  <td>${audit.item?.name || "Unknown"}</td>
                  <td>${audit.item?.sku || "N/A"}</td>
                  <td>${audit.item?.category || "N/A"}</td>
                  <td>${audit.system_stock}</td>
                  <td>${audit.actual_stock}</td>
                  <td>${audit.variance}</td>
                  <td>${audit.status}</td>
                  <td>${audit.reason || "-"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const printWindow = window.open("", "_blank");
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="monthly-audit-page">
      <div className="monthly-audit-hero">
        <div>
          <h2>Monthly Audit Report</h2>
          <p>View and export completed inventory audit results.</p>
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
                📥 Export CSV
              </button>
              <button onClick={handleExportPDF} className="btn-export-pdf">
                📄 Export PDF
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
                {audits.map((audit) => (
                  <tr key={audit.id} className={audit.status}>
                    <td>
                      <strong>{audit.item?.name || "Unknown"}</strong>
                      <small>{audit.item?.brand || "No brand"}</small>
                    </td>

                    <td>{audit.item?.sku || "N/A"}</td>
                    <td>{audit.item?.category || "N/A"}</td>
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
                ))}

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
