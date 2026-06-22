import { useState, useEffect, useCallback } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const SECTION_COLORS = {
  Titre: "#64748b", Abstract: "#8b5cf6", Introduction: "#22c55e",
  "Méthodes": "#3b82f6", Résultats: "#f59e0b", Discussion: "#ef4444", Conclusion: "#a855f7",
};

function sectionColor(sk) {
  return SECTION_COLORS[sk] || "#6366f1";
}

function scoreColor(score) {
  if (score == null) return "#94a3b8";
  if (score >= 16) return "#22c55e";
  if (score >= 12) return "#3b82f6";
  if (score >= 8)  return "#f59e0b";
  return "#ef4444";
}

function ScoreBadge({ score }) {
  if (score == null) return <span style={{ color: "#cbd5e1", fontSize: 11 }}>—</span>;
  return (
    <span style={{
      display: "inline-block", minWidth: 34, textAlign: "center",
      padding: "2px 6px", borderRadius: 6, fontSize: 12, fontWeight: 700,
      background: scoreColor(score) + "22", color: scoreColor(score),
    }}>
      {score}/20
    </span>
  );
}

function SectionChip({ sectionKey, done }) {
  const color = sectionColor(sectionKey);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600,
      border: `1px solid ${color}44`,
      background: done ? color + "22" : "#f1f5f9",
      color: done ? color : "#94a3b8",
      opacity: done ? 1 : 0.55,
    }}>
      {done ? "✓" : "○"} {sectionKey}
    </span>
  );
}

function formatDuration(seconds) {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}min ${s > 0 ? s + "s" : ""}`.trim() : `${s}s`;
}

// ─── Group Progress Cards ───────────────────────────────────────────
function GroupCards({ groups, selectedSections }) {
  if (!groups.length) return <div style={st.empty}>Aucun groupe formé pour l'instant.</div>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
      {groups.map((g, i) => {
        const memberProgress = g.members.map(m => {
          const completedInGroup = (g.sectionsCompleted || []).filter(sk =>
            selectedSections.includes(sk)
          );
          return { ...m, groupCompleted: completedInGroup };
        });
        const completedCount = (g.sectionsCompleted || []).length;
        const totalCount = selectedSections.length;
        const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

        return (
          <div key={i} style={st.groupCard}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: "#1e293b" }}>Groupe {i + 1}</span>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                background: pct === 100 ? "#dcfce7" : pct > 0 ? "#eff6ff" : "#f8fafc",
                color: pct === 100 ? "#16a34a" : pct > 0 ? "#2563eb" : "#94a3b8",
              }}>
                {completedCount}/{totalCount} sections
              </span>
            </div>

            {/* Progress bar */}
            <div style={{ height: 4, borderRadius: 2, background: "#e2e8f0", marginBottom: 10, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: "#6366f1", borderRadius: 2, transition: "width .4s" }} />
            </div>

            {/* Section badges */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
              {selectedSections.map(sk => (
                <SectionChip key={sk} sectionKey={sk} done={(g.sectionsCompleted || []).includes(sk)} />
              ))}
            </div>

            {/* Members */}
            <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 8 }}>
              {g.members.map(m => (
                <div key={m.id || m.name} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0" }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%", background: "#6366f122",
                    color: "#6366f1", fontWeight: 700, fontSize: 10,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {String(m.name || "?")[0].toUpperCase()}
                  </div>
                  <span style={{ fontSize: 12, color: "#475569", flex: 1 }}>{m.name}</span>
                  {m.isReceiver && <span style={{ fontSize: 10, color: "#f59e0b", fontWeight: 700 }}>★</span>}
                </div>
              ))}
            </div>

            {g.lastActivityAt && (
              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 6 }}>
                Dernière activité : {new Date(g.lastActivityAt).toLocaleTimeString()}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Scores Matrix (AI — students × sections) ───────────────────────
function ScoresMatrix({ students, selectedSections }) {
  if (!students.length) return <div style={st.empty}>Aucun étudiant n'a encore soumis.</div>;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={st.table}>
        <thead>
          <tr>
            <th style={{ ...st.th, textAlign: "left", minWidth: 130 }}>Étudiant</th>
            {selectedSections.map(sk => (
              <th key={sk} style={{ ...st.th, color: sectionColor(sk) }}>{sk}</th>
            ))}
            <th style={st.th}>Moy.</th>
            <th style={st.th}>Avancement</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s, i) => {
            const scores = selectedSections
              .map(sk => s.sectionScores?.[sk]?.score)
              .filter(v => Number.isFinite(Number(v)))
              .map(Number);
            const avg = scores.length
              ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1))
              : null;
            const pct = selectedSections.length > 0
              ? Math.round((s.completedSections.length / selectedSections.length) * 100)
              : 0;

            return (
              <tr key={String(s.studentId)} style={{ background: i % 2 === 0 ? "#fff" : "#fafafe" }}>
                <td style={st.td}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                      background: "#6366f122", color: "#6366f1", fontWeight: 700, fontSize: 11,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {String(s.studentName || "?")[0].toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 12, color: "#1e293b" }}>{s.studentName}</div>
                      {s.lastSectionKey && (
                        <div style={{ fontSize: 10, color: "#94a3b8" }}>
                          Dernière section : <span style={{ color: sectionColor(s.lastSectionKey) }}>{s.lastSectionKey}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                {selectedSections.map(sk => {
                  const sv = s.sectionScores?.[sk];
                  return (
                    <td key={sk} style={{ ...st.td, textAlign: "center" }}>
                      <ScoreBadge score={sv?.score ?? null} />
                    </td>
                  );
                })}
                <td style={{ ...st.td, textAlign: "center" }}>
                  <ScoreBadge score={avg} />
                </td>
                <td style={{ ...st.td, textAlign: "center", minWidth: 80 }}>
                  <div style={{ fontSize: 11, color: "#475569", marginBottom: 2 }}>
                    {s.completedSections.length}/{selectedSections.length}
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: "#e2e8f0", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: "#6366f1", borderRadius: 2 }} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Self-Assessment Matrix (students × sections, Likert 1-5) ────────
function SelfAssessmentMatrix({ students, selectedSections }) {
  if (!students.length) return <div style={st.empty}>Aucune auto-évaluation soumise pour l'instant.</div>;

  const hasAny = students.some(s => Object.keys(s.selfAssessment || {}).length > 0);
  if (!hasAny) return (
    <div style={st.empty}>
      Les étudiants n'ont pas encore soumis d'auto-évaluation.<br />
      <span style={{ fontSize: 11, color: "#94a3b8" }}>Le widget apparaît après réception du feedback IA.</span>
    </div>
  );

  return (
    <div>
      {/* Divergence legend */}
      <div style={{ display: "flex", gap: 14, marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: "#64748b" }}>
          <strong>⚠↑</strong> Surconfiant — perception &gt; score IA
        </span>
        <span style={{ fontSize: 11, color: "#64748b" }}>
          <strong>⚠↓</strong> Sous-confiant — perception &lt; score IA
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={st.table}>
          <thead>
            <tr>
              <th style={{ ...st.th, textAlign: "left", minWidth: 130 }}>Étudiant</th>
              {selectedSections.map(sk => (
                <th key={sk} style={{ ...st.th, color: sectionColor(sk) }}>{sk}</th>
              ))}
              <th style={st.th}>Moy. percept.</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s, i) => {
              const saScores = selectedSections
                .map(sk => s.selfAssessment?.[sk])
                .filter(v => Number.isFinite(Number(v)))
                .map(Number);
              const saAvg = saScores.length
                ? Number((saScores.reduce((a, b) => a + b, 0) / saScores.length).toFixed(1))
                : null;

              return (
                <tr key={String(s.studentId)} style={{ background: i % 2 === 0 ? "#fff" : "#fafafe" }}>
                  <td style={st.td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{
                        width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                        background: "#6366f122", color: "#6366f1", fontWeight: 700, fontSize: 11,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {String(s.studentName || "?")[0].toUpperCase()}
                      </div>
                      <span style={{ fontWeight: 600, fontSize: 12, color: "#1e293b" }}>{s.studentName}</span>
                    </div>
                  </td>
                  {selectedSections.map(sk => {
                    const sa = s.selfAssessment?.[sk];
                    const aiSc = s.sectionScores?.[sk]?.score ?? null;
                    return (
                      <td key={sk} style={{ ...st.td, textAlign: "center" }}>
                        <LikertBadge score={sa ?? null} />
                        <DivergenceBadge aiScore={aiSc} selfScore={sa ?? null} />
                      </td>
                    );
                  })}
                  <td style={{ ...st.td, textAlign: "center" }}>
                    <LikertBadge score={saAvg} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Section Stats Row ───────────────────────────────────────────────
const LIKERT_COLORS = ["", "#ef4444", "#f97316", "#f59e0b", "#22c55e", "#6366f1"];
const LIKERT_LABELS = ["", "Très faible", "Faible", "Modéré", "Élevé", "Très élevé"];
const LIKERT_EMOJI  = ["", "😟", "😕", "😐", "😊", "😄"];

function LikertBadge({ score }) {
  if (score == null) return <span style={{ color: "#cbd5e1", fontSize: 11 }}>—</span>;
  const v = Math.round(score);
  const color = LIKERT_COLORS[v] || "#94a3b8";
  return (
    <span title={LIKERT_LABELS[v] || ""} style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: "2px 6px", borderRadius: 6, fontSize: 11, fontWeight: 700,
      background: color + "22", color,
    }}>
      {LIKERT_EMOJI[v]} {typeof score === "number" ? score.toFixed(1) : score}/5
    </span>
  );
}

function DivergenceBadge({ aiScore, selfScore }) {
  if (aiScore == null || selfScore == null) return null;
  // Normalize both to 0-1 range
  const aiNorm   = aiScore / 20;
  const selfNorm = (selfScore - 1) / 4;
  const diff = selfNorm - aiNorm;
  if (Math.abs(diff) < 0.25) return null; // no significant divergence
  if (diff > 0.25) return (
    <span title="Étudiant surconfiant : perception plus haute que le score IA" style={{ fontSize: 10, color: "#dc2626", fontWeight: 700, marginLeft: 4 }}>⚠↑</span>
  );
  return (
    <span title="Étudiant sous-confiant : perception plus basse que le score IA" style={{ fontSize: 10, color: "#7c3aed", fontWeight: 700, marginLeft: 4 }}>⚠↓</span>
  );
}

function SectionStatsRow({ selectedSections, sectionStats }) {
  if (!selectedSections.length) return null;

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {selectedSections.map(sk => {
        const stats = sectionStats[sk] || {};
        const pct = Math.round((stats.completionRate || 0) * 100);
        return (
          <div key={sk} style={{
            flex: "1 1 160px", padding: "12px 14px", borderRadius: 10,
            border: `1px solid ${sectionColor(sk)}33`,
            background: sectionColor(sk) + "0A",
          }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: sectionColor(sk), marginBottom: 6 }}>{sk}</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 10, color: "#94a3b8" }}>Moy. IA</div>
                <div style={{ fontWeight: 700, fontSize: 15, color: scoreColor(stats.avgScore) }}>
                  {stats.avgScore != null ? `${stats.avgScore}/20` : "—"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "#94a3b8" }}>Perception</div>
                <div style={{ fontWeight: 700, fontSize: 15, color: LIKERT_COLORS[Math.round(stats.avgSelfAssessment)] || "#94a3b8" }}>
                  {stats.avgSelfAssessment != null ? `${stats.avgSelfAssessment}/5` : "—"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "#94a3b8" }}>Soumis</div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#1e293b" }}>
                  {stats.submitted ?? 0}/{stats.total ?? 0}
                </div>
              </div>
            </div>
            <div style={{ height: 3, borderRadius: 2, background: "#e2e8f0", marginTop: 8, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: sectionColor(sk), borderRadius: 2 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Status badge ────────────────────────────────────────────────────
const STATUS_META = {
  not_started:    { label: "Non commencé",  color: "#94a3b8", bg: "#f1f5f9", icon: "○" },
  in_progress:    { label: "En cours",       color: "#3b82f6", bg: "#eff6ff", icon: "⟳" },
  in_review:      { label: "En révision",    color: "#f59e0b", bg: "#fffbeb", icon: "✏" },
  needs_revision: { label: "À retravailler", color: "#ef4444", bg: "#fef2f2", icon: "⚠" },
  completed:      { label: "Terminé",        color: "#22c55e", bg: "#f0fdf4", icon: "✓" },
};

function StatusBadge({ status }) {
  if (!status) return <span style={{ color: "#cbd5e1", fontSize: 11 }}>—</span>;
  const m = STATUS_META[status] || { label: status, color: "#6366f1", bg: "#eef2ff", icon: "?" };
  return (
    <span title={m.label} style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: "2px 7px", borderRadius: 6, fontSize: 10, fontWeight: 700,
      background: m.bg, color: m.color, whiteSpace: "nowrap",
    }}>
      {m.icon} {m.label}
    </span>
  );
}

// ─── Cohort Analytics Tab ────────────────────────────────────────────
function CohortAnalytics({ students, selectedSections, sectionStats }) {
  if (!students.length) return <div style={st.empty}>Aucun étudiant pour l'instant.</div>;

  // Flag students needing intervention
  const flagged = students.map(s => {
    const aiScores   = selectedSections.map(sk => s.sectionScores?.[sk]?.score).filter(v => v != null);
    const saScores   = selectedSections.map(sk => s.selfAssessment?.[sk]).filter(v => v != null);
    const avgAI      = aiScores.length  ? aiScores.reduce((a, b) => a + b, 0)  / aiScores.length  : null;
    const avgSA      = saScores.length  ? saScores.reduce((a, b) => a + b, 0)  / saScores.length  : null;

    let flag = null;
    // Low score + high confidence → false confidence
    if (avgAI != null && avgSA != null && avgAI < 10 && avgSA >= 4)
      flag = { type: "false_confidence", label: "Fausse confiance", color: "#f97316", icon: "⚠↑" };
    // Low score + low confidence → struggling
    else if (avgAI != null && avgSA != null && avgAI < 10 && avgSA <= 2)
      flag = { type: "struggling", label: "En difficulté", color: "#ef4444", icon: "🆘" };
    // Good score + low confidence → underconfident
    else if (avgAI != null && avgSA != null && avgAI >= 12 && avgSA <= 2)
      flag = { type: "underconfident", label: "Sous-confiant", color: "#3b82f6", icon: "⚠↓" };

    return { ...s, avgAI, avgSA, flag };
  });

  const interventionStudents = flagged.filter(s => s.flag);
  const difficultSections = selectedSections.filter(sk => sectionStats?.[sk]?.isDifficult);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Section-level analytics */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 10 }}>Analyse par section</div>
        <div style={{ overflowX: "auto" }}>
          <table style={st.table}>
            <thead>
              <tr>
                <th style={{ ...st.th, textAlign: "left" }}>Section</th>
                <th style={st.th}>Moy. IA</th>
                <th style={st.th}>Moy. Pairs</th>
                <th style={st.th}>Satisfaction</th>
                <th style={st.th}>Taux complet.</th>
                <th style={st.th}>Statut</th>
              </tr>
            </thead>
            <tbody>
              {selectedSections.map((sk, i) => {
                const stats = sectionStats?.[sk] || {};
                const pct   = Math.round((stats.completionRate || 0) * 100);
                return (
                  <tr key={sk} style={{ background: i % 2 === 0 ? "#fff" : "#fafafe" }}>
                    <td style={st.td}>
                      <span style={{ fontWeight: 700, color: sectionColor(sk), fontSize: 12 }}>{sk}</span>
                      {stats.isDifficult && (
                        <span title="Section difficile" style={{ marginLeft: 6, fontSize: 10, color: "#ef4444", fontWeight: 700 }}>⚠ Difficile</span>
                      )}
                    </td>
                    <td style={{ ...st.td, textAlign: "center" }}>
                      <ScoreBadge score={stats.avgScore ?? null} />
                    </td>
                    <td style={{ ...st.td, textAlign: "center" }}>
                      {stats.avgPeerScore != null
                        ? <span style={{ fontSize: 12, fontWeight: 700, color: "#8b5cf6" }}>{stats.avgPeerScore.toFixed(1)}/5</span>
                        : <span style={{ color: "#cbd5e1", fontSize: 11 }}>—</span>}
                    </td>
                    <td style={{ ...st.td, textAlign: "center" }}>
                      <LikertBadge score={stats.avgSelfAssessment ?? null} />
                    </td>
                    <td style={{ ...st.td, textAlign: "center" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: pct >= 75 ? "#22c55e" : pct >= 40 ? "#f59e0b" : "#ef4444" }}>
                        {pct}%
                      </div>
                      <div style={{ fontSize: 10, color: "#94a3b8" }}>{stats.submitted}/{stats.total}</div>
                    </td>
                    <td style={{ ...st.td, textAlign: "center" }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
                        background: stats.isDifficult ? "#fef2f2" : pct >= 75 ? "#f0fdf4" : "#fffbeb",
                        color: stats.isDifficult ? "#ef4444" : pct >= 75 ? "#22c55e" : "#f59e0b",
                      }}>
                        {stats.isDifficult ? "⚠ Difficile" : pct >= 75 ? "✓ Bon" : "En cours"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Difficult sections alert */}
      {difficultSections.length > 0 && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 16px" }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#dc2626", marginBottom: 4 }}>⚠ Sections difficiles détectées</div>
          <p style={{ fontSize: 12, color: "#7f1d1d", margin: 0 }}>
            Score IA moyen &lt; 10 ET satisfaction &lt; 3 : <strong>{difficultSections.join(", ")}</strong>
          </p>
        </div>
      )}

      {/* Student intervention matrix */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>
          Matrice par étudiant
          {interventionStudents.length > 0 && (
            <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: "#ef4444" }}>
              {interventionStudents.length} étudiant(s) à surveiller
            </span>
          )}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={st.table}>
            <thead>
              <tr>
                <th style={{ ...st.th, textAlign: "left", minWidth: 130 }}>Étudiant</th>
                {selectedSections.map(sk => (
                  <th key={sk} style={{ ...st.th, color: sectionColor(sk), minWidth: 100 }}>{sk}</th>
                ))}
                <th style={st.th}>Moy. IA</th>
                <th style={st.th}>Satisfaction</th>
                <th style={st.th}>Alerte</th>
              </tr>
            </thead>
            <tbody>
              {flagged.map((s, i) => (
                <tr key={String(s.studentId)} style={{ background: i % 2 === 0 ? "#fff" : "#fafafe" }}>
                  <td style={st.td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{
                        width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                        background: "#6366f122", color: "#6366f1", fontWeight: 700, fontSize: 11,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {String(s.studentName || "?")[0].toUpperCase()}
                      </div>
                      <span style={{ fontWeight: 600, fontSize: 12, color: "#1e293b" }}>{s.studentName}</span>
                    </div>
                  </td>
                  {selectedSections.map(sk => (
                    <td key={sk} style={{ ...st.td, textAlign: "center", verticalAlign: "top", paddingTop: 10 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "center" }}>
                        <ScoreBadge score={s.sectionScores?.[sk]?.score ?? null} />
                        <LikertBadge score={s.selfAssessment?.[sk] ?? null} />
                        <StatusBadge status={s.sectionStatus?.[sk] ?? null} />
                      </div>
                    </td>
                  ))}
                  <td style={{ ...st.td, textAlign: "center" }}>
                    <ScoreBadge score={s.avgAI != null ? Math.round(s.avgAI) : null} />
                  </td>
                  <td style={{ ...st.td, textAlign: "center" }}>
                    <LikertBadge score={s.avgSA ?? null} />
                  </td>
                  <td style={{ ...st.td, textAlign: "center" }}>
                    {s.flag
                      ? <span style={{ fontSize: 11, fontWeight: 700, color: s.flag.color, background: s.flag.color + "18", padding: "2px 7px", borderRadius: 999, whiteSpace: "nowrap" }}>
                          {s.flag.icon} {s.flag.label}
                        </span>
                      : <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 600 }}>✓ OK</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11, color: "#64748b", background: "#f8fafc", borderRadius: 8, padding: "10px 14px" }}>
        <span><strong style={{ color: "#f97316" }}>⚠↑ Fausse confiance</strong> — Score IA &lt; 10 mais satisfaction ≥ 4</span>
        <span><strong style={{ color: "#ef4444" }}>🆘 En difficulté</strong> — Score IA &lt; 10 ET satisfaction ≤ 2</span>
        <span><strong style={{ color: "#3b82f6" }}>⚠↓ Sous-confiant</strong> — Score IA ≥ 12 mais satisfaction ≤ 2</span>
      </div>
    </div>
  );
}

// ─── Timer Log Table ─────────────────────────────────────────────────
function TimerLog({ timings, configuredTimings }) {
  if (!timings?.length) return (
    <div style={st.empty}>Aucun timer enregistré — les durées apparaîtront en temps réel.</div>
  );

  return (
    <table style={st.table}>
      <thead>
        <tr>
          <th style={st.th}>Section</th>
          <th style={st.th}>Phase</th>
          <th style={st.th}>Configuré</th>
          <th style={st.th}>Réel</th>
          <th style={st.th}>Début</th>
          <th style={st.th}>Fin</th>
        </tr>
      </thead>
      <tbody>
        {timings.map((t, i) => {
          const configKey = t.phase === "review" ? `${t.sectionKey}_review` : t.sectionKey;
          const configured = configuredTimings?.[configKey];
          const configuredSec = configured ? configured * 60 : null;
          const diff = (configuredSec != null && t.durationSeconds != null)
            ? t.durationSeconds - configuredSec : null;
          return (
            <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafafe" }}>
              <td style={st.td}>
                <span style={{ fontWeight: 600, color: sectionColor(t.sectionKey) }}>{t.sectionKey}</span>
              </td>
              <td style={st.td}>
                <span style={{
                  fontSize: 11, padding: "2px 7px", borderRadius: 999,
                  background: t.phase === "writing" ? "#eff6ff" : "#fdf4ff",
                  color: t.phase === "writing" ? "#2563eb" : "#9333ea",
                  fontWeight: 600,
                }}>
                  {t.phase === "writing" ? "Rédaction" : "Révision"}
                </span>
              </td>
              <td style={{ ...st.td, textAlign: "center" }}>
                {configuredSec != null ? formatDuration(configuredSec) : "—"}
              </td>
              <td style={{ ...st.td, textAlign: "center", fontWeight: 600, color: diff != null && diff > 60 ? "#ef4444" : "#22c55e" }}>
                {t.durationSeconds != null ? formatDuration(t.durationSeconds) : "—"}
              </td>
              <td style={{ ...st.td, fontSize: 11, color: "#64748b" }}>
                {t.startedAt ? new Date(t.startedAt).toLocaleTimeString() : "—"}
              </td>
              <td style={{ ...st.td, fontSize: 11, color: "#64748b" }}>
                {t.endedAt ? new Date(t.endedAt).toLocaleTimeString() : "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────
export default function SessionProgressPanel({ sessionId, selectedSections: propSections }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [tab, setTab]         = useState("groups");
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError("");
    try {
      const token = sessionStorage.getItem("edulearn_token");
      const res = await fetch(`${API_URL}/sessions/${sessionId}/section-progress`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e.message || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  // Initial load + auto-refresh every 30s during active session
  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const sections = data?.selectedSections || propSections || [];

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1e293b" }}>Progression par section</h2>
          {lastRefresh && (
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
              Mis à jour {lastRefresh.toLocaleTimeString()}
            </div>
          )}
        </div>
        <button onClick={load} disabled={loading} style={st.refreshBtn}>
          {loading ? "⟳ Chargement…" : "↻ Actualiser"}
        </button>
      </div>

      {error && <div style={st.errorBox}>{error}</div>}

      {data && (
        <>
          {/* Quick stats */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            {[
              { label: "Étudiants", value: data.students.length, color: "#6366f1" },
              { label: "Groupes", value: data.groups.length, color: "#8b5cf6" },
              { label: "Sections",  value: sections.length, color: "#22c55e" },
              { label: "Phase", value: data.phase || "—", color: "#f59e0b" },
            ].map(item => (
              <div key={item.label} style={st.statChip}>
                <div style={{ fontSize: 10, color: "#64748b", marginBottom: 2 }}>{item.label}</div>
                <div style={{ fontWeight: 700, fontSize: 15, color: item.color }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* Section stats bar */}
          {sections.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <SectionStatsRow selectedSections={sections} sectionStats={data.sectionStats} />
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, borderBottom: "2px solid #e2e8f0", marginBottom: 16, flexWrap: "wrap" }}>
            {[
              { id: "groups",     label: "Groupes" },
              { id: "cohort",     label: "📈 Cohorte" },
              { id: "matrix",     label: "Scores IA" },
              { id: "perception", label: "📊 Perception" },
              { id: "timers",     label: "Timers" },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  ...st.tabBtn,
                  borderBottom: tab === t.id ? "2px solid #6366f1" : "2px solid transparent",
                  color: tab === t.id ? "#6366f1" : "#64748b",
                  fontWeight: tab === t.id ? 700 : 500,
                  marginBottom: -2,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "groups" && (
            <GroupCards groups={data.groups} selectedSections={sections} />
          )}
          {tab === "cohort" && (
            <CohortAnalytics students={data.students} selectedSections={sections} sectionStats={data.sectionStats} />
          )}
          {tab === "matrix" && (
            <ScoresMatrix students={data.students} selectedSections={sections} />
          )}
          {tab === "perception" && (
            <SelfAssessmentMatrix students={data.students} selectedSections={sections} />
          )}
          {tab === "timers" && (
            <TimerLog timings={data.timings} configuredTimings={data.configuredTimings} />
          )}
        </>
      )}

      {!data && !loading && !error && (
        <div style={st.empty}>Lancez la session pour voir la progression.</div>
      )}
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────
const st = {
  groupCard: {
    padding: 14, borderRadius: 12, border: "1px solid #e2e8f0",
    background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,.04)",
  },
  table: {
    width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 400,
  },
  th: {
    padding: "8px 12px", textAlign: "center", fontWeight: 600, fontSize: 11,
    color: "#64748b", background: "#f8fafc", borderBottom: "2px solid #e2e8f0",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "8px 12px", borderBottom: "1px solid #f1f5f9", verticalAlign: "middle",
  },
  statChip: {
    flex: "1 1 80px", padding: "10px 14px", borderRadius: 10,
    background: "#f8fafc", border: "1px solid #e2e8f0", textAlign: "center",
  },
  tabBtn: {
    padding: "8px 14px", border: "none", background: "none",
    cursor: "pointer", fontSize: 13, transition: "all .15s",
    borderRadius: "4px 4px 0 0",
  },
  refreshBtn: {
    padding: "6px 14px", borderRadius: 8, border: "1px solid #e2e8f0",
    background: "#f8fafc", cursor: "pointer", fontSize: 12, fontWeight: 600,
    color: "#475569",
  },
  errorBox: {
    padding: "10px 14px", borderRadius: 8, background: "#fef2f2",
    color: "#ef4444", fontSize: 12, marginBottom: 12, border: "1px solid #fecaca",
  },
  empty: {
    textAlign: "center", color: "#94a3b8", fontSize: 13, padding: "32px 0",
  },
};
