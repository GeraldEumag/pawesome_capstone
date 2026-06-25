import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const RoleProtectedRoute = ({ children, allowedRoles }) => {
  const { token, role } = useAuth();

  if (!token) {
    return <Navigate to="/login" />;
  }

  if (!allowedRoles.includes(role)) {
    return <Navigate to="/dashboard" />;
  }

  return children;
};

export default RoleProtectedRoute;
