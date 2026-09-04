import { useEffect, useRef, useState } from "react";
import { FaTimes, FaPaperPlane, FaRedo } from "react-icons/fa";
import chatbotLogo from "../assets/pawesome-icon.png";
import { fetchPublicChatbotWelcome, sendPublicChatbotMessage } from "../services/chatbotService";
import "./LandingChatbot.css";

const SS_MSGS_KEY = "pawesome_landing_msgs";
const SS_SUGG_KEY = "pawesome_landing_sugg";
const MAX_SS_MSGS = 30;

function loadSession() {
  try {
    const msgs = sessionStorage.getItem(SS_MSGS_KEY);
    const sugg = sessionStorage.getItem(SS_SUGG_KEY);
    return {
      messages: msgs ? JSON.parse(msgs) : null,
      suggestions: sugg ? JSON.parse(sugg) : null,
    };
  } catch { return { messages: null, suggestions: null }; }
}

function saveSession(messages, suggestions) {
  try {
    sessionStorage.setItem(SS_MSGS_KEY, JSON.stringify(messages.slice(-MAX_SS_MSGS)));
    sessionStorage.setItem(SS_SUGG_KEY, JSON.stringify(suggestions));
  } catch { }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SS_MSGS_KEY);
    sessionStorage.removeItem(SS_SUGG_KEY);
  } catch { }
}

const formatTime = (iso) => {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

// Fallback if backend is unreachable
const FALLBACK_WELCOME = {
  reply: "Hi! Welcome to Pawesome Pet Services. I can help with our services, pricing, and how to get started.",
  suggestions: ["What services do you offer?", "How do I register?", "What are your hours?"],
};

export default function LandingChatbot() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [bootstrapped, setBootstrapped] = useState(false);
  const messagesEndRef = useRef(null);

  // Load welcome on first open — restore from sessionStorage if available
  useEffect(() => {
    if (!open || bootstrapped) return;
    const cached = loadSession();
    if (cached.messages?.length > 0) {
      setMessages(cached.messages);
      setSuggestions(cached.suggestions || []);
      setBootstrapped(true);
      return;
    }
    loadWelcome();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist to sessionStorage whenever messages/suggestions change
  useEffect(() => {
    if (bootstrapped && messages.length > 0) {
      saveSession(messages, suggestions);
    }
  }, [messages, suggestions]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const loadWelcome = async () => {
    setLoading(true);
    try {
      const data = await fetchPublicChatbotWelcome();
      const welcomeMsg = {
        sender: "bot",
        text: data.reply,
        timestamp: new Date().toISOString(),
      };
      setMessages([welcomeMsg]);
      setSuggestions(data.suggestions || FALLBACK_WELCOME.suggestions);
      setBootstrapped(true);
    } catch {
      setMessages([{
        sender: "bot",
        text: FALLBACK_WELCOME.reply,
        timestamp: new Date().toISOString(),
      }]);
      setSuggestions(FALLBACK_WELCOME.suggestions);
      setBootstrapped(true);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (customMessage) => {
    const message = (customMessage || input).trim();
    if (!message || loading) return;

    const userMsg = {
      sender: "user",
      text: message,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSuggestions([]);
    setLoading(true);

    try {
      const data = await sendPublicChatbotMessage(message);
      const botMsg = {
        sender: "bot",
        text: data.reply,
        cta: data.cta || null,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, botMsg]);
      setSuggestions(data.suggestions || []);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          sender: "bot",
          text: "Sorry, I couldn't reach the server right now. Please try again or visit our registration page.",
          cta: { label: "Register", href: "/register" },
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const resetChat = () => {
    clearSession();
    setMessages([]);
    setSuggestions([]);
    setBootstrapped(false);
    setInput("");
    loadWelcome();
  };

  return (
    <>
      {/* Toggle button */}
      <button
        className="lc-toggle"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open Pawesome Assistant"
      >
        <img src={chatbotLogo} alt="Pawesome Chatbot" className="lc-toggle-img" />
        {!open && <span className="lc-toggle-text">Chat with us</span>}
      </button>

      {open && (
        <div className="lc-panel">
          {/* Header */}
          <div className="lc-header">
            <div className="lc-header-left">
              <div className="lc-header-avatar">
                <img src={chatbotLogo} alt="Pawesome" className="lc-header-img" />
                <span className="lc-online-dot" />
              </div>
              <div>
                <strong>Pawesome Assistant</strong>
                <span>Online · Public info only</span>
              </div>
            </div>
            <div className="lc-header-actions">
              <button className="lc-icon-btn" onClick={resetChat} title="New chat">
                <FaRedo size={13} />
              </button>
              <button className="lc-icon-btn" onClick={() => setOpen(false)} title="Close">
                <FaTimes size={15} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="lc-body">
            {messages.map((msg, i) => (
              <div key={i} className={`lc-msg lc-msg-${msg.sender}`}>
                {msg.sender === "bot" && (
                  <img src={chatbotLogo} alt="bot" className="lc-msg-avatar" />
                )}
                <div className="lc-msg-content">
                  <div className="lc-bubble">
                    {msg.text.split("\n").map((line, j) => (
                      <p key={j}>{line}</p>
                    ))}
                    {msg.cta && (
                      <a href={msg.cta.href} className="lc-cta-btn">
                        {msg.cta.label} →
                      </a>
                    )}
                  </div>
                  <span className="lc-msg-time">{formatTime(msg.timestamp)}</span>
                </div>
              </div>
            ))}

            {loading && (
              <div className="lc-msg lc-msg-bot">
                <img src={chatbotLogo} alt="bot" className="lc-msg-avatar" />
                <div className="lc-typing-indicator">
                  <span /><span /><span />
                </div>
              </div>
            )}

            {!loading && suggestions.length > 0 && (
              <div className="lc-suggestions">
                {suggestions.map((s) => (
                  <button key={s} className="lc-suggestion-chip" onClick={() => sendMessage(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="lc-input-bar">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Ask about our services..."
              disabled={loading}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              className="lc-send-btn"
            >
              <FaPaperPlane size={15} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
