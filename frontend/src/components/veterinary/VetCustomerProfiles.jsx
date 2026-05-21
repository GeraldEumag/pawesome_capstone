import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSearch,
  faUser,
  faEnvelope,
  faPhone,
  faSpinner,
  faExclamationTriangle,
  faMapMarkerAlt,
  faPaw,
  faRotateRight,
  faXmark,
  faUsers,
  faIdCard,
  faClipboardList,
  faEye,
  faNotesMedical,
  faCalendarCheck,
  faShieldDog,
  faHeartPulse,
  faArrowLeft,
  faStethoscope,
  faFileMedical,
} from "@fortawesome/free-solid-svg-icons";
import toast from "react-hot-toast";
import { apiRequest } from "../../api/client";
import PetAvatar from "../shared/PetAvatar";
import "./VetCustomerProfiles.css";

const VetCustomerProfiles = () => {
  const [customers, setCustomers] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [selectedPetHistory, setSelectedPetHistory] = useState(null);
  const [medicalHistory, setMedicalHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const safeArray = (value) => {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.patients)) return value.patients;
    if (Array.isArray(value?.data)) return value.data;
    if (Array.isArray(value?.data?.data)) return value.data.data;
    if (Array.isArray(value?.records)) return value.records;
    if (Array.isArray(value?.pets)) return value.pets;
    if (Array.isArray(value?.history)) return value.history;
    if (Array.isArray(value?.medical_history)) return value.medical_history;
    if (Array.isArray(value?.medicalHistory)) return value.medicalHistory;
    if (Array.isArray(value?.appointments)) return value.appointments;
    return [];
  };

  const getOwnerId = useCallback((pet) =>
    pet?.customer?.id ||
    pet?.owner?.id ||
    pet?.customer_id ||
    pet?.owner_id ||
    pet?.user_id ||
    ""
  , []);
  const getOwnerName = useCallback((pet) =>
    pet?.customer?.name ||
    pet?.owner?.name ||
    pet?.customer_name ||
    pet?.owner_name ||
    pet?.client_name ||
    "Unknown Customer"
  , []);
  const getOwnerEmail = useCallback((pet) =>
    pet?.customer?.email ||
    pet?.owner?.email ||
    pet?.customer_email ||
    pet?.owner_email ||
    pet?.email ||
    ""
  , []);
  const getOwnerPhone = useCallback((pet) =>
    pet?.customer?.phone ||
    pet?.owner?.phone ||
    pet?.customer_phone ||
    pet?.owner_phone ||
    pet?.phone ||
    pet?.contact_number ||
    ""
  , []);
  const getOwnerAddress = useCallback((pet) =>
    pet?.customer?.address ||
    pet?.owner?.address ||
    pet?.customer_address ||
    pet?.owner_address ||
    pet?.address ||
    ""
  , []);
  const getPetName = useCallback((pet) => pet?.name || pet?.pet_name || "Unknown Pet", []);

  const getPetSpecies = useCallback((pet) =>
    pet?.species || pet?.pet_species || pet?.type || "Unknown", []);

  const getPetBreed = useCallback((pet) =>
    pet?.breed || pet?.pet_breed || pet?.breed_name || "Unknown", []);

  const getPetAge = useCallback((pet) => pet?.age || pet?.pet_age || "", []);

  const getPetStatus = useCallback((pet) =>
    pet?.status || pet?.health_status || pet?.pet_status || "Active", []);

  const getPetNotes = useCallback((pet) =>
    pet?.notes ||
    pet?.medical_notes ||
    pet?.special_needs ||
    pet?.description ||
    "No notes available.", []);

  const formatDate = (value) => {
    if (!value) return "No date";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const makeCustomerKey = useCallback((pet) => {
    const ownerId = getOwnerId(pet);
    const email = getOwnerEmail(pet);
    const phone = getOwnerPhone(pet);
    const name = getOwnerName(pet);

    if (ownerId) return `owner-${ownerId}`;
    if (email) return `email-${email.toLowerCase()}`;
    if (phone) return `phone-${phone}`;
    return `name-${name.toLowerCase()}`;
  }, [getOwnerId, getOwnerEmail, getOwnerPhone, getOwnerName]);

  const transformPet = useCallback((pet) => ({
    id: pet?.id || pet?.pet_id || `${getPetName(pet)}-${getPetSpecies(pet)}`,
    name: getPetName(pet),
    species: getPetSpecies(pet),
    breed: getPetBreed(pet),
    age: getPetAge(pet),
    status: getPetStatus(pet),
    notes: getPetNotes(pet),
    image_url: pet?.image_url || pet?.image || null,
    createdAt: pet?.created_at || pet?.registered_at || "",
    lastVisit:
      pet?.last_visit ||
      pet?.last_appointment_date ||
      pet?.latest_visit ||
      pet?.updated_at ||
      "",
    raw: pet,
  }), [getPetName, getPetSpecies, getPetBreed, getPetAge, getPetStatus, getPetNotes]);

  const groupPatientsByCustomer = useCallback((patients) => {
    const grouped = new Map();

    patients.forEach((pet) => {
      const key = makeCustomerKey(pet);
      const existing = grouped.get(key);

      const baseCustomer = {
        id: getOwnerId(pet) || key,
        key,
        name: getOwnerName(pet),
        email: getOwnerEmail(pet),
        phone: getOwnerPhone(pet),
        address: getOwnerAddress(pet),
        pets: [],
        raw: pet?.customer || pet?.owner || {},
      };

      if (!existing) {
        grouped.set(key, baseCustomer);
      }

      const customerRecord = grouped.get(key);
      const transformedPet = transformPet(pet);

      const isDuplicatePet = customerRecord.pets.some(
        (item) => String(item.id) === String(transformedPet.id)
      );

      if (!isDuplicatePet) {
        customerRecord.pets.push(transformedPet);
      }
    });

    return Array.from(grouped.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [makeCustomerKey, getOwnerId, getOwnerName, getOwnerEmail, getOwnerPhone, getOwnerAddress, transformPet]);

  const fetchCustomers = useCallback(
    async ({ silent = false } = {}) => {
      try {
        if (!silent) {
          setLoading(true);
        } else {
          setRefreshing(true);
        }

        const data = await apiRequest("/veterinary/patients");
        const patients = safeArray(data);
        const groupedCustomers = groupPatientsByCustomer(patients);

        setCustomers(groupedCustomers);
        setError("");
      } catch (err) {
        console.error("Failed to fetch customers:", err);
        setError("Failed to load customer profiles. Please try again.");
        setCustomers([]);

        if (!silent) {
          toast.error("Failed to load customer profiles.");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [groupPatientsByCustomer]
  );

  useEffect(() => {
    fetchCustomers({ silent: false });
  }, [fetchCustomers]);

  const filteredCustomers = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    if (!keyword) return customers;

    return customers.filter((customer) => {
      const petSearchText = customer.pets
        .map((pet) =>
          [pet.name, pet.species, pet.breed, pet.age, pet.status]
            .filter(Boolean)
            .join(" ")
        )
        .join(" ");

      const searchableText = [
        customer.name,
        customer.email,
        customer.phone,
        customer.address,
        petSearchText,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(keyword);
    });
  }, [customers, searchTerm]);

  const stats = useMemo(() => {
    const totalPets = customers.reduce(
      (total, customer) => total + customer.pets.length,
      0
    );

    const speciesCount = new Set(
      customers.flatMap((customer) =>
        customer.pets.map((pet) => pet.species).filter(Boolean)
      )
    ).size;

    return {
      totalCustomers: customers.length,
      totalPets,
      speciesCount,
    };
  }, [customers]);

  const handleRefresh = () => {
    fetchCustomers({ silent: true });
    toast.success("Customer profiles refreshed.");
  };

  const getCustomerInitials = (name) => {
    const parts = String(name || "?")
      .trim()
      .split(" ")
      .filter(Boolean);

    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();

    return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
  };

  const openMedicalHistory = async (pet) => {
    setSelectedPetHistory(pet);
    setMedicalHistory([]);
    setHistoryError("");
    setHistoryLoading(true);

    try {
      const result = await apiRequest(`/veterinary/pets/${pet.id}/medical-history`);
      const records = safeArray(result).map((record, index) => ({
        id: record?.id || index + 1,
        date:
          record?.date ||
          record?.visit_date ||
          record?.appointment_date ||
          record?.created_at ||
          "",
        title:
          record?.title ||
          record?.service_name ||
          record?.diagnosis ||
          record?.type ||
          "Medical Record",
        diagnosis: record?.diagnosis || record?.condition || "No diagnosis stated.",
        treatment: record?.treatment || record?.procedure || record?.notes || "",
        veterinarian:
          record?.veterinarian?.name ||
          record?.vet_name ||
          record?.doctor ||
          record?.handled_by ||
          "Veterinary Staff",
        remarks: record?.remarks || record?.notes || record?.description || "",
      }));

      setMedicalHistory(records);
    } catch (err) {
      console.error("Failed to fetch medical history:", err);
      setHistoryError(
        "Medical history endpoint is not available yet, or no records were found for this pet."
      );
      setMedicalHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  if (loading) {
    return (
      <section className="app-content vet-customer-profiles">
        <div className="premium-card vet-loading-state">
          <FontAwesomeIcon icon={faSpinner} className="spin-animation" />
          <span>Loading customer profiles...</span>
        </div>
      </section>
    );
  }

  return (
    <section className="app-content vet-customer-profiles">
      <div className="premium-card vet-profiles-hero">
        <div className="vet-profiles-hero-copy">
          <span className="vet-profiles-eyebrow">
            <FontAwesomeIcon icon={faIdCard} />
            Veterinary Customer Records
          </span>

          <h2 className="premium-title">
            <FontAwesomeIcon icon={faUsers} />
            Customer Profiles
          </h2>

          <p className="premium-muted">
            Browse customers first, then open a complete profile with owner information,
            registered pets, patient details, and medical history access.
          </p>
        </div>

        <button
          className={`vet-refresh-btn ${refreshing ? "refreshing" : ""}`}
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <FontAwesomeIcon icon={faRotateRight} />
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="premium-card vet-error-banner">
          <FontAwesomeIcon icon={faExclamationTriangle} />
          <span>{error}</span>
        </div>
      )}

      <div className="vet-profile-stats">
        <article className="premium-card vet-profile-stat-card">
          <span>
            <FontAwesomeIcon icon={faUsers} />
          </span>
          <div>
            <h3>{stats.totalCustomers}</h3>
            <p>Total Customers</p>
          </div>
        </article>

        <article className="premium-card vet-profile-stat-card">
          <span>
            <FontAwesomeIcon icon={faPaw} />
          </span>
          <div>
            <h3>{stats.totalPets}</h3>
            <p>Registered Pets</p>
          </div>
        </article>

        <article className="premium-card vet-profile-stat-card">
          <span>
            <FontAwesomeIcon icon={faClipboardList} />
          </span>
          <div>
            <h3>{stats.speciesCount}</h3>
            <p>Species Types</p>
          </div>
        </article>
      </div>

      <div className="premium-card vet-profiles-search">
        <div className="vet-search-box">
          <FontAwesomeIcon icon={faSearch} />
          <input
            type="text"
            placeholder="Search customer, email, phone, address, pet name, species, or breed..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          {searchTerm && (
            <button
              className="vet-clear-search-btn"
              type="button"
              onClick={() => setSearchTerm("")}
              aria-label="Clear search"
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          )}
        </div>

        <div className="vet-search-meta">
          Showing <strong>{filteredCustomers.length}</strong> of{" "}
          <strong>{customers.length}</strong> customers
        </div>
      </div>

      {filteredCustomers.length === 0 ? (
        <div className="premium-card vet-empty-state">
          <FontAwesomeIcon icon={faUser} />
          <h3>No customers found</h3>
          <p>
            {searchTerm
              ? "Try another customer name, pet name, email, phone, species, or breed."
              : "Customer records will appear here once patient data is available."}
          </p>
        </div>
      ) : (
        <div className="vet-customer-list">
          {filteredCustomers.map((customer) => (
            <article key={customer.key} className="premium-card vet-customer-card">
              <div className="vet-customer-avatar">
                {getCustomerInitials(customer.name)}
              </div>

              <div className="vet-customer-info">
                <div className="vet-customer-mainline">
                  <div>
                    <h3>{customer.name}</h3>
                    <p className="pet-line">
                      <FontAwesomeIcon icon={faPaw} />
                      {customer.pets.length} registered pet
                      {customer.pets.length === 1 ? "" : "s"}
                    </p>
                  </div>

                  <span className="vet-patient-badge">
                    Customer Record
                  </span>
                </div>

                <div className="vet-contact-grid">
                  <p>
                    <FontAwesomeIcon icon={faEnvelope} />
                    {customer.email || "No email"}
                  </p>

                  <p>
                    <FontAwesomeIcon icon={faPhone} />
                    {customer.phone || "No phone"}
                  </p>

                  <p>
                    <FontAwesomeIcon icon={faMapMarkerAlt} />
                    {customer.address || "No address"}
                  </p>
                </div>

                <div className="vet-customer-pet-preview">
                  {customer.pets.slice(0, 4).map((pet) => (
                    <span key={pet.id}>
                      <FontAwesomeIcon icon={faPaw} />
                      {pet.name}
                    </span>
                  ))}

                  {customer.pets.length > 4 && (
                    <span>+{customer.pets.length - 4} more</span>
                  )}
                </div>
              </div>

              <button
                className="vet-view-profile-btn"
                type="button"
                onClick={() => setSelectedProfile(customer)}
              >
                <FontAwesomeIcon icon={faEye} />
                View Profile
              </button>
            </article>
          ))}
        </div>
      )}

      {selectedProfile && (
        <div
          className="vet-profile-modal-overlay"
          onClick={() => setSelectedProfile(null)}
        >
          <div
            className="vet-profile-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="vet-profile-modal-header">
              <div>
                <span className="vet-profiles-eyebrow">
                  <FontAwesomeIcon icon={faIdCard} />
                  Customer Profile
                </span>
                <h3>{selectedProfile.name}</h3>
                <p>
                  {selectedProfile.pets.length} registered pet
                  {selectedProfile.pets.length === 1 ? "" : "s"}
                </p>
              </div>

              <button
                className="vet-modal-close"
                type="button"
                onClick={() => setSelectedProfile(null)}
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            <div className="vet-profile-modal-body">
              <div className="modal-profile-summary">
                <div className="modal-profile-avatar">
                  {getCustomerInitials(selectedProfile.name)}
                </div>

                <div>
                  <h4>{selectedProfile.name}</h4>
                  <p>Customer / Pet Owner</p>
                </div>
              </div>

              <div className="modal-profile-grid">
                <div>
                  <small>Customer Name</small>
                  <strong>{selectedProfile.name}</strong>
                </div>

                <div>
                  <small>Email</small>
                  <strong>{selectedProfile.email || "No email"}</strong>
                </div>

                <div>
                  <small>Phone</small>
                  <strong>{selectedProfile.phone || "No phone"}</strong>
                </div>

                <div>
                  <small>Address</small>
                  <strong>{selectedProfile.address || "No address"}</strong>
                </div>
              </div>

              <div className="vet-pets-section">
                <div className="vet-pets-section-header">
                  <div>
                    <span className="vet-profiles-eyebrow">
                      <FontAwesomeIcon icon={faShieldDog} />
                      Registered Pets
                    </span>
                    <h4>Pets Under This Customer</h4>
                  </div>

                  <span className="vet-patient-badge">
                    {selectedProfile.pets.length} pet
                    {selectedProfile.pets.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="vet-pet-profile-list">
                  {selectedProfile.pets.map((pet) => (
                    <article key={pet.id} className="vet-pet-profile-card">
                      <div className="vet-pet-profile-header">
                        <PetAvatar pet={pet} size={64} />

                        <div>
                          <h5>{pet.name}</h5>
                          <p>
                            {pet.species || "Unknown"} • {pet.breed || "Unknown"}
                          </p>
                        </div>

                        <span className="vet-pet-status">{pet.status}</span>
                      </div>

                      <div className="vet-pet-info-grid">
                        <div>
                          <small>Species</small>
                          <strong>{pet.species || "Unknown"}</strong>
                        </div>

                        <div>
                          <small>Breed</small>
                          <strong>{pet.breed || "Unknown"}</strong>
                        </div>

                        <div>
                          <small>Age</small>
                          <strong>{pet.age || "Not specified"}</strong>
                        </div>

                        <div>
                          <small>Last Visit</small>
                          <strong>
                            {pet.lastVisit ? formatDate(pet.lastVisit) : "No visit recorded"}
                          </strong>
                        </div>

                        <div>
                          <small>Registered</small>
                          <strong>
                            {pet.createdAt ? formatDate(pet.createdAt) : "No date"}
                          </strong>
                        </div>
                      </div>

                      <div className="vet-pet-notes">
                        <FontAwesomeIcon icon={faNotesMedical} />
                        <span>{pet.notes || "No notes available."}</span>
                      </div>

                      <button
                        type="button"
                        className="vet-medical-history-btn"
                        onClick={() => openMedicalHistory(pet)}
                      >
                        <FontAwesomeIcon icon={faFileMedical} />
                        View Medical History
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            </div>

            <div className="vet-profile-modal-actions">
              <button
                className="vet-refresh-btn"
                type="button"
                onClick={() => setSelectedProfile(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedPetHistory && (
        <div
          className="vet-history-modal-overlay"
          onClick={() => setSelectedPetHistory(null)}
        >
          <div
            className="vet-history-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="vet-profile-modal-header">
              <div>
                <span className="vet-profiles-eyebrow">
                  <FontAwesomeIcon icon={faHeartPulse} />
                  Medical History
                </span>
                <h3>{selectedPetHistory.name}</h3>
                <p>
                  {selectedPetHistory.species} • {selectedPetHistory.breed}
                </p>
              </div>

              <button
                className="vet-modal-close"
                type="button"
                onClick={() => setSelectedPetHistory(null)}
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            <div className="vet-history-modal-body">
              <button
                type="button"
                className="vet-history-back-btn"
                onClick={() => setSelectedPetHistory(null)}
              >
                <FontAwesomeIcon icon={faArrowLeft} />
                Back to Profile
              </button>

              {historyLoading ? (
                <div className="vet-history-state">
                  <FontAwesomeIcon icon={faSpinner} className="spin-animation" />
                  <span>Loading medical history...</span>
                </div>
              ) : historyError ? (
                <div className="vet-history-state warning">
                  <FontAwesomeIcon icon={faExclamationTriangle} />
                  <span>{historyError}</span>
                </div>
              ) : medicalHistory.length === 0 ? (
                <div className="vet-history-state">
                  <FontAwesomeIcon icon={faStethoscope} />
                  <span>No medical history found for this pet.</span>
                </div>
              ) : (
                <div className="vet-history-timeline">
                  {medicalHistory.map((record) => (
                    <article key={record.id} className="vet-history-item">
                      <div className="vet-history-date">
                        <FontAwesomeIcon icon={faCalendarCheck} />
                        {formatDate(record.date)}
                      </div>

                      <div className="vet-history-content">
                        <h4>{record.title}</h4>

                        <div className="vet-history-grid">
                          <div>
                            <small>Diagnosis</small>
                            <strong>{record.diagnosis}</strong>
                          </div>

                          <div>
                            <small>Treatment</small>
                            <strong>{record.treatment || "No treatment stated."}</strong>
                          </div>

                          <div>
                            <small>Veterinarian</small>
                            <strong>{record.veterinarian}</strong>
                          </div>
                        </div>

                        {record.remarks && (
                          <p className="vet-history-remarks">{record.remarks}</p>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default VetCustomerProfiles;
