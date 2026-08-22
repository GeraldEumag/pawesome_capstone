import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const roleRouteMap = {
  admin: "/admin",
  super_admin: "/admin",
  customer: "/customer",
  receptionist: "/receptionist",
  super_receptionist: "/super-receptionist",
  veterinary: "/veterinary",
  vet: "/veterinary",
  inventory: "/inventory",
  cashier: "/cashier",
  manager: "/manager",
};

const RoleBasedLanding = () => {
  const navigate = useNavigate();
  const { role } = useAuth();

  useEffect(() => {
    if (!role) {
      navigate("/login");
    } else {
      navigate(roleRouteMap[role] || "/dashboard");
    }
  }, [role, navigate]);

  return (
    <div>
      <p>Redirecting to your {role} dashboard...</p>
    </div>
  );
};

export default RoleBasedLanding;
