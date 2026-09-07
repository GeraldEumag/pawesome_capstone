import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { apiRequest } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { getDraft } from "../../utils/preBookingDraft";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faEye,
  faEyeSlash,
  faPaw,
} from "@fortawesome/free-solid-svg-icons";
import logo from "../../assets/pawesome.jpg";
import "./Login.css";
import { showSuccess, showError } from "../../utils/alert.jsx";

const roleRouteMap = {
  admin: "/admin",
  super_admin: "/admin",
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

const Login = () => {
  const [formData, setFormData] = useState({ username: "", password: "" });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const navigate = useNavigate();
  const { login } = useAuth();

  const validateForm = () => {
    const newErrors = {};
    if (!formData.username.trim()) newErrors.username = "Username is required";
    if (!formData.password)       newErrors.password = "Password is required";
    return newErrors;
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    const newErrors = validateForm();
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }

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

      let redirectPath = roleRouteMap[response.user.role] || "/dashboard";
      if (response.user.role === "customer") {
        if (!response.user.email_verified_at) {
          navigate(`/verify-email?email=${encodeURIComponent(response.user.email)}`);
          return;
        }
        const draft = getDraft();
        if (draft?.service_type) {
          const draftPaths = { hotel: "/customer/hotel", grooming: "/customer/grooming", vet: "/customer/vet" };
          redirectPath = draftPaths[draft.service_type] || redirectPath;
        }
      }

      await showSuccess(`Welcome, ${response.user.name}!`);
      navigate(redirectPath);
    } catch (error) {
      const errorMsg = error.message || "Invalid username or password";
      setErrors({ username: errorMsg, password: errorMsg });
      showError(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      {/* Animated background blobs */}
      <div className="login-blob login-blob-1" aria-hidden="true" />
      <div className="login-blob login-blob-2" aria-hidden="true" />
      <div className="login-blob login-blob-3" aria-hidden="true" />

      {/* Decorative large paw watermarks */}
      <div className="login-page-paw login-page-paw-tl" aria-hidden="true">
        <FontAwesomeIcon icon={faPaw} />
      </div>
      <div className="login-page-paw login-page-paw-br" aria-hidden="true">
        <FontAwesomeIcon icon={faPaw} />
      </div>

      {/* Back to home */}
      <Link to="/" className="login-back-link">
        <FontAwesomeIcon icon={faArrowLeft} />
        <span>Back to Home</span>
      </Link>

      {/* Card */}
      <div className="login-card">

        {/* Pink gradient header */}
        <div className="login-card-header">
          <div className="login-header-paw login-header-paw-1" aria-hidden="true">🐾</div>
          <div className="login-header-paw login-header-paw-2" aria-hidden="true">🐾</div>

          <img src={logo} alt="Pawesome Retreat Inc." className="login-logo-img" />
          <p className="login-brand-name">PAWESOME RETREAT</p>
          <p className="login-brand-tagline">Premium Pet Care & Vet Services</p>
        </div>

        {/* Form body */}
        <div className="login-card-body">
          <div className="login-heading">
            <h2>Welcome back 👋</h2>
            <p>Sign in to your account to continue</p>
          </div>

          <form className="login-form" onSubmit={handleLogin} noValidate>
            <div className="login-field">
              <label htmlFor="login-username">Username</label>
              <input
                id="login-username"
                className={`login-input${errors.username ? " login-input-error" : ""}`}
                type="text"
                placeholder="Enter your username"
                value={formData.username}
                onChange={(e) => {
                  setFormData({ ...formData, username: e.target.value });
                  if (errors.username) setErrors({ ...errors, username: "" });
                }}
                disabled={isSubmitting}
                autoComplete="username"
              />
            </div>

            <div className="login-field">
              <label htmlFor="login-password">Password</label>
              <div className="login-password-wrap">
                <input
                  id="login-password"
                  className={`login-input${errors.password ? " login-input-error" : ""}`}
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={(e) => {
                    setFormData({ ...formData, password: e.target.value });
                    if (errors.password) setErrors({ ...errors, password: "" });
                  }}
                  disabled={isSubmitting}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="show-password-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isSubmitting}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} />
                </button>
              </div>
            </div>

            {(errors.username || errors.password) && (
              <div className="login-error" role="alert">
                {errors.username || errors.password}
              </div>
            )}

            <div className="login-options">
              <Link to="/forgot-password">Forgot password?</Link>
            </div>

            <button className="login-btn" type="submit" disabled={isSubmitting}>
              <span>{isSubmitting ? "Signing In…" : "Sign In"}</span>
              {!isSubmitting && (
                <span className="login-btn-arrow" aria-hidden="true">→</span>
              )}
            </button>
          </form>

          <p className="login-register">
            New to Pawesome?{" "}
            <Link to="/register">Create a free account</Link>
          </p>
        </div>
      </div>

      {/* Trust footer */}
      <div className="login-trust-foot" aria-label="Customer trust">
        <span className="login-trust-stars">★★★★★</span>
        <span>Trusted by 200+ happy pet owners · Las Piñas</span>
      </div>
    </div>
  );
};

export default Login;
