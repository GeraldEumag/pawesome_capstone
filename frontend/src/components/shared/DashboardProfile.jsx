import { useNavigate } from "react-router-dom";
import { FaUserCircle } from "react-icons/fa";
import { formatRoleLabel } from "../../utils/roleLabels";
import { useAuthenticatedImage } from "../../utils/avatar";
import "./DashboardProfile.css";

const ROLE_PROFILE_PATHS = {
  admin: "/admin/profile",
  manager: "/manager/profile",
  cashier: "/cashier/profile",
  customer: "/customer/profile",
  veterinary: "/veterinary/profile",
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
  const imageSrc = useAuthenticatedImage(image);

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
          {imageSrc ? (
            <img
              src={imageSrc}
              alt={`${name} profile`}
              onError={(e) => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }}
            />
          ) : null}
          <FaUserCircle size={24} style={{ display: imageSrc ? "none" : "block" }} />
        </span>

        <span className="dashboard-profile-info">
          <strong>{name}</strong>
          <small>{formatRoleLabel(role)}</small>
        </span>
      </button>
    </div>
  );
}
