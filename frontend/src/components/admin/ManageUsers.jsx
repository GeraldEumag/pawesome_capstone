import React, { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowDown,
  faArrowUp,
  faCircleCheck,
  faCircleInfo,
  faDownload,
  faEdit,
  faEnvelope,
  faEye,
  faFilter,
  faIdBadge,
  faMagnifyingGlass,
  faRotateRight,
  faShieldAlt,
  faSpinner,
  faTimes,
  faTrash,
  faTriangleExclamation,
  faUserCheck,
  faUserClock,
  faUserGear,
  faUserPlus,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import { normalizeList } from "../../utils/normalizeList";
import { showSuccess as showSwalSuccess, showError as showSwalError, showWarning } from "../../utils/alert";
import "./ManageUsers.css";

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "receptionist", label: "Receptionist" },
  { value: "veterinary", label: "Veterinary" },
  { value: "cashier", label: "Cashier" },
  { value: "inventory", label: "Inventory" },
  { value: "payroll", label: "Payroll" },
  { value: "customer", label: "Customer" },
];

const initialFormData = {
  name: "",
  email: "",
  username: "",
  role: "customer",
  is_active: true,
};

const ManageUsers = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const [sortConfig, setSortConfig] = useState({
    key: "created_at",
    direction: "desc",
  });

  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [formData, setFormData] = useState(initialFormData);
  const [processing, setProcessing] = useState(false);

  const showSuccess = (message) => {
    setSuccess(message);
    window.clearTimeout(window.manageUsersSuccessTimer);
    window.manageUsersSuccessTimer = window.setTimeout(() => setSuccess(""), 3000);
    showSwalSuccess(message);
  };

  const showError = (message) => {
    setError(message);
    window.clearTimeout(window.manageUsersErrorTimer);
    window.manageUsersErrorTimer = window.setTimeout(() => setError(""), 5000);
    showSwalError(message);
  };

  const safeNormalizeUsers = (value) =>
    normalizeList(value, ["data", "users", "records", "items", "employees"]);

  const isActiveUser = (user) => {
    if (user?.is_active === true || user?.is_active === 1 || user?.is_active === "1") {
      return true;
    }

    if (user?.is_active === false || user?.is_active === 0 || user?.is_active === "0") {
      return false;
    }

    if (String(user?.status || "").toLowerCase() === "inactive") {
      return false;
    }

    return true;
  };

  const getUserInitials = (name = "") => {
    const parts = String(name || "U")
      .trim()
      .split(" ")
      .filter(Boolean);

    if (parts.length === 0) return "U";
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();

    return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "N/A";

    return date.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const fetchUsers = async ({ silent = false } = {}) => {
    try {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      const data = await apiRequest("/admin/users");
      setUsers(safeNormalizeUsers(data));
    } catch (err) {
      console.error("Failed to fetch users:", err);
      showError(err.message || "Failed to fetch users.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter((user) => isActiveUser(user)).length;
    const inactive = Math.max(total - active, 0);
    const adminCount = users.filter((user) => user.role === "admin").length;

    return { total, active, inactive, adminCount };
  }, [users]);

  const roleCounts = useMemo(() => {
    return ROLE_OPTIONS.reduce((acc, role) => {
      acc[role.value] = users.filter((user) => user.role === role.value).length;
      return acc;
    }, {});
  }, [users]);

  const filteredUsers = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    return users.filter((user) => {
      const searchableText = [
        user.name,
        user.email,
        user.username,
        user.role,
        user.id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !keyword || searchableText.includes(keyword);
      const matchesRole = filterRole === "all" || user.role === filterRole;

      const active = isActiveUser(user);
      const matchesStatus =
        filterStatus === "all" ||
        (filterStatus === "active" && active) ||
        (filterStatus === "inactive" && !active);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchTerm, filterRole, filterStatus]);

  const sortedUsers = useMemo(() => {
    const list = [...filteredUsers];

    list.sort((a, b) => {
      const { key, direction } = sortConfig;
      const multiplier = direction === "asc" ? 1 : -1;

      let aValue = a?.[key];
      let bValue = b?.[key];

      if (key === "is_active") {
        aValue = isActiveUser(a) ? 1 : 0;
        bValue = isActiveUser(b) ? 1 : 0;
      }

      if (key === "created_at") {
        aValue = aValue ? new Date(aValue).getTime() : 0;
        bValue = bValue ? new Date(bValue).getTime() : 0;
      }

      if (typeof aValue === "number" && typeof bValue === "number") {
        return (aValue - bValue) * multiplier;
      }

      return String(aValue || "").localeCompare(String(bValue || "")) * multiplier;
    });

    return list;
  }, [filteredUsers, sortConfig]);

  const openModal = (type, user = null) => {
    setModalType(type);
    setSelectedUser(user);

    if (user) {
      setFormData({
        name: user.name || "",
        email: user.email || "",
        username: user.username || "",
        role: user.role || "customer",
        is_active: isActiveUser(user),
      });
    }

    setShowModal(true);
  };

  const closeModal = () => {
    if (processing) return;

    setShowModal(false);
    setSelectedUser(null);
    setModalType("");
    setFormData(initialFormData);
  };

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;

    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const validateForm = () => {
    if (!formData.name.trim()) return "Name is required.";
    if (!formData.email.trim()) return "Email is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      return "Please enter a valid email address.";
    }
    if (!formData.username.trim()) return "Username is required.";
    if (!formData.role) return "Role is required.";

    return "";
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) return;

    const validationError = validateForm();
    if (validationError) {
      showError(validationError);
      return;
    }

    try {
      setProcessing(true);
      setError("");

      const updateData = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        username: formData.username.trim(),
        role: formData.role,
        is_active: formData.is_active,
      };

      await apiRequest(`/admin/users/${selectedUser.id}`, {
        method: "PUT",
        body: JSON.stringify(updateData),
      });

      setUsers((prev) =>
        prev.map((user) =>
          user.id === selectedUser.id ? { ...user, ...updateData } : user
        )
      );

      showSuccess("User updated successfully.");
      closeModal();
    } catch (err) {
      console.error("Failed to update user:", err);
      showError(err.message || "Failed to update user.");
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    try {
      setProcessing(true);
      setError("");

      await apiRequest(`/admin/users/${selectedUser.id}`, {
        method: "DELETE",
      });

      setUsers((prev) => prev.filter((user) => user.id !== selectedUser.id));

      showSuccess("User deleted successfully.");
      closeModal();
    } catch (err) {
      console.error("Failed to delete user:", err);
      showError(err.message || "Failed to delete user.");
    } finally {
      setProcessing(false);
    }
  };

  const handleToggleStatus = async (user) => {
    const currentStatus = isActiveUser(user);
    const nextStatus = !currentStatus;

    try {
      setError("");

      try {
        await apiRequest(`/admin/users/${user.id}/toggle`, {
          method: "PATCH",
        });
      } catch (toggleError) {
        console.warn("Toggle endpoint failed. Trying PUT fallback:", toggleError);

        await apiRequest(`/admin/users/${user.id}`, {
          method: "PUT",
          body: JSON.stringify({
            name: user.name || "",
            email: user.email || "",
            username: user.username || "",
            role: user.role || "customer",
            is_active: nextStatus,
          }),
        });
      }

      setUsers((prev) =>
        prev.map((item) =>
          item.id === user.id ? { ...item, is_active: nextStatus } : item
        )
      );

      showSuccess(`User ${nextStatus ? "activated" : "deactivated"} successfully.`);
    } catch (err) {
      console.error("Failed to toggle user status:", err);
      showError(err.message || "Failed to toggle user status.");
    }
  };

  const handleConfirm = () => {
    if (modalType === "edit") handleUpdateUser();
    if (modalType === "delete") handleDeleteUser();
  };

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const SortIcon = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) return null;

    return (
      <FontAwesomeIcon
        icon={sortConfig.direction === "asc" ? faArrowUp : faArrowDown}
      />
    );
  };

  const clearFilters = () => {
    setSearchTerm("");
    setFilterRole("all");
    setFilterStatus("all");
    showSuccess("Filters cleared.");
  };

  const exportCSV = () => {
    if (sortedUsers.length === 0) {
      showError("No users available to export.");
      return;
    }

    const headers = ["ID", "Name", "Username", "Email", "Role", "Status", "Join Date"];

    const rows = sortedUsers.map((user) => [
      user.id || "",
      user.name || "",
      user.username || "",
      user.email || "",
      user.role || "",
      isActiveUser(user) ? "Active" : "Inactive",
      formatDate(user.created_at),
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `manage-users-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();

    URL.revokeObjectURL(url);
    showSuccess("User list exported successfully.");
  };

  return (
    <div className="manage-users">
      {success && (
        <div className="mu-toast success">
          <FontAwesomeIcon icon={faCircleCheck} />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="mu-toast error">
          <FontAwesomeIcon icon={faTriangleExclamation} />
          <span>{error}</span>
        </div>
      )}

      <section className="manage-users-header">
        <div className="mu-header-copy">
          <span className="mu-eyebrow">
            <FontAwesomeIcon icon={faShieldAlt} />
            Admin Access Control
          </span>

          <h1>Manage Users</h1>
          <p>
            Manage system users, roles, account status, and access permissions from
            one organized workspace.
          </p>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className={`mu-secondary-btn ${refreshing ? "refreshing" : ""}`}
            onClick={() => fetchUsers({ silent: true })}
            disabled={refreshing}
          >
            <FontAwesomeIcon icon={refreshing ? faSpinner : faRotateRight} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>

          <button type="button" className="mu-secondary-btn" onClick={exportCSV}>
            <FontAwesomeIcon icon={faDownload} />
            Export CSV
          </button>

          <NavLink to="/admin/users/create" className="add-user-btn">
            <FontAwesomeIcon icon={faUserPlus} />
            Add New User
          </NavLink>
        </div>
      </section>

      <section className="mu-stats-grid">
        <article className="mu-stat-card">
          <span>
            <FontAwesomeIcon icon={faUsers} />
          </span>
          <div>
            <strong>{stats.total}</strong>
            <p>Total Users</p>
          </div>
        </article>

        <article className="mu-stat-card success">
          <span>
            <FontAwesomeIcon icon={faUserCheck} />
          </span>
          <div>
            <strong>{stats.active}</strong>
            <p>Active Users</p>
          </div>
        </article>

        <article className="mu-stat-card danger">
          <span>
            <FontAwesomeIcon icon={faUserClock} />
          </span>
          <div>
            <strong>{stats.inactive}</strong>
            <p>Inactive Users</p>
          </div>
        </article>

        <article className="mu-stat-card">
          <span>
            <FontAwesomeIcon icon={faUserGear} />
          </span>
          <div>
            <strong>{stats.adminCount}</strong>
            <p>Administrators</p>
          </div>
        </article>
      </section>

      <section className="users-filter-bar">
        <div className="search-box">
          <FontAwesomeIcon icon={faMagnifyingGlass} />
          <input
            type="text"
            placeholder="Search by name, email, username, role, or ID..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />

          {searchTerm && (
            <button type="button" onClick={() => setSearchTerm("")}>
              <FontAwesomeIcon icon={faTimes} />
            </button>
          )}
        </div>

        <div className="filter-box">
          <FontAwesomeIcon icon={faIdBadge} />
          <select
            value={filterRole}
            onChange={(event) => setFilterRole(event.target.value)}
          >
            <option value="all">All Roles</option>
            {ROLE_OPTIONS.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label} ({roleCounts[role.value] || 0})
              </option>
            ))}
          </select>
        </div>

        <div className="filter-box">
          <FontAwesomeIcon icon={faFilter} />
          <select
            value={filterStatus}
            onChange={(event) => setFilterStatus(event.target.value)}
          >
            <option value="all">All Status</option>
            <option value="active">Active ({stats.active})</option>
            <option value="inactive">Inactive ({stats.inactive})</option>
          </select>
        </div>

        <button type="button" className="mu-clear-btn" onClick={clearFilters}>
          <FontAwesomeIcon icon={faTimes} />
          Clear
        </button>
      </section>

      <section className="users-table-container">
        <div className="mu-table-header">
          <div>
            <h2>User Directory</h2>
            <p>
              Showing <strong>{sortedUsers.length}</strong> of{" "}
              <strong>{users.length}</strong> users.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="loading-container">
            <FontAwesomeIcon icon={faSpinner} className="mu-spin" />
            <h3>Loading users...</h3>
            <p>Please wait while we fetch system accounts.</p>
          </div>
        ) : sortedUsers.length === 0 ? (
          <div className="empty-state">
            <FontAwesomeIcon icon={faCircleInfo} />
            <h3>No users found</h3>
            <p>Try adjusting your filters or add a new user.</p>
          </div>
        ) : (
          <div className="mu-table-scroll">
            <table className="users-table">
              <thead>
                <tr>
                  <th>
                    <button type="button" onClick={() => handleSort("id")}>
                      ID <SortIcon columnKey="id" />
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleSort("name")}>
                      Name <SortIcon columnKey="name" />
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleSort("username")}>
                      Username <SortIcon columnKey="username" />
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleSort("email")}>
                      Email <SortIcon columnKey="email" />
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleSort("role")}>
                      Role <SortIcon columnKey="role" />
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleSort("is_active")}>
                      Status <SortIcon columnKey="is_active" />
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleSort("created_at")}>
                      Join Date <SortIcon columnKey="created_at" />
                    </button>
                  </th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {sortedUsers.map((user) => {
                  const active = isActiveUser(user);

                  return (
                    <tr key={user.id} className="user-row">
                      <td className="user-id">#{user.id}</td>

                      <td className="user-name">
                        <div className="user-profile">
                          <span className="user-avatar">
                            {getUserInitials(user.name)}
                          </span>

                          <div>
                            <strong>{user.name || "Unnamed User"}</strong>
                            <small>{user.role || "No role"}</small>
                          </div>
                        </div>
                      </td>

                      <td className="user-username">{user.username || "N/A"}</td>

                      <td className="user-email">
                        <FontAwesomeIcon icon={faEnvelope} />
                        <span>{user.email || "No email"}</span>
                      </td>

                      <td className="user-role">
                        <span className={`role-badge role-${user.role || "default"}`}>
                          {user.role || "No Role"}
                        </span>
                      </td>

                      <td className="user-status">
                        <button
                          className={`status-toggle ${active ? "active" : "inactive"}`}
                          type="button"
                          onClick={() => handleToggleStatus(user)}
                          title={active ? "Deactivate user" : "Activate user"}
                        >
                          <span className="status-dot" />
                          {active ? "Active" : "Inactive"}
                        </button>
                      </td>

                      <td className="user-date">{formatDate(user.created_at)}</td>

                      <td className="user-actions">
                        <button
                          className="action-btn view-btn"
                          type="button"
                          onClick={() => openModal("view", user)}
                          title="View User"
                        >
                          <FontAwesomeIcon icon={faEye} />
                        </button>

                        <button
                          className="action-btn edit-btn"
                          type="button"
                          onClick={() => openModal("edit", user)}
                          title="Edit User"
                        >
                          <FontAwesomeIcon icon={faEdit} />
                        </button>

                        <button
                          className="action-btn delete-btn"
                          type="button"
                          onClick={() => openModal("delete", user)}
                          title="Delete User"
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showModal && (
        <div className="mu-modal-overlay" onClick={closeModal}>
          <div className="mu-modal" onClick={(event) => event.stopPropagation()}>
            <div className="mu-modal-header">
              <div>
                <span className="mu-eyebrow">
                  <FontAwesomeIcon
                    icon={
                      modalType === "delete"
                        ? faTriangleExclamation
                        : modalType === "view"
                        ? faEye
                        : faEdit
                    }
                  />
                  {modalType === "edit" && "Edit User"}
                  {modalType === "delete" && "Delete User"}
                  {modalType === "view" && "User Details"}
                </span>

                <h3>{selectedUser?.name || "Selected User"}</h3>
              </div>

              <button className="close-btn" type="button" onClick={closeModal}>
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            <div className="mu-modal-body">
              {modalType === "view" && (
                <div className="mu-user-detail">
                  <div className="mu-user-detail-top">
                    <span className="mu-detail-avatar">
                      {getUserInitials(selectedUser?.name)}
                    </span>

                    <div>
                      <h4>{selectedUser?.name || "Unnamed User"}</h4>
                      <p>{selectedUser?.email || "No email available"}</p>
                    </div>
                  </div>

                  <div className="mu-detail-grid">
                    <div>
                      <small>ID</small>
                      <strong>#{selectedUser?.id}</strong>
                    </div>

                    <div>
                      <small>Username</small>
                      <strong>{selectedUser?.username || "N/A"}</strong>
                    </div>

                    <div>
                      <small>Role</small>
                      <strong>{selectedUser?.role || "No role"}</strong>
                    </div>

                    <div>
                      <small>Status</small>
                      <strong>{isActiveUser(selectedUser) ? "Active" : "Inactive"}</strong>
                    </div>

                    <div>
                      <small>Join Date</small>
                      <strong>{formatDate(selectedUser?.created_at)}</strong>
                    </div>

                    <div>
                      <small>Email</small>
                      <strong>{selectedUser?.email || "No email"}</strong>
                    </div>
                  </div>
                </div>
              )}

              {modalType === "edit" && (
                <form className="user-form" onSubmit={(event) => event.preventDefault()}>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Name</label>
                      <input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Username</label>
                      <input
                        type="text"
                        name="username"
                        value={formData.username}
                        onChange={handleChange}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Email</label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Role</label>
                    <select name="role" value={formData.role} onChange={handleChange}>
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      name="is_active"
                      checked={formData.is_active}
                      onChange={handleChange}
                    />
                    <span className="checkmark" />
                    Active User
                  </label>
                </form>
              )}

              {modalType === "delete" && (
                <div className="delete-confirmation">
                  <FontAwesomeIcon icon={faTriangleExclamation} />
                  <h4>Delete this user?</h4>
                  <p>
                    Are you sure you want to delete{" "}
                    <strong>{selectedUser?.name}</strong>?
                  </p>
                  <p className="warning-text">This action cannot be undone.</p>
                </div>
              )}
            </div>

            <div className="mu-modal-actions">
              <button
                className="cancel-btn"
                type="button"
                onClick={closeModal}
                disabled={processing}
              >
                {modalType === "view" ? "Close" : "Cancel"}
              </button>

              {modalType !== "view" && (
                <button
                  className={`confirm-btn ${
                    modalType === "delete" ? "danger" : "primary"
                  }`}
                  type="button"
                  onClick={handleConfirm}
                  disabled={processing}
                >
                  {processing ? (
                    <>
                      <FontAwesomeIcon icon={faSpinner} className="mu-spin" />
                      Processing...
                    </>
                  ) : modalType === "edit" ? (
                    "Update User"
                  ) : (
                    "Delete User"
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageUsers;