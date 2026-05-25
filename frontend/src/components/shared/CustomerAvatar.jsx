import { useState } from "react";
import { FaUserCircle } from "react-icons/fa";

const resolveUrl = (url) => {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  if (url.startsWith("/")) return `${window.location.origin}${url}`;
  return `${window.location.origin}/${url}`;
};

const getInitials = (name) => {
  const parts = String(name || "?").trim().split(" ").filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
};

const CustomerAvatar = ({ customer, size = 48, className = "", showInitialsFallback = true }) => {
  const [imgError, setImgError] = useState(false);

  const photoUrl = resolveUrl(
    customer?.profile_photo ||
    customer?.user?.profile_photo ||
    customer?.avatar ||
    null
  );

  const name =
    customer?.name ||
    customer?.full_name ||
    [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") ||
    "?";

  if (photoUrl && !imgError) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className={`customer-avatar-img ${className}`}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          display: "block",
          flexShrink: 0,
        }}
        onError={() => setImgError(true)}
      />
    );
  }

  if (showInitialsFallback) {
    return (
      <span
        className={`customer-avatar-initials ${className}`}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--color-primary-soft, #fde4ee)",
          color: "var(--color-primary, #ff5f93)",
          fontWeight: 700,
          fontSize: size * 0.36,
          flexShrink: 0,
          userSelect: "none",
        }}
      >
        {getInitials(name)}
      </span>
    );
  }

  return (
    <FaUserCircle
      size={size}
      className={className}
      style={{ color: "var(--color-primary, #ff5f93)", flexShrink: 0 }}
    />
  );
};

export default CustomerAvatar;
