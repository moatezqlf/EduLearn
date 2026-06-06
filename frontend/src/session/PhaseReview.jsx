import { useState } from "react";
import { tokenStorage } from "../api";
import { PEER_CRITERIA } from "./sessionPhases";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

function StarRating({ criteriaId, value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span
          key={n}
          style={{ fontSize: 24, lineHeight: 1, color: n <= value ? "#f59e0b" : "#e2e8f0", cursor: "pointer" }}
          onClick={() => onChange(criteriaId, n)}
        >
          ★
        </span>
      ))}
    </div>
  );
}

/**
 * Phase peer review : texte du pair + grille + aide IA (backend).
 */
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
  styles: s = {},
}) {
  const [aiOpen, setAiOpen] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAssist, setAiAssist] = useState(null);
  const [aiError, setAiError] = useState("");

  const requestAiAssist = async () => {
    if (!assignment?.answerText?.trim()) {
      setAiError("Aucun texte à analyser.");
      return;
    }
    setAiLoading(true);
    setAiError("");
    try {
      const token = tokenStorage.get();
      const res = await fetch(`${API_URL}/sessions/assist-peer-feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          sessionId,
          question,
          sectionKey,
          peerAnswer: assignment.answerText,
          draftComment: peerComment,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Échec de l'assistance IA");
      setAiAssist(data.assist || data);
    } catch (e) {
      setAiError(e.message);
    } finally {
      setAiLoading(false);
    }
  };

  const applySuggestedComment = () => {
    const text = aiAssist?.suggestedComment?.trim();
    if (text) onCommentChange(text);
  };

  const card = s.card || { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 24 };
  const peerBox = s.peerAnswerBox || {
    background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10,
    padding: 16, fontSize: 14, lineHeight: 1.7, marginBottom: 16, maxHeight: 280, overflowY: "auto",
  };

  return (
    <div style={card}>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 16 }}>
        👥 Feedback pair — {assignment?.revieweeName || "Pair"} ({reviewIdx + 1}/{total})
        {sectionKey && (
          <span style={{ fontSize: 13, fontWeight: 500, color: "#6366f1", marginLeft: 8 }}>
            · {sectionKey}
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 8, textTransform: "uppercase" }}>
            Production du pair
          </div>
          <div style={peerBox}>
            {assignment?.answerText || <span style={{ color: "#94a3b8" }}>(vide)</span>}
          </div>
        </div>

        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <button
            type="button"
            onClick={() => setAiOpen(o => !o)}
            style={{
              width: "100%", padding: "10px 12px", marginBottom: aiOpen ? 10 : 0,
              background: "#EEF2FF", border: "1px solid #C7D2FB", borderRadius: 10,
              fontSize: 13, fontWeight: 600, color: "#4F46E5", cursor: "pointer",
            }}
          >
            {aiOpen ? "▾" : "▸"} Aide IA pour le feedback
          </button>
          {aiOpen && (
            <div style={{ background: "#fafafa", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14 }}>
              <button
                type="button"
                onClick={requestAiAssist}
                disabled={aiLoading}
                style={{
                  width: "100%", padding: "10px", background: "#6366f1", color: "#fff",
                  border: "none", borderRadius: 9, fontWeight: 600, fontSize: 13,
                  cursor: aiLoading ? "wait" : "pointer", opacity: aiLoading ? 0.7 : 1,
                }}
              >
                {aiLoading ? "Analyse en cours…" : "✨ Obtenir des suggestions"}
              </button>
              {aiError && <p style={{ color: "#dc2626", fontSize: 12, marginTop: 8 }}>{aiError}</p>}
              {aiAssist && (
                <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.6, color: "#374151" }}>
                  {aiAssist.strengths?.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <strong style={{ color: "#166534" }}>Points forts</strong>
                      <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                        {aiAssist.strengths.map((t, i) => <li key={i}>{t}</li>)}
                      </ul>
                    </div>
                  )}
                  {aiAssist.weaknesses?.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <strong style={{ color: "#92400e" }}>À améliorer</strong>
                      <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                        {aiAssist.weaknesses.map((t, i) => <li key={i}>{t}</li>)}
                      </ul>
                    </div>
                  )}
                  {aiAssist.inconsistencies?.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <strong style={{ color: "#b45309" }}>Incohérences</strong>
                      <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                        {aiAssist.inconsistencies.map((t, i) => <li key={i}>{t}</li>)}
                      </ul>
                    </div>
                  )}
                  {aiAssist.tips?.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <strong style={{ color: "#4338ca" }}>Conseils</strong>
                      <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                        {aiAssist.tips.map((t, i) => <li key={i}>{t}</li>)}
                      </ul>
                    </div>
                  )}
                  {aiAssist.suggestedComment && (
                    <div style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        onClick={applySuggestedComment}
                        style={{
                          padding: "8px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0",
                          borderRadius: 8, fontSize: 12, fontWeight: 600, color: "#166534", cursor: "pointer",
                        }}
                      >
                        Utiliser le brouillon suggéré
                      </button>
                      <p style={{ marginTop: 8, fontSize: 12, color: "#64748b", fontStyle: "italic" }}>
                        {aiAssist.suggestedComment.slice(0, 200)}
                        {aiAssist.suggestedComment.length > 200 ? "…" : ""}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 8, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#6366f1", marginBottom: 10 }}>
          NOTER CHAQUE CRITÈRE (1–5 ★)
        </div>
        {PEER_CRITERIA.map(c => (
          <div
            key={c.id}
            style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 0", borderBottom: "1px solid #f1f5f9",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>{c.emoji}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>{c.label}</span>
            </div>
            <StarRating
              criteriaId={c.id}
              value={peerRatings[c.id] || 0}
              onChange={(id, n) => onRatingChange(prev => ({ ...prev, [id]: n }))}
            />
          </div>
        ))}
      </div>

      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
        Commentaire constructif
      </label>
      <textarea
        style={s.textarea || {
          width: "100%", padding: "12px 14px", border: "1.5px solid #e2e8f0", borderRadius: 10,
          fontSize: 14, resize: "vertical", outline: "none", fontFamily: "inherit", boxSizing: "border-box",
        }}
        placeholder="Qu'est-ce qui fonctionne bien ? Que peut-on améliorer ? Soyez précis et bienveillant."
        value={peerComment}
        onChange={e => onCommentChange(e.target.value)}
        rows={5}
      />
      <button
        type="button"
        style={{
          ...(s.submitBtn || {}),
          width: "100%", marginTop: 16, padding: "13px 0", background: "#6366f1", color: "#fff",
          border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700,
          cursor: peerComment.trim() ? "pointer" : "not-allowed",
          opacity: peerComment.trim() ? 1 : 0.5,
        }}
        onClick={onSubmit}
        disabled={!peerComment.trim()}
      >
        {reviewIdx + 1 >= total ? "Envoyer l'évaluation →" : "Suivant →"}
      </button>
    </div>
  );
}
