import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { useSocket } from "./Usesocket";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const phaseLabel = {
  waiting:   { label: "En attente",    color: "#F59E0B", bg: "#FFFBEB" },
  answering: { label: "Rédaction",     color: "#10B981", bg: "#ECFDF5" },
  reviewing: { label: "Révision pairs", color: "#6C63FF", bg: "#EEF2FF" },
  improving: { label: "IA en cours",   color: "#3B82F6", bg: "#EFF6FF" },
  results:   { label: "Résultats",     color: "#10B981", bg: "#ECFDF5" },
};

const avatarColor = (name = "") => {
  const colors = ["#6C63FF", "#0EA5E9", "#10B981", "#F59E0B", "#EC4899"];
  return colors[name.charCodeAt(0) % colors.length] || "#6C63FF";
};

const timeAgo = (date) => {
  const mins = Math.floor((Date.now() - new Date(date)) / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `Il y a ${mins} min`;
  return `Il y a ${Math.floor(mins / 60)} h`;
};

function formatCountdown(scheduledAt) {
  const diff = new Date(scheduledAt) - Date.now();
  if (diff <= 0) return "Bientôt…";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 24) return `Dans ${Math.floor(h / 24)} j ${h % 24} h`;
  if (h > 0)  return `Dans ${h} h ${m} min`;
  return `Dans ${m} min`;
}

export default function Activesessions() {
  useAuth();
  const navigate = useNavigate();
  const { socket } = useSocket();
  const [sessions, setSessions]           = useState([]);
  const [scheduled, setScheduled]         = useState([]);
  const [loading, setLoading]             = useState(true);
  const [, forceUpdate]                   = useState(0);

  useEffect(() => { fetchSessions(); }, []);

  // Countdown refresh every minute
  useEffect(() => {
    const t = setInterval(() => forceUpdate(n => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on("new_session", (data) => {
      setSessions(prev => {
        if (prev.some(s => s.code === data.joinCode)) return prev;
        return [{
          id: Date.now(), code: data.joinCode, question: data.question,
          phase: "waiting", teacher: { name: data.teacherName },
          totalMembers: 0, totalGroups: 0, hasJoined: false,
          createdAt: new Date().toISOString(), isNew: true,
        }, ...prev];
      });
      // Remove from scheduled list if it just went live
      setScheduled(prev => prev.filter(s => s.code !== data.joinCode));
    });
    return () => socket.off("new_session");
  }, [socket]);

  const fetchSessions = async () => {
    try {
      const token = localStorage.getItem("edulearn_token");
      const [activeRes, scheduledRes] = await Promise.all([
        fetch(`${API}/sessions/active`,    { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/sessions/scheduled`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (activeRes.ok)    setSessions((await activeRes.json()).sessions || []);
      if (scheduledRes.ok) setScheduled((await scheduledRes.json()).sessions || []);
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || (sessions.length === 0 && scheduled.length === 0)) return null;

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10B981", display: "inline-block", boxShadow: "0 0 0 3px rgba(16,185,129,.18)", animation: "livePulse 1.8s ease-in-out infinite" }} />
          <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: "#1A1D23" }}>
            Sessions en direct
          </span>
          <span style={{ background: "#ECFDF5", color: "#065F46", fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 99 }}>
            {sessions.length}
          </span>
        </div>
        <button onClick={fetchSessions} style={{ background: "none", border: "1px solid #EAECF0", borderRadius: 7, padding: "4px 11px", fontSize: 11, color: "#6B7280", cursor: "pointer" }}>
          ↻
        </button>
      </div>

      {/* Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {sessions.map((session) => {
          const phase = phaseLabel[session.phase] || { label: session.phase, color: "#9CA3AF", bg: "#F3F4F6" };
          const avBg  = avatarColor(session.teacher?.name || "T");
          const initial = (session.teacher?.name || "T").charAt(0).toUpperCase();

          return (
            <div
              key={session.code}
              style={{
                borderRadius: 16,
                overflow: "hidden",
                border: session.isNew ? "2px solid #6C63FF" : "1px solid #EAECF0",
                background: "#fff",
                boxShadow: session.isNew ? "0 0 0 4px rgba(108,99,255,.09)" : "0 2px 12px rgba(0,0,0,.04)",
                animation: session.isNew ? "announceFadeIn .5s ease" : "none",
              }}
            >
              {/* Top bar */}
              <div style={{ background: "#1A1D23", padding: "12px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {/* Avatar */}
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: avBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                    {initial}
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#fff" }}>{session.teacher?.name || "Enseignant"}</p>
                    <p style={{ margin: 0, fontSize: 11, color: "#6B7280" }}>{timeAgo(session.createdAt)}</p>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {session.isNew && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "#6C63FF", color: "#fff" }}>NOUVEAU</span>
                  )}
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99, background: phase.bg, color: phase.color }}>
                    {phase.label}
                  </span>
                </div>
              </div>

              {/* Body */}
              <div style={{ padding: "16px 18px 18px" }}>
                {/* Code badge */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: ".05em" }}>Code</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#6C63FF", letterSpacing: "2px", background: "#EEF2FF", padding: "2px 10px", borderRadius: 6 }}>{session.code}</span>
                  <span style={{ fontSize: 11, color: "#9CA3AF" }}>·</span>
                  <span style={{ fontSize: 11, color: "#9CA3AF" }}>{session.totalMembers} étudiant{session.totalMembers !== 1 ? "s" : ""}</span>
                </div>

                {/* Question */}
                <p style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 600, color: "#1A1D23", lineHeight: 1.55 }}>
                  {session.question}
                </p>

                {/* Join CTA */}
                {session.hasJoined ? (
                  <button
                    onClick={() => navigate("/student/peer", { state: { joinCode: session.code } })}
                    style={{ width: "100%", padding: "11px", background: "#ECFDF5", color: "#065F46", border: "1px solid #6EE7B7", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                  >
                    ↩ Reprendre la session
                  </button>
                ) : session.phase === "waiting" ? (
                  <button
                    onClick={() => navigate("/student/peer", { state: { joinCode: session.code } })}
                    style={{ width: "100%", padding: "11px", background: "#6C63FF", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer", letterSpacing: ".01em" }}
                    onMouseOver={e => e.currentTarget.style.background = "#5a52e0"}
                    onMouseOut={e => e.currentTarget.style.background = "#6C63FF"}
                  >
                    ◈ Rejoindre la session →
                  </button>
                ) : (
                  <div style={{ padding: "9px 14px", background: "#F9FAFB", borderRadius: 10, fontSize: 12, color: "#9CA3AF", textAlign: "center", border: "1px solid #F3F4F6" }}>
                    Session en cours — arrivée tardive non disponible
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Scheduled (upcoming) sessions ── */}
      {scheduled.length > 0 && (
        <div style={{ marginTop: sessions.length > 0 ? 20 : 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 15 }}>📅</span>
            <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: "#1A1D23" }}>Sessions planifiées</span>
            <span style={{ background: "#EEF2FF", color: "#6366f1", fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 99 }}>{scheduled.length}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {scheduled.map(s => {
              const scheduledDate = new Date(s.scheduledAt);
              const dateLabel = scheduledDate.toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short" });
              const countdown = formatCountdown(s.scheduledAt);
              const avBg = avatarColor(s.teacher?.name || "T");
              const initial = (s.teacher?.name || "T").charAt(0).toUpperCase();
              return (
                <div key={s.id || s.code} style={{ borderRadius: 16, overflow: "hidden", border: "1.5px solid #c7d2fe", background: "#fff", boxShadow: "0 2px 10px rgba(99,102,241,.06)" }}>
                  {/* Header */}
                  <div style={{ background: "#1e1b4b", padding: "12px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: avBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                        {initial}
                      </div>
                      <div>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#fff" }}>{s.teacher?.name || "Enseignant"}</p>
                        <p style={{ margin: 0, fontSize: 11, color: "#818cf8" }}>{dateLabel}</p>
                      </div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: "#eef2ff", color: "#6366f1" }}>
                      {countdown}
                    </span>
                  </div>
                  {/* Body */}
                  <div style={{ padding: "14px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: ".05em" }}>Code</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "#6C63FF", letterSpacing: "2px", background: "#EEF2FF", padding: "2px 10px", borderRadius: 6 }}>{s.code}</span>
                      {s.missingSection && (
                        <>
                          <span style={{ fontSize: 11, color: "#9CA3AF" }}>·</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b", background: "#fffbeb", padding: "2px 8px", borderRadius: 6, border: "1px solid #fde68a" }}>
                            📖 Préparer : {s.missingSection}
                          </span>
                        </>
                      )}
                    </div>
                    <p style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "#1A1D23", lineHeight: 1.5 }}>
                      {s.question}
                    </p>
                    <div style={{ padding: "8px 12px", background: "#f0f9ff", borderRadius: 8, fontSize: 12, color: "#0369a1", border: "1px solid #bae6fd" }}>
                      ⏰ La session s'ouvrira automatiquement le <strong>{dateLabel}</strong>. Préparez la section <strong>{s.missingSection || "indiquée"}</strong>.
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        @keyframes livePulse { 0%,100%{opacity:.4;transform:scale(1)} 50%{opacity:1;transform:scale(1.25)} }
        @keyframes announceFadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  );
}
