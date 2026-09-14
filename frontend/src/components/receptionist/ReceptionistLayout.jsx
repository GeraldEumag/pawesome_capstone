import { Outlet, useLocation } from "react-router-dom";
import ReceptionistSidebar from "./ReceptionistSidebar";
import DashboardLayout from "../shared/DashboardLayout";
import { useAuth } from "../../context/AuthContext";
import "./ReceptionistLayout.css";

const ReceptionistLayout = () => {
  const location = useLocation();
  const { user } = useAuth();
  const name = user?.name || "Receptionist";
  const profilePhoto = user?.profile_photo || "";
  const normalizedPath = location.pathname.replace(/\/+$/, "");

  const ROUTE_META = [
    { path: "/receptionist", title: "Hotel Bookings", subtitle: "Manage pet hotel and boarding reservations, check-ins, and check-outs." },
    { path: "/receptionist/bookings/hotel", title: "Hotel Bookings", subtitle: "Manage pet hotel and boarding reservations, check-ins, and check-outs." },
    { path: "/receptionist/bookings/veterinary", title: "Veterinary Bookings", subtitle: "Manage veterinary appointments and schedule consultations." },
    { path: "/receptionist/bookings/grooming", title: "Grooming Bookings", subtitle: "Manage grooming appointments and service scheduling." },
    { path: "/receptionist/manage-services", title: "Manage Services", subtitle: "Configure service catalog, hotel rooms, and boarding options." },
    { path: "/receptionist/walk-ins", title: "Walk-in Customers", subtitle: "Create bookings for walk-in customers with or without accounts." },
    { path: "/receptionist/appointments-boarding", title: "Hotel Bookings", subtitle: "Manage pet hotel and boarding reservations, check-ins, and check-outs." },
    { path: "/receptionist/customers", title: "Customer Management", subtitle: "View, edit, and organize customer records and profiles." },
    { path: "/receptionist/history", title: "Activity History", subtitle: "Review past front desk actions, check-ins, and changes." },
    { path: "/receptionist/reports", title: "Reports", subtitle: "Access front desk analytics, booking summaries, and trends." },
    { path: "/receptionist/chatbot", title: "Chatbot", subtitle: "Get instant help from our AI assistant." },
    { path: "/receptionist/profile", title: "Profile Settings", subtitle: "Manage your account details and preferences." },
    { path: "/receptionist/customer-profile", title: "Customer Profiles", subtitle: "Detailed customer information and pet records." },
  ];

  const pageMeta = ROUTE_META.find((r) => r.path === normalizedPath) || ROUTE_META[0];

  return (
    <DashboardLayout
      sidebar={<ReceptionistSidebar />}
      title={pageMeta.title}
      subtitle={pageMeta.subtitle}
      role="receptionist"
      name={name}
      profilePhoto={profilePhoto}
      className="receptionist-layout"
    >
      <Outlet />
    </DashboardLayout>
  );
};

export default ReceptionistLayout;
