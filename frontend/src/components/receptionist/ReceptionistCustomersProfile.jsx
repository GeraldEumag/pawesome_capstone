import React, { useEffect, useMemo, useState } from "react";
import { showConfirm } from "../../utils/alert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBirthdayCake,
  faCalendarCheck,
  faCalendarPlus,
  faChartLine,
  faEnvelope,
  faEye,
  faFilter,
  faHome,
  faMapMarkerAlt,
  faPaw,
  faPhone,
  faPlus,
  faRefresh,
  faSearch,
  faSpinner,
  faTimes,
  faTrash,
  faUser,
  faUserEdit,
} from "@fortawesome/free-solid-svg-icons";
import "./ReceptionistCustomersProfile.css";
import { receptionistProfileApi } from "../../api/receptionistProfileApi";

const EMPTY_CUSTOMER_FORM = {
  firstName: "",
  middleName: "",
  lastName: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "",
  zipCode: "",
  notes: "",
};

const EMPTY_PET_FORM = {
  name: "",
  type: "Dog",
  breed: "",
  age: "",
};

const FILTER_OPTIONS = [
  { value: "all", label: "All Customers" },
  { value: "recent", label: "Recent Customers" },
  { value: "active", label: "Active Customers" },
  { value: "with_pets", label: "With Registered Pets" },
  { value: "without_pets", label: "Without Pets" },
];

const PET_TYPES = ["Dog", "Cat", "Bird", "Rabbit", "Hamster", "Other"];

const PROVINCES = [
  "Abra",
  "Agusan del Norte",
  "Agusan del Sur",
  "Aklan",
  "Albay",
  "Antique",
  "Apayao",
  "Aurora",
  "Bataan",
  "Batanes",
  "Batangas",
  "Benguet",
  "Biliran",
  "Bohol",
  "Bukidnon",
  "Bulacan",
  "Cagayan",
  "Camarines Norte",
  "Camarines Sur",
  "Camiguin",
  "Capiz",
  "Catanduanes",
  "Cavite",
  "Cebu",
  "Cotabato",
  "Davao de Oro",
  "Davao del Norte",
  "Davao del Sur",
  "Davao Occidental",
  "Davao Oriental",
  "Dinagat Islands",
  "Eastern Samar",
  "Guimaras",
  "Ifugao",
  "Ilocos Norte",
  "Ilocos Sur",
  "Iloilo",
  "Isabela",
  "Kalinga",
  "La Union",
  "Laguna",
  "Lanao del Norte",
  "Lanao del Sur",
  "Leyte",
  "Maguindanao del Norte",
  "Maguindanao del Sur",
  "Marinduque",
  "Masbate",
  "Metro Manila",
  "Misamis Occidental",
  "Misamis Oriental",
  "Mountain Province",
  "Negros Occidental",
  "Negros Oriental",
  "Northern Samar",
  "Nueva Ecija",
  "Nueva Vizcaya",
  "Occidental Mindoro",
  "Oriental Mindoro",
  "Palawan",
  "Pampanga",
  "Pangasinan",
  "Quezon",
  "Quirino",
  "Rizal",
  "Romblon",
  "Samar",
  "Sarangani",
  "Siquijor",
  "Sorsogon",
  "South Cotabato",
  "Southern Leyte",
  "Sultan Kudarat",
  "Sulu",
  "Surigao del Norte",
  "Surigao del Sur",
  "Tarlac",
  "Tawi-Tawi",
  "Zambales",
  "Zamboanga del Norte",
  "Zamboanga del Sur",
  "Zamboanga Sibugay",
];

const extractArray = (res, key) => {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.data?.data)) return res.data.data;
  if (Array.isArray(res?.[key])) return res[key];
  if (Array.isArray(res?.[key]?.data)) return res[key].data;
  if (Array.isArray(res?.data?.[key])) return res.data[key];
  return [];
};

const getCustomerName = (customer) =>
  customer?.name ||
  customer?.full_name ||
  [customer?.first_name, customer?.middle_name, customer?.last_name]
    .filter(Boolean)
    .join(" ") ||
  "Unnamed Customer";

const getCustomerId = (customer) => customer?.id || customer?.customer_id || customer?.user_id;

const getPetCustomerId = (pet) =>
  pet?.customer_id || pet?.customerId || pet?.owner_id || pet?.user_id;

const getPetType = (pet) => pet?.type || pet?.species || "Pet";

const formatDate = (value) => {
  if (!value) return "N/A";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
};

const splitCustomerName = (name = "") => {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return EMPTY_CUSTOMER_FORM;
  if (parts.length === 1) {
    return {
      ...EMPTY_CUSTOMER_FORM,
      firstName: parts[0],
    };
  }

  if (parts.length === 2) {
    return {
      ...EMPTY_CUSTOMER_FORM,
      firstName: parts[0],
      lastName: parts[1],
    };
  }

  return {
    ...EMPTY_CUSTOMER_FORM,
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
};

const buildFullName = (form) =>
  [form.firstName, form.middleName, form.lastName]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");

const buildAddress = (form) =>
  [form.address, form.city, form.state, form.zipCode]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(", ");

const CustomersProfile = () => {
  const [customers, setCustomers] = useState([]);
  const [pets, setPets] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showPetModal, setShowPetModal] = useState(false);

  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedPet, setSelectedPet] = useState(null);

  const [customerMode, setCustomerMode] = useState("create");
  const [petMode, setPetMode] = useState("create");

  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");

  const [customerFormData, setCustomerFormData] = useState(EMPTY_CUSTOMER_FORM);
  const [petFormData, setPetFormData] = useState(EMPTY_PET_FORM);

  const showMessage = (type, message) => {
    if (type === "success") {
      setSuccess(message);
      window.clearTimeout(window.receptionistCustomerSuccessTimer);
      window.receptionistCustomerSuccessTimer = window.setTimeout(() => {
        setSuccess("");
      }, 3000);
      return;
    }

    setError(message);
    window.clearTimeout(window.receptionistCustomerErrorTimer);
    window.receptionistCustomerErrorTimer = window.setTimeout(() => {
      setError("");
    }, 5000);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");

      const [customerRes, petRes] = await Promise.all([
        receptionistProfileApi.getCustomers(),
        receptionistProfileApi.getPets(),
      ]);

      setCustomers(extractArray(customerRes, "customers"));
      setPets(extractArray(petRes, "pets"));
      setLastUpdated(new Date().toLocaleString("en-PH"));
    } catch (err) {
      showMessage("error", err.message || "Failed to load customer records.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getCustomerPets = (customer) => {
    const customerId = getCustomerId(customer);

    return pets.filter(
      (pet) => String(getPetCustomerId(pet)) === String(customerId)
    );
  };

  const stats = useMemo(() => {
    const totalBookings = customers.reduce(
      (sum, customer) =>
        sum + Number(customer.totalBookings || customer.total_bookings || customer.bookings_count || 0),
      0
    );

    return {
      totalCustomers: customers.length,
      totalPets: pets.length,
      totalBookings,
      averageBookings:
        customers.length > 0 ? Math.round(totalBookings / customers.length) : 0,
      customersWithPets: customers.filter((customer) => getCustomerPets(customer).length > 0)
        .length,
    };
  }, [customers, pets]);

  const filteredCustomers = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    return customers
      .filter((customer) => {
        const name = getCustomerName(customer).toLowerCase();
        const email = String(customer.email || "").toLowerCase();
        const phone = String(customer.phone || "");
        const address = String(customer.address || "").toLowerCase();
        const customerPets = getCustomerPets(customer);
        const totalBookings = Number(
          customer.totalBookings || customer.total_bookings || customer.bookings_count || 0
        );

        const matchesSearch =
          !keyword ||
          name.includes(keyword) ||
          email.includes(keyword) ||
          phone.includes(keyword) ||
          address.includes(keyword) ||
          customerPets.some((pet) =>
            String(pet.name || "").toLowerCase().includes(keyword)
          );

        if (!matchesSearch) return false;

        if (filterType === "recent") {
          const joined =
            customer.joinDate ||
            customer.join_date ||
            customer.created_at ||
            customer.createdAt;

          if (!joined) return false;

          const joinDate = new Date(joined);
          if (Number.isNaN(joinDate.getTime())) return false;

          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          return joinDate >= thirtyDaysAgo;
        }

        if (filterType === "active") return totalBookings >= 10;
        if (filterType === "with_pets") return customerPets.length > 0;
        if (filterType === "without_pets") return customerPets.length === 0;

        return true;
      })
      .sort((a, b) => {
        const getLastName = (customer) => {
          const parts = getCustomerName(customer).trim().split(/\s+/);
          return (parts[parts.length - 1] || "").toLowerCase();
        };

        return getLastName(a).localeCompare(getLastName(b));
      });
  }, [customers, pets, searchTerm, filterType]);

  const handleCustomerInputChange = (event) => {
    const { name, value } = event.target;

    setCustomerFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handlePetInputChange = (event) => {
    const { name, value } = event.target;

    setPetFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const openCreateCustomerModal = () => {
    setCustomerMode("create");
    setSelectedCustomer(null);
    setCustomerFormData(EMPTY_CUSTOMER_FORM);
    setShowCustomerModal(true);
  };

  const openEditCustomerModal = (customer) => {
    const nameParts = splitCustomerName(getCustomerName(customer));

    setCustomerMode("edit");
    setSelectedCustomer(customer);
    setCustomerFormData({
      ...nameParts,
      phone: customer.phone || "",
      email: customer.email || "",
      address: customer.address || "",
      city: customer.city || "",
      state: customer.state || "",
      zipCode: customer.zipCode || customer.zip_code || "",
      notes: customer.notes || "",
    });
    setShowCustomerModal(true);
  };

  const handleCloseCustomerModal = () => {
    setShowCustomerModal(false);
    setSelectedCustomer(null);
    setCustomerMode("create");
    setCustomerFormData(EMPTY_CUSTOMER_FORM);
  };

  const handleCustomerSubmit = async (event) => {
    event.preventDefault();

    if (!customerFormData.firstName || !customerFormData.lastName || !customerFormData.phone) {
      showMessage("error", "Please fill in First Name, Last Name, and Phone.");
      return;
    }

    const payload = {
      name: buildFullName(customerFormData),
      phone: customerFormData.phone,
      email: customerFormData.email,
      address: buildAddress(customerFormData),
      city: customerFormData.city,
      state: customerFormData.state,
      zip_code: customerFormData.zipCode,
      notes: customerFormData.notes,
    };

    try {
      setSaving(true);

      if (
        customerMode === "edit" &&
        selectedCustomer?.id &&
        typeof receptionistProfileApi.updateCustomer === "function"
      ) {
        await receptionistProfileApi.updateCustomer(selectedCustomer.id, payload);
      } else if (customerMode === "edit") {
        setCustomers((prev) =>
          prev.map((customer) =>
            String(getCustomerId(customer)) === String(getCustomerId(selectedCustomer))
              ? { ...customer, ...payload }
              : customer
          )
        );
      } else {
        await receptionistProfileApi.createCustomer(payload);
      }

      showMessage(
        "success",
        customerMode === "edit"
          ? "Customer updated successfully."
          : "Customer registered successfully."
      );

      handleCloseCustomerModal();
      await loadData();
    } catch (err) {
      showMessage(
        "error",
        err.message ||
          (customerMode === "edit"
            ? "Failed to update customer."
            : "Failed to register customer.")
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCustomer = async (customer) => {
    const customerId = getCustomerId(customer);
    const confirmed = await showConfirm(`Delete ${getCustomerName(customer)}?`);

    if (!confirmed) return;

    try {
      setSaving(true);

      if (typeof receptionistProfileApi.deleteCustomer === "function") {
        await receptionistProfileApi.deleteCustomer(customerId);
      }

      setCustomers((prev) =>
        prev.filter((item) => String(getCustomerId(item)) !== String(customerId))
      );

      if (String(getCustomerId(selectedCustomer)) === String(customerId)) {
        setSelectedCustomer(null);
      }

      showMessage("success", "Customer removed from the current list.");
    } catch (err) {
      showMessage("error", err.message || "Failed to delete customer.");
    } finally {
      setSaving(false);
    }
  };

  const openSelectedCustomer = (customer) => {
    setSelectedCustomer(customer);
  };

  const openCreatePetModal = (customer) => {
    setSelectedCustomer(customer);
    setSelectedPet(null);
    setPetMode("create");
    setPetFormData(EMPTY_PET_FORM);
    setShowPetModal(true);
  };

  const openEditPetModal = (pet) => {
    setSelectedPet(pet);
    setPetMode("edit");
    setPetFormData({
      name: pet.name || "",
      type: getPetType(pet),
      breed: pet.breed || "",
      age: pet.age || "",
    });
    setShowPetModal(true);
  };

  const handleClosePetModal = () => {
    setShowPetModal(false);
    setSelectedPet(null);
    setPetMode("create");
    setPetFormData(EMPTY_PET_FORM);
  };

  const handlePetSubmit = async (event) => {
    event.preventDefault();

    if (!selectedCustomer?.id) {
      showMessage("error", "Please select a customer first.");
      return;
    }

    if (!petFormData.name || !petFormData.type || !petFormData.breed) {
      showMessage("error", "Please fill in pet name, type, and breed.");
      return;
    }

    const payload = {
      customer_id: getCustomerId(selectedCustomer),
      name: petFormData.name,
      type: petFormData.type,
      species: petFormData.type,
      breed: petFormData.breed,
      age: petFormData.age,
    };

    try {
      setSaving(true);

      if (
        petMode === "edit" &&
        selectedPet?.id &&
        typeof receptionistProfileApi.updatePet === "function"
      ) {
        await receptionistProfileApi.updatePet(selectedPet.id, payload);
      } else if (petMode === "edit") {
        setPets((prev) =>
          prev.map((pet) =>
            String(pet.id) === String(selectedPet.id) ? { ...pet, ...payload } : pet
          )
        );
      } else {
        await receptionistProfileApi.createPet(payload);
      }

      showMessage(
        "success",
        petMode === "edit" ? "Pet updated successfully." : "Pet added successfully."
      );

      handleClosePetModal();
      await loadData();
    } catch (err) {
      showMessage(
        "error",
        err.message || (petMode === "edit" ? "Failed to update pet." : "Failed to add pet.")
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePet = async (pet) => {
    const confirmed = await showConfirm(`Delete ${pet.name}?`);
    if (!confirmed) return;

    try {
      setSaving(true);

      if (typeof receptionistProfileApi.deletePet === "function") {
        await receptionistProfileApi.deletePet(pet.id);
      }

      setPets((prev) => prev.filter((item) => String(item.id) !== String(pet.id)));

      if (String(selectedPet?.id) === String(pet.id)) {
        setSelectedPet(null);
      }

      showMessage("success", "Pet removed from the current list.");
    } catch (err) {
      showMessage("error", err.message || "Failed to delete pet.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateBooking = (customer) => {
    window.location.href = `/receptionist/bookings?customer=${getCustomerId(customer)}`;
  };

  const clearFilters = () => {
    setSearchTerm("");
    setFilterType("all");
  };

  return (
    <div className="customers-profile">
      {success && (
        <div className="customer-toast success">
          <FontAwesomeIcon icon={faUser} />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="customer-toast error">
          <FontAwesomeIcon icon={faTimes} />
          <span>{error}</span>
        </div>
      )}

      <section className="customer-profile-hero">
        <div>
          <span className="customer-eyebrow">
            <FontAwesomeIcon icon={faUser} />
            Receptionist Customer Records
          </span>

          <h1>Customer Profiles</h1>

          <p>
            Manage customer records, contact information, registered pets, and booking
            actions from one front desk workspace.
          </p>

          <small>Last updated: {lastUpdated || "Not refreshed yet"}</small>
        </div>

        <div className="customer-hero-actions">
          <button
            type="button"
            className="secondary-btn"
            onClick={loadData}
            disabled={loading || saving}
          >
            <FontAwesomeIcon icon={loading ? faSpinner : faRefresh} spin={loading} />
            Refresh
          </button>

          <button
            type="button"
            className="primary-btn"
            onClick={openCreateCustomerModal}
            disabled={saving}
          >
            <FontAwesomeIcon icon={faPlus} />
            Add Customer
          </button>
        </div>
      </section>

      <section className="customer-stats-grid">
        <button type="button" className="customer-stat-card" onClick={() => setFilterType("all")}>
          <span>
            <FontAwesomeIcon icon={faUser} />
          </span>
          <div>
            <strong>{stats.totalCustomers}</strong>
            <p>Total Customers</p>
          </div>
        </button>

        <button
          type="button"
          className="customer-stat-card pets"
          onClick={() => setFilterType("with_pets")}
        >
          <span>
            <FontAwesomeIcon icon={faPaw} />
          </span>
          <div>
            <strong>{stats.totalPets}</strong>
            <p>Registered Pets</p>
          </div>
        </button>

        <button type="button" className="customer-stat-card bookings">
          <span>
            <FontAwesomeIcon icon={faCalendarCheck} />
          </span>
          <div>
            <strong>{stats.totalBookings}</strong>
            <p>Total Bookings</p>
          </div>
        </button>

        <button type="button" className="customer-stat-card average">
          <span>
            <FontAwesomeIcon icon={faChartLine} />
          </span>
          <div>
            <strong>{stats.averageBookings}</strong>
            <p>Average Bookings</p>
          </div>
        </button>
      </section>

      <section className="customer-controls">
        <div className="customer-search-box">
          <FontAwesomeIcon icon={faSearch} />
          <input
            type="text"
            placeholder="Search customer, email, phone, address, or pet name..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />

          {searchTerm && (
            <button type="button" onClick={() => setSearchTerm("")}>
              <FontAwesomeIcon icon={faTimes} />
            </button>
          )}
        </div>

        <label className="customer-filter-box">
          <FontAwesomeIcon icon={faFilter} />
          <select
            value={filterType}
            onChange={(event) => setFilterType(event.target.value)}
          >
            {FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <button type="button" className="clear-btn" onClick={clearFilters}>
          <FontAwesomeIcon icon={faTimes} />
          Clear
        </button>
      </section>

      <section className="customers-table-card">
        <div className="customers-table-header">
          <div>
            <span className="customer-eyebrow">
              <FontAwesomeIcon icon={faUser} />
              Customer Directory
            </span>
            <h2>Customer List</h2>
            <p>
              Showing <strong>{filteredCustomers.length}</strong> of{" "}
              <strong>{customers.length}</strong> customer(s).
            </p>
          </div>
        </div>

        {loading ? (
          <div className="customer-state">
            <FontAwesomeIcon icon={faSpinner} spin />
            <h3>Loading customers...</h3>
            <p>Please wait while customer and pet records are loaded.</p>
          </div>
        ) : (
          <div className="customers-table-scroll">
            <table className="customers-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Contact</th>
                  <th>Address</th>
                  <th>Member Since</th>
                  <th>Bookings</th>
                  <th>Pets</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredCustomers.length === 0 && (
                  <tr>
                    <td colSpan="7">
                      <div className="customer-empty-state">
                        <FontAwesomeIcon icon={faSearch} />
                        <h3>No customers found</h3>
                        <p>Try changing the search keyword or filter.</p>
                      </div>
                    </td>
                  </tr>
                )}

                {filteredCustomers.map((customer) => {
                  const customerPets = getCustomerPets(customer);
                  const customerName = getCustomerName(customer);

                  return (
                    <tr key={getCustomerId(customer)}>
                      <td>
                        <div className="customer-cell">
                          <div className="customer-avatar">
                            <FontAwesomeIcon icon={faUser} />
                          </div>
                          <div className="customer-basic-info">
                            <h4>{customerName}</h4>
                            <p>Customer ID: {getCustomerId(customer)}</p>
                          </div>
                        </div>
                      </td>

                      <td>
                        <div className="contact-info">
                          <div className="contact-item">
                            <FontAwesomeIcon icon={faPhone} />
                            <span>{customer.phone || "No phone"}</span>
                          </div>
                          <div className="contact-item">
                            <FontAwesomeIcon icon={faEnvelope} />
                            <span>{customer.email || "No email"}</span>
                          </div>
                        </div>
                      </td>

                      <td>
                        <div className="address-info">
                          <FontAwesomeIcon icon={faMapMarkerAlt} />
                          <span>{customer.address || "No address"}</span>
                        </div>
                      </td>

                      <td>
                        <div className="date-info">
                          <FontAwesomeIcon icon={faHome} />
                          <span>
                            {formatDate(
                              customer.joinDate ||
                                customer.join_date ||
                                customer.created_at ||
                                customer.createdAt
                            )}
                          </span>
                        </div>
                      </td>

                      <td>
                        <div className="bookings-info">
                          <FontAwesomeIcon icon={faCalendarCheck} />
                          <span>
                            {customer.totalBookings ||
                              customer.total_bookings ||
                              customer.bookings_count ||
                              0}
                          </span>
                        </div>
                      </td>

                      <td>
                        <div className="pets-info">
                          <div className="pets-summary">
                            <FontAwesomeIcon icon={faPaw} />
                            <span>{customerPets.length} pet(s)</span>
                          </div>

                          <div className="pets-list-inline">
                            {customerPets.slice(0, 2).map((pet) => (
                              <span key={pet.id} className="pet-tag">
                                {pet.name}
                              </span>
                            ))}

                            {customerPets.length > 2 && (
                              <span className="pet-more">
                                +{customerPets.length - 2} more
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td>
                        <div className="table-actions">
                          <button
                            type="button"
                            className="action-btn view-btn"
                            onClick={() => openSelectedCustomer(customer)}
                            title="View Profile"
                          >
                            <FontAwesomeIcon icon={faEye} />
                          </button>

                          <button
                            type="button"
                            className="action-btn edit-btn"
                            onClick={() => openEditCustomerModal(customer)}
                            title="Edit Customer"
                          >
                            <FontAwesomeIcon icon={faUserEdit} />
                          </button>

                          <button
                            type="button"
                            className="action-btn pets-btn"
                            onClick={() => openCreatePetModal(customer)}
                            title="Add Pet"
                          >
                            <FontAwesomeIcon icon={faPaw} />
                          </button>

                          <button
                            type="button"
                            className="action-btn book-btn"
                            onClick={() => handleCreateBooking(customer)}
                            title="Create Booking"
                          >
                            <FontAwesomeIcon icon={faCalendarPlus} />
                          </button>

                          <button
                            type="button"
                            className="action-btn delete-btn"
                            onClick={() => handleDeleteCustomer(customer)}
                            title="Delete Customer"
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedCustomer && (
        <section className="selected-customer-details">
          <div className="details-header">
            <div>
              <span className="customer-eyebrow">
                <FontAwesomeIcon icon={faUser} />
                Profile Details
              </span>
              <h3>{getCustomerName(selectedCustomer)}</h3>
              <p>{selectedCustomer.email || "No email"} | {selectedCustomer.phone || "No phone"}</p>
            </div>

            <button
              type="button"
              className="close-details-btn"
              onClick={() => setSelectedCustomer(null)}
            >
              <FontAwesomeIcon icon={faTimes} />
            </button>
          </div>

          <div className="profile-detail-grid">
            <InfoCard label="Customer ID" value={getCustomerId(selectedCustomer)} />
            <InfoCard label="Phone" value={selectedCustomer.phone || "No phone"} />
            <InfoCard label="Email" value={selectedCustomer.email || "No email"} />
            <InfoCard label="Address" value={selectedCustomer.address || "No address"} />
            <InfoCard
              label="Member Since"
              value={formatDate(
                selectedCustomer.joinDate ||
                  selectedCustomer.join_date ||
                  selectedCustomer.created_at ||
                  selectedCustomer.createdAt
              )}
            />
            <InfoCard label="Notes" value={selectedCustomer.notes || "No notes"} wide />
          </div>

          <div className="pets-management">
            <div className="pets-header">
              <div>
                <h4>
                  <FontAwesomeIcon icon={faPaw} />
                  Registered Pets ({getCustomerPets(selectedCustomer).length})
                </h4>
                <p>Pets connected to this customer profile.</p>
              </div>

              <button
                type="button"
                className="add-pet-btn"
                onClick={() => openCreatePetModal(selectedCustomer)}
              >
                <FontAwesomeIcon icon={faPlus} />
                Add Pet
              </button>
            </div>

            <div className="pets-grid">
              {getCustomerPets(selectedCustomer).length === 0 ? (
                <div className="no-pets-card">
                  <FontAwesomeIcon icon={faPaw} />
                  <h5>No pets registered</h5>
                  <p>This customer has no registered pets yet.</p>
                  <button
                    type="button"
                    className="add-first-pet-btn"
                    onClick={() => openCreatePetModal(selectedCustomer)}
                  >
                    <FontAwesomeIcon icon={faPlus} />
                    Add First Pet
                  </button>
                </div>
              ) : (
                getCustomerPets(selectedCustomer).map((pet) => (
                  <article key={pet.id} className="pet-card">
                    <div className="pet-avatar">
                      <FontAwesomeIcon icon={faPaw} />
                    </div>

                    <div className="pet-info">
                      <h5>{pet.name}</h5>
                      <p>
                        {getPetType(pet)} {pet.breed ? `- ${pet.breed}` : ""}
                      </p>
                      <span className="pet-age">
                        <FontAwesomeIcon icon={faBirthdayCake} />
                        {pet.age || "Age not set"}
                      </span>
                    </div>

                    <div className="pet-actions">
                      <button
                        type="button"
                        className="action-btn edit-pet-btn"
                        onClick={() => openEditPetModal(pet)}
                        title="Edit Pet"
                      >
                        <FontAwesomeIcon icon={faUserEdit} />
                      </button>

                      <button
                        type="button"
                        className="action-btn delete-pet-btn"
                        onClick={() => handleDeletePet(pet)}
                        title="Delete Pet"
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        </section>
      )}

      {showCustomerModal && (
        <div className="registration-modal-overlay" onClick={handleCloseCustomerModal}>
          <div className="registration-modal" onClick={(event) => event.stopPropagation()}>
            <div className="registration-header">
              <div className="registration-title">
                <div className="registration-icon">
                  <FontAwesomeIcon icon={faUser} />
                </div>
                <div>
                  <h2>
                    {customerMode === "edit"
                      ? "Edit Customer Profile"
                      : "Customer Registration"}
                  </h2>
                  <p>
                    {customerMode === "edit"
                      ? "Update the selected customer information."
                      : "Fill in the customer information below."}
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="close-registration-btn"
                onClick={handleCloseCustomerModal}
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            <form onSubmit={handleCustomerSubmit} className="registration-form">
              <div className="form-section">
                <h3>Personal Information</h3>

                <div className="form-row three-columns">
                  <div className="form-group">
                    <label htmlFor="firstName">First Name *</label>
                    <input
                      type="text"
                      id="firstName"
                      name="firstName"
                      value={customerFormData.firstName}
                      onChange={handleCustomerInputChange}
                      placeholder="Enter first name"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="middleName">Middle Name</label>
                    <input
                      type="text"
                      id="middleName"
                      name="middleName"
                      value={customerFormData.middleName}
                      onChange={handleCustomerInputChange}
                      placeholder="Optional"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="lastName">Last Name *</label>
                    <input
                      type="text"
                      id="lastName"
                      name="lastName"
                      value={customerFormData.lastName}
                      onChange={handleCustomerInputChange}
                      placeholder="Enter last name"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="form-section">
                <h3>Contact Information</h3>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="phone">Phone Number *</label>
                    <input
                      type="tel"
                      id="phone"
                      name="phone"
                      value={customerFormData.phone}
                      onChange={handleCustomerInputChange}
                      placeholder="09XXXXXXXXX"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="email">Email Address</label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={customerFormData.email}
                      onChange={handleCustomerInputChange}
                      placeholder="customer@example.com"
                    />
                  </div>
                </div>
              </div>

              <div className="form-section">
                <h3>Address Information</h3>

                <div className="form-group">
                  <label htmlFor="address">Street Address</label>
                  <input
                    type="text"
                    id="address"
                    name="address"
                    value={customerFormData.address}
                    onChange={handleCustomerInputChange}
                    placeholder="Street, house number, subdivision"
                  />
                </div>

                <div className="form-row three-columns">
                  <div className="form-group">
                    <label htmlFor="city">City/Municipality</label>
                    <input
                      type="text"
                      id="city"
                      name="city"
                      value={customerFormData.city}
                      onChange={handleCustomerInputChange}
                      placeholder="City or municipality"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="state">Province</label>
                    <select
                      id="state"
                      name="state"
                      value={customerFormData.state}
                      onChange={handleCustomerInputChange}
                    >
                      <option value="">Select Province</option>
                      {PROVINCES.map((province) => (
                        <option key={province} value={province}>
                          {province}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="zipCode">Postal Code</label>
                    <input
                      type="text"
                      id="zipCode"
                      name="zipCode"
                      value={customerFormData.zipCode}
                      onChange={handleCustomerInputChange}
                      placeholder="Postal code"
                      maxLength={4}
                    />
                  </div>
                </div>
              </div>

              <div className="form-section">
                <h3>Additional Information</h3>

                <div className="form-group">
                  <label htmlFor="notes">Notes</label>
                  <textarea
                    id="notes"
                    name="notes"
                    value={customerFormData.notes}
                    onChange={handleCustomerInputChange}
                    placeholder="Any additional notes about the customer..."
                    rows={3}
                  />
                </div>
              </div>

              <div className="registration-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleCloseCustomerModal}
                  disabled={saving}
                >
                  <FontAwesomeIcon icon={faTimes} />
                  Cancel
                </button>

                <button type="submit" className="btn-primary" disabled={saving}>
                  <FontAwesomeIcon icon={saving ? faSpinner : faPlus} spin={saving} />
                  {customerMode === "edit" ? "Save Changes" : "Register Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPetModal && selectedCustomer && (
        <div className="pet-modal-overlay" onClick={handleClosePetModal}>
          <div className="pet-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="customer-eyebrow">
                  <FontAwesomeIcon icon={faPaw} />
                  Pet Profile
                </span>
                <h3>{petMode === "edit" ? "Edit Pet" : "Add New Pet"}</h3>
                <p>Owner: {getCustomerName(selectedCustomer)}</p>
              </div>

              <button type="button" className="close-btn" onClick={handleClosePetModal}>
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            <form onSubmit={handlePetSubmit} className="modal-body">
              <div className="form-group">
                <label>Pet Name *</label>
                <input
                  type="text"
                  name="name"
                  value={petFormData.name}
                  onChange={handlePetInputChange}
                  placeholder="Pet name"
                  required
                />
              </div>

              <div className="form-group">
                <label>Type *</label>
                <select
                  name="type"
                  value={petFormData.type}
                  onChange={handlePetInputChange}
                  required
                >
                  {PET_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Breed *</label>
                <input
                  type="text"
                  name="breed"
                  value={petFormData.breed}
                  onChange={handlePetInputChange}
                  placeholder="Breed"
                  required
                />
              </div>

              <div className="form-group">
                <label>Age</label>
                <input
                  type="text"
                  name="age"
                  value={petFormData.age}
                  onChange={handlePetInputChange}
                  placeholder="Example: 2 years"
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={handleClosePetModal}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button type="submit" className="primary-btn" disabled={saving}>
                  <FontAwesomeIcon icon={saving ? faSpinner : faPlus} spin={saving} />
                  {petMode === "edit" ? "Save Pet" : "Add Pet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const InfoCard = ({ label, value, wide = false }) => (
  <div className={`profile-info-card ${wide ? "wide" : ""}`}>
    <small>{label}</small>
    <strong>{value || "N/A"}</strong>
  </div>
);

export default CustomersProfile;