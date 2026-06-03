import { useCallback, useEffect, useMemo, useState } from "react";
import "./CustomerBookings.css";
import { apiRequest } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { showWarning, showSuccess, showError } from "../../utils/alert";
import PetAvatar from "../shared/PetAvatar";
import DatePickerInput from "../shared/DatePickerInput";
import {
  FaCalendarCheck,
  FaCheckCircle,
  FaClock,
  FaCut,
  FaHotel,
  FaPaw,
  FaReceipt,
  FaSearch,
  FaStethoscope,
  FaTimes,
  FaUpload,
  FaUser,
  FaWallet,
  FaExclamationTriangle,
  FaSyncAlt,
  FaClipboardList,
  FaHeartbeat,
  FaPlus,
} from "react-icons/fa";

const fallbackVetServices = [
  { name: "General Consultation", category: "Veterinary", price: 500, description: "General health checkup and consultation." },
  { name: "Vaccination", category: "Veterinary", price: 750, description: "Pet vaccination service." },
  { name: "Deworming", category: "Veterinary", price: 350, description: "Deworming and parasite prevention." },
  { name: "Laboratory Test", category: "Veterinary", price: 1200, description: "Basic laboratory test request." },
];

const fallbackGroomingServices = [
  { name: "Basic Bath", category: "Grooming", price: 500, description: "Bath, blow dry, and basic coat cleaning." },
  { name: "Full Grooming Package", category: "Grooming", price: 1500, description: "Bath, haircut, nail trim, ear cleaning, and finishing." },
  { name: "Haircut Only", category: "Grooming", price: 800, description: "Breed-appropriate haircut or trimming." },
  { name: "Nail Trim", category: "Grooming", price: 200, description: "Safe nail trimming for pets." },
  { name: "Teeth Cleaning", category: "Grooming", price: 350, description: "Basic pet teeth cleaning." },
];

const initialVetInfo = {
  has_flu_symptoms: "no",
  symptoms: [],
  other_symptoms: "",
  symptom_duration: "",
  appetite: "",
  energy_level: "",
  temperature_concern: "",
  medication_taken: "",
  recent_exposure: "",
  emergency_level: "normal",
};

const symptomOptions = [
  "Coughing",
  "Sneezing",
  "Runny nose",
  "Fever",
  "Vomiting",
  "Diarrhea",
  "Loss of appetite",
  "Low energy",
  "Eye discharge",
  "Skin irritation",
  "Limping",
  "Breathing difficulty",
];

const CustomerBookings = () => {
  const { user } = useAuth();
  const customerEmail = user?.email || "";
  const customerName = user?.name || "Customer";

  const [selectedBooking, setSelectedBooking] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  const [bookings, setBookings] = useState([]);
  const [vetServices, setVetServices] = useState([]);
  const [groomingServices, setGroomingServices] = useState([]);
  const [pets, setPets] = useState([]);

  const [loading, setLoading] = useState(true);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [petsLoading, setPetsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [veterinaryAvailability, setVeterinaryAvailability] = useState(null);
  const [groomingAvailability, setGroomingAvailability] = useState(null);
  const [boardingAvailability, setBoardingAvailability] = useState(null);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState("");
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [selectedRoomType, setSelectedRoomType] = useState("");

  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showVetHealthInfo, setShowVetHealthInfo] = useState(false);

  const [formData, setFormData] = useState({
    customer_name: customerName,
    customer_email: customerEmail,
    pet_id: "",
    pet_name: "",
    service_type: "",
    service_name: "",
    request_date: "",
    request_time: "",
    check_out_date: "",
    notes: "",
    vet_info: initialVetInfo,
  });

  const safeArray = (value) => {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.data)) return value.data;
    if (Array.isArray(value?.data?.data)) return value.data.data;
    if (Array.isArray(value?.services)) return value.services;
    if (Array.isArray(value?.requests)) return value.requests;
    if (Array.isArray(value?.pets)) return value.pets;
    if (Array.isArray(value?.records)) return value.records;
    if (Array.isArray(value?.result)) return value.result;
    if (Array.isArray(value?.results)) return value.results;
    return [];
  };

  const getPetName = (pet) => pet?.name || pet?.pet_name || "Unnamed Pet";
  const getPetType = (pet) => pet?.species || pet?.type || pet?.pet_type || "Pet";
  const getPetBreed = (pet) => pet?.breed || "Unknown breed";

  const calculateAge = (birthdate) => {
    if (!birthdate) return null;
    const today = new Date();
    const birth = new Date(birthdate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    if (age <= 0) return "Less than 1 year";
    return `${age} year${age > 1 ? "s" : ""}`;
  };

  const getPetAge = (pet) => {
    const birthdate = pet?.birthdate || pet?.birth_date || pet?.date_of_birth;
    if (birthdate) {
      return calculateAge(birthdate);
    }
    return pet?.age || pet?.pet_age || "N/A";
  };

  const getPetBirthdate = (pet) => pet?.birthdate || pet?.birth_date || pet?.date_of_birth;
  const getPetWeight = (pet) => pet?.weight || pet?.pet_weight || "N/A";

  // Helper functions for hotel booking data
  const getBoardingCheckIn = (item) =>
    item.check_in ||
    item.check_in_date ||
    item.start_date ||
    item.request_date ||
    "";

  const getBoardingCheckOut = (item) =>
    item.check_out ||
    item.check_out_date ||
    item.end_date ||
    "";

  const getBoardingRoomName = (item) =>
    item.room_name ||
    item.room?.room_name ||
    item.hotel_room?.room_name ||
    item.hotelRoom?.room_name ||
    item.roomReservation?.room?.room_name ||
    item.room_reservation?.room?.room_name ||
    "Pet Hotel Room";

  const getBoardingRoomType = (item) =>
    item.room_type ||
    item.room?.room_type ||
    item.hotel_room?.room_type ||
    item.hotelRoom?.room_type ||
    item.roomReservation?.room?.room_type ||
    item.room_reservation?.room?.room_type ||
    "";

  const getBoardingPetName = (item) =>
    item.pet_name ||
    item.pet?.name ||
    item.pet?.pet_name ||
    "Unknown Pet";

  const selectedPet = useMemo(() => {
    return pets.find((pet) => String(pet.id) === String(formData.pet_id));
  }, [pets, formData.pet_id]);

  const normalizeText = (value) => {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "_");
  };

  const getSpeciesRoomTypeOptions = useCallback((pet) => {
    const species = normalizeText(getPetType(pet));

    if (species === "dog") {
      return [
        { value: "", label: "All Compatible Rooms" },
        { value: "dog_standard", label: "Standard Kennel" },
        { value: "dog_large", label: "Large Kennel" },
        { value: "dog_family", label: "Family Suite" },
      ];
    }

    if (species === "cat") {
      return [
        { value: "", label: "All Compatible Rooms" },
        { value: "cat_condo", label: "Cat Condo" },
        { value: "cat_suite", label: "Cat Suite" },
      ];
    }

    if (species === "bird") {
      return [
        { value: "", label: "All Compatible Rooms" },
        { value: "small_pet", label: "Small Pet Enclosure" },
      ];
    }

    return [
      { value: "", label: "All Compatible Rooms" },
    ];
  }, []);

  const activeRoomTypeOptions = useMemo(() => {
    return getSpeciesRoomTypeOptions(selectedPet);
  }, [selectedPet, getSpeciesRoomTypeOptions]);

  const formatCurrency = (value) => {
    const number = Number(value || 0);

    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      minimumFractionDigits: 0,
    }).format(number);
  };

  const formatDate = (value) => {
    if (!value) return "No date";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const normalizeStatus = (status) =>
    String(status || "pending").toLowerCase().replace(/\s+/g, "_");

  const getBookingTypeMeta = (type) => {
    const value = String(type || "").toLowerCase();

    if (value === "hotel") {
      return {
        id: "Hotel",
        type: "hotel",
        icon: <FaHotel />,
        title: "Pet Hotel",
        shortTitle: "Hotel",
        description: "Reserve a comfortable stay for your pet.",
        defaultService: "",
        accent: "hotel",
      };
    }

    if (value === "vet") {
      return {
        id: "Vet",
        type: "vet",
        icon: <FaStethoscope />,
        title: "Veterinary",
        shortTitle: "Vet",
        description: "Book checkups, vaccines, and pet medical care services.",
        defaultService: "General Consultation",
        accent: "vet",
      };
    }

    return {
      id: "Groom",
      type: "grooming",
      icon: <FaCut />,
      title: "Grooming",
      shortTitle: "Groom",
      description: "Schedule grooming and hygiene services.",
      defaultService: "Basic Bath",
      accent: "grooming",
    };
  };

  const bookingTypes = useMemo(
    () => [
      getBookingTypeMeta("hotel"),
      getBookingTypeMeta("vet"),
      getBookingTypeMeta("grooming"),
    ],
    []
  );

  const serviceOptions = useMemo(() => {
    if (selectedBooking === "Hotel") return [];
    if (selectedBooking === "Vet") return vetServices.length > 0 ? vetServices : fallbackVetServices;
    if (selectedBooking === "Groom") return groomingServices.length > 0 ? groomingServices : fallbackGroomingServices;
    return [];
  }, [selectedBooking, vetServices, groomingServices]);

  const selectedService = useMemo(() => {
    return serviceOptions.find(
      (service) => String(service.name) === String(formData.service_name)
    );
  }, [serviceOptions, formData.service_name]);

  const getPetSize = (pet) =>
    String(
      pet?.size ||
        pet?.pet_size ||
        pet?.weight_category ||
        pet?.category ||
        ""
    ).toLowerCase();

  const getRoomType = (room) =>
    normalizeText(room?.room_type || room?.type || room?.category || room?.name);

  const getRoomDisplayName = (room) =>
    room?.room_name || room?.name || room?.label || `Room #${room?.id || ""}`;

  const getRoomCapacity = (room) =>
    room?.capacity || room?.max_capacity || room?.size || "1 pet";

  const getDailyRate = (room) =>
    Number(room?.daily_rate || room?.rate || room?.price || room?.amount || 0);

  const isUnsupportedBoardingPet = (pet) => {
    const species = normalizeText(getPetType(pet));
    return species === "fish" || species === "reptile";
  };

  const getUnsupportedBoardingMessage = (pet) => {
    const species = getPetType(pet);
    return `${species} cannot be accommodated in Pet Hotel rooms. Please contact staff for special arrangements.`;
  };

  const isRoomCompatibleWithPet = (room, pet) => {
    if (!pet || !room) return false;

    const species = normalizeText(getPetType(pet));
    const roomType = getRoomType(room);

    if (species === "dog") {
      return (
        roomType.includes("kennel") ||
        roomType.includes("dog") ||
        roomType.includes("family_suite")
      );
    }

    if (species === "cat") {
      return (
        roomType.includes("cat") ||
        roomType.includes("cattery") ||
        roomType.includes("condo") ||
        roomType.includes("suite")
      );
    }

    if (species === "bird") {
      return (
        roomType.includes("bird") ||
        roomType.includes("cage") ||
        roomType.includes("small_pet")
      );
    }

    return false;
  };

  const calculateBoardingDays = () => {
    if (!formData.request_date || !formData.check_out_date) return 0;

    const checkIn = new Date(`${formData.request_date}T00:00:00`);
    const checkOut = new Date(`${formData.check_out_date}T00:00:00`);

    if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) return 0;

    return Math.max(1, Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24)));
  };

  const getCompatibleRooms = () => {
    const rooms = safeArray(boardingAvailability?.rooms || boardingAvailability?.data || []);

    if (!selectedPet) return [];

    return rooms.filter((room) => {
      const roomType = getRoomType(room);
      const matchesCompatibility = isRoomCompatibleWithPet(room, selectedPet);

      const matchesFilter = selectedRoomType
        ? roomType === selectedRoomType || roomType.includes(selectedRoomType)
        : true;

      return matchesCompatibility && matchesFilter;
    });
  };

  const calculateHotelTotal = () => {
    if (!selectedRoom) return 0;

    const numberOfDays = calculateBoardingDays();
    const roomSubtotal = getDailyRate(selectedRoom) * numberOfDays;
    return roomSubtotal;
  };

  const fetchCustomerPets = useCallback(async () => {
    try {
      setPetsLoading(true);

      let petsData = null;

      try {
        petsData = await apiRequest("/customer/pets");
      } catch {
        petsData = await apiRequest("/pets");
      }

      setPets(safeArray(petsData));
    } catch {
      setPets([]);
    } finally {
      setPetsLoading(false);
    }
  }, []);

  const fetchVetServices = useCallback(async () => {
    try {
      setServicesLoading(true);

      const data = await apiRequest("/services");
      const services = safeArray(data);

      const normalizedServices = services
        .map((service) => ({
          name: service.name || service.service_name || service.title || "",
          category: service.category || service.service_type || "Veterinary",
          price: Number(service.price || service.amount || service.fee || 0),
          description: service.description || service.notes || "",
        }))
        .filter((service) => service.name);

      const veterinaryKeywords = [
        "vet",
        "veterinary",
        "clinic",
        "consultation",
        "vaccination",
        "vaccine",
        "laboratory",
        "laboratories",
        "deworm",
        "checkup",
        "medical",
      ];

      const veterinaryServices = normalizedServices.filter((service) => {
        const text = `${service.name} ${service.category}`.toLowerCase();
        return veterinaryKeywords.some((keyword) => text.includes(keyword));
      });

      setVetServices(veterinaryServices.length > 0 ? veterinaryServices : fallbackVetServices);
    } catch (error) {
      setVetServices(fallbackVetServices);
    } finally {
      setServicesLoading(false);
    }
  }, []);

  const fetchGroomingServices = useCallback(async () => {
    try {
      setServicesLoading(true);
      const data = await apiRequest("/customer/services");
      const services = safeArray(data);
      const grooming = services
        .map((s) => ({
          name: s.name || s.service_name || "",
          category: s.category || "Grooming",
          price: Number(s.price || s.amount || 0),
          description: s.description || "",
        }))
        .filter((s) => s.name && ["grooming", "daycare"].includes((s.category || "").toLowerCase()));
      setGroomingServices(grooming.length > 0 ? grooming : fallbackGroomingServices);
    } catch {
      setGroomingServices(fallbackGroomingServices);
    } finally {
      setServicesLoading(false);
    }
  }, []);

  const fetchBookings = useCallback(
    async ({ silent = false } = {}) => {
      try {
        if (!silent) {
          setLoading(true);
        } else {
          setRefreshing(true);
        }

        const [requestsResult, boardingsResult] = await Promise.allSettled([
          apiRequest("/customer/service-requests"),
          apiRequest("/customer/boarding-requests"),
        ]);

        let allBookings = [];

        if (requestsResult.status === "fulfilled") {
          const requestsData = safeArray(requestsResult.value);
          const normalizedRequests = requestsData.map((item) => ({
            id: item.id,
            type: "service",
            serviceType: normalizeServiceType(item.service_type || item.type),
            title: item.service_name || item.service || item.title || "Service Request",
            pet: item.pet_name || item.pet || "Unknown Pet",
            service: item.service_name || item.service || "",
            date: item.request_date || item.date || item.scheduled_date || "",
            time: item.request_time || item.time || "",
            status: item.status || "pending",
            notes: item.notes || item.special_requests || "",
            checkIn: item.check_in || item.checkin_date || "",
            checkOut: item.check_out || item.checkout_date || "",
            paymentStatus: item.payment_status || "unpaid",
            totalAmount: item.total_amount || item.amount || 0,
            createdAt: item.created_at || "",
          }));
          allBookings = [...allBookings, ...normalizedRequests];
        }

        if (boardingsResult.status === "fulfilled") {
          const boardingsData = safeArray(boardingsResult.value);
          const normalizedBoardings = boardingsData.map((item) => ({
            id: item.id,
            type: "boarding",
            serviceType: "hotel",
            title: item.service_name || "Pet Hotel",
            pet: item.pet_name || item.pet?.name || "Unknown Pet",
            service: "Pet Hotel",
            date: item.check_in || item.checkin_date || "",
            time: "",
            status: item.status || "pending",
            notes: item.notes || item.special_requests || "",
            checkIn: item.check_in || item.checkin_date || "",
            checkOut: item.check_out || item.checkout_date || "",
            paymentStatus: item.payment_status || "unpaid",
            totalAmount: item.total_amount || item.amount || 0,
            createdAt: item.created_at || "",
          }));
          allBookings = [...allBookings, ...normalizedBoardings];
        }

        allBookings.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

        setBookings(allBookings);
        setError("");
      } catch {
        setBookings([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [customerEmail]
  );

  useEffect(() => {
    fetchBookings();
    fetchVetServices();
    fetchGroomingServices();
    fetchCustomerPets();
  }, [fetchBookings, fetchVetServices, fetchGroomingServices, fetchCustomerPets]);

  useEffect(() => {
    if (
      selectedBooking === "Hotel" &&
      selectedPet &&
      formData.request_date &&
      formData.check_out_date
    ) {
      setSelectedRoom(null);
      fetchBoardingAvailability(
        formData.request_date,
        formData.check_out_date,
        selectedRoomType,
        selectedPet
      );
    }
  }, [
    selectedBooking,
    selectedPet,
    formData.request_date,
    formData.check_out_date,
    selectedRoomType,
  ]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const stats = useMemo(() => {
    return bookings.reduce(
      (acc, booking) => {
        acc.total += 1;
        acc[booking.status] = (acc[booking.status] || 0) + 1;

        if (booking.serviceType === "hotel") acc.hotel += 1;
        if (booking.serviceType === "vet") acc.vet += 1;
        if (booking.serviceType === "grooming") acc.grooming += 1;

        return acc;
      },
      {
        total: 0,
        pending: 0,
        approved: 0,
        completed: 0,
        rejected: 0,
        cancelled: 0,
        hotel: 0,
        vet: 0,
        grooming: 0,
      }
    );
  }, [bookings]);

  const filteredBookings = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    return bookings.filter((booking) => {
      const matchesStatus = statusFilter === "all" || booking.status === statusFilter;

      const text = [
        booking.title,
        booking.type,
        booking.pet,
        booking.service,
        booking.date,
        booking.time,
        booking.notes,
        booking.status,
        booking.checkIn,
        booking.checkOut,
        booking.paymentStatus,
        booking.totalAmount,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !keyword || text.includes(keyword);

      return matchesStatus && matchesSearch;
    });
  }, [bookings, searchTerm, statusFilter]);

  const showToast = (message, type = "success") => {
    if (type === "error") {
      setErrorMessage(message);
      setTimeout(() => setErrorMessage(""), 3500);
      showError(message);
      return;
    }

    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(""), 3500);
    showSuccess(message);
  };

  const handleSelect = (type) => {
    const meta = getBookingTypeMeta(type);
    const options =
      meta.type === "vet"
        ? vetServices.length > 0
          ? vetServices
          : defaultVetServices
        : groomingServices;

    setSelectedBooking(type);
    setReceipt(null);
    setShowVetHealthInfo(false);

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setPreviewUrl(null);
    setErrorMessage("");

    setFormData({
      customer_name: customerName,
      customer_email: customerEmail,
      pet_id: "",
      pet_name: "",
      service_type: meta.type,
      service_name: meta.type === "hotel" ? "" : options[0]?.name || meta.defaultService,
      request_date: "",
      request_time: "",
      check_out_date: "",
      notes: "",
      vet_info: initialVetInfo,
    });
  };

  const handleClose = () => {
    setSelectedBooking(null);
    setReceipt(null);
    setShowVetHealthInfo(false);

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setPreviewUrl(null);
  };

  const handleAddVetHealthInfo = () => {
    setShowVetHealthInfo(true);
    setErrorMessage("");
  };

  const handleCancelVetHealthInfo = () => {
    setShowVetHealthInfo(false);

    setFormData((prev) => ({
      ...prev,
      vet_info: initialVetInfo,
    }));

    if (errorMessage) setErrorMessage("");
  };

  const handleInputChange = (event) => {
    const { name, value } = event.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (errorMessage) setErrorMessage("");

    if (selectedBooking === "Vet" && (name === "request_date" || name === "service_name")) {
      const updatedFormData = { ...formData, [name]: value };
      if (updatedFormData.request_date) {
        fetchVeterinaryAvailability(updatedFormData.request_date, updatedFormData.service_name);
      }
    }

    if (selectedBooking === "Groom" && name === "request_date") {
      if (value) {
        fetchGroomingAvailability(value);
      }
    }

    if (selectedBooking === "Hotel" && (name === "request_date" || name === "check_out_date")) {
      const updatedFormData = { ...formData, [name]: value };
      if (updatedFormData.request_date && updatedFormData.check_out_date) {
        fetchBoardingAvailability(updatedFormData.request_date, updatedFormData.check_out_date);
      }
    }
  };

  const handleVetInfoChange = (event) => {
    const { name, value } = event.target;

    setFormData((prev) => ({
      ...prev,
      vet_info: {
        ...prev.vet_info,
        [name]: value,
      },
    }));

    if (errorMessage) setErrorMessage("");
  };

  const handleSymptomToggle = (symptom) => {
    setFormData((prev) => {
      const currentSymptoms = prev.vet_info.symptoms || [];
      const nextSymptoms = currentSymptoms.includes(symptom)
        ? currentSymptoms.filter((item) => item !== symptom)
        : [...currentSymptoms, symptom];

      return {
        ...prev,
        vet_info: {
          ...prev.vet_info,
          symptoms: nextSymptoms,
        },
      };
    });

    if (errorMessage) setErrorMessage("");
  };

  const handlePetSelect = (event) => {
    const petId = event.target.value;
    const selectedPetRecord = pets.find((pet) => String(pet.id) === String(petId));

    setSelectedRoom(null);
    setSelectedRoomType("");
    setBoardingAvailability(null);

    setFormData((prev) => ({
      ...prev,
      pet_id: petId,
      pet_name: selectedPetRecord ? getPetName(selectedPetRecord) : "",
      hotel_room_id: "",
    }));

    if (errorMessage) setErrorMessage("");
  };

  const handleReceiptUpload = (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const maxSize = 5 * 1024 * 1024;
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

    if (!allowedTypes.includes(file.type)) {
      showToast("Please upload JPG, PNG, WEBP, or PDF receipt only.", "error");
      return;
    }

    if (file.size > maxSize) {
      showToast("Receipt file must be 5MB or smaller.", "error");
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setReceipt(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleRemoveReceipt = () => {
    setReceipt(null);

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setPreviewUrl(null);
  };

  const fetchVeterinaryAvailability = async (date, serviceName) => {
    try {
      setAvailabilityLoading(true);

      const service = vetServices.find((s) => s.name === serviceName);
      const serviceId = service?.id;

      const url = `/customer/availability/veterinary?date=${date}${serviceId ? `&service_id=${serviceId}` : ""}`;
      const data = await apiRequest(url);

      if (data.success) {
        setVeterinaryAvailability(data);
      } else {
        setVeterinaryAvailability(null);
        showToast(data.message || "Failed to check veterinary availability", "error");
      }
    } catch {
      setVeterinaryAvailability(null);
      showToast("Failed to check availability. Please try again.", "error");
    } finally {
      setAvailabilityLoading(false);
    }
  };

  const fetchGroomingAvailability = async (date) => {
    try {
      setAvailabilityLoading(true);

      const data = await apiRequest(`/customer/availability/grooming?date=${date}`);

      if (data.success) {
        setGroomingAvailability(data);
      } else {
        setGroomingAvailability(null);
        showToast(data.message || "Failed to check grooming availability", "error");
      }
    } catch {
      setGroomingAvailability(null);
      showToast("Failed to check availability. Please try again.", "error");
    } finally {
      setAvailabilityLoading(false);
    }
  };

  const fetchBoardingAvailability = async (
    checkIn,
    checkOut,
    roomType = selectedRoomType,
    pet = selectedPet
  ) => {
    try {
      if (!pet?.id || !checkIn || !checkOut) return;

      if (isUnsupportedBoardingPet(pet)) {
        setBoardingAvailability({
          success: false,
          rooms: [],
          message: getUnsupportedBoardingMessage(pet),
        });
        setSelectedRoom(null);
        return;
      }

      setAvailabilityLoading(true);

      const params = new URLSearchParams({
        pet_id: String(pet.id),
        species: normalizeText(getPetType(pet)),
        check_in_date: checkIn,
        check_out_date: checkOut,
      });

      const petSize = getPetSize(pet);
      if (petSize) {
        params.append("size", petSize);
      }

      if (roomType) {
        params.append("room_type", roomType);
      }

      const data = await apiRequest(`/boarding/rooms/available?${params.toString()}`);

      if (data.success || Array.isArray(data.rooms) || Array.isArray(data.data)) {
        setBoardingAvailability(data);
      } else {
        setBoardingAvailability(null);
        showToast(data.message || "Failed to check boarding availability", "error");
      }
    } catch {
      setBoardingAvailability(null);
      showToast("Failed to check room availability. Please try again.", "error");
    } finally {
      setAvailabilityLoading(false);
    }
  };

  const handleTimeSlotSelect = (slot) => {
    setSelectedTimeSlot(slot.time);
    setFormData((prev) => ({ ...prev, request_time: slot.time }));
  };

  const handleRoomSelect = (room) => {
    setSelectedRoom(room);
    setFormData((prev) => ({ ...prev, room_id: room.id }));
  };

  const buildVetHealthSummary = () => {
    const info = formData.vet_info;

    return [
      "Additional Veterinary Health Information:",
      `Flu-like symptoms: ${info.has_flu_symptoms || "Not answered"}`,
      `Symptoms selected: ${
        info.symptoms?.length ? info.symptoms.join(", ") : "None selected"
      }`,
      `Other symptoms or concerns: ${info.other_symptoms || "None"}`,
      `Symptom duration: ${info.symptom_duration || "Not specified"}`,
      `Appetite: ${info.appetite || "Not specified"}`,
      `Energy level: ${info.energy_level || "Not specified"}`,
      `Temperature concern: ${info.temperature_concern || "Not specified"}`,
      `Medication taken: ${info.medication_taken || "None specified"}`,
      `Recent exposure: ${info.recent_exposure || "None specified"}`,
      `Urgency level: ${info.emergency_level || "normal"}`,
    ].join("\n");
  };

  const buildFinalNotes = () => {
    const baseNotes = formData.notes.trim();

    if (formData.service_type !== "vet" || !showVetHealthInfo) {
      return baseNotes;
    }

    return [`Reason for visit: ${baseNotes}`, buildVetHealthSummary()].join("\n\n");
  };

  const validateForm = () => {
    if (!formData.customer_name.trim()) return "Customer name is required.";
    if (!formData.customer_email.trim()) return "Customer email is required.";
    if (!formData.pet_id && !formData.pet_name.trim()) return "Please select a pet.";
    if (!formData.service_type) return "Please select a booking type.";
    if (selectedBooking !== "Hotel" && !formData.service_name) {
      return "Please select a service.";
    }
    if (!formData.request_date) return "Please select a preferred date.";

    if (selectedBooking === "Vet") {
      if (!selectedTimeSlot) return "Please select an available time slot.";
      if (veterinaryAvailability && !veterinaryAvailability.slots?.find((slot) => slot.time === selectedTimeSlot && slot.available)) {
        return "Selected time slot is not available. Please choose another slot.";
      }
    }

    if (selectedBooking === "Groom") {
      if (groomingAvailability && !groomingAvailability.available) {
        return "This grooming date is already reserved. Please choose another date.";
      }
    }

    if (selectedBooking === "Hotel") {
      if (!selectedPet) return "Please select a pet first.";

      if (isUnsupportedBoardingPet(selectedPet)) {
        return getUnsupportedBoardingMessage(selectedPet);
      }

      if (!formData.request_date) return "Please select a check-in date.";
      if (!formData.check_out_date) return "Please select a check-out date.";

      const checkIn = new Date(`${formData.request_date}T00:00:00`);
      const checkOut = new Date(`${formData.check_out_date}T00:00:00`);

      if (checkOut <= checkIn) {
        return "Check-out date must be after check-in date.";
      }

      if (!selectedRoom) return "Please select an available compatible room.";

      if (!isRoomCompatibleWithPet(selectedRoom, selectedPet)) {
        const species = normalizeText(getPetType(selectedPet));

        if (species === "dog") return "Dogs can only be accommodated in kennels.";
        if (species === "cat") return "Cats can only be accommodated in catteries.";
        if (species === "bird") return "Birds can only be accommodated in bird cages.";

        return "Selected room is not compatible with this pet.";
      }

      const compatibleRooms = getCompatibleRooms();

      if (!compatibleRooms.find((room) => String(room.id) === String(selectedRoom.id))) {
        return "Selected room is not available. Please choose another room.";
      }
    }

    const selectedDateTime = new Date(
      `${formData.request_date}T${formData.request_time || "12:00"}:00`
    );

    if (Number.isNaN(selectedDateTime.getTime())) {
      return "Please select a valid schedule.";
    }

    if (selectedDateTime < new Date()) {
      return "Schedule cannot be in the past.";
    }

    if (formData.service_type === "vet" && !formData.notes.trim()) {
      return "Please describe the reason for the veterinary visit.";
    }

    if (formData.service_type === "vet" && showVetHealthInfo) {
      if (
        formData.vet_info.has_flu_symptoms === "yes" &&
        formData.vet_info.symptoms.length === 0 &&
        !formData.vet_info.other_symptoms.trim()
      ) {
        return "Please select at least one symptom or describe the concern.";
      }

      if (!formData.vet_info.symptom_duration) {
        return "Please select how long the symptoms or concern has been observed.";
      }

      if (!formData.vet_info.appetite) {
        return "Please select your pet's appetite condition.";
      }

      if (!formData.vet_info.energy_level) {
        return "Please select your pet's energy level.";
      }
    }

    return "";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const validationError = validateForm();

    if (validationError) {
      showToast(validationError, "error");
      return;
    }

    try {
      setSubmitting(true);

      if (selectedBooking === "Hotel") {
        const hotelPayload = {
          pet_id: formData.pet_id,
          customer_name: formData.customer_name,
          customer_email: customerEmail || formData.customer_email,
          hotel_room_id: selectedRoom.id,
          room_id: selectedRoom.id,
          check_in_date: formData.request_date,
          check_out_date: formData.check_out_date,
          special_requests: formData.notes,
          notes: formData.notes,
          room_daily_rate: getDailyRate(selectedRoom),
          number_of_days: calculateBoardingDays(),
          total_amount: calculateHotelTotal(),
        };

        const data = await apiRequest("/customer/boardings", {
          method: "POST",
          body: JSON.stringify(hotelPayload),
        });

        if (data.success || data.boarding || data.message) {
          showToast("Pet Hotel reservation submitted successfully. Please wait for approval.");
          await fetchBookings({ silent: true });

          setTimeout(() => {
            handleClose();
          }, 800);
        } else {
          showToast(data.message || "Failed to submit Pet Hotel reservation.", "error");
        }

        return;
      }

      const payload = {
        customer_name: formData.customer_name,
        customer_email: customerEmail || formData.customer_email,
        pet_id: formData.pet_id,
        pet_name: formData.pet_name,
        service_type: formData.service_type,
        service_name: formData.service_name,
        request_date: formData.request_date,
        request_time: formData.request_time,
        notes: buildFinalNotes(),
        request_type: formData.service_type,
        veterinary_health_info:
          formData.service_type === "vet" && showVetHealthInfo
            ? formData.vet_info
            : undefined,
      };

      const data = await apiRequest("/customer/requests", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (data.success) {
        showToast(
          `${getBookingTypeMeta(formData.service_type).title} request submitted successfully. Please wait for approval.`
        );

        await fetchBookings({ silent: true });

        setTimeout(() => {
          handleClose();
        }, 800);
      } else {
        showToast(data.message || "Failed to submit booking request.", "error");
      }
    } catch (error) {
      showToast(error?.message || "Failed to submit booking. Please try again.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefresh = () => {
    fetchBookings({ silent: true });
    fetchCustomerPets();
    fetchVetServices();
  };

  const isSubmitDisabled =
    submitting ||
    pets.length === 0 ||
    (selectedBooking === "Hotel" && !selectedRoom);

  const selectedMeta = selectedBooking ? getBookingTypeMeta(selectedBooking) : null;
  const isVetBooking = selectedMeta?.type === "vet";

  return (
    <div className="customer-bookings">
      {successMessage && (
        <div className="customer-booking-toast success">
          <FaCheckCircle />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="customer-booking-toast error">
          <FaExclamationTriangle />
          <span>{errorMessage}</span>
        </div>
      )}

      <section className="bookings-hero">
        <div className="bookings-hero-copy">
          <span className="bookings-eyebrow">
            <FaCalendarCheck />
            Customer Booking Center
          </span>

          <h1>Book Pet Services</h1>

          <p>
            Request pet hotel reservations, grooming appointments, and veterinary
            care through one organized customer booking center.
          </p>
        </div>

        <button
          className={`booking-refresh-btn ${refreshing ? "refreshing" : ""}`}
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <FaSyncAlt />
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </section>

      <section className="booking-stats-grid">
        <article className="booking-stat-card">
          <span>
            <FaClipboardList />
          </span>
          <div>
            <strong>{stats.total}</strong>
            <p>Total Bookings</p>
          </div>
        </article>

        <article className="booking-stat-card">
          <span>
            <FaClock />
          </span>
          <div>
            <strong>{stats.pending}</strong>
            <p>Pending Approval</p>
          </div>
        </article>

        <article className="booking-stat-card">
          <span>
            <FaCheckCircle />
          </span>
          <div>
            <strong>{stats.approved}</strong>
            <p>Approved</p>
          </div>
        </article>

        <article className="booking-stat-card">
          <span>
            <FaPaw />
          </span>
          <div>
            <strong>{stats.completed}</strong>
            <p>Completed</p>
          </div>
        </article>
      </section>

      <section className="booking-type-section">
        <div className="section-heading">
          <div>
            <span className="bookings-eyebrow">Service Request</span>
            <h2>Choose Booking Type</h2>
            <p>Select the service category you want to request for your pet.</p>
          </div>
        </div>

        <div className="booking-types-grid">
          {bookingTypes.map((type) => (
            <button
              key={type.id}
              type="button"
              className={`booking-type-card ${type.accent}`}
              onClick={() => handleSelect(type.id)}
            >
              <span className="booking-icon">{type.icon}</span>
              <strong>{type.title}</strong>
              <p>{type.description}</p>

              <span className="booking-type-count">
                {type.type === "hotel" && `${stats.hotel} requests`}
                {type.type === "vet" && `${stats.vet} requests`}
                {type.type === "grooming" && `${stats.grooming} requests`}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="recent-bookings">
        <div className="recent-bookings-header">
          <div>
            <span className="bookings-eyebrow">Booking History</span>
            <h2>My Booking Requests</h2>
            <p>Track all submitted hotel, grooming, and veterinary requests.</p>
          </div>
        </div>

        <div className="booking-toolbar">
          <div className="booking-search-box">
            <FaSearch />
            <input
              type="text"
              placeholder="Search by pet, service, date, or status..."
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
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="booking-filter-select"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="completed">Completed</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {loading ? (
          <div className="booking-empty-state">
            <FaSyncAlt className="spin" />
            <h3>Loading bookings</h3>
            <p>Please wait while we fetch your booking records.</p>
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="booking-empty-state">
            <FaCalendarCheck />
            <h3>No bookings found</h3>
            <p>
              {searchTerm || statusFilter !== "all"
                ? "Try adjusting your search or filter."
                : "Start by selecting Hotel, Veterinary, or Grooming service above."}
            </p>
          </div>
        ) : (
          <div className="bookings-list">
            {filteredBookings.map((booking) => (
              <article key={booking.id} className="booking-item">
                <div className="booking-main">
                  <span className={`booking-type-icon ${booking.serviceType}`}>
                    {booking.icon}
                  </span>

                  <div>
                    <h3>{booking.title}</h3>
                    <p>{booking.details}</p>

                    <div className="booking-meta">
                      {booking.checkIn && (
                        <span>
                          <FaCalendarCheck />
                          Check-in: {formatDate(booking.checkIn)}
                        </span>
                      )}

                      {booking.checkOut && (
                        <span>
                          <FaCalendarCheck />
                          Check-out: {formatDate(booking.checkOut)}
                        </span>
                      )}

                      {!booking.checkIn && (
                        <span>
                          <FaCalendarCheck />
                          {formatDate(booking.date)}
                        </span>
                      )}

                      {booking.time && (
                        <span>
                          <FaClock />
                          {booking.time}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <span className={`booking-status ${booking.status}`}>
                  {booking.status.replace(/_/g, " ")}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>

      {selectedBooking && selectedMeta && (
        <div className="booking-modal-overlay" onClick={handleClose}>
          <div className="booking-modal" onClick={(event) => event.stopPropagation()}>
            <div className="booking-modal-header">
              <div className="booking-modal-title">
                <span className={`modal-service-icon ${selectedMeta.accent}`}>
                  {selectedMeta.icon}
                </span>

                <div>
                  <span className="bookings-eyebrow">New Booking Request</span>
                  <h2>{selectedMeta.title}</h2>
                  <p>{selectedMeta.description}</p>
                </div>
              </div>

              <button className="close-modal-btn" onClick={handleClose} type="button">
                <FaTimes />
              </button>
            </div>

            <form className="booking-form" onSubmit={handleSubmit}>
              <div className="booking-form-section">
                <div className="form-section-title">
                  <FaUser />
                  <div>
                    <h3>Customer & Pet Information</h3>
                    <p>Confirm your details and choose the pet for this request.</p>
                  </div>
                </div>

                <div className="booking-form-grid">
                  <label className="form-group">
                    Customer Name
                    <input
                      type="text"
                      name="customer_name"
                      value={formData.customer_name}
                      onChange={handleInputChange}
                      required
                    />
                  </label>

                  <label className="form-group">
                    Customer Email
                    <input
                      type="email"
                      name="customer_email"
                      value={formData.customer_email}
                      onChange={handleInputChange}
                      required
                    />
                  </label>

                  <label className="form-group full-width">
                    Select Pet

                    {petsLoading ? (
                      <div className="pet-select-helper">Loading your pets...</div>
                    ) : pets.length > 0 ? (
                      <select
                        name="pet_id"
                        value={formData.pet_id}
                        onChange={handlePetSelect}
                        required
                      >
                        <option value="">Choose your pet...</option>

                        {pets.map((pet, index) => {
                          const age = getPetAge(pet);
                          return (
                            <option key={pet.id || index} value={pet.id}>
                              {getPetName(pet)} — {getPetType(pet)}
                              {age !== "N/A" ? ` (${age})` : ""}
                            </option>
                          );
                        })}
                      </select>
                    ) : (
                      <div className="pet-select-empty">
                        <strong>No pets found</strong>
                        <p>Please add your pet first in the My Pets page before creating a booking.</p>
                      </div>
                    )}
                  </label>

                  {selectedPet && (
                    <div className="selected-pet-card full-width">
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <PetAvatar pet={selectedPet} size={44} />
                        <div>
                          <small>Selected Pet</small>
                          <strong>{getPetName(selectedPet)}</strong>
                        </div>
                      </div>
                      <div>
                        <small>Type of Pet</small>
                        <strong>{getPetType(selectedPet)}</strong>
                      </div>
                      <div>
                        <small>Breed</small>
                        <strong>{getPetBreed(selectedPet)}</strong>
                      </div>
                      {getPetBirthdate(selectedPet) && (
                        <div>
                          <small>Birthdate</small>
                          <strong>{new Date(getPetBirthdate(selectedPet)).toLocaleDateString()}</strong>
                        </div>
                      )}
                      <div>
                        <small>Age</small>
                        <strong>{getPetAge(selectedPet)}</strong>
                      </div>
                      <div>
                        <small>Weight</small>
                        <strong>{getPetWeight(selectedPet)}</strong>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="booking-form-section">
                <div className="form-section-title">
                  {selectedMeta.icon}
                  <div>
                    <h3>Service Details</h3>
                    <p>Select your preferred service and schedule.</p>
                  </div>
                </div>

                <div className="booking-form-grid">
                  {selectedBooking !== "Hotel" && (
                    <label className="form-group full-width">
                      Service
                      <select
                        name="service_name"
                        value={formData.service_name}
                        onChange={handleInputChange}
                        required
                      >
                        {serviceOptions.map((service, index) => (
                          <option key={`${service.name}-${index}`} value={service.name}>
                            {service.name}
                            {service.category ? ` • ${service.category}` : ""} -{" "}
                            {formatCurrency(service.price || 0)}
                          </option>
                        ))}
                      </select>

                      {isVetBooking && servicesLoading && (
                        <small>Loading veterinary services...</small>
                      )}
                    </label>
                  )}

                  {selectedBooking === "Hotel" ? (
                    <>
                      <label className="form-group">
                        Check-in Date
                        <DatePickerInput
                          selected={formData.request_date ? new Date(formData.request_date) : null}
                          onChange={(date) => handleInputChange({ target: { name: "request_date", value: date ? date.toISOString().split("T")[0] : "" } })}
                          placeholderText="Pick check-in..."
                          minDate={new Date()}
                          required
                        />
                      </label>

                      <label className="form-group">
                        Check-out Date
                        <DatePickerInput
                          selected={formData.check_out_date ? new Date(formData.check_out_date) : null}
                          onChange={(date) => handleInputChange({ target: { name: "check_out_date", value: date ? date.toISOString().split("T")[0] : "" } })}
                          placeholderText="Pick check-out..."
                          minDate={formData.request_date ? new Date(formData.request_date) : new Date()}
                          required
                        />
                      </label>

                      <label className="form-group full-width">
                        Room Type Filter
                        <select
                          name="room_type"
                          value={selectedRoomType}
                          onChange={(event) => {
                            setSelectedRoomType(event.target.value);
                            setSelectedRoom(null);
                          }}
                          disabled={!selectedPet || !formData.request_date || !formData.check_out_date}
                        >
                          {activeRoomTypeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>

                        {!selectedPet && <small>Select a pet first to filter compatible rooms.</small>}
                      </label>
                    </>
                  ) : (
                    <>
                      <label className="form-group">
                        Preferred Date
                        <DatePickerInput
                          selected={formData.request_date ? new Date(formData.request_date) : null}
                          onChange={(date) => handleInputChange({ target: { name: "request_date", value: date ? date.toISOString().split("T")[0] : "" } })}
                          placeholderText="Pick a date..."
                          minDate={new Date()}
                          required
                        />
                      </label>

                      <label className="form-group">
                        Preferred Time
                        <input
                          type="time"
                          name="request_time"
                          value={formData.request_time}
                          onChange={handleInputChange}
                          required={selectedBooking !== "Hotel"}
                        />
                      </label>
                    </>
                  )}

                  {/* Availability Display Section */}
                  {(selectedBooking === "Vet" || selectedBooking === "Groom" || selectedBooking === "Hotel") && (
                    <div className="form-group full-width availability-section">
                      <div className="availability-header">
                        <span className="availability-title">
                          {selectedBooking === "Vet" && "Available Time Slots"}
                          {selectedBooking === "Groom" && "Date Availability"}
                          {selectedBooking === "Hotel" && "Available Rooms"}
                        </span>
                        {availabilityLoading && <span className="availability-loading">Checking...</span>}
                      </div>

                      {/* Veterinary Availability */}
                      {selectedBooking === "Vet" && veterinaryAvailability && (
                        <div className="availability-content">
                          {veterinaryAvailability.slots && veterinaryAvailability.slots.length > 0 ? (
                            <div className="time-slots-grid">
                              {veterinaryAvailability.slots.map((slot) => (
                                <button
                                  key={slot.time}
                                  type="button"
                                  className={`time-slot ${!slot.available ? 'unavailable' : ''} ${selectedTimeSlot === slot.time ? 'selected' : ''}`}
                                  onClick={() => slot.available && handleTimeSlotSelect(slot)}
                                  disabled={!slot.available}
                                >
                                  <span className="slot-time">{slot.label}</span>
                                  <span className="slot-status">
                                    {slot.available ? 'Available' : slot.reason || 'Booked'}
                                  </span>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="no-availability">
                              <p>No available veterinary slots for this date. Please choose another date.</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Grooming Availability */}
                      {selectedBooking === "Groom" && groomingAvailability && (
                        <div className="availability-content">
                          {groomingAvailability.available ? (
                            <div className="availability-success">
                              <span className="availability-icon">✓</span>
                              <span>This grooming date is available for booking.</span>
                            </div>
                          ) : (
                            <div className="no-availability">
                              <p>This grooming date is already reserved. Please choose another date.</p>
                              {groomingAvailability.existing_appointment && (
                                <div className="existing-booking">
                                  <small>Existing booking: {groomingAvailability.existing_appointment.pet_name} - {groomingAvailability.existing_appointment.service}</small>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Boarding Availability */}
                      {selectedBooking === "Hotel" && boardingAvailability && (
                        <div className="availability-content">
                          {isUnsupportedBoardingPet(selectedPet) ? (
                            <div className="no-availability">
                              <p>{getUnsupportedBoardingMessage(selectedPet)}</p>
                            </div>
                          ) : getCompatibleRooms().length > 0 ? (
                            <>
                              <div className="rooms-grid">
                                {getCompatibleRooms().map((room) => {
                                  const roomType = getRoomType(room);
                                  const isAvailable = room.available !== false;

                                  return (
                                    <button
                                      key={room.id}
                                      type="button"
                                      className={`room-card ${!isAvailable ? "unavailable" : ""} ${
                                        selectedRoom?.id === room.id ? "selected" : ""
                                      }`}
                                      onClick={() => isAvailable && handleRoomSelect(room)}
                                      disabled={!isAvailable}
                                    >
                                      <div className="room-header">
                                        <span className="room-name">{getRoomDisplayName(room)}</span>
                                        <span className="room-type">{roomType.replace(/_/g, " ")}</span>
                                      </div>

                                      <div className="room-details">
                                        <span className="room-capacity">Capacity: {getRoomCapacity(room)}</span>
                                        <span className="room-rate">{formatCurrency(getDailyRate(room))}/day</span>
                                      </div>

                                      <span className="room-status">
                                        {isAvailable ? "Available" : room.reason || "Not Available"}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>

                              {selectedRoom && (
                                <div className="hotel-total-card">
                                  <strong>Total Estimate</strong>

                                  <p>
                                    Room: {formatCurrency(getDailyRate(selectedRoom))} × {calculateBoardingDays()} day
                                    {calculateBoardingDays() > 1 ? "s" : ""} ={" "}
                                    <b>{formatCurrency(getDailyRate(selectedRoom) * calculateBoardingDays())}</b>
                                  </p>

                                  <h4>
                                    Grand Total: {formatCurrency(calculateHotelTotal())}
                                  </h4>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="no-availability">
                              <p>No compatible rooms are available for this pet and date range.</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Show message when no availability data yet */}
                      {!veterinaryAvailability && !groomingAvailability && !boardingAvailability && !availabilityLoading && (
                        <div className="availability-prompt">
                          <p>
                            {selectedBooking === "Hotel"
                              ? "Select a pet, check-in date, and check-out date to view compatible rooms."
                              : "Select a date to check availability."}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <label className="form-group full-width">
                    {isVetBooking
                      ? "Main Reason for Veterinary Visit"
                      : selectedBooking === "Hotel"
                      ? "Special Requests"
                      : "Special Instructions"}
                    <textarea
                      name="notes"
                      value={formData.notes}
                      onChange={handleInputChange}
                      placeholder={
                        isVetBooking
                          ? "Briefly describe why your pet needs veterinary care..."
                          : selectedBooking === "Hotel"
                          ? "Diet, medication, exercise, or care instructions..."
                          : "Preferred haircut, coat concerns, or grooming instructions..."
                      }
                      rows="4"
                      required={isVetBooking}
                    />
                  </label>
                </div>

                {isVetBooking && !showVetHealthInfo && (
                  <div className="additional-health-card">
                    <div>
                      <span>
                        <FaHeartbeat />
                      </span>
                      <div>
                        <strong>Add more health details</strong>
                        <p>
                          Optional: provide symptoms, appetite, energy level, medication,
                          and exposure details for the veterinarian.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="add-health-info-btn"
                      onClick={handleAddVetHealthInfo}
                    >
                      <FaPlus />
                      Add Additional Health Information
                    </button>
                  </div>
                )}
              </div>

              {isVetBooking && showVetHealthInfo && (
                <div className="booking-form-section vet-health-section">
                  <div className="vet-health-header">
                    <div className="form-section-title">
                      <FaHeartbeat />
                      <div>
                        <h3>Veterinary Health Information</h3>
                        <p>
                          These optional details help the veterinarian understand your pet's condition before the appointment.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="cancel-health-info-btn"
                      onClick={handleCancelVetHealthInfo}
                    >
                      <FaTimes />
                      Cancel Additional Health Info
                    </button>
                  </div>

                  <div className="booking-form-grid">
                    <label className="form-group">
                      Does your pet have flu-like symptoms?
                      <select
                        name="has_flu_symptoms"
                        value={formData.vet_info.has_flu_symptoms}
                        onChange={handleVetInfoChange}
                        required
                      >
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                        <option value="not_sure">Not sure</option>
                      </select>
                    </label>

                    <label className="form-group">
                      How long has this been observed?
                      <select
                        name="symptom_duration"
                        value={formData.vet_info.symptom_duration}
                        onChange={handleVetInfoChange}
                        required
                      >
                        <option value="">Select duration...</option>
                        <option value="today">Today only</option>
                        <option value="1_to_2_days">1 to 2 days</option>
                        <option value="3_to_7_days">3 to 7 days</option>
                        <option value="more_than_1_week">More than 1 week</option>
                        <option value="not_applicable">Not applicable</option>
                      </select>
                    </label>

                    <label className="form-group">
                      Appetite
                      <select
                        name="appetite"
                        value={formData.vet_info.appetite}
                        onChange={handleVetInfoChange}
                        required
                      >
                        <option value="">Select appetite condition...</option>
                        <option value="normal">Normal</option>
                        <option value="reduced">Reduced appetite</option>
                        <option value="not_eating">Not eating</option>
                        <option value="excessive">Eating more than usual</option>
                      </select>
                    </label>

                    <label className="form-group">
                      Energy Level
                      <select
                        name="energy_level"
                        value={formData.vet_info.energy_level}
                        onChange={handleVetInfoChange}
                        required
                      >
                        <option value="">Select energy level...</option>
                        <option value="normal">Normal</option>
                        <option value="low">Low energy</option>
                        <option value="very_weak">Very weak</option>
                        <option value="restless">Restless</option>
                      </select>
                    </label>

                    <div className="form-group full-width">
                      Symptoms or Observed Issues
                      <div className="symptom-grid">
                        {symptomOptions.map((symptom) => (
                          <label
                            key={symptom}
                            className={`symptom-chip ${
                              formData.vet_info.symptoms.includes(symptom) ? "selected" : ""
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={formData.vet_info.symptoms.includes(symptom)}
                              onChange={() => handleSymptomToggle(symptom)}
                            />
                            <span>{symptom}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <label className="form-group full-width">
                      Other symptoms, injury, behavior changes, or concerns
                      <textarea
                        name="other_symptoms"
                        value={formData.vet_info.other_symptoms}
                        onChange={handleVetInfoChange}
                        placeholder="Example: scratching ears, shaking head, wound, limping, unusual behavior..."
                        rows="3"
                      />
                    </label>

                    <label className="form-group">
                      Temperature concern
                      <select
                        name="temperature_concern"
                        value={formData.vet_info.temperature_concern}
                        onChange={handleVetInfoChange}
                      >
                        <option value="">Select if applicable...</option>
                        <option value="normal">No temperature concern</option>
                        <option value="warm_body">Body feels warm</option>
                        <option value="shivering">Shivering</option>
                        <option value="not_checked">Not checked</option>
                      </select>
                    </label>

                    <label className="form-group">
                      Urgency Level
                      <select
                        name="emergency_level"
                        value={formData.vet_info.emergency_level}
                        onChange={handleVetInfoChange}
                      >
                        <option value="normal">Normal appointment</option>
                        <option value="urgent">Urgent concern</option>
                        <option value="emergency">Emergency concern</option>
                      </select>
                    </label>

                    <label className="form-group full-width">
                      Medication, vitamins, or recent vaccine
                      <textarea
                        name="medication_taken"
                        value={formData.vet_info.medication_taken}
                        onChange={handleVetInfoChange}
                        placeholder="List any medicine, vitamins, supplements, or recent vaccine if any..."
                        rows="3"
                      />
                    </label>

                    <label className="form-group full-width">
                      Recent exposure or possible cause
                      <textarea
                        name="recent_exposure"
                        value={formData.vet_info.recent_exposure}
                        onChange={handleVetInfoChange}
                        placeholder="Example: contact with sick pets, new food, travel, accident, outdoor exposure..."
                        rows="3"
                      />
                    </label>

                    <label className="form-group full-width">
                      Other medical history or concerns
                      <textarea
                        name="other_medical_history"
                        value={formData.vet_info.other_medical_history}
                        onChange={handleVetInfoChange}
                        placeholder="Example: allergies, previous surgeries, chronic conditions..."
                        rows="3"
                      />
                    </label>
                  </div>
                </div>
              )}

              <div className="booking-form-section payment-section">
                <div className="form-section-title">
                  <FaWallet />
                  <div>
                    <h3>Payment Information</h3>
                    <p>
                      Receipt upload is optional during request creation. Cashier verification can be handled after approval.
                    </p>
                  </div>
                </div>
                {previewUrl && (
                  <div className="receipt-preview">
                    {receipt?.type === "application/pdf" ? (
                      <div className="pdf-preview">PDF receipt selected: {receipt.name}</div>
                    ) : (
                      <img src={previewUrl} alt="Receipt Preview" />
                    )}
                  </div>
                )}
              </div>

              <div className="booking-form-actions">
                <button type="button" className="cancel-btn" onClick={handleClose}>
                  Cancel
                </button>
                <button type="submit" className="submit-btn" disabled={isSubmitDisabled}>
                  {submitting ? "Submitting..." : "Submit Booking Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerBookings;
