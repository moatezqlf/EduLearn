import { useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const MODES = [
  { id: "questions", icon: "❓", label: "Questions" },
  { id: "starters",  icon: "✍️", label: "Amorces" },
  { id: "template",  icon: "📋", label: "Plan" },
];

const THEME = {
  questions: { bg: "#eef2ff", border: "#c7d2fe", accent: "#6366f1", light: "#f5f3ff" },
  starters:  { bg: "#faf5ff", border: "#e9d5ff", accent: "#8b5cf6", light: "#fdf4ff" },
  template:  { bg: "#f0fdf4", border: "#bbf7d0", accent: "#16a34a", light: "#f7fef9" },
};

const MODE_DESC = {
  questions: "L'IA génère des questions progressives pour structurer ta réflexion sans te donner la réponse.",
  starters:  "L'IA génère des débuts de phrases académiques à compléter selon le contenu de la section.",
  template:  "L'IA génère un plan en étapes avec instructions et exemples concrets.",
};

export default function ScaffoldingPanel({ sessionId, sectionKey, onInsert }) {
  const [mode, setMode]         = useState("questions");
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [checked, setChecked]   = useState({});
  const [generated, setGenerated] = useState(false);

  const th = THEME[mode];

  const generate = async (targetMode = mode) => {
    setLoading(true); setError(""); setItems([]); setChecked({}); setGenerated(false);
    try {
      const token = sessionStorage.getItem("edulearn_token");
      const res = await fetch(`${API}/scaffolding/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sessionId, sectionKey, mode: targetMode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur serveur");
      setItems(data.items || []);
      setGenerated(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (m) => {
    setMode(m);
    setItems([]); setGenerated(false); setError(""); setChecked({});
  };

  const progress = items.length > 0
    ? Math.round((Object.values(checked).filter(Boolean).length / items.length) * 100)
    : 0;

  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", marginBottom: 12, boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>

      {/* ── Header ── */}
      <div style={{ padding: "9px 14px", background: "#1e293b", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 15 }}>🤖</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: "#fff", letterSpacing: ".01em" }}>Aide IA — Scaffolding</span>
          <span style={{ fontSize: 9, fontWeight: 700, color: "#a78bfa", background: "#312e81", padding: "1px 7px", borderRadius: 99, letterSpacing: ".05em" }}>BETA</span>
        </div>
        <span style={{ fontSize: 10, color: "#475569", background: "#0f172a", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>
          {sectionKey}
        </span>
      </div>

      {/* ── Mode tabs ── */}
      <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0" }}>
        {MODES.map(m => {
          const t = THEME[m.id];
          const active = mode === m.id;
          return (
            <button key={m.id} type="button"
              onClick={() => switchMode(m.id)}
              style={{
                flex: 1, padding: "8px 4px", border: "none", cursor: "pointer", fontFamily: "inherit",
                fontSize: 11, fontWeight: 700, transition: "all .15s",
                background: active ? t.bg : "#f8fafc",
                color: active ? t.accent : "#94a3b8",
                borderBottom: active ? `2.5px solid ${t.accent}` : "2.5px solid transparent",
              }}>
              {m.icon} {m.label}
            </button>
          );
        })}
      </div>

      {/* ── Body ── */}
      <div style={{ padding: "12px 14px" }}>

        {/* Not yet generated */}
        {!generated && !loading && (
          <>
            <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 12px", lineHeight: 1.6 }}>
              {MODE_DESC[mode]}
            </p>
            <button type="button" onClick={() => generate(mode)}
              style={{ width: "100%", padding: "10px", background: th.accent, color: "#fff", border: "none", borderRadius: 9, fontWeight: 700, fontSize: 12, cursor: "pointer", letterSpacing: ".01em" }}>
              ✨ Générer l'aide IA
            </button>
          </>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: "18px 0" }}>
            <div style={{ width: 22, height: 22, border: `2.5px solid ${th.border}`, borderTopColor: th.accent, borderRadius: "50%", animation: "scaf-spin .8s linear infinite", margin: "0 auto 10px" }} />
            <p style={{ fontSize: 11, color: "#64748b", margin: 0 }}>Génération en cours…</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ padding: "10px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 11, color: "#dc2626", lineHeight: 1.5, marginBottom: 8 }}>
            ⚠️ {error}
          </div>
        )}

        {/* ── QUESTIONS mode ── */}
        {generated && mode === "questions" && items.length > 0 && (
          <div>
            {/* Progress bar */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8" }}>Progression</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: th.accent }}>{progress}%</span>
            </div>
            <div style={{ height: 4, background: "#e2e8f0", borderRadius: 4, overflow: "hidden", marginBottom: 10 }}>
              <div style={{ height: "100%", width: `${progress}%`, background: th.accent, borderRadius: 4, transition: "width .35s ease" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {items.map(item => {
                const done = !!checked[item.id];
                return (
                  <div key={item.id}
                    onClick={() => setChecked(p => ({ ...p, [item.id]: !p[item.id] }))}
                    style={{
                      padding: "9px 11px", borderRadius: 9, cursor: "pointer", transition: "all .15s",
                      border: `1.5px solid ${done ? th.accent : th.border}`,
                      background: done ? th.bg : "#fff",
                    }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{done ? "✅" : "⬜"}</span>
                      <div>
                        <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: done ? 600 : 500, color: done ? th.accent : "#1e293b", lineHeight: 1.45, textDecoration: done ? "line-through" : "none", opacity: done ? 0.7 : 1 }}>
                          {item.question}
                        </p>
                        {item.hint && (
                          <p style={{ margin: 0, fontSize: 10, color: "#64748b", lineHeight: 1.4 }}>
                            💡 {item.hint}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── STARTERS mode ── */}
        {generated && mode === "starters" && items.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map(item => (
              <div key={item.id} style={{ padding: "9px 11px", borderRadius: 9, border: `1px solid ${th.border}`, background: th.light }}>
                {item.purpose && (
                  <p style={{ margin: "0 0 4px", fontSize: 9, fontWeight: 800, color: th.accent, textTransform: "uppercase", letterSpacing: ".06em" }}>
                    {item.purpose}
                  </p>
                )}
                <p style={{ margin: "0 0 7px", fontSize: 12, color: "#374151", lineHeight: 1.55, fontStyle: "italic" }}>
                  « {item.starter} »
                </p>
                <button type="button" onClick={() => onInsert(item.starter)}
                  style={{ padding: "4px 11px", background: th.accent, color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  + Insérer
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── TEMPLATE mode ── */}
        {generated && mode === "template" && items.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map(item => (
              <div key={item.id} style={{ borderRadius: 9, border: `1px solid ${th.border}`, overflow: "hidden" }}>
                <div style={{ padding: "7px 12px", background: th.bg, fontWeight: 800, fontSize: 12, color: th.accent }}>
                  {item.step}
                </div>
                <div style={{ padding: "9px 12px", background: "#fff" }}>
                  <p style={{ margin: "0 0 7px", fontSize: 12, color: "#374151", lineHeight: 1.55 }}>
                    {item.instruction}
                  </p>
                  {item.example && (
                    <div style={{ padding: "7px 10px", background: "#f8fafc", borderRadius: 7, borderLeft: `3px solid ${th.accent}`, fontSize: 11, color: "#64748b", lineHeight: 1.5, fontStyle: "italic" }}>
                      {item.example}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Regenerate button */}
        {generated && !loading && (
          <button type="button" onClick={() => generate(mode)}
            style={{ marginTop: 10, width: "100%", padding: "7px", background: "none", color: "#64748b", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            ↺ Regénérer
          </button>
        )}
      </div>

      <style>{`
        @keyframes scaf-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
