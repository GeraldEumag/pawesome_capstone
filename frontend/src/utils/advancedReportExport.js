/**
 * Advanced Report Export Utilities
 * Export advanced report data to CSV, Excel, and PDF formats
 */

import { format } from 'date-fns';
import { showWarning, showError } from './alert.jsx';
import { sanitizeCsvCell } from './csvSanitize';
import { getRole, getUserData } from './auth';
import { exportFormalReportPDF } from './formalReportPdf';

/**
 * Export data to CSV
 */
export const exportToCSV = (data, filename, headers, metadata = {}) => {
  if (!Array.isArray(data) || data.length === 0) {
    showWarning('No data to export');
    return;
  }

  const csvHeaders = headers || Object.keys(data[0]);
  const csvEscape = (value) => {
    const safeValue = String(sanitizeCsvCell(value) ?? '');
    return /[",\n\r]/.test(safeValue) ? `"${safeValue.replace(/"/g, '""')}"` : safeValue;
  };
  const reportTitle = metadata.title || filename.replace(/[_-]+/g, ' ');
  const reportMeta = [
    [reportTitle],
    ...(metadata.periodLabel ? [[`Reporting period: ${metadata.periodLabel}`]] : []),
    [`Prepared by: ${metadata.preparedBy || getUserData().name || 'Authorized Staff'}`],
    [`Prepared role: ${metadata.preparedRole || getRole() || 'Report Preparer'}`],
    [`Generated: ${new Date().toLocaleString('en-PH')}`],
    [],
  ];
  const csvRows = [
    ...reportMeta,
    csvHeaders,
    ...data.map(row => csvHeaders.map(header => row?.[header])),
  ];
  const csvContent = '\uFEFF' + csvRows.map(row => row.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

  downloadFile(blob, `${filename}_${format(new Date(), 'yyyy-MM-dd')}.csv`);
};

/**
 * Export to Excel (XLSX format)
 */
export const exportToExcel = async (data, filename, sheetName = 'Data', metadata = {}) => {
  if (!Array.isArray(data) || data.length === 0) {
    showWarning('No data to export');
    return;
  }

  try {
    const XLSX = await import('xlsx');
    const headers = Object.keys(data[0]);
    const reportMeta = [
      [metadata.title || filename.replace(/[_-]+/g, ' ')],
      ...(metadata.periodLabel ? [[`Reporting period: ${metadata.periodLabel}`]] : []),
      [`Prepared by: ${metadata.preparedBy || getUserData().name || 'Authorized Staff'}`],
      [`Prepared role: ${metadata.preparedRole || getRole() || 'Report Preparer'}`],
      [`Generated: ${new Date().toLocaleString('en-PH')}`],
      [],
    ];
    const worksheetData = [
      ...reportMeta,
      headers,
      ...data.map(row => headers.map(header => row?.[header] ?? '')),
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const maxWidth = headers.map((header, index) => ({
      width: Math.min(Math.max(
        String(header).length,
        ...data.map(row => String(row?.[header] ?? '').length)
      ) + 2, 50),
    }));
    worksheet['!cols'] = maxWidth;

    const workbook = XLSX.utils.book_new();
    const safeSheetName = String(sheetName || 'Data').replace(/[\\/?*\[\]:]/g, ' ').slice(0, 31) || 'Data';
    XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName);
    XLSX.writeFile(workbook, `${filename}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  } catch (err) {
    console.error('Excel export error:', err);
    showError('Excel export failed. Please try again.');
    throw err;
  }
};

/**
 * Export to PDF
 */
export const exportToPDF = async (data, filename, title, headers) => {
  if (!data || data.length === 0) {
    showWarning('No data to export');
    return;
  }

  try {
    const tableHeaders = headers || Object.keys(data[0]);
    return exportFormalReportPDF({
      docRef: `${filename.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}-${format(new Date(), "yyyyMMdd")}`,
      title: title || "Business Report",
      subtitle: `${title || "Business Report"} — detailed business report`,
      periodLabel: "As of issue date",
      infoFields: [{ label: "Records Included", value: data.length }],
      summaryCards: [
        { label: "Records Included", value: data.length },
        { label: "Report Status", value: "Generated" },
      ],
      table: {
        columns: tableHeaders.map((header) => ({ header: String(header).toUpperCase(), key: header })),
        rows: data,
      },
      findings: [
        `${data.length} record(s) are included in the detailed schedule. Review the source records and supporting documentation before approval.`,
      ],
      recommendations: ["Retain this report with its source records and obtain the required review and approval signatures."],
      filename: `${filename}_${format(new Date(), "yyyy-MM-dd")}`,
    });
  } catch (err) {
    console.error('PDF export error:', err);
    showError('PDF export failed. Please try again.');
    throw err;
  }
};

/**
 * Generic download helper
 */
const downloadFile = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/**
 * Export Executive Dashboard Data
 */
const executiveNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const executiveCurrency = (value) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(executiveNumber(value));

const executiveReportData = (data = {}, period = {}) => {
  const source = data || {};
  const summary = source.summary || {};
  const comparisons = source.comparisons || {};
  const predictions = source.predictions || {};
  const trend = source.revenueTrend || source.revenue_trend || [];
  const periodTrend = Array.isArray(trend) ? trend.filter((item) => {
    const date = item.full_date || item.date;
    if (!date || !period.from || !period.to || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return true;
    return date >= period.from && date <= period.to;
  }) : [];
  const rawStatuses = source.statusBreakdown || source.status_breakdown || {};
  const statusRows = Array.isArray(rawStatuses)
    ? rawStatuses.map((row) => ({
      Status: row.name || row.status || 'Unknown',
      Orders: executiveNumber(row.count ?? row.orders ?? row.value),
      Revenue: executiveNumber(row.revenue),
    }))
    : Object.entries(rawStatuses).map(([status, values]) => ({
      Status: status.charAt(0).toUpperCase() + status.slice(1),
      Orders: executiveNumber(values?.count ?? values?.orders ?? values),
      Revenue: executiveNumber(values?.revenue),
    }));
  const summaryRows = [
    { Metric: 'Revenue for selected period', Value: executiveNumber(summary.total_revenue ?? summary.totalRevenue) },
    { Metric: 'Today revenue', Value: executiveNumber(summary.today_revenue ?? summary.todayRevenue) },
    { Metric: 'Yesterday revenue', Value: executiveNumber(summary.yesterday_revenue ?? summary.yesterdayRevenue) },
    { Metric: 'Orders for selected period', Value: executiveNumber(summary.total_orders ?? summary.totalOrders) },
    { Metric: 'Today orders', Value: executiveNumber(summary.today_orders ?? summary.todayOrders) },
    { Metric: 'Active customers', Value: executiveNumber(summary.active_customers ?? summary.activeCustomers) },
    { Metric: 'Total customers', Value: executiveNumber(summary.total_customers ?? summary.totalCustomers) },
    { Metric: 'Pending approvals', Value: executiveNumber(summary.pending_approvals ?? summary.pendingApprovals ?? summary.pending_requests) },
    { Metric: 'Low-stock items', Value: executiveNumber(summary.low_stock_items ?? summary.lowStockItems) },
    { Metric: 'Critical-stock items', Value: executiveNumber(summary.critical_stock_items ?? summary.criticalStockItems) },
    { Metric: 'Next-month revenue forecast', Value: executiveNumber(predictions.next_month_revenue ?? predictions.nextMonthRevenue) },
    { Metric: 'Previous-period revenue', Value: executiveNumber(comparisons.previous_revenue ?? comparisons.previousRevenue) },
    { Metric: 'Previous-period orders', Value: executiveNumber(comparisons.previous_orders ?? comparisons.previousOrders) },
    { Metric: 'Year-over-year growth (%)', Value: executiveNumber(comparisons.yoy_growth ?? comparisons.yoyGrowth) },
  ];
  const trendRows = periodTrend.map((item) => ({
    Date: item.full_date || item.date || '',
    Revenue: executiveNumber(item.revenue),
    Orders: executiveNumber(item.orders ?? item.count),
  }));
  const anomalies = Array.isArray(source.anomalies) ? source.anomalies : [];
  const alertRows = anomalies.map((alert) => ({
    Type: alert.title || 'Alert',
    Severity: alert.severity || 'Information',
    Details: alert.message || '',
  }));
  if (alertRows.length === 0) {
    alertRows.push({ Type: 'System status', Severity: 'Information', Details: 'No anomalies were reported for this dashboard refresh.' });
  }
  alertRows.push({
    Type: 'Next-month forecast',
    Severity: 'Projection',
    Details: executiveNumber(predictions.next_month_revenue ?? predictions.nextMonthRevenue),
  });

  return { summaryRows, trendRows, statusRows, alertRows, summary, comparisons, predictions, anomalies };
};

const executiveMetaRows = (title, periodLabel, preparedBy, preparedRole) => [
  [title],
  [`Reporting period: ${periodLabel}`],
  [`Prepared by: ${preparedBy}`],
  [`Prepared role: ${preparedRole}`],
  [`Generated: ${new Date().toLocaleString('en-PH')}`],
  [],
];

const exportExecutiveCSV = (report, periodLabel, preparedBy, preparedRole) => {
  const csvRows = [
    ...executiveMetaRows('Executive Dashboard Report', periodLabel, preparedBy, preparedRole),
    ['Executive Summary'],
    ['Metric', 'Value'],
    ...report.summaryRows.map((row) => [row.Metric, row.Value]),
    [],
    ['Revenue Trend'],
    ['Date', 'Revenue', 'Orders'],
    ...report.trendRows.map((row) => [row.Date, row.Revenue, row.Orders]),
    [],
    ['Order Status'],
    ['Status', 'Orders', 'Revenue'],
    ...report.statusRows.map((row) => [row.Status, row.Orders, row.Revenue]),
    [],
    ['Alerts & Forecast'],
    ['Type', 'Severity', 'Details'],
    ...report.alertRows.map((row) => [row.Type, row.Severity, row.Details]),
  ];
  const csvEscape = (value) => {
    const safeValue = String(sanitizeCsvCell(value) ?? '');
    return /[",\n\r]/.test(safeValue) ? `"${safeValue.replace(/"/g, '""')}"` : safeValue;
  };
  const csvContent = '\uFEFF' + csvRows.map((row) => row.map(csvEscape).join(',')).join('\r\n');
  downloadFile(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }), `Executive_Dashboard_${format(new Date(), 'yyyy-MM-dd')}.csv`);
};

const exportExecutiveExcel = async (report, periodLabel, preparedBy, preparedRole) => {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const sheets = [
    { name: 'Summary', rows: report.summaryRows },
    { name: 'Revenue Trend', rows: report.trendRows },
    { name: 'Order Status', rows: report.statusRows },
    { name: 'Alerts & Forecast', rows: report.alertRows },
  ];
  sheets.forEach(({ name, rows }) => {
    const headers = Object.keys(rows[0] || (name === 'Summary'
      ? { Metric: '', Value: '' }
      : name === 'Revenue Trend'
        ? { Date: '', Revenue: '', Orders: '' }
        : name === 'Order Status'
          ? { Status: '', Orders: '', Revenue: '' }
          : { Type: '', Severity: '', Details: '' }));
    const worksheet = XLSX.utils.aoa_to_sheet([
      ...executiveMetaRows('Executive Dashboard Report', periodLabel, preparedBy, preparedRole),
      headers,
      ...rows.map((row) => headers.map((header) => row[header] ?? '')),
    ]);
    worksheet['!cols'] = headers.map((header) => ({
      width: Math.min(Math.max(header.length, ...rows.map((row) => String(row[header] ?? '').length)) + 2, 48),
    }));
    XLSX.utils.book_append_sheet(workbook, worksheet, name);
  });
  XLSX.writeFile(workbook, `Executive_Dashboard_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
};

/** Export all Executive Dashboard data in one selected format. */
export const exportExecutiveData = async (data, fileFormat = 'csv', context = {}) => {
  const filename = 'Executive_Dashboard';
  const report = executiveReportData(data, context.period);
  const periodLabel = context.period?.periodLabel || 'As of issue date';
  const preparedBy = getUserData().name || 'Authorized Staff';
  const preparedRole = getRole() || 'Report Preparer';
  const generatedDate = format(new Date(), 'yyyy-MM-dd');

  if (fileFormat === 'csv') {
    exportExecutiveCSV(report, periodLabel, preparedBy, preparedRole);
    return;
  }
  if (fileFormat === 'excel') {
    try {
      await exportExecutiveExcel(report, periodLabel, preparedBy, preparedRole);
    } catch (err) {
      console.error('Executive Excel export error:', err);
      throw err;
    }
    return;
  }
  if (fileFormat === 'pdf') {
    const summary = report.summary;
    const predictions = report.predictions;
    const findings = report.anomalies.length
      ? report.anomalies.map((alert) => `${alert.title || 'Alert'}: ${alert.message || 'Review the flagged condition.'}`)
      : ['No anomalies were reported for the selected dashboard period.'];
    findings.push(`Next-month revenue forecast: ${executiveCurrency(predictions.next_month_revenue ?? predictions.nextMonthRevenue)}.`);
    if (executiveNumber(summary.pending_approvals ?? summary.pendingApprovals) > 0) {
      findings.push(`${executiveNumber(summary.pending_approvals ?? summary.pendingApprovals)} approval item(s) remain pending.`);
    }
    const recommendations = [];
    if (executiveNumber(summary.low_stock_items ?? summary.lowStockItems) > 0) {
      recommendations.push(`Review and replenish ${executiveNumber(summary.low_stock_items ?? summary.lowStockItems)} low-stock item(s).`);
    }
    if (executiveNumber(summary.pending_approvals ?? summary.pendingApprovals) > 0) {
      recommendations.push('Review and resolve pending approval items according to the operating approval process.');
    }
    if (!recommendations.length) recommendations.push('Continue routine monitoring of revenue, order status, inventory, and operational alerts.');

    try {
      return exportFormalReportPDF({
        docRef: `EXEC-${generatedDate.replace(/-/g, '')}`,
        title: 'Executive Dashboard Report',
        subtitle: 'Performance, revenue, and operational status report',
        periodLabel,
        orientation: 'landscape',
        infoFields: [
          { label: 'Selected Range', value: context.period?.from && context.period?.to ? `${context.period.from} through ${context.period.to}` : periodLabel },
          { label: 'Last Refreshed', value: context.lastUpdated ? new Date(context.lastUpdated).toLocaleString('en-PH') : 'At export time' },
          { label: 'Prepared By', value: preparedBy },
        ],
        summaryCards: [
          { label: 'Period Revenue', value: executiveCurrency(summary.total_revenue ?? summary.totalRevenue) },
          { label: 'Today Revenue', value: executiveCurrency(summary.today_revenue ?? summary.todayRevenue) },
          { label: 'Period Orders', value: executiveNumber(summary.total_orders ?? summary.totalOrders) },
          { label: 'Active Customers', value: executiveNumber(summary.active_customers ?? summary.activeCustomers) },
          { label: 'Pending Approvals', value: executiveNumber(summary.pending_approvals ?? summary.pendingApprovals) },
          { label: 'Low Stock', value: executiveNumber(summary.low_stock_items ?? summary.lowStockItems) },
          { label: 'Next-Month Forecast', value: executiveCurrency(predictions.next_month_revenue ?? predictions.nextMonthRevenue) },
        ],
        analysis: {
          title: 'Order Status Breakdown',
          columns: [
            { header: 'Status', key: 'Status' },
            { header: 'Orders', key: 'Orders', align: 'right' },
            { header: 'Revenue', key: 'Revenue', align: 'right', format: executiveCurrency },
          ],
          rows: report.statusRows,
        },
        table: {
          title: 'Daily Revenue and Order Detail',
          columns: [
            { header: 'Date', key: 'Date' },
            { header: 'Revenue', key: 'Revenue', align: 'right', format: executiveCurrency },
            { header: 'Orders', key: 'Orders', align: 'right' },
          ],
          rows: report.trendRows,
        },
        findings,
        recommendations,
        signatures: [
          { role: 'Prepared by', name: preparedBy, caption: preparedRole },
          { role: 'Reviewed by', name: '', caption: 'Finance / Operations Reviewer' },
          { role: 'Approved by', name: '', caption: 'Executive Approver' },
        ],
        filename: `${filename}_${generatedDate}`,
      });
    } catch (err) {
      console.error('Executive PDF export error:', err);
      throw err;
    }
  }

  throw new Error(`Unsupported export format: ${fileFormat}`);
};

/**
 * Export Customer Segmentation
 */
export const exportCustomerSegments = (data, format = 'csv') => {
  const filename = 'Customer_Segments';
  
  if (data.customers) {
    const customerData = data.customers.map(c => ({
      Name: c.name,
      Email: c.email,
      Total_Spent: c.totalSpent,
      Orders: c.orders,
      Days_Since_Last_Order: c.daysSinceOrder,
      Segment: c.totalSpent > 50000 ? 'VIP' : c.totalSpent > 20000 ? 'Loyal' : c.daysSinceOrder > 90 ? 'Lost' : c.orders <= 2 ? 'New' : 'At Risk',
    }));
    
    if (format === 'csv') exportToCSV(customerData, filename);
    else if (format === 'excel') exportToExcel(customerData, filename, 'Customers');
    else if (format === 'pdf') exportToPDF(customerData, filename, 'Customer Segmentation Report');
  }
};

/**
 * Export Sales Analysis
 */
export const exportSalesAnalysis = (data, format = 'csv') => {
  const filename = 'Sales_Analysis';
  
  if (data.dailyData) {
    const salesData = data.dailyData.map(d => ({
      Date: d.date,
      Revenue: d.revenue,
      Orders: d.orders,
      Avg_Order_Value: d.avgOrderValue,
      Target: d.target,
    }));
    
    if (format === 'csv') exportToCSV(salesData, filename);
    else if (format === 'excel') exportToExcel(salesData, filename, 'Sales');
    else if (format === 'pdf') exportToPDF(salesData, filename, 'Sales Analysis Report');
  }
};

/**
 * Export Inventory Data
 */
export const exportInventoryData = (data, format = 'csv') => {
  const filename = 'Inventory_Analysis';
  
  if (data.abcData) {
    if (format === 'csv') exportToCSV(data.abcData, filename);
    else if (format === 'excel') exportToExcel(data.abcData, filename, 'ABC Analysis');
    else if (format === 'pdf') exportToPDF(data.abcData, filename, 'Inventory ABC Analysis');
  }
};

/**
 * Export Staff Performance
 */
export const exportStaffPerformance = (data, format = 'csv') => {
  const filename = 'Staff_Performance';
  
  if (data.staffData) {
    const staffData = data.staffData.map(s => ({
      Name: s.name,
      Role: s.role,
      Department: s.department,
      Rating: s.rating,
      Performance_Level: s.performanceLevel,
      Revenue: s.revenue,
      Attendance: s.attendance,
      Punctuality: s.punctuality,
      Efficiency: s.efficiency,
    }));
    
    if (format === 'csv') exportToCSV(staffData, filename);
    else if (format === 'excel') exportToExcel(staffData, filename, 'Staff');
    else if (format === 'pdf') exportToPDF(staffData, filename, 'Staff Performance Report');
  }
};

export default {
  exportToCSV,
  exportToExcel,
  exportToPDF,
  exportExecutiveData,
  exportCustomerSegments,
  exportSalesAnalysis,
  exportInventoryData,
  exportStaffPerformance,
};
