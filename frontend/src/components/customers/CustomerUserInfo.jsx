import { useMemo } from "react";
import { useAuth } from "../../context/AuthContext";
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
      <div className="userinfo-header">
        <div>
          <span className="userinfo-eyebrow">Customer Account</span>
          <h2>My Profile</h2>
          <p>View your personal information and membership details.</p>
        </div>
      </div>

      <div className="userinfo-card">
        <div className="userinfo-avatar">
          {user.name.charAt(0)}
        </div>

        <div className="userinfo-details">
          <p><strong>Full Name:</strong> {user.name}</p>
          <p><strong>Email:</strong> {user.email}</p>
          <p><strong>Phone:</strong> {user.phone}</p>
          <p><strong>Address:</strong> {user.address}</p>
          <p><strong>Member Since:</strong> {user.memberSince}</p>
        </div>
      </div>
    </section>
  );
};

export default CustomerUserInfo;