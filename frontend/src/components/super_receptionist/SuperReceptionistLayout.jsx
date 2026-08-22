import { Outlet, useNavigate, useLocation } from "react-router-dom";
import SuperReceptionistSidebar from "./SuperReceptionistSidebar";
import { FaRedoAlt, FaUserTie } from "react-icons/fa";
import DashboardLayout from "../shared/DashboardLayout";
import "./SuperReceptionistLayout.css";

const ROUTE_META = [
  { path: "/super-receptionist", title: "Hotel Bookings", subtitle: "Manage pet hotel and boarding reservations, check-ins, and check-outs." },
  { path: "/super-receptionist/bookings/hotel", title: "Hotel Bookings", subtitle: "Manage pet hotel and boarding reservations, check-ins, and check-outs." },
  { path: "/super-receptionist/bookings/vet", title: "Veterinary Bookings", subtitle: "Manage veterinary appointments and schedule consultations." },
  { path: "/super-receptionist/bookings/veterinary", title: "Veterinary Bookings", subtitle: "Manage veterinary appointments and schedule consultations." },
  { path: "/super-receptionist/bookings/grooming", title: "Grooming Bookings", subtitle: "Manage grooming appointments and service scheduling." },
  { path: "/super-receptionist/walk-ins", title: "Walk-in Customers", subtitle: "Create bookings for walk-in customers with or without accounts." },
  { path: "/super-receptionist/customers", title: "Customer Management", subtitle: "View, edit, and organize customer records and profiles." },
  { path: "/super-receptionist/manage-services", title: "Manage Services", subtitle: "Configure service catalog, hotel rooms, and boarding options." },
  { path: "/super-receptionist/history", title: "Front Desk History", subtitle: "Review past front desk actions, check-ins, and changes." },
  { path: "/super-receptionist/cashier-payments", title: "Payment Verification", subtitle: "Verify and process customer payments." },
  { path: "/super-receptionist/cashier-transactions", title: "Transactions", subtitle: "View and manage cashier transactions." },
  { path: "/super-receptionist/cashier-history", title: "Cashier History", subtitle: "Review past cashier transactions and activity." },
  { path: "/super-receptionist/cashier-reports", title: "Cashier Reports", subtitle: "Sales analytics, transaction summaries, and trends." },
  { path: "/super-receptionist/inventory", title: "Stock Management", subtitle: "Manage inventory items, stock levels, and suppliers." },
  { path: "/super-receptionist/inventory/history", title: "Inventory History", subtitle: "Review inventory movements and stock changes." },
  { path: "/super-receptionist/inventory/reports", title: "Inventory Reports", subtitle: "Stock analytics, valuation, and movement summaries." },
  { path: "/super-receptionist/inventory/audit", title: "Monthly Audit", subtitle: "Conduct monthly inventory audits and reconciliations." },
  { path: "/super-receptionist/payroll", title: "My Payroll", subtitle: "View your payroll records and payslips." },
  { path: "/super-receptionist/profile", title: "Profile Settings", subtitle: "Manage your account details and preferences." },
];

const SuperReceptionistLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const normalizedPath = location.pathname.replace(/\/+$/, "");

  const pageMeta = ROUTE_META.find((r) => r.path === normalizedPath) || ROUTE_META[0];

  const extraActions = (
    <>
      <button
        className="topbar-user"
        type="button"
        onClick={() => navigate("/super-receptionist/profile")}
      >
        <span className="topbar-avatar">
          <FaUserTie />
        </span>
        <span>
          <strong>Super Receptionist</strong>
          <small>Front Desk · Cashier · Inventory</small>
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
    </>
  );

  return (
    <DashboardLayout
      sidebar={<SuperReceptionistSidebar />}
      title={pageMeta.title}
      subtitle={pageMeta.subtitle}
      role="super_receptionist"
      extraActions={extraActions}
      className="super-receptionist-layout"
    >
      <Outlet />
    </DashboardLayout>
  );
};

export default SuperReceptionistLayout;
