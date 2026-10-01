import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const routeRoleMap = {
  admin: ["admin"],
  customer: ["customer"],
  receptionist: ["receptionist", "admin", "super_receptionist"],
  cashier: ["cashier", "admin", "super_receptionist"],
  inventory: ["inventory", "admin", "super_receptionist"],
  manager: ["manager", "admin"],
  veterinary: ["veterinary", "vet", "veterinarian", "admin"],
  "super-receptionist": ["super_receptionist"],
};

const roleHomeMap = {
  admin: "/admin",
  customer: "/customer",
  receptionist: "/receptionist",
  super_receptionist: "/super-receptionist",
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
