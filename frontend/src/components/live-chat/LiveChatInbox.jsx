import { useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faComments,
  faPaperPlane,
  faCheck,
  faTimes,
  faUser,
  faUserTie,
  faCircle,
  faHeadset,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import {
  closeSession,
  claimSession,
  getInbox,
  pollSessionMessages,
  staffReply,
} from "../../services/liveChatService";
import { showConfirm, showError, showSuccess } from "../../utils/alert";
import "./LiveChatInbox.css";

const INBOX_POLL_MS  = 5000;
const MSG_POLL_MS    = 3000;

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function StatusBadge({ status }) {
  const labels = { waiting: "Waiting", active: "Active", closed: "Closed" };
  return (
    <span className={`lci-status-badge lci-status-${status}`}>
      {labels[status] || status}
    </span>
  );
}

export default function LiveChatInbox() {
  const [sessions, setSessions]         = useState([]);
  const [recentClosed, setRecentClosed] = useState([]);
  const [counts, setCounts]             = useState({ waiting: 0, active: 0 });
  const [selected, setSelected]         = useState(null);
  const [messages, setMessages]         = useState([]);
  const [replyText, setReplyText]       = useState("");
  const [sending, setSending]           = useState(false);
  const [closing, setClosing]           = useState(false);
  const [claiming, setClaiming]         = useState(false);
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [inboxError, setInboxError]     = useState("");

  const lastMsgIdRef   = useRef(0);
  const messagesEndRef = useRef(null);
  const inboxTimerRef  = useRef(null);
  const msgTimerRef    = useRef(null);

  // ── Fetch inbox ──────────────────────────────────────────────────────────
  const fetchInbox = useCallback(async () => {
    try {
      const data = await getInbox();
      setSessions(data.sessions || []);
      setRecentClosed(data.recent_closed || []);
      setCounts(data.counts || { waiting: 0, active: 0 });
      setInboxError("");
    } catch (err) {
      setInboxError(err.message || "Failed to load inbox.");
    } finally {
      setLoadingInbox(false);
    }
  }, []);

  // ── Fetch messages for selected session ──────────────────────────────────
  const fetchMessages = useCallback(async (sessionId) => {
    try {
      const data = await pollSessionMessages(sessionId, lastMsgIdRef.current);
      if (data.messages?.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newMsgs = data.messages.filter((m) => !existingIds.has(m.id));
          if (newMsgs.length > 0) {
            lastMsgIdRef.current = Math.max(...data.messages.map((m) => m.id));
            return [...prev, ...newMsgs];
          }
          return prev;
        });
      }
      // Update session status in list
      if (data.session_status) {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId ? { ...s, status: data.session_status } : s
          )
        );
      }
    } catch {
      // Silently ignore poll errors
    }
  }, []);

  // ── Mount: start inbox poll ───────────────────────────────────────────────
  useEffect(() => {
    fetchInbox();
    inboxTimerRef.current = setInterval(fetchInbox, INBOX_POLL_MS);
    return () => clearInterval(inboxTimerRef.current);
  }, [fetchInbox]);

  // ── When session selected: load all messages + start msg poll ────────────
  useEffect(() => {
    clearInterval(msgTimerRef.current);
    if (!selected) return;

    lastMsgIdRef.current = 0;
    setMessages([]);

    const load = async () => {
      try {
        const data = await pollSessionMessages(selected.id, 0);
        setMessages(data.messages || []);
        if (data.messages?.length > 0) {
          lastMsgIdRef.current = Math.max(...data.messages.map((m) => m.id));
        }
      } catch {
        // Ignore
      }
    };
    load();

    msgTimerRef.current = setInterval(() => fetchMessages(selected.id), MSG_POLL_MS);
    return () => clearInterval(msgTimerRef.current);
  }, [selected?.id, fetchMessages]);

  // ── Scroll to bottom on new messages ─────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSelectSession = (session) => {
    setSelected(session);
    setReplyText("");
  };

  const handleClaim = async () => {
    if (!selected || claiming) return;
    setClaiming(true);
    try {
      const data = await claimSession(selected.id);
      setSelected(data.session);
      fetchInbox();
    } catch (err) {
      showError(err.message || "Could not claim this session.", "Claim Failed");
    } finally {
      setClaiming(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    const text = replyText.trim();
    if (!text || !selected || sending) return;

    setSending(true);
    // Optimistic update
    const optimistic = {
      id: Date.now(),
      sender_type: "staff",
      sender_name: "You",
      message: text,
      created_at: new Date().toISOString(),
      optimistic: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setReplyText("");

    try {
      const data = await staffReply(selected.id, text);
      // Replace optimistic with real message
      setMessages((prev) =>
        prev.map((m) => (m.optimistic && m.message === text ? data.message_obj : m))
      );
      if (data.message_obj?.id > lastMsgIdRef.current) {
        lastMsgIdRef.current = data.message_obj.id;
      }
    } catch (err) {
      // Remove optimistic on failure
      setMessages((prev) => prev.filter((m) => !m.optimistic));
      showError(err.message || "Failed to send message. Please try again.", "Send Failed");
    } finally {
      setSending(false);
    }
  };

  const handleClose = async () => {
    if (!selected || closing) return;
    const confirmed = await showConfirm(
      `Close the chat session with ${selected.customer_name}? They will be notified that the session has ended.`,
      "Close Chat Session",
      "Close Session",
      "Cancel",
      "question",
      true
    );
    if (!confirmed) return;
    setClosing(true);
    try {
      await closeSession(selected.id);
      await showSuccess(
        `Chat session with ${selected.customer_name} has been closed.`,
        "Session Closed"
      );
      fetchInbox();
      setSelected(null);
      setMessages([]);
    } catch (err) {
      showError(err.message || "Failed to close session. Please try again.", "Close Failed");
    } finally {
      setClosing(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="lci-root">
      {/* ── Sidebar ── */}
      <aside className="lci-sidebar">
        <div className="lci-sidebar-header">
          <span className="lci-sidebar-title">
            <FontAwesomeIcon icon={faComments} />
            Live Chat Inbox
          </span>
          <div className="lci-count-pills">
            {counts.waiting > 0 && (
              <span className="lci-pill lci-pill-waiting">{counts.waiting} waiting</span>
            )}
            {counts.active > 0 && (
              <span className="lci-pill lci-pill-active">{counts.active} active</span>
            )}
          </div>
        </div>

        {loadingInbox ? (
          <div className="lci-sidebar-empty">
            <FontAwesomeIcon icon={faSpinner} spin />
            Loading...
          </div>
        ) : inboxError ? (
          <div className="lci-sidebar-empty lci-error">{inboxError}</div>
        ) : sessions.length === 0 && recentClosed.length === 0 ? (
          <div className="lci-sidebar-empty">
            <FontAwesomeIcon icon={faHeadset} />
            No active chats right now
          </div>
        ) : (
          <ul className="lci-session-list">
            {sessions.map((s) => (
              <li
                key={s.id}
                className={`lci-session-item lci-session-${s.status} ${selected?.id === s.id ? "lci-session-selected" : ""}`}
                onClick={() => handleSelectSession(s)}
              >
                <div className="lci-session-dot-wrap">
                  <FontAwesomeIcon
                    icon={faCircle}
                    className={`lci-dot lci-dot-${s.status}`}
                  />
                  {s.unread_count > 0 && (
                    <span className="lci-unread-badge">{s.unread_count}</span>
                  )}
                </div>
                <div className="lci-session-info">
                  <span className="lci-session-name">{s.customer_name}</span>
                  <span className="lci-session-preview">
                    {s.last_message || "Chat started"}
                  </span>
                </div>
                <div className="lci-session-meta">
                  <StatusBadge status={s.status} />
                  <span className="lci-session-time">{formatTime(s.last_message_at)}</span>
                </div>
              </li>
            ))}

            {recentClosed.length > 0 && (
              <>
                <li className="lci-section-label">Recent Closed</li>
                {recentClosed.map((s) => (
                  <li
                    key={s.id}
                    className={`lci-session-item lci-session-closed ${selected?.id === s.id ? "lci-session-selected" : ""}`}
                    onClick={() => handleSelectSession(s)}
                  >
                    <div className="lci-session-dot-wrap">
                      <FontAwesomeIcon icon={faCircle} className="lci-dot lci-dot-closed" />
                    </div>
                    <div className="lci-session-info">
                      <span className="lci-session-name">{s.customer_name}</span>
                      <span className="lci-session-preview lci-closed-preview">
                        {s.last_message || "Closed"}
                      </span>
                    </div>
                    <div className="lci-session-meta">
                      <StatusBadge status={s.status} />
                      <span className="lci-session-time">{formatTime(s.closed_at)}</span>
                    </div>
                  </li>
                ))}
              </>
            )}
          </ul>
        )}
      </aside>

      {/* ── Main pane ── */}
      <main className="lci-pane">
        {!selected ? (
          <div className="lci-pane-empty">
            <FontAwesomeIcon icon={faComments} className="lci-pane-empty-icon" />
            <strong>Select a conversation</strong>
            <span>Choose a chat from the left to start responding.</span>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="lci-pane-header">
              <div className="lci-pane-header-info">
                <div className="lci-pane-avatar">
                  <FontAwesomeIcon icon={faUser} />
                </div>
                <div>
                  <strong>{selected.customer_name}</strong>
                  <span className="lci-pane-sub">
                    {selected.customer_email || "Customer"}
                    {selected.assigned_to && ` · Handled by ${selected.assigned_to}`}
                  </span>
                </div>
              </div>
              <div className="lci-pane-header-actions">
                <StatusBadge status={selected.status} />
                {selected.status === "waiting" && (
                  <button
                    className="lci-btn lci-btn-claim"
                    onClick={handleClaim}
                    disabled={claiming}
                  >
                    {claiming ? (
                      <FontAwesomeIcon icon={faSpinner} spin />
                    ) : (
                      <FontAwesomeIcon icon={faUserTie} />
                    )}
                    {claiming ? "Claiming..." : "Take Chat"}
                  </button>
                )}
                {selected.status !== "closed" && (
                  <button
                    className="lci-btn lci-btn-close"
                    onClick={handleClose}
                    disabled={closing}
                  >
                    <FontAwesomeIcon icon={faTimes} />
                    {closing ? "Closing..." : "Close Chat"}
                  </button>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="lci-messages">
              {messages.length === 0 && (
                <div className="lci-msg-empty">No messages yet.</div>
              )}
              {messages.map((msg, i) => {
                if (msg.sender_type === "system") {
                  return (
                    <div key={msg.id ?? i} className="lci-system-msg">
                      {msg.message}
                    </div>
                  );
                }
                const isStaff = msg.sender_type === "staff";
                return (
                  <div
                    key={msg.id ?? i}
                    className={`lci-msg-row ${isStaff ? "lci-msg-staff" : "lci-msg-customer"}`}
                  >
                    <div className="lci-msg-avatar">
                      <FontAwesomeIcon icon={isStaff ? faUserTie : faUser} />
                    </div>
                    <div className="lci-msg-wrap">
                      <span className="lci-msg-sender">
                        {msg.sender_name}
                      </span>
                      <div className={`lci-msg-bubble ${msg.optimistic ? "lci-msg-optimistic" : ""}`}>
                        {msg.message}
                      </div>
                      <span className="lci-msg-time">{formatTime(msg.created_at)}</span>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Compose */}
            {selected.status !== "closed" ? (
              <form className="lci-compose" onSubmit={handleSend}>
                <input
                  type="text"
                  className="lci-compose-input"
                  placeholder={
                    selected.status === "waiting"
                      ? "Type a reply to claim and respond..."
                      : "Type your reply..."
                  }
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  disabled={sending}
                />
                <button
                  type="submit"
                  className="lci-compose-btn"
                  disabled={!replyText.trim() || sending}
                >
                  {sending ? (
                    <FontAwesomeIcon icon={faSpinner} spin />
                  ) : (
                    <FontAwesomeIcon icon={faPaperPlane} />
                  )}
                </button>
              </form>
            ) : (
              <div className="lci-compose-closed">
                <FontAwesomeIcon icon={faCheck} />
                This chat has been closed.
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
