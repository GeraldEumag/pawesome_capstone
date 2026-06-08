import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { apiRequest } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faUser,
  faLock,
  faEye,
  faEyeSlash,
} from "@fortawesome/free-solid-svg-icons";
import logo from "../../assets/pawesome.jpg";
import "./Login.css";
import { showSuccess, showError } from "../../utils/alert.jsx";

const roleRouteMap = {
  admin: "/admin",
  payroll: "/payroll",
  payroll_manager: "/payroll",
  customer: "/customer",
  receptionist: "/receptionist",
  veterinary: "/veterinary",
  vet: "/veterinary",
  veterinarian: "/veterinary",
  inventory: "/inventory",
  cashier: "/cashier",
  manager: "/manager",
};

const Login = () => {
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    rememberMe: false,
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const navigate = useNavigate();
  const { login } = useAuth();

  const validateForm = () => {
    const newErrors = {};

    if (!formData.username.trim()) {
      newErrors.username = "Username is required";
    }

    if (!formData.password) {
      newErrors.password = "Password is required";
    }

    return newErrors;
  };

  const handleLogin = async (e) => {
    e.preventDefault();

    const newErrors = validateForm();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await apiRequest("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          login: formData.username.trim(),
          password: formData.password,
        }),
      });

      login(response.token, response.user.role, {
        name: response.user.name,
        username: response.user.username,
        email: response.user.email,
        profile_photo: response.user.profile_photo
          ? (response.user.profile_photo.includes("?v=")
              ? response.user.profile_photo
              : `${response.user.profile_photo}?v=${Date.now()}`)
          : "",
      });

      if (formData.rememberMe) {
        localStorage.setItem("rememberMe", "true");
      }

      await showSuccess(`Welcome, ${response.user.name}!`);

      navigate(roleRouteMap[response.user.role] || "/dashboard");
    } catch (error) {
      const errorMsg = error.message || "Invalid username or password";

      setErrors({
        username: errorMsg,
        password: errorMsg,
      });
      showError(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-shell">
        <aside className="login-left-panel">
          <Link to="/" className="back-home-link">
            <FontAwesomeIcon icon={faArrowLeft} />
            <span>Back to Landing Page</span>
          </Link>

          <div className="login-left-content">
            <img src={logo} alt="Pawesome Retreat Inc." className="login-logo-img" />

            <h1>Welcome back to Pawesome Retreat</h1>
            <p>
              Manage appointments, pet care services, customer requests, and daily
              operations in one secure portal.
            </p>
          </div>
        </aside>

        <main className="login-right-panel">
          <div className="login-card">
            <div className="login-heading">
              <h2>Sign In</h2>
              <p>Enter your account credentials to continue.</p>
            </div>

            <form className="login-form" onSubmit={handleLogin}>
              <label>USERNAME *</label>
              <div className="input-wrap">
                <FontAwesomeIcon icon={faUser} />
                <input
                  type="text"
                  placeholder="Enter your username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>

              <label>PASSWORD *</label>
              <div className="input-wrap">
                <FontAwesomeIcon icon={faLock} />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  disabled={isSubmitting}
                />

                <button
                  type="button"
                  className="show-password-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isSubmitting}
                >
                  <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} />
                </button>
              </div>

              {(errors.username || errors.password) && (
                <div className="login-error">{errors.username || errors.password}</div>
              )}

              <div className="login-options">
                <label className="remember-box">
                  <input
                    type="checkbox"
                    checked={formData.rememberMe}
                    onChange={(e) => setFormData({ ...formData, rememberMe: e.target.checked })}
                    disabled={isSubmitting}
                  />
                  <span>Remember me</span>
                </label>

                <Link to="/forgot-password">Forgot password?</Link>
              </div>

              <button className="login-btn" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Signing In..." : "Sign In"}
              </button>
            </form>

            <p className="login-register">
              New to Pawesome? <Link to="/register">Create an account</Link>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Login;
