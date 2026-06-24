import React, { useState, useEffect, useMemo } from "react";
import { inventoryApi } from "../../api/inventory.jsx";
import { exportToCSV } from "../../utils/reportExport";
import { showAlert } from "../../utils/alert.jsx";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import "./AuditAnalyticsDashboard.css";

const AuditAnalyticsDashboard = () => {
  const [auditData, setAuditData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState(6);
  const [chartType, setChartType] = useState("line");

  useEffect(() => {
    const fetchAuditAnalytics = async () => {
      try {
        setLoading(true);
        const response = await inventoryApi.getAuditAnalytics({ months });
        setAuditData(response.trends || response.data || []);
      } catch (err) {
        console.error("Failed to fetch audit analytics:", err);
        setAuditData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchAuditAnalytics();
  }, [months]);

  const stats = useMemo(() => {
    if (auditData.length === 0) {
      return {
        totalDiscrepancies: 0,
        totalMatched: 0,
        totalVariance: 0,
        averageAccuracy: 0,
        trendDirection: "stable"
      };
    }

    const totalDiscrepancies = auditData.reduce((sum, audit) => sum + Number(audit.discrepancy_items || audit.total_discrepancies || 0), 0);
    const totalMatched = auditData.reduce((sum, audit) => sum + Number(audit.matched_items || audit.total_matched || 0), 0);
    const totalVariance = auditData.reduce((sum, audit) => sum + Number(audit.total_variance || 0), 0);
    const totalAudited = totalDiscrepancies + totalMatched;
    const averageAccuracy = totalAudited > 0 ? ((totalMatched / totalAudited) * 100).toFixed(1) : 0;

    const recentMonths = auditData.slice(-3);
    const olderMonths = auditData.slice(-6, -3);
    const recentDiscrepancies = recentMonths.reduce((sum, audit) => sum + Number(audit.discrepancy_items || audit.total_discrepancies || 0), 0);
    const olderDiscrepancies = olderMonths.reduce((sum, audit) => sum + Number(audit.discrepancy_items || audit.total_discrepancies || 0), 0);
    
    let trendDirection = "stable";
    if (recentDiscrepancies < olderDiscrepancies) {
      trendDirection = "improving";
    } else if (recentDiscrepancies > olderDiscrepancies) {
      trendDirection = "declining";
    }

    return {
      totalDiscrepancies,
      totalMatched,
      totalVariance,
      averageAccuracy,
      trendDirection
    };
  }, [auditData]);

  const parseMonth = (audit) => {
    if (audit.audit_month) {
      const [y, m] = audit.audit_month.split("-");
      const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      return `${monthNames[parseInt(m, 10) - 1]} ${y}`;
    }
    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${monthNames[(audit.month || 1) - 1]} ${audit.year || ""}`;
  };

  const chartData = useMemo(() => {
    return [...auditData]
      .sort((a, b) => (a.audit_month || "").localeCompare(b.audit_month || ""))
      .map((audit) => ({
        month: parseMonth(audit),
        discrepancies: Number(audit.discrepancy_items || audit.total_discrepancies || 0),
        matched: Number(audit.matched_items || audit.total_matched || 0),
        variance: Number(audit.total_variance || 0),
      }));
  }, [auditData]);

  const pieData = useMemo(() => [
    { name: "Matched",       value: stats.totalMatched },
    { name: "Discrepancies", value: stats.totalDiscrepancies },
  ].filter((d) => d.value > 0), [stats]);

  const PIE_COLORS = ["#10b981", "#ef4444"];

  const handleExportCSV = () => {
    if (auditData.length === 0) {
      showAlert("No analytics data to export.");
      return;
    }

    const columns = [
      { key: "month", label: "Month" },
      { key: "year", label: "Year" },
      { key: "total_discrepancies", label: "Total Discrepancies" },
      { key: "total_matched", label: "Total Matched" },
      { key: "total_variance", label: "Total Variance" },
      { key: "accuracy_rate", label: "Accuracy Rate (%)" },
    ];

    const exportData = auditData.map((audit) => {
      const totalAudited = Number(audit.total_discrepancies || 0) + Number(audit.total_matched || 0);
      const accuracyRate = totalAudited > 0 ? ((Number(audit.total_matched || 0) / totalAudited) * 100).toFixed(1) : 0;
      
      return {
        ...audit,
        month: new Date(audit.year, audit.month - 1).toLocaleString('default', { month: 'long' }),
        accuracy_rate: accuracyRate,
      };
    });

    exportToCSV(exportData, columns, `audit-analytics-${months}-months`);
  };

  const handleExportPDF = () => {
    if (auditData.length === 0) {
      showAlert("No analytics data to export.");
      return;
    }

    const printContent = `
      <html>
        <head>
          <title>Audit Analytics Dashboard - Last ${months} Months</title>
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
            .trend-${stats.trendDirection} {
              background-color: ${stats.trendDirection === 'improving' ? '#d4edda' : stats.trendDirection === 'declining' ? '#f8d7da' : '#fff3cd'};
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 20px;
            }
            th, td {
              border: 1px solid #ddd;
              padding: 12px;
              text-align: center;
            }
            th {
              background-color: #f5f5f5;
              font-weight: bold;
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
            <h1>Audit Analytics Dashboard</h1>
            <p>Analysis for the Last ${months} Months</p>
            <p>Generated: ${new Date().toLocaleDateString()}</p>
          </div>
          
          <div class="stats">
            <div class="stat-card">
              <h3>${stats.totalDiscrepancies}</h3>
              <p>Total Discrepancies</p>
            </div>
            <div class="stat-card">
              <h3>${stats.totalMatched}</h3>
              <p>Total Matched</p>
            </div>
            <div class="stat-card">
              <h3>${stats.totalVariance}</h3>
              <p>Total Variance</p>
            </div>
            <div class="stat-card trend-${stats.trendDirection}">
              <h3>${stats.averageAccuracy}%</h3>
              <p>Avg Accuracy (${stats.trendDirection})</p>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Year</th>
                <th>Discrepancies</th>
                <th>Matched</th>
                <th>Total Variance</th>
                <th>Accuracy Rate</th>
              </tr>
            </thead>
            <tbody>
              ${auditData.map((audit) => {
                const totalAudited = Number(audit.total_discrepancies || 0) + Number(audit.total_matched || 0);
                const accuracyRate = totalAudited > 0 ? ((Number(audit.total_matched || 0) / totalAudited) * 100).toFixed(1) : 0;
                return `
                  <tr>
                    <td>${new Date(audit.year, audit.month - 1).toLocaleString('default', { month: 'long' })}</td>
                    <td>${audit.year}</td>
                    <td>${audit.total_discrepancies}</td>
                    <td>${audit.total_matched}</td>
                    <td>${audit.total_variance}</td>
                    <td>${accuracyRate}%</td>
                  </tr>
                `;
              }).join("")}
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

  if (loading) {
    return (
      <div className="audit-analytics-page">
        <p className="analytics-loading">Loading audit analytics...</p>
      </div>
    );
  }

  return (
    <div className="audit-analytics-page">
      <div className="monthly-audit-hero">
        <div>
          <h2>Audit Analytics Dashboard</h2>
          <p>Track audit trends and inventory accuracy over time.</p>
        </div>
        <div className="audit-analytics-controls">
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            <option value={3}>Last 3 Months</option>
            <option value={6}>Last 6 Months</option>
            <option value={12}>Last 12 Months</option>
          </select>
        </div>
      </div>

      <div className="audit-analytics-stats">
        <div className="analytics-stat-card">
          <div className="analytics-stat-icon analytics-stat-icon--danger">⚠</div>
          <div>
            <span className="analytics-stat-value">{stats.totalDiscrepancies}</span>
            <span className="analytics-stat-label">Total Discrepancies</span>
          </div>
        </div>
        <div className="analytics-stat-card">
          <div className="analytics-stat-icon analytics-stat-icon--success">✓</div>
          <div>
            <span className="analytics-stat-value">{stats.totalMatched}</span>
            <span className="analytics-stat-label">Total Matched</span>
          </div>
        </div>
        <div className="analytics-stat-card">
          <div className="analytics-stat-icon analytics-stat-icon--warning">±</div>
          <div>
            <span className="analytics-stat-value">{stats.totalVariance}</span>
            <span className="analytics-stat-label">Total Variance</span>
          </div>
        </div>
        <div className="analytics-stat-card">
          <div className="analytics-stat-icon analytics-stat-icon--primary">%</div>
          <div>
            <span className="analytics-stat-value">{stats.averageAccuracy}%</span>
            <span className="analytics-stat-label">Avg Accuracy</span>
            <span className={`trend-badge trend-badge--${stats.trendDirection === "improving" ? "down" : stats.trendDirection === "declining" ? "up" : "stable"}`}>
              {stats.trendDirection}
            </span>
          </div>
        </div>
      </div>

      <div className="audit-analytics-charts">
        <div className="analytics-chart-card audit-analytics-chart-full">
          <div className="analytics-chart-toolbar">
            <h3>Trend Over Time</h3>
            <div className="analytics-toggle-group">
              {["line", "bar"].map((t) => (
                <button
                  key={t}
                  onClick={() => setChartType(t)}
                  className={`analytics-toggle-btn${chartType === t ? " active" : ""}`}
                >{t.charAt(0).toUpperCase() + t.slice(1)}</button>
              ))}
            </div>
          </div>
          <div className="analytics-chart-container">
            <ResponsiveContainer width="100%" height={280}>
              {chartType === "line" ? (
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,95,147,0.1)" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="discrepancies" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} name="Discrepancies" />
                  <Line type="monotone" dataKey="matched" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} name="Matched" />
                  <Line type="monotone" dataKey="variance" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} name="Variance" />
                </LineChart>
              ) : (
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,95,147,0.1)" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="discrepancies" fill="#ef4444" radius={[6,6,0,0]} name="Discrepancies" />
                  <Bar dataKey="matched" fill="#10b981" radius={[6,6,0,0]} name="Matched" />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        <div className="analytics-chart-card">
          <h3>Status Distribution</h3>
          <div className="analytics-chart-container">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={4}>
                  {pieData.map((entry, index) => (
                    <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend iconType="circle" iconSize={10} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="analytics-chart-card">
          <div className="analytics-chart-toolbar">
            <h3>Monthly Data Table</h3>
            <div className="analytics-export-group">
              <button onClick={handleExportCSV} className="btn-analytics-csv">CSV</button>
              <button onClick={handleExportPDF} className="btn-analytics-pdf">PDF</button>
            </div>
          </div>
          <div className="analytics-data-table-scroll">
            <table className="analytics-data-table">
              <thead>
                <tr>
                  {["Month","Discrepancies","Matched","Variance","Accuracy"].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chartData.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: "1.5rem", textAlign: "center", color: "#94a3b8" }}>No data for selected period.</td></tr>
                )}
                {[...chartData].reverse().map((row) => {
                  const total = row.discrepancies + row.matched;
                  const acc = total > 0 ? ((row.matched / total) * 100).toFixed(1) : "N/A";
                  return (
                    <tr key={row.month}>
                      <td>{row.month}</td>
                      <td className={row.discrepancies > 0 ? "cell-red" : ""}>{row.discrepancies}</td>
                      <td className="cell-green">{row.matched}</td>
                      <td className={row.variance < 0 ? "cell-red" : row.variance > 0 ? "cell-green" : "cell-muted"}>{row.variance}</td>
                      <td>
                        <span className={`analytics-accuracy-badge ${parseFloat(acc) >= 90 ? "good" : "bad"}`}>{acc}{acc !== "N/A" ? "%" : ""}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuditAnalyticsDashboard;
