import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUser, faCamera, faSave, faTimes, faLock,
  faEye, faEyeSlash, faSpinner, faExclamationTriangle,
  faCheckCircle, faMapMarkerAlt, faPhone, faEnvelope,
  faShieldAlt, faCalendarAlt, faPencilAlt, faKey,
  faIdBadge, faGlobe, faHeart, faStore, faShoppingCart,
  faCashRegister, faHistory, faCreditCard, faBell,
  faCog, faPalette, faLanguage, faMoon, faSun,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest, uploadProfilePhoto } from "../../api/client";
import styled, { createGlobalStyle } from "styled-components";
import {
  fadeIn, pulse,
  FadeIn, ScaleIn, Spinning, Glowing,
  useScrollAnimation, useLoadingAnimation,
  hoverMixin, glassHoverMixin, focusMixin
} from "./animations";

/* ─────────────────────────────────────────────────────────────
   Theme Design Tokens — reads from global CSS variables
───────────────────────────────────────────────────────────── */
const THEME = {
  // Colors — fallback to pink, overridden by :root CSS vars at runtime
  primary: "var(--color-primary, #ff5f93)",
  primaryLight: "var(--color-primary-light, #ff8db5)",
  primaryDark: "var(--color-primary-hover, #ff3d73)",
  secondary: "var(--color-primary-light, #ff8db5)",
  accent: "var(--color-primary-soft, #ffb3d1)",

  // Glass effects
  glassBg: "rgba(255,255,255,0.85)",
  glassBorder: "var(--color-border, rgba(255,95,147,0.18))",
  glassShadow: "var(--shadow-card, 0 18px 45px rgba(255,95,147,0.14))",

  // Backgrounds
  pageBg: "var(--color-bg-gradient, linear-gradient(135deg, #fff5f8 0%, #ffe0ec 50%, #fff5f8 100%))",
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

/* ─────────────────────────────────────────────────────────────
   Styled Components
───────────────────────────────────────────────────────────── */
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


const PageContainer = styled.div`
  min-height: 100vh;
  background: ${THEME.pageBg};
  padding: 40px 24px 60px;
  font-family: 'Inter', sans-serif;
`;

const PageInner = styled.div`
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 32px;
`;

const PageHeader = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding-bottom: 32px;
  border-bottom: 2px solid ${THEME.glassBorder};
  gap: 20px;
  flex-wrap: wrap;
`;

const HeaderContent = styled.div`
  flex: 1;
`;

const PageTitle = styled.h1`
  font-size: 36px;
  font-weight: 700;
  color: ${THEME.primary};
  margin: 0 0 8px;
  letter-spacing: "-0.8px";
  line-height: 1.1;
  display: flex;
  align-items: center;
  gap: 12px;
`;

const PageSubtitle = styled.p`
  font-size: 16px;
  color: ${THEME.textSecondary};
  margin: 0;
  font-weight: 500;
`;

const EditButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 20px;
  border-radius: 16px;
  border: 2px solid ${THEME.primary};
  background: ${THEME.primary};
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: ${THEME.glassShadow};
  
  &:hover {
    background: ${THEME.primaryDark};
    border-color: ${THEME.primaryDark};
    transform: translateY(-2px);
    box-shadow: var(--shadow-primary, 0 22px 55px rgba(255,95,147,0.18));
  }
  
  &:active {
    transform: translateY(0);
  }
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
  gap: 16px;
`;

const CardHeaderIcon = styled.div`
  width: 48px;
  height: 48px;
  border-radius: 16px;
  background: rgba(255,255,255,0.25);
  border: 2px solid rgba(255,255,255,0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 18px;
  flex-shrink: 0;
  box-shadow: 0 8px 20px rgba(0,0,0,0.1);
`;

const CardHeaderText = styled.div`
  flex: 1;
`;

const CardTitle = styled.h2`
  font-size: 18px;
  font-weight: 700;
  color: white;
  margin: 0;
  letter-spacing: "-0.3px";
`;

const CardSubtitle = styled.p`
  font-size: 14px;
  color: rgba(255,255,255,0.9);
  margin: 4px 0 0;
  font-weight: 500;
`;

const CardBody = styled.div`
  padding: 32px;
`;

const AvatarSection = styled.div`
  display: flex;
  align-items: center;
  gap: 28px;
  padding: 0 0 32px;
  margin-bottom: 32px;
  border-bottom: 2px solid ${THEME.glassBorder};
`;

const AvatarRing = styled.div`
  width: 100px;
  height: 100px;
  border-radius: 50%;
  padding: 4px;
  background: linear-gradient(135deg, ${THEME.primary}, ${THEME.primaryLight});
  flex-shrink: 0;
  position: relative;
  box-shadow: var(--shadow-primary, 0 12px 30px rgba(255,95,147,0.25));
`;

const AvatarInner = styled.div`
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: white;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-size: 32px;
  color: ${THEME.textMuted};
  border: 4px solid white;
`;

const AvatarImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
`;

const AvatarMeta = styled.div`
  flex: 1;
`;

const AvatarName = styled.div`
  font-size: 24px;
  font-weight: 700;
  color: ${THEME.textPrimary};
  margin: 0 0 8px;
`;

const AvatarRole = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 20px;
  background: linear-gradient(135deg, ${THEME.primary}, ${THEME.primaryLight});
  color: white;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: "0.8px";
  box-shadow: var(--shadow-card, 0 4px 12px rgba(255,95,147,0.2));
`;

const AvatarStatus = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: ${THEME.success};
  margin-left: 12px;
  font-weight: 600;
`;

const StatusDot = styled.span`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${THEME.success};
  box-shadow: 0 0 0 3px rgba(72,187,120,0.3);
  animation: ${pulse} 2s infinite;
`;

const UploadButton = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 16px;
  border-radius: 12px;
  border: 2px solid ${THEME.glassBorder};
  background: ${THEME.glassBg};
  color: ${THEME.textSecondary};
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  
  &:hover {
    border-color: ${THEME.primary};
    color: ${THEME.primary};
    background: rgba(0,0,0,0.04);
    transform: translateY(-1px);
  }
`;

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  
  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const FormGridFull = styled.div`
  grid-column: 1 / -1;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Label = styled.label`
  font-size: 12px;
  font-weight: 700;
  color: ${THEME.textSecondary};
  text-transform: uppercase;
  letter-spacing: "0.8px";
  display: flex;
  align-items: center;
  gap: 6px;
`;

const Required = styled.span`
  color: ${THEME.error};
  font-size: 11px;
`;

const Input = styled.input`
  width: 100%;
  height: 48px;
  border-radius: 16px;
  border: 2px solid ${THEME.glassBorder};
  background: ${THEME.glassBg};
  color: ${THEME.textPrimary};
  padding: 0 16px;
  font-size: 14px;
  font-weight: 500;
  outline: none;
  transition: all 0.3s ease;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  
  &:disabled {
    background: rgba(255,255,255,0.5);
    color: ${THEME.textMuted};
    cursor: not-allowed;
    opacity: 0.7;
  }
  
  ${focusMixin()}
  
  &::placeholder {
    color: ${THEME.textMuted};
  }
`;

const Textarea = styled.textarea`
  width: 100%;
  min-height: 100px;
  border-radius: 16px;
  border: 2px solid ${THEME.glassBorder};
  background: ${THEME.glassBg};
  color: ${THEME.textPrimary};
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 500;
  outline: none;
  resize: vertical;
  transition: all 0.3s ease;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  font-family: inherit;
  line-height: 1.5;
  
  &:disabled {
    background: rgba(255,255,255,0.5);
    color: ${THEME.textMuted};
    cursor: not-allowed;
    opacity: 0.7;
  }
  
  ${focusMixin()}
  
  &::placeholder {
    color: ${THEME.textMuted};
  }
`;

const PasswordWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

const PasswordToggle = styled.button`
  position: absolute;
  right: 16px;
  background: transparent;
  border: none;
  color: ${THEME.textMuted};
  cursor: pointer;
  font-size: 16px;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.3s ease;
  
  &:hover {
    color: ${THEME.primary};
  }
`;

const Divider = styled.div`
  height: 2px;
  background: ${THEME.glassBorder};
  margin: 32px 0;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  margin-top: 32px;
  justify-content: flex-end;
`;

const Button = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 20px;
  border-radius: 16px;
  border: none;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  letter-spacing: "0.3px";
  
  ${props => {
    if (props.variant === 'primary') {
      return `
        background: linear-gradient(135deg, ${THEME.primary}, ${THEME.primaryLight});
        color: white;
        box-shadow: ${THEME.glassShadow};
        ${hoverMixin()}
      `;
    } else if (props.variant === 'secondary') {
      return `
        background: ${THEME.glassBg};
        color: ${THEME.textSecondary};
        border: 2px solid ${THEME.glassBorder};
        ${glassHoverMixin()}
      `;
    } else if (props.variant === 'danger') {
      return `
        background: linear-gradient(135deg, ${THEME.error}, #fc8181);
        color: white;
        box-shadow: 0 8px 20px rgba(245,101,101,0.22);
        ${hoverMixin('0 12px 30px rgba(245,101,101,0.3)', 'translateY(-2px)')}
      `;
    }
  }}
  
  &:active {
    transform: translateY(0);
  }
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none !important;
  }
`;

const Toast = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-radius: 16px;
  font-size: 14px;
  font-weight: 600;
  background: ${props => props.type === 'success' ? 'rgba(72,187,120,0.1)' : 'rgba(245,101,101,0.1)'};
  border: 2px solid ${props => props.type === 'success' ? 'rgba(72,187,120,0.25)' : 'rgba(245,101,101,0.25)'};
  color: ${props => props.type === 'success' ? THEME.success : THEME.error};
  box-shadow: ${props => props.type === 'success' ? '0 4px 16px rgba(72,187,120,0.1)' : '0 4px 16px rgba(245,101,101,0.1)'};
  animation: ${fadeIn} 0.4s ease;
`;

const LoadingContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 80px 20px;
  color: ${THEME.textSecondary};
  font-size: 16px;
`;

const ErrorContainer = styled.div`
  background: rgba(245,101,101,0.08);
  border: 2px solid rgba(245,101,101,0.2);
  border-radius: 20px;
  padding: 24px 28px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: ${THEME.error};
  font-size: 15px;
  animation: ${fadeIn} 0.4s ease;
`;

const MetaRow = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 0;
  border-bottom: 1px solid ${THEME.glassBorder};
  
  &:last-child {
    border-bottom: none;
  }
`;

const MetaIcon = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: linear-gradient(135deg, ${THEME.primaryLight}, ${THEME.primary});
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 14px;
  flex-shrink: 0;
  box-shadow: var(--shadow-card, 0 4px 12px rgba(255,95,147,0.2));
`;

const MetaContent = styled.div`
  flex: 1;
`;

const MetaLabel = styled.div`
  font-size: 12px;
  color: ${THEME.textSecondary};
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: "0.6px";
  margin-bottom: 4px;
`;

const MetaValue = styled.div`
  font-size: 15px;
  color: ${THEME.textPrimary};
  font-weight: 600;
`;

const PasswordRequirements = styled.div`
  font-size: 13px;
  color: ${THEME.textSecondary};
  background: rgba(0,0,0,0.04);
  border: 1px solid ${THEME.glassBorder};
  border-radius: 12px;
  padding: 12px 16px;
  line-height: 1.5;
  margin-top: 8px;
`;

const SettingsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
`;

const SettingItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-radius: 12px;
  background: rgba(255,255,255,0.5);
  border: 1px solid ${THEME.glassBorder};
  transition: all 0.3s ease;
  
  &:hover {
    background: rgba(255,255,255,0.8);
    border-color: ${THEME.primary};
  }
`;

const SettingLabel = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  font-weight: 600;
  color: ${THEME.textPrimary};
`;

const ToggleSwitch = styled.label`
  position: relative;
  width: 48px;
  height: 24px;
  cursor: pointer;
  
  input {
    opacity: 0;
    width: 0;
    height: 0;
  }
  
  .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: ${THEME.textMuted};
    transition: .4s;
    border-radius: 24px;
    
    &:before {
      position: absolute;
      content: "";
      height: 18px;
      width: 18px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: .4s;
      border-radius: 50%;
    }
  }
  
  input:checked + .slider {
    background-color: ${THEME.primary};
  }
  
  input:checked + .slider:before {
    transform: translateX(24px);
  }
`;

/* ─────────────────────────────────────────────────────────────
   Component
───────────────────────────────────────────────────────────── */
const ProfileSettings = () => {
  const navigate = useNavigate();
  const { role, login, logout, updateUser, user: authUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userRole, setUserRole] = useState("");

  const [profileData, setProfileData] = useState({
    id: null,
    name: "",
    first_name: "",
    middle_name: "",
    last_name: "",
    suffix: "",
    email: "",
    username: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zip_code: "",
    country: "",
    bio: "",
    role: "",
    is_active: true,
    created_at: "",
    updated_at: "",
    profileImage: null,
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [showPasswords, setShowPasswords] = useState({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });

  const [pwLoading, setPwLoading] = useState(false);

  // Role-specific settings
  const [settings, setSettings] = useState({
    emailNotifications: true,
    pushNotifications: false,
    darkMode: false,
    language: "en",
    autoSave: true,
    twoFactorAuth: false,
  });

  // Get role-specific icons and titles
  const getRoleConfig = (role) => {
    const configs = {
      admin: {
        icon: faShieldAlt,
        title: "Admin Profile",
        subtitle: "Manage your admin account and system settings",
        showAdvancedSettings: true,
        showAccountDetails: true,
        showPasswordChange: true,
      },
      customer: {
        icon: faUser,
        title: "My Profile",
        subtitle: "Manage your personal information and preferences",
        showAdvancedSettings: false,
        showAccountDetails: true,
        showPasswordChange: true,
      },
      cashier: {
        icon: faCashRegister,
        title: "Cashier Profile",
        subtitle: "Manage your cashier account and POS settings",
        showAdvancedSettings: false,
        showAccountDetails: true,
        showPasswordChange: true,
      },
    };
    return configs[role] || configs.customer;
  };

  // Auto-login function removed for production security
  // Use proper login form with valid credentials instead

  // Fetch user profile
  const fetchUserProfile = async () => {
    try {
      setLoading(true);
      setError("");

      const userData = await apiRequest("/auth/me");
      if (!userData || !userData.id) {
        setError("Failed to load profile.");
        return;
      }

      setUserRole(userData.role || role);
      setProfileData({
        id: userData.id,
        name: userData.name || "",
        first_name: userData.first_name || "",
        middle_name: userData.middle_name || "",
        last_name: userData.last_name || "",
        email: userData.email || "",
        username: userData.username || "",
        phone: userData.phone || "",
        address: userData.address || "",
        city: userData.city || "",
        state: userData.state || "",
        zip_code: userData.zip_code || "",
        country: userData.country || "",
        bio: userData.bio || "",
        role: userData.role || role,
        is_active: userData.is_active !== undefined ? userData.is_active : true,
        created_at: userData.created_at || "",
        updated_at: userData.updated_at || "",
        // Prefer AuthContext photo (has ?v= cache-buster) over raw API value
        profileImage: authUser?.profile_photo || userData.profile_photo || userData.profile_image || null,
      });
    } catch (err) {
      if (err.message?.includes("401")) {
        setError("Session expired. Redirecting to login…");
        setTimeout(() => navigate("/login"), 2000);
      } else {
        setError(err.message || "Failed to fetch profile");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserProfile();
  }, []);

  const showSuccess = (msg) => {
    setMessage(msg);
    setMessageType("success");
    setTimeout(() => setMessage(""), 4000);
  };

  const showError = (msg) => {
    setMessage(msg);
    setMessageType("error");
    setTimeout(() => setMessage(""), 5000);
  };

  const testLogin = async () => {
    try {
      const loginRole = userRole || "customer";
      const response = await apiRequest("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: `${loginRole}@example.com`,
          password: `${loginRole}123`
        }),
      });

      if (response.user && response.token) {
        login(response.token, response.user.role, {
          name: response.user.name,
          email: response.user.email,
          profile_photo: response.user.profile_photo || "",
        });
        setProfileData(p => ({ ...p, id: null, name: "", email: "" }));
        setTimeout(() => fetchUserProfile(), 500);
      } else {
        showError("Login failed: No token received");
      }
    } catch (err) {
      showError("Login failed: " + err.message);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setProfileData(p => ({ ...p, [name]: value }));
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordData(p => ({ ...p, [name]: value }));
  };

  const handleSettingChange = (settingName, value) => {
    setSettings(p => ({ ...p, [settingName]: value }));
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setProfileData(p => ({ ...p, profileImage: reader.result }));
    reader.readAsDataURL(file);
    try {
      const data = await uploadProfilePhoto(file);
      let photoUrl = data?.profile_photo || data?.url || "";
      if (photoUrl) {
        if (!photoUrl.includes("?v=")) photoUrl += "?v=" + Date.now();
        updateUser({ profile_photo: photoUrl });
        setProfileData(p => ({ ...p, profileImage: photoUrl }));
      }
      showSuccess("Profile photo updated!");
    } catch (err) {
      showError(err.message || "Failed to upload photo.");
    }
  };

  const handleSaveProfile = async () => {
    if (!profileData.first_name || !profileData.last_name || !profileData.email) {
      showError("Please fill in all required fields.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileData.email)) {
      showError("Please enter a valid email address.");
      return;
    }
    try {
      await apiRequest("/auth/profile", {
        method: "PUT",
        body: JSON.stringify({
          name: profileData.name,
          first_name: profileData.first_name,
          middle_name: profileData.middle_name,
          last_name: profileData.last_name,
          email: profileData.email,
          username: profileData.username,
          phone: profileData.phone,
          address: profileData.address,
          city: profileData.city,
          state: profileData.state,
          zip_code: profileData.zip_code,
          country: profileData.country,
          bio: profileData.bio,
        }),
      });
      showSuccess("Profile updated successfully!");
      setIsEditing(false);
      await fetchUserProfile();
    } catch (err) {
      showError(err.message || "Failed to update profile");
    }
  };

  const handleChangePassword = async () => {
    if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
      showError("Please fill in all password fields.");
      return;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      showError("Passwords do not match.");
      return;
    }
    if (passwordData.newPassword === passwordData.currentPassword) {
      showError("New password must differ from current.");
      return;
    }
    if (passwordData.newPassword.length < 8) {
      showError("Password must be at least 8 characters.");
      return;
    }
    try {
      setPwLoading(true);
      const response = await apiRequest("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          current_password: passwordData.currentPassword,
          new_password: passwordData.newPassword,
          new_password_confirmation: passwordData.confirmPassword,
        }),
      });
      if (response.message) {
        showSuccess("Password changed! Logging out…");
        setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
        setTimeout(() => {
          logout();
          window.location.href = "/login";
        }, 2000);
      }
    } catch (err) {
      setPwLoading(false);
      showError(err.message || "Failed to change password");
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setMessage("");
    fetchUserProfile();
  };

  const toggleEditMode = () => {
    setIsEditing(!isEditing);
    setMessage("");
  };

  const togglePasswordVisibility = (field) => {
    setShowPasswords(p => ({ ...p, [field]: !p[field] }));
  };

  const displayName = [profileData.first_name, profileData.last_name].filter(Boolean).join(" ") || profileData.name || "—";
  const roleLabel = profileData.role ? profileData.role.charAt(0).toUpperCase() + profileData.role.slice(1) : "User";
  const roleConfig = getRoleConfig(userRole);

  /* ── Render ── */
  return (
    <>
      <GlobalStyle />
      <PageContainer>
        <PageInner>
          {/* Page Header */}
          <PageHeader>
            <HeaderContent>
              <PageTitle>
                <FontAwesomeIcon icon={roleConfig.icon} />
                {roleConfig.title}
              </PageTitle>
              <PageSubtitle>{roleConfig.subtitle}</PageSubtitle>
            </HeaderContent>
            {!loading && !error && !isEditing && (
              <EditButton onClick={toggleEditMode}>
                <FontAwesomeIcon icon={faPencilAlt} />
                Edit Profile
              </EditButton>
            )}
          </PageHeader>

          {/* Toast */}
          {message && (
            <Toast type={messageType}>
              <FontAwesomeIcon icon={messageType === "success" ? faCheckCircle : faExclamationTriangle} />
              {message}
            </Toast>
          )}

          {/* Loading */}
          {loading && (
            <LoadingContainer>
              <FontAwesomeIcon icon={faSpinner} spin />
              <span>Loading your profile…</span>
            </LoadingContainer>
          )}

          {/* Error */}
          {error && !loading && (
            <ErrorContainer>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <FontAwesomeIcon icon={faExclamationTriangle} />
                <span>{error}</span>
              </div>
              <ButtonGroup>
                <Button variant="secondary" onClick={fetchUserProfile}>
                  Retry
                </Button>
                <Button variant="primary" onClick={testLogin}>
                  Test Login ({roleLabel})
                </Button>
              </ButtonGroup>
            </ErrorContainer>
          )}

          {/* Profile Cards */}
          {!loading && !error && (
            <>
              {/* Personal Information */}
              <Card>
                <CardHeader>
                  <CardHeaderIcon>
                    <FontAwesomeIcon icon={faIdBadge} />
                  </CardHeaderIcon>
                  <CardHeaderText>
                    <CardTitle>Personal Information</CardTitle>
                    <CardSubtitle>Your name, contact details and bio</CardSubtitle>
                  </CardHeaderText>
                </CardHeader>
                <CardBody>
                  <AvatarSection>
                    <AvatarRing>
                      <AvatarInner>
                        {profileData.profileImage ? (
                          <AvatarImage
                            src={profileData.profileImage.startsWith("/") ? `${window.location.origin}${profileData.profileImage}` : profileData.profileImage}
                            alt="Avatar"
                            onError={(e) => { e.target.style.display = "none"; }}
                          />
                        ) : (
                          <FontAwesomeIcon icon={faUser} />
                        )}
                      </AvatarInner>
                    </AvatarRing>
                    <AvatarMeta>
                      <AvatarName>{displayName}</AvatarName>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
                        <AvatarRole>
                          <FontAwesomeIcon icon={roleConfig.icon} style={{ fontSize: 10 }} />
                          {roleLabel}
                        </AvatarRole>
                        <AvatarStatus>
                          <StatusDot />
                          {profileData.is_active ? "Active" : "Inactive"}
                        </AvatarStatus>
                      </div>
                      {isEditing && (
                        <>
                          <input
                            type="file"
                            id="avatar-upload"
                            accept="image/*"
                            onChange={handleImageUpload}
                            style={{ display: "none" }}
                          />
                          <UploadButton htmlFor="avatar-upload">
                            <FontAwesomeIcon icon={faCamera} />
                            Change Photo
                          </UploadButton>
                        </>
                      )}
                    </AvatarMeta>
                  </AvatarSection>

                  <FormGrid>
                    <FormGroup>
                      <Label>
                        First Name <Required>*</Required>
                      </Label>
                      <Input
                        type="text"
                        name="first_name"
                        value={profileData.first_name}
                        onChange={handleInputChange}
                        disabled={!isEditing}
                        placeholder="First name"
                      />
                    </FormGroup>
                    <FormGroup>
                      <Label>Middle Name</Label>
                      <Input
                        type="text"
                        name="middle_name"
                        value={profileData.middle_name}
                        onChange={handleInputChange}
                        disabled={!isEditing}
                        placeholder="Middle name"
                      />
                    </FormGroup>
                    <FormGroup>
                      <Label>
                        Last Name <Required>*</Required>
                      </Label>
                      <Input
                        type="text"
                        name="last_name"
                        value={profileData.last_name}
                        onChange={handleInputChange}
                        disabled={!isEditing}
                        placeholder="Last name"
                      />
                    </FormGroup>
                    <FormGroup>
                      <Label>Username</Label>
                      <Input
                        type="text"
                        name="username"
                        value={profileData.username}
                        onChange={handleInputChange}
                        disabled={!isEditing}
                        placeholder="@username"
                      />
                    </FormGroup>
                  </FormGrid>

                  <Divider />

                  <FormGrid>
                    <FormGroup>
                      <Label>
                        <FontAwesomeIcon icon={faEnvelope} style={{ fontSize: 11 }} />
                        Email Address <Required>*</Required>
                      </Label>
                      <Input
                        type="email"
                        name="email"
                        value={profileData.email}
                        onChange={handleInputChange}
                        disabled={!isEditing}
                        placeholder="you@example.com"
                      />
                    </FormGroup>
                    <FormGroup>
                      <Label>
                        <FontAwesomeIcon icon={faPhone} style={{ fontSize: 11 }} />
                        Phone Number
                      </Label>
                      <Input
                        type="tel"
                        name="phone"
                        value={profileData.phone}
                        onChange={handleInputChange}
                        disabled={!isEditing}
                        placeholder="+63 9XX XXX XXXX"
                      />
                    </FormGroup>
                    <FormGridFull>
                      <Label>Bio</Label>
                      <Textarea
                        name="bio"
                        value={profileData.bio}
                        onChange={handleInputChange}
                        disabled={!isEditing}
                        placeholder="Tell us about yourself…"
                      />
                    </FormGridFull>
                  </FormGrid>

                  {isEditing && (
                    <ButtonGroup>
                      <Button variant="secondary" onClick={handleCancel}>
                        <FontAwesomeIcon icon={faTimes} />
                        Cancel
                      </Button>
                      <Button variant="primary" onClick={handleSaveProfile}>
                        <FontAwesomeIcon icon={faSave} />
                        Save Changes
                      </Button>
                    </ButtonGroup>
                  )}
                </CardBody>
              </Card>

              {/* Address Information */}
              <Card>
                <CardHeader style={{ background: `linear-gradient(135deg, ${THEME.primaryLight}, ${THEME.secondary})` }}>
                  <CardHeaderIcon>
                    <FontAwesomeIcon icon={faMapMarkerAlt} />
                  </CardHeaderIcon>
                  <CardHeaderText>
                    <CardTitle>Address Information</CardTitle>
                    <CardSubtitle>Your location details</CardSubtitle>
                  </CardHeaderText>
                </CardHeader>
                <CardBody>
                  <FormGrid>
                    <FormGridFull>
                      <Label>Street Address</Label>
                      <Input
                        type="text"
                        name="address"
                        value={profileData.address}
                        onChange={handleInputChange}
                        disabled={!isEditing}
                        placeholder="Street / Building / Unit"
                      />
                    </FormGridFull>
                    <FormGroup>
                      <Label>City</Label>
                      <Input
                        type="text"
                        name="city"
                        value={profileData.city}
                        onChange={handleInputChange}
                        disabled={!isEditing}
                        placeholder="City"
                      />
                    </FormGroup>
                    <FormGroup>
                      <Label>State / Province</Label>
                      <Input
                        type="text"
                        name="state"
                        value={profileData.state}
                        onChange={handleInputChange}
                        disabled={!isEditing}
                        placeholder="State / Province"
                      />
                    </FormGroup>
                    <FormGroup>
                      <Label>ZIP Code</Label>
                      <Input
                        type="text"
                        name="zip_code"
                        value={profileData.zip_code}
                        onChange={handleInputChange}
                        disabled={!isEditing}
                        placeholder="ZIP / Postal code"
                      />
                    </FormGroup>
                    <FormGroup>
                      <Label>
                        <FontAwesomeIcon icon={faGlobe} style={{ fontSize: 11 }} />
                        Country
                      </Label>
                      <Input
                        type="text"
                        name="country"
                        value={profileData.country}
                        onChange={handleInputChange}
                        disabled={!isEditing}
                        placeholder="Country"
                      />
                    </FormGroup>
                  </FormGrid>

                  {isEditing && (
                    <ButtonGroup>
                      <Button variant="secondary" onClick={handleCancel}>
                        <FontAwesomeIcon icon={faTimes} />
                        Cancel
                      </Button>
                      <Button variant="primary" onClick={handleSaveProfile}>
                        <FontAwesomeIcon icon={faSave} />
                        Save Changes
                      </Button>
                    </ButtonGroup>
                  )}
                </CardBody>
              </Card>

              {/* Account Details */}
              {roleConfig.showAccountDetails && (
                <Card>
                  <CardHeader style={{ background: `linear-gradient(135deg, ${THEME.secondary}, ${THEME.accent})` }}>
                    <CardHeaderIcon>
                      <FontAwesomeIcon icon={faShieldAlt} />
                    </CardHeaderIcon>
                    <CardHeaderText>
                      <CardTitle>Account Details</CardTitle>
                      <CardSubtitle>Read-only system information</CardSubtitle>
                    </CardHeaderText>
                  </CardHeader>
                  <CardBody>
                    {[
                      {
                        icon: faIdBadge,
                        label: "Role",
                        value: roleLabel,
                      },
                      {
                        icon: faShieldAlt,
                        label: "Status",
                        value: (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: profileData.is_active ? THEME.success : THEME.error }}>
                            <StatusDot />
                            {profileData.is_active ? "Active" : "Inactive"}
                          </span>
                        ),
                      },
                      {
                        icon: faCalendarAlt,
                        label: "Member Since",
                        value: profileData.created_at
                          ? new Date(profileData.created_at).toLocaleDateString("en-PH", {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })
                          : "—",
                      },
                      {
                        icon: faCalendarAlt,
                        label: "Last Updated",
                        value: profileData.updated_at
                          ? new Date(profileData.updated_at).toLocaleDateString("en-PH", {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })
                          : "—",
                      },
                    ].map(({ icon, label, value }, i) => (
                      <MetaRow key={i}>
                        <MetaIcon>
                          <FontAwesomeIcon icon={icon} />
                        </MetaIcon>
                        <MetaContent>
                          <MetaLabel>{label}</MetaLabel>
                          <MetaValue>{value}</MetaValue>
                        </MetaContent>
                      </MetaRow>
                    ))}
                  </CardBody>
                </Card>
              )}

              {/* Settings */}
              <Card>
                <CardHeader style={{ background: `linear-gradient(135deg, ${THEME.accent}, ${THEME.primaryLight})` }}>
                  <CardHeaderIcon>
                    <FontAwesomeIcon icon={faCog} />
                  </CardHeaderIcon>
                  <CardHeaderText>
                    <CardTitle>Preferences</CardTitle>
                    <CardSubtitle>Customize your experience</CardSubtitle>
                  </CardHeaderText>
                </CardHeader>
                <CardBody>
                  <SettingsGrid>
                    <SettingItem>
                      <SettingLabel>
                        <FontAwesomeIcon icon={faBell} />
                        Email Notifications
                      </SettingLabel>
                      <ToggleSwitch>
                        <input
                          type="checkbox"
                          checked={settings.emailNotifications}
                          onChange={(e) => handleSettingChange("emailNotifications", e.target.checked)}
                        />
                        <span className="slider"></span>
                      </ToggleSwitch>
                    </SettingItem>
                    <SettingItem>
                      <SettingLabel>
                        <FontAwesomeIcon icon={faBell} />
                        Push Notifications
                      </SettingLabel>
                      <ToggleSwitch>
                        <input
                          type="checkbox"
                          checked={settings.pushNotifications}
                          onChange={(e) => handleSettingChange("pushNotifications", e.target.checked)}
                        />
                        <span className="slider"></span>
                      </ToggleSwitch>
                    </SettingItem>
                    <SettingItem>
                      <SettingLabel>
                        <FontAwesomeIcon icon={faMoon} />
                        Dark Mode
                      </SettingLabel>
                      <ToggleSwitch>
                        <input
                          type="checkbox"
                          checked={settings.darkMode}
                          onChange={(e) => handleSettingChange("darkMode", e.target.checked)}
                        />
                        <span className="slider"></span>
                      </ToggleSwitch>
                    </SettingItem>
                    <SettingItem>
                      <SettingLabel>
                        <FontAwesomeIcon icon={faLanguage} />
                        Language
                      </SettingLabel>
                      <select
                        value={settings.language}
                        onChange={(e) => handleSettingChange("language", e.target.value)}
                        style={{
                          padding: "8px 12px",
                          borderRadius: "8px",
                          border: `2px solid ${THEME.glassBorder}`,
                          background: THEME.glassBg,
                          color: THEME.textPrimary,
                          fontSize: "14px",
                        }}
                      >
                        <option value="en">English</option>
                        <option value="es">Español</option>
                        <option value="fr">Français</option>
                        <option value="de">Deutsch</option>
                      </select>
                    </SettingItem>
                    {roleConfig.showAdvancedSettings && (
                      <>
                        <SettingItem>
                          <SettingLabel>
                            <FontAwesomeIcon icon={faSave} />
                            Auto-Save
                          </SettingLabel>
                          <ToggleSwitch>
                            <input
                              type="checkbox"
                              checked={settings.autoSave}
                              onChange={(e) => handleSettingChange("autoSave", e.target.checked)}
                            />
                            <span className="slider"></span>
                          </ToggleSwitch>
                        </SettingItem>
                        <SettingItem>
                          <SettingLabel>
                            <FontAwesomeIcon icon={faShieldAlt} />
                            Two-Factor Auth
                          </SettingLabel>
                          <ToggleSwitch>
                            <input
                              type="checkbox"
                              checked={settings.twoFactorAuth}
                              onChange={(e) => handleSettingChange("twoFactorAuth", e.target.checked)}
                            />
                            <span className="slider"></span>
                          </ToggleSwitch>
                        </SettingItem>
                      </>
                    )}
                  </SettingsGrid>
                </CardBody>
              </Card>

              {/* Change Password */}
              {roleConfig.showPasswordChange && (
                <Card>
                  <CardHeader style={{ background: `linear-gradient(135deg, ${THEME.error}, #fc8181)` }}>
                    <CardHeaderIcon>
                      <FontAwesomeIcon icon={faKey} />
                    </CardHeaderIcon>
                    <CardHeaderText>
                      <CardTitle>Change Password</CardTitle>
                      <CardSubtitle>Update your account password</CardSubtitle>
                    </CardHeaderText>
                  </CardHeader>
                  <CardBody>
                    {[
                      { key: "currentPassword", label: "Current Password", placeholder: "Enter current password" },
                      { key: "newPassword", label: "New Password", placeholder: "Enter new password" },
                      { key: "confirmPassword", label: "Confirm New Password", placeholder: "Re-enter new password" },
                    ].map(({ key, label, placeholder }) => (
                      <FormGroup key={key} style={{ marginBottom: 16 }}>
                        <Label>{label}</Label>
                        <PasswordWrapper>
                          <Input
                            type={showPasswords[key] ? "text" : "password"}
                            name={key}
                            value={passwordData[key]}
                            onChange={handlePasswordChange}
                            placeholder={placeholder}
                            style={{ paddingRight: 60 }}
                          />
                          <PasswordToggle
                            type="button"
                            onClick={() => togglePasswordVisibility(key)}
                          >
                            <FontAwesomeIcon icon={showPasswords[key] ? faEyeSlash : faEye} />
                          </PasswordToggle>
                        </PasswordWrapper>
                      </FormGroup>
                    ))}

                    <PasswordRequirements>
                      Password must be at least <strong>8 characters</strong> and contain both letters and numbers. You will be logged out after a successful change.
                    </PasswordRequirements>

                    <ButtonGroup>
                      <Button
                        variant="danger"
                        onClick={handleChangePassword}
                        disabled={pwLoading}
                      >
                        {pwLoading ? (
                          <>
                            <FontAwesomeIcon icon={faSpinner} spin />
                            Updating…
                          </>
                        ) : (
                          <>
                            <FontAwesomeIcon icon={faLock} />
                            Change Password
                          </>
                        )}
                      </Button>
                    </ButtonGroup>
                  </CardBody>
                </Card>
              )}
            </>
          )}
        </PageInner>
      </PageContainer>
    </>
  );
};

export default ProfileSettings;
