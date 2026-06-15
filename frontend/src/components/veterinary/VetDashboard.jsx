import { useState, useEffect } from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { showError } from "../../utils/alert.jsx";
import { useAuth } from "../../context/AuthContext";
import {
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
  faRotateRight,
  faNotesMedical,
  faHeartbeat,
  faCircleCheck,
  faEye,
  faUserDoctor,
} from "@fortawesome/free-solid-svg-icons";

import { apiRequest, uploadProfilePhoto } from "../../api/client";
import VeterinarySidebar from "./VeterinarySidebar";
import DashboardLayout from "../shared/DashboardLayout";
import toast from "react-hot-toast";
import "./theme.css";
import styled from "styled-components";
import {
  fadeIn, fadeInUp, slideInUp, scaleIn, pulse,
  FadeIn, ScaleIn, SlideInUp, Spinning, Glowing,
  useScrollAnimation, useLoadingAnimation,
  hoverMixin, glassHoverMixin, focusMixin
} from "../shared/animations";

const VetDashboard = () => {
  const { user, updateUser } = useAuth();
  const name = user?.name || "Veterinarian";
  const profilePhoto = user?.profile_photo || "";
  const [dashboardData, setDashboardData] = useState(null);
  const [currentBoarders, setCurrentBoarders] = useState([]);
  const [loadingBoarders, setLoadingBoarders] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const handleProfilePhotoUpload = async (file) => {
    try {
      const data = await uploadProfilePhoto(file);
      const photoUrl = data?.profile_photo || data?.url || "";
      if (photoUrl) updateUser({ profile_photo: photoUrl });
    } catch (err) {
      showError("Failed to upload profile photo: " + err.message);
    }
  };

  const location = useLocation();
  const normalizedPath = location.pathname.replace(/\/+$/, "");
  const showOverview = normalizedPath === "/veterinary" || normalizedPath === "/vet";


  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setLoadingBoarders(true);

        const [data, boarders] = await Promise.all([
          apiRequest("/veterinary/dashboard"),
          apiRequest("/veterinary/boardings/current-boarders"),
        ]);

        setDashboardData(data);
        setCurrentBoarders(Array.isArray(boarders) ? boarders : []);
        setLastUpdated(new Date());
      } catch {
        setDashboardData(null);
        setCurrentBoarders([]);
      } finally {
        setLoading(false);
        setLoadingBoarders(false);
      }
    };

    if (showOverview) fetchDashboardData();

    // Real-time updates: poll every 5 seconds
    const interval = setInterval(() => {
      if (showOverview) fetchDashboardData();
    }, 30000);

    return () => clearInterval(interval);
  }, [showOverview]);

  const summaryCards = dashboardData
    ? [
        {
          title: "Today's Appointments",
          value: dashboardData.today_appointments || 0,
          subtitle: "Scheduled today",
          icon: faCalendarCheck,
          iconClass: "appointments",
          trend: "Live",
          trendUp: null,
        },
        {
          title: "Active Patients",
          value: dashboardData.total_patients || 0,
          subtitle: "Patient records",
          icon: faUsers,
          iconClass: "patients",
          trend: "Live",
          trendUp: null,
        },
        {
          title: "Completed",
          value: dashboardData.completed_appointments || 0,
          subtitle: "This month",
          icon: faClipboardCheck,
          iconClass: "completed",
          trend: "Live",
          trendUp: null,
        },
        {
          title: "Pending",
          value: dashboardData.pending_appointments || 0,
          subtitle: "Awaiting confirmation",
          icon: faClock,
          iconClass: "pending",
          trend: "Live",
          trendUp: null,
        },
      ]
    : [];

  const todayAppointments = dashboardData
    ? (dashboardData.upcoming_appointments || []).map((apt) => ({
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
      }))
    : [];

  // Calculate dynamic alerts
  const getMissedAppointments = () => {
    const appointments = dashboardData?.upcoming_appointments || [];
    return appointments.filter(a => a.status === "missed" || a.status === "no-show").length;
  };

  const getCriticalPatients = () => {
    const patients = dashboardData?.recent_patients || [];
    return patients.filter(p => p.status === "critical").length;
  };

  const getCheckoutsToday = () => {
    const today = new Date().toISOString().split("T")[0];
    return currentBoarders.filter(b => {
      const checkout = b.checkout_date || b.end_date;
      return checkout && checkout.startsWith(today);
    }).length;
  };

  // Handle appointment actions
  const handleStartAppointment = async (aptId) => {
    try {
      // Find appointment to check its current status
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
      // Refresh dashboard data
      const data = await apiRequest("/veterinary/dashboard");
      setDashboardData(data);
    } catch (err) {
      console.error("Failed to start appointment:", err);
      const errorMessage = err?.response?.data?.message || err?.message || "Failed to start appointment";
      toast.error(errorMessage);
    }
  };

  const handleCompleteAppointment = async (aptId) => {
    try {
      // Find appointment to check its current status
      const appointment = dashboardData?.upcoming_appointments?.find(apt => apt.id === aptId);
      if (!appointment) {
        toast.error("Appointment not found");
        return;
      }

      // Check if appointment can be completed
      const completableStatuses = ['approved', 'scheduled', 'in_progress', 'treated'];
      if (!completableStatuses.includes(appointment.status)) {
        toast.error(`Cannot complete appointment with status: ${appointment.status}. Only ${completableStatuses.join(', ')} appointments can be completed.`);
        return;
      }

      await apiRequest(`/veterinary/appointments/${aptId}/complete`, {
        method: "POST",
        body: JSON.stringify({ notes: "Appointment completed by veterinarian" }),
      });
      toast.success(`Appointment #${aptId} completed • Receipt generated`);
      // Refresh dashboard data
      const data = await apiRequest("/veterinary/dashboard");
      setDashboardData(data);
    } catch (err) {
      console.error("Failed to complete appointment:", err);
      const errorMessage = err?.response?.data?.message || err?.message || "Failed to complete appointment";
      toast.error(errorMessage);
    }
  };

  
  const sidebar = <VeterinarySidebar />;

  const ROUTE_META = [
    { path: "/veterinary", title: "Veterinary Dashboard", subtitle: "Manage appointments, patient records, and pet care workflow." },
    { path: "/vet", title: "Veterinary Dashboard", subtitle: "Manage appointments, patient records, and pet care workflow." },
    { path: "/veterinary/appointments", title: "Appointments", subtitle: "Schedule, reschedule, and manage vet consultations." },
    { path: "/veterinary/services", title: "Vet Services", subtitle: "Browse and manage available veterinary services and pricing." },
    { path: "/veterinary/history", title: "Activity History", subtitle: "Review past consultations, treatments, and medical notes." },
    { path: "/veterinary/customer-profiles", title: "Customer Profiles", subtitle: "View pet owner details and their registered pets." },
    { path: "/veterinary/reports", title: "Reports", subtitle: "Access veterinary analytics, appointment summaries, and trends." },
    { path: "/veterinary/receipt", title: "Receipts", subtitle: "Generate and review payment receipts for services rendered." },
    { path: "/veterinary/current-boarders", title: "Current Boarders", subtitle: "Monitor active boarding pets and their daily status." },
    { path: "/veterinary/medical-confinements", title: "Medical Confinements", subtitle: "Track confined patients, treatments, and recovery plans." },
    { path: "/veterinary/profile", title: "Profile Settings", subtitle: "Manage your account details and preferences." },
  ];

  const pageMeta = ROUTE_META.find((r) => r.path === normalizedPath) || ROUTE_META[0];

  return (
    <DashboardLayout
      sidebar={sidebar}
      title={pageMeta.title}
      subtitle={pageMeta.subtitle}
      role="veterinary"
      name={name}
      profilePhoto={profilePhoto}
      onProfileUpload={handleProfilePhotoUpload}
      showChatbot
      chatbotTitle="Veterinary Assistant"
      chatbotSubtitle="Appointments, patient workflow, and dashboard help"
      className="app-dashboard vet-dashboard"
    >

        {showOverview ? (
          <section className="app-content vet-content">
            {/* Quick Actions */}
            <section className="premium-card vet-quick-actions">
              <h3 className="section-title">Quick Actions</h3>
              <div className="actions-row">
                <NavLink to="/veterinary/appointments" className="btn-primary">
                  <FontAwesomeIcon icon={faCalendarAlt} /> View Appointments
                </NavLink>
                <NavLink to="/veterinary/customer-profiles" className="btn-secondary">
                  <FontAwesomeIcon icon={faPaw} /> Patient Records
                </NavLink>
                <NavLink to="/veterinary/current-boarders" className="btn-secondary">
                  <FontAwesomeIcon icon={faHotel} /> Current Boarders
                </NavLink>
              </div>
            </section>

            {/* Alerts Panel - Dynamic */}
            <section className="premium-card vet-alerts">
              <h3 className="section-title">
                Clinic Alerts
                <small className="last-updated">
                  Last updated: {lastUpdated.toLocaleTimeString()}
                </small>
              </h3>
              <div className="alert-grid">
                {getMissedAppointments() > 0 && (
                  <div className="alert-item danger">
                    <FontAwesomeIcon icon={faExclamationTriangle} />
                    <span>{getMissedAppointments()} Missed Appointments</span>
                  </div>
                )}
                {getCriticalPatients() > 0 && (
                  <div className="alert-item warning">
                    <FontAwesomeIcon icon={faStethoscope} />
                    <span>{getCriticalPatients()} Critical Patient{getCriticalPatients() > 1 ? "s" : ""}</span>
                  </div>
                )}
                {getCheckoutsToday() > 0 && (
                  <div className="alert-item info">
                    <FontAwesomeIcon icon={faBed} />
                    <span>{getCheckoutsToday()} Boarder{getCheckoutsToday() > 1 ? "s" : ""} Checking Out Today</span>
                  </div>
                )}
                {getMissedAppointments() === 0 && getCriticalPatients() === 0 && getCheckoutsToday() === 0 && (
                  <div className="alert-item success">
                    <FontAwesomeIcon icon={faClipboardCheck} />
                    <span>All systems normal • No alerts</span>
                  </div>
                )}
              </div>
            </section>

            <section className="app-grid-4 vet-summary-grid">
              {loading ? (
                <>
                  <div className="loading-skeleton loading-card" />
                  <div className="loading-skeleton loading-card" />
                  <div className="loading-skeleton loading-card" />
                  <div className="loading-skeleton loading-card" />
                </>
              ) : (
                summaryCards.map((card, index) => (
                  <article
                    key={card.title}
                    className="app-stat-card vet-stat-card fade-up"
                    style={{ animationDelay: `${index * 80}ms` }}
                  >
                    <div className={`vet-stat-icon ${card.iconClass}`}>
                      <FontAwesomeIcon icon={card.icon} />
                    </div>

                    <div>
                      <h3>{card.value}</h3>
                      <p>{card.title}</p>
                      <small>{card.subtitle}</small>

                      <span className={`vet-trend ${card.trendUp ? "" : "negative"}`}>
                        <FontAwesomeIcon icon={card.trendUp ? faArrowUp : faArrowDown} />
                        {card.trend}
                      </span>
                    </div>
                  </article>
                ))
              )}
            </section>

            <section className="app-grid-2 vet-main-grid">
              {/* Today's Appointments with Actions */}
              <article className="premium-card vet-panel">
                <div className="panel-header space-between">
                  <div>
                    <h2>Today's Appointments</h2>
                    <p>Manage and track today's clinical cases</p>
                  </div>
                  <span className="badge badge-info">
                    {summaryCards[0]?.value ?? 0} Cases
                  </span>
                </div>

                <div className="appointments-preview actionable">
                  {(dashboardData?.upcoming_appointments || []).slice(0, 5).map((apt, idx) => (
                    <div key={`today-appointment-${apt.id || "no-id"}-${idx}`} className="preview-appointment-item">
                      <div className="apt-info">
                        <span className="apt-time">
                          {apt.scheduled_at
                            ? new Date(apt.scheduled_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "TBD"}
                        </span>
                        <span className="apt-pet">{apt.pet?.name || "Pet"}</span>
                        <span className="apt-service">{apt.service?.name || "Service"}</span>
                      </div>
                      <div className="apt-actions">
                        <button 
                          className="btn-primary btn-sm"
                          onClick={() => handleStartAppointment(apt.id || idx)}
                        >
                          Start
                        </button>
                        <button 
                          className="btn-secondary btn-sm"
                          onClick={() => handleCompleteAppointment(apt.id || idx)}
                        >
                          Complete
                        </button>
                      </div>
                    </div>
                  ))}

                  {(dashboardData?.upcoming_appointments || []).length === 0 && (
                    <div className="empty-state">
                      <h3>No appointments yet</h3>
                      <p>Once bookings are approved, they will appear here.</p>
                    </div>
                  )}
                </div>
              </article>

              {/* Patient Snapshot */}
              <article className="premium-card vet-panel">
                <div className="panel-header space-between">
                  <div>
                    <h2>Patient Snapshot</h2>
                    <p>Recent patients and ongoing treatments</p>
                  </div>
                  <span className="badge badge-warning">
                    {dashboardData?.active_treatments || 0} Active
                  </span>
                </div>

                <div className="patients-preview">
                  {(dashboardData?.recent_patients || []).slice(0, 4).map((pet, idx) => (
                    <div key={`patient-${pet.id || pet.name || "no-id"}-${idx}`} className="patient-row">
                      <div className="patient-info">
                        <FontAwesomeIcon icon={faPaw} />
                        <div>
                          <strong>{pet.name || "Unknown"}</strong>
                          <p>{pet.species || "Pet"} • {pet.breed || "Unknown"}</p>
                        </div>
                      </div>
                      <span className={`badge ${pet.status === "critical" ? "badge-danger" : pet.status === "recovering" ? "badge-warning" : "badge-success"}`}>
                        {pet.status || "Under Treatment"}
                      </span>
                    </div>
                  ))}

                  {(!dashboardData?.recent_patients || dashboardData.recent_patients.length === 0) && (
                    <div className="empty-state">
                      <h3>No recent patients</h3>
                      <p>Patient records will appear here.</p>
                    </div>
                  )}
                </div>
              </article>
            </section>

            {currentBoarders.length > 0 && (
              <section className="premium-card vet-panel dashboard-boarders">
                <div className="panel-header space-between">
                  <div>
                    <h2>
                      <FontAwesomeIcon icon={faHotel} /> Current Boarders
                    </h2>
                    <p>Pets currently staying at the hotel.</p>
                  </div>
                  <span className="badge badge-warning">{currentBoarders.length} Pets</span>
                </div>

                {loadingBoarders ? (
                  <div className="loading-boarders">Loading...</div>
                ) : (
                  <div className="boarders-list">
                    {currentBoarders.slice(0, 5).map((boarder) => (
                      <div key={boarder.id} className="boarder-card">
                        <div className="boarder-card-top">
                          <div className="boarder-pet-info">
                            <FontAwesomeIcon icon={faPaw} className="pet-icon" />
                            <div>
                              <h4>{boarder.pet?.name || "Unknown"}</h4>
                              <p>
                                {boarder.pet?.species || "Unknown"} -{" "}
                                {boarder.pet?.breed || "Unknown"}
                              </p>
                            </div>
                          </div>

                          <span className="room-badge">
                            <FontAwesomeIcon icon={faBed} /> Room{" "}
                            {boarder.hotel_room?.room_number || "N/A"}
                          </span>
                        </div>

                        <div className="boarder-details">
                          <div className="detail-item">
                            <strong>Owner</strong>
                            <p>{boarder.customer?.name || "Unknown"}</p>
                          </div>
                          <div className="detail-item">
                            <strong>Contact</strong>
                            <p>
                              <FontAwesomeIcon icon={faPhone} />{" "}
                              {boarder.customer?.phone || "N/A"}
                            </p>
                          </div>
                          <div className="detail-item">
                            <strong>Check-out</strong>
                            <p>
                              {boarder.check_out
                                ? new Date(boarder.check_out).toLocaleDateString()
                                : "TBD"}
                            </p>
                          </div>
                        </div>

                        {boarder.special_requests && (
                          <div className="special-requests">
                            <FontAwesomeIcon icon={faExclamationTriangle} />
                            <span>{boarder.special_requests}</span>
                          </div>
                        )}

                        <NavLink
                          to="/veterinary/customer-profiles"
                          className="btn-primary view-pet-btn"
                        >
                          View Pet Records
                        </NavLink>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            <section className="app-grid-2 vet-bottom-grid">
              <article className="premium-card vet-panel">
                <div className="panel-header space-between">
                  <h2>Upcoming Appointments</h2>
                  <NavLink to="/veterinary/appointments" className="see-all-link">
                    See all ({todayAppointments.length})
                  </NavLink>
                </div>

                <div className="appointment-list">
                  {todayAppointments.length > 0 ? (
                    todayAppointments.map((appointment, index) => (
                      <div key={`appointment-${appointment.id || appointment.petName || "no-id"}-${index}`} className="appointment-card">
                        <div className="appointment-card-top">
                          <div>
                            <h3>{appointment.petName}</h3>
                            <p>{appointment.ownerName}</p>
                          </div>
                          <span className={`status-badge ${appointment.status.toLowerCase()}`}>
                            {appointment.status}
                          </span>
                        </div>

                        <p>
                          {appointment.time} - {appointment.type}
                        </p>

                        <div className="appointment-footer">
                          <span>
                            <FontAwesomeIcon icon={faCalendarAlt} /> {appointment.time}
                          </span>
                          <span>
                            <FontAwesomeIcon icon={faUsers} /> {appointment.ownerName}
                          </span>
                          <button className="btn-secondary" type="button">
                            View Details
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="empty-state">
                      <h3>No upcoming appointments</h3>
                      <p>Approved appointments will appear here.</p>
                    </div>
                  )}
                </div>
              </article>

              <article className="premium-card vet-panel">
                <div className="panel-header space-between">
                  <h2>
                    <FontAwesomeIcon icon={faStethoscope} /> Recent Activity
                  </h2>
                  <span className="premium-badge live">Live</span>
                </div>

                <div className="activity-metrics">
                  <div className="status-card success">
                    <strong>{dashboardData?.today_appointments || 0}</strong>
                    <p>Appointments today</p>
                  </div>
                  <div className="status-card info">
                    <strong>{dashboardData?.pending_appointments || 0}</strong>
                    <p>Pending appointments</p>
                  </div>
                </div>

                <div className="mini-chart">
                  {[40, 65, 45, 80, 55, 90, 70].map((height, i) => (
                    <div key={i} className="chart-bar" style={{ height: `${height}%` }} />
                  ))}
                </div>

                <div className="activity-summary">
                  <p>
                    Total patients: {dashboardData?.total_patients || 0} | New this month:{" "}
                    {dashboardData?.new_patients_this_month || 0}
                  </p>
                </div>
              </article>
            </section>
          </section>
        ) : (
          <section className="app-content dashboard-content">
            <Outlet />
          </section>
        )}
    </DashboardLayout>
  );
};

export default VetDashboard;
