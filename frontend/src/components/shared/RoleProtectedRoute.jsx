import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const RoleProtectedRoute = ({ children, allowedRoles }) => {
  const { token, role } = useAuth();
  const normalizedRole = role === "payroll_manager" ? "payroll" : role;

  if (!token) {
    return <Navigate to="/login" />;
  }

  if (!allowedRoles.includes(normalizedRole)) {
    return <Navigate to="/dashboard" />;
  }

  return children;
};

export default RoleProtectedRoute;
