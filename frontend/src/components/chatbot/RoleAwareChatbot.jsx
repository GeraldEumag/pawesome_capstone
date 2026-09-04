import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import DatePickerInput from "../shared/DatePickerInput";
import { getMySession } from "../../services/liveChatService";
import { showConfirm, showError, showSuccess } from "../../utils/alert";
import {
  faRobot,
  faPaperPlane,
  faXmark,
  faRotateRight,
  faCashRegister,
  faChartLine,
  faBoxOpen,
  faCalendarCheck,
  faWandMagicSparkles,
  faUsers,
  faCalendarPlus,
  faTriangleExclamation,
  faReceipt,
  faHeadset,
  faHotel,
  faCheck,
  faTimes,
  faComments,
} from "@fortawesome/free-solid-svg-icons";
import {
  createChatbotBooking,
  createChatbotHotelBooking,
  fetchBookingOptions,
  fetchChatbotWelcome,
  fetchHotelOptions,
  lookupChatbotAppointments,
  searchChatbotInventory,
  sendChatbotMessage,
} from "../../services/chatbotService";
import {
  startLiveChat,
  sendCustomerMessage,
  pollMessages as pollLiveChatMessages,
  customerCloseChat,
} from "../../services/liveChatService";
import { apiRequest, normalizeList } from "../../api/client";
import botIcon from "../../assets/pawesome-icon.png";
import "./RoleAwareChatbot.css";

const formatMessage = (text) => (text || "").split("\n");

const formatTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const CUSTOMER_APPROVAL_NOTICE =
  "Reminder: Customer booking requests are not automatically confirmed. The receptionist must review, approve, reject, or reschedule the request first.";

const normalizeCustomerBotReply = (reply = "", role = "user") => {
  if (role !== "customer") return reply;
  const lowerReply = reply.toLowerCase();
  const approvalKeywords = ["confirmed", "approved", "successfully booked", "booking is confirmed", "appointment is confirmed"];
  const needsCorrection = approvalKeywords.some((keyword) => lowerReply.includes(keyword));
  if (!needsCorrection) return reply;
  return reply
    .replace(/your booking is confirmed/gi, "your booking request has been submitted")
    .replace(/your appointment is confirmed/gi, "your appointment request has been submitted")
    .replace(/successfully booked/gi, "submitted for receptionist review")
    .replace(/confirmed/gi, "pending receptionist approval")
    .replace(/approved/gi, "waiting for receptionist approval")
    .concat(`\n\n${CUSTOMER_APPROVAL_NOTICE}`);
};

// ── localStorage / sessionStorage helpers ──────────────────────────────────
const MAX_CACHED_MSGS = 50;

function loadChatCache(role) {
  try {
    const raw = localStorage.getItem(`pawesome_chat_${role}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveChatCache(role, messages, context) {
  try {
    localStorage.setItem(`pawesome_chat_${role}`, JSON.stringify(messages.slice(-MAX_CACHED_MSGS)));
    if (context) localStorage.setItem(`pawesome_chat_ctx_${role}`, JSON.stringify(context));
  } catch { /* storage quota exceeded — ignore */ }
}

function clearChatCache(role) {
  try {
    localStorage.removeItem(`pawesome_chat_${role}`);
    localStorage.removeItem(`pawesome_chat_ctx_${role}`);
  } catch { }
}

function loadLiveChatSession() {
  try {
    const raw = sessionStorage.getItem("pawesome_live_chat");
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveLiveChatSession(data) {
  try {
    if (data) sessionStorage.setItem("pawesome_live_chat", JSON.stringify(data));
    else sessionStorage.removeItem("pawesome_live_chat");
  } catch { }
}

// ── Booking flow steps ─────────────────────────────────────────────────────
const APPT_STEPS = ["select_pet", "select_service", "select_date", "add_notes", "confirm", "done"];
const HOTEL_STEPS = ["select_pet", "select_checkin", "select_checkout", "select_room", "add_notes", "confirm", "done"];

const LIVE_CHAT_POLL_MS = 3000;

const RoleAwareChatbot = ({
  mode = "widget",
  title = "Pawesome Assistant",
  subtitle = "Shared RBAC chatbot",
  role: propRole,
}) => {
  const { role: authRole } = useAuth();
  const role = propRole || authRole || "user";
  const [isOpen, setIsOpen] = useState(mode === "embedded");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [error, setError] = useState("");
  const [workflow, setWorkflow] = useState(null);
  const [sessionContext, setSessionContext] = useState({
    lastIntent: null,
    lastEntityType: null,
    lastRequestId: null,
    lastPaymentStatus: null,
  });
  const [workflowState, setWorkflowState] = useState({
    loading: false,
    error: "",
    options: { pets: [], services: [], rooms: [] },
    results: [],
    form: {
      pet_id: "",
      service_id: "",
      scheduled_at: "",
      query: "",
      hotel_pet_id: "",
      hotel_room_id: "",
      check_in: "",
      check_out: "",
      special_requests: "",
    },
  });

  // ── Conversational booking flow (customer only) ─────────────────────────
  const [convFlow, setConvFlow] = useState(null);
  // convFlow: null | {
  //   type: 'appointment' | 'hotel',
  //   step: string,
  //   data: { pet_id, pet_name, service_id, service_name, scheduled_at, check_in, check_out, room_id, room_label, notes },
  //   options: { pets, services, rooms },
  //   loading: bool,
  //   error: ''
  // }

  // ── Live chat mode (customer only) ─────────────────────────────────────
  const [liveChatMode, setLiveChatMode] = useState(null);
  // liveChatMode: null | { sessionId, status: 'starting'|'waiting'|'active'|'closed' }
  const liveChatLastIdRef = useRef(0);
  const liveChatTimerRef = useRef(null);

  const messagesEndRef = useRef(null);
  const navigate = useNavigate();

  // ── Welcome / cache restore ───────────────────────────────────────────────
  useEffect(() => {
    // 1. Try localStorage first — instant, no API call
    const cached = loadChatCache(role);
    if (cached?.length > 0) {
      setMessages(cached);
      try {
        const rawCtx = localStorage.getItem(`pawesome_chat_ctx_${role}`);
        if (rawCtx) setSessionContext(JSON.parse(rawCtx));
      } catch { }
      setIsBootstrapping(false);
      return;
    }

    // 2. No cache — fetch welcome from API
    const loadWelcome = async () => {
      try {
        setIsBootstrapping(true);
        const data = await fetchChatbotWelcome();
        setMessages([{
          sender: "bot",
          text: data.reply || data.message || "Hi. I can help with your Pawesome workflow.",
          suggestions: normalizeList(data.suggestions),
          actions: normalizeList(data.actions),
          timestamp: new Date().toISOString(),
        }]);
      } catch (err) {
        setError(err.message || "Failed to load chatbot.");
      } finally {
        setIsBootstrapping(false);
      }
    };
    loadWelcome();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Persist messages to localStorage whenever they change ─────────────────
  useEffect(() => {
    if (!isBootstrapping && messages.length > 0) {
      saveChatCache(role, messages, sessionContext);
    }
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Persist sessionContext separately ────────────────────────────────────
  useEffect(() => {
    if (!isBootstrapping) {
      try {
        localStorage.setItem(`pawesome_chat_ctx_${role}`, JSON.stringify(sessionContext));
      } catch { }
    }
  }, [sessionContext]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Restore live chat session from sessionStorage on mount ────────────────
  useEffect(() => {
    if (role !== "customer") return;
    const saved = loadLiveChatSession();
    if (!saved?.sessionId) return;

    getMySession()
      .then((data) => {
        const s = data.session;
        if (s && (s.status === "active" || s.status === "waiting")) {
          liveChatLastIdRef.current = 0;
          setLiveChatMode({ sessionId: s.id, status: s.status });
          setMessages((prev) => [
            ...prev,
            {
              sender: "bot",
              text: "Welcome back! You still have an open live chat session. A staff member will be with you shortly.",
              liveChat: true,
              senderType: "system",
              timestamp: new Date().toISOString(),
            },
          ]);
        } else {
          saveLiveChatSession(null);
        }
      })
      .catch(() => saveLiveChatSession(null));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Persist liveChatMode to sessionStorage ────────────────────────────────
  useEffect(() => {
    saveLiveChatSession(liveChatMode?.sessionId ? liveChatMode : null);
  }, [liveChatMode]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const [typingMessage, setTypingMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  // ── Live chat polling ────────────────────────────────────────────────────
  const pollLiveChat = useCallback(async (sessionId) => {
    try {
      const data = await pollLiveChatMessages(sessionId, liveChatLastIdRef.current);
      if (data.messages?.length > 0) {
        // Always advance the cursor for ALL messages (including customer's own)
        data.messages.forEach((msg) => {
          if (msg.id > liveChatLastIdRef.current) liveChatLastIdRef.current = msg.id;
        });
        // Only display staff + system messages — customer messages are already
        // shown optimistically when sent, so skip them to prevent duplicates.
        const newMsgs = data.messages
          .filter((msg) => msg.sender_type !== "customer")
          .map((msg) => ({
            sender: "bot",
            text: msg.message,
            liveChat: true,
            senderName: msg.sender_type === "system" ? null : msg.sender_name,
            senderType: msg.sender_type,
            timestamp: msg.created_at,
          }));
        if (newMsgs.length > 0) setMessages((prev) => [...prev, ...newMsgs]);
      }
      // Detect status changes
      if (data.session_status === "closed") {
        setLiveChatMode((prev) => prev ? { ...prev, status: "closed" } : null);
        clearInterval(liveChatTimerRef.current);
        setMessages((prev) => [...prev, {
          sender: "bot",
          text: "This live chat session has been closed. Thank you for contacting Pawesome!",
          liveChat: true,
          senderType: "system",
          timestamp: new Date().toISOString(),
        }]);
      } else if (data.session_status === "active") {
        setLiveChatMode((prev) => prev && prev.status === "waiting" ? { ...prev, status: "active" } : prev);
      }
    } catch {
      // Silently ignore poll errors
    }
  }, []);

  useEffect(() => {
    if (liveChatMode?.sessionId && liveChatMode.status !== "closed") {
      liveChatTimerRef.current = setInterval(
        () => pollLiveChat(liveChatMode.sessionId),
        LIVE_CHAT_POLL_MS
      );
    } else {
      clearInterval(liveChatTimerRef.current);
    }
    return () => clearInterval(liveChatTimerRef.current);
  }, [liveChatMode?.sessionId, liveChatMode?.status, pollLiveChat]);

  // ── Submit message (AI/rule-based chatbot) ───────────────────────────────
  const submitMessage = async (messageText) => {
    const trimmed = messageText.trim();
    if (!trimmed || isLoading) return;

    // If in live chat mode, route message to live chat
    if (liveChatMode?.sessionId && liveChatMode.status !== "closed") {
      const timestamp = new Date().toISOString();
      setMessages((prev) => [...prev, {
        sender: "user",
        text: trimmed,
        liveChat: true,
        senderType: "customer",
        timestamp,
      }]);
      setInput("");
      try {
        await sendCustomerMessage(liveChatMode.sessionId, trimmed);
      } catch (err) {
        setError(err.message || "Failed to send message.");
      }
      return;
    }

    const timestamp = new Date().toISOString();
    setMessages((prev) => [...prev, { sender: "user", text: trimmed, timestamp }]);
    setInput("");
    setError("");
    setIsLoading(true);

    try {
      const data = await sendChatbotMessage(trimmed, { context: sessionContext });
      const replyText = normalizeCustomerBotReply(data.reply, role);
      const richContext = data.rich_content || {};
      setSessionContext((prev) => ({
        ...prev,
        lastIntent: data.intent || prev.lastIntent,
        lastEntityType: richContext.last_entity_type || prev.lastEntityType,
        lastRequestId: richContext.last_request_id || prev.lastRequestId,
        lastPaymentStatus: richContext.last_payment_status || prev.lastPaymentStatus,
      }));

      // Typing animation
      setIsTyping(true);
      let currentText = "";
      const words = replyText.split(" ");
      for (let i = 0; i < words.length; i++) {
        currentText += (i > 0 ? " " : "") + words[i];
        setTypingMessage(currentText);
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      setIsTyping(false);
      setTypingMessage("");

      setMessages((prev) => [...prev, {
        sender: "bot",
        text: replyText,
        suggestions: normalizeList(data.suggestions),
        actions: normalizeList(data.actions),
        source: data.source || "rule_based",
        timestamp: new Date().toISOString(),
      }]);
    } catch (err) {
      setError(err.message || "Unable to reach the chatbot service.");
    } finally {
      setIsLoading(false);
      setIsTyping(false);
    }
  };

  const onSubmit = (event) => {
    event.preventDefault();
    submitMessage(input);
  };

  const onAction = (path) => {
    if (!path) return;
    navigate(path);
    if (mode === "widget") setIsOpen(false);
  };

  // ── Old modal workflow (non-customer roles) ──────────────────────────────
  const openWorkflow = async (workflowName) => {
    setWorkflow(workflowName);
    setWorkflowState((prev) => ({ ...prev, loading: workflowName === "create_booking", error: "", results: [] }));
    if (workflowName === "create_booking") {
      try {
        const data = await fetchBookingOptions();
        setWorkflowState((prev) => ({
          ...prev,
          loading: false,
          options: {
            pets: normalizeList(data.pets || data, ["pets"]),
            services: normalizeList(data.services || data, ["services"]),
          },
          form: {
            ...prev.form,
            pet_id: normalizeList(data.pets || data, ["pets"])?.[0]?.id?.toString() || "",
            service_id: normalizeList(data.services || data, ["services"])?.[0]?.id?.toString() || "",
          },
        }));
      } catch (err) {
        setWorkflowState((prev) => ({ ...prev, loading: false, error: err.message || "Failed to load booking options." }));
      }
    }
    if (workflowName === "hotel_booking") {
      try {
        const data = await fetchHotelOptions();
        setWorkflowState((prev) => ({
          ...prev,
          loading: false,
          options: {
            pets: normalizeList(data.pets || data, ["pets"]),
            rooms: normalizeList(data.rooms || data, ["rooms"]),
          },
          form: { ...prev.form, hotel_pet_id: normalizeList(data.pets || data, ["pets"])?.[0]?.id?.toString() || "" },
        }));
      } catch (err) {
        setWorkflowState((prev) => ({ ...prev, loading: false, error: err.message || "Failed to load hotel options." }));
      }
    }
  };

  const closeWorkflow = () => {
    setWorkflow(null);
    setWorkflowState((prev) => ({ ...prev, loading: false, error: "", results: [] }));
  };

  const updateWorkflowForm = (key, value) => {
    setWorkflowState((prev) => ({ ...prev, form: { ...prev.form, [key]: value } }));
  };

  const submitBookingWorkflow = async (event) => {
    event.preventDefault();
    setWorkflowState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const data = await createChatbotBooking({
        pet_id: Number(workflowState.form.pet_id),
        service_id: Number(workflowState.form.service_id),
        scheduled_at: workflowState.form.scheduled_at,
      });
      setMessages((prev) => [...prev, {
        sender: "bot",
        text: `Booking request submitted for ${data.appointment?.pet?.name || "your pet"} on ${data.appointment?.scheduled_at || workflowState.form.scheduled_at}. Your request is waiting for receptionist approval.`,
        suggestions: ["Check my booking status"],
      }]);
      closeWorkflow();
    } catch (err) {
      setWorkflowState((prev) => ({ ...prev, loading: false, error: err.message || "Failed to create booking." }));
    }
  };

  const submitLookupWorkflow = async (event) => {
    event.preventDefault();
    setWorkflowState((prev) => ({ ...prev, loading: true, error: "", results: [] }));
    try {
      const data = await lookupChatbotAppointments(workflowState.form.query);
      setWorkflowState((prev) => ({ ...prev, loading: false, results: normalizeList(data, ["appointments", "results"]) }));
    } catch (err) {
      setWorkflowState((prev) => ({ ...prev, loading: false, error: err.message || "Failed to look up appointments." }));
    }
  };

  const submitInventoryWorkflow = async (event) => {
    event.preventDefault();
    setWorkflowState((prev) => ({ ...prev, loading: true, error: "", results: [] }));
    try {
      const data = await searchChatbotInventory(workflowState.form.query);
      setWorkflowState((prev) => ({ ...prev, loading: false, results: normalizeList(data, ["items", "inventory", "products", "results"]) }));
    } catch (err) {
      setWorkflowState((prev) => ({ ...prev, loading: false, error: err.message || "Failed to search inventory." }));
    }
  };

  const submitTransactionLookupWorkflow = async (event) => {
    event.preventDefault();
    setWorkflowState((prev) => ({ ...prev, loading: true, error: "", results: [] }));
    try {
      const data = await apiRequest(`/cashier/transactions/search?q=${workflowState.form.query}`);
      setWorkflowState((prev) => ({ ...prev, loading: false, results: normalizeList(data, ["transactions", "sales", "results"]) }));
    } catch (err) {
      setWorkflowState((prev) => ({ ...prev, loading: false, error: err.message || "Failed to search transactions." }));
    }
  };

  const submitHotelBookingWorkflow = async (event) => {
    event.preventDefault();
    setWorkflowState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const data = await createChatbotHotelBooking({
        pet_id: Number(workflowState.form.hotel_pet_id),
        hotel_room_id: Number(workflowState.form.hotel_room_id),
        check_in: workflowState.form.check_in,
        check_out: workflowState.form.check_out,
        special_requests: workflowState.form.special_requests,
      });
      setMessages((prev) => [...prev, {
        sender: "bot",
        text: `Hotel booking request submitted for ${data.boarding?.pet?.name || "your pet"} from ${workflowState.form.check_in} to ${workflowState.form.check_out}. Waiting for receptionist approval.`,
        suggestions: ["Check my booking status"],
      }]);
      closeWorkflow();
    } catch (err) {
      setWorkflowState((prev) => ({ ...prev, loading: false, error: err.message || "Failed to create hotel booking." }));
    }
  };

  // ── Conversational booking flow (customer) ──────────────────────────────
  const startConvBooking = async (type) => {
    setConvFlow({ type, step: "loading", data: {}, options: {}, loading: true, error: "" });
    setMessages((prev) => [...prev, {
      sender: "bot",
      text: type === "appointment"
        ? "Let's book an appointment! First, which pet is this for?"
        : "Let's book a hotel stay! First, which pet is checking in?",
      timestamp: new Date().toISOString(),
      isBookingPrompt: true,
    }]);

    try {
      let options = {};
      if (type === "appointment") {
        const data = await fetchBookingOptions();
        options = {
          pets: normalizeList(data.pets || data, ["pets"]),
          services: normalizeList(data.services || data, ["services"]),
        };
      } else {
        const data = await fetchHotelOptions();
        options = {
          pets: normalizeList(data.pets || data, ["pets"]),
          rooms: normalizeList(data.rooms || data, ["rooms"]),
        };
      }

      if (!options.pets?.length) {
        setConvFlow(null);
        setMessages((prev) => [...prev, {
          sender: "bot",
          text: "No pets found on your account. Please add a pet first before booking.",
          timestamp: new Date().toISOString(),
          actions: [{ label: "Add My Pet", path: "/customer/pets" }],
        }]);
        return;
      }

      setConvFlow({ type, step: "select_pet", data: {}, options, loading: false, error: "" });
    } catch (err) {
      setConvFlow(null);
      setMessages((prev) => [...prev, {
        sender: "bot",
        text: `Could not load booking options: ${err.message}`,
        timestamp: new Date().toISOString(),
      }]);
    }
  };

  const convSelectPet = (pet) => {
    setMessages((prev) => [...prev, {
      sender: "user",
      text: `🐾 ${pet.name}${pet.species ? ` (${pet.species})` : ""}`,
      timestamp: new Date().toISOString(),
    }]);
    if (convFlow.type === "appointment") {
      setMessages((prev) => [...prev, {
        sender: "bot",
        text: `Great! Which service would you like for ${pet.name}?`,
        timestamp: new Date().toISOString(),
        isBookingPrompt: true,
      }]);
      setConvFlow((prev) => ({ ...prev, step: "select_service", data: { ...prev.data, pet_id: pet.id, pet_name: pet.name } }));
    } else {
      setMessages((prev) => [...prev, {
        sender: "bot",
        text: `Perfect! When would ${pet.name} like to check in? Please pick a date.`,
        timestamp: new Date().toISOString(),
        isBookingPrompt: true,
      }]);
      setConvFlow((prev) => ({ ...prev, step: "select_checkin", data: { ...prev.data, pet_id: pet.id, pet_name: pet.name } }));
    }
  };

  const convSelectService = (service) => {
    setMessages((prev) => [...prev, {
      sender: "user",
      text: `${service.name} (₱${Number(service.price || 0).toFixed(2)})`,
      timestamp: new Date().toISOString(),
    }]);
    setMessages((prev) => [...prev, {
      sender: "bot",
      text: `When would you like to schedule ${service.name}? Pick a date and time.`,
      timestamp: new Date().toISOString(),
      isBookingPrompt: true,
    }]);
    setConvFlow((prev) => ({ ...prev, step: "select_date", data: { ...prev.data, service_id: service.id, service_name: service.name, service_price: service.price } }));
  };

  const convSelectDate = (dateStr) => {
    const selected = new Date(dateStr);
    if (selected < new Date()) {
      setError("Please select a future date and time.");
      return;
    }
    setError("");
    const label = selected.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
    setMessages((prev) => [...prev, {
      sender: "user",
      text: `📅 ${label}`,
      timestamp: new Date().toISOString(),
    }]);
    setMessages((prev) => [...prev, {
      sender: "bot",
      text: "Any special instructions or notes for this appointment? (Optional — you can skip)",
      timestamp: new Date().toISOString(),
      isBookingPrompt: true,
    }]);
    setConvFlow((prev) => ({ ...prev, step: "add_notes", data: { ...prev.data, scheduled_at: dateStr } }));
  };

  const convCheckIn = (dateStr) => {
    setMessages((prev) => [...prev, {
      sender: "user",
      text: `📅 Check-in: ${dateStr}`,
      timestamp: new Date().toISOString(),
    }]);
    setMessages((prev) => [...prev, {
      sender: "bot",
      text: "And when will your pet check out?",
      timestamp: new Date().toISOString(),
      isBookingPrompt: true,
    }]);
    setConvFlow((prev) => ({ ...prev, step: "select_checkout", data: { ...prev.data, check_in: dateStr } }));
  };

  const convCheckOut = async (dateStr) => {
    const cin = new Date(convFlow.data.check_in);
    const cout = new Date(dateStr);
    if (cout <= cin) {
      setError("Check-out must be after check-in.");
      return;
    }
    setError("");
    setMessages((prev) => [...prev, {
      sender: "user",
      text: `📅 Check-out: ${dateStr}`,
      timestamp: new Date().toISOString(),
    }]);

    // Load available rooms
    setConvFlow((prev) => ({ ...prev, step: "select_room", loading: true, data: { ...prev.data, check_out: dateStr } }));
    setMessages((prev) => [...prev, {
      sender: "bot",
      text: "Loading available rooms...",
      timestamp: new Date().toISOString(),
      isBookingPrompt: true,
    }]);

    try {
      const data = await fetchHotelOptions();
      const rooms = normalizeList(data.rooms || data, ["rooms"]);
      setConvFlow((prev) => ({ ...prev, loading: false, options: { ...prev.options, rooms } }));
      setMessages((prev) => {
        // Replace the "Loading..." message
        const copy = [...prev];
        for (let i = copy.length - 1; i >= 0; i--) {
          if (copy[i].text === "Loading available rooms...") {
            copy[i] = {
              sender: "bot",
              text: rooms.length > 0
                ? "Which room would you prefer? (Or select Auto-Assign for the best available room.)"
                : "No rooms available for those dates.",
              timestamp: new Date().toISOString(),
              isBookingPrompt: true,
            };
            break;
          }
        }
        return copy;
      });
    } catch {
      setConvFlow((prev) => ({ ...prev, loading: false }));
    }
  };

  const convSelectRoom = (room) => {
    const label = room ? `${room.room_number} — ${room.type} (₱${room.daily_rate}/night)` : "Auto-Assign";
    setMessages((prev) => [...prev, {
      sender: "user",
      text: `🏠 ${label}`,
      timestamp: new Date().toISOString(),
    }]);
    setMessages((prev) => [...prev, {
      sender: "bot",
      text: "Any special requests for your pet's stay? (Optional — you can skip)",
      timestamp: new Date().toISOString(),
      isBookingPrompt: true,
    }]);
    setConvFlow((prev) => ({
      ...prev,
      step: "add_notes",
      data: { ...prev.data, room_id: room?.id || null, room_label: label },
    }));
  };

  const convAddNotes = (notes) => {
    if (notes) {
      setMessages((prev) => [...prev, {
        sender: "user",
        text: `📝 ${notes}`,
        timestamp: new Date().toISOString(),
      }]);
    }
    setConvFlow((prev) => ({ ...prev, step: "confirm", data: { ...prev.data, notes: notes || "" } }));
    setMessages((prev) => [...prev, {
      sender: "bot",
      text: "Here's your booking summary. Please review before confirming:",
      timestamp: new Date().toISOString(),
      isBookingPrompt: true,
    }]);
  };

  const convConfirm = async () => {
    setConvFlow((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      let data;
      if (convFlow.type === "appointment") {
        data = await createChatbotBooking({
          pet_id: convFlow.data.pet_id,
          service_id: convFlow.data.service_id,
          scheduled_at: convFlow.data.scheduled_at,
          notes: convFlow.data.notes || undefined,
        });
        setMessages((prev) => [...prev, {
          sender: "bot",
          text: `✅ Booking request submitted!\n\nBooking ID: #${data.appointment?.id || "—"}\nPet: ${convFlow.data.pet_name}\nService: ${convFlow.data.service_name}\n\n${CUSTOMER_APPROVAL_NOTICE}`,
          timestamp: new Date().toISOString(),
          isBookingSuccess: true,
          suggestions: ["Check my booking status", "Book another appointment"],
        }]);
      } else {
        data = await createChatbotHotelBooking({
          pet_id: convFlow.data.pet_id,
          hotel_room_id: convFlow.data.room_id || undefined,
          check_in: convFlow.data.check_in,
          check_out: convFlow.data.check_out,
          special_requests: convFlow.data.notes || undefined,
        });
        setMessages((prev) => [...prev, {
          sender: "bot",
          text: `✅ Hotel stay request submitted!\n\nBooking ID: #${data.boarding?.id || "—"}\nPet: ${convFlow.data.pet_name}\nDates: ${convFlow.data.check_in} → ${convFlow.data.check_out}\n\n${CUSTOMER_APPROVAL_NOTICE}`,
          timestamp: new Date().toISOString(),
          isBookingSuccess: true,
          suggestions: ["Check my booking status"],
        }]);
      }
      setConvFlow(null);
    } catch (err) {
      setConvFlow((prev) => ({ ...prev, loading: false, error: "" }));
      showError(err.message || "Unable to submit your booking. Please try again.", "Booking Failed");
    }
  };

  const cancelConvFlow = async () => {
    const confirmed = await showConfirm(
      "Are you sure you want to cancel this booking?",
      "Cancel Booking",
      "Yes, Cancel",
      "Keep Going",
      "question",
      true
    );
    if (!confirmed) return;
    setConvFlow(null);
    setError("");
    setMessages((prev) => [...prev, {
      sender: "bot",
      text: "Booking cancelled. What else can I help you with?",
      timestamp: new Date().toISOString(),
    }]);
  };

  // ── Live chat handlers ───────────────────────────────────────────────────
  const handleStartLiveChat = async () => {
    if (liveChatMode) return;
    setLiveChatMode({ sessionId: null, status: "starting" });
    setMessages((prev) => [...prev, {
      sender: "bot",
      text: "Connecting you to a staff member. Please wait...",
      liveChat: true,
      senderType: "system",
      timestamp: new Date().toISOString(),
    }]);
    try {
      const data = await startLiveChat();
      const sessionId = data.session?.id;
      liveChatLastIdRef.current = 0;

      // Seed the cursor to skip the backend's initial system message —
      // the frontend already shows its own "session started" message below.
      try {
        const seed = await pollLiveChatMessages(sessionId, 0);
        if (seed.messages?.length > 0) {
          liveChatLastIdRef.current = Math.max(...seed.messages.map((m) => m.id));
        }
      } catch { /* ignore seed errors */ }

      setLiveChatMode({ sessionId, status: "waiting" });
      setMessages((prev) => [...prev, {
        sender: "bot",
        text: "✅ Your live chat session has started! A staff member will be with you shortly. You can type your message below.",
        liveChat: true,
        senderType: "system",
        timestamp: new Date().toISOString(),
      }]);
    } catch (err) {
      setLiveChatMode(null);
      setMessages((prev) => [...prev, {
        sender: "bot",
        text: `Sorry, could not start live chat: ${err.message}`,
        timestamp: new Date().toISOString(),
      }]);
    }
  };

  const handleEndLiveChat = async () => {
    if (!liveChatMode?.sessionId) {
      setLiveChatMode(null);
      return;
    }
    const confirmed = await showConfirm(
      "Are you sure you want to end this live chat session? The staff member will be notified.",
      "End Live Chat",
      "End Chat",
      "Cancel",
      "question",
      true
    );
    if (!confirmed) return;
    try {
      await customerCloseChat(liveChatMode.sessionId);
    } catch {
      // Ignore — session may already be closed server-side
    }
    clearInterval(liveChatTimerRef.current);
    setLiveChatMode(null);
    setMessages((prev) => [...prev, {
      sender: "bot",
      text: "You've ended the live chat. Is there anything else I can help you with?",
      timestamp: new Date().toISOString(),
    }]);
  };

  // ── New chat reset ───────────────────────────────────────────────────────
  const handleNewChat = async () => {
    const hasLiveChat = liveChatMode?.sessionId && liveChatMode.status !== "closed";
    const confirmed = await showConfirm(
      hasLiveChat
        ? "This will end your live chat session and clear the entire conversation. Are you sure?"
        : "This will clear your conversation history and start over. Are you sure?",
      "Start New Chat",
      "Yes, Start Over",
      "Cancel",
      "question",
      true
    );
    if (!confirmed) return;

    // End live chat if active
    if (hasLiveChat) {
      try { await customerCloseChat(liveChatMode.sessionId); } catch { /* ignore */ }
    }
    clearInterval(liveChatTimerRef.current);
    setLiveChatMode(null);
    setConvFlow(null);
    setMessages([]);
    setInput("");
    setError("");
    setTypingMessage("");
    setIsTyping(false);
    setSessionContext({ lastIntent: null, lastEntityType: null, lastRequestId: null, lastPaymentStatus: null });
    // Clear persisted state so next open starts fresh
    clearChatCache(role);
    saveLiveChatSession(null);

    try {
      setIsBootstrapping(true);
      const data = await fetchChatbotWelcome();
      setMessages([{
        sender: "bot",
        text: data.reply || data.message || "Hi. I can help with your Pawesome workflow.",
        suggestions: normalizeList(data.suggestions),
        actions: normalizeList(data.actions),
        timestamp: new Date().toISOString(),
      }]);
    } catch (err) {
      setError(err.message || "Failed to restart chatbot.");
    } finally {
      setIsBootstrapping(false);
    }
  };

  // ── Quick actions by role ────────────────────────────────────────────────
  const quickActionsByRole = {
    customer: [
      { label: "Book Appointment", icon: faCalendarPlus, convFlow: "appointment" },
      { label: "Book Hotel Stay", icon: faHotel, convFlow: "hotel" },
      { label: "Talk to Staff", icon: faHeadset, liveChat: true },
      { label: "My Requests", icon: faCalendarCheck, path: "/customer/requests" },
    ],
    cashier: [
      { label: "Pending Payments", icon: faCalendarCheck, path: "/cashier/payment-verification" },
      { label: "POS", icon: faCashRegister, path: "/cashier/pos" },
      { label: "Receipts", icon: faReceipt, message: "print receipt" },
      { label: "Transaction History", icon: faChartLine, path: "/cashier/transactions" },
    ],
    admin: [
      { label: "Reports", icon: faChartLine, path: "/admin/reports" },
      { label: "Logs", icon: faRobot, path: "/admin/chatbot" },
      { label: "Users", icon: faUsers, path: "/admin/users" },
      { label: "Live Chat", icon: faComments, path: "/admin/live-chat" },
    ],
    receptionist: [
      { label: "Pending Approvals", icon: faCalendarCheck, path: "/receptionist/approvals" },
      { label: "Booking Schedule", icon: faCalendarPlus, path: "/receptionist/bookings" },
      { label: "Customer Records", icon: faUsers, path: "/receptionist/customers" },
      { label: "Live Chat", icon: faComments, path: "/receptionist/live-chat" },
    ],
    inventory: [
      { label: "Inventory Items", icon: faBoxOpen, path: "/inventory/stock" },
      { label: "Low Stock", icon: faTriangleExclamation, message: "low stock items" },
      { label: "Stock Logs", icon: faChartLine, path: "/inventory/logs" },
    ],
    veterinary: [
      { label: "Today's Appointments", icon: faCalendarCheck, path: "/veterinary/appointments" },
      { label: "Pet Records", icon: faUsers, path: "/veterinary/records" },
    ],
    manager: [
      { label: "Reports", icon: faChartLine, path: "/manager/reports" },
      { label: "Logs", icon: faRobot, path: "/manager/history" },
      { label: "Users", icon: faUsers, path: "/manager/staff" },
    ],
  };

  const quickActions = quickActionsByRole[role] || [
    { label: "Dashboard Help", icon: faChartLine, message: "Help me understand this dashboard." },
  ];

  const containerClass = `rbac-chatbot ${mode} ${isOpen ? "open" : ""}`;

  // ── Render booking flow inline step ─────────────────────────────────────
  const renderConvFlowStep = () => {
    if (!convFlow || convFlow.step === "loading" || convFlow.step === "done") return null;

    return (
      <div className="rbac-booking-step">
        {convFlow.error && <div className="rbac-booking-error">{convFlow.error}</div>}

        {/* Select pet */}
        {convFlow.step === "select_pet" && (
          <div className="rbac-booking-chips">
            {convFlow.options.pets.map((pet) => (
              <button key={pet.id} className="rbac-booking-chip" onClick={() => convSelectPet(pet)}>
                🐾 {pet.name}
                {pet.species && <span className="rbac-chip-sub">{pet.species}</span>}
              </button>
            ))}
          </div>
        )}

        {/* Select service */}
        {convFlow.step === "select_service" && (
          <div className="rbac-booking-chips">
            {convFlow.options.services.map((svc) => (
              <button key={svc.id} className="rbac-booking-chip" onClick={() => convSelectService(svc)}>
                {svc.name}
                <span className="rbac-chip-sub">₱{Number(svc.price || 0).toFixed(2)}</span>
              </button>
            ))}
          </div>
        )}

        {/* Select date (appointment) */}
        {convFlow.step === "select_date" && (
          <div className="rbac-booking-datepicker">
            <DatePickerInput
              selected={convFlow.data.scheduled_at ? new Date(convFlow.data.scheduled_at) : null}
              onChange={(date) => date && convSelectDate(date.toISOString())}
              showTimeSelect
              dateFormat="MMMM d, yyyy h:mm aa"
              placeholderText="Pick date and time..."
              minDate={new Date()}
            />
          </div>
        )}

        {/* Select check-in */}
        {convFlow.step === "select_checkin" && (
          <div className="rbac-booking-datepicker">
            <DatePickerInput
              selected={convFlow.data.check_in ? new Date(convFlow.data.check_in) : null}
              onChange={(date) => date && convCheckIn(date.toISOString().split("T")[0])}
              placeholderText="Pick check-in date..."
              minDate={new Date()}
            />
          </div>
        )}

        {/* Select check-out */}
        {convFlow.step === "select_checkout" && (
          <div className="rbac-booking-datepicker">
            <DatePickerInput
              selected={convFlow.data.check_out ? new Date(convFlow.data.check_out) : null}
              onChange={(date) => date && convCheckOut(date.toISOString().split("T")[0])}
              placeholderText="Pick check-out date..."
              minDate={convFlow.data.check_in ? new Date(new Date(convFlow.data.check_in).getTime() + 86400000) : new Date()}
            />
          </div>
        )}

        {/* Select room */}
        {convFlow.step === "select_room" && !convFlow.loading && (
          <div className="rbac-booking-chips">
            <button className="rbac-booking-chip rbac-chip-auto" onClick={() => convSelectRoom(null)}>
              🏠 Auto-Assign
              <span className="rbac-chip-sub">Best available</span>
            </button>
            {convFlow.options.rooms?.map((room) => (
              <button key={room.id} className="rbac-booking-chip" onClick={() => convSelectRoom(room)}>
                Room {room.room_number}
                <span className="rbac-chip-sub">{room.type} · ₱{room.daily_rate}/night</span>
              </button>
            ))}
          </div>
        )}

        {/* Add notes */}
        {convFlow.step === "add_notes" && (
          <div className="rbac-booking-notes-area">
            <textarea
              placeholder="e.g. My pet is anxious around loud noises..."
              rows={3}
              id="conv-notes-input"
            />
            <div className="rbac-booking-notes-actions">
              <button
                className="rbac-booking-chip"
                onClick={() => {
                  const el = document.getElementById("conv-notes-input");
                  convAddNotes(el?.value?.trim() || "");
                }}
              >
                <FontAwesomeIcon icon={faCheck} /> Continue
              </button>
              <button className="rbac-booking-skip" onClick={() => convAddNotes("")}>
                Skip
              </button>
            </div>
          </div>
        )}

        {/* Confirm */}
        {convFlow.step === "confirm" && (
          <div className="rbac-booking-confirm-card">
            {convFlow.type === "appointment" ? (
              <>
                <div className="rbac-booking-confirm-row"><span>Pet</span><strong>{convFlow.data.pet_name}</strong></div>
                <div className="rbac-booking-confirm-row"><span>Service</span><strong>{convFlow.data.service_name}</strong></div>
                <div className="rbac-booking-confirm-row"><span>Price</span><strong>₱{Number(convFlow.data.service_price || 0).toFixed(2)}</strong></div>
                <div className="rbac-booking-confirm-row"><span>Date & Time</span><strong>{new Date(convFlow.data.scheduled_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</strong></div>
                {convFlow.data.notes && <div className="rbac-booking-confirm-row"><span>Notes</span><strong>{convFlow.data.notes}</strong></div>}
              </>
            ) : (
              <>
                <div className="rbac-booking-confirm-row"><span>Pet</span><strong>{convFlow.data.pet_name}</strong></div>
                <div className="rbac-booking-confirm-row"><span>Check-in</span><strong>{convFlow.data.check_in}</strong></div>
                <div className="rbac-booking-confirm-row"><span>Check-out</span><strong>{convFlow.data.check_out}</strong></div>
                <div className="rbac-booking-confirm-row"><span>Room</span><strong>{convFlow.data.room_label}</strong></div>
                {convFlow.data.notes && <div className="rbac-booking-confirm-row"><span>Notes</span><strong>{convFlow.data.notes}</strong></div>}
              </>
            )}
            <div className="rbac-booking-confirm-actions">
              <button
                className="rbac-booking-confirm-btn"
                onClick={convConfirm}
                disabled={convFlow.loading}
              >
                {convFlow.loading ? "Submitting..." : <><FontAwesomeIcon icon={faCheck} /> Confirm Booking</>}
              </button>
              <button className="rbac-booking-cancel-btn" onClick={cancelConvFlow}>
                <FontAwesomeIcon icon={faTimes} /> Cancel
              </button>
            </div>
          </div>
        )}

        {convFlow.step !== "confirm" && (
          <button className="rbac-booking-cancel-link" onClick={cancelConvFlow}>
            Cancel booking
          </button>
        )}
      </div>
    );
  };

  return (
    <div className={containerClass}>
      {mode === "widget" && !isOpen && (
        <button type="button" className="rbac-chatbot-toggle" onClick={() => setIsOpen(true)}>
          <div className="rbac-toggle-icon-wrap">
            <img src={botIcon} alt="Pawesome Assistant" className="rbac-toggle-bot-img" />
            {liveChatMode?.status === "waiting" && <span className="rbac-toggle-pulse" />}
          </div>
          <span className="rbac-chatbot-toggle-text">Assistant</span>
          {liveChatMode?.status === "waiting" && (
            <span className="rbac-toggle-badge">•</span>
          )}
        </button>
      )}

      {isOpen && (
        <section className="rbac-chatbot-panel">
          {/* Header */}
          <header className="rbac-chatbot-header">
            <div className="rbac-chatbot-title-wrap">
              <div className="rbac-avatar-wrap">
                <img src={botIcon} alt="Pawesome Assistant" className="rbac-avatar-img" />
                <span className={`rbac-avatar-status ${liveChatMode?.status === "waiting" ? "waiting" : ""}`} />
              </div>
              <div>
                <h3>{liveChatMode ? "Live Chat" : title}</h3>
                <p>{liveChatMode
                  ? liveChatMode.status === "active" ? "Staff is with you" : liveChatMode.status === "waiting" ? "Waiting for staff..." : "Chat ended"
                  : subtitle}
                </p>
              </div>
            </div>
            <div className="rbac-chatbot-header-actions">
              {liveChatMode && liveChatMode.status !== "closed" && (
                <button
                  type="button"
                  className="rbac-chatbot-icon-btn rbac-livechat-end-btn"
                  onClick={handleEndLiveChat}
                  title="End Chat"
                >
                  <FontAwesomeIcon icon={faXmark} />
                  End Chat
                </button>
              )}
              {!liveChatMode && (
                <button type="button" className="rbac-chatbot-icon-btn" onClick={handleNewChat} title="New Chat">
                  <FontAwesomeIcon icon={faRotateRight} />
                </button>
              )}
              {mode === "widget" && (
                <button type="button" className="rbac-chatbot-icon-btn" onClick={() => setIsOpen(false)} title="Close">
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              )}
            </div>
          </header>

          {/* Body */}
          <div className="rbac-chatbot-body">
            {!isBootstrapping && role === "customer" && !liveChatMode && !convFlow && (
              <div className="rbac-customer-flow-notice">
                <strong>Receptionist Approval Required</strong>
                <span>Booking requests are submitted for receptionist review.</span>
              </div>
            )}

            {!isBootstrapping && !convFlow && !liveChatMode && (
              <div className="rbac-quick-actions-bar">
                {quickActions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    className="rbac-quick-action"
                    onClick={() => {
                      if (action.convFlow) {
                        startConvBooking(action.convFlow);
                      } else if (action.liveChat) {
                        handleStartLiveChat();
                      } else if (action.workflow) {
                        openWorkflow(action.workflow);
                      } else if (action.path) {
                        onAction(action.path);
                      } else if (action.message) {
                        submitMessage(action.message);
                      }
                    }}
                  >
                    <FontAwesomeIcon icon={action.icon} />
                    <span>{action.label}</span>
                  </button>
                ))}
              </div>
            )}

            {isBootstrapping ? (
              <div className="rbac-chatbot-state">Loading chatbot...</div>
            ) : (
              <>
                {messages.map((message, index) => (
                  <div
                    key={`${message.sender}-${index}`}
                    className={`rbac-chat-message ${message.sender} ${message.liveChat ? "livechat" : ""} ${message.isBookingSuccess ? "booking-success" : ""}`}
                  >
                    {message.sender === "bot" && (
                      <div className="rbac-msg-avatar-wrap">
                        {message.liveChat && message.senderType === "staff" ? (
                          <div className="rbac-staff-avatar">
                            {(message.senderName || "S").charAt(0).toUpperCase()}
                          </div>
                        ) : (
                          <img src={botIcon} alt="bot" className="rbac-msg-bot-img" />
                        )}
                      </div>
                    )}
                    <div className="rbac-chat-bubble">
                      {message.senderType === "staff" && (
                        <span className="rbac-livechat-sender-label">{message.senderName}</span>
                      )}
                      {message.senderType === "system" && (
                        <span className="rbac-livechat-system-indicator">System</span>
                      )}
                      {formatMessage(message.text).map((line, lineIndex) => (
                        <p key={lineIndex}>{line}</p>
                      ))}
                      {message.source === "ai" && message.sender === "bot" && (
                        <span className="rbac-ai-indicator" title="AI-generated response">
                          <FontAwesomeIcon icon={faWandMagicSparkles} /> AI
                        </span>
                      )}
                      {message.suggestions?.length > 0 && (
                        <div className="rbac-chat-actions">
                          {normalizeList(message.suggestions).map((suggestion) => (
                            <button key={suggestion} type="button" className="rbac-chip" onClick={() => submitMessage(suggestion)}>
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      )}
                      {message.actions?.length > 0 && (
                        <div className="rbac-chat-actions">
                          {normalizeList(message.actions).map((action) => (
                            <button
                              key={`${action.label}-${action.path}`}
                              type="button"
                              className="rbac-link-action"
                              onClick={() =>
                                action.type === "workflow"
                                  ? openWorkflow(action.workflow)
                                  : onAction(action.path)
                              }
                            >
                              {action.label}
                            </button>
                          ))}
                        </div>
                      )}
                      {message.timestamp && (
                        <span className="rbac-msg-timestamp">{formatTime(message.timestamp)}</span>
                      )}
                    </div>
                  </div>
                ))}

                {/* Conversational booking UI */}
                {convFlow && renderConvFlowStep()}

                {/* Live chat waiting animation */}
                {liveChatMode?.status === "waiting" && (
                  <div className="rbac-livechat-waiting-anim">
                    <span /><span /><span />
                    Waiting for a staff member...
                  </div>
                )}

                {isTyping && (
                  <div className="rbac-message rbac-message-bot">
                    <div className="rbac-message-avatar">
                      <span className="rbac-typing-indicator"><span /><span /><span /></span>
                    </div>
                    <div className="rbac-message-content">
                      <div className="rbac-message-text">{typingMessage}<span className="rbac-cursor">|</span></div>
                    </div>
                  </div>
                )}
                {isLoading && !isTyping && <div className="rbac-chatbot-state">Assistant is thinking...</div>}
                {error && <div className="rbac-chatbot-error">{error}</div>}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input form */}
          {!convFlow || ["add_notes"].includes(convFlow?.step) ? (
            <form className="rbac-chatbot-form" onSubmit={onSubmit}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  liveChatMode?.status === "waiting"
                    ? "Type a message for staff..."
                    : liveChatMode?.status === "active"
                    ? "Message to staff..."
                    : role === "customer"
                    ? "Ask about bookings, services, or your account..."
                    : "Ask about bookings, services, logs, or dashboard help..."
                }
                disabled={isLoading || isBootstrapping || !!convFlow}
              />
              <button type="submit" disabled={!input.trim() || isLoading || isBootstrapping || (!!convFlow && convFlow.step !== "add_notes")}>
                <FontAwesomeIcon icon={faPaperPlane} />
              </button>
            </form>
          ) : null}
        </section>
      )}

      {/* ── Old modal workflows (non-customer roles) ─────────────────────── */}
      {workflow && (
        <div className="rbac-workflow-overlay" onClick={closeWorkflow}>
          <div className="rbac-workflow-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rbac-workflow-header">
              <h4>
                {workflow === "create_booking" && "Create Booking"}
                {workflow === "appointment_lookup" && "Appointment Lookup"}
                {workflow === "inventory_search" && "Inventory Search"}
                {workflow === "hotel_booking" && "Book Pet Hotel Stay"}
                {workflow === "transaction_lookup" && "Transaction Lookup"}
              </h4>
              <button type="button" onClick={closeWorkflow}>Close</button>
            </div>

            {workflow === "create_booking" && (
              <form className="rbac-workflow-form" onSubmit={submitBookingWorkflow}>
                <label>Pet
                  <select value={workflowState.form.pet_id} onChange={(e) => updateWorkflowForm("pet_id", e.target.value)}>
                    {normalizeList(workflowState.options.pets).map((pet) => (
                      <option key={pet.id} value={pet.id}>{pet.name} {pet.species ? `(${pet.species})` : ""}</option>
                    ))}
                  </select>
                </label>
                <label>Service
                  <select value={workflowState.form.service_id} onChange={(e) => updateWorkflowForm("service_id", e.target.value)}>
                    {normalizeList(workflowState.options.services).map((svc) => (
                      <option key={svc.id} value={svc.id}>{svc.name} (₱{Number(svc.price || 0).toFixed(2)})</option>
                    ))}
                  </select>
                </label>
                <label>Schedule
                  <input type="datetime-local" value={workflowState.form.scheduled_at} onChange={(e) => updateWorkflowForm("scheduled_at", e.target.value)} required />
                </label>
                <button type="submit" disabled={workflowState.loading}>{workflowState.loading ? "Submitting..." : "Submit Booking Request"}</button>
              </form>
            )}

            {workflow === "appointment_lookup" && (
              <form className="rbac-workflow-form" onSubmit={submitLookupWorkflow}>
                <label>Search appointments
                  <input type="text" value={workflowState.form.query} onChange={(e) => updateWorkflowForm("query", e.target.value)} placeholder="Pet, customer, service, or status" />
                </label>
                <button type="submit" disabled={workflowState.loading}>{workflowState.loading ? "Searching..." : "Search"}</button>
              </form>
            )}

            {workflow === "inventory_search" && (
              <form className="rbac-workflow-form" onSubmit={submitInventoryWorkflow}>
                <label>Search inventory
                  <input type="text" value={workflowState.form.query} onChange={(e) => updateWorkflowForm("query", e.target.value)} placeholder="Product name, SKU, or description" required />
                </label>
                <button type="submit" disabled={workflowState.loading}>{workflowState.loading ? "Searching..." : "Search"}</button>
              </form>
            )}

            {workflow === "transaction_lookup" && (
              <form className="rbac-workflow-form" onSubmit={submitTransactionLookupWorkflow}>
                <label>Search transactions
                  <input type="text" value={workflowState.form.query} onChange={(e) => updateWorkflowForm("query", e.target.value)} placeholder="Transaction ID, customer name, or amount" required />
                </label>
                <button type="submit" disabled={workflowState.loading}>{workflowState.loading ? "Searching..." : "Search"}</button>
              </form>
            )}

            {workflow === "hotel_booking" && (
              <form className="rbac-workflow-form" onSubmit={submitHotelBookingWorkflow}>
                <label>Pet
                  <select value={workflowState.form.hotel_pet_id} onChange={(e) => updateWorkflowForm("hotel_pet_id", e.target.value)}>
                    {normalizeList(workflowState.options.pets).map((pet) => (
                      <option key={pet.id} value={pet.id}>{pet.name} {pet.species ? `(${pet.species})` : ""}</option>
                    ))}
                  </select>
                </label>
                <label>Check-in Date
                  <DatePickerInput
                    selected={workflowState.form.check_in ? new Date(workflowState.form.check_in) : null}
                    onChange={(date) => updateWorkflowForm("check_in", date ? date.toISOString().split("T")[0] : "")}
                    placeholderText="Pick check-in..."
                    required
                  />
                </label>
                <label>Check-out Date
                  <DatePickerInput
                    selected={workflowState.form.check_out ? new Date(workflowState.form.check_out) : null}
                    onChange={(date) => updateWorkflowForm("check_out", date ? date.toISOString().split("T")[0] : "")}
                    placeholderText="Pick check-out..."
                    required
                  />
                </label>
                <label>Room (Optional)
                  <select value={workflowState.form.hotel_room_id} onChange={(e) => updateWorkflowForm("hotel_room_id", e.target.value)}>
                    <option value="">Auto-assign available room</option>
                    {normalizeList(workflowState.options.rooms).map((room) => (
                      <option key={room.id} value={room.id}>{room.room_number} - {room.type} (₱{room.daily_rate}/night)</option>
                    ))}
                  </select>
                </label>
                <label>Special Requests
                  <textarea value={workflowState.form.special_requests} onChange={(e) => updateWorkflowForm("special_requests", e.target.value)} placeholder="Any special care instructions..." rows="3" />
                </label>
                <button type="submit" disabled={workflowState.loading}>{workflowState.loading ? "Submitting..." : "Submit Hotel Request"}</button>
              </form>
            )}

            {workflowState.error && <div className="rbac-chatbot-error">{workflowState.error}</div>}
            {workflowState.loading && workflow !== "create_booking" && <div className="rbac-chatbot-state">Loading workflow...</div>}

            {workflowState.results.length > 0 && (
              <div className="rbac-workflow-results">
                {normalizeList(workflowState.results).map((item) => (
                  <div key={`${workflow}-${item.id}`} className="rbac-result-card">
                    {workflow === "appointment_lookup" ? (
                      <>
                        <strong>{item.pet || "Pet"} - {item.service || "Service"}</strong>
                        <span>{item.customer || "Customer"} | {item.status}</span>
                        <span>{item.scheduled_at}</span>
                      </>
                    ) : workflow === "transaction_lookup" ? (
                      <>
                        <strong>#{item.id || item.transaction_id}</strong>
                        <span>{item.customer || "Guest"} | {item.payment_type}</span>
                        <span>Amount: ₱{Number(item.amount || 0).toFixed(2)}</span>
                        <span>{item.date || item.created_at}</span>
                      </>
                    ) : (
                      <>
                        <strong>{item.name}</strong>
                        <span>SKU: {item.sku}</span>
                        <span>Stock: {item.stock}</span>
                        <span>Price: ₱{Number(item.price || 0).toFixed(2)}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!workflowState.loading && workflowState.results.length === 0 && workflowState.form.query && workflow !== "create_booking" && !workflowState.error && (
              <div className="rbac-chatbot-state">No results found.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RoleAwareChatbot;
