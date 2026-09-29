/**
 * Report Export Utilities
 * Standardized export functions for CSV, PDF, and Excel formats
 */

import * as XLSX from "xlsx";
import { sanitizeCsvCell } from "./csvSanitize";
import { exportFormalReportPDF } from "./formalReportPdf";
import { getRole, getUserData } from "./auth";

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
export const exportToCSV = (data, columns = [], filename = "report", metadata = {}) => {
  if (!Array.isArray(data) || data.length === 0) {
    console.warn("No data to export");
    return;
  }

  const exportColumns = Array.isArray(columns) && columns.length
    ? columns.map((column) => typeof column === "string" ? { key: column, label: column } : column)
    : Object.keys(data[0]).map((key) => ({ key, label: key }));
  const headers = exportColumns.map((col) => col.label || col.key);
  const reportMeta = [
    [metadata.title || filename.replace(/[_-]+/g, " ")],
    ...(metadata.periodLabel ? [[`Reporting period: ${metadata.periodLabel}`]] : []),
    [`Prepared by: ${metadata.preparedBy || getUserData().name || "Authorized Staff"}`],
    [`Prepared role: ${metadata.preparedRole || getRole() || "Report Preparer"}`],
    [`Generated: ${new Date().toLocaleString("en-PH")}`],
    [],
  ];
  const escapeCsv = (value) => {
    const safeValue = String(sanitizeCsvCell(value) ?? "");
    return /[",\n\r]/.test(safeValue) ? `"${safeValue.replace(/"/g, '""')}"` : safeValue;
  };
  const rows = [
    ...reportMeta,
    headers,
    ...data.map((row) => exportColumns.map((col) => getNestedValue(row, col.key))),
  ];
  const csvContent = `\uFEFF${rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n")}`;
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.href = url;
  link.download = `${filename}_${formatDateForFilename(new Date())}.csv`;
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/**
 * Export data to PDF format using jsPDF and autoTable
 * @param {Array} data - Array of objects to export
 * @param {Array} columns - Array of {key, label} objects defining columns
 * @param {string} title - Report title
 * @param {string} filename - Output filename without extension
 */
export const exportToPDF = (data, columns, title = "Report", filename = "report", reportOptions = {}) => {
  if (!data || !Array.isArray(data)) {
    console.warn("No data to export");
    return;
  }

  const pdfColumns = columns.map((column) => ({
    header: column.label || column.key,
    key: column.key,
    align: column.align,
    width: column.width,
    format: (value) => {
      if (value === null || value === undefined) return "";
      if (column.format === "currency") return formatCurrencyForExport(value);
      if (column.format === "date") return formatDateForExport(value);
      return String(value);
    },
  }));
  const generatedBy = getUserData().name || "Authorized Staff";
  const safeRef = reportOptions.docRef || `${filename.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "")}-${formatDateForFilename(new Date())}`;

  return exportFormalReportPDF({
    ...reportOptions,
    docRef: safeRef,
    title,
    subtitle: reportOptions.subtitle || `${title} — detailed business report`,
    periodLabel: reportOptions.periodLabel || "As of issue date",
    infoFields: [
      { label: "Records Included", value: data.length },
      ...(reportOptions.infoFields || []),
    ],
    summaryCards: reportOptions.summaryCards || [
      { label: "Records Included", value: data.length },
      { label: "Report Status", value: data.length ? "Generated" : "No Records" },
    ],
    table: {
      title: reportOptions.table?.title || "Detailed Records",
      columns: pdfColumns,
      rows: data,
      ...(reportOptions.table || {}),
    },
    findings: reportOptions.findings || [
      `${data.length} record(s) are included in the detailed schedule for this report. Review the underlying source records and supporting documentation before approval.`,
    ],
    recommendations: reportOptions.recommendations || [
      "Retain this report with its source records and obtain the required review and approval signatures.",
    ],
    filename: `${filename}_${formatDateForFilename(new Date())}`,
    signatures: reportOptions.signatures,
    preparedBy: reportOptions.preparedBy || generatedBy,
    preparedRole: reportOptions.preparedRole || getRole() || "Report Preparer",
  });
};

/**
 * Export data to Excel format using SheetJS
 * @param {Array} data - Array of objects to export
 * @param {Array} columns - Array of {key, label} objects defining columns
 * @param {string} filename - Output filename without extension
 */
export const exportToExcel = (data, columns = [], filename = "report", metadata = {}) => {
  if (!Array.isArray(data) || data.length === 0) {
    console.warn("No data to export");
    return;
  }

  const exportColumns = Array.isArray(columns) && columns.length
    ? columns.map((column) => typeof column === "string" ? { key: column, label: column } : column)
    : Object.keys(data[0]).map((key) => ({ key, label: key }));
  const headers = exportColumns.map((col) => col.label || col.key);
  const reportMeta = [
    [metadata.title || filename.replace(/[_-]+/g, " ")],
    ...(metadata.periodLabel ? [[`Reporting period: ${metadata.periodLabel}`]] : []),
    [`Prepared by: ${metadata.preparedBy || getUserData().name || "Authorized Staff"}`],
    [`Prepared role: ${metadata.preparedRole || getRole() || "Report Preparer"}`],
    [`Generated: ${new Date().toLocaleString("en-PH")}`],
    [],
  ];
  const rows = data.map((row) => exportColumns.map((column) => {
    const value = getNestedValue(row, column.key);
    if (value === null || value === undefined) return "";
    if (column.format === "currency" && Number.isFinite(Number(value))) return Number(value);
    if (column.format === "date" && value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === "object") return JSON.stringify(value);
    return typeof value === "string" ? value.replace(/[\t\r\n]+/g, " ") : value;
  }));
  const worksheet = XLSX.utils.aoa_to_sheet([...reportMeta, headers, ...rows], { cellDates: true });
  const headerRow = reportMeta.length;
  const dataStartRow = headerRow + 1;
  exportColumns.forEach((column, columnIndex) => {
    if (column.format !== "currency" && column.format !== "date") return;
    rows.forEach((row, rowIndex) => {
      const address = XLSX.utils.encode_cell({ r: dataStartRow + rowIndex, c: columnIndex });
      const cell = worksheet[address];
      if (!cell || cell.v === "") return;
      if (column.format === "date" && typeof cell.v === "string") {
        const match = cell.v.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) {
          cell.v = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
          cell.t = "d";
        }
      }
      cell.z = column.format === "currency" ? '"₱"#,##0.00' : "mmm d, yyyy";
    });
  });
  worksheet["!cols"] = exportColumns.map((column, columnIndex) => ({
    width: Math.min(Math.max(
      String(headers[columnIndex]).length,
      ...rows.map((row) => String(row[columnIndex] ?? "").length)
    ) + 2, 50),
  }));
  const workbook = XLSX.utils.book_new();
  const sheetName = String(metadata.sheetName || "Report").replace(/[\\/?*\[\]:]/g, " ").slice(0, 31) || "Report";
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  XLSX.writeFile(workbook, `${filename}_${formatDateForFilename(new Date())}.xlsx`, { cellDates: true });
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
