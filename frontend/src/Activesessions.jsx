// ─────────────────────────────────────────────────────────────
//  ActiveSessions.jsx  —  Shows available peer sessions
//  Embed this in StudentDashboard.jsx
//  Usage: <ActiveSessions />
// ─────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { useSocket } from "./Usesocket";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const phaseColors = {
  waiting:   { bg: "#FFF3CD", color: "#92600A", label: "Waiting for students" },
  answering: { bg: "#D1FAE5", color: "#065F46", label: "Answering" },
  reviewing: { bg: "#EEF2FF", color: "#3730A3", label: "Peer Review" },
  improving: { bg: "#E0E7FF", color: "#3730A3", label: "AI Improving" },
  results:   { bg: "#D1FAE5", color: "#065F46", label: "Results" },
  quiz:      { bg: "#FEE2E2", color: "#DC2626", label: "Quiz" },
};

export default function ActiveSessions() {
  useAuth();
  const navigate = useNavigate();
  const { socket } = useSocket();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading]   = useState(true);

  // Fetch active sessions on mount
  useEffect(() => {
    fetchSessions();
  }, []);

  // Listen for new sessions in real-time
  useEffect(() => {
    if (!socket) return;

    socket.on("new_session", (data) => {
      // Add new session to the list
      setSessions(prev => {
        // Avoid duplicates
        if (prev.some(s => s.code === data.joinCode)) return prev;
        return [{
          id: Date.now(),
          code: data.joinCode,
          question: data.question,
          phase: "waiting",
          teacher: { name: data.teacherName },
          totalMembers: 0,
          totalGroups: 0,
          hasJoined: false,
          createdAt: new Date().toISOString(),
          isNew: true, // for animation
        }, ...prev];
      });
    });

    return () => socket.off("new_session");
  }, [socket]);

  const fetchSessions = async () => {
    try {
      const token = localStorage.getItem("edulearn_token");
      const res = await fetch(`${API}/sessions/active`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
    } finally {
      setLoading(false);
    }
  };

  const joinSession = (code) => {
    navigate("/student/peer", { state: { joinCode: code } });
  };

  const timeAgo = (date) => {
    const mins = Math.floor((Date.now() - new Date(date)) / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  };

  if (loading) {
    return (
      <div style={{
        background: "#fff", borderRadius: 14, border: "1px solid #EAECF0",
        padding: 20, marginBottom: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <div style={{ width: 14, height: 14, border: "2px solid #EEF2FF", borderTopColor: "#6C63FF", borderRadius: "50%", animation: "spin .8s linear infinite" }} />
          <span style={{ fontSize: 13, color: "#9CA3AF" }}>Loading sessions…</span>
        </div>
      </div>
    );
  }

  if (sessions.length === 0) return null; // Don't show section if no active sessions

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 10, height: 10, borderRadius: "50%",
            background: "#10B981",
            boxShadow: "0 0 0 3px rgba(16,185,129,0.2)",
            animation: "pulse 2s infinite",
          }} />
          <h2 style={{
            fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 700,
            color: "#1A1D23", letterSpacing: "-.01em",
          }}>
            Live Sessions
          </h2>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: "2px 10px",
            borderRadius: 99, background: "#D1FAE5", color: "#065F46",
          }}>
            {sessions.length}
          </span>
        </div>
        <button onClick={fetchSessions} style={{
          background: "none", border: "1px solid #EAECF0", borderRadius: 8,
          padding: "5px 12px", fontSize: 12, color: "#6B7280", cursor: "pointer",
        }}>
          ↻ Refresh
        </button>
      </div>

      {/* Sessions list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {sessions.map((session) => {
          const phaseInfo = phaseColors[session.phase] || { bg: "#F3F4F6", color: "#9CA3AF", label: session.phase };

          return (
            <div key={session.code} style={{
              background: "#fff",
              borderRadius: 14,
              border: session.isNew ? "2px solid #6C63FF" : "1px solid #EAECF0",
              padding: "16px 20px",
              display: "flex",
              alignItems: "center",
              gap: 16,
              animation: session.isNew ? "fadeUp .4s ease" : "none",
              transition: "border-color .2s, box-shadow .2s",
              boxShadow: session.isNew ? "0 0 0 4px rgba(108,99,255,0.1)" : "none",
            }}>
              {/* Teacher avatar */}
              <div style={{
                width: 44, height: 44, borderRadius: "50%",
                background: "linear-gradient(135deg, #6C63FF, #8B5CF6)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, fontWeight: 700, color: "#fff", flexShrink: 0,
              }}>
                {session.teacher?.name?.charAt(0)?.toUpperCase() || "T"}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#1A1D23" }}>
                    {session.teacher?.name || "Teacher"}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: "2px 8px",
                    borderRadius: 99, background: phaseInfo.bg, color: phaseInfo.color,
                  }}>
                    {phaseInfo.label}
                  </span>
                  {session.isNew && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "2px 8px",
                      borderRadius: 99, background: "#6C63FF", color: "#fff",
                    }}>
                      NEW
                    </span>
                  )}
                </div>
                <p style={{
                  fontSize: 12, color: "#4B5563", lineHeight: 1.5,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {session.question}
                </p>
                <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 11, color: "#9CA3AF" }}>
                  <span>{session.totalMembers} student{session.totalMembers !== 1 ? "s" : ""}</span>
                  <span>·</span>
                  <span>{session.totalGroups} group{session.totalGroups !== 1 ? "s" : ""}</span>
                  <span>·</span>
                  <span>{timeAgo(session.createdAt)}</span>
                </div>
              </div>

              {/* Join button */}
              <div style={{ flexShrink: 0 }}>
                {session.hasJoined ? (
                  <button onClick={() => joinSession(session.code)} style={{
                    padding: "8px 18px", borderRadius: 9, fontSize: 12, fontWeight: 600,
                    border: "1px solid #10B981", background: "#D1FAE5", color: "#065F46",
                    cursor: "pointer", transition: "all .15s",
                  }}>
                    Rejoin →
                  </button>
                ) : session.phase === "waiting" ? (
                  <button onClick={() => joinSession(session.code)} style={{
                    padding: "8px 18px", borderRadius: 9, fontSize: 12, fontWeight: 600,
                    border: "none", background: "#6C63FF", color: "#fff",
                    cursor: "pointer", transition: "all .15s",
                  }}
                    onMouseOver={e => e.currentTarget.style.background = "#5a52e0"}
                    onMouseOut={e => e.currentTarget.style.background = "#6C63FF"}
                  >
                    Join Now →
                  </button>
                ) : (
                  <span style={{
                    padding: "8px 14px", borderRadius: 9, fontSize: 11, fontWeight: 500,
                    background: "#F3F4F6", color: "#9CA3AF",
                  }}>
                    In progress
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: .4; } 50% { opacity: 1; } }
      `}</style>
    </div>
  );
}