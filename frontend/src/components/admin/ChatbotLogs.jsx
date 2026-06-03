import React, { useEffect, useMemo, useState } from "react";
import { showConfirm, showSuccess, showError } from "../../utils/alert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBook,
  faChartLine,
  faCheckCircle,
  faClock,
  faCoins,
  faComments,
  faDownload,
  faEdit,
  faFilter,
  faMagnifyingGlass,
  faPlus,
  faRobot,
  faRotateRight,
  faSave,
  faSpinner,
  faTags,
  faTimes,
  faTrash,
  faTriangleExclamation,
  faUser,
  faWrench,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import { formatCurrency } from "../../utils/currency";
import "./ChatbotLogs.css";

const FAQ_SCOPES = [
  "general",
  "admin",
  "customer",
  "receptionist",
  "veterinary",
  "cashier",
  "inventory",
  "manager",
];

const SERVICE_CATEGORIES = [
  "Consultation",
  "Vaccination",
  "Treatment",
  "Emergency",
  "Surgery",
  "Dental",
  "Diagnostics",
  "Boarding Care",
  "Medication",
  "Grooming",
  "Hotel",
  "Other",
];

const emptyFaq = {
  question: "",
  answer: "",
  keywords: "",
  scope: "general",
  is_active: true,
  sort_order: 0,
};

const emptyService = {
  name: "",
  category: "Consultation",
  price: "",
  duration_minutes: "",
  description: "",
  is_active: true,
};

const ChatbotLogs = () => {
  const [activeTab, setActiveTab] = useState("logs");

  const [chatLogs, setChatLogs] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userChats, setUserChats] = useState([]);

  const [faqs, setFaqs] = useState([]);
  const [services, setServices] = useState([]);

  const [faqForm, setFaqForm] = useState(emptyFaq);
  const [serviceForm, setServiceForm] = useState(emptyService);

  const [editingFaqId, setEditingFaqId] = useState(null);
  const [editingServiceId, setEditingServiceId] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [serviceCategoryFilter, setServiceCategoryFilter] = useState("all");

  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  const safeArray = (value) => {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.data)) return value.data;
    if (Array.isArray(value?.data?.data)) return value.data.data;
    if (Array.isArray(value?.logs)) return value.logs;
    if (Array.isArray(value?.faqs)) return value.faqs;
    if (Array.isArray(value?.services)) return value.services;
    if (Array.isArray(value?.records)) return value.records;
    if (Array.isArray(value?.items)) return value.items;
    if (Array.isArray(value?.results)) return value.results;
    return [];
  };

  const normalizeKeywords = (keywords) => {
    if (Array.isArray(keywords)) return keywords.join(", ");
    if (typeof keywords === "string") return keywords;
    return "";
  };

  const keywordPayload = (keywords) =>
    String(keywords || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  const showMessage = (type, message) => {
    if (type === "success") {
      setSuccess(message);
      window.clearTimeout(window.chatbotSuccessTimer);
      window.chatbotSuccessTimer = window.setTimeout(() => setSuccess(""), 3000);
      showSuccess(message);
      return;
    }

    setError(message);
    window.clearTimeout(window.chatbotErrorTimer);
    window.chatbotErrorTimer = window.setTimeout(() => setError(""), 5000);
    showError(message);
  };

  const formatDateTime = (value) => {
    if (!value) return "No date";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const getUserInitials = (name = "") => {
    const parts = String(name || "User")
      .trim()
      .split(" ")
      .filter(Boolean);

    if (parts.length === 0) return "U";
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();

    return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
  };

  const normalizeLog = (log, index) => ({
    id: log.id || log.user_id || index + 1,
    user_id: log.user_id || log.id || index + 1,
    user_name: log.user_name || log.name || log.customer_name || "Unknown User",
    user_role: log.user_role || log.role || "user",
    total_chats: Number(log.total_chats || log.chat_count || log.count || 0),
    last_chat_date:
      log.last_chat_date || log.last_message_at || log.updated_at || log.created_at || "",
    raw: log,
  });

  const normalizeChat = (chat, index) => ({
    id: chat.id || index + 1,
    intent: chat.intent || chat.category || "general",
    user_message: chat.user_message || chat.message || chat.question || "",
    bot_response: chat.bot_response || chat.response || chat.answer || "",
    created_at: chat.created_at || chat.timestamp || "",
  });

  const normalizeFaq = (faq) => ({
    ...faq,
    keywords: Array.isArray(faq.keywords)
      ? faq.keywords
      : typeof faq.keywords === "string" && faq.keywords.startsWith("[")
      ? (() => {
          try {
            return JSON.parse(faq.keywords);
          } catch {
            return faq.keywords
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean);
          }
        })()
      : typeof faq.keywords === "string"
      ? faq.keywords
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : [],
    is_active:
      faq.is_active === true ||
      faq.is_active === 1 ||
      faq.is_active === "1" ||
      String(faq.status || "").toLowerCase() === "active",
  });

  const normalizeService = (service) => ({
    ...service,
    category: service.category || service.service_category || "Other",
    price: Number(service.price || service.amount || 0),
    duration_minutes: service.duration_minutes || service.duration || "",
    is_active:
      service.is_active === undefined ||
      service.is_active === true ||
      service.is_active === 1 ||
      service.is_active === "1" ||
      String(service.status || "").toLowerCase() === "active",
  });

  const loadData = async ({ silent = false } = {}) => {
    try {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const [logsData, faqData, serviceData] = await Promise.all([
        apiRequest("/admin/chatbot/logs"),
        apiRequest("/admin/chatbot/faqs"),
        apiRequest("/admin/services"),
      ]);

      setChatLogs(safeArray(logsData).map(normalizeLog));
      setFaqs(safeArray(faqData).map(normalizeFaq));
      setServices(safeArray(serviceData).map(normalizeService));
      setLastUpdated(new Date().toLocaleString("en-PH"));
      setError("");
    } catch (err) {
      console.error("Failed to load chatbot data:", err);
      showMessage("error", err.message || "Failed to load chatbot management data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadUserChats = async (userId) => {
    try {
      setDetailsLoading(true);
      const data = await apiRequest(`/admin/chatbot/logs/user/${userId}`);
      setUserChats(safeArray(data).map(normalizeChat));
    } catch (err) {
      console.error("Failed to load user chats:", err);
      showMessage("error", err.message || "Failed to load chat history.");
      setUserChats([]);
    } finally {
      setDetailsLoading(false);
    }
  };

  const openUserChats = (log) => {
    setSelectedUser(log);
    loadUserChats(log.user_id);
  };

  const resetFaqForm = () => {
    setFaqForm(emptyFaq);
    setEditingFaqId(null);
  };

  const resetServiceForm = () => {
    setServiceForm(emptyService);
    setEditingServiceId(null);
  };

  const submitFaq = async (event) => {
    event.preventDefault();

    if (!faqForm.question.trim()) {
      showMessage("error", "FAQ question is required.");
      return;
    }

    if (!faqForm.answer.trim()) {
      showMessage("error", "FAQ answer is required.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        question: faqForm.question.trim(),
        answer: faqForm.answer.trim(),
        keywords: keywordPayload(faqForm.keywords),
        scope: faqForm.scope || "general",
        is_active: Boolean(faqForm.is_active),
        sort_order: Number(faqForm.sort_order || 0),
      };

      if (editingFaqId) {
        await apiRequest(`/admin/chatbot/faqs/${editingFaqId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest("/admin/chatbot/faqs", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      resetFaqForm();
      await loadData({ silent: true });
      showMessage(
        "success",
        editingFaqId ? "FAQ updated successfully." : "FAQ created successfully."
      );
    } catch (err) {
      console.error("Failed to save FAQ:", err);
      showMessage("error", err.message || "Failed to save FAQ.");
    } finally {
      setSaving(false);
    }
  };

  const submitService = async (event) => {
    event.preventDefault();

    if (!serviceForm.name.trim()) {
      showMessage("error", "Service name is required.");
      return;
    }

    if (serviceForm.price === "" || Number(serviceForm.price) < 0) {
      showMessage("error", "Please enter a valid service price.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        name: serviceForm.name.trim(),
        category: serviceForm.category || "Other",
        price: Number(serviceForm.price || 0),
        duration_minutes:
          serviceForm.duration_minutes === ""
            ? null
            : Number(serviceForm.duration_minutes || 0),
        description: serviceForm.description?.trim() || "",
        is_active: Boolean(serviceForm.is_active),
      };

      if (editingServiceId) {
        await apiRequest(`/admin/services/${editingServiceId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest("/admin/services", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      resetServiceForm();
      await loadData({ silent: true });
      showMessage(
        "success",
        editingServiceId ? "Service updated successfully." : "Service created successfully."
      );
    } catch (err) {
      console.error("Failed to save service:", err);
      showMessage("error", err.message || "Failed to save service.");
    } finally {
      setSaving(false);
    }
  };

  const removeFaq = async (id) => {
    if (!(await showConfirm("Delete this FAQ?"))) return;

    try {
      await apiRequest(`/admin/chatbot/faqs/${id}`, { method: "DELETE" });
      await loadData({ silent: true });
      showMessage("success", "FAQ deleted.");
    } catch (err) {
      console.error("Failed to delete FAQ:", err);
      showMessage("error", err.message || "Failed to delete FAQ.");
    }
  };

  const removeService = async (id) => {
    if (!(await showConfirm("Delete this service?"))) return;

    try {
      await apiRequest(`/admin/services/${id}`, { method: "DELETE" });
      await loadData({ silent: true });
      showMessage("success", "Service deleted.");
    } catch (err) {
      console.error("Failed to delete service:", err);
      showMessage("error", err.message || "Failed to delete service.");
    }
  };

  const startEditFaq = (faq) => {
    setEditingFaqId(faq.id);
    setFaqForm({
      question: faq.question || "",
      answer: faq.answer || "",
      keywords: normalizeKeywords(faq.keywords),
      scope: faq.scope || "general",
      is_active: Boolean(faq.is_active),
      sort_order: faq.sort_order ?? 0,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startEditService = (service) => {
    setEditingServiceId(service.id);
    setServiceForm({
      name: service.name || "",
      category: service.category || "Other",
      price: service.price ?? "",
      duration_minutes: service.duration_minutes ?? "",
      description: service.description || "",
      is_active: Boolean(service.is_active),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const filteredLogs = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    return chatLogs.filter((log) => {
      const searchable = [log.user_name, log.user_role, log.total_chats, log.last_chat_date]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return !keyword || searchable.includes(keyword);
    });
  }, [chatLogs, searchTerm]);

  const filteredFaqs = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    return faqs.filter((faq) => {
      const searchable = [faq.question, faq.answer, faq.scope, ...(faq.keywords || [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !keyword || searchable.includes(keyword);
      const matchesScope = scopeFilter === "all" || faq.scope === scopeFilter;

      return matchesSearch && matchesScope;
    });
  }, [faqs, searchTerm, scopeFilter]);

  const filteredServices = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    return services.filter((service) => {
      const searchable = [service.name, service.category, service.price, service.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !keyword || searchable.includes(keyword);
      const matchesCategory =
        serviceCategoryFilter === "all" || service.category === serviceCategoryFilter;

      return matchesSearch && matchesCategory;
    });
  }, [services, searchTerm, serviceCategoryFilter]);

  const stats = useMemo(() => {
    const totalChats = chatLogs.reduce(
      (sum, log) => sum + Number(log.total_chats || 0),
      0
    );

    return [
      {
        label: "Total Users",
        value: chatLogs.length,
        icon: faUser,
        tone: "primary",
      },
      {
        label: "Total Chats",
        value: totalChats,
        icon: faComments,
        tone: "info",
      },
      {
        label: "Active FAQs",
        value: faqs.filter((faq) => faq.is_active).length,
        icon: faBook,
        tone: "success",
      },
      {
        label: "Services",
        value: services.length,
        icon: faCoins,
        tone: "warning",
      },
    ];
  }, [chatLogs, faqs, services]);

  const exportLogsCSV = () => {
    if (filteredLogs.length === 0) {
      showMessage("error", "No chatbot logs available to export.");
      return;
    }

    const headers = ["User ID", "User Name", "Role", "Total Chats", "Last Chat Date"];

    const rows = filteredLogs.map((log) => [
      log.user_id,
      log.user_name,
      log.user_role,
      log.total_chats,
      log.last_chat_date,
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row.map((value) => `"${String(value || "").replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `chatbot-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();

    URL.revokeObjectURL(url);
    showMessage("success", "Chatbot logs exported successfully.");
  };

  const clearFilters = () => {
    setSearchTerm("");
    setScopeFilter("all");
    setServiceCategoryFilter("all");
  };

  return (
    <div className="chatbot-logs chatbot-admin-console">
      {success && (
        <div className="chatbot-toast success">
          <FontAwesomeIcon icon={faCheckCircle} />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="chatbot-toast error">
          <FontAwesomeIcon icon={faTriangleExclamation} />
          <span>{error}</span>
        </div>
      )}

      <section className="chatbot-hero">
        <div>
          <span className="eyebrow">
            <FontAwesomeIcon icon={faRobot} />
            Admin AI Console
          </span>

          <h2>
            <FontAwesomeIcon icon={faRobot} />
            Chatbot Control Center
          </h2>

          <p>
            Monitor conversations, manage chatbot FAQs, and update service answers
            used by the customer-facing assistant.
          </p>

          <small className="last-updated">
            Last updated: {lastUpdated || "Not yet refreshed"}
          </small>
        </div>

        <div className="chatbot-hero-actions">
          <button
            className={`refresh-btn ${refreshing ? "refreshing" : ""}`}
            type="button"
            onClick={() => loadData({ silent: true })}
            disabled={refreshing}
          >
            <FontAwesomeIcon icon={refreshing ? faSpinner : faRotateRight} />
            {refreshing ? "Refreshing..." : "Refresh Data"}
          </button>

          <button className="secondary-btn" type="button" onClick={exportLogsCSV}>
            <FontAwesomeIcon icon={faDownload} />
            Export Logs
          </button>
        </div>
      </section>

      <section className="chatbot-stat-grid">
        {stats.map((item) => (
          <article className={`chatbot-stat-card ${item.tone}`} key={item.label}>
            <span className="stat-icon">
              <FontAwesomeIcon icon={item.icon} />
            </span>
            <div>
              <strong>{item.value}</strong>
              <p>{item.label}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="chatbot-toolbar">
        <div className="chatbot-search-box">
          <FontAwesomeIcon icon={faMagnifyingGlass} />
          <input
            type="text"
            placeholder="Search logs, FAQs, services, keywords..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />

          {searchTerm && (
            <button type="button" onClick={() => setSearchTerm("")}>
              <FontAwesomeIcon icon={faTimes} />
            </button>
          )}
        </div>

        {activeTab === "faqs" && (
          <div className="chatbot-filter-box">
            <FontAwesomeIcon icon={faFilter} />
            <select
              value={scopeFilter}
              onChange={(event) => setScopeFilter(event.target.value)}
            >
              <option value="all">All FAQ Scopes</option>
              {FAQ_SCOPES.map((scope) => (
                <option value={scope} key={scope}>
                  {scope}
                </option>
              ))}
            </select>
          </div>
        )}

        {activeTab === "services" && (
          <div className="chatbot-filter-box">
            <FontAwesomeIcon icon={faTags} />
            <select
              value={serviceCategoryFilter}
              onChange={(event) => setServiceCategoryFilter(event.target.value)}
            >
              <option value="all">All Categories</option>
              {SERVICE_CATEGORIES.map((category) => (
                <option value={category} key={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
        )}

        <button type="button" className="secondary-btn clear-btn" onClick={clearFilters}>
          <FontAwesomeIcon icon={faTimes} />
          Clear
        </button>
      </section>

      <section className="chatbot-tabs">
        <button
          type="button"
          className={activeTab === "logs" ? "active" : ""}
          onClick={() => setActiveTab("logs")}
        >
          <FontAwesomeIcon icon={faComments} />
          Logs
          <span>{chatLogs.length}</span>
        </button>

        <button
          type="button"
          className={activeTab === "faqs" ? "active" : ""}
          onClick={() => setActiveTab("faqs")}
        >
          <FontAwesomeIcon icon={faBook} />
          FAQs
          <span>{faqs.length}</span>
        </button>

        <button
          type="button"
          className={activeTab === "services" ? "active" : ""}
          onClick={() => setActiveTab("services")}
        >
          <FontAwesomeIcon icon={faWrench} />
          Services
          <span>{services.length}</span>
        </button>
      </section>

      {loading ? (
        <div className="loading-container">
          <FontAwesomeIcon icon={faSpinner} className="chatbot-spin" />
          <h3>Loading chatbot admin tools...</h3>
          <p>Please wait while logs, FAQs, and services are prepared.</p>
        </div>
      ) : (
        <>
          {activeTab === "logs" && (
            <div className="admin-grid logs-grid">
              <section className="management-panel">
                <div className="panel-title-row">
                  <div>
                    <h3>Conversation Summary</h3>
                    <p>Choose a user to view full chatbot conversation history.</p>
                  </div>
                  <span>{filteredLogs.length} users</span>
                </div>

                <div className="management-list">
                  {filteredLogs.map((log) => (
                    <button
                      type="button"
                      key={log.user_id}
                      className={`management-card clickable ${
                        selectedUser?.user_id === log.user_id ? "selected" : ""
                      }`}
                      onClick={() => openUserChats(log)}
                    >
                      <div className="log-user-row">
                        <span className="log-avatar">{getUserInitials(log.user_name)}</span>

                        <div>
                          <strong>{log.user_name}</strong>
                          <p>{log.total_chats || 0} chatbot interaction(s)</p>
                        </div>

                        <span className="pill">{log.user_role || "user"}</span>
                      </div>

                      <span className="card-meta">
                        <FontAwesomeIcon icon={faClock} />
                        {formatDateTime(log.last_chat_date)}
                      </span>
                    </button>
                  ))}

                  {filteredLogs.length === 0 && (
                    <div className="empty-state">
                      <FontAwesomeIcon icon={faComments} />
                      <h3>No chatbot logs found</h3>
                      <p>Try clearing the search filter.</p>
                    </div>
                  )}
                </div>
              </section>

              <section className="management-panel chat-history-panel">
                <div className="panel-title-row">
                  <div>
                    <h3>
                      {selectedUser
                        ? `Chat History: ${selectedUser.user_name}`
                        : "Chat History"}
                    </h3>
                    <p>
                      {selectedUser
                        ? "Review user questions and chatbot responses."
                        : "Select a user from the left panel to view messages."}
                    </p>
                  </div>
                </div>

                {detailsLoading ? (
                  <div className="loading-container compact">
                    <FontAwesomeIcon icon={faSpinner} className="chatbot-spin" />
                    <h3>Loading conversations...</h3>
                  </div>
                ) : (
                  <div className="chat-bubble-list">
                    {userChats.map((chat) => (
                      <article key={chat.id} className="chat-thread">
                        <span className="chat-intent">
                          {chat.intent || "general"} • {formatDateTime(chat.created_at)}
                        </span>

                        <div className="bubble user-bubble">
                          <strong>User</strong>
                          <p>{chat.user_message || "No user message"}</p>
                        </div>

                        <div className="bubble bot-bubble">
                          <strong>Bot</strong>
                          <p>{chat.bot_response || "No bot response"}</p>
                        </div>
                      </article>
                    ))}

                    {selectedUser && userChats.length === 0 && (
                      <div className="empty-state">
                        <FontAwesomeIcon icon={faComments} />
                        <h3>No conversation history</h3>
                        <p>No conversation history for this user yet.</p>
                      </div>
                    )}

                    {!selectedUser && (
                      <div className="empty-state">
                        <FontAwesomeIcon icon={faRobot} />
                        <h3>Select a user</h3>
                        <p>Choose a user from the left panel to view chat history.</p>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
          )}

          {activeTab === "faqs" && (
            <div className="admin-grid">
              <section className="management-panel form-panel">
                <div className="panel-title-row">
                  <div>
                    <h3>{editingFaqId ? "Edit FAQ" : "Create FAQ"}</h3>
                    <p>FAQs improve chatbot answers for common user questions.</p>
                  </div>
                </div>

                <form className="management-form" onSubmit={submitFaq}>
                  <label>
                    Question
                    <input
                      type="text"
                      placeholder="Example: How do I book a veterinary appointment?"
                      value={faqForm.question}
                      onChange={(event) =>
                        setFaqForm((prev) => ({
                          ...prev,
                          question: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>

                  <label>
                    Answer
                    <textarea
                      placeholder="Write the chatbot answer here..."
                      value={faqForm.answer}
                      onChange={(event) =>
                        setFaqForm((prev) => ({
                          ...prev,
                          answer: event.target.value,
                        }))
                      }
                      rows="5"
                      required
                    />
                  </label>

                  <label>
                    Keywords
                    <input
                      type="text"
                      placeholder="booking, appointment, vet"
                      value={faqForm.keywords}
                      onChange={(event) =>
                        setFaqForm((prev) => ({
                          ...prev,
                          keywords: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <div className="management-row">
                    <label>
                      Scope
                      <select
                        value={faqForm.scope}
                        onChange={(event) =>
                          setFaqForm((prev) => ({
                            ...prev,
                            scope: event.target.value,
                          }))
                        }
                      >
                        {FAQ_SCOPES.map((scope) => (
                          <option value={scope} key={scope}>
                            {scope}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Sort Order
                      <input
                        type="number"
                        placeholder="Sort order"
                        value={faqForm.sort_order}
                        onChange={(event) =>
                          setFaqForm((prev) => ({
                            ...prev,
                            sort_order: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>

                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={faqForm.is_active}
                      onChange={(event) =>
                        setFaqForm((prev) => ({
                          ...prev,
                          is_active: event.target.checked,
                        }))
                      }
                    />
                    Active FAQ
                  </label>

                  <div className="management-actions">
                    <button type="submit" disabled={saving}>
                      <FontAwesomeIcon
                        icon={saving ? faSpinner : faSave}
                        className={saving ? "chatbot-spin" : ""}
                      />
                      {editingFaqId ? "Update FAQ" : "Add FAQ"}
                    </button>

                    {editingFaqId && (
                      <button type="button" className="secondary-btn" onClick={resetFaqForm}>
                        Cancel
                      </button>
                    )}
                  </div>
                </form>
              </section>

              <section className="management-panel">
                <div className="panel-title-row">
                  <div>
                    <h3>Editable FAQs</h3>
                    <p>Manage active chatbot knowledge records.</p>
                  </div>
                  <span>{filteredFaqs.length} records</span>
                </div>

                <div className="management-list">
                  {filteredFaqs.map((faq) => (
                    <article key={faq.id} className="management-card faq-card">
                      <div className="card-main-row">
                        <strong>{faq.question}</strong>
                        <span className={`pill ${faq.is_active ? "active" : "inactive"}`}>
                          {faq.is_active ? "Active" : "Inactive"}
                        </span>
                      </div>

                      <p>{faq.answer}</p>

                      <div className="faq-meta-row">
                        <span>Scope: {faq.scope || "general"}</span>
                        <span>
                          Keywords: {(faq.keywords || []).join(", ") || "None"}
                        </span>
                      </div>

                      <div className="card-actions">
                        <button type="button" onClick={() => startEditFaq(faq)}>
                          <FontAwesomeIcon icon={faEdit} />
                          Edit
                        </button>

                        <button
                          type="button"
                          className="danger"
                          onClick={() => removeFaq(faq.id)}
                        >
                          <FontAwesomeIcon icon={faTrash} />
                          Delete
                        </button>
                      </div>
                    </article>
                  ))}

                  {filteredFaqs.length === 0 && (
                    <div className="empty-state">
                      <FontAwesomeIcon icon={faBook} />
                      <h3>No FAQs found</h3>
                      <p>Create a FAQ or clear the filters.</p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}

          {activeTab === "services" && (
            <div className="admin-grid">
              <section className="management-panel form-panel">
                <div className="panel-title-row">
                  <div>
                    <h3>{editingServiceId ? "Edit Service" : "Create Service"}</h3>
                    <p>These services can be used by chatbot answers and booking flows.</p>
                  </div>
                </div>

                <form className="management-form" onSubmit={submitService}>
                  <label>
                    Service Name
                    <input
                      type="text"
                      placeholder="Example: General Consultation"
                      value={serviceForm.name}
                      onChange={(event) =>
                        setServiceForm((prev) => ({
                          ...prev,
                          name: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>

                  <div className="management-row">
                    <label>
                      Category
                      <select
                        value={serviceForm.category}
                        onChange={(event) =>
                          setServiceForm((prev) => ({
                            ...prev,
                            category: event.target.value,
                          }))
                        }
                      >
                        {SERVICE_CATEGORIES.map((category) => (
                          <option value={category} key={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Price
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={serviceForm.price}
                        onChange={(event) =>
                          setServiceForm((prev) => ({
                            ...prev,
                            price: event.target.value,
                          }))
                        }
                        required
                      />
                    </label>
                  </div>

                  <label>
                    Duration Minutes
                    <input
                      type="number"
                      min="0"
                      placeholder="Example: 30"
                      value={serviceForm.duration_minutes}
                      onChange={(event) =>
                        setServiceForm((prev) => ({
                          ...prev,
                          duration_minutes: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label>
                    Description
                    <textarea
                      placeholder="Service description used by chatbot answers..."
                      value={serviceForm.description}
                      onChange={(event) =>
                        setServiceForm((prev) => ({
                          ...prev,
                          description: event.target.value,
                        }))
                      }
                      rows="4"
                    />
                  </label>

                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={serviceForm.is_active}
                      onChange={(event) =>
                        setServiceForm((prev) => ({
                          ...prev,
                          is_active: event.target.checked,
                        }))
                      }
                    />
                    Active Service
                  </label>

                  <div className="management-actions">
                    <button type="submit" disabled={saving}>
                      <FontAwesomeIcon
                        icon={saving ? faSpinner : faPlus}
                        className={saving ? "chatbot-spin" : ""}
                      />
                      {editingServiceId ? "Update Service" : "Add Service"}
                    </button>

                    {editingServiceId && (
                      <button type="button" className="secondary-btn" onClick={resetServiceForm}>
                        Cancel
                      </button>
                    )}
                  </div>
                </form>
              </section>

              <section className="management-panel">
                <div className="panel-title-row">
                  <div>
                    <h3>Live Service Answers</h3>
                    <p>Services used by the chatbot and reservation workflows.</p>
                  </div>
                  <span>{filteredServices.length} records</span>
                </div>

                <div className="management-list">
                  {filteredServices.map((service) => (
                    <article key={service.id} className="management-card service-card">
                      <div className="card-main-row">
                        <div>
                          <strong>{service.name}</strong>
                          <span>{service.category || "Other"}</span>
                        </div>

                        <span className="pill active">
                          {formatCurrency(service.price)}
                        </span>
                      </div>

                      <p>{service.description || "No description"}</p>

                      <div className="faq-meta-row">
                        <span>
                          Duration:{" "}
                          {service.duration_minutes
                            ? `${service.duration_minutes} min`
                            : "Not set"}
                        </span>
                        <span>{service.is_active ? "Active" : "Inactive"}</span>
                      </div>

                      <div className="card-actions">
                        <button type="button" onClick={() => startEditService(service)}>
                          <FontAwesomeIcon icon={faEdit} />
                          Edit
                        </button>

                        <button
                          type="button"
                          className="danger"
                          onClick={() => removeService(service.id)}
                        >
                          <FontAwesomeIcon icon={faTrash} />
                          Delete
                        </button>
                      </div>
                    </article>
                  ))}

                  {filteredServices.length === 0 && (
                    <div className="empty-state">
                      <FontAwesomeIcon icon={faWrench} />
                      <h3>No services found</h3>
                      <p>Create a service or clear the filters.</p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ChatbotLogs;