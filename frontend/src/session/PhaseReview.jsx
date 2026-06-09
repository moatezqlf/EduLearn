import { useState } from "react";
import { tokenStorage } from "../api";
import { PEER_CRITERIA } from "./sessionPhases";

// Inject spin keyframe once
if (typeof document !== "undefined" && !document.getElementById("pr-spin-kf")) {
  const el = document.createElement("style");
  el.id = "pr-spin-kf";
  el.textContent = "@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}";
  document.head.appendChild(el);
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

// Anonymous names pool
const ANON_NAMES = ["Apprenant A", "Apprenant B", "Apprenant C", "Apprenant D", "Apprenant E"];
const getAnonName = (idx) => ANON_NAMES[idx % ANON_NAMES.length];

function StarRating({ criteriaId, value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span
          key={n}
          style={{ fontSize: 22, lineHeight: 1, color: n <= value ? "#f59e0b" : "#e2e8f0", cursor: "pointer", transition: "color .1s" }}
          onClick={() => onChange(criteriaId, n)}
        >★</span>
      ))}
    </div>
  );
}

function ScoreBadge({ score, max = 4 }) {
  const pct = ((score - 1) / (max - 1)) * 100;
  const color = score >= max ? "#22c55e" : score >= max * 0.75 ? "#3b82f6" : score >= max * 0.5 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 48, height: 5, background: "#e2e8f0", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99 }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color }}>{score}/{max}</span>
    </div>
  );
}

export default function PhaseReview({
  assignment,
  reviewIdx,
  total,
  peerRatings,
  onRatingChange,
  peerComment,
  onCommentChange,
  onSubmit,
  sessionId,
  question,
  sectionKey,
  sectionCriteria = [],
  styles: s = {},
}) {
  const [open, setOpen]               = useState(false);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalResult, setEvalResult]   = useState(null);
  const [evalError, setEvalError]     = useState("");
  // stage: "form" | "loading" | "result" | "error"
  const [stage, setStage]             = useState("form");

  const anonName = getAnonName(reviewIdx);

  const handleSubmitFeedback = async () => {
    if (!peerComment.trim()) return;
    setStage("loading");
    setEvalError("");
    setEvalResult(null);

    // 1. Call LLM evaluation BEFORE calling onSubmit so component stays mounted
    try {
      const token = tokenStorage.get();
      const res = await fetch(`${API_URL}/sessions/evaluate-feedback-quality`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          sessionId,
          sectionKey,
          peerAnswer: assignment?.answerText || "",
          feedbackText: peerComment,
          criteria: sectionCriteria,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur LLM");
      setEvalResult(data.evaluation);
      setStage("result");
    } catch (e) {
      setEvalError(e.message);
      setStage("error");
    }
  };

  // Called after student reads the eval result
  const handleContinue = () => {
    onSubmit(); // advance reviewIdx or set reviewSubmitted in parent
  };

  if (stage === "loading") {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <div style={spinnerStyle} />
        <p style={{ marginTop: 16, color: "#6366f1", fontWeight: 600 }}>L'IA évalue la qualité de ton feedback…</p>
        <p style={{ color: "#94a3b8", fontSize: 13 }}>Vérification : clarté, pertinence, adéquation au domaine…</p>
      </div>
    );
  }

  if (stage === "result" && evalResult) {
    return <FeedbackEvalResult result={evalResult} anonName={anonName} sectionKey={sectionKey} onContinue={handleContinue} isLast={reviewIdx + 1 >= total} />;
  }

  if (stage === "error") {
    return (
      <div style={{ padding: 32, textAlign: "center" }}>
        <p style={{ color: "#dc2626", fontSize: 13, marginBottom: 16 }}>⚠ Erreur lors de l'évaluation : {evalError}</p>
        <button type="button" style={pr.submitFeedbackBtn} onClick={handleContinue}>
          Continuer quand même →
        </button>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Segoe UI', sans-serif" }}>
      {/* Header */}
      <div style={pr.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={pr.anonAvatar}>{anonName[0]}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>{anonName}</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>Identité anonymisée · {reviewIdx + 1}/{total}</div>
          </div>
        </div>
        {sectionKey && (
          <span style={{ fontSize: 12, fontWeight: 700, color: "#6366f1", background: "#eef2ff", padding: "4px 10px", borderRadius: 999 }}>
            {sectionKey}
          </span>
        )}
      </div>

      {/* Peer answer */}
      <div style={pr.answerCard}>
        <div style={pr.answerLabel}>Production de {anonName}</div>
        <div style={pr.answerText}>
          {assignment?.answerText || <span style={{ color: "#94a3b8" }}>(vide)</span>}
        </div>
      </div>

      {/* Toggle "Fournir feedback" */}
      {!open ? (
        <button type="button" style={pr.giveFeedbackBtn} onClick={() => setOpen(true)}>
          💬 Fournir un feedback
        </button>
      ) : (
        <div style={pr.feedbackPanel}>
          <div style={pr.panelHeader}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Rédiger mon feedback</span>
            <button type="button" onClick={() => setOpen(false)} style={pr.closeBtn}>×</button>
          </div>

          <div style={pr.twoCol}>
            {/* LEFT — textarea + stars */}
            <div style={pr.leftCol}>
              {/* Star ratings */}
              <div style={{ marginBottom: 16 }}>
                <div style={pr.sectionLabel}>Notes par critère (1–5 ★)</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                  {PEER_CRITERIA.map(c => (
                    <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                      <span style={{ fontSize: 13, color: "#374151", display: "flex", alignItems: "center", gap: 6 }}>
                        <span>{c.emoji}</span> {c.label}
                      </span>
                      <StarRating
                        criteriaId={c.id}
                        value={peerRatings[c.id] || 0}
                        onChange={(id, n) => onRatingChange(prev => ({ ...prev, [id]: n }))}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Comment textarea */}
              <div style={pr.sectionLabel}>Commentaire détaillé *</div>
              <textarea
                style={pr.textarea}
                placeholder={`Rédigez votre feedback sur la section ${sectionKey}. Soyez précis et constructif : ce qui fonctionne bien, ce qui peut être amélioré, pourquoi.`}
                value={peerComment}
                onChange={e => onCommentChange(e.target.value)}
                rows={7}
                autoFocus
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>
                  {peerComment.trim().split(/\s+/).filter(Boolean).length} mots
                </span>
                <span style={{ fontSize: 11, color: peerComment.trim().length < 30 ? "#f59e0b" : "#22c55e", fontWeight: 600 }}>
                  {peerComment.trim().length < 30 ? "⚠ Feedback trop court" : "✓ Longueur suffisante"}
                </span>
              </div>

              <button
                type="button"
                style={{ ...pr.submitFeedbackBtn, opacity: peerComment.trim().length < 10 ? 0.45 : 1 }}
                disabled={peerComment.trim().length < 10}
                onClick={handleSubmitFeedback}
              >
                {reviewIdx + 1 >= total ? "Soumettre le feedback →" : "Envoyer et continuer →"}
              </button>
            </div>

            {/* RIGHT — criteria guide */}
            <div style={pr.rightCol}>
              <div style={pr.guideTitle}>📋 Guide d'évaluation</div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12, lineHeight: 1.5 }}>
                Ces notes t'aident à rédiger un feedback pertinent et complet pour la section <strong>{sectionKey}</strong>.
              </div>

              {sectionCriteria.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {sectionCriteria.map((crit, i) => (
                    <div key={i} style={pr.criterionNote}>
                      <span style={pr.criterionNum}>{i + 1}</span>
                      <span style={{ fontSize: 12, color: "#374151", lineHeight: 1.5 }}>{crit}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                  Aucun critère défini pour cette section. Évalue la clarté, la structure et l'argumentation.
                </div>
              )}

              <div style={{ marginTop: 16, padding: "10px 12px", background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6d28d9", marginBottom: 6 }}>💡 Conseils pour un bon feedback</div>
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: "#374151", lineHeight: 1.7 }}>
                  <li>Cite des extraits spécifiques de la production</li>
                  <li>Formule des suggestions concrètes d'amélioration</li>
                  <li>Équilibre points forts et points à améliorer</li>
                  <li>Reste dans le domaine de la section évaluée</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Result panel after LLM evaluation ────────────────────────
function FeedbackEvalResult({ result, anonName, sectionKey, onContinue, isLast }) {
  const overall = result?.overallScore || 0;
  const color = overall >= 3.5 ? "#22c55e" : overall >= 2.5 ? "#3b82f6" : overall >= 1.5 ? "#f59e0b" : "#ef4444";
  const label = overall >= 3.5 ? "Excellent" : overall >= 2.5 ? "Satisfaisant" : overall >= 1.5 ? "À améliorer" : "Insuffisant";

  const dims = [
    { key: "clarity", label: "Clarté", icon: "💡" },
    { key: "relevance", label: "Pertinence", icon: "🎯" },
    { key: "constructiveness", label: "Constructivité", icon: "🔧" },
    { key: "domainAlignment", label: "Adéquation au domaine", icon: "📐" },
  ];

  return (
    <div style={{ fontFamily: "'Segoe UI', sans-serif", padding: 4 }}>
      <div style={pr.evalHeader}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>✅ Feedback soumis !</div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>L'IA a évalué la qualité de ton feedback sur {anonName}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 28, fontWeight: 800, color }}>{overall.toFixed(1)}<span style={{ fontSize: 14, color: "#94a3b8" }}>/4</span></div>
          <div style={{ fontSize: 12, fontWeight: 700, color, background: color + "20", padding: "2px 10px", borderRadius: 999 }}>{label}</div>
        </div>
      </div>

      {result.summary && (
        <div style={{ padding: "12px 16px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", marginBottom: 16, fontSize: 13, color: "#374151", lineHeight: 1.6 }}>
          {result.summary}
        </div>
      )}

      {/* Dimension scores */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        {dims.map(d => {
          const dim = result[d.key];
          if (!dim) return null;
          return (
            <div key={d.key} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{d.icon} {d.label}</span>
                <ScoreBadge score={dim.score} />
              </div>
              {dim.comment && <p style={{ fontSize: 11, color: "#64748b", margin: 0, lineHeight: 1.5 }}>{dim.comment}</p>}
            </div>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {result.strengths?.length > 0 && (
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#166534", marginBottom: 6 }}>✓ Points forts</div>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "#374151", lineHeight: 1.6 }}>
              {result.strengths.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        )}
        {result.improvements?.length > 0 && (
          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e", marginBottom: 6 }}>→ À améliorer</div>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "#374151", lineHeight: 1.6 }}>
              {result.improvements.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        )}
      </div>

      {result.validFeedback === false && (
        <div style={{ marginTop: 14, padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, fontSize: 12, color: "#dc2626", fontWeight: 600 }}>
          ⚠ Ton feedback ne semble pas suffisamment pertinent ou dans le domaine de la section. Essaie de te concentrer sur les critères d'évaluation.
        </div>
      )}

      <button type="button" style={{ ...pr.submitFeedbackBtn, marginTop: 20, background: isLast ? "#22c55e" : "#6366f1" }} onClick={onContinue}>
        {isLast ? "✅ Terminer la phase feedback" : "Continuer → prochain apprenant"}
      </button>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────
const spinnerStyle = {
  width: 36, height: 36, border: "3px solid #e2e8f0", borderTopColor: "#6366f1",
  borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto",
};

const pr = {
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "14px 20px", background: "#f8fafc", borderRadius: "14px 14px 0 0",
    borderBottom: "1px solid #e2e8f0",
  },
  anonAvatar: {
    width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 14, fontWeight: 800, flexShrink: 0,
  },
  answerCard: {
    padding: "16px 20px", background: "#fff", border: "1px solid #e2e8f0",
    borderTop: "none", borderBottom: "none",
  },
  answerLabel: {
    fontSize: 11, fontWeight: 700, color: "#6366f1", textTransform: "uppercase",
    letterSpacing: "0.06em", marginBottom: 8,
  },
  answerText: {
    background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10,
    padding: "12px 14px", fontSize: 13, lineHeight: 1.7, color: "#1e293b",
    maxHeight: 220, overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word",
  },
  giveFeedbackBtn: {
    display: "block", width: "100%", padding: "14px 0",
    background: "linear-gradient(90deg, #6366f1, #8b5cf6)", color: "#fff",
    border: "none", borderRadius: "0 0 14px 14px",
    fontSize: 15, fontWeight: 700, cursor: "pointer", letterSpacing: "0.02em",
    boxShadow: "0 4px 12px rgba(99,102,241,.2)",
  },
  feedbackPanel: {
    background: "#fff", border: "1px solid #e2e8f0", borderTop: "none", borderRadius: "0 0 14px 14px",
    overflow: "hidden",
  },
  panelHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "12px 20px", background: "#faf5ff", borderBottom: "1px solid #e9d5ff",
  },
  closeBtn: {
    background: "none", border: "none", fontSize: 20, color: "#94a3b8", cursor: "pointer", lineHeight: 1,
  },
  twoCol: {
    display: "grid", gridTemplateColumns: "1fr 320px", gap: 0,
  },
  leftCol: {
    padding: "20px 24px", borderRight: "1px solid #f1f5f9",
  },
  rightCol: {
    padding: "20px 20px", background: "#fafafa",
  },
  sectionLabel: {
    fontSize: 11, fontWeight: 700, color: "#6366f1", textTransform: "uppercase",
    letterSpacing: "0.06em", marginBottom: 8,
  },
  textarea: {
    width: "100%", padding: "12px 14px", border: "1.5px solid #e2e8f0", borderRadius: 10,
    fontSize: 13, lineHeight: 1.6, resize: "vertical", outline: "none",
    fontFamily: "inherit", boxSizing: "border-box", minHeight: 140,
    background: "#fafafa",
  },
  submitFeedbackBtn: {
    width: "100%", marginTop: 14, padding: "13px 0",
    background: "#6366f1", color: "#fff", border: "none", borderRadius: 10,
    fontSize: 14, fontWeight: 700, cursor: "pointer",
    boxShadow: "0 4px 12px rgba(99,102,241,.25)",
  },
  guideTitle: {
    fontSize: 12, fontWeight: 800, color: "#374151", marginBottom: 10,
    textTransform: "uppercase", letterSpacing: "0.06em",
  },
  criterionNote: {
    display: "flex", gap: 8, alignItems: "flex-start",
    background: "#fff", border: "1px solid #e9d5ff", borderRadius: 8,
    padding: "8px 10px",
  },
  criterionNum: {
    width: 20, height: 20, borderRadius: "50%", background: "#6366f1", color: "#fff",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 10, fontWeight: 800, flexShrink: 0,
  },
  evalHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    padding: "16px 20px", background: "#f0fdf4", borderRadius: 12,
    border: "1px solid #bbf7d0", marginBottom: 16,
  },
};
