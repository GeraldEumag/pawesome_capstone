import React, { useEffect, useMemo, useState } from "react";
import { showAlert, showSuccess, showError } from "../../utils/alert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUsers,
  faSearch,
  faFilter,
  faPlus,
  faEye,
  faPhone,
  faEnvelope,
  faMapMarkerAlt,
  faPaw,
  faCalendarAlt,
  faCheckCircle,
  faTimesCircle,
} from "@fortawesome/free-solid-svg-icons";
import { receptionistCustomerApi } from "../../api/receptionistCustomers";
import { formatCurrency } from "../../utils/currency";
import "./ReceptionistCustomerManagement.css";

const ReceptionistCustomerManagement = () => {
  const [customers, setCustomers] = useState([]);
  const [customerBookings, setCustomerBookings] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showBookingModal, setShowBookingModal] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [modalLoading, setModalLoading] = useState(false);
  const [error, setError] = useState("");

  const [bookingForm, setBookingForm] = useState({
    pet_id: "",
    booking_type: "hotel",
    service: "Pet Hotel Stay",
    appointment_date: "",
    appointment_time: "10:00",
    room_type: "Standard Room",
    notes: "",
  });

  const loadCustomers = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await receptionistCustomerApi.getCustomers();
      const data = response.customers?.data || response.customers || response || [];
      setCustomers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load customers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      const name = customer.name || customer.full_name || "";
      const email = customer.email || "";
      const phone = customer.phone || "";

      const matchesSearch =
        name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        phone.includes(searchTerm);

      const status = customer.status || "active";
      const matchesStatus = filterStatus === "all" || status === filterStatus;

      return matchesSearch && matchesStatus;
    });
  }, [customers, searchTerm, filterStatus]);

  const openCustomerDetails = async (customer) => {
    setSelectedCustomer(customer);
    setCustomerBookings([]);
    setModalLoading(true);

    try {
      const response = await receptionistCustomerApi.getCustomerBookings(customer.id);
      const data = response.bookings?.data || response.bookings || response || [];
      setCustomerBookings(Array.isArray(data) ? data : []);
    } catch {
      setCustomerBookings([]);
    } finally {
      setModalLoading(false);
    }
  };

  const openBookingModal = (customer) => {
    setSelectedCustomer(customer);
    setBookingForm({
      pet_id: customer.pets?.[0]?.id || "",
      booking_type: "hotel",
      service: "Pet Hotel Stay",
      appointment_date: "",
      appointment_time: "10:00",
      room_type: "Standard Room",
      notes: "",
    });
    setShowBookingModal(true);
  };

  const handleCreateBooking = async (e) => {
    e.preventDefault();

    if (!selectedCustomer || !bookingForm.pet_id || !bookingForm.appointment_date) {
      showAlert("Please select pet and appointment date.");
      return;
    }

    try {
      await receptionistCustomerApi.createBooking({
        customer_id: selectedCustomer.id,
        pet_id: bookingForm.pet_id,
        booking_type: bookingForm.booking_type,
        service: bookingForm.service,
        appointment_date: bookingForm.appointment_date,
        appointment_time: bookingForm.appointment_time,
        room_type: bookingForm.room_type,
        notes: bookingForm.notes,
        status: "pending",
      });

      showSuccess("Booking created successfully.");
      setShowBookingModal(false);
      await loadCustomers();
    } catch (err) {
      showError(err.message || "Failed to create booking.");
    }
  };

  const getCustomerName = (customer) => customer.name || customer.full_name || "Unknown Customer";
  const getPets = (customer) => customer.pets || [];
  const getStatus = (customer) => customer.status || "active";

  const getStatusColor = (status) => {
    if (status === "active") return "success";
    if (status === "suspended") return "danger";
    return "secondary";
  };

  const getStatusIcon = (status) => {
    return status === "active" ? faCheckCircle : faTimesCircle;
  };

  return (
    <div className="customer-management">
      <div className="customers-header">
        <div className="header-left">
          <h1>Customer Management</h1>
          <p>View customer records, pets, and create receptionist bookings.</p>
        </div>

        <div className="header-actions">
          <button className="secondary-btn" onClick={loadCustomers}>
            Refresh
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="summary-cards">
        <div className="summary-card">
          <div className="card-icon">
            <FontAwesomeIcon icon={faUsers} />
          </div>
          <div className="card-content">
            <h3>{customers.length}</h3>
            <p>Total Customers</p>
          </div>
        </div>

        <div className="summary-card">
          <div className="card-icon">
            <FontAwesomeIcon icon={faCheckCircle} />
          </div>
          <div className="card-content">
            <h3>{customers.filter((c) => getStatus(c) === "active").length}</h3>
            <p>Active Customers</p>
          </div>
        </div>

        <div className="summary-card">
          <div className="card-icon">
            <FontAwesomeIcon icon={faPaw} />
          </div>
          <div className="card-content">
            <h3>{customers.reduce((sum, c) => sum + getPets(c).length, 0)}</h3>
            <p>Total Pets</p>
          </div>
        </div>

        <div className="summary-card">
          <div className="card-icon">
            <FontAwesomeIcon icon={faCalendarAlt} />
          </div>
          <div className="card-content">
            <h3>
              {customers.reduce(
                (sum, c) => sum + Number(c.totalBookings || c.total_bookings || 0),
                0
              )}
            </h3>
            <p>Total Bookings</p>
          </div>
        </div>
      </div>

      <div className="customers-controls">
        <div className="search-filter-group">
          <div className="search-box">
            <FontAwesomeIcon icon={faSearch} />
            <input
              type="text"
              placeholder="Search by name, email, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="filter-dropdown">
            <FontAwesomeIcon icon={faFilter} />
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
        </div>
      </div>

      <div className="customers-table-container">
        <table className="customers-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Contact</th>
              <th>Address</th>
              <th>Pets</th>
              <th>Status</th>
              <th>Total Bookings</th>
              <th>Total Spent</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan="8" style={{ textAlign: "center", padding: "24px" }}>
                  Loading customers...
                </td>
              </tr>
            ) : filteredCustomers.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: "center", padding: "24px" }}>
                  No customers found.
                </td>
              </tr>
            ) : (
              filteredCustomers.map((customer) => {
                const pets = getPets(customer);
                const status = getStatus(customer);

                return (
                  <tr key={customer.id}>
                    <td className="customer-name">
                      <div className="name-info">
                        <span className="name">{getCustomerName(customer)}</span>
                        <span className="join-date">
                          Since {customer.created_at || customer.joinDate || "N/A"}
                        </span>
                      </div>
                    </td>

                    <td className="contact">
                      <div className="contact-info">
                        <div className="email">
                          <FontAwesomeIcon icon={faEnvelope} />
                          {customer.email || "No email"}
                        </div>
                        <div className="phone">
                          <FontAwesomeIcon icon={faPhone} />
                          {customer.phone || "No phone"}
                        </div>
                      </div>
                    </td>

                    <td className="address">
                      <div className="address-info">
                        <FontAwesomeIcon icon={faMapMarkerAlt} />
                        {customer.address || "No address"}
                      </div>
                    </td>

                    <td className="pets">
                      <div className="pets-info">
                        <span className="pet-count">{pets.length} pets</span>
                        <div className="pet-list">
                          {pets.slice(0, 3).map((pet) => (
                            <span key={pet.id || pet.name} className="pet-tag">
                              <FontAwesomeIcon icon={faPaw} />
                              {pet.name} ({pet.type || pet.species || "Pet"})
                            </span>
                          ))}
                        </div>
                      </div>
                    </td>

                    <td>
                      <span className={`status-badge ${getStatusColor(status)}`}>
                        <FontAwesomeIcon icon={getStatusIcon(status)} />
                        {status}
                      </span>
                    </td>

                    <td>{customer.totalBookings || customer.total_bookings || 0}</td>

                    <td>
                      <span className="amount">
                        {formatCurrency(Number(customer.totalSpent || customer.total_spent || 0))}
                      </span>
                    </td>

                    <td className="actions">
                      <button
                        className="action-btn view-btn"
                        onClick={() => openCustomerDetails(customer)}
                        title="View Details"
                      >
                        <FontAwesomeIcon icon={faEye} />
                      </button>

                      <button
                        className="action-btn edit-btn"
                        onClick={() => openBookingModal(customer)}
                        title="Create Booking"
                      >
                        <FontAwesomeIcon icon={faPlus} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selectedCustomer && !showBookingModal && (
        <div className="customer-modal-overlay" onClick={() => setSelectedCustomer(null)}>
          <div className="customer-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Customer Details</h2>
              <button className="close-btn" onClick={() => setSelectedCustomer(null)}>
                ×
              </button>
            </div>

            <div className="modal-content">
              <div className="overview-section">
                <h3>{getCustomerName(selectedCustomer)}</h3>
                <p>{selectedCustomer.email}</p>
                <p>{selectedCustomer.phone}</p>
              </div>

              <div className="overview-section">
                <h3>Pets</h3>
                <div className="pets-detail">
                  {getPets(selectedCustomer).map((pet) => (
                    <div key={pet.id || pet.name} className="pet-item">
                      <div className="pet-avatar">
                        <FontAwesomeIcon icon={faPaw} />
                      </div>
                      <div className="pet-details">
                        <h4>{pet.name}</h4>
                        <p>{pet.type || pet.species} - {pet.breed || "N/A"}</p>
                        <span>Age: {pet.age || "N/A"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="overview-section">
                <h3>Booking History</h3>
                {modalLoading ? (
                  <p>Loading bookings...</p>
                ) : customerBookings.length === 0 ? (
                  <p>No booking history found.</p>
                ) : (
                  <div className="booking-stats">
                    {customerBookings.map((booking) => (
                      <div key={booking.id} className="stat-item">
                        <label>{booking.service || booking.booking_type || "Booking"}</label>
                        <span>{booking.status || "pending"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <button className="secondary-btn" onClick={() => setSelectedCustomer(null)}>
                  Close
                </button>
                <button className="primary-btn" onClick={() => openBookingModal(selectedCustomer)}>
                  <FontAwesomeIcon icon={faPlus} />
                  Create Booking
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showBookingModal && selectedCustomer && (
        <div className="customer-modal-overlay" onClick={() => setShowBookingModal(false)}>
          <div className="customer-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create Booking for {getCustomerName(selectedCustomer)}</h2>
              <button className="close-btn" onClick={() => setShowBookingModal(false)}>
                ×
              </button>
            </div>

            <form className="modal-content" onSubmit={handleCreateBooking}>
              <div className="info-grid">
                <div className="info-item">
                  <label>Pet</label>
                  <select
                    value={bookingForm.pet_id}
                    onChange={(e) =>
                      setBookingForm((prev) => ({ ...prev, pet_id: e.target.value }))
                    }
                    required
                  >
                    <option value="">Select pet</option>
                    {getPets(selectedCustomer).map((pet) => (
                      <option key={pet.id} value={pet.id}>
                        {pet.name} ({pet.type || pet.species || "Pet"})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="info-item">
                  <label>Booking Type</label>
                  <select
                    value={bookingForm.booking_type}
                    onChange={(e) =>
                      setBookingForm((prev) => ({
                        ...prev,
                        booking_type: e.target.value,
                        service:
                          e.target.value === "hotel"
                            ? "Pet Hotel Stay"
                            : e.target.value === "vet"
                            ? "Regular Checkup"
                            : "Full Grooming",
                      }))
                    }
                  >
                    <option value="hotel">Hotel</option>
                    <option value="vet">Veterinary</option>
                    <option value="grooming">Grooming</option>
                  </select>
                </div>

                <div className="info-item">
                  <label>Service</label>
                  <input
                    value={bookingForm.service}
                    onChange={(e) =>
                      setBookingForm((prev) => ({ ...prev, service: e.target.value }))
                    }
                    required
                  />
                </div>

                <div className="info-item">
                  <label>Date</label>
                  <input
                    type="date"
                    value={bookingForm.appointment_date}
                    onChange={(e) =>
                      setBookingForm((prev) => ({
                        ...prev,
                        appointment_date: e.target.value,
                      }))
                    }
                    required
                  />
                </div>

                <div className="info-item">
                  <label>Time</label>
                  <input
                    type="time"
                    value={bookingForm.appointment_time}
                    onChange={(e) =>
                      setBookingForm((prev) => ({
                        ...prev,
                        appointment_time: e.target.value,
                      }))
                    }
                  />
                </div>

                {bookingForm.booking_type === "hotel" && (
                  <div className="info-item">
                    <label>Room Type</label>
                    <select
                      value={bookingForm.room_type}
                      onChange={(e) =>
                        setBookingForm((prev) => ({ ...prev, room_type: e.target.value }))
                      }
                    >
                      <option value="Standard Room">Standard Room</option>
                      <option value="Deluxe Suite">Deluxe Suite</option>
                      <option value="Premium Suite">Premium Suite</option>
                    </select>
                  </div>
                )}

                <div className="info-item full-width">
                  <label>Notes</label>
                  <textarea
                    value={bookingForm.notes}
                    onChange={(e) =>
                      setBookingForm((prev) => ({ ...prev, notes: e.target.value }))
                    }
                    placeholder="Special requests or receptionist note..."
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => setShowBookingModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-btn">
                  Create Booking
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReceptionistCustomerManagement;
