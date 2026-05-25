/**
 * Report Export Utilities
 * Standardized export functions for CSV, PDF, and Excel formats
 */

import jsPDF from "jspdf";
import "jspdf-autotable";
import * as XLSX from "xlsx";

export const getNestedValue = (row, key) => {
  if (!row || !key) return undefined;
  return key.split(".").reduce((value, part) => {
    if (value === null || value === undefined) return undefined;
    return value[part];
  }, row);
};

/**
 * Export data to CSV format
 * @param {Array} data - Array of objects to export
 * @param {Array} columns - Array of {key, label} objects defining columns
 * @param {string} filename - Output filename without extension
 */
export const exportToCSV = (data, columns, filename = "report") => {
  if (!data || !Array.isArray(data) || data.length === 0) {
    console.warn("No data to export");
    return;
  }

  // Create headers
  const headers = columns.map((col) => col.label || col.key);

  // Create rows
  const rows = data.map((row) =>
    columns.map((col) => {
      const value = getNestedValue(row, col.key);
      // Handle values that might contain commas or quotes
      if (value === null || value === undefined) return "";
      const stringValue = String(value);
      if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    })
  );

  // Combine into CSV content
  const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");

  // Create and download blob
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}_${formatDateForFilename(new Date())}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Export data to PDF format using jsPDF and autoTable
 * @param {Array} data - Array of objects to export
 * @param {Array} columns - Array of {key, label} objects defining columns
 * @param {string} title - Report title
 * @param {string} filename - Output filename without extension
 */
export const exportToPDF = (data, columns, title = "Report", filename = "report") => {
  if (!data || !Array.isArray(data)) {
    console.warn("No data to export");
    return;
  }

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Add title
  doc.setFontSize(18);
  doc.text(title, pageWidth / 2, 20, { align: "center" });

  // Add date
  doc.setFontSize(10);
  doc.text(`Generated on: ${new Date().toLocaleString()}`, pageWidth / 2, 30, { align: "center" });

  // Prepare table data
  const headers = columns.map((col) => col.label || col.key);
  const rows = data.map((row) =>
    columns.map((col) => {
      const value = getNestedValue(row, col.key);
      if (value === null || value === undefined) return "";
      if (col.format === "currency") return formatCurrencyForExport(value);
      if (col.format === "date") return formatDateForExport(value);
      return String(value);
    })
  );

  // Add table
  doc.autoTable({
    head: [headers],
    body: rows,
    startY: 40,
    styles: {
      fontSize: 9,
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: "bold",
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251],
    },
  });

  // Add footer with page numbers
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 20, doc.internal.pageSize.getHeight() - 10);
  }

  doc.save(`${filename}_${formatDateForFilename(new Date())}.pdf`);
};

/**
 * Export data to Excel format using SheetJS
 * @param {Array} data - Array of objects to export
 * @param {Array} columns - Array of {key, label} objects defining columns
 * @param {string} filename - Output filename without extension
 */
export const exportToExcel = (data, columns, filename = "report") => {
  if (!data || !Array.isArray(data) || data.length === 0) {
    console.warn("No data to export");
    return;
  }

  const headers = columns.map((col) => col.label || col.key);

  const rows = data.map((row) =>
    columns.map((col) => {
      const value = getNestedValue(row, col.key);
      if (value === null || value === undefined) return "";
      const stringValue = String(value);
      return stringValue.replace(/\t/g, " ").replace(/\n/g, " ");
    })
  );

  const worksheetData = [headers, ...rows];
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Report");

  const outputFilename = `${filename}_${formatDateForFilename(new Date())}.xlsx`;
  XLSX.writeFile(workbook, outputFilename);
};

/**
 * Format currency for export
 * @param {number} value - Amount to format
 * @returns {string} Formatted currency string
 */
const formatCurrencyForExport = (value) => {
  if (value === null || value === undefined || isNaN(value)) return "₱0.00";
  return `₱${Number(value).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, "$&,")}`;
};

/**
 * Format date for export
 * @param {string|Date} value - Date to format
 * @returns {string} Formatted date string
 */
const formatDateForExport = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

/**
 * Format date for filename (YYYY-MM-DD)
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string safe for filenames
 */
const formatDateForFilename = (date) => {
  return date.toISOString().split("T")[0];
};

/**
 * Filter data by date range
 * @param {Array} data - Array of objects with date property
 * @param {string} dateKey - Key for the date property
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Array} Filtered data
 */
export const filterByDateRange = (data, dateKey, startDate, endDate) => {
  if (!startDate && !endDate) return data;

  return data.filter((item) => {
    const rawDate = item[dateKey];
    if (!rawDate) return true;

    const itemDateStr = new Date(rawDate).toISOString().split("T")[0];
    if (itemDateStr === "Invalid Date") return true;

    if (startDate && itemDateStr < startDate) return false;
    if (endDate && itemDateStr > endDate) return false;

    return true;
  });
};

/**
 * Filter data by status
 * @param {Array} data - Array of objects
 * @param {string} statusKey - Key for status property
 * @param {string} status - Status to filter by
 * @returns {Array} Filtered data
 */
export const filterByStatus = (data, statusKey, status) => {
  if (!status || status === "all") return data;
  return data.filter((item) => item[statusKey] === status);
};

/**
 * Filter data by role
 * @param {Array} data - Array of objects
 * @param {string} roleKey - Key for role property
 * @param {string} role - Role to filter by
 * @returns {Array} Filtered data
 */
export const filterByRole = (data, roleKey, role) => {
  if (!role || role === "all") return data;
  return data.filter((item) => item[roleKey] === role);
};

/**
 * Filter data by service type
 * @param {Array} data - Array of objects
 * @param {string} typeKey - Key for type property
 * @param {string} type - Type to filter by
 * @returns {Array} Filtered data
 */
export const filterByType = (data, typeKey, type) => {
  if (!type || type === "all") return data;
  return data.filter((item) => item[typeKey] === type);
};

/**
 * Get unique values from data array for filter dropdowns
 * @param {Array} data - Array of objects
 * @param {string} key - Key to extract unique values from
 * @returns {Array} Array of unique values
 */
export const getUniqueValues = (data, key) => {
  if (!data || !Array.isArray(data)) return [];
  const values = [...new Set(data.map((item) => item[key]).filter(Boolean))];
  return values.sort();
};

/**
 * Calculate date range presets
 * @param {string} preset - Preset name (today, week, month, quarter, year)
 * @returns {Object} Object with startDate and endDate
 */
export const getDateRangePreset = (preset) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  switch (preset) {
    case "today":
      return {
        startDate: today.toISOString().split("T")[0],
        endDate: today.toISOString().split("T")[0],
      };
    case "yesterday": {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return {
        startDate: yesterday.toISOString().split("T")[0],
        endDate: yesterday.toISOString().split("T")[0],
      };
    }
    case "week": {
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      return {
        startDate: weekStart.toISOString().split("T")[0],
        endDate: weekEnd.toISOString().split("T")[0],
      };
    }
    case "month": {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return {
        startDate: monthStart.toISOString().split("T")[0],
        endDate: monthEnd.toISOString().split("T")[0],
      };
    }
    case "quarter": {
      const quarter = Math.floor(today.getMonth() / 3);
      const quarterStart = new Date(today.getFullYear(), quarter * 3, 1);
      const quarterEnd = new Date(today.getFullYear(), quarter * 3 + 3, 0);
      return {
        startDate: quarterStart.toISOString().split("T")[0],
        endDate: quarterEnd.toISOString().split("T")[0],
      };
    }
    case "year": {
      const yearStart = new Date(today.getFullYear(), 0, 1);
      const yearEnd = new Date(today.getFullYear(), 11, 31);
      return {
        startDate: yearStart.toISOString().split("T")[0],
        endDate: yearEnd.toISOString().split("T")[0],
      };
    }
    case "last7days": {
      const last7 = new Date(today);
      last7.setDate(last7.getDate() - 6);
      return {
        startDate: last7.toISOString().split("T")[0],
        endDate: today.toISOString().split("T")[0],
      };
    }
    case "last30days": {
      const last30 = new Date(today);
      last30.setDate(last30.getDate() - 29);
      return {
        startDate: last30.toISOString().split("T")[0],
        endDate: today.toISOString().split("T")[0],
      };
    }
    default:
      return { startDate: "", endDate: "" };
  }
};
