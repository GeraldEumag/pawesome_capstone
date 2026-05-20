import React, { useState, useEffect, useMemo } from "react";
import { inventoryApi } from "../../api/inventory";
import { exportToCSV } from "../../utils/reportExport";
import { showAlert } from "../../utils/alert";
import { Line, Bar, Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from "chart.js";
import "./MonthlyInventoryAudit.css";

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

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
        setAuditData(response.audits || []);
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

    const totalDiscrepancies = auditData.reduce((sum, audit) => sum + Number(audit.total_discrepancies || 0), 0);
    const totalMatched = auditData.reduce((sum, audit) => sum + Number(audit.total_matched || 0), 0);
    const totalVariance = auditData.reduce((sum, audit) => sum + Number(audit.total_variance || 0), 0);
    const totalAudited = totalDiscrepancies + totalMatched;
    const averageAccuracy = totalAudited > 0 ? ((totalMatched / totalAudited) * 100).toFixed(1) : 0;

    // Calculate trend direction
    const recentMonths = auditData.slice(0, 3); // Last 3 months
    const olderMonths = auditData.slice(3, 6); // Previous 3 months
    
    const recentDiscrepancies = recentMonths.reduce((sum, audit) => sum + Number(audit.total_discrepancies || 0), 0);
    const olderDiscrepancies = olderMonths.reduce((sum, audit) => sum + Number(audit.total_discrepancies || 0), 0);
    
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

  const chartData = useMemo(() => {
    const sortedData = [...auditData].sort((a, b) => {
      const dateA = new Date(a.year, a.month - 1);
      const dateB = new Date(b.year, b.month - 1);
      return dateA - dateB;
    });

    return {
      labels: sortedData.map((audit) => {
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${monthNames[audit.month - 1]} ${audit.year}`;
      }),
      datasets: [
        {
          label: "Discrepancies",
          data: sortedData.map((audit) => Number(audit.total_discrepancies || 0)),
          borderColor: "#ef4444",
          backgroundColor: "rgba(239, 68, 68, 0.1)",
          fill: true,
          tension: 0.4,
        },
        {
          label: "Matched Items",
          data: sortedData.map((audit) => Number(audit.total_matched || 0)),
          borderColor: "#10b981",
          backgroundColor: "rgba(16, 185, 129, 0.1)",
          fill: true,
          tension: 0.4,
        },
        {
          label: "Total Variance",
          data: sortedData.map((audit) => Number(audit.total_variance || 0)),
          borderColor: "#3b82f6",
          backgroundColor: "rgba(59, 130, 246, 0.1)",
          fill: true,
          tension: 0.4,
        },
      ],
    };
  }, [auditData]);

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
      <div className="monthly-audit-page">
        <div className="audit-loading-card">
          <div className="spinner"></div>
          <p>Loading audit analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="monthly-audit-page">
      <div className="monthly-audit-hero">
        <div>
          <h2>Audit Analytics Dashboard</h2>
          <p>Track audit trends and inventory accuracy over time.</p>
        </div>

        <div className="audit-controls">
          <div className="month-selector">
            <label>Analysis Period</label>
            <select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
              <option value={3}>Last 3 Months</option>
              <option value={6}>Last 6 Months</option>
              <option value={12}>Last 12 Months</option>
            </select>
          </div>
        </div>
      </div>

      <div className="audit-stats-grid">
        <div className="audit-stat-card">
          <span>Total Discrepancies</span>
          <strong>{stats.totalDiscrepancies}</strong>
        </div>

        <div className="audit-stat-card good">
          <span>Total Matched</span>
          <strong>{stats.totalMatched}</strong>
        </div>

        <div className="audit-stat-card">
          <span>Total Variance</span>
          <strong>{stats.totalVariance}</strong>
        </div>

        <div className={`audit-stat-card ${stats.trendDirection === 'improving' ? 'good' : stats.trendDirection === 'declining' ? 'warning' : ''}`}>
          <span>Avg Accuracy</span>
          <strong>{stats.averageAccuracy}%</strong>
          <small>({stats.trendDirection})</small>
        </div>
      </div>

      <div className="audit-table-card">
        <div className="audit-table-header">
          <div>
            <h3>Audit Trends Analysis</h3>
            <p>Monthly audit performance over the last {months} months.</p>
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

        {/* Chart Container */}
        <div className="chart-container">
          <div className="chart-controls">
            <select 
              value={months} 
              onChange={(e) => setMonths(Number(e.target.value))}
              className="period-selector"
            >
              <option value={3}>Last 3 Months</option>
              <option value={6}>Last 6 Months</option>
              <option value={12}>Last 12 Months</option>
            </select>
            <div className="chart-type-selector">
              <button 
                className={chartType === 'line' ? 'active' : ''}
                onClick={() => setChartType('line')}
              >
                📈 Line
              </button>
              <button 
                className={chartType === 'bar' ? 'active' : ''}
                onClick={() => setChartType('bar')}
              >
                📊 Bar
              </button>
              <button 
                className={chartType === 'pie' ? 'active' : ''}
                onClick={() => setChartType('pie')}
              >
                🥧 Pie
              </button>
            </div>
          </div>
          
          {chartType === 'line' && (
            <Line data={chartData} options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  position: 'top',
                },
                title: {
                  display: true,
                  text: 'Audit Trends Over Time',
                },
              },
              scales: {
                y: {
                  beginAtZero: true,
                },
              },
            }} />
          )}
          
          {chartType === 'bar' && (
            <Bar data={chartData} options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  position: 'top',
                },
                title: {
                  display: true,
                  text: 'Monthly Audit Comparison',
                },
              },
              scales: {
                y: {
                  beginAtZero: true,
                },
              },
            }} />
          )}
          
          {chartType === 'pie' && (
            <Pie 
              data={{
                labels: ['Matched Items', 'Discrepancies'],
                datasets: [{
                  data: [
                    stats.totalMatched,
                    stats.totalDiscrepancies
                  ],
                  backgroundColor: [
                    'rgba(16, 185, 129, 0.8)',
                    'rgba(239, 68, 68, 0.8)'
                  ],
                  borderColor: [
                    'rgba(16, 185, 129, 1)',
                    'rgba(239, 68, 68, 1)'
                  ],
                  borderWidth: 1
                }]
              }} 
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'right',
                  },
                  title: {
                    display: true,
                    text: 'Audit Status Distribution',
                  },
                },
              }} 
            />
          )}
        </div>

        {/* Fallback table for when chart is not available */}
        <div className="audit-table-scroll">
          <table className="audit-table">
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
              {auditData
                .sort((a, b) => {
                  const dateA = new Date(a.year, a.month - 1);
                  const dateB = new Date(b.year, b.month - 1);
                  return dateB - dateA;
                })
                .map((audit) => {
                  const totalAudited = Number(audit.total_discrepancies || 0) + Number(audit.total_matched || 0);
                  const accuracyRate = totalAudited > 0 ? ((Number(audit.total_matched || 0) / totalAudited) * 100).toFixed(1) : 0;
                  
                  return (
                    <tr key={`${audit.month}-${audit.year}`}>
                      <td>{new Date(audit.year, audit.month - 1).toLocaleString('default', { month: 'long' })}</td>
                      <td>{audit.year}</td>
                      <td className={audit.total_discrepancies > 0 ? "negative" : ""}>
                        {audit.total_discrepancies}
                      </td>
                      <td className="positive">{audit.total_matched}</td>
                      <td className={audit.total_variance < 0 ? "negative" : audit.total_variance > 0 ? "positive" : ""}>
                        {audit.total_variance}
                      </td>
                      <td>
                        <span className={`audit-status ${accuracyRate >= 90 ? 'matched' : 'discrepancy'}`}>
                          {accuracyRate}%
                        </span>
                      </td>
                    </tr>
                  );
                })}

              {auditData.length === 0 && (
                <tr>
                  <td colSpan="6" className="audit-empty">
                    No audit data found for the selected period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AuditAnalyticsDashboard;
