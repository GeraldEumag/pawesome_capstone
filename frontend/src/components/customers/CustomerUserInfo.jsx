import { useMemo } from "react";
import { useAuth } from "../../context/AuthContext";
import { FaUser, FaEnvelope, FaPhone, FaMapMarkerAlt, FaCalendarAlt, FaPaw } from "react-icons/fa";
import "./CustomerUserInfo.css";

const CustomerUserInfo = () => {
  const { user: authUser } = useAuth();

  const user = useMemo(() => {
    const name = authUser?.name || "Customer";
    const email = authUser?.email || "No email";
    const phone = authUser?.phone || "";
    const address = authUser?.address
      ? `${authUser.address}, ${authUser.city || ""}, ${authUser.state || ""} ${authUser.zip_code || ""}`
      : "";
    const memberSince = authUser?.created_at
      ? new Date(authUser.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : "";

    return { name, email, phone, address, memberSince };
  }, [authUser]);

  return (
    <section className="userinfo-section">
      <header className="userinfo-header">
        <span className="userinfo-eyebrow"><FaPaw /> Customer Account</span>
        <h2>My Profile</h2>
        <p>Your personal information and membership details.</p>
      </header>

      <div className="userinfo-panel">
        <div className="userinfo-profile-row">
          <div className="userinfo-avatar">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="userinfo-profile-meta">
            <h3 className="userinfo-name">{user.name}</h3>
            <p className="userinfo-email-sub">{user.email}</p>
            {user.memberSince && (
              <span className="userinfo-member-chip">
                <FaCalendarAlt /> Member since {user.memberSince}
              </span>
            )}
          </div>
        </div>

        <div className="userinfo-divider" />

        <div className="userinfo-fields">
          <div className="userinfo-field">
            <div className="userinfo-field-icon"><FaUser /></div>
            <div className="userinfo-field-body">
              <span className="userinfo-field-label">Full Name</span>
              <span className="userinfo-field-value">{user.name}</span>
            </div>
          </div>

          <div className="userinfo-field">
            <div className="userinfo-field-icon"><FaEnvelope /></div>
            <div className="userinfo-field-body">
              <span className="userinfo-field-label">Email Address</span>
              <span className="userinfo-field-value">{user.email}</span>
            </div>
          </div>

          <div className="userinfo-field">
            <div className="userinfo-field-icon"><FaPhone /></div>
            <div className="userinfo-field-body">
              <span className="userinfo-field-label">Phone Number</span>
              <span className="userinfo-field-value">{user.phone || <em style={{opacity:0.5, fontStyle:"italic", fontWeight:400}}>Not provided</em>}</span>
            </div>
          </div>

          <div className="userinfo-field">
            <div className="userinfo-field-icon"><FaMapMarkerAlt /></div>
            <div className="userinfo-field-body">
              <span className="userinfo-field-label">Address</span>
              <span className="userinfo-field-value">{user.address || <em style={{opacity:0.5, fontStyle:"italic", fontWeight:400}}>Not provided</em>}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CustomerUserInfo;