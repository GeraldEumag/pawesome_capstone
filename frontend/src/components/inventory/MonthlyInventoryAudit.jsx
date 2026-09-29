import React, { useEffect, useMemo, useState, useCallback } from "react";
import { inventoryApi } from "../../api/inventory.jsx";
import { exportFormalReportPDF } from "../../utils/formalReportPdf";
import { getRole, getUserData } from "../../utils/auth";
import { exportToCSV, exportToExcel } from "../../utils/reportExport";
import { STORE_INFO } from "../../utils/storeInfo";
import "./MonthlyInventoryAudit.css";
import { showAlert, showSuccess, showError } from "../../utils/alert.jsx";
import StatusDot from "../shared/StatusDot";

const auditExportColumns = [
  { key: "product_name", label: "Product Name" },
  { key: "sku", label: "SKU" },
  { key: "category", label: "Category" },
  { key: "brand", label: "Brand" },
  { key: "system_stock", label: "System Stock" },
  { key: "actual_stock", label: "Actual Stock" },
  { key: "variance", label: "Variance" },
  { key: "unit_cost", label: "Unit Cost", format: "currency" },
  { key: "variance_value", label: "Estimated Variance Value", format: "currency" },
  { key: "status", label: "Status" },
  { key: "reason", label: "Reason" },
];

const auditExportRows = (rows) => rows.map((auditRow) => {
  const unitCost = Number(auditRow.unit_cost ?? auditRow.item?.cost ?? 0);
  const variance = Number(auditRow.variance || 0);
  return {
    product_name: auditRow.item?.name || "Unknown",
    sku: auditRow.item?.sku || "N/A",
    category: auditRow.item?.category || "N/A",
    brand: auditRow.item?.brand || "N/A",
    system_stock: Number(auditRow.system_stock || 0),
    actual_stock: Number(auditRow.actual_stock || 0),
    variance,
    unit_cost: unitCost,
    variance_value: variance * unitCost,
    status: auditRow.status || "",
    reason: auditRow.reason || "",
  };
});

const getCurrentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const DISCREPANCY_REASONS = [
  "Damage / Spoilage",
  "Expired Stock",
  "Theft / Shrinkage",
  "Counting Error",
  "Receiving Error (supplier short-shipped)",
  "Unrecorded Stock Transfer",
  "Unrecorded Sale",
  "Return Not Processed",
  "Sample / Demo Usage",
];

const getStockValue = (row) =>
  Number(row.system_stock ?? row.quantity ?? row.stock ?? row.item?.quantity ?? row.item?.stock ?? 0);

const normalizeAuditRow = (row) => {
  const item = row.item || {
    id: row.inventory_item_id || row.id,
    name: row.name,
    sku: row.sku,
    category: row.category,
    brand: row.brand,
    cost: row.cost ?? row.unit_cost ?? 0,
    price: row.price ?? row.unit_price ?? 0,
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

    const csvData = auditExportRows(checkedItems);
    exportToCSV(csvData, auditExportColumns, `${STORE_INFO.name.replace(/\s+/g, "-")}-monthly-audit-${month}`, {
      title: "Monthly Inventory Audit",
      periodLabel: month,
    });
  };

  const handleExportPDF = () => {
    const checkedItems = items.filter((auditRow) => auditRow.actual_stock !== null && auditRow.actual_stock !== "");
    if (checkedItems.length === 0) {
      showAlert("No checked items to export.");
      return;
    }

    const currency = (value) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value || 0);
    const unitCost = (row) => Number(row.unit_cost ?? row.item?.cost ?? 0);
    const varianceValue = (row) => calculateVariance(row) * unitCost(row);
    const matched = checkedItems.filter((row) => calculateVariance(row) === 0).length;
    const discrepancies = checkedItems.filter((row) => calculateVariance(row) !== 0);
    const netVariance = checkedItems.reduce((sum, row) => sum + calculateVariance(row), 0);
    const netVarianceValue = checkedItems.reduce((sum, row) => sum + varianceValue(row), 0);
    const shortageValue = discrepancies.reduce((sum, row) => sum + Math.max(0, -varianceValue(row)), 0);
    const largestVariance = [...discrepancies].sort((a, b) => Math.abs(varianceValue(b)) - Math.abs(varianceValue(a)))[0];
    const byReason = new Map();
    discrepancies.forEach((row) => {
      const reason = row.reason || "Reason not recorded";
      const current = byReason.get(reason) || { reason, items: 0, units: 0, value: 0 };
      current.items += 1;
      current.units += calculateVariance(row);
      current.value += varianceValue(row);
      byReason.set(reason, current);
    });

    const findings = [];
    if (discrepancies.length) {
      findings.push(`${discrepancies.length} of ${checkedItems.length} counted items (${((discrepancies.length / checkedItems.length) * 100).toFixed(1)}%) have stock variances. The estimated net book value of those variances is ${currency(netVarianceValue)}; estimated shortage value is ${currency(shortageValue)}.`);
      if (largestVariance) {
        findings.push(`Largest valued variance: ${largestVariance.item?.name || "Unknown item"}, ${calculateVariance(largestVariance) > 0 ? "+" : ""}${calculateVariance(largestVariance)} unit(s), estimated at ${currency(varianceValue(largestVariance))}; recorded reason: ${largestVariance.reason || "not recorded"}.`);
      }
    } else {
      findings.push(`All ${matched} counted item(s) reconciled to the system quantity. ${items.length - checkedItems.length} item(s) were not counted and are excluded from the detailed schedule.`);
    }

    const recommendationByReason = {
      "Damage / Spoilage": "Review handling, storage conditions, and write-off controls for damaged or spoiled products.",
      "Expired Stock": "Reinforce expiry-date monitoring and FIFO/FEFO rotation; document all disposals.",
      "Theft / Shrinkage": "Review access controls, secure storage, and transaction logs for the affected items.",
      "Counting Error": "Require an independent recount and use a documented two-person count for high-value items.",
      "Receiving Error (supplier short-shipped)": "Reconcile receiving records against supplier invoices and delivery acknowledgments.",
      "Unrecorded Stock Transfer": "Require transfers to be recorded and acknowledged by both sending and receiving locations.",
      "Unrecorded Sale": "Reconcile point-of-sale transactions with inventory movements for the audit period.",
      "Return Not Processed": "Review return authorization and restocking procedures and close pending returns promptly.",
      "Sample / Demo Usage": "Record samples and demonstrations using an approved issue or consumption transaction.",
    };
    const recommendations = [...new Set(discrepancies.map((row) => recommendationByReason[row.reason]).filter(Boolean))];
    if (discrepancies.length) recommendations.push("Assign an owner and target date for each unresolved discrepancy; retain recount and adjustment evidence with this report.");

    const auditorName = checkedItems.find((row) => row.checked_by)?.checked_by || getUserData().name || "Authorized Staff";
    const auditorRole = getRole() || "Inventory Auditor";
    const totalCount = items.length;
    const completion = totalCount ? `${checkedItems.length} / ${totalCount} (${Math.round((checkedItems.length / totalCount) * 100)}%)` : `${checkedItems.length}`;

    exportFormalReportPDF({
      docRef: `MIA-${month}`,
      title: "Monthly Inventory Audit Report",
      subtitle: "Physical Stock Count Reconciliation and Variance Assessment",
      periodLabel: month,
      orientation: "landscape",
      infoFields: [
        { label: "Items Counted", value: completion },
        { label: "Audit Status", value: checkedItems.length === totalCount ? "Complete" : "In Progress" },
        { label: "Counted By", value: auditorName },
        { label: "Valuation Basis", value: "Current item unit cost; estimates only" },
      ],
      summaryCards: [
        { label: "Items Audited", value: `${checkedItems.length} / ${totalCount}` },
        { label: "Matched", value: `${matched} (${checkedItems.length ? ((matched / checkedItems.length) * 100).toFixed(1) : "0.0"}%)` },
        { label: "Discrepancies", value: discrepancies.length },
        { label: "Net Variance", value: `${netVariance > 0 ? "+" : ""}${netVariance} units` },
        { label: "Variance Value", value: currency(netVarianceValue), sub: "Net estimated book value" },
      ],
      analysis: {
        title: "Discrepancies by Reason",
        columns: [
          { header: "Reason", key: "reason" },
          { header: "Items", key: "items", align: "right" },
          { header: "Net Units", key: "units", align: "right" },
          { header: "Estimated Value", key: "value", align: "right", format: currency },
        ],
        rows: [...byReason.values()],
      },
      table: {
        title: "Detailed Stock Reconciliation",
        fontSize: 6.2,
        columns: [
          { header: "Product", value: (row) => row.item?.name || "Unknown" },
          { header: "SKU", value: (row) => row.item?.sku || "N/A" },
          { header: "Category", value: (row) => row.item?.category || "N/A" },
          { header: "System", key: "system_stock", align: "right" },
          { header: "Actual", key: "actual_stock", align: "right" },
          { header: "Variance", value: (row) => `${calculateVariance(row) > 0 ? "+" : ""}${calculateVariance(row)}`, align: "right" },
          { header: "Unit Cost", value: (row) => currency(unitCost(row)), align: "right" },
          { header: "Variance Value", value: (row) => currency(varianceValue(row)), align: "right" },
          { header: "Status", value: (row) => getStatus(row) },
          { header: "Reason", value: (row) => row.reason || "—" },
        ],
        rows: checkedItems,
        foot: ["TOTAL", "", "", "", "", `${netVariance > 0 ? "+" : ""}${netVariance}`, "", currency(netVarianceValue), "", ""],
        didParseCell: (hook) => {
          if (hook.section === "body" && discrepancies.includes(checkedItems[hook.row.index])) {
            hook.cell.styles.fillColor = [255, 244, 244];
          }
        },
      },
      findings,
      recommendations,
      certification: "I certify that the physical counts shown were recorded for the items and period stated. Variance values are estimates based on current item cost and do not replace approval of inventory adjustments or supporting documentation.",
      signatures: [
        { role: "Prepared by", name: auditorName, caption: auditorRole },
        { role: "Reviewed by", name: "", caption: "Inventory Supervisor" },
        { role: "Noted by", name: "", caption: "Store Manager" },
      ],
      filename: `${STORE_INFO.name.replace(/\s+/g, "-")}-monthly-audit-${month}`,
    });
  };

  const handleExportExcel = () => {
    const checkedItems = items.filter((auditRow) => auditRow.actual_stock !== null && auditRow.actual_stock !== "");
    
    if (checkedItems.length === 0) {
      showAlert("No checked items to export.");
      return;
    }

    const excelData = auditExportRows(checkedItems);
    exportToExcel(excelData, auditExportColumns, `${STORE_INFO.name.replace(/\s+/g, "-")}-monthly-audit-${month}`, {
      title: "Monthly Inventory Audit",
      periodLabel: month,
      sheetName: "Monthly Audit",
    });
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
                        <select
                          value={auditRow.reason || ""}
                          onChange={(e) =>
                            updateItem(auditRow.id, "reason", e.target.value)
                          }
                          className={`audit-input audit-input-sm ${status === "discrepancy" && !auditRow.reason?.trim() ? "input-required" : ""}`}
                        >
                          <option value="">
                            {status === "discrepancy" ? "— Required —" : "— Select —"}
                          </option>
                          {DISCREPANCY_REASONS.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
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
