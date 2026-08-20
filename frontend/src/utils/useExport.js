/**
 * useExport — Shared React hook for multi-format data export.
 *
 * Provides a unified export handler that supports CSV, Excel, and PDF formats
 * using the shared reportExport utilities. Any component can use this hook
 * to add export functionality without duplicating code.
 *
 * Usage:
 *   import { useExport } from "../utils/useExport";
 *   const { handleExport, ExportDropdown } = useExport({
 *     data: filteredItems,
 *     columns: [{ key: "name", label: "Name" }, ...],
 *     filename: "my-report",
 *     title: "My Report",
 *   });
 *
 *   // In JSX:
 *   <ExportDropdown />
 *
 * Or call directly:
 *   handleExport("csv");
 *   handleExport("excel");
 *   handleExport("pdf");
 */

import { useState, useCallback } from "react";
import { exportToCSV, exportToPDF, exportToExcel } from "./reportExport";

export function useExport({ data = [], columns = [], filename = "export", title = "Report" }) {
  const [showDropdown, setShowDropdown] = useState(false);

  const handleExport = useCallback(
    (format) => {
      setShowDropdown(false);
      if (!data || data.length === 0) return;
      if (format === "csv") exportToCSV(data, columns, filename);
      else if (format === "excel") exportToExcel(data, columns, filename);
      else if (format === "pdf") exportToPDF(data, columns, title, filename);
    },
    [data, columns, filename, title]
  );

  return { showDropdown, setShowDropdown, handleExport };
}
