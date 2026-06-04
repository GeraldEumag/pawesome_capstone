/**
 * Advanced Report Export Utilities
 * Export advanced report data to CSV, Excel, and PDF formats
 */

import { format } from 'date-fns';
import { showWarning, showError } from './alert';

/**
 * Export data to CSV
 */
export const exportToCSV = (data, filename, headers) => {
  if (!data || data.length === 0) {
    showWarning('No data to export');
    return;
  }

  const csvHeaders = headers || Object.keys(data[0]);
  const csvRows = [
    csvHeaders.join(','),
    ...data.map(row =>
      csvHeaders.map(header => {
        const value = row[header];
        // Escape values containing commas or quotes
        const escaped = typeof value === 'string' && (value.includes(',') || value.includes('"'))
          ? `"${value.replace(/"/g, '""')}"`
          : value;
        return escaped ?? '';
      }).join(',')
    ),
  ];

  const csvContent = '\uFEFF' + csvRows.join('\n'); // BOM for Excel UTF-8
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  
  downloadFile(blob, `${filename}_${format(new Date(), 'yyyy-MM-dd')}.csv`);
};

/**
 * Export to Excel (XLSX format)
 */
export const exportToExcel = async (data, filename, sheetName = 'Data') => {
  if (!data || data.length === 0) {
    showWarning('No data to export');
    return;
  }

  try {
    // Dynamic import to reduce bundle size
    const XLSX = await import('xlsx');
    
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    
    // Auto-width columns
    const maxWidth = Object.keys(data[0]).reduce((acc, key) => {
      const maxDataWidth = Math.max(
        key.length,
        ...data.map(row => String(row[key] || '').length)
      );
      acc[key] = { width: Math.min(maxDataWidth + 2, 50) };
      return acc;
    }, {});
    worksheet['!cols'] = Object.values(maxWidth);
    
    XLSX.writeFile(workbook, `${filename}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  } catch (err) {
    console.error('Excel export error:', err);
    // Fallback to CSV
    exportToCSV(data, filename);
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
    // Dynamic import
    const { jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(16);
    doc.text(title, 14, 20);
    
    // Date
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), 'PPP')}`, 14, 30);
    
    // Table
    const tableHeaders = headers || Object.keys(data[0]);
    doc.autoTable({
      head: [tableHeaders.map(h => h.toUpperCase())],
      body: data.map(row => tableHeaders.map(h => row[h] ?? '')),
      startY: 40,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [255, 95, 147] },
    });
    
    doc.save(`${filename}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  } catch (err) {
    console.error('PDF export error:', err);
    showError('PDF export failed. Falling back to CSV.');
    exportToCSV(data, filename, headers);
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
  URL.revokeObjectURL(url);
};

/**
 * Export Executive Dashboard Data
 */
export const exportExecutiveData = (data, format = 'csv') => {
  const filename = 'Executive_Dashboard';
  
  // Export revenue trend
  if (data.revenueTrend) {
    const trendData = data.revenueTrend.map(item => ({
      Date: item.date,
      Revenue: item.revenue,
      Orders: item.orders,
    }));
    
    if (format === 'csv') exportToCSV(trendData, `${filename}_Trend`);
    else if (format === 'excel') exportToExcel(trendData, `${filename}_Trend`, 'Revenue Trend');
    else if (format === 'pdf') exportToPDF(trendData, `${filename}_Trend`, 'Executive Dashboard - Revenue Trend');
  }
  
  // Export summary
  if (data.summary) {
    const summaryData = [{
      Metric: 'Total Revenue',
      Value: data.summary.totalRevenue,
    }, {
      Metric: 'Today Revenue',
      Value: data.summary.todayRevenue,
    }, {
      Metric: 'Total Orders',
      Value: data.summary.totalOrders,
    }, {
      Metric: 'Active Customers',
      Value: data.summary.activeCustomers,
    }];
    
    if (format === 'csv') exportToCSV(summaryData, `${filename}_Summary`);
    else if (format === 'excel') exportToExcel(summaryData, `${filename}_Summary`, 'Summary');
  }
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
