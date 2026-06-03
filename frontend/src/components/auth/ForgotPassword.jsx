import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiRequest } from "../../api/client";
import { showWarning, showSuccess, showError } from "../../utils/alert";
import "./Login.css";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
      const response = await apiRequest("/auth/password/forgot", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });

      setResetTokenSent(true);
      setToken(response.reset_token || "");
      setMessage("Password reset token created. Use the token below to create a new password.");
      showSuccess("Password reset token created. Use the token below to create a new password.");
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
    <div className="login-container">
      <div className="login-background">
        <div className="login-content">
          <div className="login-header">
            <div className="logo">
              <h1>PAWESOME</h1>
              <span>RETREAT INC.</span>
            </div>

            <h2>Reset Your Password</h2>
            <p>
              Enter your email address and we’ll help you create a new password.
            </p>
          </div>

          {message && <div className="success-message">{message}</div>}
          {error && <div className="error-message">{error}</div>}

          {!resetTokenSent ? (
            <form className="login-form" onSubmit={handleEmailSubmit}>
              <div className="form-section">
                <div className="form-group">
                  <label htmlFor="email">Email Address *</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email address"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="form-actions">
                <button type="submit" className="login-btn" disabled={isSubmitting}>
                  {isSubmitting ? "Sending..." : "Send Reset Token"}
                </button>
              </div>
            </form>
          ) : (
            <form className="login-form" onSubmit={handleResetSubmit}>
              <div className="form-section">
                <div className="form-group">
                  <label htmlFor="resetToken">Reset Token *</label>
                  <input
                    type="text"
                    id="resetToken"
                    name="resetToken"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Enter the reset token"
                    disabled={isSubmitting}
                  />
                  <small>
                    Use the token returned by the system. If you did not receive one,
                    request again.
                  </small>
                </div>

                <div className="form-group">
                  <label htmlFor="newPassword">New Password *</label>
                  <input
                    type="password"
                    id="newPassword"
                    name="newPassword"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Create a new password"
                    disabled={isSubmitting}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="confirmPassword">Confirm Password *</label>
                  <input
                    type="password"
                    id="confirmPassword"
                    name="confirmPassword"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your new password"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="form-actions">
                <button type="submit" className="login-btn" disabled={isSubmitting}>
                  {isSubmitting ? "Resetting..." : "Reset Password"}
                </button>
              </div>
            </form>
          )}

          <div className="register-link">
            <span>Remembered your password?</span>
            <Link to="/login" className="link">
              Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;