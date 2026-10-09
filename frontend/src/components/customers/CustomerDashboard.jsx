import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import CustomerSidebar from "./CustomerSidebar";
import DashboardLayout from "../shared/DashboardLayout";
import BookingTracker from "../shared/BookingTracker";
import { useAuth } from "../../context/AuthContext";
import { fetchAndApplySystemTheme } from "../../utils/theme";
import "../../styles/dashboardGlobal.css";
import "./CustomerDashboard.css";

const ROUTE_META = [
  { path: "/customer", title: "Services", subtitle: "Browse and book grooming, hotel, and veterinary services." },
  { path: "/customer/services", title: "Services", subtitle: "Browse and book grooming, hotel, and veterinary services." },
  { path: "/customer/bookings", title: "My Bookings", subtitle: "Track the status of your submitted service requests." },
  { path: "/customer/pets", title: "My Pets", subtitle: "View and manage your registered pets and their profiles." },
  { path: "/customer/hotel", title: "Hotel Booking", subtitle: "Book a comfortable stay for your pet at our hotel." },
  { path: "/customer/grooming", title: "Grooming Booking", subtitle: "Schedule grooming sessions for your pet." },
  { path: "/customer/vet", title: "Vet Consultation", subtitle: "Book veterinary consultations and checkups." },
  { path: "/customer/medical-confinements", title: "Medical Confinements", subtitle: "View medical confinement records and recovery plans." },
  { path: "/customer/profile", title: "Profile Settings", subtitle: "Manage your account details and preferences." },
  { path: "/customer/history", title: "Order History", subtitle: "Review past orders, services, and payment records." },
  { path: "/customer/notifications", title: "Notifications", subtitle: "Stay updated with the latest alerts and messages." },
  { path: "/customer/payments", title: "Payments", subtitle: "View and manage your payment methods and invoices." },
  { path: "/customer/reports", title: "Reports", subtitle: "Access your activity reports and analytics." },
];

const CustomerDashboard = () => {
  const { user } = useAuth();
  const location = useLocation();
  const normalizedPath = location.pathname.replace(/\/+$/, "");
  const pageMeta = ROUTE_META.find((r) => r.path === normalizedPath) || ROUTE_META[0];

  useEffect(() => {
    fetchAndApplySystemTheme();
  }, []);

  return (
    <>
      <DashboardLayout
        sidebar={<CustomerSidebar />}
        title={pageMeta.title}
        subtitle={pageMeta.subtitle}
        role="customer"
        name={user?.name || "Customer"}
        profilePhoto={user?.profile_photo || ""}
        showChatbot
        chatbotTitle="Customer Assistant"
        chatbotSubtitle="Pet care, bookings, and account help"
        className="customer-dashboard"
      >
        <section className="dashboard-content">
          <Outlet />
        </section>
      </DashboardLayout>
      <BookingTracker />
    </>
  );
};

export default CustomerDashboard;
