import React, { useCallback, useEffect, useMemo, useState } from "react";
import { showConfirm } from "../../utils/alert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarAlt,
  faUser,
  faPaw,
  faStethoscope,
  faEdit,
  faTrash,
  faClock,
  faCheckCircle,
  faTimesCircle,
  faSearch,
  faSpinner,
  faExclamationTriangle,
  faRotateRight,
  faEye,
  faCircleCheck,
  faPlay,
  faNotesMedical,
  faFilter,
  faCalendarDay,
  faChartLine,
  faXmark,
  faMoneyBillWave,
} from "@fortawesome/free-solid-svg-icons";
import { NavLink, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { apiRequest } from "../../api/client";
import PetAvatar from "../shared/PetAvatar";
import styled, { createGlobalStyle } from "styled-components";
import {
  // eslint-disable-next-line no-unused-vars
  slideInUp,
  FadeIn, ScaleIn, SlideInUp, Spinning,
  hoverMixin, glassHoverMixin, focusMixin
} from "../shared/animations";
import "./theme.css";

const GlobalStyle = createGlobalStyle`
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

  * {
    box-sizing: border-box;
  }
`;

/* ─────────────────────────────────────────────────────────────
   Styled Components
───────────────────────────────────────────────────────────── */

const PageContainer = styled.div`
  min-height: 100vh;
  background: var(--veterinary-page-bg);
  padding: 32px;
  font-family: 'Inter', sans-serif;
  color: var(--veterinary-text-primary);

  @media (max-width: 768px) {
    padding: 16px;
  }
`;

const HeroSection = styled(FadeIn)`
  background: linear-gradient(135deg, var(--veterinary-primary-light) 0%, var(--veterinary-primary) 100%);
  border-radius: 24px;
  padding: 40px;
  margin-bottom: 32px;
  color: var(--veterinary-text-on-primary);
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 32px;
  
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
  flex: 1;
`;

const HeroBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--veterinary-glass-bg);
  color: var(--veterinary-text-on-primary);
  padding: 8px 16px;
  border-radius: 16px;
  font-size: 14px;
  font-weight: 600;
  width: fit-content;
  margin-bottom: 16px;
`;

const HeroTitle = styled.h2`
  font-size: 32px;
  font-weight: 700;
  margin: 0 0 12px 0;
  display: flex;
  align-items: center;
  gap: 12px;
`;

const HeroText = styled.p`
  font-size: 16px;
  margin: 0;
  opacity: 0.9;
  line-height: 1.5;
`;

const HeroActions = styled.div`
  position: relative;
  z-index: 1;
  display: flex;
  gap: 16px;
  align-items: center;
`;

const RefreshButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 20px;
  border-radius: 16px;
  background: var(--veterinary-glass-bg);
  color: var(--veterinary-text-on-primary);
  border: 2px solid var(--veterinary-glass-border);
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s ease;
  
  &:hover {
    background: var(--veterinary-card-bg);
    transform: translateY(-2px);
  }
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }
`;

const ErrorAlert = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-radius: 16px;
  background: rgba(245, 101, 101, 0.1);
  border: 2px solid rgba(245, 101, 101, 0.2);
  color: var(--veterinary-error);
  margin-bottom: 32px;
  font-weight: 500;
`;

const SummarySection = styled(ScaleIn)`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 32px;
`;

const SummaryCard = styled.div`
  background: var(--veterinary-glass-bg);
  border: 2px solid var(--veterinary-glass-border);
  border-radius: 20px;
  padding: 24px;
  backdrop-filter: blur(20px);
  box-shadow: var(--veterinary-glass-shadow);
  display: flex;
  align-items: center;
  gap: 16px;
  transition: all 0.3s ease;
  
  ${glassHoverMixin()}
`;

const SummaryIcon = styled.div`
  width: 56px;
  height: 56px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: var(--veterinary-text-on-primary);
  
  ${props => {
    if (props.variant === 'today') {
      return `background: linear-gradient(135deg, var(--veterinary-primary), var(--veterinary-primary-dark));`;
    } else if (props.variant === 'pending') {
      return `background: linear-gradient(135deg, var(--veterinary-warning), #dd6b20);`;
    } else if (props.variant === 'approved') {
      return `background: linear-gradient(135deg, var(--veterinary-info), #3182ce);`;
    } else if (props.variant === 'completed') {
      return `background: linear-gradient(135deg, var(--veterinary-success), #38a169);`;
    }
  }}
`;

const SummaryContent = styled.div`
  flex: 1;
`;

const SummaryTitle = styled.h3`
  font-size: 14px;
  font-weight: 600;
  color: var(--veterinary-text-secondary);
  margin: 0 0 4px 0;
`;

const SummaryValue = styled.div`
  font-size: 24px;
  font-weight: 700;
  color: var(--veterinary-text-primary);
`;

const ControlsSection = styled(SlideInUp)`
  background: var(--veterinary-glass-bg);
  border: 2px solid var(--veterinary-glass-border);
  border-radius: 24px;
  padding: 32px;
  margin-bottom: 32px;
  backdrop-filter: blur(20px);
  box-shadow: var(--veterinary-glass-shadow);
`;

const SearchFilterContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const SearchBox = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

const SearchIcon = styled.div`
  position: absolute;
  left: 16px;
  color: var(--veterinary-text-muted);
  pointer-events: none;
`;

const SearchInput = styled.input`
  width: 100%;
  height: 48px;
  border-radius: 16px;
  border: 2px solid var(--veterinary-glass-border);
  background: var(--veterinary-glass-bg);
  color: var(--veterinary-text-primary);
  padding: 0 16px 0 44px;
  font-size: 14px;
  font-weight: 500;
  outline: none;
  transition: all 0.3s ease;
  box-shadow: 0 4px 12px rgba(255,95,147,0.08);
  
  ${focusMixin()}
  
  &::placeholder {
    color: var(--veterinary-text-muted);
  }
`;

const ClearButton = styled.button`
  position: absolute;
  right: 12px;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: var(--veterinary-text-muted);
  color: var(--veterinary-text-on-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  
  &:hover {
    background: var(--veterinary-error);
  }
`;

const FilterLabel = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--veterinary-text-secondary);
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 12px;
`;

const FilterButtons = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
`;

const FilterButton = styled.button`
  padding: 8px 16px;
  border-radius: 12px;
  border: 2px solid var(--veterinary-glass-border);
  background: var(--veterinary-glass-bg);
  color: var(--veterinary-text-secondary);
  font-weight: 600;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
  
  ${props => props.$active ? `
    background: var(--veterinary-primary);
    color: var(--veterinary-text-on-primary);
    border-color: var(--veterinary-primary);
    ${hoverMixin('translateY(-1px)', '0 8px 20px rgba(255,95,147,0.3)')}
  ` : `
    ${glassHoverMixin()}
  `}
`;

const LastUpdated = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--veterinary-text-muted);
  font-size: 12px;
  font-weight: 500;
`;

const AppointmentsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 24px;
  margin-bottom: 32px;
`;

const AppointmentCard = styled(FadeIn)`
  background: var(--veterinary-glass-bg);
  border: 2px solid var(--veterinary-glass-border);
  border-radius: 24px;
  overflow: hidden;
  backdrop-filter: blur(20px);
  box-shadow: var(--veterinary-glass-shadow);
  transition: all 0.3s ease;
  
  ${glassHoverMixin()}
`;

const CardHeader = styled.div`
  padding: 24px;
  background: linear-gradient(135deg, var(--veterinary-primary-light) 0%, var(--veterinary-primary) 100%);
  color: var(--veterinary-text-on-primary);
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const AppointmentInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const PetName = styled.h3`
  font-size: 18px;
  font-weight: 700;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const OwnerName = styled.p`
  font-size: 14px;
  margin: 0;
  opacity: 0.9;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const StatusBadge = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  background: var(--veterinary-card-bg);
  color: var(--veterinary-primary);
  border: 1px solid var(--veterinary-glass-border);
  white-space: nowrap;
`;

const CardContent = styled.div`
  padding: 24px;
`;

const DetailsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 24px;
`;

const DetailItem = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const DetailIcon = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: rgba(255,95,147,0.1);
  color: var(--veterinary-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const DetailContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const DetailLabel = styled.strong`
  display: block;
  font-size: 12px;
  color: var(--veterinary-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
`;

const DetailValue = styled.p`
  font-size: 14px;
  color: var(--veterinary-text-primary);
  margin: 0;
  font-weight: 500;
`;

const ActionsList = styled.div`
  display: flex;
  flex-wrap: wrap;
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
  text-decoration: none;
  
  ${props => {
    if (props.variant === 'primary') {
      return `
        background: var(--veterinary-primary);
        color: var(--veterinary-text-on-primary);
        ${hoverMixin('translateY(-1px)', '0 8px 20px rgba(255,95,147,0.3)')}
      `;
    } else if (props.variant === 'success') {
      return `
        background: var(--veterinary-success);
        color: var(--veterinary-text-on-primary);
        ${hoverMixin('translateY(-1px)', '0 8px 20px rgba(72,187,120,0.3)')}
      `;
    } else if (props.variant === 'warning') {
      return `
        background: var(--veterinary-warning);
        color: var(--veterinary-text-on-primary);
        ${hoverMixin('translateY(-1px)', '0 8px 20px rgba(237,137,54,0.3)')}
      `;
    } else if (props.variant === 'danger') {
      return `
        background: var(--veterinary-error);
        color: var(--veterinary-text-on-primary);
        ${hoverMixin('translateY(-1px)', '0 8px 20px rgba(245,101,101,0.3)')}
      `;
    } else {
      return `
        background: var(--veterinary-glass-bg);
        color: var(--veterinary-text-secondary);
        border: 2px solid var(--veterinary-glass-border);
        ${glassHoverMixin()}
      `;
    }
  }}
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none !important;
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 80px 20px;
  color: var(--veterinary-text-muted);
  
  svg {
    font-size: 64px;
    margin-bottom: 24px;
    opacity: 0.5;
  }
  
  h3 {
    font-size: 20px;
    color: var(--veterinary-text-secondary);
    margin: 0 0 12px 0;
  }
  
  p {
    font-size: 16px;
    margin: 0;
  }
`;

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
`;

const Modal = styled.div`
  background: var(--veterinary-glass-bg);
  border: 2px solid var(--veterinary-glass-border);
  border-radius: 24px;
  max-width: 600px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  backdrop-filter: blur(20px);
  box-shadow: var(--veterinary-glass-shadow);
  animation: slideInUp 0.3s ease;
`;

const ModalHeader = styled.div`
  padding: 24px;
  background: linear-gradient(135deg, var(--veterinary-primary-light) 0%, var(--veterinary-primary) 100%);
  color: var(--veterinary-text-on-primary);
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const ModalTitle = styled.div`
  flex: 1;
`;

const ModalBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--veterinary-glass-bg);
  color: var(--veterinary-text-on-primary);
  padding: 6px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 12px;
`;

const ModalName = styled.h3`
  font-size: 20px;
  font-weight: 700;
  margin: 0 0 4px 0;
`;

const ModalOwner = styled.p`
  font-size: 14px;
  margin: 0;
  opacity: 0.9;
`;

const CloseButton = styled.button`
  width: 36px;
  height: 36px;
  border-radius: 12px;
  border: none;
  background: var(--veterinary-glass-bg);
  color: var(--veterinary-text-on-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  
  &:hover {
    background: var(--veterinary-card-bg);
  }
`;

const ModalBody = styled.div`
  padding: 24px;
`;

const ModalDetails = styled.div`
  display: grid;
  gap: 20px;
`;

const ModalDetail = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  
  ${props => props.full && `
    flex-direction: column;
    align-items: flex-start;
  `}
`;

const ModalActions = styled.div`
  padding: 24px;
  border-top: 2px solid var(--veterinary-glass-border);
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
`;

const LoadingSpinner = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  color: var(--veterinary-primary);
  
  svg {
    font-size: 48px;
    margin-bottom: 16px;
  }
  
  span {
    font-size: 16px;
    font-weight: 600;
  }
`;

const VetAppointments = () => {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState([]);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const safeArray = (value) => {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.appointments)) return value.appointments;
    if (Array.isArray(value?.data)) return value.data;
    if (Array.isArray(value?.records)) return value.records;
    return [];
  };

  const formatDate = (value) => {
    if (!value) return "TBD";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "TBD";

    return date.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatDateKey = (value) => {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    return date.toISOString().split("T")[0];
  };

  const formatTime = (value) => {
    if (!value) return "TBD";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "TBD";

    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const normalizeStatus = (status) => {
    return String(status || "pending").toLowerCase().replace(/\s+/g, "_");
  };

  const transformAppointment = useCallback((apt) => {
    const scheduledAt =
      apt?.scheduled_at ||
      apt?.appointment_date ||
      apt?.date ||
      apt?.schedule ||
      null;

    const petName =
      apt?.pet?.name ||
      apt?.pet_name ||
      apt?.patient_name ||
      "Unknown Pet";

    const ownerName =
      apt?.customer?.name ||
      apt?.owner?.name ||
      apt?.customer_name ||
      apt?.owner_name ||
      "Unknown Owner";

    const ownerPhone =
      apt?.customer?.phone ||
      apt?.owner?.phone ||
      apt?.customer_phone ||
      apt?.phone ||
      "N/A";

    const serviceName =
      apt?.service?.name ||
      apt?.service_name ||
      apt?.appointment_type ||
      apt?.type ||
      "General Consultation";

    return {
      id: apt?.id,
      raw: apt,
      pet: petName,
      owner: ownerName,
      ownerPhone,
      species: apt?.pet?.species || apt?.species || "Pet",
      breed: apt?.pet?.breed || apt?.breed || "Unknown breed",
      date: formatDate(scheduledAt),
      dateKey: formatDateKey(scheduledAt),
      time: formatTime(scheduledAt),
      service: serviceName,
      price: apt?.price || apt?.amount || apt?.total_amount || null,
      status: normalizeStatus(apt?.status),
      notes: apt?.notes || apt?.reason || apt?.description || "",
      scheduledAt,
      createdAt: apt?.created_at || apt?.createdAt || null,
    };
  }, []);

  const fetchAppointments = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      const data = await apiRequest("/veterinary/appointments");
      const appointmentsData = safeArray(data);
      const transformedAppointments = appointmentsData.map(transformAppointment);

      setAppointments(transformedAppointments);
      setLastUpdated(new Date());
      setError("");
    } catch (err) {
      console.error("Failed to fetch appointments:", err);
      setError("Failed to load appointments. Please try again.");
      setAppointments([]);

      if (!silent) {
        toast.error("Failed to load veterinary appointments.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [transformAppointment]);

  useEffect(() => {
    fetchAppointments({ silent: false });

    const interval = setInterval(() => {
      fetchAppointments({ silent: true });
    }, 15000);

    return () => clearInterval(interval);
  }, [fetchAppointments]);

  const statusOptions = useMemo(
    () => [
      { key: "all", label: "All" },
      { key: "pending", label: "Incoming" },
      { key: "approved", label: "Approved" },
      { key: "in_progress", label: "Ongoing" },
      { key: "awaiting_payment", label: "Awaiting Payment" },
      { key: "completed", label: "Completed" },
      { key: "cancelled", label: "Cancelled" },
    ],
    []
  );

  const statusCounts = useMemo(() => {
    return appointments.reduce(
      (acc, appointment) => {
        acc.all += 1;
        acc[appointment.status] = (acc[appointment.status] || 0) + 1;
        return acc;
      },
      {
        all: 0,
        pending: 0,
        approved: 0,
        in_progress: 0,
        awaiting_payment: 0,
        completed: 0,
        cancelled: 0,
      }
    );
  }, [appointments]);

  const filteredAppointments = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    return appointments.filter((appointment) => {
      const matchesFilter = filter === "all" || appointment.status === filter;

      const searchableText = [
        appointment.pet,
        appointment.owner,
        appointment.ownerPhone,
        appointment.species,
        appointment.breed,
        appointment.service,
        appointment.status,
        appointment.notes,
        appointment.date,
        appointment.time,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !keyword || searchableText.includes(keyword);

      return matchesFilter && matchesSearch;
    });
  }, [appointments, filter, searchTerm]);

  const todayKey = new Date().toISOString().split("T")[0];

  const dashboardStats = useMemo(() => {
    const todayCount = appointments.filter((item) => item.dateKey === todayKey).length;
    const completedCount = appointments.filter((item) => item.status === "completed").length;
    const pendingCount = appointments.filter((item) => item.status === "pending").length;
    const approvedCount = appointments.filter((item) => item.status === "approved").length;
    const ongoingCount = appointments.filter((item) => item.status === "in_progress").length;
    const awaitingPaymentCount = appointments.filter((item) => item.status === "awaiting_payment").length;
    const completionRate =
      appointments.length > 0
        ? Math.round((completedCount / appointments.length) * 100)
        : 0;

    return {
      todayCount,
      completedCount,
      pendingCount,
      approvedCount,
      ongoingCount,
      awaitingPaymentCount,
      completionRate,
    };
  }, [appointments, todayKey]);

  const getStatusIcon = (status) => {
    switch (status) {
      case "approved":
        return faCheckCircle;
      case "in_progress":
        return faPlay;
      case "awaiting_payment":
        return faMoneyBillWave;
      case "completed":
        return faCircleCheck;
      case "cancelled":
      case "canceled":
      case "rejected":
        return faTimesCircle;
      case "pending":
      default:
        return faClock;
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case "in_progress":
        return "Ongoing";
      case "no_show":
        return "No Show";
      default:
        return String(status || "Pending")
          .replace(/_/g, " ")
          .replace(/\b\w/g, (char) => char.toUpperCase());
    }
  };

  const updateAppointmentStatus = async (appointmentId, nextStatus) => {
    if (!appointmentId) {
      toast.error("Appointment ID not found.");
      return;
    }

    try {
      setActionLoadingId(`${appointmentId}-${nextStatus}`);

      if (nextStatus === "in_progress") {
        await apiRequest(`/veterinary/appointments/${appointmentId}/start`, {
          method: "POST",
          body: JSON.stringify({ notes: "Appointment started by veterinarian" }),
        });
      } else if (nextStatus === "completed") {
        await apiRequest(`/veterinary/appointments/${appointmentId}/complete`, {
          method: "POST",
          body: JSON.stringify({ notes: "Appointment completed by veterinarian" }),
        });
      } else {
        await apiRequest(`/veterinary/appointments/${appointmentId}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: nextStatus }),
        });
      }

      toast.success(`Appointment marked as ${getStatusLabel(nextStatus)}.`);
      await fetchAppointments({ silent: true });

      if (nextStatus === "in_progress") {
        navigate(`/veterinary/appointments/${appointmentId}/consult`);
      }
    } catch (err) {
      console.error("Failed to update appointment:", err);
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to update appointment status.";
      toast.error(errorMessage);
    } finally {
      setActionLoadingId(null);
    }
  };

  const cancelAppointment = async (appointmentId) => {
    if (!appointmentId) {
      toast.error("Appointment ID not found.");
      return;
    }

    const confirmCancel = await showConfirm(
      "Cancel this appointment? This will update its status to cancelled."
    );

    if (!confirmCancel) return;

    await updateAppointmentStatus(appointmentId, "cancelled");
  };

  const handleRefresh = () => {
    fetchAppointments({ silent: true });
    toast.success("Appointments refreshed.");
  };

  if (loading) {
    return (
      <>
        <GlobalStyle />
        <PageContainer style={{ background: `var(--veterinary-page-bg)` }} className="theme-light">
          <LoadingSpinner>
            <Spinning>
              <FontAwesomeIcon icon={faSpinner} />
            </Spinning>
            <span>Loading veterinary appointments...</span>
          </LoadingSpinner>
        </PageContainer>
      </>
    );
  }

  return (
    <>
      <GlobalStyle />
      <PageContainer style={{ background: `var(--veterinary-page-bg)` }} className="theme-light">
        <HeroSection style={{ background: `linear-gradient(135deg, var(--veterinary-primary-light) 0%, var(--veterinary-primary) 100%)` }}>
          <HeroContent>
            <HeroBadge>
              <FontAwesomeIcon icon={faStethoscope} />
              Veterinary Schedule
            </HeroBadge>
            <HeroTitle>
              <FontAwesomeIcon icon={faCalendarAlt} />
              Appointments Management
            </HeroTitle>
            <HeroText>
              Manage veterinary consultations, monitor schedules, and update appointment status.
            </HeroText>
          </HeroContent>

          <HeroActions>
            <RefreshButton
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <FontAwesomeIcon icon={faRotateRight} className={refreshing ? "spin" : ""} />
              {refreshing ? "Refreshing..." : "Refresh"}
            </RefreshButton>
          </HeroActions>
        </HeroSection>

        {error && (
          <ErrorAlert>
            <FontAwesomeIcon icon={faExclamationTriangle} />
            <span>{error}</span>
          </ErrorAlert>
        )}

        <SummarySection>
          <SummaryCard>
            <SummaryIcon variant="today">
              <FontAwesomeIcon icon={faCalendarDay} />
            </SummaryIcon>
            <SummaryContent>
              <SummaryTitle>Today</SummaryTitle>
              <SummaryValue>{dashboardStats.todayCount} appointments</SummaryValue>
            </SummaryContent>
          </SummaryCard>

          <SummaryCard>
            <SummaryIcon variant="pending">
              <FontAwesomeIcon icon={faClock} />
            </SummaryIcon>
            <SummaryContent>
              <SummaryTitle>Pending</SummaryTitle>
              <SummaryValue>{dashboardStats.pendingCount} waiting</SummaryValue>
            </SummaryContent>
          </SummaryCard>

          <SummaryCard>
            <SummaryIcon variant="approved">
              <FontAwesomeIcon icon={faCheckCircle} />
            </SummaryIcon>
            <SummaryContent>
              <SummaryTitle>Approved</SummaryTitle>
              <SummaryValue>{dashboardStats.approvedCount} ready</SummaryValue>
            </SummaryContent>
          </SummaryCard>

          <SummaryCard>
            <SummaryIcon variant="completed">
              <FontAwesomeIcon icon={faChartLine} />
            </SummaryIcon>
            <SummaryContent>
              <SummaryTitle>Completion Rate</SummaryTitle>
              <SummaryValue>{dashboardStats.completionRate}%</SummaryValue>
            </SummaryContent>
          </SummaryCard>
        </SummarySection>

        <ControlsSection>
          <SearchFilterContainer>
            <SearchBox>
              <SearchIcon>
                <FontAwesomeIcon icon={faSearch} />
              </SearchIcon>
              <SearchInput
                type="text"
                placeholder="Search by pet, owner, service, status, or notes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />

              {searchTerm && (
                <ClearButton
                  type="button"
                  onClick={() => setSearchTerm("")}
                  aria-label="Clear search"
                >
                  <FontAwesomeIcon icon={faXmark} />
                </ClearButton>
              )}
            </SearchBox>

            <FilterLabel>
              <FontAwesomeIcon icon={faFilter} />
              Filters
            </FilterLabel>

            <FilterButtons>
              {statusOptions.map((status) => (
                <FilterButton
                  key={status.key}
                  $active={filter === status.key}
                  type="button"
                  onClick={() => setFilter(status.key)}
                >
                  {status.label} ({statusCounts[status.key] || 0})
                </FilterButton>
              ))}
            </FilterButtons>
          </SearchFilterContainer>

          <LastUpdated>
            <FontAwesomeIcon icon={faClock} />
            Last updated:{" "}
            {lastUpdated.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </LastUpdated>
        </ControlsSection>

        <AppointmentsGrid>
          {filteredAppointments.map((appointment) => {
            const isCompleted = appointment.status === "completed";
            const isCancelled =
              appointment.status === "cancelled" ||
              appointment.status === "canceled" ||
              appointment.status === "rejected";

            const isUnassignedPending =
              appointment.status === "pending" &&
              (!appointment.raw?.veterinarian_id && appointment.raw?.veterinarian_id !== 0);

            const canStart = ["approved", "scheduled"].includes(appointment.status);

            const canConsult = ["in_progress", "treated"].includes(appointment.status);
            const canComplete = canConsult;

            return (
              <AppointmentCard key={appointment.id || `${appointment.pet}-${appointment.time}`}>
                <CardHeader>
                  <AppointmentInfo>
                    <PetName>
                      <FontAwesomeIcon icon={faPaw} />
                      {appointment.pet}
                    </PetName>
                    <OwnerName>
                      <FontAwesomeIcon icon={faUser} />
                      {appointment.owner}
                    </OwnerName>
                  </AppointmentInfo>

                  <StatusBadge>
                    <FontAwesomeIcon icon={getStatusIcon(appointment.status)} />
                    <span>{isUnassignedPending ? "Incoming" : getStatusLabel(appointment.status)}</span>
                  </StatusBadge>
                  {isUnassignedPending && (
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--veterinary-warning)", marginLeft: "8px" }}>
                      Unassigned
                    </span>
                  )}
                </CardHeader>

                <CardContent>
                  <DetailsList>
                    <DetailItem>
                      <DetailIcon>
                        <FontAwesomeIcon icon={faCalendarAlt} />
                      </DetailIcon>
                      <DetailContent>
                        <DetailLabel>Date & Time</DetailLabel>
                        <DetailValue>
                          {appointment.date} at {appointment.time}
                        </DetailValue>
                      </DetailContent>
                    </DetailItem>

                    <DetailItem>
                      <DetailIcon>
                        <FontAwesomeIcon icon={faStethoscope} />
                      </DetailIcon>
                      <DetailContent>
                        <DetailLabel>Service</DetailLabel>
                        <DetailValue>{appointment.service}</DetailValue>
                      </DetailContent>
                    </DetailItem>

                    <DetailItem>
                      <DetailIcon>
                        <FontAwesomeIcon icon={faPaw} />
                      </DetailIcon>
                      <DetailContent>
                        <DetailLabel>Patient</DetailLabel>
                        <DetailValue>
                          {appointment.species} • {appointment.breed}
                        </DetailValue>
                      </DetailContent>
                    </DetailItem>

                    {appointment.price && (
                      <DetailItem>
                        <DetailIcon>
                          <FontAwesomeIcon icon={faMoneyBillWave} />
                        </DetailIcon>
                        <DetailContent>
                          <DetailLabel>Price</DetailLabel>
                          <DetailValue>₱{Number(appointment.price).toFixed(2)}</DetailValue>
                        </DetailContent>
                      </DetailItem>
                    )}

                    {appointment.notes && (
                      <DetailItem>
                        <DetailIcon>
                          <FontAwesomeIcon icon={faNotesMedical} />
                        </DetailIcon>
                        <DetailContent>
                          <DetailLabel>Notes</DetailLabel>
                          <DetailValue>{appointment.notes}</DetailValue>
                        </DetailContent>
                      </DetailItem>
                    )}
                  </DetailsList>

                  <ActionsList>
                    <ActionButton
                      variant="secondary"
                      type="button"
                      onClick={() => setSelectedAppointment(appointment)}
                    >
                      <FontAwesomeIcon icon={faEye} />
                      View
                    </ActionButton>

                    {!isUnassignedPending && (
                      <>
                        <ActionButton
                          variant="success"
                          type="button"
                          disabled={!canStart || actionLoadingId === `${appointment.id}-in_progress`}
                          onClick={() => updateAppointmentStatus(appointment.id, "in_progress")}
                        >
                          <FontAwesomeIcon icon={faPlay} />
                          Start
                        </ActionButton>

                        <ActionButton
                          variant="primary"
                          type="button"
                          disabled={!canComplete || actionLoadingId === `${appointment.id}-completed` || appointment.status === "awaiting_payment"}
                          onClick={() => navigate(`/veterinary/appointments/${appointment.id}/consult`)}
                        >
                          <FontAwesomeIcon icon={faCircleCheck} />
                          {appointment.status === "awaiting_payment" ? "Awaiting Payment" : "Consult"}
                        </ActionButton>

                        <ActionButton
                          as={NavLink}
                          variant="secondary"
                          to={`/veterinary/appointments/${appointment.id}/edit`}
                          style={{ pointerEvents: appointment.status === "awaiting_payment" ? "none" : "auto", opacity: appointment.status === "awaiting_payment" ? 0.5 : 1 }}
                        >
                          <FontAwesomeIcon icon={faEdit} />
                          Edit
                        </ActionButton>

                        <ActionButton
                          variant="danger"
                          type="button"
                          disabled={isCompleted || isCancelled || appointment.status === "awaiting_payment"}
                          onClick={() => cancelAppointment(appointment.id)}
                        >
                          <FontAwesomeIcon icon={faTrash} />
                          Cancel
                        </ActionButton>
                      </>
                    )}
                  </ActionsList>
                </CardContent>
              </AppointmentCard>
            );
          })}
        </AppointmentsGrid>

        {filteredAppointments.length === 0 && (
          <EmptyState>
            <FontAwesomeIcon icon={faCalendarAlt} />
            <h3>No appointments found</h3>
            <p>
              {searchTerm
                ? "Try another pet name, owner name, service, or status."
                : "No appointments match the current filter."}
            </p>
          </EmptyState>
        )}

        {selectedAppointment && (
          <ModalOverlay onClick={() => setSelectedAppointment(null)}>
            <Modal onClick={(e) => e.stopPropagation()}>
              <ModalHeader>
                <ModalTitle>
                  <ModalBadge>
                    <FontAwesomeIcon icon={faNotesMedical} />
                    Appointment Details
                  </ModalBadge>
                  <ModalName>{selectedAppointment.pet}</ModalName>
                  <ModalOwner>{selectedAppointment.owner}</ModalOwner>
                </ModalTitle>

                <CloseButton
                  type="button"
                  onClick={() => setSelectedAppointment(null)}
                >
                  <FontAwesomeIcon icon={faXmark} />
                </CloseButton>
              </ModalHeader>

              <ModalBody>
                <ModalDetails>
                  <ModalDetail>
                    <strong>Status</strong>
                    <StatusBadge>
                      <FontAwesomeIcon icon={getStatusIcon(selectedAppointment.status)} />
                      {getStatusLabel(selectedAppointment.status)}
                    </StatusBadge>
                  </ModalDetail>

                  <ModalDetail>
                    <strong>Date</strong>
                    <p>{selectedAppointment.date}</p>
                  </ModalDetail>

                  <ModalDetail>
                    <strong>Time</strong>
                    <p>{selectedAppointment.time}</p>
                  </ModalDetail>

                  <ModalDetail>
                    <strong>Service</strong>
                    <p>{selectedAppointment.service}</p>
                  </ModalDetail>

                  <ModalDetail>
                    <strong>Patient</strong>
                    <p>
                      {selectedAppointment.species} • {selectedAppointment.breed}
                    </p>
                  </ModalDetail>

                  <ModalDetail>
                    <strong>Owner Contact</strong>
                    <p>{selectedAppointment.ownerPhone}</p>
                  </ModalDetail>

                  <ModalDetail full>
                    <strong>Notes</strong>
                    <p>{selectedAppointment.notes || "No notes provided."}</p>
                  </ModalDetail>
                </ModalDetails>
              </ModalBody>

              <ModalActions>
                <ActionButton
                  variant="success"
                  type="button"
                  disabled={
                    !["approved", "scheduled"].includes(selectedAppointment.status)
                  }
                  onClick={() => updateAppointmentStatus(selectedAppointment.id, "in_progress")}
                >
                  <FontAwesomeIcon icon={faPlay} />
                  Start
                </ActionButton>

                <ActionButton
                  variant="primary"
                  type="button"
                  disabled={
                    !["in_progress", "treated", "awaiting_payment"].includes(selectedAppointment.status)
                  }
                  onClick={() => navigate(`/veterinary/appointments/${selectedAppointment.id}/consult`)}
                >
                  <FontAwesomeIcon icon={faCircleCheck} />
                  {selectedAppointment.status === "awaiting_payment" ? "View (Awaiting Pay)" : "Consult"}
                </ActionButton>

                <ActionButton
                  variant="danger"
                  type="button"
                  disabled={
                    selectedAppointment.status === "completed" ||
                    selectedAppointment.status === "cancelled" ||
                    selectedAppointment.status === "awaiting_payment"
                  }
                  onClick={() => cancelAppointment(selectedAppointment.id)}
                >
                  <FontAwesomeIcon icon={faTrash} />
                  Cancel
                </ActionButton>
              </ModalActions>
            </Modal>
          </ModalOverlay>
        )}
      </PageContainer>
    </>
  );
};

export default VetAppointments;
