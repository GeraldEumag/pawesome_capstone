import React, { useState, useEffect, useMemo } from "react";
import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMoon,
  faCalendarAlt,
  faUsers,
  faHotel,
  faPaw,
  faBed,
  faPhone,
  faExclamationTriangle,
  faCalendarCheck,
  faClipboardCheck,
  faClock,
  faArrowUp,
  faArrowDown,
  faStethoscope,
  faSearch,
  faNotesMedical,
  faHeartbeat,
  faCircleCheck,
  faEye,
  faUserDoctor,
} from "@fortawesome/free-solid-svg-icons";

import { apiRequest, uploadProfilePhoto } from "../../api/client";
import VeterinarySidebar from "./VeterinarySidebar";
import RoleAwareChatbot from "../chatbot/RoleAwareChatbot";
import NotificationDropdown from "../shared/NotificationDropdown";
import DashboardProfile from "../shared/DashboardProfile";
import toast from "react-hot-toast";
import styled, { createGlobalStyle } from "styled-components";
import {
  FadeIn, ScaleIn, Spinning,
  hoverMixin, glassHoverMixin, focusMixin
} from "../shared/animations";

/* ─────────────────────────────────────────────────────────────
   Pink Glass Theme Design Tokens
───────────────────────────────────────────────────────────── */
const THEME = {
  // Colors
  primary: "#ff5f93",
  primaryLight: "#ff8db5",
  primaryDark: "#ff3d73",
  secondary: "#ff8db5",
  accent: "#ffb3d1",
  
  // Glass effects
  glassBg: "rgba(255,255,255,0.85)",
  glassBorder: "rgba(255,95,147,0.18)",
  glassShadow: "0 18px 45px rgba(255,95,147,0.14)",
  
  // Backgrounds
  pageBg: "linear-gradient(135deg, #fff5f8 0%, #ffe0ec 50%, #fff5f8 100%)",
  cardBg: "rgba(255,255,255,0.9)",
  
  // Text
  textPrimary: "#2d3748",
  textSecondary: "#718096",
  textMuted: "#a0aec0",
  
  // Status
  success: "#48bb78",
  warning: "#ed8936",
  error: "#f56565",
  info: "#4299e1",
};

const GlobalStyle = createGlobalStyle`
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  
  * {
    box-sizing: border-box;
  }
  
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: ${THEME.pageBg};
    margin: 0;
    padding: 0;
  }
`;

/* ─────────────────────────────────────────────────────────────
   Styled Components
───────────────────────────────────────────────────────────── */

const PageContainer = styled.div`
  min-height: 100vh;
  background: ${THEME.pageBg};
  font-family: 'Inter', sans-serif;
`;

const MainContent = styled.main`
  margin-left: 280px;
  min-height: 100vh;
  transition: margin-left 0.3s ease;
  
  &.collapsed {
    margin-left: 90px;
  }
`;

const TopBar = styled.header`
  background: ${THEME.glassBg};
  border: 2px solid ${THEME.glassBorder};
  border-radius: 0 0 24px 24px;
  padding: 24px 32px;
  margin: 0 24px;
  backdrop-filter: blur(20px);
  box-shadow: ${THEME.glassShadow};
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 100;
`;

const TopBarLeft = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const RoleBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: ${THEME.primaryLight};
  color: white;
  padding: 6px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const PageTitle = styled.h1`
  font-size: 28px;
  font-weight: 700;
  color: ${THEME.textPrimary};
  margin: 0;
`;

const PageSubtitle = styled.p`
  color: ${THEME.textSecondary};
  margin: 0;
  font-size: 14px;
`;

const SearchGroup = styled.div`
  position: relative;
  max-width: 400px;
  flex: 1;
  margin: 0 32px;
`;

const SearchInput = styled.input`
  width: 100%;
  height: 44px;
  border-radius: 16px;
  border: 2px solid ${THEME.glassBorder};
  background: ${THEME.glassBg};
  color: ${THEME.textPrimary};
  padding: 0 16px 0 44px;
  font-size: 14px;
  font-weight: 500;
  outline: none;
  transition: all 0.3s ease;
  box-shadow: 0 4px 12px rgba(255,95,147,0.08);
  
  ${focusMixin()}
  
  &::placeholder {
    color: ${THEME.textMuted};
  }
`;

const SearchIcon = styled.div`
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: ${THEME.textMuted};
  pointer-events: none;
`;

const TopBarActions = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

const IconButton = styled.button`
  width: 44px;
  height: 44px;
  border-radius: 16px;
  border: 2px solid ${THEME.glassBorder};
  background: ${THEME.glassBg};
  color: ${THEME.textSecondary};
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 12px rgba(255,95,147,0.08);
  outline: none;
  
  ${glassHoverMixin()}
  ${focusMixin()}
`;

const ContentArea = styled.section`
  padding: 32px;
`;

const HeroSection = styled(FadeIn)`
  background: linear-gradient(135deg, ${THEME.primaryLight} 0%, ${THEME.primary} 100%);
  border-radius: 24px;
  padding: 40px;
  margin-bottom: 32px;
  color: white;
  position: relative;
  overflow: hidden;
  
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grain" width="100" height="100" patternUnits="userSpaceOnUse"><circle cx="25" cy="25" r="1" fill="white" opacity="0.3"/><circle cx="75" cy="75" r="1" fill="white" opacity="0.3"/><circle cx="50" cy="10" r="0.5" fill="white" opacity="0.2"/><circle cx="20" cy="60" r="0.5" fill="white" opacity="0.2"/><circle cx="80" cy="40" r="0.5" fill="white" opacity="0.2"/></pattern></defs><rect width="100" height="100" fill="url(%23grain)"/></svg>');
    opacity: 0.1;
    pointer-events: none;
  }
`;

const HeroContent = styled.div`
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const HeroHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const HeroBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(255,255,255,0.2);
  color: white;
  padding: 8px 16px;
  border-radius: 16px;
  font-size: 14px;
  font-weight: 600;
  width: fit-content;
`;

const HeroTitle = styled.h2`
  font-size: 32px;
  font-weight: 700;
  margin: 0;
  line-height: 1.2;
`;

const HeroText = styled.p`
  font-size: 16px;
  margin: 0;
  opacity: 0.9;
  line-height: 1.5;
`;

const HeroActions = styled.div`
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
`;

const PrimaryButton = styled(NavLink)`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 24px;
  border-radius: 16px;
  background: white;
  color: ${THEME.primary};
  text-decoration: none;
  font-weight: 600;
  font-size: 14px;
  transition: all 0.3s ease;
  box-shadow: 0 8px 20px rgba(0,0,0,0.1);
  
  ${hoverMixin('translateY(-2px)', '0 12px 30px rgba(0,0,0,0.15)')}
`;

const SecondaryButton = styled(NavLink)`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 24px;
  border-radius: 16px;
  background: rgba(255,255,255,0.2);
  color: white;
  text-decoration: none;
  font-weight: 600;
  font-size: 14px;
  border: 2px solid rgba(255,255,255,0.3);
  transition: all 0.3s ease;
  
  &:hover {
    background: rgba(255,255,255,0.3);
    transform: translateY(-2px);
  }
`;

const UpdatePill = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(255,255,255,0.2);
  color: white;
  padding: 8px 16px;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 600;
  width: fit-content;
`;

const Card = styled(FadeIn)`
  background: ${THEME.glassBg};
  border: 2px solid ${THEME.glassBorder};
  border-radius: 24px;
  overflow: hidden;
  backdrop-filter: blur(20px);
  box-shadow: ${THEME.glassShadow};
`;

const CardHeader = styled.div`
  padding: 24px 32px;
  background: linear-gradient(135deg, ${THEME.primaryLight} 0%, ${THEME.primary} 100%);
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const CardTitle = styled.h2`
  color: white;
  font-size: 20px;
  font-weight: 600;
  margin: 0;
`;

const CardSubtitle = styled.p`
  color: rgba(255,255,255,0.9);
  font-size: 14px;
  margin: 4px 0 0 0;
`;

const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  
  ${props => {
    if (props.variant === 'success') {
      return `
        background: ${THEME.success};
        color: white;
      `;
    } else if (props.variant === 'warning') {
      return `
        background: ${THEME.warning};
        color: white;
      `;
    } else if (props.variant === 'error') {
      return `
        background: ${THEME.error};
        color: white;
      `;
    } else if (props.variant === 'info') {
      return `
        background: ${THEME.info};
        color: white;
      `;
    } else {
      return `
        background: ${THEME.primaryLight};
        color: white;
      `;
    }
  }}
`;

const CardContent = styled.div`
  padding: 32px;
`;

const Grid = styled.div`
  display: grid;
  gap: 24px;
  
  ${props => {
    if (props.cols === 2) {
      return 'grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));';
    } else if (props.cols === 4) {
      return 'grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));';
    }
  }}
`;

const StatCard = styled(ScaleIn)`
  background: ${THEME.glassBg};
  border: 2px solid ${THEME.glassBorder};
  border-radius: 20px;
  padding: 24px;
  backdrop-filter: blur(20px);
  box-shadow: ${THEME.glassShadow};
  display: flex;
  align-items: center;
  gap: 16px;
  transition: all 0.3s ease;
  
  ${glassHoverMixin()}
`;

const StatIcon = styled.div`
  width: 56px;
  height: 56px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  color: white;
  
  ${props => {
    if (props.variant === 'success') {
      return `background: linear-gradient(135deg, ${THEME.success}, #38a169);`;
    } else if (props.variant === 'warning') {
      return `background: linear-gradient(135deg, ${THEME.warning}, #dd6b20);`;
    } else if (props.variant === 'error') {
      return `background: linear-gradient(135deg, ${THEME.error}, #e53e3e);`;
    } else if (props.variant === 'info') {
      return `background: linear-gradient(135deg, ${THEME.info}, #3182ce);`;
    } else {
      return `background: linear-gradient(135deg, ${THEME.primary}, ${THEME.primaryDark});`;
    }
  }}
`;

const StatContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const StatValue = styled.h3`
  font-size: 32px;
  font-weight: 700;
  color: ${THEME.textPrimary};
  margin: 0;
`;

const StatTitle = styled.p`
  font-size: 14px;
  font-weight: 600;
  color: ${THEME.textSecondary};
  margin: 0;
`;

const StatSubtitle = styled.small`
  font-size: 12px;
  color: ${THEME.textMuted};
`;

const StatTrend = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  
  ${props => props.positive ? `
    color: ${THEME.success};
  ` : `
    color: ${THEME.error};
  `}
`;

const AlertItem = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-radius: 16px;
  margin-bottom: 12px;
  
  ${props => {
    if (props.variant === 'success') {
      return `
        background: rgba(72, 187, 120, 0.1);
        color: ${THEME.success};
        border: 2px solid rgba(72, 187, 120, 0.2);
      `;
    } else if (props.variant === 'warning') {
      return `
        background: rgba(237, 137, 54, 0.1);
        color: ${THEME.warning};
        border: 2px solid rgba(237, 137, 54, 0.2);
      `;
    } else if (props.variant === 'error') {
      return `
        background: rgba(245, 101, 101, 0.1);
        color: ${THEME.error};
        border: 2px solid rgba(245, 101, 101, 0.2);
      `;
    } else {
      return `
        background: rgba(66, 153, 225, 0.1);
        color: ${THEME.info};
        border: 2px solid rgba(66, 153, 225, 0.2);
      `;
    }
  }}
`;

const AlertContent = styled.div`
  flex: 1;
`;

const AlertTitle = styled.strong`
  display: block;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
`;

const AlertText = styled.p`
  font-size: 12px;
  margin: 0;
  opacity: 0.8;
`;

const AppointmentItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px;
  border-radius: 16px;
  background: rgba(255,255,255,0.5);
  border: 2px solid ${THEME.glassBorder};
  margin-bottom: 12px;
  transition: all 0.3s ease;
  
  ${glassHoverMixin()}
`;

const AppointmentInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

const AppointmentTime = styled.div`
  text-align: center;
  min-width: 80px;
`;

const TimeValue = styled.div`
  font-size: 16px;
  font-weight: 600;
  color: ${THEME.textPrimary};
`;

const TimeStatus = styled.small`
  font-size: 11px;
  color: ${THEME.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const AppointmentDetails = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const PetName = styled.strong`
  font-size: 16px;
  color: ${THEME.textPrimary};
`;

const ServiceInfo = styled.span`
  font-size: 14px;
  color: ${THEME.textSecondary};
`;

const AppointmentActions = styled.div`
  display: flex;
  gap: 8px;
`;

const ActionButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 16px;
  border-radius: 12px;
  border: none;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  
  ${props => {
    if (props.variant === 'primary') {
      return `
        background: ${THEME.primary};
        color: white;
        ${hoverMixin('translateY(-1px)', '0 8px 20px rgba(255,95,147,0.3)')}
      `;
    } else {
      return `
        background: ${THEME.glassBg};
        color: ${THEME.textSecondary};
        border: 2px solid ${THEME.glassBorder};
        ${glassHoverMixin()}
      `;
    }
  }}
`;

const PatientRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-radius: 16px;
  background: rgba(255,255,255,0.5);
  border: 2px solid ${THEME.glassBorder};
  margin-bottom: 12px;
  transition: all 0.3s ease;
  
  ${glassHoverMixin()}
`;

const PatientInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const PatientDetails = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const PatientName = styled.strong`
  font-size: 14px;
  color: ${THEME.textPrimary};
`;

const PatientBreed = styled.p`
  font-size: 12px;
  color: ${THEME.textMuted};
  margin: 0;
`;

const BoarderCard = styled.div`
  background: rgba(255,255,255,0.5);
  border: 2px solid ${THEME.glassBorder};
  border-radius: 20px;
  padding: 24px;
  margin-bottom: 16px;
  backdrop-filter: blur(20px);
  transition: all 0.3s ease;
  
  ${glassHoverMixin()}
`;

const BoarderHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
`;

const BoarderPetInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const BoarderName = styled.h4`
  font-size: 16px;
  font-weight: 600;
  color: ${THEME.textPrimary};
  margin: 0;
`;

const BoarderBreed = styled.p`
  font-size: 12px;
  color: ${THEME.textMuted};
  margin: 2px 0 0 0;
`;

const RoomBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: ${THEME.primaryLight};
  color: white;
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
`;

const BoarderDetails = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
`;

const DetailItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const DetailLabel = styled.strong`
  font-size: 12px;
  color: ${THEME.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const DetailValue = styled.p`
  font-size: 14px;
  color: ${THEME.textPrimary};
  margin: 0;
`;

const SpecialRequests = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: rgba(237, 137, 54, 0.1);
  border: 2px solid rgba(237, 137, 54, 0.2);
  border-radius: 12px;
  margin-bottom: 16px;
  color: ${THEME.warning};
  font-size: 14px;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 60px 20px;
  color: ${THEME.textMuted};
  
  svg {
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.5;
  }
  
  h3 {
    font-size: 18px;
    color: ${THEME.textSecondary};
    margin: 0 0 8px 0;
  }
  
  p {
    font-size: 14px;
    margin: 0;
  }
`;

const VetDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const name = user?.name || "Veterinarian";
  const profilePhoto = user?.profile_photo || "";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [dashboardData, setDashboardData] = useState(null);
  const [currentBoarders, setCurrentBoarders] = useState([]);
  const [loadingBoarders, setLoadingBoarders] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState("");

  const location = useLocation();
  const normalizedPath = location.pathname.replace(/\/+$/, "");
  const showOverview = normalizedPath === "/veterinary" || normalizedPath === "/vet";

  const handleProfilePhotoUpload = async (file) => {
    try {
      const data = await uploadProfilePhoto(file);
      localStorage.setItem("profile_photo", data.url || data.profile_photo);
      window.location.reload();
    } catch (err) {
      toast.error("Failed to upload profile photo: " + err.message);
    }
  };

  const fetchDashboardData = async (options = {}) => {
    try {
      if (!options.silent) {
        setLoading(true);
        setLoadingBoarders(true);
      }

      const [data, boarders] = await Promise.all([
        apiRequest("/veterinary/dashboard"),
        apiRequest("/veterinary/boardings/current-boarders"),
      ]);

      setDashboardData(data || {});
      setCurrentBoarders(Array.isArray(boarders) ? boarders : []);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Vet dashboard fetch error:", err);
      toast.error("Failed to load veterinary dashboard.");
    } finally {
      if (!options.silent) {
        setLoading(false);
        setLoadingBoarders(false);
      }
    }
  };

  useEffect(() => {
    if (showOverview) fetchDashboardData();

    const interval = setInterval(() => {
      if (showOverview) fetchDashboardData();
    }, 15000);

    return () => clearInterval(interval);
  }, [showOverview]);

  const toggleTheme = () => {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  };

  const handleStartAppointment = async (aptId) => {
    try {
      // Find the appointment to check its current status
      const appointment = dashboardData?.upcoming_appointments?.find(apt => apt.id === aptId);
      if (!appointment) {
        toast.error("Appointment not found");
        return;
      }

      // Check if appointment can be started
      if (!['approved', 'scheduled'].includes(appointment.status)) {
        toast.error(`Cannot start appointment with status: ${appointment.status}. Only approved or scheduled appointments can be started.`);
        return;
      }

      await apiRequest(`/veterinary/appointments/${aptId}/start`, {
        method: "POST",
        body: JSON.stringify({ notes: "Appointment started by veterinarian" }),
      });
      toast.success(`Appointment #${aptId} started`);
      fetchDashboardData({ silent: true });
      navigate(`/veterinary/appointments/${aptId}/consult`);
    } catch (err) {
      console.error("Failed to start appointment:", err);
      const errorMessage = err?.response?.data?.message || err?.message || "Failed to start appointment";
      toast.error(errorMessage);
    }
  };

  const summaryCards = useMemo(() => {
    if (!dashboardData) return [];
    
    return [
      {
        title: "Today's Appointments",
        value: dashboardData.today_appointments || 0,
        subtitle: "Scheduled today",
        icon: faCalendarCheck,
        variant: "primary",
        trend: "Live",
        trendUp: null,
      },
      {
        title: "Active Patients",
        value: dashboardData.total_patients || 0,
        subtitle: "Patient records",
        icon: faUsers,
        variant: "info",
        trend: "Live",
        trendUp: null,
      },
      {
        title: "Completed",
        value: dashboardData.completed_appointments || 0,
        subtitle: "This month",
        icon: faClipboardCheck,
        variant: "success",
        trend: "Live",
        trendUp: null,
      },
      {
        title: "Pending",
        value: dashboardData.pending_appointments || 0,
        subtitle: "Awaiting confirmation",
        icon: faClock,
        variant: "warning",
        trend: "Live",
        trendUp: null,
      },
    ];
  }, [dashboardData]);

  const todayAppointments = useMemo(() => {
    if (!dashboardData?.upcoming_appointments) return [];
    
    return dashboardData.upcoming_appointments.map((apt) => ({
      id: apt.id,
      petName: apt.pet?.name || "Pet",
      ownerName: apt.customer?.name || "Customer",
      time: apt.scheduled_at
        ? new Date(apt.scheduled_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "TBD",
      type: apt.service?.name || "Service",
      status: apt.status || "pending",
    }));
  }, [dashboardData]);

  const missedAppointments = useMemo(() => {
    const appointments = dashboardData?.upcoming_appointments || [];
    return appointments.filter(a => a.status === "missed" || a.status === "no-show").length;
  }, [dashboardData]);

  const criticalPatients = useMemo(() => {
    const patients = dashboardData?.recent_patients || [];
    return patients.filter(p => p.status === "critical").length;
  }, [dashboardData]);

  const checkoutsToday = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return currentBoarders.filter(b => {
      const checkout = b.checkout_date || b.end_date;
      return checkout && checkout.startsWith(today);
    }).length;
  }, [currentBoarders]);

  return (
    <>
      <GlobalStyle />
      <PageContainer className={`app-dashboard vet-dashboard ${sidebarCollapsed ? "collapsed" : ""}`}>
        <VeterinarySidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        />

        <MainContent className={`app-main vet-main ${sidebarCollapsed ? "collapsed" : ""}`}>
          <TopBar>
            <TopBarLeft>
              <RoleBadge>
                <FontAwesomeIcon icon={faUserDoctor} />
                Veterinary Role
              </RoleBadge>
              <PageTitle>Veterinary Dashboard</PageTitle>
              <PageSubtitle>Manage appointments, patients, boarders, and clinical workflow.</PageSubtitle>
            </TopBarLeft>

            <SearchGroup>
              <SearchIcon>
                <FontAwesomeIcon icon={faSearch} />
              </SearchIcon>
              <SearchInput
                type="text"
                value={searchTerm}
                placeholder="Search pets, owners, services, boarders..."
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </SearchGroup>

            <TopBarActions>
              <DashboardProfile
                name={name}
                role="Veterinarian"
                image={profilePhoto}
                onUpload={handleProfilePhotoUpload}
              />

              <NotificationDropdown role="veterinary" />

              <IconButton onClick={toggleTheme} title="Toggle theme">
                <FontAwesomeIcon icon={faMoon} />
              </IconButton>
            </TopBarActions>
          </TopBar>

          {showOverview ? (
            <ContentArea>
              <HeroSection>
                <HeroContent>
                  <HeroHeader>
                    <HeroBadge>
                      <FontAwesomeIcon icon={faHeartbeat} />
                      Clinical Command Center
                    </HeroBadge>
                    <HeroTitle>Good day, Dr. {name}</HeroTitle>
                    <HeroText>
                      Track today's appointments, monitor pet records, and handle active boarders from one clean workspace.
                    </HeroText>
                  </HeroHeader>

                  <HeroActions>
                    <PrimaryButton to="/veterinary/appointments">
                      <FontAwesomeIcon icon={faCalendarAlt} />
                      View Appointments
                    </PrimaryButton>
                    <SecondaryButton to="/veterinary/current-boarders">
                      <FontAwesomeIcon icon={faHotel} />
                      View Boarders
                    </SecondaryButton>
                  </HeroActions>

                  <UpdatePill>
                    <FontAwesomeIcon icon={faClock} />
                    Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </UpdatePill>
                </HeroContent>
              </HeroSection>

              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Clinic Alerts</CardTitle>
                    <CardSubtitle>Important updates that may need your attention.</CardSubtitle>
                  </div>
                  <Badge variant="info">Live</Badge>
                </CardHeader>
                <CardContent>
                  {missedAppointments > 0 && (
                    <AlertItem variant="error">
                      <FontAwesomeIcon icon={faExclamationTriangle} />
                      <AlertContent>
                        <AlertTitle>{missedAppointments} Missed Appointment{missedAppointments > 1 ? "s" : ""}</AlertTitle>
                        <AlertText>Review missed or no-show cases.</AlertText>
                      </AlertContent>
                    </AlertItem>
                  )}

                  {criticalPatients > 0 && (
                    <AlertItem variant="warning">
                      <FontAwesomeIcon icon={faStethoscope} />
                      <AlertContent>
                        <AlertTitle>{criticalPatients} Critical Patient{criticalPatients > 1 ? "s" : ""}</AlertTitle>
                        <AlertText>Needs close monitoring.</AlertText>
                      </AlertContent>
                    </AlertItem>
                  )}

                  {checkoutsToday > 0 && (
                    <AlertItem variant="info">
                      <FontAwesomeIcon icon={faBed} />
                      <AlertContent>
                        <AlertTitle>{checkoutsToday} Boarder{checkoutsToday > 1 ? "s" : ""} Checking Out Today</AlertTitle>
                        <AlertText>Prepare discharge or care notes.</AlertText>
                      </AlertContent>
                    </AlertItem>
                  )}

                  {missedAppointments === 0 && criticalPatients === 0 && checkoutsToday === 0 && (
                    <AlertItem variant="success">
                      <FontAwesomeIcon icon={faClipboardCheck} />
                      <AlertContent>
                        <AlertTitle>All systems normal</AlertTitle>
                        <AlertText>No urgent veterinary alerts right now.</AlertText>
                      </AlertContent>
                    </AlertItem>
                  )}
                </CardContent>
              </Card>

              <Grid cols={4}>
                {loading ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <StatCard key={index}>
                      <StatIcon variant="primary">
                        <Spinning>
                          <FontAwesomeIcon icon={faCalendarCheck} />
                        </Spinning>
                      </StatIcon>
                      <StatContent>
                        <StatValue>--</StatValue>
                        <StatTitle>Loading...</StatTitle>
                        <StatSubtitle>Please wait</StatSubtitle>
                      </StatContent>
                    </StatCard>
                  ))
                ) : (
                  summaryCards.map((card, index) => (
                    <StatCard key={card.title} style={{ animationDelay: `${index * 70}ms` }}>
                      <StatIcon variant={card.variant}>
                        <FontAwesomeIcon icon={card.icon} />
                      </StatIcon>
                      <StatContent>
                        <StatValue>{card.value}</StatValue>
                        <StatTitle>{card.title}</StatTitle>
                        <StatSubtitle>{card.subtitle}</StatSubtitle>
                        <StatTrend positive={card.trendUp}>
                          <FontAwesomeIcon icon={card.trendUp ? faArrowUp : faArrowDown} />
                          {card.trend}
                        </StatTrend>
                      </StatContent>
                    </StatCard>
                  ))
                )}
              </Grid>

              <Grid cols={2}>
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>Today's Clinical Queue</CardTitle>
                      <CardSubtitle>Start consultations and complete appointments.</CardSubtitle>
                    </div>
                    <Badge variant="info">
                      {dashboardData?.upcoming_appointments?.length || 0} Cases
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    {dashboardData?.upcoming_appointments?.slice(0, 5).map((apt, idx) => {
                      const status = apt.status || "pending";
                      const isCompleted = status === "completed";
                      const isInProgress = status === "in_progress" || status === "ongoing";
                      const canStart = ["approved", "scheduled"].includes(status);
                      const canConsult = ["in_progress", "treated"].includes(status);

                      return (
                        <AppointmentItem key={apt.id || idx}>
                          <AppointmentInfo>
                            <AppointmentTime>
                              <TimeValue>
                                {apt.scheduled_at
                                  ? new Date(apt.scheduled_at).toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : "TBD"}
                              </TimeValue>
                              <TimeStatus>{status.replace("_", " ")}</TimeStatus>
                            </AppointmentTime>
                            <AppointmentDetails>
                              <PetName>{apt.pet?.name || "Pet"}</PetName>
                              <ServiceInfo>
                                {apt.service?.name || "Service"} • {apt.customer?.name || "Customer"}
                              </ServiceInfo>
                            </AppointmentDetails>
                          </AppointmentInfo>
                          <AppointmentActions>
                            <ActionButton
                              variant="secondary"
                              disabled={isCompleted || (!canStart && !canConsult)}
                              onClick={() => {
                                if (canConsult) {
                                  navigate(`/veterinary/appointments/${apt.id}/consult`);
                                } else {
                                  handleStartAppointment(apt.id || idx);
                                }
                              }}
                            >
                              <FontAwesomeIcon icon={faStethoscope} />
                              {isInProgress ? "Consult" : "Start"}
                            </ActionButton>
                            <ActionButton
                              variant="primary"
                              disabled={isCompleted || !canConsult}
                              onClick={() => navigate(`/veterinary/appointments/${apt.id}/consult`)}
                            >
                              <FontAwesomeIcon icon={faCircleCheck} />
                              {isCompleted ? "Done" : "Finalize"}
                            </ActionButton>
                          </AppointmentActions>
                        </AppointmentItem>
                      );
                    })}

                    {(!dashboardData?.upcoming_appointments || dashboardData.upcoming_appointments.length === 0) && (
                      <EmptyState>
                        <FontAwesomeIcon icon={faCalendarCheck} />
                        <h3>No appointments found</h3>
                        <p>Approved appointments will appear here.</p>
                      </EmptyState>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>Patient Snapshot</CardTitle>
                      <CardSubtitle>Recent patients and treatment status.</CardSubtitle>
                    </div>
                    <Badge variant="warning">
                      {dashboardData?.active_treatments || 0} Active
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    {dashboardData?.recent_patients?.slice(0, 4).map((pet, idx) => {
                      const status = pet.status || "stable";
                      const badgeVariant = status === "critical" ? "error" : 
                                        status === "recovering" ? "warning" : "success";

                      return (
                        <PatientRow key={pet.id || idx}>
                          <PatientInfo>
                            <FontAwesomeIcon icon={faPaw} />
                            <PatientDetails>
                              <PatientName>{pet.name || "Unknown"}</PatientName>
                              <PatientBreed>{pet.species || "Pet"} • {pet.breed || "Unknown breed"}</PatientBreed>
                            </PatientDetails>
                          </PatientInfo>
                          <Badge variant={badgeVariant}>
                            {status}
                          </Badge>
                        </PatientRow>
                      );
                    })}

                    {(!dashboardData?.recent_patients || dashboardData.recent_patients.length === 0) && (
                      <EmptyState>
                        <FontAwesomeIcon icon={faPaw} />
                        <h3>No patient records</h3>
                        <p>Recent pet records will appear here.</p>
                      </EmptyState>
                    )}
                  </CardContent>
                </Card>
              </Grid>

              {currentBoarders.length > 0 && (
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>
                        <FontAwesomeIcon icon={faHotel} /> Current Boarders
                      </CardTitle>
                      <CardSubtitle>Pets currently staying in the pet hotel.</CardSubtitle>
                    </div>
                    <Badge variant="warning">
                      {currentBoarders.length} Pet{currentBoarders.length !== 1 ? "s" : ""}
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    {loadingBoarders ? (
                      <EmptyState>
                        <Spinning>
                          <FontAwesomeIcon icon={faHotel} />
                        </Spinning>
                        <h3>Loading boarders...</h3>
                        <p>Please wait while we fetch current boarders.</p>
                      </EmptyState>
                    ) : (
                      currentBoarders.slice(0, 5).map((boarder) => (
                        <BoarderCard key={boarder.id}>
                          <BoarderHeader>
                            <BoarderPetInfo>
                              <FontAwesomeIcon icon={faPaw} />
                              <div>
                                <BoarderName>{boarder.pet?.name || "Unknown Pet"}</BoarderName>
                                <BoarderBreed>
                                  {boarder.pet?.species || "Pet"} • {boarder.pet?.breed || "Unknown breed"}
                                </BoarderBreed>
                              </div>
                            </BoarderPetInfo>
                            <RoomBadge>
                              <FontAwesomeIcon icon={faBed} />
                              Room {boarder.hotel_room?.room_number || "N/A"}
                            </RoomBadge>
                          </BoarderHeader>

                          <BoarderDetails>
                            <DetailItem>
                              <DetailLabel>Owner</DetailLabel>
                              <DetailValue>{boarder.customer?.name || "Unknown"}</DetailValue>
                            </DetailItem>
                            <DetailItem>
                              <DetailLabel>Contact</DetailLabel>
                              <DetailValue>
                                <FontAwesomeIcon icon={faPhone} /> {boarder.customer?.phone || "N/A"}
                              </DetailValue>
                            </DetailItem>
                            <DetailItem>
                              <DetailLabel>Check-out</DetailLabel>
                              <DetailValue>
                                {boarder.check_out
                                  ? new Date(boarder.check_out).toLocaleDateString("en-PH", {
                                      month: "short",
                                      day: "numeric",
                                      year: "numeric",
                                    })
                                  : "TBD"}
                              </DetailValue>
                            </DetailItem>
                          </BoarderDetails>

                          {boarder.special_requests && (
                            <SpecialRequests>
                              <FontAwesomeIcon icon={faExclamationTriangle} />
                              {boarder.special_requests}
                            </SpecialRequests>
                          )}

                          <PrimaryButton to="/veterinary/customer-profiles">
                            <FontAwesomeIcon icon={faEye} />
                            View Pet Records
                          </PrimaryButton>
                        </BoarderCard>
                      ))
                    )}
                  </CardContent>
                </Card>
              )}

              <Grid cols={2}>
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>Upcoming Appointments</CardTitle>
                      <CardSubtitle>Next approved veterinary schedules.</CardSubtitle>
                    </div>
                    <Badge variant="info">
                      See all ({todayAppointments.length})
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    {todayAppointments.length > 0 ? (
                      todayAppointments.slice(0, 4).map((appointment, index) => (
                        <AppointmentItem key={appointment.id || index}>
                          <AppointmentInfo>
                            <AppointmentTime>
                              <TimeValue>{appointment.time}</TimeValue>
                              <TimeStatus>{appointment.status}</TimeStatus>
                            </AppointmentTime>
                            <AppointmentDetails>
                              <PetName>{appointment.petName}</PetName>
                              <ServiceInfo>
                                {appointment.type} • {appointment.ownerName}
                              </ServiceInfo>
                            </AppointmentDetails>
                          </AppointmentInfo>
                          <AppointmentActions>
                            <ActionButton variant="secondary">
                              <FontAwesomeIcon icon={faEye} />
                              View
                            </ActionButton>
                          </AppointmentActions>
                        </AppointmentItem>
                      ))
                    ) : (
                      <EmptyState>
                        <FontAwesomeIcon icon={faCalendarAlt} />
                        <h3>No upcoming appointments</h3>
                        <p>Approved appointments will appear here.</p>
                      </EmptyState>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>
                        <FontAwesomeIcon icon={faNotesMedical} /> Activity Overview
                      </CardTitle>
                      <CardSubtitle>Simple clinic activity summary.</CardSubtitle>
                    </div>
                    <Badge variant="info">Live</Badge>
                  </CardHeader>
                  <CardContent>
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
                      <div style={{ 
                        flex: 1, 
                        textAlign: 'center',
                        padding: '16px',
                        background: 'rgba(72, 187, 120, 0.1)',
                        borderRadius: '12px',
                        border: '2px solid rgba(72, 187, 120, 0.2)'
                      }}>
                        <strong style={{ fontSize: '24px', color: THEME.success }}>
                          {dashboardData?.today_appointments || 0}
                        </strong>
                        <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: THEME.textMuted }}>
                          Appointments today
                        </p>
                      </div>
                      <div style={{ 
                        flex: 1, 
                        textAlign: 'center',
                        padding: '16px',
                        background: 'rgba(66, 153, 225, 0.1)',
                        borderRadius: '12px',
                        border: '2px solid rgba(66, 153, 225, 0.2)'
                      }}>
                        <strong style={{ fontSize: '24px', color: THEME.info }}>
                          {dashboardData?.pending_appointments || 0}
                        </strong>
                        <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: THEME.textMuted }}>
                          Pending appointments
                        </p>
                      </div>
                    </div>

                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'flex-end', 
                      gap: '8px', 
                      height: '80px',
                      marginBottom: '24px'
                    }}>
                      {[40, 65, 45, 80, 55, 90, 70].map((height, i) => (
                        <div
                          key={i}
                          style={{
                            flex: 1,
                            height: `${height}%`,
                            background: `linear-gradient(to top, ${THEME.primary}, ${THEME.primaryLight})`,
                            borderRadius: '4px 4px 0 0',
                            minHeight: '20px'
                          }}
                        />
                      ))}
                    </div>

                    <div style={{ fontSize: '14px', color: THEME.textSecondary }}>
                      <p style={{ margin: '0 0 8px 0' }}>
                        Total patients: {dashboardData?.total_patients || 0}
                      </p>
                      <p style={{ margin: 0 }}>
                        New this month: {dashboardData?.new_patients_this_month || 0}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Grid>
            </ContentArea>
          ) : (
            <ContentArea>
              <Outlet />
            </ContentArea>
          )}
        </MainContent>

        <RoleAwareChatbot
          mode="widget"
          title="Veterinary Assistant"
          subtitle="Appointments, patient workflow, and dashboard help"
        />
      </PageContainer>
    </>
  );
};

export default VetDashboard;
