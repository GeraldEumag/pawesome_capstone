import React, { useEffect, useMemo, useState } from "react";
import { inventoryApi } from "../../api/inventory";
import Papa from "papaparse";
import jsPDF from "jspdf";
import "jspdf-autotable";
import * as XLSX from "xlsx";
import "./MonthlyInventoryAudit.css";
import { showAlert, showSuccess, showError } from "../../utils/alert";

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

  const fetchAuditItems = async () => {
    try {
      setLoading(true);
      console.log("🔍 DEBUG: Fetching real audit items for month:", month);
      console.log("🔍 DEBUG: API endpoint: /inventory/monthly-audit?month=" + month);
      
      // Use real backend API to get inventory items
      const res = await inventoryApi.getOrCreateMonthlyAudit(month);
      console.log("🔍 DEBUG: Full API Response:", res);
      console.log("🔍 DEBUG: Response type:", typeof res);
      console.log("🔍 DEBUG: Response keys:", Object.keys(res || {}));
      
      let auditRows = [];
      if (res && res.audits) {
        auditRows = res.audits;
      } else if (res && res.items) {
        auditRows = res.items;
      } else if (res && Array.isArray(res)) {
        auditRows = res;
      } else {
        console.warn("🔍 DEBUG: Unexpected response structure:", res);
      }
      auditRows = auditRows.map(normalizeAuditRow);
      
      console.log("🔍 DEBUG: Raw audit rows:", auditRows);
      console.log("🔍 DEBUG: Number of audit rows:", auditRows.length);
      
      // Debug first item structure
      if (auditRows.length > 0) {
        console.log("🔍 DEBUG: First audit row structure:", auditRows[0]);
        console.log("🔍 DEBUG: First audit row keys:", Object.keys(auditRows[0]));
        console.log("🔍 DEBUG: First item structure:", auditRows[0].item);
        if (auditRows[0].item) {
          console.log("🔍 DEBUG: First item keys:", Object.keys(auditRows[0].item));
        }
      }
      
      // Filter out service items - only include physical inventory items
      const physicalAuditRows = auditRows.filter((auditRow) => {
        if (!auditRow || !auditRow.item) {
          console.warn("🔍 DEBUG: Skipping audit row without item:", auditRow);
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
          console.log("🔍 DEBUG: Filtering out service item:", auditRow.item.name);
        }
        
        return isPhysical;
      });
      
      console.log("🔍 DEBUG: Physical audit rows after filtering:", physicalAuditRows);
      console.log("🔍 DEBUG: Number of physical audit rows:", physicalAuditRows.length);
      
      // If no items, try to get all inventory items directly
      if (physicalAuditRows.length === 0) {
        console.log("🔍 DEBUG: No physical items found, trying to fetch all inventory items...");
        try {
          const inventoryRes = await inventoryApi.getItems();
          console.log("🔍 DEBUG: All inventory items:", inventoryRes);
          const fallbackRows = inventoryRes.items || inventoryRes.data || [];
          setItems(fallbackRows.map(normalizeAuditRow));
        } catch (inventoryErr) {
          console.error("🔍 DEBUG: Failed to fetch all inventory items:", inventoryErr);
        }
      } else {
        setItems(physicalAuditRows);
      }
    } catch (err) {
      console.error("🔍 DEBUG: Failed to load monthly audit:", err);
      console.error("🔍 DEBUG: Error details:", err.response?.data || err.message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditItems();
  }, [month]);

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

  const stats = useMemo(() => {
    const checked = items.filter((auditRow) => auditRow.actual_stock !== null && auditRow.actual_stock !== "").length;
    const matched = items.filter((auditRow) => getStatus(auditRow) === "matched").length;
    const discrepancy = items.filter((auditRow) => getStatus(auditRow) === "discrepancy").length;
    const totalVariance = items.reduce((sum, auditRow) => sum + calculateVariance(auditRow), 0);

    return {
      total: items.length,
      checked,
      matched,
      discrepancy,
      totalVariance,
    };
  }, [items]);

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

      {/* ENHANCED DEBUG INFO */}
      <div style={{background: '#f0f0f0', padding: '15px', margin: '10px 0', borderRadius: '5px', fontSize: '12px'}}>
        <strong>🔍 ENHANCED DEBUG INFO:</strong><br/>
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px'}}>
          <div>
            <strong>Loading:</strong> {loading ? 'YES' : 'NO'}<br/>
            <strong>Items Count:</strong> {items.length}<br/>
            <strong>Month:</strong> {month}<br/>
            <strong>API Endpoint:</strong> /inventory/monthly-audit?month={month}
          </div>
          <div>
            <strong>First Item Name:</strong> {items.length > 0 ? (items[0]?.item?.name || items[0]?.name || 'No name') : 'No items'}<br/>
            <strong>First Item ID:</strong> {items.length > 0 ? (items[0]?.id || 'No ID') : 'No items'}<br/>
            <strong>Has Item Relation:</strong> {items.length > 0 ? (items[0]?.item ? 'YES' : 'NO') : 'N/A'}<br/>
            <strong>System Stock:</strong> {items.length > 0 ? (items[0]?.system_stock || 'N/A') : 'N/A'}
          </div>
        </div>
        
        <div style={{marginTop: '10px', display: 'flex', gap: '5px', flexWrap: 'wrap'}}>
          <button 
            onClick={() => fetchAuditItems()}
            style={{background: '#007bff', color: 'white', padding: '5px 10px', border: 'none', borderRadius: '3px', fontSize: '11px'}}
          >
            🔄 Test API Call
          </button>
          <button 
            onClick={() => console.log('🔍 DEBUG: Current items state:', items)}
            style={{background: '#28a745', color: 'white', padding: '5px 10px', border: 'none', borderRadius: '3px', fontSize: '11px'}}
          >
            📋 Log Items State
          </button>
          <button 
            onClick={() => window.open('/api/inventory/monthly-audit?month=' + month, '_blank')}
            style={{background: '#ffc107', color: 'black', padding: '5px 10px', border: 'none', borderRadius: '3px', fontSize: '11px'}}
          >
            🌐 Test API in Browser
          </button>
        </div>
        
        {items.length === 0 && (
          <div style={{marginTop: '10px', padding: '10px', background: '#fff3cd', border: '1px solid #ffeaa7', borderRadius: '3px'}}>
            <strong>⚠️ NO ITEMS FOUND - Possible Issues:</strong><br/>
            1. Backend API not implemented<br/>
            2. Database has no inventory items<br/>
            3. API endpoint returns wrong structure<br/>
            4. CORS or authentication issues<br/>
            5. Server not running
          </div>
        )}
      </div>

      <div className="audit-stats-grid">
        <div className="audit-stat-card">
          <span>Total Items</span>
          <strong>{stats.total}</strong>
        </div>

        <div className="audit-stat-card">
          <span>Checked</span>
          <strong>{stats.checked}</strong>
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
          <span>Total Variance</span>
          <strong>{stats.totalVariance}</strong>
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
                📥 Export CSV
              </button>
              <button onClick={handleExportPDF} className="btn-export-pdf">
                📄 Export PDF
              </button>
              <button onClick={handleExportExcel} className="btn-export-excel">
                📊 Export Excel
              </button>
              <button onClick={handleSave} disabled={saving} className="btn-save-audit">
                {saving ? "Saving..." : "Save Monthly Audit"}
              </button>
            </div>
          </div>

          {/* Audit Summary Stats */}
          <div className="audit-summary-stats">
            <div className="summary-stat">
              <span className="stat-label">Total Items</span>
              <span className="stat-value">{stats.total}</span>
            </div>
            <div className="summary-stat">
              <span className="stat-label">Checked</span>
              <span className="stat-value">{stats.checked}</span>
            </div>
            <div className="summary-stat good">
              <span className="stat-label">Matched</span>
              <span className="stat-value">{stats.matched}</span>
            </div>
            <div className="summary-stat warning">
              <span className="stat-label">Discrepancies</span>
              <span className="stat-value">{stats.discrepancy}</span>
            </div>
            <div className="summary-stat">
              <span className="stat-label">Total Variance</span>
              <span className="stat-value">{stats.totalVariance}</span>
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
                {items.map((auditRow) => {
                  const variance = calculateVariance(auditRow);
                  const status = getStatus(auditRow);
                  const varianceColorClass = getVarianceColor(variance);
                  const statusColorClass = getStatusColor(status);
                  
                  return (
                    <tr key={auditRow.id}>
                      <td>
                        <strong>{auditRow.item?.name || "Unknown"}</strong>
                        <small>{auditRow.item?.brand || "No brand"}</small>
                      </td>

                      <td>{auditRow.item?.sku || "N/A"}</td>
                      <td>{auditRow.item?.category || "N/A"}</td>
                      <td>{auditRow.system_stock}</td>

                      <td>
                        <input
                          type="number"
                          min="0"
                          value={auditRow.actual_stock || ""}
                          onChange={(e) =>
                            updateItem(auditRow.id, "actual_stock", e.target.value)
                          }
                          placeholder="Count"
                          className="audit-input"
                        />
                      </td>

                      <td className={`variance-cell ${varianceColorClass}`}>
                        {auditRow.actual_stock === null || auditRow.actual_stock === "" ? "-" : variance}
                      </td>

                      <td>
                        <span className={`audit-status ${statusColorClass}`}>
                          {status}
                        </span>
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
                          className="audit-input"
                        />
                      </td>
                    </tr>
                  );
                })}

                {items.length === 0 && (
                  <tr>
                    <td colSpan="8" className="audit-empty">
                      No inventory items found.
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

export default MonthlyInventoryAudit;
