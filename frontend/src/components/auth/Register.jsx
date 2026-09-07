import React, { useMemo, useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faArrowRight,
  faCalendarAlt,
  faCheck,
  faCheckCircle,
  faEye,
  faEyeSlash,
  faFileContract,
  faHeartPulse,
  faIdCard,
  faLock,
  faPaw,
  faShieldAlt,
  faSpinner,
  faStar,
  faTriangleExclamation,
  faUser,
  faUserPlus,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest, clearAuthStorage } from "../../api/client";
import DatePickerInput from "../../components/shared/DatePickerInput";
import { showSuccess, showError } from "../../utils/alert.jsx";
import { getDraft } from "../../utils/preBookingDraft";
import logo from "../../assets/pawesome.jpg";
import facilityImg from "../../assets/facility 2.jpg";
import { useLandingPageContent } from "../../hooks/useLandingPageContent";
import "./Register.css";

const INITIAL_FORM = {
  firstName: "",
  middleName: "",
  lastName: "",
  suffix: "",
  dateOfBirth: "",
  contactNumber: "",
  emailAddress: "",
  username: "",
  password: "",
  confirmPassword: "",
  emergencyContactPerson: "",
  emergencyContactNumber: "",
  termsAccepted: false,
};

const SUFFIX_OPTIONS = [
  { value: "", label: "None" },
  { value: "Jr.", label: "Jr." },
  { value: "Sr.", label: "Sr." },
  { value: "II", label: "II" },
  { value: "III", label: "III" },
  { value: "IV", label: "IV" },
  { value: "V", label: "V" },
  { value: "VI", label: "VI" },
  { value: "VII", label: "VII" },
  { value: "VIII", label: "VIII" },
  { value: "IX", label: "IX" },
  { value: "X", label: "X" },
];

const STEPS = [
  { id: 1, title: "Personal",  subtitle: "Basic information",  icon: faUser },
  { id: 2, title: "Account",   subtitle: "Login credentials",  icon: faLock },
  { id: 3, title: "Emergency", subtitle: "Backup contact",     icon: faHeartPulse },
];

const Register = () => {
  const navigate = useNavigate();
  const { getSection } = useLandingPageContent();
  const registerBgImage = getSection("auth_pages")?.register_bg_image || facilityImg;

  const [formData, setFormData] = useState(INITIAL_FORM);
  const [currentStep, setCurrentStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState("");

  const fullName = useMemo(() => {
    return [formData.firstName, formData.middleName, formData.lastName, formData.suffix]
      .map((v) => v.trim()).filter(Boolean).join(" ");
  }, [formData.firstName, formData.middleName, formData.lastName, formData.suffix]);

  const passwordStrength = useMemo(() => {
    const p = formData.password;
    if (!p) return { label: "No password entered", score: 0 };
    let score = 0;
    if (p.length >= 8)           score++;
    if (/[A-Z]/.test(p))         score++;
    if (/[a-z]/.test(p))         score++;
    if (/\d/.test(p))            score++;
    if (/[^A-Za-z0-9]/.test(p)) score++;
    if (score <= 2) return { label: "Weak",   score };
    if (score <= 4) return { label: "Good",   score };
    return              { label: "Strong", score };
  }, [formData.password]);

  const updateField = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: "" }));
    setFormError("");
  };

  const handleChange = (e) => updateField(e.target.name, e.target.value);

  const handlePhoneChange = (name, value) => {
    updateField(name, value.replace(/\D/g, "").slice(0, 11));
  };

  const getStepErrors = (step = currentStep) => {
    const errors = {};
    if (step === 1) {
      if (!formData.firstName.trim())    errors.firstName    = "First name is required.";
      if (!formData.lastName.trim())     errors.lastName     = "Last name is required.";
      if (!formData.emailAddress.trim()) errors.emailAddress = "Email address is required.";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.emailAddress))
                                         errors.emailAddress = "Enter a valid email address.";
      if (formData.contactNumber.trim() && !/^09\d{9}$/.test(formData.contactNumber.trim()))
        errors.contactNumber = "Use a valid 11-digit PH number starting with 09.";
    }
    if (step === 2) {
      if (!formData.username.trim())           errors.username = "Username is required.";
      else if (formData.username.trim().length < 4) errors.username = "Username must be at least 4 characters.";
      if (!formData.password)                   errors.password = "Password is required.";
      else if (formData.password.length < 8)    errors.password = "Password must be at least 8 characters.";
      else if (!/[A-Za-z]/.test(formData.password) || !/\d/.test(formData.password))
                                                errors.password = "Password must contain letters and numbers.";
      if (!formData.confirmPassword)              errors.confirmPassword = "Please confirm your password.";
      else if (formData.password !== formData.confirmPassword) errors.confirmPassword = "Passwords do not match.";
    }
    if (step === 3) {
      if (formData.emergencyContactNumber.trim() && !/^09\d{9}$/.test(formData.emergencyContactNumber.trim()))
        errors.emergencyContactNumber = "Use a valid 11-digit PH number starting with 09.";
      if (!formData.termsAccepted) errors.termsAccepted = "You must agree to the Terms of Service and Privacy Policy.";
    }
    return errors;
  };

  const validateStep = (step = currentStep) => {
    const errors = getStepErrors(step);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) { setFormError("Please check the highlighted fields before continuing."); return false; }
    setFormError(""); return true;
  };

  const validateAllSteps = () => {
    const errors = { ...getStepErrors(1), ...getStepErrors(2), ...getStepErrors(3) };
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setFormError("Please check the highlighted fields before creating your account.");
      if (errors.firstName || errors.lastName || errors.emailAddress || errors.contactNumber) setCurrentStep(1);
      else if (errors.username || errors.password || errors.confirmPassword) setCurrentStep(2);
      else setCurrentStep(3);
      return false;
    }
    setFormError(""); return true;
  };

  const handleNextStep = () => { if (!validateStep(currentStep)) return; setCurrentStep((p) => Math.min(p + 1, 3)); };
  const handlePrevStep = () => { setFormError(""); setFieldErrors({}); setCurrentStep((p) => Math.max(p - 1, 1)); };

  const getResponseUser  = (r) => r?.user || r?.data?.user || r?.data || {};
  const getResponseToken = (r) => r?.token || r?.access_token || r?.data?.token || r?.data?.access_token || "";

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateAllSteps()) return;
    setLoading(true); setFormError(""); setSuccessMessage("");
    try {
      const response = await apiRequest("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: fullName,
          first_name: formData.firstName.trim(),
          middle_name: formData.middleName.trim() || null,
          last_name: formData.lastName.trim(),
          suffix: formData.suffix.trim() || null,
          email: formData.emailAddress.trim(),
          username: formData.username.trim(),
          password: formData.password,
          password_confirmation: formData.confirmPassword,
          phone: formData.contactNumber.trim() || null,
          date_of_birth: formData.dateOfBirth || null,
          emergency_contact_person: formData.emergencyContactPerson.trim() || null,
          emergency_contact_number: formData.emergencyContactNumber.trim() || null,
          role: "customer",
        }),
      });

      const user  = getResponseUser(response);
      const token = getResponseToken(response);
      clearAuthStorage();
      if (token) localStorage.setItem("token", token);
      localStorage.setItem("role",        user.role         || "customer");
      localStorage.setItem("name",        user.name         || fullName);
      localStorage.setItem("username",    user.username     || formData.username.trim());
      localStorage.setItem("email",       user.email        || formData.emailAddress.trim());
      localStorage.setItem("middle_name", user.middle_name  || formData.middleName.trim());
      localStorage.setItem("suffix",      user.suffix       || formData.suffix.trim() || "");

      const draft = getDraft();
      let redirectPath = "/customer";
      if (draft?.service_type) {
        const draftPaths = { hotel: "/customer/hotel", grooming: "/customer/grooming", vet: "/customer/vet" };
        redirectPath = draftPaths[draft.service_type] || "/customer";
      }

      const msg = draft
        ? "Registration successful. You have a pending booking request. Redirecting you to complete it..."
        : "Registration successful. Redirecting to your customer dashboard...";
      setSuccessMessage(msg);
      showSuccess(msg);

      window.setTimeout(() => {
        if (!user.email_verified_at) navigate(`/verify-email?email=${encodeURIComponent(user.email || formData.emailAddress.trim())}`);
        else navigate(redirectPath);
      }, 900);
    } catch (err) {
      setFormError(err.message || "Registration failed. Please try again.");
      showError(err.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const renderFieldError = (field) =>
    fieldErrors[field] ? <span className="register-field-error">{fieldErrors[field]}</span> : null;

  return (
    <main className="register-page">
      {/* Animated background blobs */}
      <div className="reg-blob reg-blob-1" aria-hidden="true" />
      <div className="reg-blob reg-blob-2" aria-hidden="true" />
      <div className="reg-blob reg-blob-3" aria-hidden="true" />

      <section className="register-shell">

        {/* ── Brand panel ── */}
        <aside
          className="register-brand-panel"
          style={{ backgroundImage: `url(${registerBgImage})` }}
        >
          {/* Paw watermarks */}
          <div className="reg-paw-deco reg-paw-1" aria-hidden="true">🐾</div>
          <div className="reg-paw-deco reg-paw-2" aria-hidden="true">🐾</div>

          <div className="register-brand-top">
            <div className="brand-pill">
              <FontAwesomeIcon icon={faPaw} />
              Pawesome Retreat Inc.
            </div>
            <Link to="/" className="register-back-link">
              <FontAwesomeIcon icon={faArrowLeft} />
              <span>Back to Home</span>
            </Link>
          </div>

          {/* Logo */}
          <div className="register-brand-logo-wrap">
            <img src={logo} alt="Pawesome Retreat Inc." className="register-brand-logo" />
          </div>

          <div className="brand-copy">
            <h1>Create your pet care account</h1>
            <p>
              Book veterinary services, grooming, hotel reservations, and manage
              your pets from one secure customer portal.
            </p>
          </div>

          <div className="brand-feature-list">
            <div>
              <span><FontAwesomeIcon icon={faCalendarAlt} /></span>
              <div>
                <strong>Book services online</strong>
                <p>Request pet hotel, grooming, and veterinary services.</p>
              </div>
            </div>
            <div>
              <span><FontAwesomeIcon icon={faPaw} /></span>
              <div>
                <strong>Manage pet profiles</strong>
                <p>Keep pet details connected to your customer account.</p>
              </div>
            </div>
            <div>
              <span><FontAwesomeIcon icon={faShieldAlt} /></span>
              <div>
                <strong>Secure account access</strong>
                <p>Protect your account with login credentials.</p>
              </div>
            </div>
          </div>

          <div className="register-testimonial-card">
            <div className="register-testimonial-stars">
              {[1,2,3,4,5].map(i => <FontAwesomeIcon key={i} icon={faStar} />)}
            </div>
            <p>"Signing up was easy and my pet's care has been amazing since!"</p>
            <span>— Happy pet owner · Pawesome Retreat</span>
          </div>
        </aside>

        {/* ── Form card ── */}
        <section className="register-card">

          {/* Card gradient header strip */}
          <div className="register-card-header">
            <div className="reg-header-paw reg-header-paw-1" aria-hidden="true">🐾</div>
            <div className="reg-header-paw reg-header-paw-2" aria-hidden="true">🐾</div>
            <img src={logo} alt="Pawesome" className="register-card-logo" />
            <p className="register-card-brand">PAWESOME RETREAT</p>
            <p className="register-card-sub">Create Your Free Account</p>
          </div>

          {/* Card body */}
          <div className="register-card-body">

            {/* Progress steps */}
            <div className="register-progress">
              {STEPS.map((step) => (
                <div
                  key={step.id}
                  className={`register-step${currentStep >= step.id ? " active" : ""}${currentStep === step.id ? " current" : ""}`}
                >
                  <div className="step-circle">
                    {currentStep > step.id
                      ? <FontAwesomeIcon icon={faCheck} />
                      : <FontAwesomeIcon icon={step.icon} />}
                  </div>
                  <div>
                    <strong>{step.title}</strong>
                    <small>{step.subtitle}</small>
                  </div>
                </div>
              ))}
            </div>

            {/* Alerts */}
            {formError && (
              <div className="register-alert error">
                <FontAwesomeIcon icon={faTriangleExclamation} />
                <span>{formError}</span>
              </div>
            )}
            {successMessage && (
              <div className="register-alert success">
                <FontAwesomeIcon icon={faCheckCircle} />
                <span>{successMessage}</span>
              </div>
            )}

            {/* Form */}
            <form className="register-form" onSubmit={handleSubmit}>

              {/* Step 1 — Personal */}
              {currentStep === 1 && (
                <section className="register-form-section">
                  <div className="section-heading">
                    <span><FontAwesomeIcon icon={faIdCard} /></span>
                    <div>
                      <h3>Personal Information</h3>
                      <p>Tell us who owns and manages the pet records.</p>
                    </div>
                  </div>

                  <div className="register-form-grid">
                    <div className="register-form-group">
                      <label htmlFor="firstName">First Name *</label>
                      <input id="firstName" name="firstName" type="text"
                        value={formData.firstName} onChange={handleChange}
                        className={fieldErrors.firstName ? "has-error" : ""}
                        placeholder="Enter first name" autoComplete="given-name" />
                      {renderFieldError("firstName")}
                    </div>

                    <div className="register-form-group">
                      <label htmlFor="middleName">Middle Name</label>
                      <input id="middleName" name="middleName" type="text"
                        value={formData.middleName} onChange={handleChange}
                        placeholder="Enter middle name" autoComplete="additional-name" />
                    </div>

                    <div className="register-form-group">
                      <label htmlFor="lastName">Last Name *</label>
                      <input id="lastName" name="lastName" type="text"
                        value={formData.lastName} onChange={handleChange}
                        className={fieldErrors.lastName ? "has-error" : ""}
                        placeholder="Enter last name" autoComplete="family-name" />
                      {renderFieldError("lastName")}
                    </div>

                    <div className="register-form-group">
                      <label htmlFor="suffix">Suffix</label>
                      <select id="suffix" name="suffix" value={formData.suffix}
                        onChange={handleChange} autoComplete="honorific-suffix">
                        {SUFFIX_OPTIONS.map((s) => (
                          <option key={s.label} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="register-form-group">
                      <label htmlFor="dateOfBirth">Date of Birth</label>
                      <DatePickerInput
                        id="dateOfBirth"
                        selected={formData.dateOfBirth ? new Date(formData.dateOfBirth) : null}
                        onChange={(date) => handleChange({ target: { name: "dateOfBirth", value: date ? date.toISOString().split("T")[0] : "" } })}
                        placeholderText="Select birthdate..."
                        maxDate={new Date()}
                      />
                    </div>

                    <div className="register-form-group">
                      <label htmlFor="contactNumber">Contact Number</label>
                      <input id="contactNumber" name="contactNumber" type="tel"
                        value={formData.contactNumber}
                        onChange={(e) => handlePhoneChange("contactNumber", e.target.value)}
                        className={fieldErrors.contactNumber ? "has-error" : ""}
                        placeholder="09171234567" autoComplete="tel" />
                      {renderFieldError("contactNumber")}
                    </div>

                    <div className="register-form-group full">
                      <label htmlFor="emailAddress">Email Address *</label>
                      <input id="emailAddress" name="emailAddress" type="email"
                        value={formData.emailAddress} onChange={handleChange}
                        className={fieldErrors.emailAddress ? "has-error" : ""}
                        placeholder="example@email.com" autoComplete="email" />
                      {renderFieldError("emailAddress")}
                    </div>
                  </div>
                </section>
              )}

              {/* Step 2 — Account */}
              {currentStep === 2 && (
                <section className="register-form-section">
                  <div className="section-heading">
                    <span><FontAwesomeIcon icon={faLock} /></span>
                    <div>
                      <h3>Account Setup</h3>
                      <p>Create the username and password for your customer portal.</p>
                    </div>
                  </div>

                  <div className="register-form-grid single">
                    <div className="register-form-group">
                      <label htmlFor="username">Username *</label>
                      <input id="username" name="username" type="text"
                        value={formData.username} onChange={handleChange}
                        className={fieldErrors.username ? "has-error" : ""}
                        placeholder="Choose a username" autoComplete="username" />
                      {renderFieldError("username")}
                    </div>

                    <div className="register-form-group">
                      <label htmlFor="password">Password *</label>
                      <div className="password-input-group">
                        <input id="password" type={showPassword ? "text" : "password"}
                          name="password" value={formData.password} onChange={handleChange}
                          className={fieldErrors.password ? "has-error" : ""}
                          placeholder="At least 8 characters" autoComplete="new-password" />
                        <button type="button" className="password-toggle"
                          onClick={() => setShowPassword((p) => !p)}
                          aria-label={showPassword ? "Hide password" : "Show password"}>
                          <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} />
                        </button>
                      </div>
                      {renderFieldError("password")}
                      <div className={`password-strength strength-${passwordStrength.score}`}>
                        <div><span /><span /><span /><span /><span /></div>
                        <small>{passwordStrength.label}</small>
                      </div>
                    </div>

                    <div className="register-form-group">
                      <label htmlFor="confirmPassword">Confirm Password *</label>
                      <div className="password-input-group">
                        <input id="confirmPassword" type={showConfirmPassword ? "text" : "password"}
                          name="confirmPassword" value={formData.confirmPassword} onChange={handleChange}
                          className={fieldErrors.confirmPassword ? "has-error" : ""}
                          placeholder="Re-enter password" autoComplete="new-password" />
                        <button type="button" className="password-toggle"
                          onClick={() => setShowConfirmPassword((p) => !p)}
                          aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}>
                          <FontAwesomeIcon icon={showConfirmPassword ? faEyeSlash : faEye} />
                        </button>
                      </div>
                      {renderFieldError("confirmPassword")}
                    </div>
                  </div>

                  <div className="security-note">
                    <FontAwesomeIcon icon={faShieldAlt} />
                    <span>Use a password with at least 8 characters, letters, and numbers.</span>
                  </div>
                </section>
              )}

              {/* Step 3 — Emergency */}
              {currentStep === 3 && (
                <section className="register-form-section">
                  <div className="section-heading">
                    <span><FontAwesomeIcon icon={faHeartPulse} /></span>
                    <div>
                      <h3>Emergency Contact</h3>
                      <p>Optional contact details for urgent pet-related concerns.</p>
                    </div>
                  </div>

                  <div className="register-form-grid">
                    <div className="register-form-group">
                      <label htmlFor="emergencyContactPerson">Contact Person</label>
                      <input id="emergencyContactPerson" name="emergencyContactPerson" type="text"
                        value={formData.emergencyContactPerson} onChange={handleChange}
                        placeholder="Full name" />
                    </div>

                    <div className="register-form-group">
                      <label htmlFor="emergencyContactNumber">Contact Number</label>
                      <input id="emergencyContactNumber" name="emergencyContactNumber" type="tel"
                        value={formData.emergencyContactNumber}
                        onChange={(e) => handlePhoneChange("emergencyContactNumber", e.target.value)}
                        className={fieldErrors.emergencyContactNumber ? "has-error" : ""}
                        placeholder="09171234567" />
                      {renderFieldError("emergencyContactNumber")}
                    </div>
                  </div>

                  {/* Terms */}
                  <div className="register-terms-row">
                    <label className={`register-terms-label${fieldErrors.termsAccepted ? " has-error" : ""}`}>
                      <input type="checkbox" checked={formData.termsAccepted}
                        onChange={(e) => updateField("termsAccepted", e.target.checked)}
                        disabled={loading} />
                      <span>
                        <FontAwesomeIcon icon={faFileContract} />
                        I agree to Pawesome Retreat's{" "}
                        <a href="#" onClick={(e) => e.preventDefault()}>Terms of Service</a>
                        {" "}and{" "}
                        <a href="#" onClick={(e) => e.preventDefault()}>Privacy Policy</a>.
                        <span className="terms-required"> *</span>
                      </span>
                    </label>
                    {renderFieldError("termsAccepted")}
                  </div>

                  {/* Summary */}
                  <div className="review-card">
                    <h4>Registration Summary</h4>
                    <div className="review-grid">
                      <div><small>Name</small><strong>{fullName || "Not provided"}</strong></div>
                      <div><small>Email</small><strong>{formData.emailAddress || "Not provided"}</strong></div>
                      <div><small>Username</small><strong>{formData.username || "Not provided"}</strong></div>
                      <div><small>Role</small><strong>Customer</strong></div>
                    </div>
                  </div>
                </section>
              )}

              {/* Navigation */}
              <div className="register-form-actions">
                <div className="action-left">
                  {currentStep > 1 && (
                    <button type="button" className="register-secondary-btn"
                      onClick={handlePrevStep} disabled={loading}>
                      <FontAwesomeIcon icon={faArrowLeft} /> Back
                    </button>
                  )}
                </div>
                <div className="action-right">
                  {currentStep < 3 && (
                    <button type="button" className="register-primary-btn"
                      onClick={handleNextStep} disabled={loading}>
                      Next <FontAwesomeIcon icon={faArrowRight} />
                    </button>
                  )}
                  {currentStep === 3 && (
                    <button type="submit" className="register-primary-btn" disabled={loading}>
                      <FontAwesomeIcon icon={loading ? faSpinner : faUserPlus} spin={loading} />
                      {loading ? "Creating Account…" : "Create Account"}
                    </button>
                  )}
                </div>
              </div>

              <div className="register-login-link">
                Already have an account? <Link to="/login">Sign in</Link>
              </div>
            </form>
          </div>
        </section>

      </section>
    </main>
  );
};

export default Register;
