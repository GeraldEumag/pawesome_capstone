import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiRequest } from "../../api/client";
import { showSuccess, showError } from "../../utils/alert.jsx";
import "./Register.css";

const VerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");
  const email = searchParams.get("email");

  const [status, setStatus] = useState(token && email ? "verifying" : "prompt");
  const [message, setMessage] = useState(
    token && email
      ? "Verifying your email..."
      : "Please verify your email to continue booking. Check your inbox for the link or enter your email to resend it."
  );
  const [emailInput, setEmailInput] = useState(email || "");
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (token && email) {
      apiRequest("/auth/email/verify", {
        method: "POST",
        body: JSON.stringify({ email, token }),
      })
        .then((res) => {
          setStatus("success");
          setMessage(res.message || "Your email has been verified.");
          showSuccess(res.message || "Email verified successfully!");
          setTimeout(() => navigate("/login"), 2500);
        })
        .catch((err) => {
          setStatus("error");
          setMessage(err.message || "Verification failed. The link may be expired or invalid.");
          showError(err.message || "Verification failed.");
        });
    }
  }, [token, email, navigate]);

  const handleResend = async (e) => {
    e.preventDefault();
    if (!emailInput.trim()) {
      showError("Please enter your email address.");
      return;
    }

    setResending(true);
    try {
      const res = await apiRequest("/auth/email/resend", {
        method: "POST",
        body: JSON.stringify({ email: emailInput.trim() }),
      });
      setStatus("resent");
      setMessage(res.message || "A new verification link has been sent.");
      showSuccess(res.message || "Verification email sent.");
    } catch (err) {
      showError(err.message || "Failed to resend verification email.");
    } finally {
      setResending(false);
    }
  };

  const statusClass =
    status === "success" || status === "resent"
      ? "success"
      : status === "error"
      ? "error"
      : "info";

  return (
    <main className="register-page">
      <section className="register-shell">
        <div className="register-form-panel" style={{ maxWidth: 520, margin: "auto" }}>
          <h1 className="register-form-title">Email Verification</h1>
          <p className={`verify-message verify-message--${statusClass}`}>{message}</p>

          {status !== "success" && (
            <form className="register-form" onSubmit={handleResend}>
              <label htmlFor="verifyEmail">Email address</label>
              <input
                id="verifyEmail"
                type="email"
                className="register-input"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="your-email@example.com"
                disabled={resending || status === "verifying"}
                required
              />

              <button
                type="submit"
                className="register-submit-btn"
                disabled={resending || status === "verifying"}
              >
                {resending ? "Sending..." : "Resend verification email"}
              </button>
            </form>
          )}

          {status === "success" && (
            <button
              type="button"
              className="register-submit-btn"
              onClick={() => navigate("/login")}
            >
              Continue to login
            </button>
          )}
        </div>
      </section>
    </main>
  );
};

export default VerifyEmail;
