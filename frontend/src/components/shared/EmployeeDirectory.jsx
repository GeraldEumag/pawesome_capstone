import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBarcode,
  faCheckCircle,
  faIdBadge,
  faPen,
  faPlus,
  faRotateRight,
  faSpinner,
  faTriangleExclamation,
  faUserCheck,
  faUsers,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import { formatCurrency } from "../../utils/currency";
import StandardTable from "../shared/StandardTable";
import "./EmployeeDirectory.css";

/* ── Code 39 barcode (pure SVG, no dependency) ──────────────────────────── */

const CODE39 = {
  "0": "nnnwwnwnn", "1": "wnnwnnnnw", "2": "nnwwnnnnw", "3": "wnwwnnnnn",
  "4": "nnnwwnnnw", "5": "wnnwwnnnn", "6": "nnwwwnnnn", "7": "nnnwnnwnw",
  "8": "wnnwnnwnn", "9": "nnwwnnwnn", "A": "wnnnnwnnw", "B": "nnwnnwnnw",
  "C": "wnwnnwnnn", "D": "nnnnwwnnw", "E": "wnnnwwnnn", "F": "nnwnwwnnn",
  "G": "nnnnnwwnw", "H": "wnnnnwwnn", "I": "nnwnnwwnn", "J": "nnnnwwwnn",
  "K": "wnnnnnnww", "L": "nnwnnnnww", "M": "wnwnnnnwn", "N": "nnnnwnnww",
  "O": "wnnnwnnwn", "P": "nnwnwnnwn", "Q": "nnnnnnwww", "R": "wnnnnnwwn",
  "S": "nnwnnnwwn", "T": "nnnnwnwwn", "U": "wwnnnnnnw", "V": "nwwnnnnnw",
  "W": "wwwnnnnnn", "X": "nwnnwnnnw", "Y": "wwnnwnnnn", "Z": "nwwnwnnnn",
  "-": "nwnnnnwnw", ".": "wwnnnnwnn", " ": "nwwnnnwnn", "$": "nwnwnwnnn",
  "/": "nwnwnnnwn", "+": "nwnnnwnwn", "%": "nnnwnwnwn", "*": "nwnnwnwnn",
};

const NARROW = 1.6;
const WIDE = NARROW * 3;
const CHAR_GAP = NARROW;
const BAR_HEIGHT = 46;

const Code39Barcode = ({ value }) => {
  const chars = `*${String(value).toUpperCase()}*`
    .split("")
    .filter((c) => CODE39[c]);

  const bars = [];
  let x = 0;
  chars.forEach((ch, ci) => {
    CODE39[ch].split("").forEach((el, i) => {
      const w = el === "w" ? WIDE : NARROW;
      if (i % 2 === 0) bars.push({ x, w, key: `${ci}-${i}` }); // even = bar, odd = space
      x += w;
    });
    x += CHAR_GAP;
  });

  return (
    <svg
      className="ed-barcode"
      viewBox={`0 0 ${x} ${BAR_HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Barcode ${value}`}
    >
      {bars.map((b) => (
        <rect key={b.key} x={b.x} y="0" width={b.w} height={BAR_HEIGHT} />
      ))}
    </svg>
  );
};

/* ── Helpers ────────────────────────────────────────────────────────────── */

const fmtLabel = (v) =>
  String(v || "N/A").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const fmtDate = (v) => {
  if (!v) return "N/A";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? String(v)
    : d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" });
};

const EMPTY_FORM = {
  first_name: "",
  middle_name: "",
  last_name: "",
  suffix: "",
  birthdate: "",
  gender: "",
  civil_status: "",
  phone: "",
  email: "",
  address: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  position: "",
  department: "",
  hire_date: "",
  employment_status: "probationary",
  employment_type: "full_time",
  is_active: true,
  base_salary: "",
  hourly_rate: "",
  sss_no: "",
  philhealth_no: "",
  pagibig_no: "",
  tin_no: "",
};

const FORM_SECTIONS = [
  {
    title: "Personal Information",
    fields: [
      ["first_name", "First Name", { required: true }],
      ["last_name", "Last Name", { required: true }],
      ["middle_name", "Middle Name"],
      ["suffix", "Suffix"],
      ["birthdate", "Birthdate", { type: "date" }],
      ["gender", "Gender", {
        type: "select",
        options: ["", "male", "female", "other"],
      }],
      ["civil_status", "Civil Status", {
        type: "select",
        options: ["", "single", "married", "widowed", "separated"],
      }],
    ],
  },
  {
    title: "Contact & Emergency",
    fields: [
      ["phone", "Phone"],
      ["email", "Email", { type: "email" }],
      ["address", "Address"],
      ["emergency_contact_name", "Emergency Contact"],
      ["emergency_contact_phone", "Emergency Phone"],
    ],
  },
  {
    title: "Employment",
    fields: [
      ["position", "Position"],
      ["department", "Department"],
      ["hire_date", "Hire Date", { type: "date" }],
      ["employment_status", "Employment Status", {
        type: "select",
        options: ["probationary", "regular", "contractual", "resigned", "terminated"],
      }],
      ["employment_type", "Employment Type", {
        type: "select",
        options: ["full_time", "part_time", "contract", "casual"],
      }],
      ["is_active", "Active", { type: "checkbox" }],
    ],
  },
  {
    title: "Payroll & Government IDs",
    fields: [
      ["base_salary", "Base Salary (Monthly)", { type: "number", step: "0.01" }],
      ["hourly_rate", "Hourly Rate", { type: "number", step: "0.01" }],
      ["sss_no", "SSS Number"],
      ["philhealth_no", "PhilHealth Number"],
      ["pagibig_no", "Pag-IBIG Number"],
      ["tin_no", "TIN"],
    ],
  },
];

/* ── Component ──────────────────────────────────────────────────────────── */

const EmployeeDirectory = ({
  roleAccent = "#7c3aed",
  roleLabel = "Manager — Staff Records",
  endpoint = "/manager/employees",
}) => {
  const [employees, setEmployees] = useState([]);
  const [summary, setSummary] = useState({ total: 0, active: 0, departments: [] });
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);

  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [detail, setDetail] = useState(null);

  const fetchEmployees = useCallback(
    async ({ silent = false } = {}) => {
      try {
        if (silent) setRefreshing(true);
        else setLoading(true);
        setError("");

        const params = new URLSearchParams({ page, per_page: 50 });
        if (searchTerm) params.append("search", searchTerm);
        if (departmentFilter !== "all") params.append("department", departmentFilter);
        if (statusFilter !== "all") params.append("status", statusFilter);

        const res = await apiRequest(`${endpoint}?${params}`);
        setEmployees(Array.isArray(res?.data) ? res.data : []);
        setMeta(res?.meta || null);
        setSummary(res?.summary || { total: 0, active: 0, departments: [] });
      } catch (err) {
        setError(err.message || "Failed to load employees.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [endpoint, page, searchTerm, departmentFilter, statusFilter]
  );

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchTerm(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3200);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setShowForm(true);
  };

  const openEdit = (emp) => {
    setEditing(emp);
    setForm({
      ...EMPTY_FORM,
      ...Object.fromEntries(
        Object.keys(EMPTY_FORM).map((k) => [k, emp[k] ?? EMPTY_FORM[k]])
      ),
      is_active: emp.is_active,
    });
    setFormError("");
    setShowForm(true);
  };

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const submitForm = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setFormError("First name and last name are required.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const payload = { ...form };
      Object.keys(payload).forEach((k) => {
        if (payload[k] === "") payload[k] = null;
      });
      payload.is_active = !!payload.is_active;

      if (editing) {
        await apiRequest(`${endpoint}/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        showToast("success", "Employee updated.");
      } else {
        await apiRequest(endpoint, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        showToast("success", "Employee created.");
      }
      setShowForm(false);
      fetchEmployees({ silent: true });
    } catch (err) {
      setFormError(err.message || "Failed to save employee.");
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo(
    () => [
      {
        key: "employee_no",
        label: "Employee No.",
        render: (value) => <span className="ed-emp-no">{value}</span>,
      },
      {
        key: "name",
        label: "Employee",
        render: (value, record) => (
          <div className="ed-name-cell">
            <span className="ed-avatar">{String(value || "?").charAt(0)}</span>
            <div>
              <strong>{value}</strong>
              <small>{record.email || record.phone || "No contact"}</small>
            </div>
          </div>
        ),
      },
      { key: "position", label: "Position" },
      { key: "department", label: "Department", render: (v) => v || "Unassigned" },
      {
        key: "employment_status",
        label: "Employment",
        render: (v) => <span className="ed-chip">{fmtLabel(v)}</span>,
      },
      {
        key: "base_salary",
        label: "Salary",
        render: (v) => formatCurrency(v || 0),
      },
      {
        key: "gov_ids",
        label: "Gov IDs",
        render: (_v, r) => {
          const filled = [r.sss_no, r.philhealth_no, r.pagibig_no, r.tin_no].filter(Boolean).length;
          return <span className={`ed-ids ${filled === 4 ? "complete" : ""}`}>{filled}/4</span>;
        },
      },
      {
        key: "is_active",
        label: "Status",
        render: (v) => (
          <span className={`ed-status ${v ? "active" : "inactive"}`}>
            {v ? "Active" : "Inactive"}
          </span>
        ),
      },
      {
        key: "actions",
        label: "Actions",
        render: (_v, r) => (
          <div className="ed-row-actions">
            <button type="button" title="View" onClick={() => setDetail(r)}>
              <FontAwesomeIcon icon={faBarcode} />
            </button>
            <button type="button" title="Edit" onClick={() => openEdit(r)}>
              <FontAwesomeIcon icon={faPen} />
            </button>
          </div>
        ),
      },
    ],
    []
  );

  return (
    <div className="ed-root" style={{ "--ed-accent": roleAccent }}>
      {/* Header */}
      <div className="ed-header">
        <div>
          <span className="ed-kicker">{roleLabel}</span>
          <h2 className="ed-title">Employee Directory</h2>
          <p className="ed-subtitle">
            Staff records for employees without login accounts — employment details,
            government IDs, and kiosk barcode numbers.
          </p>
        </div>
        <div className="ed-header-actions">
          <button
            type="button"
            className="ed-btn ed-btn-secondary"
            onClick={() => fetchEmployees({ silent: true })}
            disabled={refreshing}
          >
            <FontAwesomeIcon icon={faRotateRight} spin={refreshing} />
            Refresh
          </button>
          <button type="button" className="ed-btn ed-btn-primary" onClick={openCreate}>
            <FontAwesomeIcon icon={faPlus} />
            Add Employee
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="ed-stats">
        <div className="ed-stat-card">
          <span className="ed-stat-icon"><FontAwesomeIcon icon={faUsers} /></span>
          <div><strong>{summary.total}</strong><span>Total Employees</span></div>
        </div>
        <div className="ed-stat-card">
          <span className="ed-stat-icon"><FontAwesomeIcon icon={faUserCheck} /></span>
          <div><strong>{summary.active}</strong><span>Active</span></div>
        </div>
        <div className="ed-stat-card">
          <span className="ed-stat-icon"><FontAwesomeIcon icon={faIdBadge} /></span>
          <div><strong>{(summary.departments || []).length}</strong><span>Departments</span></div>
        </div>
      </div>

      {/* Filters */}
      <div className="ed-filters">
        <div className="ed-search">
          <input
            type="text"
            placeholder="Search name, employee no, position..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          {searchInput && (
            <button type="button" onClick={() => setSearchInput("")}>
              <FontAwesomeIcon icon={faXmark} />
            </button>
          )}
        </div>
        <select
          className="ed-select"
          value={departmentFilter}
          onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1); }}
        >
          <option value="all">All Departments</option>
          {(summary.departments || []).map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select
          className="ed-select"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Table */}
      {error ? (
        <div className="ed-alert error">
          <FontAwesomeIcon icon={faTriangleExclamation} />
          <span>{error}</span>
          <button type="button" onClick={() => fetchEmployees()}>Retry</button>
        </div>
      ) : loading ? (
        <div className="ed-loading">
          <FontAwesomeIcon icon={faSpinner} spin />
          <p>Loading employees...</p>
        </div>
      ) : (
        <StandardTable
          columns={columns}
          data={employees}
          emptyMessage="No employee records found. Add your first staff member."
          pageSize={10}
        />
      )}

      {meta && meta.last_page > 1 && (
        <div className="ed-pagination">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            ‹ Prev
          </button>
          <span>Page {meta.current_page} of {meta.last_page}</span>
          <button
            type="button"
            disabled={page >= meta.last_page}
            onClick={() => setPage((p) => p + 1)}
          >
            Next ›
          </button>
        </div>
      )}

      {/* Add / Edit modal */}
      {showForm && (
        <div className="ed-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="ed-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ed-modal-header">
              <div>
                <span className="ed-kicker">{editing ? editing.employee_no : "New Record"}</span>
                <h3>{editing ? `Edit ${editing.name}` : "Add Employee"}</h3>
              </div>
              <button type="button" className="ed-modal-close" onClick={() => setShowForm(false)}>
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            <div className="ed-modal-body">
              {formError && (
                <div className="ed-alert error"><span>{formError}</span></div>
              )}
              {FORM_SECTIONS.map((section) => (
                <fieldset key={section.title} className="ed-form-section">
                  <legend>{section.title}</legend>
                  <div className="ed-form-grid">
                    {section.fields.map(([key, label, opts = {}]) => (
                      <label key={key} className={`ed-field ${opts.type === "checkbox" ? "checkbox" : ""}`}>
                        <span>
                          {label}
                          {opts.required && <em>*</em>}
                        </span>
                        {opts.type === "select" ? (
                          <select
                            value={form[key] ?? ""}
                            onChange={(e) => setField(key, e.target.value)}
                          >
                            {(opts.options || []).map((opt) => (
                              <option key={opt} value={opt}>
                                {opt === "" ? "—" : fmtLabel(opt)}
                              </option>
                            ))}
                          </select>
                        ) : opts.type === "checkbox" ? (
                          <input
                            type="checkbox"
                            checked={!!form[key]}
                            onChange={(e) => setField(key, e.target.checked)}
                          />
                        ) : (
                          <input
                            type={opts.type || "text"}
                            step={opts.step}
                            value={form[key] ?? ""}
                            onChange={(e) => setField(key, e.target.value)}
                          />
                        )}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>

            <div className="ed-modal-footer">
              <button type="button" className="ed-btn ed-btn-secondary" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button type="button" className="ed-btn ed-btn-primary" onClick={submitForm} disabled={saving}>
                <FontAwesomeIcon icon={saving ? faSpinner : faCheckCircle} spin={saving} />
                {editing ? "Save Changes" : "Create Employee"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail / barcode modal */}
      {detail && (
        <div className="ed-modal-overlay" onClick={() => setDetail(null)}>
          <div className="ed-modal ed-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ed-modal-header">
              <div>
                <span className="ed-kicker">{detail.employee_no}</span>
                <h3>{detail.name}</h3>
              </div>
              <button type="button" className="ed-modal-close" onClick={() => setDetail(null)}>
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>
            <div className="ed-modal-body">
              <div className="ed-id-card">
                <Code39Barcode value={detail.employee_no} />
                <strong>{detail.employee_no}</strong>
                <span>Scan at the attendance kiosk</span>
              </div>
              <div className="ed-detail-grid">
                {[
                  ["Position", detail.position],
                  ["Department", detail.department],
                  ["Employment", `${fmtLabel(detail.employment_status)} · ${fmtLabel(detail.employment_type)}`],
                  ["Hire Date", fmtDate(detail.hire_date)],
                  ["Base Salary", formatCurrency(detail.base_salary || 0)],
                  ["Hourly Rate", detail.hourly_rate ? formatCurrency(detail.hourly_rate) : "N/A"],
                  ["SSS", detail.sss_no],
                  ["PhilHealth", detail.philhealth_no],
                  ["Pag-IBIG", detail.pagibig_no],
                  ["TIN", detail.tin_no],
                  ["Phone", detail.phone],
                  ["Email", detail.email],
                  ["Address", detail.address],
                  ["Emergency Contact", detail.emergency_contact_name && `${detail.emergency_contact_name} ${detail.emergency_contact_phone || ""}`],
                  ["Linked Account", detail.linked_account ? `${detail.linked_account.name} (${detail.linked_account.role})` : "None"],
                  ["Status", detail.is_active ? "Active" : "Inactive"],
                ]
                  .filter(([, v]) => v)
                  .map(([label, value]) => (
                    <div key={label} className="ed-detail-row">
                      <label>{label}</label>
                      <span>{String(value)}</span>
                    </div>
                  ))}
              </div>
            </div>
            <div className="ed-modal-footer">
              <button type="button" className="ed-btn ed-btn-secondary" onClick={() => { setDetail(null); openEdit(detail); }}>
                <FontAwesomeIcon icon={faPen} /> Edit
              </button>
              <button type="button" className="ed-btn ed-btn-primary" onClick={() => setDetail(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`ed-toast ${toast.type}`}>
          <FontAwesomeIcon icon={toast.type === "error" ? faTriangleExclamation : faCheckCircle} />
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
};

export default EmployeeDirectory;
