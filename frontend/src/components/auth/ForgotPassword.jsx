import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faEnvelope,
  faKey,
  faLock,
  faEye,
  faEyeSlash,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import { showWarning, showSuccess, showError } from "../../utils/alert.jsx";
import logo from "../../assets/pawesome.jpg";
import "./Login.css";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetTokenSent, setResetTokenSent] = useState(false);

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
        "If the email address is associated with an account, a password reset token has been sent to that email. Enter the token below to set a new password."
      );
      showSuccess(
        "If the email address is associated with an account, a reset token has been sent to your email."
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

    if (!newPassword) {
      setError("New password is required.");
      showWarning("New password is required.");
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

            <h1>Reset Your Password</h1>
            <p>
              Enter your registered email and we will send you a secure reset
              token to set a new password for your Pawesome account.
            </p>
          </div>
        </aside>

        <main className="login-right-panel">
          <div className="login-card">
            <div className="login-heading">
              <h2>{resetTokenSent ? "Set New Password" : "Forgot Password"}</h2>
              <p>
                {resetTokenSent
                  ? "Enter the reset token sent to your email and choose a new password."
                  : "Enter your email address to receive a password reset token."}
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
              <div className="login-error" style={{ marginBottom: "1.25rem" }}>
                {error}
              </div>
            )}

            {!resetTokenSent ? (
              <form className="login-form" onSubmit={handleEmailSubmit}>
                <label>EMAIL ADDRESS *</label>
                <div className="input-wrap">
                  <FontAwesomeIcon icon={faEnvelope} />
                  <input
                    type="email"
                    placeholder="Enter your registered email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                <button
                  className="login-btn"
                  type="submit"
                  disabled={isSubmitting}
                  style={{ marginTop: "0.5rem" }}
                >
                  {isSubmitting ? "Sending..." : "Send Reset Token"}
                </button>
              </form>
            ) : (
              <form className="login-form" onSubmit={handleResetSubmit}>
                <label>RESET TOKEN *</label>
                <div className="input-wrap">
                  <FontAwesomeIcon icon={faKey} />
                  <input
                    type="text"
                    placeholder="Paste the token from your email"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                <label>NEW PASSWORD *</label>
                <div className="input-wrap">
                  <FontAwesomeIcon icon={faLock} />
                  <input
                    type={showNewPassword ? "text" : "password"}
                    placeholder="At least 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={isSubmitting}
                  />
                  <button
                    type="button"
                    className="show-password-btn"
                    onClick={() => setShowNewPassword((p) => !p)}
                    disabled={isSubmitting}
                  >
                    <FontAwesomeIcon icon={showNewPassword ? faEyeSlash : faEye} />
                  </button>
                </div>

                <label>CONFIRM NEW PASSWORD *</label>
                <div className="input-wrap">
                  <FontAwesomeIcon icon={faLock} />
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Re-enter your new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={isSubmitting}
                  />
                  <button
                    type="button"
                    className="show-password-btn"
                    onClick={() => setShowConfirmPassword((p) => !p)}
                    disabled={isSubmitting}
                  >
                    <FontAwesomeIcon icon={showConfirmPassword ? faEyeSlash : faEye} />
                  </button>
                </div>

                <button
                  className="login-btn"
                  type="submit"
                  disabled={isSubmitting}
                  style={{ marginTop: "0.5rem" }}
                >
                  {isSubmitting ? "Resetting..." : "Reset Password"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setResetTokenSent(false);
                    setError("");
                    setMessage("");
                    setToken("");
                    setNewPassword("");
                    setConfirmPassword("");
                  }}
                  style={{
                    marginTop: "0.65rem",
                    background: "none",
                    border: "none",
                    color: "var(--color-primary, #ff5f93)",
                    fontWeight: 900,
                    cursor: "pointer",
                    fontSize: "0.9rem",
                    width: "100%",
                    textAlign: "center",
                    padding: "0.5rem",
                  }}
                >
                  Use a different email
                </button>
              </form>
            )}

            <p className="login-register">
              Remembered your password?{" "}
              <Link to="/login">Sign in to your account</Link>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
};

export default ForgotPassword;
