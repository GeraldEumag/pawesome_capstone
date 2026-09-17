import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faEye,
  faEyeSlash,
  faPaw,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import { showWarning, showSuccess, showError } from "../../utils/alert.jsx";
import logo from "../../assets/pawesome.jpg";
import "./Login.css";

const ForgotPassword = () => {
  const [searchParams] = useSearchParams();
  const urlEmail = searchParams.get("email") || "";
  const urlToken = searchParams.get("token") || "";

  const [email, setEmail] = useState(urlEmail);
  const [token, setToken] = useState(urlToken);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState(
    urlToken && urlEmail
      ? "Reset link detected. Choose a new password below."
      : ""
  );
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetTokenSent, setResetTokenSent] = useState(Boolean(urlToken && urlEmail));

  const navigate = useNavigate();

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!email.trim()) {
      setError("Email address is required.");
      showWarning("Email address is required.");
      return;
    }

    setIsSubmitting(true);

    try {
      await apiRequest("/auth/password/forgot", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });

      setResetTokenSent(true);
      setToken("");
      setMessage(
        "If the email address is associated with an account, a password reset link has been sent to that email. Click the link in the email — or paste the token below — to set a new password."
      );
      showSuccess(
        "If the email address is associated with an account, a reset link has been sent to your email."
      );
    } catch (err) {
      setError(err.message || "Failed to request password reset.");
      showError(err.message || "Failed to request password reset.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!token.trim()) {
      setError("Reset token is required.");
      showWarning("Reset token is required.");
      return;
    }

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      showWarning("New password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      showWarning("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      await apiRequest("/auth/password/reset", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          token: token.trim(),
          new_password: newPassword,
          new_password_confirmation: confirmPassword,
        }),
      });

      setMessage("Password reset successfully. Redirecting to login...");
      showSuccess("Password reset successfully. Redirecting to login...");
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      setError(err.message || "Failed to reset password.");
      showError(err.message || "Failed to reset password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const backToEmailStep = () => {
    setResetTokenSent(false);
    setError("");
    setMessage("");
    setToken("");
    setNewPassword("");
    setConfirmPassword("");
  };

  return (
    <div className="login-page">
      <div className="login-blob login-blob-1" aria-hidden="true" />
      <div className="login-blob login-blob-2" aria-hidden="true" />
      <div className="login-blob login-blob-3" aria-hidden="true" />

      <div className="login-page-paw login-page-paw-tl" aria-hidden="true">
        <FontAwesomeIcon icon={faPaw} />
      </div>
      <div className="login-page-paw login-page-paw-br" aria-hidden="true">
        <FontAwesomeIcon icon={faPaw} />
      </div>

      <Link to="/" className="login-back-link">
        <FontAwesomeIcon icon={faArrowLeft} />
        <span>Back to Home</span>
      </Link>

      <div className="login-card">
        <div className="login-card-header">
          <div className="login-header-paw login-header-paw-1" aria-hidden="true">🐾</div>
          <div className="login-header-paw login-header-paw-2" aria-hidden="true">🐾</div>

          <img src={logo} alt="Pawesome Retreat Inc." className="login-logo-img" />
          <p className="login-brand-name">PAWESOME RETREAT</p>
          <p className="login-brand-tagline">Premium Pet Care & Vet Services</p>
        </div>

        <div className="login-card-body">
          <div className="login-heading">
            <h2>{resetTokenSent ? "Set New Password" : "Forgot Password"}</h2>
            <p>
              {resetTokenSent
                ? "Paste the token from your email — or use the reset link — and choose a new password."
                : "Enter your registered email and we'll send you a secure reset link."}
            </p>
          </div>

          {message && (
            <div
              style={{
                margin: "0 0 1.25rem",
                padding: "0.85rem 1rem",
                borderRadius: "18px",
                background: "rgba(16, 185, 129, 0.1)",
                border: "1px solid rgba(16, 185, 129, 0.22)",
                color: "#047857",
                fontSize: "0.88rem",
                fontWeight: 800,
                lineHeight: 1.5,
              }}
            >
              {message}
            </div>
          )}

          {error && (
            <div className="login-error" role="alert" style={{ marginBottom: "1.25rem" }}>
              {error}
            </div>
          )}

          {!resetTokenSent ? (
            <form className="login-form" onSubmit={handleEmailSubmit} noValidate>
              <div className="login-field">
                <label htmlFor="fp-email">Email address</label>
                <input
                  id="fp-email"
                  type="email"
                  className="login-input"
                  placeholder="Enter your registered email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSubmitting}
                  autoComplete="email"
                />
              </div>

              <button className="login-btn" type="submit" disabled={isSubmitting}>
                <span>{isSubmitting ? "Sending…" : "Send Reset Link"}</span>
                {!isSubmitting && (
                  <span className="login-btn-arrow" aria-hidden="true">→</span>
                )}
              </button>
            </form>
          ) : (
            <form className="login-form" onSubmit={handleResetSubmit} noValidate>
              <div className="login-field">
                <label htmlFor="fp-token">Reset token</label>
                <input
                  id="fp-token"
                  type="text"
                  className="login-input"
                  placeholder="Paste the token from your email"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              <div className="login-field">
                <label htmlFor="fp-new-password">New password</label>
                <div className="login-password-wrap">
                  <input
                    id="fp-new-password"
                    type={showNewPassword ? "text" : "password"}
                    className="login-input"
                    placeholder="At least 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={isSubmitting}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="show-password-btn"
                    onClick={() => setShowNewPassword((p) => !p)}
                    disabled={isSubmitting}
                    aria-label={showNewPassword ? "Hide password" : "Show password"}
                  >
                    <FontAwesomeIcon icon={showNewPassword ? faEyeSlash : faEye} />
                  </button>
                </div>
              </div>

              <div className="login-field">
                <label htmlFor="fp-confirm-password">Confirm new password</label>
                <div className="login-password-wrap">
                  <input
                    id="fp-confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    className="login-input"
                    placeholder="Re-enter your new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={isSubmitting}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="show-password-btn"
                    onClick={() => setShowConfirmPassword((p) => !p)}
                    disabled={isSubmitting}
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    <FontAwesomeIcon icon={showConfirmPassword ? faEyeSlash : faEye} />
                  </button>
                </div>
              </div>

              <button className="login-btn" type="submit" disabled={isSubmitting}>
                <span>{isSubmitting ? "Resetting…" : "Reset Password"}</span>
                {!isSubmitting && (
                  <span className="login-btn-arrow" aria-hidden="true">→</span>
                )}
              </button>

              <p className="login-register">
                Wrong email?{" "}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    backToEmailStep();
                  }}
                >
                  Use a different email
                </a>
              </p>
            </form>
          )}

          <p className="login-register">
            Remembered your password?{" "}
            <Link to="/login">Sign in to your account</Link>
          </p>
        </div>
      </div>

      <div className="login-trust-foot" aria-label="Customer trust">
        <span className="login-trust-stars">★★★★★</span>
        <span>Trusted by 200+ happy pet owners · Las Piñas</span>
      </div>
    </div>
  );
};

export default ForgotPassword;
