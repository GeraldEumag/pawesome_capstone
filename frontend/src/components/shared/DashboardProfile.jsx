import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaUserCircle, FaCamera, FaSpinner, FaCheck, FaTimes } from "react-icons/fa";
import { useAuth } from "../../context/AuthContext";
import { uploadProfilePhoto } from "../../api/client";
import "./DashboardProfile.css";

const resolveProfilePhoto = (url) => {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  if (url.startsWith("/")) return `${window.location.origin}${url}`;
  // Relative path without leading slash — resolve against origin
  return `${window.location.origin}/${url}`;
};

const ROLE_PROFILE_PATHS = {
  admin: "/admin/profile",
  manager: "/manager/profile",
  cashier: "/cashier/profile",
  customer: "/customer/profile",
  veterinary: "/vet/profile",
  receptionist: "/receptionist/profile",
  inventory: "/inventory/profile",
  grooming: "/grooming/profile",
};

export default function DashboardProfile({
  name = "User",
  role = "Dashboard User",
  image = "",
  onUpload,
}) {
  const fileRef = useRef(null);
  const navigate = useNavigate();
  const { updateUser } = useAuth();

  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleNavigate = () => {
    const path = ROLE_PROFILE_PATHS[role] || "/profile";
    navigate(path);
  };

  const handleChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const data = await uploadProfilePhoto(file);
      let photoUrl = data?.profile_photo || data?.url || "";
      if (photoUrl) {
        // Ensure cache-bust param is present so browser re-fetches
        if (!photoUrl.includes("?v=")) photoUrl += "?v=" + Date.now();
        updateUser({ profile_photo: photoUrl });
      }
      if (onUpload) onUpload(file);
      showToast("Photo updated!", "success");
    } catch (err) {
      showToast(err.message || "Upload failed", "error");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="dashboard-profile-card">
      {toast && (
        <div className={`dashboard-profile-toast ${toast.type}`}>
          {toast.type === "success" ? <FaCheck size={11} /> : <FaTimes size={11} />}
          {toast.msg}
        </div>
      )}

      <button
        className="dashboard-profile-btn"
        type="button"
        onClick={handleNavigate}
        title="View profile"
      >
        <span className="dashboard-profile-avatar">
          {image ? (
            <img
              src={resolveProfilePhoto(image)}
              alt={`${name} profile`}
              onError={(e) => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }}
            />
          ) : null}
          <FaUserCircle size={24} style={{ display: image ? "none" : "block" }} />
        </span>

        <span className="dashboard-profile-info">
          <strong>{name}</strong>
          <small>{role}</small>
        </span>
      </button>

      <button
        className={`dashboard-profile-upload ${uploading ? "uploading" : ""}`}
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        title="Change profile photo"
      >
        {uploading ? <FaSpinner size={14} className="spin" /> : <FaCamera size={15} />}
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleChange}
      />
    </div>
  );
}
