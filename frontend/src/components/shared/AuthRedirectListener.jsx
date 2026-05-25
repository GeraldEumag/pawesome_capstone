import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Listens for auth-expired events dispatched by the API client
 * and performs client-side navigation to /login without a full reload.
 */
const AuthRedirectListener = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = () => {
      navigate("/login", { replace: true });
    };

    window.addEventListener("pawesome:auth-expired", handler);
    return () => window.removeEventListener("pawesome:auth-expired", handler);
  }, [navigate]);

  return null;
};

export default AuthRedirectListener;
