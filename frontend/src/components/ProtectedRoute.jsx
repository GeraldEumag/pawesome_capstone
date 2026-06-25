import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const routeRoleMap = {
  admin: ["admin"],
  customer: ["customer"],
  receptionist: ["receptionist"],
  cashier: ["cashier"],
  inventory: ["inventory"],
  manager: ["manager"],
  veterinary: ["veterinary", "vet", "veterinarian"],
};

const roleHomeMap = {
  admin: "/admin",
  customer: "/customer",
  receptionist: "/receptionist",
  veterinary: "/veterinary",
  vet: "/veterinary",
  veterinarian: "/veterinary",
  inventory: "/inventory",
  cashier: "/cashier",
  manager: "/manager",
};

const ProtectedRoute = ({ children }) => {
  const { token, role } = useAuth();
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  const firstSegment = location.pathname.split("/").filter(Boolean)[0];
  const allowedRoles = routeRoleMap[firstSegment];

  if (!allowedRoles || !allowedRoles.includes(role)) {
    return <Navigate to={roleHomeMap[role] || "/login"} replace />;
  }

  return children;
};

export default ProtectedRoute;
