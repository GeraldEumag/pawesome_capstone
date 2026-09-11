import { useNavigate } from "react-router-dom";
import { FaUserCircle } from "react-icons/fa";
import { formatRoleLabel } from "../../utils/roleLabels";
import "./DashboardProfile.css";

const resolveProfilePhoto = (url) => {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  if (url.startsWith("/")) return `${window.location.origin}${url}`;
  // Relative path without leading slash — resolve against origin
  return `${window.location.origin}/${url}`;
};

const ROLE_PROFILE_PATHS = {
  admin: "/admin/profile",
  super_admin: "/admin/profile",
  manager: "/manager/profile",
  cashier: "/cashier/profile",
  customer: "/customer/profile",
  veterinary: "/vet/profile",
  receptionist: "/receptionist/profile",
  super_receptionist: "/super-receptionist/profile",
  inventory: "/inventory/profile",
  grooming: "/grooming/profile",
};

export default function DashboardProfile({
  name = "User",
  role = "Dashboard User",
  image = "",
}) {
  const navigate = useNavigate();

  const handleNavigate = () => {
    const path = ROLE_PROFILE_PATHS[role] || "/profile";
    navigate(path);
  };

  return (
    <div className="dashboard-profile-card">
      <button
        className="dashboard-profile-btn"
        type="button"
        onClick={handleNavigate}
        title="View profile"
      >
        <span className="dashboard-profile-avatar">
          {image ? (
            <img
              src={resolveProfilePhoto(image)}
              alt={`${name} profile`}
              onError={(e) => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }}
            />
          ) : null}
          <FaUserCircle size={24} style={{ display: image ? "none" : "block" }} />
        </span>

        <span className="dashboard-profile-info">
          <strong>{name}</strong>
          <small>{formatRoleLabel(role)}</small>
        </span>
      </button>
    </div>
  );
}
