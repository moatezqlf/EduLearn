import { useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const LEVELS = [
  { value: 1, label: "Très faible",  emoji: "😟", color: "#ef4444", bg: "#fee2e2", border: "#fecaca" },
  { value: 2, label: "Faible",       emoji: "😕", color: "#f97316", bg: "#fff7ed", border: "#fed7aa" },
  { value: 3, label: "Modéré",       emoji: "😐", color: "#f59e0b", bg: "#fefce8", border: "#fde68a" },
  { value: 4, label: "Élevé",        emoji: "😊", color: "#22c55e", bg: "#f0fdf4", border: "#bbf7d0" },
  { value: 5, label: "Très élevé",   emoji: "😄", color: "#6366f1", bg: "#eef2ff", border: "#c7d2fe" },
];

export default function SelfAssessmentWidget({ sessionId, sectionKey, studentName, onDismiss }) {
  const [selected, setSelected]   = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading]     = useState(false);

  if (!sessionId || !sectionKey) return null;

  const handleSubmit = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      const token = localStorage.getItem("edulearn_token");
      await fetch(`${API}/sessions/${sessionId}/self-assessment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sectionKey, score: selected, studentName }),
      });
      setSubmitted(true);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const level = LEVELS.find(l => l.value === selected);

  if (submitted) {
    return (
      <div style={s.card}>
        <div style={{ textAlign: "center", padding: "10px 0" }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>{level?.emoji}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: level?.color }}>
            Auto-évaluation enregistrée — {level?.label}
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
            Merci pour votre retour sur la section <strong>{sectionKey}</strong>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.card}>
      {/* Header */}
      <div style={s.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>📊</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>Auto-évaluation</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#6366f1", background: "#eef2ff", padding: "1px 7px", borderRadius: 99 }}>
            {sectionKey}
          </span>
        </div>
        <button type="button" onClick={onDismiss} style={s.dismissBtn}>×</button>
      </div>

      <p style={s.question}>
        Comment évaluez-vous votre progression dans la rédaction de cette section ?
      </p>

      {/* Likert scale */}
      <div style={s.scale}>
        {LEVELS.map(l => {
          const active = selected === l.value;
          return (
            <button
              key={l.value}
              type="button"
              onClick={() => setSelected(l.value)}
              style={{
                ...s.levelBtn,
                background:   active ? l.bg     : "#f8fafc",
                border:       active ? `2px solid ${l.border}` : "2px solid #e2e8f0",
                color:        active ? l.color  : "#64748b",
                transform:    active ? "scale(1.06)" : "scale(1)",
              }}
            >
              <span style={{ fontSize: 22, display: "block", lineHeight: 1 }}>{l.emoji}</span>
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, marginTop: 4, lineHeight: 1.2 }}>
                {l.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Scale labels */}
      <div style={s.scaleLabels}>
        <span style={{ fontSize: 10, color: "#94a3b8" }}>← Pas du tout confiant</span>
        <span style={{ fontSize: 10, color: "#94a3b8" }}>Très confiant →</span>
      </div>

      {/* Submit */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!selected || loading}
        style={{
          ...s.submitBtn,
          background: selected ? (level?.color || "#6366f1") : "#e2e8f0",
          color: selected ? "#fff" : "#94a3b8",
          cursor: selected ? "pointer" : "not-allowed",
        }}
      >
        {loading ? "Envoi…" : selected ? `Valider — ${level?.label}` : "Choisissez un niveau"}
      </button>
    </div>
  );
}

const s = {
  card: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    padding: "14px 16px",
    marginTop: 12,
    boxShadow: "0 1px 4px rgba(0,0,0,.04)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  dismissBtn: {
    border: "none",
    background: "#f1f5f9",
    borderRadius: 6,
    width: 26,
    height: 26,
    fontSize: 16,
    cursor: "pointer",
    color: "#64748b",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  question: {
    margin: "0 0 12px",
    fontSize: 13,
    color: "#475569",
    lineHeight: 1.5,
  },
  scale: {
    display: "flex",
    gap: 6,
    marginBottom: 6,
  },
  levelBtn: {
    flex: 1,
    padding: "10px 4px",
    borderRadius: 10,
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "center",
    transition: "all .15s",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  scaleLabels: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  submitBtn: {
    width: "100%",
    padding: "10px",
    border: "none",
    borderRadius: 9,
    fontWeight: 700,
    fontSize: 12,
    fontFamily: "inherit",
    transition: "all .15s",
  },
};
