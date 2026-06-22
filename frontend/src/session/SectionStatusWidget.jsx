import { useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const STATUSES = [
  { key: "not_started",    label: "Non commencé",  color: "#94a3b8", bg: "#f1f5f9", icon: "○" },
  { key: "in_progress",    label: "En cours",       color: "#3b82f6", bg: "#eff6ff", icon: "⟳" },
  { key: "in_review",      label: "En révision",    color: "#f59e0b", bg: "#fffbeb", icon: "✏" },
  { key: "needs_revision", label: "À retravailler", color: "#ef4444", bg: "#fef2f2", icon: "⚠" },
  { key: "completed",      label: "Terminé",        color: "#22c55e", bg: "#f0fdf4", icon: "✓" },
];

const LIKERT = [
  { value: 1, emoji: "😟", label: "Très faible", color: "#ef4444" },
  { value: 2, emoji: "😕", label: "Faible",      color: "#f97316" },
  { value: 3, emoji: "😐", label: "Modéré",      color: "#f59e0b" },
  { value: 4, emoji: "😊", label: "Élevé",       color: "#22c55e" },
  { value: 5, emoji: "😄", label: "Très élevé",  color: "#6366f1" },
];

export default function SectionStatusWidget({ sessionId, sectionKey, studentName, existingSatisfaction }) {
  const [status, setStatus]           = useState(null);
  const [satisfaction, setSatisfaction] = useState(null);
  const [submitted, setSubmitted]     = useState(false);
  const [loading, setLoading]         = useState(false);

  if (!sessionId || !sectionKey) return null;

  const handleSubmit = async () => {
    if (!status) return;
    setLoading(true);
    try {
      const token = sessionStorage.getItem("edulearn_token");
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

      await fetch(`${API}/sessions/${sessionId}/section-status`, {
        method: "PATCH", headers,
        body: JSON.stringify({ sectionKey, status }),
      });

      if (satisfaction && !existingSatisfaction) {
        await fetch(`${API}/sessions/${sessionId}/self-assessment`, {
          method: "POST", headers,
          body: JSON.stringify({ sectionKey, score: satisfaction, studentName }),
        });
      }
      setSubmitted(true);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const currentStatus = STATUSES.find(s => s.key === status);
  const currentLevel  = LIKERT.find(l => l.value === satisfaction);

  if (submitted) {
    return (
      <div style={s.card}>
        <div style={{ textAlign: "center", padding: "12px 0" }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>{status === "completed" ? "✅" : "📝"}</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>Progression enregistrée</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 8, flexWrap: "wrap" }}>
            {currentStatus && (
              <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 999, background: currentStatus.bg, color: currentStatus.color, fontWeight: 600 }}>
                {currentStatus.icon} {currentStatus.label}
              </span>
            )}
            {currentLevel && (
              <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 999, background: currentLevel.color + "18", color: currentLevel.color, fontWeight: 600 }}>
                {currentLevel.emoji} Satisfaction : {currentLevel.label}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.card}>
      <div style={s.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>📋</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>État de la section</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#6366f1", background: "#eef2ff", padding: "1px 7px", borderRadius: 99 }}>
            {sectionKey}
          </span>
        </div>
      </div>

      <p style={s.label}>Où en êtes-vous dans la rédaction de cette section ?</p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {STATUSES.map(st => (
          <button
            key={st.key}
            type="button"
            onClick={() => setStatus(st.key)}
            style={{
              ...s.statusBtn,
              background: status === st.key ? st.bg : "#f8fafc",
              border: `2px solid ${status === st.key ? st.color : "#e2e8f0"}`,
              color: status === st.key ? st.color : "#64748b",
              fontWeight: status === st.key ? 700 : 500,
            }}
          >
            {st.icon} {st.label}
          </button>
        ))}
      </div>

      {!existingSatisfaction && (
        <>
          <p style={s.label}>Comment évaluez-vous votre confiance dans la rédaction de cette section ?</p>
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            {LIKERT.map(l => {
              const active = satisfaction === l.value;
              return (
                <button
                  key={l.value}
                  type="button"
                  onClick={() => setSatisfaction(l.value)}
                  style={{
                    ...s.levelBtn,
                    background: active ? l.color + "18" : "#f8fafc",
                    border: `2px solid ${active ? l.color : "#e2e8f0"}`,
                    color: active ? l.color : "#64748b",
                    transform: active ? "scale(1.06)" : "scale(1)",
                  }}
                >
                  <span style={{ fontSize: 22, display: "block", lineHeight: 1 }}>{l.emoji}</span>
                  <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, marginTop: 4, lineHeight: 1.2 }}>{l.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!status || loading}
        style={{
          ...s.submitBtn,
          background: status ? (currentStatus?.color || "#6366f1") : "#e2e8f0",
          color: status ? "#fff" : "#94a3b8",
          cursor: status ? "pointer" : "not-allowed",
        }}
      >
        {loading ? "Enregistrement…" : status ? `Valider — ${currentStatus?.label}` : "Sélectionnez un statut"}
      </button>
    </div>
  );
}

const s = {
  card: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    padding: "16px 18px",
    marginTop: 16,
    boxShadow: "0 1px 4px rgba(0,0,0,.04)",
  },
  header: { display: "flex", alignItems: "center", marginBottom: 12 },
  label: { margin: "0 0 8px", fontSize: 13, color: "#475569", lineHeight: 1.5 },
  statusBtn: {
    padding: "6px 12px", borderRadius: 9, cursor: "pointer",
    fontFamily: "inherit", fontSize: 12, transition: "all .15s",
  },
  levelBtn: {
    flex: 1, padding: "10px 4px", borderRadius: 10, cursor: "pointer",
    fontFamily: "inherit", textAlign: "center", transition: "all .15s",
    display: "flex", flexDirection: "column", alignItems: "center",
  },
  submitBtn: {
    width: "100%", padding: "10px", border: "none", borderRadius: 9,
    fontWeight: 700, fontSize: 12, fontFamily: "inherit", transition: "all .15s", marginTop: 4,
  },
};
