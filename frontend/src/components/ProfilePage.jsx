import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUser,
  faCamera,
  faSave,
  faTimes,
  faLock,
  faEye,
  faEyeSlash,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest, uploadProfilePhoto } from "../api/client";
import { useAuth } from "../context/AuthContext";
import "./ProfilePage.css";

export default function ProfilePage({
  title = "My Profile",
  roleLabel = "User",
  allowedRoles = [],
  bioPlaceholder = "Tell us about yourself...",
}) {
  const { updateUser, user: authUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [originalEmail, setOriginalEmail] = useState("");
  const [originalUsername, setOriginalUsername] = useState("");

  const [profileData, setProfileData] = useState({
    id: null,
    name: "",
    first_name: "",
    middle_name: "",
    last_name: "",
    username: "",
    email: "",
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

  const showMessage = (text, type = "success") => {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => setMessage(""), 3000);
  };

  const fetchUserProfile = async () => {
    try {
      setLoading(true);

      const response = await apiRequest("/auth/me");

      if (!response) {
        showMessage("Failed to load profile data.", "error");
        return;
      }

      if (allowedRoles.length > 0 && !allowedRoles.includes(response.role)) {
        showMessage(`Access denied. This profile is for ${roleLabel}.`, "error");
        return;
      }

      setProfileData({
        id: response.id || null,
        name: response.name || "",
        first_name: response.first_name || "",
        middle_name: response.middle_name || "",
        last_name: response.last_name || "",
        username: response.username || "",
        email: response.email || "",
        phone: response.phone || "",
        address: response.address || "",
        city: response.city || "",
        state: response.state || "",
        zip_code: response.zip_code || "",
        country: response.country || "",
        bio: response.bio || "",
        role: response.role || "",
        is_active: response.is_active !== undefined ? response.is_active : true,
        created_at: response.created_at || "",
        updated_at: response.updated_at || "",
        // Prefer AuthContext photo (has ?v= cache-buster) over raw API value
        profileImage: authUser?.profile_photo || response.profile_photo || response.profile_image || null,
      });

      setOriginalEmail(response.email || "");
      setOriginalUsername(response.username || "");
    } catch (err) {
      showMessage(err.message || "Failed to load profile data.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserProfile();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setProfileData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handlePasswordInput = (e) => {
    const { name, value } = e.target;
    setPasswordData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setProfileData((prev) => ({ ...prev, profileImage: reader.result }));
    };
    reader.readAsDataURL(file);

    try {
      const data = await uploadProfilePhoto(file);
      let photoUrl = data?.profile_photo || data?.url || "";
      if (photoUrl) {
        if (!photoUrl.includes("?v=")) photoUrl += "?v=" + Date.now();
        updateUser({ profile_photo: photoUrl });
        setProfileData((prev) => ({ ...prev, profileImage: photoUrl }));
      }
      showMessage("Profile photo updated!", "success");
    } catch (err) {
      showMessage(err.message || "Failed to upload photo.", "error");
    }
  };

  const handleSaveProfile = async () => {
    if (!profileData.first_name || !profileData.last_name || !profileData.email) {
      showMessage("Please fill in all required fields.", "error");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(profileData.email)) {
      showMessage("Please enter a valid email address.", "error");
      return;
    }

    try {
      setSaving(true);

      const updateData = {
        first_name: profileData.first_name,
        middle_name: profileData.middle_name,
        last_name: profileData.last_name,
        phone: profileData.phone,
        address: profileData.address,
        city: profileData.city,
        state: profileData.state,
        zip_code: profileData.zip_code,
        country: profileData.country,
        bio: profileData.bio,
      };

      if (profileData.email !== originalEmail) {
        updateData.email = profileData.email;
      }

      if (profileData.username !== originalUsername) {
        updateData.username = profileData.username;
      }

      await apiRequest("/auth/profile", {
        method: "PUT",
        body: JSON.stringify(updateData),
      });

      showMessage("Profile updated successfully!", "success");
      setIsEditing(false);
      await fetchUserProfile();
    } catch (err) {
      showMessage(err.message || "Failed to update profile.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (
      !passwordData.currentPassword ||
      !passwordData.newPassword ||
      !passwordData.confirmPassword
    ) {
      showMessage("Please fill in all password fields.", "error");
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      showMessage("New passwords do not match.", "error");
      return;
    }

    if (passwordData.newPassword.length < 8) {
      showMessage("Password must be at least 8 characters long.", "error");
      return;
    }

    try {
      setChangingPassword(true);

      await apiRequest("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          current_password: passwordData.currentPassword,
          new_password: passwordData.newPassword,
          new_password_confirmation: passwordData.confirmPassword,
        }),
      });

      showMessage("Password changed successfully!", "success");

      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (err) {
      showMessage(err.message || "Failed to change password.", "error");
    } finally {
      setChangingPassword(false);
    }
  };

  const handleCancel = async () => {
    setIsEditing(false);
    setMessage("");
    await fetchUserProfile();
  };

  const togglePasswordVisibility = (field) => {
    setShowPasswords((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  const fullName =
    `${profileData.first_name} ${profileData.last_name}`.trim() ||
    profileData.name ||
    roleLabel;

  return (
    <section className="unified-profile">
      <div className="profile-hero-card">
        <div className="profile-hero-left">
          <div className="profile-hero-avatar">
            {profileData.profileImage ? (
              <img
                src={profileData.profileImage.startsWith("/") ? `${window.location.origin}${profileData.profileImage}` : profileData.profileImage}
                alt="Profile"
                onError={(e) => { e.target.style.display = "none"; }}
              />
            ) : (
              <FontAwesomeIcon icon={faUser} />
            )}
          </div>

          <div>
            <h1>{title}</h1>
            <p>
              {fullName} • {roleLabel}
            </p>
          </div>
        </div>

        <button
          className="profile-btn-primary"
          type="button"
          onClick={() => setIsEditing((prev) => !prev)}
        >
          <FontAwesomeIcon icon={isEditing ? faTimes : faUser} />
          {isEditing ? "Cancel Editing" : "Edit Profile"}
        </button>
      </div>

      {message && (
        <div className={`profile-message ${messageType}`}>
          {message}
        </div>
      )}

      {loading ? (
        <div className="profile-card profile-loading">
          <FontAwesomeIcon icon={faSpinner} spin />
          <p>Loading profile...</p>
        </div>
      ) : (
        <>
          <div className="profile-stats-row">
            <div className="profile-stat-card">
              <h3>{profileData.role || roleLabel}</h3>
              <p>Role</p>
            </div>

            <div className="profile-stat-card">
              <h3>{profileData.is_active ? "Active" : "Inactive"}</h3>
              <p>Status</p>
            </div>

            <div className="profile-stat-card">
              <h3>
                {profileData.created_at
                  ? new Date(profileData.created_at).toLocaleDateString()
                  : "N/A"}
              </h3>
              <p>Member Since</p>
            </div>
          </div>

          <div className="profile-grid">
            <div className="profile-card">
              <div className="profile-section">
                <h2>Personal Information</h2>

                <div className="profile-avatar-section">
                  <div className="profile-avatar-main">
                    {profileData.profileImage ? (
                      <img
                        src={profileData.profileImage.startsWith("/") ? `${window.location.origin}${profileData.profileImage}` : profileData.profileImage}
                        alt="Profile"
                        onError={(e) => { e.target.style.display = "none"; }}
                      />
                    ) : (
                      <FontAwesomeIcon icon={faUser} />
                    )}
                  </div>

                  {isEditing && (
                    <div>
                      <input
                        type="file"
                        id="unified-profile-photo"
                        accept="image/*"
                        onChange={handleImageUpload}
                        hidden
                      />
                      <label
                        htmlFor="unified-profile-photo"
                        className="profile-upload-btn"
                      >
                        <FontAwesomeIcon icon={faCamera} />
                        Change Photo
                      </label>
                    </div>
                  )}
                </div>

                <div className="profile-form-row">
                  <div className="profile-form-group">
                    <label>First Name *</label>
                    <input
                      type="text"
                      name="first_name"
                      value={profileData.first_name}
                      onChange={handleInputChange}
                      disabled={!isEditing}
                    />
                  </div>

                  <div className="profile-form-group">
                    <label>Middle Name</label>
                    <input
                      type="text"
                      name="middle_name"
                      value={profileData.middle_name}
                      onChange={handleInputChange}
                      disabled={!isEditing}
                    />
                  </div>

                  <div className="profile-form-group">
                    <label>Last Name *</label>
                    <input
                      type="text"
                      name="last_name"
                      value={profileData.last_name}
                      onChange={handleInputChange}
                      disabled={!isEditing}
                    />
                  </div>
                </div>

                <div className="profile-form-group">
                  <label>Username *</label>
                  <input
                    type="text"
                    name="username"
                    value={profileData.username}
                    onChange={handleInputChange}
                    disabled={!isEditing}
                  />
                </div>

                <div className="profile-form-group">
                  <label>Email Address *</label>
                  <input
                    type="email"
                    name="email"
                    value={profileData.email}
                    onChange={handleInputChange}
                    disabled={!isEditing}
                  />
                </div>

                <div className="profile-form-group">
                  <label>Phone Number</label>
                  <input
                    type="tel"
                    name="phone"
                    value={profileData.phone}
                    onChange={handleInputChange}
                    disabled={!isEditing}
                  />
                </div>

                <div className="profile-form-group">
                  <label>Bio</label>
                  <textarea
                    name="bio"
                    value={profileData.bio}
                    onChange={handleInputChange}
                    disabled={!isEditing}
                    placeholder={bioPlaceholder}
                  />
                </div>
              </div>

              <div className="profile-section">
                <h2>Address Information</h2>

                <div className="profile-form-row">
                  <div className="profile-form-group">
                    <label>Street Address</label>
                    <input
                      type="text"
                      name="address"
                      value={profileData.address}
                      onChange={handleInputChange}
                      disabled={!isEditing}
                    />
                  </div>

                  <div className="profile-form-group">
                    <label>City</label>
                    <input
                      type="text"
                      name="city"
                      value={profileData.city}
                      onChange={handleInputChange}
                      disabled={!isEditing}
                    />
                  </div>
                </div>

                <div className="profile-form-row">
                  <div className="profile-form-group">
                    <label>State</label>
                    <input
                      type="text"
                      name="state"
                      value={profileData.state}
                      onChange={handleInputChange}
                      disabled={!isEditing}
                    />
                  </div>

                  <div className="profile-form-group">
                    <label>ZIP Code</label>
                    <input
                      type="text"
                      name="zip_code"
                      value={profileData.zip_code}
                      onChange={handleInputChange}
                      disabled={!isEditing}
                    />
                  </div>
                </div>

                <div className="profile-form-group">
                  <label>Country</label>
                  <input
                    type="text"
                    name="country"
                    value={profileData.country}
                    onChange={handleInputChange}
                    disabled={!isEditing}
                  />
                </div>
              </div>

              <div className="profile-section">
                <h2>Account Information</h2>

                <div className="profile-form-row">
                  <div className="profile-form-group">
                    <label>Role</label>
                    <input type="text" value={roleLabel} disabled />
                  </div>

                  <div className="profile-form-group">
                    <label>Status</label>
                    <input
                      type="text"
                      value={profileData.is_active ? "Active" : "Inactive"}
                      disabled
                    />
                  </div>
                </div>

                <div className="profile-form-row">
                  <div className="profile-form-group">
                    <label>Member Since</label>
                    <input
                      type="text"
                      value={
                        profileData.created_at
                          ? new Date(profileData.created_at).toLocaleDateString()
                          : "N/A"
                      }
                      disabled
                    />
                  </div>

                  <div className="profile-form-group">
                    <label>Last Updated</label>
                    <input
                      type="text"
                      value={
                        profileData.updated_at
                          ? new Date(profileData.updated_at).toLocaleDateString()
                          : "N/A"
                      }
                      disabled
                    />
                  </div>
                </div>
              </div>

              {isEditing && (
                <div className="profile-actions">
                  <button
                    className="profile-btn-primary"
                    type="button"
                    onClick={handleSaveProfile}
                    disabled={saving}
                  >
                    {saving ? (
                      <>
                        <FontAwesomeIcon icon={faSpinner} spin />
                        Saving...
                      </>
                    ) : (
                      <>
                        <FontAwesomeIcon icon={faSave} />
                        Save Changes
                      </>
                    )}
                  </button>

                  <button
                    className="profile-btn-secondary"
                    type="button"
                    onClick={handleCancel}
                    disabled={saving}
                  >
                    <FontAwesomeIcon icon={faTimes} />
                    Cancel
                  </button>
                </div>
              )}
            </div>

            <div className="profile-card password-card">
              <div className="profile-section">
                <h2>
                  <FontAwesomeIcon icon={faLock} />
                  Change Password
                </h2>

                <div className="profile-form-group">
                  <label>Current Password</label>
                  <div className="password-wrapper">
                    <input
                      type={showPasswords.currentPassword ? "text" : "password"}
                      name="currentPassword"
                      value={passwordData.currentPassword}
                      onChange={handlePasswordInput}
                    />
                    <button
                      type="button"
                      onClick={() => togglePasswordVisibility("currentPassword")}
                    >
                      <FontAwesomeIcon
                        icon={
                          showPasswords.currentPassword ? faEyeSlash : faEye
                        }
                      />
                    </button>
                  </div>
                </div>

                <div className="profile-form-group">
                  <label>New Password</label>
                  <div className="password-wrapper">
                    <input
                      type={showPasswords.newPassword ? "text" : "password"}
                      name="newPassword"
                      value={passwordData.newPassword}
                      onChange={handlePasswordInput}
                    />
                    <button
                      type="button"
                      onClick={() => togglePasswordVisibility("newPassword")}
                    >
                      <FontAwesomeIcon
                        icon={showPasswords.newPassword ? faEyeSlash : faEye}
                      />
                    </button>
                  </div>
                </div>

                <div className="profile-form-group">
                  <label>Confirm New Password</label>
                  <div className="password-wrapper">
                    <input
                      type={showPasswords.confirmPassword ? "text" : "password"}
                      name="confirmPassword"
                      value={passwordData.confirmPassword}
                      onChange={handlePasswordInput}
                    />
                    <button
                      type="button"
                      onClick={() => togglePasswordVisibility("confirmPassword")}
                    >
                      <FontAwesomeIcon
                        icon={
                          showPasswords.confirmPassword ? faEyeSlash : faEye
                        }
                      />
                    </button>
                  </div>
                </div>

                <p className="password-note">
                  Password must be at least 8 characters long.
                </p>

                <button
                  className="profile-btn-primary"
                  type="button"
                  onClick={handleChangePassword}
                  disabled={changingPassword}
                >
                  {changingPassword ? (
                    <>
                      <FontAwesomeIcon icon={faSpinner} spin />
                      Updating...
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faLock} />
                      Change Password
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
