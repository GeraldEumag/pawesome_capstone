import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { showConfirm } from "../../utils/alert.jsx";
import { useAuth } from "../../context/AuthContext";
import DatePickerInput from "../shared/DatePickerInput";
import Modal from "../shared/Modal";
import {
  FaArchive,
  FaCalendarAlt,
  FaCamera,
  FaCat,
  FaDog,
  FaDove,
  FaEdit,
  FaExclamationTriangle,
  FaFileMedical,
  FaHeartbeat,
  FaNotesMedical,
  FaPaw,
  FaPlus,
  FaStethoscope,
  FaSyncAlt,
  FaTimes,
  FaUserAlt,
  FaVenusMars,
} from "react-icons/fa";
import "./CustomerPets.css";
import { apiRequest, getAuthenticatedFileUrl } from "../../api/client";
import { formatDateOnly, parseDateOnly } from "../../utils/date";
import PetAvatar, { resolveImageUrl } from "../shared/PetAvatar";
import {
  getSpeciesOptions,
  getBreedOptions,
  isManualBreedRequired
} from "../../config/petSpeciesConfig";

const PET_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PET_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];
const PET_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

const initialForm = (customerEmail) => ({
  name: "",
  species: "",
  breed: "",
  manualBreed: "",
  birthdate: "",
  gender: "",
  notes: "",
  customer_email: customerEmail || "",
  image: null,
});

// Pure helpers — defined outside the component so they are stable module-level functions
// and do NOT need to be listed in useMemo dependency arrays.
const getPetName = (pet) => pet?.name || pet?.pet_name || "Unnamed Pet";
const getPetSpecies = (pet) => pet?.species || pet?.type || pet?.pet_species || "Pet";
const getPetBreed = (pet) => pet?.breed || pet?.pet_breed || "No breed";
const getPetBirthdate = (pet) => pet?.birthdate || pet?.birth_date || pet?.date_of_birth || "";
const normalizePetGender = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "male") return "Male";
  if (normalized === "female") return "Female";
  return "";
};
const getPetGender = (pet) => normalizePetGender(pet?.gender || pet?.sex || pet?.pet_gender) || "N/A";
const getPetAge = (pet) => {
  const birthdate = getPetBirthdate(pet);
  if (!birthdate) return "N/A";
  const birth = new Date(`${String(birthdate).slice(0, 10)}T00:00:00`);
  const today = new Date();
  if (Number.isNaN(birth.getTime()) || birth > today) return "N/A";
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age <= 0 ? "Less than 1 year" : `${age} ${age === 1 ? "year" : "years"}`;
};
const getPetNotes = (pet) =>
  pet?.notes || pet?.medical_notes || pet?.special_needs || "No medical notes or special needs recorded.";
const formatDate = (value) => {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
};
const normalizeMedicalRecord = (record, index) => ({
  id: record?.id || index + 1,
  date: record?.date || record?.visit_date || record?.appointment_date || record?.created_at || "",
  title: record?.title || record?.service_name || record?.service_type || record?.type || "Medical Record",
  diagnosis: record?.diagnosis || record?.condition || "No diagnosis stated.",
  symptoms: record?.symptoms || "No symptoms recorded.",
  treatment: record?.treatment || record?.procedure || record?.medical_notes || "No treatment stated.",
});

const PetFormFields = ({ formData, formErrors, previewImage, handleChange, speciesOptions, breedOptions, nameInputRef, idPrefix }) => (
  <>
    <label className="pet-image-upload-label">
      Pet Photo
      <div className="pet-image-preview-wrapper">
        {previewImage ? (
          <img src={previewImage} alt="Pet preview" className="pet-image-preview" />
        ) : (
          <span className="pet-image-placeholder"><FaCamera /></span>
        )}
        <input
          type="file"
          name="image"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleChange}
          className="pet-image-input"
          aria-label="Pet Photo"
        />
      </div>
      {formErrors.image && <span className="field-error">{formErrors.image}</span>}
    </label>

    <label htmlFor={`${idPrefix}-name`}>
      Pet Name <small>*</small>
      <input
        ref={nameInputRef}
        id={`${idPrefix}-name`}
        name="name"
        placeholder="Example: Max"
        value={formData.name}
        onChange={handleChange}
        required
        aria-invalid={Boolean(formErrors.name)}
        aria-describedby={formErrors.name ? `${idPrefix}-name-error` : undefined}
        className={formErrors.name ? "input-error" : ""}
      />
      {formErrors.name && <span className="field-error" id={`${idPrefix}-name-error`}>{formErrors.name}</span>}
    </label>

    <label htmlFor={`${idPrefix}-species`}>
      Type of Pet <small>*</small>
      <select
        id={`${idPrefix}-species`}
        name="species"
        value={formData.species}
        onChange={handleChange}
        required
        aria-invalid={Boolean(formErrors.species)}
        aria-describedby={formErrors.species ? `${idPrefix}-species-error` : undefined}
        className={formErrors.species ? "input-error" : ""}
      >
        <option value="">Select type of pet</option>
        {speciesOptions.map((species) => <option key={species} value={species}>{species}</option>)}
      </select>
      {formErrors.species && <span className="field-error" id={`${idPrefix}-species-error`}>{formErrors.species}</span>}
    </label>

    {formData.species && (
      <label htmlFor={`${idPrefix}-breed`}>
        Breed <small>*</small>
        <select
          id={`${idPrefix}-breed`}
          name="breed"
          value={formData.breed}
          onChange={handleChange}
          required
          aria-invalid={Boolean(formErrors.breed)}
          aria-describedby={formErrors.breed ? `${idPrefix}-breed-error` : undefined}
          className={formErrors.breed ? "input-error" : ""}
        >
          <option value="">Select breed</option>
          {breedOptions.map((breed) => <option key={breed} value={breed}>{breed}</option>)}
        </select>
        {formErrors.breed && <span className="field-error" id={`${idPrefix}-breed-error`}>{formErrors.breed}</span>}
      </label>
    )}

    {isManualBreedRequired(formData.breed) && (
      <label htmlFor={`${idPrefix}-manual-breed`}>
        Breed Details <small>*</small>
        <input
          id={`${idPrefix}-manual-breed`}
          name="manualBreed"
          placeholder="Enter breed (e.g., mixed local, etc.)"
          value={formData.manualBreed}
          onChange={handleChange}
          required
          aria-invalid={Boolean(formErrors.manualBreed)}
          aria-describedby={formErrors.manualBreed ? `${idPrefix}-manual-breed-error` : undefined}
          className={formErrors.manualBreed ? "input-error" : ""}
        />
        {formErrors.manualBreed && <span className="field-error" id={`${idPrefix}-manual-breed-error`}>{formErrors.manualBreed}</span>}
      </label>
    )}

    <div className="pets-form-row">
      <label htmlFor={`${idPrefix}-birthdate`}>
        Birthdate
        <div className={formErrors.birthdate ? "datepicker-error-wrap" : ""}>
          <DatePickerInput
            id={`${idPrefix}-birthdate`}
            ariaLabel="Birthdate"
            selected={parseDateOnly(formData.birthdate)}
            onChange={(date) => handleChange({ target: { name: "birthdate", value: formatDateOnly(date) } })}
            placeholderText="mm/dd/yyyy"
            maxDate={new Date()}
          />
        </div>
        {formErrors.birthdate && <span className="field-error" id={`${idPrefix}-birthdate-error`}>{formErrors.birthdate}</span>}
      </label>

      <label htmlFor={`${idPrefix}-gender`}>
        Gender
        <select
          id={`${idPrefix}-gender`}
          name="gender"
          value={formData.gender}
          onChange={handleChange}
        >
          <option value="">Select gender</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
        </select>
      </label>
    </div>

    <label htmlFor={`${idPrefix}-notes`}>
      Medical Notes / Special Needs
      <textarea
        id={`${idPrefix}-notes`}
        name="notes"
        placeholder="Example: Allergies, medications, behavior notes..."
        value={formData.notes}
        onChange={handleChange}
      />
    </label>
  </>
);

const CustomerPets = () => {
  const { user } = useAuth();
  const customerEmail = user?.email || "";

  const [pets, setPets] = useState([]);
  const [archivedPets, setArchivedPets] = useState([]);
  const [formData, setFormData] = useState(() => initialForm(customerEmail));
  const [formErrors, setFormErrors] = useState({});
  const [addFormError, setAddFormError] = useState("");

  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  const [pageLoading, setPageLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [restoringId, setRestoringId] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [speciesFilter, setSpeciesFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("active");
  const [message, setMessage] = useState({ type: "", text: "" });

  const [selectedPet, setSelectedPet] = useState(null);
  const [medicalHistory, setMedicalHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const [previewImage, setPreviewImage] = useState(null);
  const previewImageRequest = useRef(0);
  const [addPetModalOpen, setAddPetModalOpen] = useState(false);
  const addPetTriggerRef = useRef(null);
  const addPetReturnFocusRef = useRef(null);
  const addPetNameInputRef = useRef(null);
  const [editingPet, setEditingPet] = useState(null);
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => () => {
    if (previewImage?.startsWith("blob:")) URL.revokeObjectURL(previewImage);
  }, [previewImage]);

  const showMessage = (type, text) => {
    setMessage({ type, text });

    window.clearTimeout(window.customerPetsMessageTimer);
    window.customerPetsMessageTimer = window.setTimeout(() => {
      setMessage({ type: "", text: "" });
    }, 3500);
  };

  const normalizeFullMedicalRecord = (record, index) => ({
    ...normalizeMedicalRecord(record, index),
    prescription: record?.prescription || "No prescription recorded.",
    notes: record?.notes || record?.remarks || record?.description || "",
    weight: record?.weight || "",
    temperature: record?.temperature || "",
    nextVisit: record?.next_visit_date || record?.follow_up_date || "",
    veterinarian:
      record?.veterinarian?.name ||
      record?.vet?.name ||
      record?.vet_name ||
      record?.doctor ||
      record?.handled_by ||
      "Veterinary Staff",
    status: record?.status || "completed",
  });

  const safeArray = (value) => {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.pets)) return value.pets;
    if (Array.isArray(value?.data)) return value.data;
    if (Array.isArray(value?.data?.data)) return value.data.data;
    if (Array.isArray(value?.records)) return value.records;
    if (Array.isArray(value?.result)) return value.result;
    if (Array.isArray(value?.results)) return value.results;
    if (Array.isArray(value?.history)) return value.history;
    if (Array.isArray(value?.medical_history)) return value.medical_history;
    if (Array.isArray(value?.medicalHistory)) return value.medicalHistory;
    if (Array.isArray(value?.appointments)) return value.appointments;
    return [];
  };

  const fetchPets = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setPageLoading(true);
      } else {
        setRefreshing(true);
      }

      let data = null;

      try {
        data = await apiRequest("/customer/pets");
      } catch {
        data = await apiRequest("/pets");
      }

      setPets(safeArray(data));
    } catch {
      setPets([]);
      showMessage("error", "Failed to load pets. Please refresh the page.");
    } finally {
      setPageLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchArchivedPets = useCallback(async () => {
    try {
      const data = await apiRequest("/customer/pets/archived");
      setArchivedPets(safeArray(data));
    } catch {
      setArchivedPets([]);
      showMessage("error", "Failed to load archived pets. Please refresh the page.");
    }
  }, []);

  useEffect(() => {
    fetchPets();
    fetchArchivedPets();
  }, [fetchPets, fetchArchivedPets]);

  const stats = useMemo(() => {
    const speciesCount = new Set(
      pets.map((pet) => getPetSpecies(pet)).filter(Boolean)
    ).size;

    const dogs = pets.filter((pet) =>
      String(getPetSpecies(pet)).toLowerCase().includes("dog")
    ).length;

    const cats = pets.filter((pet) =>
      String(getPetSpecies(pet)).toLowerCase().includes("cat")
    ).length;

    return {
      total: pets.length,
      speciesCount,
      dogs,
      cats,
    };
  }, [pets]);

  const speciesOptions = useMemo(() => {
    return getSpeciesOptions();
  }, []);

  const breedOptions = useMemo(() => {
    return getBreedOptions(formData.species);
  }, [formData.species]);

  const filteredPets = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    const currentPets = activeTab === "active" ? pets : archivedPets;

    return currentPets.filter((pet) => {
      const species = getPetSpecies(pet);

      const matchesSpecies =
        speciesFilter === "all" ||
        String(species).toLowerCase() === String(speciesFilter).toLowerCase();

      const searchableText = [
        getPetName(pet),
        getPetSpecies(pet),
        getPetBreed(pet),
        getPetAge(pet),
        getPetGender(pet),
        getPetNotes(pet),
        pet.archived_at ? formatDate(pet.archived_at) : "",
        pet.archived_reason || "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !keyword || searchableText.includes(keyword);

      return matchesSpecies && matchesSearch;
    });
  }, [pets, archivedPets, searchTerm, speciesFilter, activeTab]);

  const validateForm = () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = "Pet name is required.";
    if (!formData.species) errors.species = "Please select type of pet.";
    if (!formData.breed) errors.breed = "Please select pet breed.";
    if (isManualBreedRequired(formData.breed) && !formData.manualBreed?.trim()) {
      errors.manualBreed = "Please specify the breed.";
    }
    if (formData.birthdate) {
      const selectedBirthdate = new Date(`${formData.birthdate}T00:00:00`);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (Number.isNaN(selectedBirthdate.getTime())) {
        errors.birthdate = "Please enter a valid birthdate.";
      } else if (selectedBirthdate > today) {
        errors.birthdate = "Birthdate cannot be in the future.";
      }
    }
    setFormErrors(errors);
    return Object.keys(errors).length > 0 ? Object.values(errors)[0] : "";
  };

  const handleChange = (event) => {
    const { name, value, type, files } = event.target;

    if (type === "file" && files && files[0]) {
      const file = files[0];
      const extension = String(file.name || "").split(".").pop().toLowerCase();
      const looksLikeImage =
        PET_IMAGE_TYPES.includes(file.type) ||
        (!file.type && PET_IMAGE_EXTENSIONS.includes(extension));

      if (!looksLikeImage) {
        setFormErrors((prev) => ({
          ...prev,
          image: "Photo must be a JPG, PNG, or WebP image. iPhone HEIC photos can't be uploaded — take a screenshot or share the photo as JPEG instead.",
        }));
        setFormData((prev) => ({ ...prev, image: null }));
        setPreviewImage(null);
        return;
      }

      if (file.size > PET_IMAGE_MAX_BYTES) {
        setFormErrors((prev) => ({
          ...prev,
          image: "Photo is too large — please choose an image under 10 MB.",
        }));
        setFormData((prev) => ({ ...prev, image: null }));
        setPreviewImage(null);
        return;
      }

      previewImageRequest.current += 1;
      setFormData((prev) => ({ ...prev, image: file }));
      setPreviewImage(URL.createObjectURL(file));
      setFormErrors((prev) => ({ ...prev, image: undefined }));
      if (message.text) setMessage({ type: "", text: "" });
      setAddFormError("");
      return;
    }

    // If species changes, reset breed and manual values
    if (name === "species") {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
        breed: "",
        manualBreed: "",
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }

    if (message.text) setMessage({ type: "", text: "" });
    setAddFormError("");
    if (formErrors[name]) {
      setFormErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const resetForm = useCallback(() => {
    previewImageRequest.current += 1;
    setFormData(initialForm(customerEmail));
    setFormErrors({});
    setAddFormError("");
    setPreviewImage(null);
  }, [customerEmail]);

  const openAddPetModal = useCallback((event) => {
    if (loading) return;
    addPetReturnFocusRef.current = event?.currentTarget || addPetTriggerRef.current;
    resetForm();
    setMessage({ type: "", text: "" });
    setAddPetModalOpen(true);
  }, [loading, resetForm]);

  const closeAddPetModal = useCallback(() => {
    setAddPetModalOpen(false);
    resetForm();
    setMessage({ type: "", text: "" });
    const returnFocusElement = addPetReturnFocusRef.current || addPetTriggerRef.current;
    window.requestAnimationFrame(() => returnFocusElement?.focus());
  }, [resetForm]);

  useEffect(() => {
    if (!addPetModalOpen) return undefined;
    const focusFrame = window.requestAnimationFrame(() => addPetNameInputRef.current?.focus());
    return () => window.cancelAnimationFrame(focusFrame);
  }, [addPetModalOpen]);

  const buildPetPayload = (data) => ({
    name: data.name?.trim(),
    species: data.species,
    breed: isManualBreedRequired(data.breed) && data.manualBreed?.trim()
      ? data.manualBreed.trim()
      : data.breed,
    birthdate: normalizeDateString(data.birthdate) || null,
    birth_date: normalizeDateString(data.birthdate) || null,
    gender: data.gender || null,
    notes: data.notes?.trim() || null,
    customer_email: customerEmail,
  });

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;

    const validationError = validateForm();

    if (validationError) {
      setAddFormError(validationError);
      showMessage("error", validationError);
      return;
    }

    try {
      setAddFormError("");
      setLoading(true);

      let body;
      const payload = buildPetPayload(formData);

      if (formData.image) {
        const formDataObj = new FormData();
        Object.entries(payload).forEach(([key, value]) => {
          if (value !== null && value !== undefined) {
            formDataObj.append(key, value);
          }
        });
        formDataObj.append("image", formData.image);
        body = formDataObj;
      } else {
        body = JSON.stringify(payload);
      }

      const data = await apiRequest("/customer/pets", {
        method: "POST",
        body,
      });

      addPetReturnFocusRef.current = addPetTriggerRef.current;
      closeAddPetModal();
      await fetchPets({ silent: true });
      showMessage("success", data?.message || "Pet added successfully.");
    } catch (error) {
      const errorMessage =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        "Failed to add pet. Please try again.";

      setAddFormError(errorMessage);
      showMessage("error", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const normalizeDateString = (value) => {
    if (!value) return "";
    const parsed = parseDateOnly(value) || new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    return formatDateOnly(parsed);
  };

  const handleEditClick = async (pet) => {
    const requestId = ++previewImageRequest.current;
    setEditingPet(pet);
    setFormData({
      name: pet?.name || "",
      species: pet?.species || "",
      breed: pet?.breed || "",
      manualBreed: "",
      birthdate: normalizeDateString(getPetBirthdate(pet)),
      gender: normalizePetGender(pet?.gender || pet?.sex || pet?.pet_gender),
      notes: pet?.notes || "",
      customer_email: customerEmail,
      image: null,
    });

    const imageUrl = pet?.image_url || pet?.image || null;
    setPreviewImage(null);
    if (imageUrl?.includes("/api/files/pet-photos/")) {
      try {
        const blobUrl = await getAuthenticatedFileUrl(imageUrl);
        if (previewImageRequest.current === requestId) setPreviewImage(blobUrl);
        else URL.revokeObjectURL(blobUrl);
      } catch {
        if (previewImageRequest.current === requestId) setPreviewImage(null);
      }
      return;
    }
    setPreviewImage(resolveImageUrl(imageUrl));
  };

  const closeEditModal = () => {
    setEditingPet(null);
    resetForm();
  };

  const handleUpdatePet = async (event) => {
    event.preventDefault();

    const validationError = validateForm();

    if (validationError) {
      showMessage("error", validationError);
      return;
    }

    try {
      setEditLoading(true);

      let body;
      const payload = buildPetPayload(formData);

      const formDataObj = new FormData();
      Object.entries(payload).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          formDataObj.append(key, value);
        }
      });
      if (formData.image) {
        formDataObj.append("image", formData.image);
      }
      formDataObj.append("_method", "PUT");
      body = formDataObj;

      const data = await apiRequest(`/customer/pets/${editingPet.id}`, {
        method: "POST",
        body,
      });

      closeEditModal();
      await fetchPets({ silent: true });
      showMessage("success", data?.message || "Pet updated successfully.");
    } catch (error) {
      const errorMessage =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        "Failed to update pet. Please try again.";

      showMessage("error", errorMessage);
    } finally {
      setEditLoading(false);
    }
  };

  const handleArchive = async (id) => {
    if (
      !(await showConfirm(
        "Archive this pet? It will no longer appear in booking forms, but previous records will remain available."
      ))
    ) {
      return;
    }

    try {
      setDeletingId(id);

      await apiRequest(`/customer/pets/${id}/archive`, {
        method: "POST",
        body: JSON.stringify({
          archive_reason: "Customer request",
        }),
      });

      await fetchPets({ silent: true });
      await fetchArchivedPets();
      showMessage("success", "Pet archived successfully.");
    } catch (error) {
      const errorMessage =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        "Failed to archive pet. Please try again.";

      showMessage("error", errorMessage);
    } finally {
      setDeletingId(null);
    }
  };

  const handleUnarchive = async (id) => {
    if (!(await showConfirm("Restore this pet to your active pets list?"))) {
      return;
    }

    try {
      setRestoringId(id);

      await apiRequest(`/customer/pets/${id}/unarchive`, {
        method: "POST",
      });

      await fetchPets({ silent: true });
      await fetchArchivedPets();
      showMessage("success", "Pet restored successfully.");
    } catch (error) {
      const errorMessage =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        "Failed to restore pet. Please try again.";

      showMessage("error", errorMessage);
    } finally {
      setRestoringId(null);
    }
  };

  const fetchMedicalHistory = async (pet) => {
    setSelectedPet(pet);
    setMedicalHistory([]);
    setHistoryError("");
    setHistoryLoading(true);

    const petId = pet?.id || pet?.pet_id;

    try {
      const result = await apiRequest(`/customer/pets/${petId}/medical-history`);
      const records = safeArray(result).map(normalizeFullMedicalRecord);
      setMedicalHistory(records);
    } catch {
      setHistoryError(
        "Medical history is not available yet, or no records were found for this pet."
      );
      setMedicalHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const closeMedicalHistory = () => {
    setSelectedPet(null);
    setMedicalHistory([]);
    setHistoryError("");
    setHistoryLoading(false);
  };

  const handleRefresh = () => {
    fetchPets({ silent: true });
  };

  if (pageLoading) {
    return (
      <section className="customer-pets">
        <div className="pets-loading-state">
          <FaSyncAlt className="spin" />
          <h3>Loading your pets...</h3>
          <p>Please wait while we prepare your pet records.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="customer-pets">
      {message.text && !addPetModalOpen && (
        <div className={`pets-toast ${message.type}`}>
          {message.type === "success" ? <FaPaw /> : <FaExclamationTriangle />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="pets-toolbar pets-top-toolbar">
        <button
          ref={addPetTriggerRef}
          className="pets-add-trigger"
          type="button"
          onClick={openAddPetModal}
          disabled={loading}
        >
          <FaPlus />
          Add New Pet
        </button>
        <button
          className={`pets-refresh-btn ${refreshing ? "refreshing" : ""}`}
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <FaSyncAlt />
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="pets-stats-grid">
        <article className="pets-stat-card">
          <span>
            <FaPaw />
          </span>
          <div>
            <strong>{stats.total}</strong>
            <p>Total Pets</p>
          </div>
        </article>

        <article className="pets-stat-card">
          <span>
            <FaNotesMedical />
          </span>
          <div>
            <strong>{stats.speciesCount}</strong>
            <p>Pet Types</p>
          </div>
        </article>

        <article className="pets-stat-card">
          <span>
            <FaDog />
          </span>
          <div>
            <strong>{stats.dogs}</strong>
            <p>Dogs</p>
          </div>
        </article>

        <article className="pets-stat-card">
          <span>
            <FaCat />
          </span>
          <div>
            <strong>{stats.cats}</strong>
            <p>Cats</p>
          </div>
        </article>
      </div>

      <div className="pets-layout">
        <div className="pets-card pets-list-card">
          <div className="pets-card-header">
            <div>
              <h2>My Pets</h2>
              <div className="pets-tabs">
                <button
                  className={`tab-button ${activeTab === "active" ? "active" : ""}`}
                  onClick={() => setActiveTab("active")}
                >
                  <FaPaw />
                  Active Pets ({pets.length})
                </button>
                <button
                  className={`tab-button ${activeTab === "archived" ? "active" : ""}`}
                  onClick={() => setActiveTab("archived")}
                >
                  <FaArchive />
                  Archived Pets ({archivedPets.length})
                </button>
              </div>
              <p>Search, manage, and view veterinary medical history.</p>
            </div>
          </div>

          <div className="pets-toolbar">
            <div className="pets-search-box">
              <input
                type="text"
                placeholder="Search pet, type of pet, breed, notes..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />

              {searchTerm && (
                <button type="button" onClick={() => setSearchTerm("")}>
                  <FaTimes />
                </button>
              )}
            </div>

            <select
              className="pets-filter-select"
              value={speciesFilter}
              onChange={(event) => setSpeciesFilter(event.target.value)}
            >
              <option value="all">All Pet Types</option>
              {speciesOptions.map((species) => (
                <option key={species} value={species}>
                  {species}
                </option>
              ))}
            </select>
          </div>

          {filteredPets.length === 0 ? (
            <div className="pets-empty-state">
              <FaPaw />
              <h3>{searchTerm || speciesFilter !== "all" ? "No pets match your search" : "No pets yet"}</h3>
              <p>
                {searchTerm || speciesFilter !== "all"
                  ? "Try adjusting your search or filter to find what you're looking for."
                  : "Your furry friends will appear here. Add your first pet to get started."}
              </p>
              {activeTab === "active" && pets.length === 0 && !searchTerm && speciesFilter === "all" && (
                <button className="pets-add-empty-btn" type="button" onClick={openAddPetModal}>
                  <FaPlus /> Add your first pet
                </button>
              )}
            </div>
          ) : (
            <div className="pets-list">
              {filteredPets.map((pet, index) => (
                <article
                  className="pet-item"
                  key={pet.id}
                  style={{ animationDelay: `${index * 0.06}s` }}
                >
                  <PetAvatar pet={pet} size={72} className="pet-avatar" />

                  <div className="pet-info">
                    <div className="pet-title-row">
                      <div>
                        <h3>{getPetName(pet)}</h3>
                        <p>
                          {getPetSpecies(pet)} • {getPetBreed(pet)}
                        </p>
                      </div>

                      <span className="pet-species-badge">
                        {getPetSpecies(pet)}
                        {activeTab === "archived" && (
                          <span className="archived-badge">Archived</span>
                        )}
                      </span>
                    </div>

                    <div className="pet-detail-grid">
                      <span>
                        <FaUserAlt />
                        Age: {getPetAge(pet)}
                      </span>

                      <span>
                        <FaCalendarAlt />
                        Birthdate: {getPetBirthdate(pet) ? formatDate(getPetBirthdate(pet)) : "N/A"}
                      </span>

                      <span>
                        <FaVenusMars />
                        Gender: {getPetGender(pet)}
                      </span>

                      {activeTab === "archived" && pet.archived_at && (
                        <span>
                          <FaCalendarAlt />
                          Archived: {formatDate(pet.archived_at)}
                        </span>
                      )}

                      {activeTab === "archived" && pet.archived_reason && (
                        <span>
                          <FaArchive />
                          Reason: {pet.archived_reason}
                        </span>
                      )}
                    </div>

                    <small>{getPetNotes(pet)}</small>

                    <div className="pet-actions-row">
                      <button
                        className="pet-history-btn"
                        type="button"
                        onClick={() => fetchMedicalHistory(pet)}
                      >
                        <FaFileMedical />
                        {activeTab === "archived" ? "View History" : "Medical History"}
                      </button>

                      {activeTab === "active" && (
                        <>
                          <button
                            className="pet-edit-btn"
                            type="button"
                            onClick={() => handleEditClick(pet)}
                          >
                            <FaEdit />
                            Edit
                          </button>
                          <button
                            className="pet-archive-btn"
                            type="button"
                            onClick={() => handleArchive(pet.id)}
                            disabled={deletingId === pet.id}
                          >
                            <FaArchive />
                            {deletingId === pet.id ? "Archiving..." : "Archive"}
                          </button>
                        </>
                      )}

                      {activeTab === "archived" && (
                        <button
                          className="pet-archive-btn"
                          type="button"
                          onClick={() => handleUnarchive(pet.id)}
                          disabled={restoringId === pet.id}
                        >
                          <FaSyncAlt />
                          {restoringId === pet.id ? "Restoring..." : "Restore Pet"}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      {addPetModalOpen && (
        <Modal
          onClose={closeAddPetModal}
          closeOnBackdrop={!loading}
          title="Add a new pet"
          subtitle="Register a pet so you can select them in bookings and keep their care details together."
          icon={<FaPaw />}
          size="lg"
          className="pets-add-modal"
          footer={
            <>
              <button
                className="pets-reset-btn"
                type="button"
                onClick={closeAddPetModal}
                disabled={loading}
              >
                Cancel
              </button>
              <button className="pets-submit-btn" type="submit" form="add-pet-form" disabled={loading}>
                {loading ? <><FaSyncAlt className="spin" /> Saving...</> : <><FaPlus /> Add Pet</>}
              </button>
            </>
          }
        >
            <form id="add-pet-form" className="pets-form pets-add-modal-form" onSubmit={handleSubmit} noValidate>
              <div className="pets-add-modal-body">
                {addFormError && (
                  <div className="pets-add-modal-error" role="alert">
                    <FaExclamationTriangle />
                    <span>{addFormError}</span>
                  </div>
                )}
                <PetFormFields
                  formData={formData}
                  formErrors={formErrors}
                  previewImage={previewImage}
                  handleChange={handleChange}
                  speciesOptions={speciesOptions}
                  breedOptions={breedOptions}
                  nameInputRef={addPetNameInputRef}
                  idPrefix="add-pet"
                />
              </div>
            </form>
        </Modal>
      )}

      {editingPet && (
        <Modal
          onClose={closeEditModal}
          title={getPetName(editingPet)}
          subtitle={`Edit Pet — ${getPetSpecies(editingPet)} • ${getPetBreed(editingPet)}`}
          icon={<FaEdit />}
          size="lg"
          className="pet-history-modal"
          footer={
            <>
              <button
                type="button"
                className="pets-reset-btn"
                onClick={closeEditModal}
              >
                Cancel
              </button>

              <button
                type="submit"
                form="edit-pet-form"
                className="pets-submit-btn"
                disabled={editLoading}
              >
                {editLoading ? "Saving..." : "Update Pet"}
              </button>
            </>
          }
        >
            <div className="pet-history-body">
              <form id="edit-pet-form" className="pets-form" onSubmit={handleUpdatePet}>
                <PetFormFields
                  formData={formData}
                  formErrors={formErrors}
                  previewImage={previewImage}
                  handleChange={handleChange}
                  speciesOptions={speciesOptions}
                  breedOptions={breedOptions}
                  idPrefix="edit-pet"
                />
              </form>
            </div>
        </Modal>
      )}

      {selectedPet && (
        <Modal
          onClose={closeMedicalHistory}
          title={`${getPetName(selectedPet)} Medical History`}
          subtitle={`Synced Veterinary Record — ${getPetSpecies(selectedPet)} • ${getPetBreed(selectedPet)}`}
          icon={<FaHeartbeat />}
          size="lg"
          className="pet-history-modal"
        >
            <div className="pet-history-body">
              {historyLoading ? (
                <div className="pet-history-state">
                  <FaSyncAlt className="spin" />
                  <h3>Loading medical history...</h3>
                  <p>Please wait while we load veterinary records.</p>
                </div>
              ) : historyError ? (
                <div className="pet-history-state warning">
                  <FaExclamationTriangle />
                  <h3>Medical history unavailable</h3>
                  <p>{historyError}</p>
                </div>
              ) : medicalHistory.length === 0 ? (
                <div className="pet-history-state">
                  <FaStethoscope />
                  <h3>No medical history yet</h3>
                  <p>
                    Records added by the veterinary team will appear here once available.
                  </p>
                </div>
              ) : (
                <div className="pet-history-timeline">
                  {medicalHistory.map((record) => (
                    <article className="pet-history-item" key={record.id}>
                      <div className="pet-history-date">
                        <FaCalendarAlt />
                        <span>{formatDate(record.date)}</span>
                      </div>

                      <div className="pet-history-content">
                        <div className="pet-history-title-row">
                          <div>
                            <h3>{record.title}</h3>
                            <p>Handled by {record.veterinarian}</p>
                          </div>

                          <span className="pet-history-status">
                            {record.status}
                          </span>
                        </div>

                        <div className="pet-history-grid">
                          <div>
                            <small>Diagnosis</small>
                            <strong>{record.diagnosis}</strong>
                          </div>

                          <div>
                            <small>Symptoms</small>
                            <strong>{record.symptoms}</strong>
                          </div>

                          <div>
                            <small>Treatment</small>
                            <strong>{record.treatment}</strong>
                          </div>

                          <div>
                            <small>Prescription</small>
                            <strong>{record.prescription}</strong>
                          </div>

                          <div>
                            <small>Weight</small>
                            <strong>{record.weight ? `${record.weight} kg` : "N/A"}</strong>
                          </div>

                          <div>
                            <small>Temperature</small>
                            <strong>
                              {record.temperature ? `${record.temperature} °C` : "N/A"}
                            </strong>
                          </div>

                          <div>
                            <small>Next Visit</small>
                            <strong>{record.nextVisit ? formatDate(record.nextVisit) : "N/A"}</strong>
                          </div>
                        </div>

                        {record.notes && (
                          <div className="pet-history-notes">
                            <FaNotesMedical />
                            <span>{record.notes}</span>
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
        </Modal>
      )}
    </section>
  );
};

export default CustomerPets;
