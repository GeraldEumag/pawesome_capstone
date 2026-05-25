import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalculator,
  faDownload,
  faEdit,
  faPlus,
  faSave,
  faSearch,
  faTrash,
  faTimes,
  faUserTie,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import { formatCurrency } from "../../utils/currency";
import { normalizeList } from "../../utils/normalizeList";
import "./EmployeeSalaryManagement.css";


const emptyForm = {
  employeeId: "",
  name: "",
  department: "",
  position: "",
  baseSalary: 0,
  housingAllowance: 0,
  transportAllowance: 0,
  medicalAllowance: 0,
  performanceBonus: 0,
  status: "active",
};

const departments = [
  "Veterinary",
  "Customer Service",
  "Management",
  "Grooming",
  "Reception",
  "Inventory",
  "Cashier",
];

const colors = ["#ff5f93", "#ff8db5", "#ffc8dd", "#f472b6", "#fb7185"];

const EmployeeSalaryManagement = () => {
  const { role } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDepartment, setFilterDepartment] = useState("all");
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmployee, setNewEmployee] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const salaryBasePath = ["payroll", "payroll_manager"].includes(role)
    ? "/payroll"
    : "/admin/salaries";

  const normalizeEmployee = (emp) => ({
    id: emp.id,
    employeeId: emp.employeeId || emp.employee_id || `EMP-${emp.id}`,
    name: emp.name || emp.full_name || emp.user?.name || emp.employee?.name || "Unknown Employee",
    department: emp.department || emp.user?.department || emp.employee?.department || "Unassigned",
    position: emp.position || emp.user?.position || emp.employee?.position || emp.role || "Staff",
    baseSalary: Number(emp.baseSalary ?? emp.base_salary ?? emp.salary ?? emp.basic_pay ?? 0),
    housingAllowance: Number(emp.housingAllowance ?? emp.housing_allowance ?? 0),
    transportAllowance: Number(emp.transportAllowance ?? emp.transport_allowance ?? 0),
    medicalAllowance: Number(emp.medicalAllowance ?? emp.medical_allowance ?? 0),
    performanceBonus: Number(emp.performanceBonus ?? emp.performance_bonus ?? 0),
    status: emp.status || "active",
  });

  const calculateTotalSalary = (employee) =>
    Number(employee.baseSalary || 0) +
    Number(employee.housingAllowance || 0) +
    Number(employee.transportAllowance || 0) +
    Number(employee.medicalAllowance || 0) +
    Number(employee.performanceBonus || 0);

  const loadEmployees = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await apiRequest(salaryBasePath);
      setEmployees(
        normalizeList(data, ["data", "employees", "salaries", "payrolls", "records"]).map(normalizeEmployee)
      );
    } catch (err) {
      setError(err.message || "Failed to load employee salary data");
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }, [salaryBasePath]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  const filteredEmployees = useMemo(() => {
    return employees.filter((employee) => {
      const search = searchTerm.toLowerCase();
      const matchesSearch =
        employee.name.toLowerCase().includes(search) ||
        employee.employeeId.toLowerCase().includes(search) ||
        employee.position.toLowerCase().includes(search);

      const matchesDepartment =
        filterDepartment === "all" || employee.department === filterDepartment;

      return matchesSearch && matchesDepartment;
    });
  }, [employees, searchTerm, filterDepartment]);

  const totalPayroll = employees.reduce(
    (sum, emp) => sum + calculateTotalSalary(emp),
    0
  );

  const averageSalary = employees.length
    ? Math.round(totalPayroll / employees.length)
    : 0;

  const departmentChartData = departments
    .map((dept) => {
      const deptEmployees = employees.filter((emp) => emp.department === dept);
      return {
        department: dept,
        employees: deptEmployees.length,
        payroll: deptEmployees.reduce(
          (sum, emp) => sum + calculateTotalSalary(emp),
          0
        ),
      };
    })
    .filter((item) => item.employees > 0);

  const exportCSV = () => {
    const headers = [
      "Employee ID",
      "Name",
      "Department",
      "Position",
      "Base Salary",
      "Allowances",
      "Bonus",
      "Total Salary",
      "Status",
    ];

    const rows = filteredEmployees.map((emp) => [
      emp.employeeId,
      emp.name,
      emp.department,
      emp.position,
      emp.baseSalary,
      emp.housingAllowance + emp.transportAllowance + emp.medicalAllowance,
      emp.performanceBonus,
      calculateTotalSalary(emp),
      emp.status,
    ]);

    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "salary-management-report.csv";
    link.click();

    URL.revokeObjectURL(url);
  };

  const handleAddEmployee = async () => {
    const payload = {
      ...newEmployee,
      baseSalary: Number(newEmployee.baseSalary || 0),
      housingAllowance: Number(newEmployee.housingAllowance || 0),
      transportAllowance: Number(newEmployee.transportAllowance || 0),
      medicalAllowance: Number(newEmployee.medicalAllowance || 0),
      performanceBonus: Number(newEmployee.performanceBonus || 0),
    };

    try {
      const saved = await apiRequest(salaryBasePath, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setEmployees((prev) => [...prev, normalizeEmployee(saved?.data || saved)]);
      setError("");
    } catch (err) {
      setError(err.message || "Failed to save employee salary data");
      return;
    }

    setNewEmployee(emptyForm);
    setShowAddForm(false);
  };

  const handleSaveEmployee = async () => {
    const payload = {
      ...editingEmployee,
      baseSalary: Number(editingEmployee.baseSalary || 0),
      housingAllowance: Number(editingEmployee.housingAllowance || 0),
      transportAllowance: Number(editingEmployee.transportAllowance || 0),
      medicalAllowance: Number(editingEmployee.medicalAllowance || 0),
      performanceBonus: Number(editingEmployee.performanceBonus || 0),
    };

    try {
      const saved = await apiRequest(`${salaryBasePath}/${editingEmployee.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setEmployees((prev) =>
        normalizeList(prev, ["data", "employees", "salaries", "payrolls", "records"]).map((emp) =>
          emp.id === editingEmployee.id ? normalizeEmployee(saved?.data || payload) : emp
        )
      );
      setError("");
    } catch (err) {
      setError(err.message || "Failed to update employee salary data");
      return;
    }

    setEditingEmployee(null);
  };

  const handleDeleteEmployee = async (id) => {
    try {
      await apiRequest(`${salaryBasePath}/${id}`, { method: "DELETE" });
      setEmployees((prev) => normalizeList(prev, ["data", "employees", "salaries", "payrolls", "records"]).filter((emp) => emp.id !== id));
      setError("");
    } catch (err) {
      setError(err.message || "Failed to delete employee salary data");
    }
  };

  const renderSalaryForm = (employee, setEmployee, onSave, title) => (
    <div className="salary-form-overlay">
      <div className="salary-form">
        <div className="form-header">
          <h2>{title}</h2>
          <button
            className="close-btn"
            onClick={() => {
              setShowAddForm(false);
              setEditingEmployee(null);
            }}
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="form-content">
          <div className="form-grid">
            <input placeholder="Employee ID" value={employee.employeeId} onChange={(e) => setEmployee({ ...employee, employeeId: e.target.value })} />
            <input placeholder="Full Name" value={employee.name} onChange={(e) => setEmployee({ ...employee, name: e.target.value })} />
            <select value={employee.department} onChange={(e) => setEmployee({ ...employee, department: e.target.value })}>
              <option value="">Select Department</option>
              {departments.map((dept) => <option key={dept}>{dept}</option>)}
            </select>
            <input placeholder="Position" value={employee.position} onChange={(e) => setEmployee({ ...employee, position: e.target.value })} />
            <input type="number" placeholder="Base Salary" value={employee.baseSalary} onChange={(e) => setEmployee({ ...employee, baseSalary: Number(e.target.value) })} />
            <input type="number" placeholder="Housing Allowance" value={employee.housingAllowance} onChange={(e) => setEmployee({ ...employee, housingAllowance: Number(e.target.value) })} />
            <input type="number" placeholder="Transport Allowance" value={employee.transportAllowance} onChange={(e) => setEmployee({ ...employee, transportAllowance: Number(e.target.value) })} />
            <input type="number" placeholder="Medical Allowance" value={employee.medicalAllowance} onChange={(e) => setEmployee({ ...employee, medicalAllowance: Number(e.target.value) })} />
            <input type="number" placeholder="Performance Bonus" value={employee.performanceBonus} onChange={(e) => setEmployee({ ...employee, performanceBonus: Number(e.target.value) })} />
          </div>

          <div className="salary-preview">
            <h3>Salary Preview</h3>
            <div className="preview-item">
              <span>Base Salary</span>
              <strong>{formatCurrency(employee.baseSalary || 0)}</strong>
            </div>
            <div className="preview-item">
              <span>Total Allowances</span>
              <strong>
                {formatCurrency(
                  Number(employee.housingAllowance || 0) +
                    Number(employee.transportAllowance || 0) +
                    Number(employee.medicalAllowance || 0)
                )}
              </strong>
            </div>
            <div className="preview-item">
              <span>Bonus</span>
              <strong>{formatCurrency(employee.performanceBonus || 0)}</strong>
            </div>
            <div className="preview-item total">
              <span>Total Salary</span>
              <strong>{formatCurrency(calculateTotalSalary(employee))}</strong>
            </div>
          </div>

          <div className="form-actions">
            <button className="secondary-btn" onClick={() => { setShowAddForm(false); setEditingEmployee(null); }}>
              Cancel
            </button>
            <button className="primary-btn" onClick={onSave}>
              <FontAwesomeIcon icon={faSave} />
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="salary-management">
      <div className="salary-header">
        <div className="header-left">
          <h1>Employee Salary Management</h1>
          <p>Track payroll, compensation packages, and salary distribution.</p>
        </div>

        <div className="header-actions">
          <button className="secondary-btn" onClick={exportCSV}>
            <FontAwesomeIcon icon={faDownload} />
            Export CSV
          </button>
          <button className="primary-btn" onClick={() => setShowAddForm(true)}>
            <FontAwesomeIcon icon={faPlus} />
            Add Employee
          </button>
        </div>
      </div>

      <div className="summary-cards">
        <div className="summary-card">
          <div className="card-icon"><FontAwesomeIcon icon={faUsers} /></div>
          <div className="card-content">
            <h3>{employees.length}</h3>
            <p>Total Employees</p>
          </div>
        </div>

        <div className="summary-card">
          <div className="card-icon"><FontAwesomeIcon icon={faCalculator} /></div>
          <div className="card-content">
            <h3>{formatCurrency(totalPayroll)}</h3>
            <p>Total Payroll</p>
          </div>
        </div>

        <div className="summary-card">
          <div className="card-icon"><FontAwesomeIcon icon={faUserTie} /></div>
          <div className="card-content">
            <h3>{formatCurrency(averageSalary)}</h3>
            <p>Average Salary</p>
          </div>
        </div>
      </div>

      <div className="salary-analytics-grid">
        <div className="analytics-panel">
          <h3>Payroll by Department</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={departmentChartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="department" />
              <YAxis />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Bar dataKey="payroll" radius={[10, 10, 0, 0]} fill="#ff5f93" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="analytics-panel">
          <h3>Employee Distribution</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={departmentChartData} dataKey="employees" nameKey="department" outerRadius={95}>
                {departmentChartData.map((entry, index) => (
                  <Cell key={entry.department} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="salary-controls">
        <div className="search-filter-group">
          <div className="search-box">
            <FontAwesomeIcon icon={faSearch} />
            <input
              type="text"
              placeholder="Search by employee, ID, or position..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <select
            className="filter-select"
            value={filterDepartment}
            onChange={(e) => setFilterDepartment(e.target.value)}
          >
            <option value="all">All Departments</option>
            {departments.map((dept) => <option key={dept}>{dept}</option>)}
          </select>
        </div>
      </div>

      <div className="salary-table-container">
        {loading ? (
          <div className="loading-state">Loading salary records...</div>
        ) : (
          <table className="salary-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Department</th>
                <th>Base Salary</th>
                <th>Allowances</th>
                <th>Bonus</th>
                <th>Total Salary</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredEmployees.map((employee) => (
                <tr key={employee.id}>
                  <td>
                    <div className="employee-details">
                      <div className="employee-avatar">
                        <FontAwesomeIcon icon={faUserTie} />
                      </div>
                      <div>
                        <span className="employee-name">{employee.name}</span>
                        <span className="employee-id">{employee.employeeId}</span>
                        <span className="employee-position">{employee.position}</span>
                      </div>
                    </div>
                  </td>
                  <td><span className="department-badge">{employee.department}</span></td>
                  <td>{formatCurrency(employee.baseSalary)}</td>
                  <td>
                    {formatCurrency(
                      employee.housingAllowance +
                        employee.transportAllowance +
                        employee.medicalAllowance
                    )}
                  </td>
                  <td>{formatCurrency(employee.performanceBonus)}</td>
                  <td><strong className="total-amount">{formatCurrency(calculateTotalSalary(employee))}</strong></td>
                  <td><span className="status-badge active">{employee.status}</span></td>
                  <td>
                    <div className="actions">
                      <button className="action-btn edit-btn" onClick={() => setEditingEmployee(employee)}>
                        <FontAwesomeIcon icon={faEdit} />
                      </button>
                      <button className="action-btn delete-btn" onClick={() => handleDeleteEmployee(employee.id)}>
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredEmployees.length === 0 && (
                <tr>
                  <td colSpan="8" className="empty-table">
                    {error ? `${error}. No salary records to display.` : "No salary records found."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {showAddForm &&
        renderSalaryForm(newEmployee, setNewEmployee, handleAddEmployee, "Add Employee Salary")}

      {editingEmployee &&
        renderSalaryForm(editingEmployee, setEditingEmployee, handleSaveEmployee, "Edit Employee Salary")}
    </div>
  );
};

export default EmployeeSalaryManagement;
