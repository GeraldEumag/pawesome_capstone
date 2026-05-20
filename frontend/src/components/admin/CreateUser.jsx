import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser, faBell, faLock } from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import "./CreateUser.css";
import { showError } from "../../utils/alert";

const CreateUser = () => {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    dateOfBirth: "",
    contactNumber: "",
    emailAddress: "",
    residentialAddress: "",
    city: "",
    state: "",
    zipCode: "",
    country: "Philippines",
    username: "",
    password: "",
    confirmPassword: "",
    role: "",
    emergencyContactPerson: "",
    emergencyContactNumber: "",
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.firstName.trim()) newErrors.firstName = "First name is required";
    if (!formData.lastName.trim()) newErrors.lastName = "Last name is required";
    if (!formData.dateOfBirth) newErrors.dateOfBirth = "Date of birth is required";

    if (!formData.contactNumber.trim()) {
      newErrors.contactNumber = "Contact number is required";
    } else if (!/^\d{10,15}$/.test(formData.contactNumber.replace(/\s/g, ""))) {
      newErrors.contactNumber = "Please enter a valid contact number";
    }

    if (!formData.emailAddress.trim()) {
      newErrors.emailAddress = "Email address is required";
    } else if (!/\S+@\S+\.\S+/.test(formData.emailAddress)) {
      newErrors.emailAddress = "Please enter a valid email address";
    }

    if (!formData.residentialAddress.trim()) {
      newErrors.residentialAddress = "Residential address is required";
    }

    if (!formData.city.trim()) newErrors.city = "City is required";
    if (!formData.state.trim()) newErrors.state = "State/Province is required";
    if (!formData.zipCode.trim()) newErrors.zipCode = "ZIP code is required";

    if (!formData.emergencyContactPerson.trim()) {
      newErrors.emergencyContactPerson = "Emergency contact person is required";
    }

    if (!formData.emergencyContactNumber.trim()) {
      newErrors.emergencyContactNumber = "Emergency contact number is required";
    } else if (!/^\d{10,15}$/.test(formData.emergencyContactNumber.replace(/\s/g, ""))) {
      newErrors.emergencyContactNumber = "Please enter a valid emergency contact number";
    }

    if (!formData.username.trim()) {
      newErrors.username = "Username is required";
    } else if (formData.username.length < 3) {
      newErrors.username = "Username must be at least 3 characters";
    }

    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = "Please confirm your password";
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    if (!formData.role) newErrors.role = "Role is required";

    return newErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const newErrors = validateForm();

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSubmitting(true);
    setSuccessMessage("");

    try {
      const userData = {
        name: `${formData.firstName} ${formData.lastName}`,
        first_name: formData.firstName,
        middle_name: formData.middleName,
        last_name: formData.lastName,
        email: formData.emailAddress,
        username: formData.username,
        password: formData.password,
        phone: formData.contactNumber,
        address: formData.residentialAddress,
        city: formData.city,
        state: formData.state,
        zip_code: formData.zipCode,
        country: formData.country,
        date_of_birth: formData.dateOfBirth,
        emergency_contact_person: formData.emergencyContactPerson,
        emergency_contact_number: formData.emergencyContactNumber,
        role: formData.role,
        is_active: true,
      };

      await apiRequest("/admin/users", {
        method: "POST",
        body: JSON.stringify(userData),
      });

      setSuccessMessage(
        `User ${formData.firstName} ${formData.lastName} created successfully.` 
      );

      setTimeout(() => navigate("/admin/users"), 1200);
    } catch (error) {
      showError(`Error creating user: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="create-user-container">
      <div className="create-user-background">
        <div className="create-user-content">
          <div className="create-user-header">
            <div className="logo">
              <h1>PAWESOME</h1>
              <span>RETREAT INC.</span>
            </div>

            <h2>Create New User</h2>
            <p>Add a new user to the system with the proper role and access level.</p>
          </div>

          {successMessage && (
            <div className="success-message">{successMessage}</div>
          )}

          <form className="create-user-form" onSubmit={handleSubmit}>
            <div className="form-section">
              <div className="section-header">
                <FontAwesomeIcon icon={faUser} className="section-icon" />
                <div>
                  <h3>User Information</h3>
                  <p>Basic personal and contact information</p>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="firstName">First Name *</label>
                  <input
                    type="text"
                    id="firstName"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleChange}
                    className={errors.firstName ? "error" : ""}
                    placeholder="Enter first name"
                  />
                  {errors.firstName && (
                    <span className="error-message">{errors.firstName}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="middleName">Middle Name</label>
                  <input
                    type="text"
                    id="middleName"
                    name="middleName"
                    value={formData.middleName}
                    onChange={handleChange}
                    placeholder="Optional"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="lastName">Last Name *</label>
                  <input
                    type="text"
                    id="lastName"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleChange}
                    className={errors.lastName ? "error" : ""}
                    placeholder="Enter last name"
                  />
                  {errors.lastName && (
                    <span className="error-message">{errors.lastName}</span>
                  )}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="dateOfBirth">Date of Birth *</label>
                  <input
                    type="date"
                    id="dateOfBirth"
                    name="dateOfBirth"
                    value={formData.dateOfBirth}
                    onChange={handleChange}
                    className={errors.dateOfBirth ? "error" : ""}
                    max={new Date().toISOString().split("T")[0]}
                  />
                  {errors.dateOfBirth && (
                    <span className="error-message">{errors.dateOfBirth}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="contactNumber">Contact Number *</label>
                  <input
                    type="tel"
                    id="contactNumber"
                    name="contactNumber"
                    value={formData.contactNumber}
                    onChange={handleChange}
                    className={errors.contactNumber ? "error" : ""}
                    placeholder="Enter contact number"
                  />
                  {errors.contactNumber && (
                    <span className="error-message">{errors.contactNumber}</span>
                  )}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="emailAddress">Email Address *</label>
                  <input
                    type="email"
                    id="emailAddress"
                    name="emailAddress"
                    value={formData.emailAddress}
                    onChange={handleChange}
                    className={errors.emailAddress ? "error" : ""}
                    placeholder="Enter email address"
                  />
                  {errors.emailAddress && (
                    <span className="error-message">{errors.emailAddress}</span>
                  )}
                </div>

                <div className="form-group full-width">
                  <label htmlFor="residentialAddress">Residential Address *</label>
                  <textarea
                    id="residentialAddress"
                    name="residentialAddress"
                    value={formData.residentialAddress}
                    onChange={handleChange}
                    className={errors.residentialAddress ? "error" : ""}
                    placeholder="Enter complete residential address"
                    rows="3"
                  />
                  {errors.residentialAddress && (
                    <span className="error-message">
                      {errors.residentialAddress}
                    </span>
                  )}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="city">City *</label>
                  <input
                    type="text"
                    id="city"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    className={errors.city ? "error" : ""}
                    placeholder="Enter city"
                  />
                  {errors.city && (
                    <span className="error-message">{errors.city}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="state">State/Province *</label>
                  <input
                    type="text"
                    id="state"
                    name="state"
                    value={formData.state}
                    onChange={handleChange}
                    className={errors.state ? "error" : ""}
                    placeholder="Enter province"
                  />
                  {errors.state && (
                    <span className="error-message">{errors.state}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="zipCode">ZIP Code *</label>
                  <input
                    type="text"
                    id="zipCode"
                    name="zipCode"
                    value={formData.zipCode}
                    onChange={handleChange}
                    className={errors.zipCode ? "error" : ""}
                    placeholder="Enter ZIP code"
                  />
                  {errors.zipCode && (
                    <span className="error-message">{errors.zipCode}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="country">Country</label>
                  <input
                    type="text"
                    id="country"
                    name="country"
                    value={formData.country}
                    disabled
                    className="disabled-field"
                  />
                </div>
              </div>
            </div>

            <div className="form-section">
              <div className="section-header">
                <FontAwesomeIcon icon={faBell} className="section-icon" />
                <div>
                  <h3>Emergency Contact</h3>
                  <p>Person to contact in case of emergency</p>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="emergencyContactPerson">
                    Emergency Contact Person *
                  </label>
                  <input
                    type="text"
                    id="emergencyContactPerson"
                    name="emergencyContactPerson"
                    value={formData.emergencyContactPerson}
                    onChange={handleChange}
                    className={errors.emergencyContactPerson ? "error" : ""}
                    placeholder="Enter emergency contact name"
                  />
                  {errors.emergencyContactPerson && (
                    <span className="error-message">
                      {errors.emergencyContactPerson}
                    </span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="emergencyContactNumber">
                    Emergency Contact Number *
                  </label>
                  <input
                    type="tel"
                    id="emergencyContactNumber"
                    name="emergencyContactNumber"
                    value={formData.emergencyContactNumber}
                    onChange={handleChange}
                    className={errors.emergencyContactNumber ? "error" : ""}
                    placeholder="Enter emergency contact number"
                  />
                  {errors.emergencyContactNumber && (
                    <span className="error-message">
                      {errors.emergencyContactNumber}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="form-section">
              <div className="section-header">
                <FontAwesomeIcon icon={faLock} className="section-icon" />
                <div>
                  <h3>Account & Role</h3>
                  <p>Login credentials and system access level</p>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="username">Username *</label>
                  <input
                    type="text"
                    id="username"
                    name="username"
                    value={formData.username}
                    onChange={handleChange}
                    className={errors.username ? "error" : ""}
                    placeholder="Choose a username"
                  />
                  {errors.username && (
                    <span className="error-message">{errors.username}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="role">Role *</label>
                  <select
                    id="role"
                    name="role"
                    value={formData.role}
                    onChange={handleChange}
                    className={errors.role ? "error" : ""}
                  >
                    <option value="">Select Role</option>
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="receptionist">Receptionist</option>
                    <option value="veterinary">Veterinary</option>
                    <option value="cashier">Cashier</option>
                    <option value="inventory">Inventory</option>
                    <option value="payroll">Payroll</option>
                    <option value="customer">Customer</option>
                  </select>
                  {errors.role && (
                    <span className="error-message">{errors.role}</span>
                  )}
                </div>

                <div className="form-group password-group">
                  <label htmlFor="password">Password *</label>
                  <div className="password-input-group">
                    <input
                      type={showPassword ? "text" : "password"}
                      id="password"
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      className={errors.password ? "error" : ""}
                      placeholder="Create password"
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPassword((prev) => !prev)}
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                  {errors.password && (
                    <span className="error-message">{errors.password}</span>
                  )}
                </div>

                <div className="form-group password-group">
                  <label htmlFor="confirmPassword">Confirm Password *</label>
                  <div className="password-input-group">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      id="confirmPassword"
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      className={errors.confirmPassword ? "error" : ""}
                      placeholder="Confirm password"
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                    >
                      {showConfirmPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                  {errors.confirmPassword && (
                    <span className="error-message">
                      {errors.confirmPassword}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="cancel-btn"
                onClick={() => navigate("/admin/users")}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="create-user-btn"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Creating User..." : "Create User"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateUser;
