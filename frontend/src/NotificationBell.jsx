// ─────────────────────────────────────────────────────────────
//  NotificationBell.jsx
//  Renders a bell icon with a live unread badge.
//  On click: dropdown shows recent notifications.
//  Each notification item links to /join/{code}.
//  Listens for "new_session" socket events in real-time.
// ─────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth }     from "./AuthContext";
import { useSocket }   from "./Usesocket";
import api             from "./api";

// ── Styles (inline to keep zero extra deps) ──────────────────
const S = {
  wrap: {
    position: "relative",
    display:  "inline-block",
  },
  btn: {
    background: "none",
    border:     "none",
    cursor:     "pointer",
    fontSize:   22,
    padding:    "4px 8px",
    position:   "relative",
    lineHeight: 1,
  },
  badge: {
    position:   "absolute",
    top:        0,
    right:      0,
    background: "#EF4444",
    color:      "#fff",
    fontSize:   10,
    fontWeight: 700,
    borderRadius: "50%",
    minWidth:   16,
    height:     16,
    display:    "flex",
    alignItems: "center",
    justifyContent: "center",
    padding:    "0 3px",
    lineHeight: "16px",
  },
  dropdown: {
    position:   "absolute",
    top:        "calc(100% + 6px)",
    right:      0,
    width:      340,
    maxHeight:  420,
    overflowY:  "auto",
    background: "#fff",
    border:     "1px solid #E5E7EB",
    borderRadius: 10,
    boxShadow:  "0 8px 24px rgba(0,0,0,.12)",
    zIndex:     1000,
  },
  header: {
    display:        "flex",
    alignItems:     "center",
    justifyContent: "space-between",
    padding:        "12px 14px",
    borderBottom:   "1px solid #F3F4F6",
    fontWeight:     700,
    fontSize:       13,
    color:          "#111827",
  },
  markAll: {
    background: "none",
    border:     "none",
    cursor:     "pointer",
    fontSize:   11,
    color:      "#6366F1",
    fontWeight: 600,
    padding:    0,
  },
  empty: {
    padding:   "28px 14px",
    textAlign: "center",
    fontSize:  13,
    color:     "#9CA3AF",
  },
  item: (read) => ({
    display:       "block",
    width:         "100%",
    textAlign:     "left",
    background:    read ? "#fff" : "#EEF2FF",
    border:        "none",
    borderBottom:  "1px solid #F3F4F6",
    padding:       "12px 14px",
    cursor:        "pointer",
    transition:    "background .15s",
  }),
  itemTeacher: {
    fontSize:   12,
    fontWeight: 700,
    color:      "#6366F1",
    marginBottom: 2,
  },
  itemQuestion: {
    fontSize:   13,
    color:      "#111827",
    marginBottom: 4,
    lineHeight: 1.4,
  },
  itemMeta: {
    fontSize:  11,
    color:     "#9CA3AF",
  },
  joinChip: {
    display:      "inline-block",
    background:   "#6366F1",
    color:        "#fff",
    borderRadius: 4,
    padding:      "2px 7px",
    fontSize:     10,
    fontWeight:   700,
    marginLeft:   6,
  },
};

// ── Helper: format relative time ─────────────────────────────
function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60)     return "just now";
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── Component ─────────────────────────────────────────────────
export default function NotificationBell() {
  const { user }         = useAuth();
  const navigate         = useNavigate();
  const { socket }       = useSocket();
  const wrapRef          = useRef(null);

  const [open,          setOpen]         = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unread,        setUnread]        = useState(0);

  // ── Fetch notifications from server ──────────────────────
  const fetchNotifications = useCallback(async () => {
    if (!user?._id) return;
    try {
      const { notifications: data, unreadCount } = await api.notifications.getAll(user._id);
      setNotifications(data);
      setUnread(unreadCount);
    } catch {
      // silently fail — bell should not break the page
    }
  }, [user?._id]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // ── Real-time: listen for new_session events ──────────────
  useEffect(() => {
    if (!socket) return;

    const handleNewSession = (payload) => {
      // payload = { teacherName, question, joinCode }
      const newNotif = {
        _id:         `temp_${Date.now()}`,
        teacherName: payload.teacherName,
        question:    payload.question,
        joinCode:    payload.joinCode,
        read:        false,
        createdAt:   new Date().toISOString(),
      };
      setNotifications(prev => [newNotif, ...prev]);
      setUnread(prev => prev + 1);
    };

    socket.on("new_session", handleNewSession);
    return () => socket.off("new_session", handleNewSession);
  }, [socket]);

  // ── Close dropdown when clicking outside ─────────────────
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Mark a single notification read then navigate ─────────
  const handleClick = async (notif) => {
    setOpen(false);
    // Optimistically mark as read in UI
    setNotifications(prev =>
      prev.map(n => n._id === notif._id ? { ...n, read: true } : n)
    );
    setUnread(prev => Math.max(0, prev - (notif.read ? 0 : 1)));

    // Persist to server (skip for temp IDs from socket)
    if (!notif._id.toString().startsWith("temp_")) {
      await api.notifications.markRead(notif._id).catch(() => {});
    }

    navigate(`/join/${notif.joinCode}`);
  };

  // ── Mark all as read ─────────────────────────────────────
  const markAll = async (e) => {
    e.stopPropagation();
    await api.notifications.markAll().catch(() => {});
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnread(0);
  };

  return (
    <div style={S.wrap} ref={wrapRef}>
      {/* Bell button */}
      <button style={S.btn} onClick={() => setOpen(o => !o)} title="Notifications">
        🔔
        {unread > 0 && (
          <span style={S.badge}>{unread > 99 ? "99+" : unread}</span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={S.dropdown}>
          <div style={S.header}>
            <span>Notifications</span>
            {unread > 0 && (
              <button style={S.markAll} onClick={markAll}>
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p style={S.empty}>No notifications yet</p>
          ) : (
            notifications.map(n => (
              <button
                key={n._id}
                style={S.item(n.read)}
                onClick={() => handleClick(n)}
              >
                <div style={S.itemTeacher}>{n.teacherName}</div>
                <div style={S.itemQuestion}>
                  {n.question.length > 80 ? n.question.slice(0, 80) + "…" : n.question}
                </div>
                <div style={S.itemMeta}>
                  {timeAgo(n.createdAt)}
                  <span style={S.joinChip}>Join /join/{n.joinCode}</span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
