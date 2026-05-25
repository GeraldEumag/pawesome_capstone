import { Outlet, useNavigate } from "react-router-dom";
import ReceptionistSidebar from "./ReceptionistSidebar";
import { FaRedoAlt, FaMoon, FaUserTie } from "react-icons/fa";
import DashboardLayout from "../shared/DashboardLayout";
import { useTheme } from "../../utils/theme";
import "./ReceptionistLayout.css";

const ReceptionistLayout = () => {
  const navigate = useNavigate();
  const { toggle } = useTheme();

  const extraActions = (
    <>
      <button
        className="topbar-user"
        type="button"
        onClick={() => navigate("/receptionist/profile")}
      >
        <span className="topbar-avatar">
          <FaUserTie />
        </span>
        <span>
          <strong>Receptionist</strong>
          <small>Front Desk</small>
        </span>
      </button>
      <button
        className="topbar-icon"
        type="button"
        title="Refresh"
        onClick={() => window.location.reload()}
      >
        <FaRedoAlt />
      </button>
      <button
        className="topbar-icon"
        type="button"
        title="Dark Mode"
        onClick={toggle}
      >
        <FaMoon />
      </button>
    </>
  );

  return (
    <DashboardLayout
      sidebar={<ReceptionistSidebar />}
      title="Receptionist Portal"
      subtitle="Manage bookings, customers, approvals, and service requests."
      role="receptionist"
      extraActions={extraActions}
      className="receptionist-layout"
    >
      <Outlet />
    </DashboardLayout>
  );
};

export default ReceptionistLayout;
