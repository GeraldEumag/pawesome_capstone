import React, { useEffect, useMemo, useState, useCallback } from "react";
import { inventoryApi } from "../../api/inventory";
import Papa from "papaparse";
import jsPDF from "jspdf";
import "jspdf-autotable";
import * as XLSX from "xlsx";
import "./MonthlyInventoryAudit.css";
import { showAlert, showSuccess, showError } from "../../utils/alert";
import StatusDot from "../shared/StatusDot";

const getCurrentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const getStockValue = (row) =>
  Number(row.system_stock ?? row.quantity ?? row.stock ?? row.item?.quantity ?? row.item?.stock ?? 0);

const normalizeAuditRow = (row) => {
  const item = row.item || {
    id: row.inventory_item_id || row.id,
    name: row.name,
    sku: row.sku,
    category: row.category,
    brand: row.brand,
    stock: row.stock,
    quantity: row.quantity,
  };
  const actualStock = row.actual_stock ?? "";
  const systemStock = getStockValue(row);
  const variance =
    actualStock === "" || actualStock === null
      ? Number(row.variance || 0)
      : Number(actualStock) - systemStock;

  return {
    ...row,
    id: row.audit_id || row.id,
    inventory_item_id: row.inventory_item_id || item.id || row.id,
    item,
    system_stock: systemStock,
    actual_stock: actualStock,
    variance,
    status:
      row.status ||
      row.audit_status ||
      (actualStock === "" || actualStock === null
        ? "pending"
        : variance === 0
          ? "matched"
          : "discrepancy"),
    reason: row.reason || "",
  };
};

const MonthlyInventoryAudit = () => {
  const [month, setMonth] = useState(getCurrentMonth());
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Pagination & filtering state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const fetchAuditItems = async () => {
    try {
      setLoading(true);

      // Use real backend API to get inventory items
      const res = await inventoryApi.getOrCreateMonthlyAudit(month);

      let auditRows = [];
      if (res && res.audits) {
        auditRows = res.audits;
      } else if (res && res.items) {
        auditRows = res.items;
      } else if (res && Array.isArray(res)) {
        auditRows = res;
      } else {
        console.warn("Unexpected response structure:", res);
      }
      auditRows = auditRows.map(normalizeAuditRow);

      // Filter out service items - only include physical inventory items
      const physicalAuditRows = auditRows.filter((auditRow) => {
        if (!auditRow || !auditRow.item) {
          return false;
        }
        
        const category = String(auditRow.item?.category || "").toLowerCase();
        const type = String(auditRow.item?.type || auditRow.item?.item_type || "").toLowerCase();

        const isPhysical = (
          category !== "services" &&
          category !== "service" &&
          type !== "service"
        );
        
        if (!isPhysical) {
          // Skip service items in audit
        }

        return isPhysical;
      });

      // If no items, try to get all inventory items directly
      if (physicalAuditRows.length === 0) {
        try {
          const inventoryRes = await inventoryApi.getItems();
          const fallbackRows = inventoryRes.items || inventoryRes.data || [];
          setItems(fallbackRows.map(normalizeAuditRow));
        } catch (inventoryErr) {
          console.error("Failed to fetch all inventory items:", inventoryErr);
        }
      } else {
        setItems(physicalAuditRows);
      }
    } catch (err) {
      console.error("Failed to load monthly audit:", err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
    setCategoryFilter("all");
    setStatusFilter("all");
    setSearchTerm("");
    fetchAuditItems();
  }, [month]);

  useEffect(() => {
    setCurrentPage(1);
  }, [categoryFilter, statusFilter, searchTerm, itemsPerPage]);

  const updateItem = (id, field, value) => {
    // Validate negative stock
    if (field === "actual_stock" && Number(value) < 0) {
      showAlert("Actual stock cannot be negative!");
      return;
    }

    setItems((prev) =>
      prev.map((auditRow) => {
        if (auditRow.id !== id) return auditRow;

        const next = {
          ...auditRow,
          [field]: value,
        };

        // Calculate variance and status in real-time
        const actual = Number(next.actual_stock || 0);
        const system = Number(next.system_stock || 0);

        next.variance = actual - system;
        next.status = next.variance === 0 ? "matched" : "discrepancy";

        return next;
      })
    );
  };

  // Calculate variance and status for display
  const calculateVariance = (auditRow) => {
    const actual = Number(auditRow.actual_stock || 0);
    const system = Number(auditRow.system_stock || 0);
    return actual - system;
  };

  const getStatus = (auditRow) => {
    if (auditRow.actual_stock === null || auditRow.actual_stock === "") {
      return "pending";
    }
    const variance = calculateVariance(auditRow);
    return variance === 0 ? "matched" : "discrepancy";
  };

  const getVarianceColor = (variance) => {
    if (variance === 0) return "";
    return variance < 0 ? "negative" : "positive";
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "matched": return "matched";
      case "discrepancy": return "discrepancy";
      default: return "pending";
    }
  };

  const categories = useMemo(() => {
    const cats = [...new Set(items.map((i) => i.item?.category).filter(Boolean))];
    return cats.sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    let result = [...items];

    if (categoryFilter !== "all") {
      result = result.filter((r) => r.item?.category === categoryFilter);
    }

    if (statusFilter !== "all") {
      result = result.filter((r) => getStatus(r) === statusFilter);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (r) =>
          (r.item?.name || "").toLowerCase().includes(term) ||
          (r.item?.sku || "").toLowerCase().includes(term)
      );
    }

    return result;
  }, [items, categoryFilter, statusFilter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / itemsPerPage));
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredItems.slice(start, start + itemsPerPage);
  }, [filteredItems, currentPage, itemsPerPage]);

  const stats = useMemo(() => {
    const checked = filteredItems.filter((auditRow) => auditRow.actual_stock !== null && auditRow.actual_stock !== "").length;
    const matched = filteredItems.filter((auditRow) => getStatus(auditRow) === "matched").length;
    const discrepancy = filteredItems.filter((auditRow) => getStatus(auditRow) === "discrepancy").length;
    const totalVariance = filteredItems.reduce((sum, auditRow) => sum + calculateVariance(auditRow), 0);
    const completion = filteredItems.length > 0 ? (checked / filteredItems.length) * 100 : 0;

    return {
      total: filteredItems.length,
      checked,
      matched,
      discrepancy,
      totalVariance,
      completion: Math.round(completion),
    };
  }, [filteredItems]);

  const handleMarkVisibleMatched = useCallback(() => {
    const visibleIds = new Set(paginatedItems.map((r) => r.id));
    setItems((prev) =>
      prev.map((auditRow) => {
        if (!visibleIds.has(auditRow.id)) return auditRow;
        const system = Number(auditRow.system_stock || 0);
        return {
          ...auditRow,
          actual_stock: system,
          variance: 0,
          status: "matched",
        };
      })
    );
  }, [paginatedItems]);

  const handleClearVisible = useCallback(() => {
    const visibleIds = new Set(paginatedItems.map((r) => r.id));
    setItems((prev) =>
      prev.map((auditRow) => {
        if (!visibleIds.has(auditRow.id)) return auditRow;
        return {
          ...auditRow,
          actual_stock: "",
          variance: 0,
          status: "pending",
          reason: "",
        };
      })
    );
  }, [paginatedItems]);

  const jumpToUnchecked = useCallback(() => {
    const idx = filteredItems.findIndex((r) => r.actual_stock === "" || r.actual_stock === null);
    if (idx >= 0) {
      const page = Math.floor(idx / itemsPerPage) + 1;
      setCurrentPage(page);
    }
  }, [filteredItems, itemsPerPage]);

  const jumpToDiscrepancies = useCallback(() => {
    setStatusFilter("discrepancy");
  }, []);

  const handleSave = async () => {
    const checkedItems = items.filter((auditRow) => auditRow.actual_stock !== null && auditRow.actual_stock !== "");

    if (checkedItems.length === 0) {
      showAlert("Please enter actual stock for at least one item.");
      return;
    }

    const invalid = checkedItems.find(
      (auditRow) => auditRow.status === "discrepancy" && !auditRow.reason?.trim()
    );

    if (invalid) {
      showAlert(`Please add a reason for discrepancy: ${invalid.item?.name || 'Unknown item'}`);
      return;
    }

    try {
      setSaving(true);

      await inventoryApi.saveMonthlyAudit({
        audit_month: month,
        items: checkedItems.map((auditRow) => ({
          id: auditRow.id,
          inventory_item_id: auditRow.inventory_item_id,
          actual_stock: Number(auditRow.actual_stock),
          variance: auditRow.variance,
          status: auditRow.status,
          reason: auditRow.reason || "",
        })),
      });

      showSuccess("Monthly inventory audit saved successfully.");
      fetchAuditItems();
    } catch (err) {
      console.error("Failed to save monthly audit:", err);
      showError(err?.response?.data?.message || "Failed to save monthly audit.");
    } finally {
      setSaving(false);
    }
  };

  const handleExportCSV = () => {
    const checkedItems = items.filter((auditRow) => auditRow.actual_stock !== null && auditRow.actual_stock !== "");
    
    if (checkedItems.length === 0) {
      showAlert("No checked items to export.");
      return;
    }

    const csvData = checkedItems.map(auditRow => ({
      "Product Name": auditRow.item?.name || "Unknown",
      "SKU": auditRow.item?.sku || "N/A",
      "Category": auditRow.item?.category || "N/A",
      "Brand": auditRow.item?.brand || "N/A",
      "System Stock": Number(auditRow.system_stock || 0),
      "Actual Stock": Number(auditRow.actual_stock || 0),
      "Variance": Number(auditRow.variance || 0),
      "Status": auditRow.status,
      "Reason": auditRow.reason || "",
    }));

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `monthly_audit_${month}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    const checkedItems = items.filter((auditRow) => auditRow.actual_stock !== null && auditRow.actual_stock !== "");
    
    if (checkedItems.length === 0) {
      showAlert("No checked items to export.");
      return;
    }

    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(18);
    doc.text("Monthly Inventory Audit Report", 14, 22);
    
    // Add month info
    doc.setFontSize(12);
    doc.text(`Audit Month: ${month}`, 14, 32);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 40);
    
    // Add summary stats
    const checked = checkedItems.length;
    const matched = checkedItems.filter((auditRow) => calculateVariance(auditRow) === 0).length;
    const discrepancy = checkedItems.filter((auditRow) => calculateVariance(auditRow) !== 0).length;
    const totalVariance = checkedItems.reduce((sum, auditRow) => sum + calculateVariance(auditRow), 0);
    
    doc.text(`Total Items: ${checked}`, 14, 50);
    doc.text(`Matched: ${matched}`, 14, 58);
    doc.text(`Discrepancies: ${discrepancy}`, 14, 66);
    doc.text(`Total Variance: ${totalVariance}`, 14, 74);
    
    // Prepare table data
    const tableData = checkedItems.map(auditRow => [
      auditRow.item?.name || "Unknown",
      auditRow.item?.sku || "N/A",
      auditRow.item?.category || "N/A",
      auditRow.system_stock,
      auditRow.actual_stock || 0,
      calculateVariance(auditRow),
      getStatus(auditRow),
      auditRow.reason || ""
    ]);

    // Add table
    doc.autoTable({
      head: [["Product", "SKU", "Category", "System Stock", "Actual Stock", "Variance", "Status", "Reason"]],
      body: tableData,
      startY: 85,
      styles: { 
        fontSize: 10,
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [255, 95, 147],
        textColor: 255,
        fontStyle: 'bold'
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245]
      },
      columnStyles: {
        0: { cellWidth: 40 }, // Product
        1: { cellWidth: 20 }, // SKU
        2: { cellWidth: 25 }, // Category
        3: { cellWidth: 25, halign: 'center' }, // System Stock
        4: { cellWidth: 25, halign: 'center' }, // Actual Stock
        5: { cellWidth: 20, halign: 'center' }, // Variance
        6: { cellWidth: 20, halign: 'center' }, // Status
        7: { cellWidth: 35 }, // Reason
      }
    });

    doc.save(`monthly_audit_${month}.pdf`);
  };

  const handleExportExcel = () => {
    const checkedItems = items.filter((auditRow) => auditRow.actual_stock !== null && auditRow.actual_stock !== "");
    
    if (checkedItems.length === 0) {
      showAlert("No checked items to export.");
      return;
    }

    const wsData = checkedItems.map(auditRow => ({
      "Product Name": auditRow.item?.name || "Unknown",
      "SKU": auditRow.item?.sku || "N/A",
      "Category": auditRow.item?.category || "N/A",
      "Brand": auditRow.item?.brand || "N/A",
      "System Stock": Number(auditRow.system_stock || 0),
      "Actual Stock": Number(auditRow.actual_stock || 0),
      "Variance": Number(auditRow.variance || 0),
      "Status": auditRow.status,
      "Reason": auditRow.reason || ""
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "Monthly Audit");
    XLSX.writeFile(wb, `monthly_audit_${month}.xlsx`);
  };

  return (
    <div className="monthly-audit-page">
      <div className="monthly-audit-hero">
        <div>
          <h2>Monthly Inventory Audit</h2>
          <p>Compare system stock with physical stock count and record discrepancies.</p>
        </div>

        <div className="audit-month-control">
          <label>Audit Month</label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
      </div>

      {/* Progress Overview */}
      <div className="audit-progress-section">
        <div className="progress-header">
          <span className="progress-label">Audit Completion</span>
          <span className="progress-value">{stats.completion}% ({stats.checked} / {stats.total})</span>
        </div>
        <div className="progress-bar-bg">
          <div
            className="progress-bar-fill"
            style={{ width: `${stats.completion}%` }}
          />
        </div>
        <div className="progress-legend">
          <span><span className="dot green"/> Matched: {stats.matched}</span>
          <span><span className="dot red"/> Discrepancies: {stats.discrepancy}</span>
          <span><span className="dot gray"/> Pending: {stats.total - stats.checked}</span>
        </div>
      </div>

      {loading ? (
        <div className="audit-loading-card">
          <div className="spinner"></div>
          <p>Loading monthly audit...</p>
        </div>
      ) : (
        <div className="audit-table-card">
          <div className="audit-table-header">
            <div>
              <h3>Stock Count Sheet</h3>
              <p>Enter the actual physical count for each item.</p>
            </div>

            <div className="audit-header-actions">
              <button onClick={handleExportCSV} className="btn-export-csv">
                Export CSV
              </button>
              <button onClick={handleExportPDF} className="btn-export-pdf">
                Export PDF
              </button>
              <button onClick={handleExportExcel} className="btn-export-excel">
                Export Excel
              </button>
              <button onClick={handleSave} disabled={saving} className="btn-save-audit">
                {saving ? "Saving..." : "Save Monthly Audit"}
              </button>
            </div>
          </div>

          {/* Filters & Bulk Actions */}
          <div className="audit-toolbar">
            <div className="audit-filters">
              <div className="filter-group">
                <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                  <option value="all">All Categories</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div className="filter-group status-pills">
                {["all", "pending", "matched", "discrepancy"].map((s) => (
                  <button
                    key={s}
                    className={`status-pill ${statusFilter === s ? "active" : ""}`}
                    onClick={() => setStatusFilter(s)}
                  >
                    {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
              <div className="filter-right">
                <button className="btn-clear" onClick={() => { setCategoryFilter("all"); setStatusFilter("all"); setSearchTerm(""); }}>
                  Clear
                </button>
                <div className="filter-group search-group">
                  <input
                    type="text"
                    placeholder="Search by name or SKU..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="search-input"
                  />
                </div>
              </div>
            </div>

            <div className="audit-bulk-actions">
              <button className="btn-bulk" onClick={handleMarkVisibleMatched}>
                Mark Visible as Matched
              </button>
              <button className="btn-bulk btn-bulk-clear" onClick={handleClearVisible}>
                Clear Visible
              </button>
              <button className="btn-bulk" onClick={jumpToUnchecked}>
                Jump to Unchecked
              </button>
              <button className="btn-bulk btn-bulk-warn" onClick={jumpToDiscrepancies}>
                Jump to Discrepancies
              </button>
            </div>
          </div>

          <div className="audit-table-scroll">
            <table className="audit-table compact">
              <thead>
                <tr>
                  <th className="sticky-col">Product</th>
                  <th>SKU</th>
                  <th>Category</th>
                  <th className="numeric">System</th>
                  <th className="numeric">Actual</th>
                  <th className="numeric">Variance</th>
                  <th>Status</th>
                  <th>Reason</th>
                </tr>
              </thead>

              <tbody>
                {paginatedItems.map((auditRow) => {
                  const variance = calculateVariance(auditRow);
                  const status = getStatus(auditRow);
                  const varianceColorClass = getVarianceColor(variance);

                  return (
                    <tr key={auditRow.id} className={status === "discrepancy" ? "row-discrepancy" : ""}>
                      <td className="sticky-col">
                        <strong>{auditRow.item?.name || "Unknown"}</strong>
                        <small>{auditRow.item?.brand || "No brand"}</small>
                      </td>

                      <td>{auditRow.item?.sku || "N/A"}</td>
                      <td>{auditRow.item?.category || "N/A"}</td>
                      <td className="numeric">{auditRow.system_stock}</td>

                      <td className="numeric">
                        <input
                          type="number"
                          min="0"
                          value={auditRow.actual_stock || ""}
                          onChange={(e) =>
                            updateItem(auditRow.id, "actual_stock", e.target.value)
                          }
                          placeholder="Count"
                          className="audit-input audit-input-sm"
                        />
                      </td>

                      <td className={`numeric variance-cell ${varianceColorClass}`}>
                        {auditRow.actual_stock === null || auditRow.actual_stock === "" ? (
                          "-"
                        ) : variance === 0 ? (
                          <span className="variance-zero">0</span>
                        ) : (
                          <span className={`variance-badge ${variance > 0 ? "up" : "down"}`}>
                            {variance > 0 ? `+${variance}` : variance}
                          </span>
                        )}
                      </td>

                      <td>
                        <StatusDot status={status} />
                      </td>

                      <td>
                        <input
                          type="text"
                          value={auditRow.reason || ""}
                          onChange={(e) =>
                            updateItem(auditRow.id, "reason", e.target.value)
                          }
                          placeholder={
                            status === "discrepancy"
                              ? "Required reason"
                              : "Optional"
                          }
                          className={`audit-input audit-input-sm ${status === "discrepancy" && !auditRow.reason?.trim() ? "input-required" : ""}`}
                        />
                      </td>
                    </tr>
                  );
                })}

                {paginatedItems.length === 0 && (
                  <tr>
                    <td colSpan="8" className="audit-empty">
                      No inventory items found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="audit-pagination">
            <div className="pagination-info">
              Showing {filteredItems.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} -
              {Math.min(currentPage * itemsPerPage, filteredItems.length)} of {filteredItems.length}
            </div>
            <div className="pagination-controls">
              <button
                className="btn-page"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => p - 1)}
              >
                Prev
              </button>
              {(() => {
                const pages = [];
                const add = (n) => pages.push(n);
                const showFirst = currentPage > 3;
                const showLast = currentPage < totalPages - 2;
                const start = Math.max(2, currentPage - 1);
                const end = Math.min(totalPages - 1, currentPage + 1);

                add(1);
                if (showFirst && currentPage > 4) add("start-ellipsis");
                if (showFirst) { add(start); if (start + 1 <= end) add(start + 1); if (start + 2 <= end) add(start + 2); }
                else if (totalPages > 1) { add(2); if (totalPages > 2) add(3); }
                if (showLast && currentPage < totalPages - 3) add("end-ellipsis");
                if (showLast && totalPages > 1) add(totalPages);

                return pages.map((p, idx) =>
                  p === "start-ellipsis" || p === "end-ellipsis" ? (
                    <span key={p + idx} className="page-ellipsis">...</span>
                  ) : (
                    <button
                      key={p}
                      className={`btn-page ${p === currentPage ? "active" : ""}`}
                      onClick={() => setCurrentPage(p)}
                    >
                      {p}
                    </button>
                  )
                );
              })()}
              <button
                className="btn-page"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
            <div className="per-page-select">
              <select value={itemsPerPage} onChange={(e) => setItemsPerPage(Number(e.target.value))}>
                <option value={10}>10 / page</option>
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MonthlyInventoryAudit;
