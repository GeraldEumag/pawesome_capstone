import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import "./Logout.css";

const Logout = () => {
  const navigate = useNavigate();
  const { logout: authLogout } = useAuth();
  const hasLoggedOut = useRef(false);

  useEffect(() => {
    if (hasLoggedOut.current) return;
    hasLoggedOut.current = true;

    const logoutRequest = apiRequest("/auth/logout", { method: "POST" }).catch(() => {});
    authLogout();

    logoutRequest
      .finally(() => {
        authLogout();
        navigate("/");
      });
  }, [navigate, authLogout]);

  return (
    <div className="logout-screen">
      <div className="logout-card">
        <h1>PAWESOME</h1>
        <h2>Signing you out...</h2>
        <p>Please wait while we safely end your session.</p>
      </div>
    </div>
  );
};

export default Logout;
