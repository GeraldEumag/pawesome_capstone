import { useEffect, useMemo, useState } from "react";
import { showConfirm } from "../../utils/alert";
import { useAuth } from "../../context/AuthContext";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUser,
  faEnvelope,
  faPhone,
  faMapMarkerAlt,
  faCamera,
  faSave,
  faTimes,
  faLock,
  faEye,
  faEyeSlash,
  faShieldAlt,
  faCalendarAlt,
  faIdCard,
  faCheckCircle,
  faExclamationCircle,
  faPen,
  faRefresh,
} from "@fortawesome/free-solid-svg-icons";
import "./ReceptionistAppointmentList.css";

const STORAGE_KEY = "receptionistProfileData";

const defaultProfileData = {
  firstName: "Receptionist",
  lastName: "User",
  email: "receptionist@pawesomeretreat.com",
  phone: "+63 900 000 0000",
  address: "Front Desk Office",
  city: "Imus",
  state: "Cavite",
  zipCode: "4103",
  country: "Philippines",
  bio: "Dedicated receptionist responsible for customer assistance, booking coordination, service request management, and front desk support.",
  memberSince: "February 2024",
  profileImage: null,
};

const emptyPasswordData = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

const AppointmentList = () => {
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  const [profileData, setProfileData] = useState(defaultProfileData);
  const [draftProfile, setDraftProfile] = useState(defaultProfileData);

  const [passwordData, setPasswordData] = useState(emptyPasswordData);

  const [showPasswords, setShowPasswords] = useState({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });

  useEffect(() => {
    const storedProfile = localStorage.getItem(STORAGE_KEY);
    const authName = user?.name;
    const authEmail = user?.email;
    const authPhoto = user?.profile_photo;

    let parsedProfile = null;

    try {
      parsedProfile = storedProfile ? JSON.parse(storedProfile) : null;
    } catch {
      parsedProfile = null;
    }

    const initialProfile = {
      ...defaultProfileData,
      ...(parsedProfile || {}),
      ...(authEmail ? { email: authEmail } : {}),
      ...(authPhoto ? { profileImage: authPhoto } : {}),
    };

    if (!parsedProfile && authName) {
      const nameParts = authName.trim().split(/\s+/);
      initialProfile.firstName = nameParts[0] || defaultProfileData.firstName;
      initialProfile.lastName =
        nameParts.length > 1
          ? nameParts.slice(1).join(" ")
          : defaultProfileData.lastName;
    }

    setProfileData(initialProfile);
    setDraftProfile(initialProfile);
  }, [user]);

  const fullName = useMemo(
    () => `${profileData.firstName} ${profileData.lastName}`.trim(),
    [profileData.firstName, profileData.lastName]
  );

  const passwordStrength = useMemo(() => {
    const password = passwordData.newPassword;

    if (!password) return { label: "No password entered", score: 0 };

    let score = 0;

    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[a-z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;

    if (score <= 2) return { label: "Weak", score };
    if (score <= 4) return { label: "Good", score };
    return { label: "Strong", score };
  }, [passwordData.newPassword]);

  const showStatusMessage = (type, text) => {
    setMessageType(type);
    setMessage(text);

    window.clearTimeout(window.receptionistProfileMessageTimer);
    window.receptionistProfileMessageTimer = window.setTimeout(() => {
      setMessage("");
      setMessageType("");
    }, 3500);
  };

  const handleInputChange = (event) => {
    const { name, value } = event.target;

    setDraftProfile((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handlePasswordChange = (event) => {
    const { name, value } = event.target;

    setPasswordData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleImageUpload = (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showStatusMessage("error", "Please upload a valid image file.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showStatusMessage("error", "Image size must be 2MB or below.");
      return;
    }

    const reader = new FileReader();

    reader.onloadend = () => {
      setDraftProfile((prev) => ({
        ...prev,
        profileImage: reader.result,
      }));
    };

    reader.readAsDataURL(file);
  };

  const validateProfile = () => {
    if (!draftProfile.firstName.trim()) return "First name is required.";
    if (!draftProfile.lastName.trim()) return "Last name is required.";
    if (!draftProfile.email.trim()) return "Email address is required.";

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(draftProfile.email)) {
      return "Please enter a valid email address.";
    }

    return "";
  };

  const handleSaveProfile = async () => {
    const validationError = validateProfile();

    if (validationError) {
      showStatusMessage("error", validationError);
      return;
    }

    try {
      setSavingProfile(true);

      const updatedProfile = {
        ...draftProfile,
        firstName: draftProfile.firstName.trim(),
        lastName: draftProfile.lastName.trim(),
        email: draftProfile.email.trim(),
        phone: draftProfile.phone.trim(),
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProfile));
      localStorage.setItem(
        "name",
        `${updatedProfile.firstName} ${updatedProfile.lastName}`.trim()
      );
      localStorage.setItem("email", updatedProfile.email);

      if (updatedProfile.profileImage) {
        localStorage.setItem("profile_photo", updatedProfile.profileImage);
      }

      setProfileData(updatedProfile);
      setDraftProfile(updatedProfile);
      setIsEditing(false);
      showStatusMessage("success", "Profile updated successfully.");
    } catch {
      showStatusMessage("error", "Failed to save profile changes.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (
      !passwordData.currentPassword ||
      !passwordData.newPassword ||
      !passwordData.confirmPassword
    ) {
      showStatusMessage("error", "Please fill in all password fields.");
      return;
    }

    if (passwordData.newPassword.length < 8) {
      showStatusMessage("error", "Password must be at least 8 characters long.");
      return;
    }

    if (!/[A-Za-z]/.test(passwordData.newPassword) || !/\d/.test(passwordData.newPassword)) {
      showStatusMessage("error", "Password must contain both letters and numbers.");
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      showStatusMessage("error", "New password and confirm password do not match.");
      return;
    }

    try {
      setChangingPassword(true);

      setPasswordData(emptyPasswordData);
      showStatusMessage(
        "success",
        "Password validation passed. Connect this form to your backend endpoint to update the actual account password."
      );
    } finally {
      setChangingPassword(false);
    }
  };

  const handleCancel = () => {
    setDraftProfile(profileData);
    setIsEditing(false);
    setMessage("");
    setMessageType("");
  };

  const toggleEditMode = () => {
    setDraftProfile(profileData);
    setIsEditing(true);
    setMessage("");
    setMessageType("");
  };

  const resetLocalProfile = async () => {
    const confirmed = await showConfirm("Reset this local profile form to default values?");

    if (!confirmed) return;

    localStorage.removeItem(STORAGE_KEY);

    setProfileData(defaultProfileData);
    setDraftProfile(defaultProfileData);
    showStatusMessage("success", "Local profile form has been reset.");
  };

  const togglePasswordVisibility = (field) => {
    setShowPasswords((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  const activeProfile = isEditing ? draftProfile : profileData;

  return (
    <div className="appointment-list">
      {message && (
        <div className={`profile-toast ${messageType}`}>
          <FontAwesomeIcon
            icon={messageType === "success" ? faCheckCircle : faExclamationCircle}
          />
          <span>{message}</span>
        </div>
      )}

      <section className="profile-hero">
        <div className="profile-hero-content">
          <span className="profile-kicker">
            <FontAwesomeIcon icon={faIdCard} />
            Receptionist Account
          </span>

          <h1>Receptionist Profile</h1>

          <p>
            Manage your personal information, contact details, profile photo, and
            password security settings for the receptionist dashboard.
          </p>
        </div>

        <div className="profile-hero-card">
          <div className="hero-avatar">
            {activeProfile.profileImage ? (
              <img src={activeProfile.profileImage} alt="Receptionist profile" />
            ) : (
              <FontAwesomeIcon icon={faUser} />
            )}
          </div>

          <div>
            <strong>{fullName || "Receptionist User"}</strong>
            <span>{profileData.email}</span>
          </div>
        </div>
      </section>

      <section className="profile-summary-grid">
        <div className="profile-summary-card">
          <span>
            <FontAwesomeIcon icon={faUser} />
          </span>
          <div>
            <strong>{fullName || "Receptionist User"}</strong>
            <p>Account Name</p>
          </div>
        </div>

        <div className="profile-summary-card">
          <span>
            <FontAwesomeIcon icon={faEnvelope} />
          </span>
          <div>
            <strong>{profileData.email}</strong>
            <p>Email Address</p>
          </div>
        </div>

        <div className="profile-summary-card">
          <span>
            <FontAwesomeIcon icon={faPhone} />
          </span>
          <div>
            <strong>{profileData.phone || "No phone"}</strong>
            <p>Contact Number</p>
          </div>
        </div>

        <div className="profile-summary-card">
          <span>
            <FontAwesomeIcon icon={faCalendarAlt} />
          </span>
          <div>
            <strong>{profileData.memberSince}</strong>
            <p>Member Since</p>
          </div>
        </div>
      </section>

      <section className="profile-layout">
        <div className="profile-main-column">
          <div className="profile-card">
            <div className="card-header">
              <div>
                <span className="section-kicker">
                  <FontAwesomeIcon icon={faUser} />
                  Personal Information
                </span>
                <h2>Profile Details</h2>
                <p>Update the receptionist profile shown in the dashboard.</p>
              </div>

              <div className="header-actions">
                {!isEditing ? (
                  <button type="button" className="btn-primary" onClick={toggleEditMode}>
                    <FontAwesomeIcon icon={faPen} />
                    Edit Profile
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleSaveProfile}
                      disabled={savingProfile}
                    >
                      <FontAwesomeIcon icon={savingProfile ? faRefresh : faSave} spin={savingProfile} />
                      {savingProfile ? "Saving..." : "Save Changes"}
                    </button>

                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleCancel}
                      disabled={savingProfile}
                    >
                      <FontAwesomeIcon icon={faTimes} />
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="profile-avatar-section">
              <div className="avatar-container">
                {activeProfile.profileImage ? (
                  <img
                    src={activeProfile.profileImage}
                    alt="Profile"
                    className="avatar-img"
                  />
                ) : (
                  <div className="avatar-img placeholder">
                    <FontAwesomeIcon icon={faUser} />
                  </div>
                )}
              </div>

              <div className="avatar-details">
                <strong>{`${activeProfile.firstName} ${activeProfile.lastName}`}</strong>
                <span>{activeProfile.email}</span>

                {isEditing && (
                  <div className="avatar-actions">
                    <input
                      type="file"
                      id="avatar-upload"
                      accept="image/*"
                      onChange={handleImageUpload}
                      hidden
                    />

                    <label htmlFor="avatar-upload" className="avatar-upload-btn">
                      <FontAwesomeIcon icon={faCamera} />
                      Change Photo
                    </label>
                  </div>
                )}
              </div>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label>First Name *</label>
                <input
                  type="text"
                  name="firstName"
                  value={draftProfile.firstName}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  placeholder="Enter first name"
                />
              </div>

              <div className="form-group">
                <label>Last Name *</label>
                <input
                  type="text"
                  name="lastName"
                  value={draftProfile.lastName}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  placeholder="Enter last name"
                />
              </div>

              <div className="form-group">
                <label>Email Address *</label>
                <input
                  type="email"
                  name="email"
                  value={draftProfile.email}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  placeholder="Enter email address"
                />
              </div>

              <div className="form-group">
                <label>Phone Number</label>
                <input
                  type="tel"
                  name="phone"
                  value={draftProfile.phone}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  placeholder="Enter phone number"
                />
              </div>

              <div className="form-group full-width">
                <label>Bio</label>
                <textarea
                  name="bio"
                  value={draftProfile.bio}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  placeholder="Write a short profile description"
                />
              </div>
            </div>
          </div>

          <div className="profile-card">
            <div className="card-header compact">
              <div>
                <span className="section-kicker">
                  <FontAwesomeIcon icon={faMapMarkerAlt} />
                  Address Information
                </span>
                <h2>Location Details</h2>
              </div>
            </div>

            <div className="form-grid">
              <div className="form-group full-width">
                <label>Street Address</label>
                <input
                  type="text"
                  name="address"
                  value={draftProfile.address}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  placeholder="Enter street address"
                />
              </div>

              <div className="form-group">
                <label>City / Municipality</label>
                <input
                  type="text"
                  name="city"
                  value={draftProfile.city}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  placeholder="Enter city"
                />
              </div>

              <div className="form-group">
                <label>Province / State</label>
                <input
                  type="text"
                  name="state"
                  value={draftProfile.state}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  placeholder="Enter province or state"
                />
              </div>

              <div className="form-group">
                <label>ZIP Code</label>
                <input
                  type="text"
                  name="zipCode"
                  value={draftProfile.zipCode}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  placeholder="Enter ZIP code"
                />
              </div>

              <div className="form-group">
                <label>Country</label>
                <input
                  type="text"
                  name="country"
                  value={draftProfile.country}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  placeholder="Enter country"
                />
              </div>
            </div>
          </div>
        </div>

        <aside className="profile-side-column">
          <div className="profile-card security-card">
            <div className="card-header compact">
              <div>
                <span className="section-kicker">
                  <FontAwesomeIcon icon={faShieldAlt} />
                  Account Security
                </span>
                <h2>Change Password</h2>
                <p>Use a strong password to protect receptionist access.</p>
              </div>
            </div>

            <div className="password-form">
              <div className="form-group">
                <label>Current Password</label>
                <div className="password-input-wrapper">
                  <input
                    type={showPasswords.currentPassword ? "text" : "password"}
                    name="currentPassword"
                    value={passwordData.currentPassword}
                    onChange={handlePasswordChange}
                    placeholder="Enter current password"
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => togglePasswordVisibility("currentPassword")}
                  >
                    <FontAwesomeIcon
                      icon={showPasswords.currentPassword ? faEyeSlash : faEye}
                    />
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label>New Password</label>
                <div className="password-input-wrapper">
                  <input
                    type={showPasswords.newPassword ? "text" : "password"}
                    name="newPassword"
                    value={passwordData.newPassword}
                    onChange={handlePasswordChange}
                    placeholder="Enter new password"
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => togglePasswordVisibility("newPassword")}
                  >
                    <FontAwesomeIcon
                      icon={showPasswords.newPassword ? faEyeSlash : faEye}
                    />
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label>Confirm New Password</label>
                <div className="password-input-wrapper">
                  <input
                    type={showPasswords.confirmPassword ? "text" : "password"}
                    name="confirmPassword"
                    value={passwordData.confirmPassword}
                    onChange={handlePasswordChange}
                    placeholder="Confirm new password"
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => togglePasswordVisibility("confirmPassword")}
                  >
                    <FontAwesomeIcon
                      icon={showPasswords.confirmPassword ? faEyeSlash : faEye}
                    />
                  </button>
                </div>
              </div>

              <div className={`password-strength strength-${passwordStrength.score}`}>
                <div>
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <p>{passwordStrength.label}</p>
              </div>

              <div className="password-requirements">
                Password must be at least 8 characters long and contain both letters and numbers.
              </div>

              <button
                type="button"
                className="btn-primary full-width-btn"
                onClick={handleChangePassword}
                disabled={changingPassword}
              >
                <FontAwesomeIcon icon={changingPassword ? faRefresh : faLock} spin={changingPassword} />
                {changingPassword ? "Checking..." : "Change Password"}
              </button>
            </div>
          </div>

          <div className="profile-card account-card">
            <div className="card-header compact">
              <div>
                <span className="section-kicker">
                  <FontAwesomeIcon icon={faCalendarAlt} />
                  Account Information
                </span>
                <h2>Account Details</h2>
              </div>
            </div>

            <div className="account-info-list">
              <div>
                <small>Role</small>
                <strong>Receptionist</strong>
              </div>

              <div>
                <small>Member Since</small>
                <strong>{profileData.memberSince}</strong>
              </div>

              <div>
                <small>Dashboard Access</small>
                <strong>Front Desk Modules</strong>
              </div>
            </div>

            <button type="button" className="btn-secondary full-width-btn" onClick={resetLocalProfile}>
              <FontAwesomeIcon icon={faRefresh} />
              Reset Local Form
            </button>
          </div>
        </aside>
      </section>
    </div>
  );
};

export default AppointmentList;