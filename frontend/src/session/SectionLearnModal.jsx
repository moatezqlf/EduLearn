import { useState, useRef } from "react";
import api from "../api";
import ArticleCutterTool from "./ArticleCutterTool";

const SECTION_DIFFICULTY = {
  Titre: "simple", Abstract: "simple", Conclusion: "simple",
  Introduction: "intermediate", Résultats: "intermediate",
  Méthodes: "complex", Discussion: "complex",
  "État de l'Art": "complex", Conception: "intermediate", Réalisation: "intermediate",
};

const DIFF_CFG = {
  simple:       { label: "Simple",        bg: "#dcfce7", color: "#15803d", dot: "#22c55e" },
  intermediate: { label: "Intermédiaire", bg: "#fef9c3", color: "#a16207", dot: "#f59e0b" },
  complex:      { label: "Complexe",      bg: "#fee2e2", color: "#b91c1c", dot: "#ef4444" },
};

const DEFAULT_STARTERS = {
  Discussion:   ["Ces résultats indiquent que…", "Contrairement à [Auteur, année], nos résultats montrent que…", "Une limite de cette étude réside dans…", "Des recherches futures pourraient explorer…"],
  Méthodes:     ["Cette étude adopte une approche [qualitative/quantitative/mixte]…", "Les participants ont été sélectionnés selon…", "Les données ont été collectées à l'aide de…", "L'analyse statistique a été réalisée avec…"],
  Introduction: ["Dans le domaine de…, il est établi que…", "Cependant, peu d'études ont examiné…", "Cette étude a pour objectif de…", "Notre hypothèse de recherche est que…"],
  "État de l'Art": ["Les travaux de [Auteur, année] ont montré que…", "Plusieurs approches ont été proposées pour…", "Notre contribution se distingue par…"],
};

// ── Cutting Tool ──────────────────────────────────────────────
function CuttingTool({ missingSection, onConfirm }) {
  const [text, setText]           = useState("");
  const [inputMode, setInputMode] = useState("paste"); // "paste" | "file"
  const [cut, setCut]             = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [fileErr, setFileErr]     = useState("");
  const taRef   = useRef(null);
  const fileRef = useRef(null);

  const handleFile = (e) => {
    setFileErr("");
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["text/plain", "text/markdown", "application/json"];
    const ext = file.name.split(".").pop().toLowerCase();
    if (!allowed.includes(file.type) && !["txt", "md", "text"].includes(ext)) {
      setFileErr("Seuls les fichiers .txt et .md sont pris en charge. Pour un PDF ou Word, copiez le texte et utilisez le mode 'Coller'.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => { setText(ev.target.result || ""); setInputMode("paste"); };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  };

  const handleCut = () => {
    const el = taRef.current;
    if (!el) return;
    const s = el.selectionStart, e2 = el.selectionEnd;
    if (s === e2) { alert("Sélectionnez d'abord le texte de la section à retirer."); return; }
    setCut({ start: s, end: e2, removed: text.slice(s, e2) });
  };

  const reset = () => { setCut(null); setConfirmed(false); };

  const handleConfirm = () => {
    if (!cut) return;
    onConfirm((text.slice(0, cut.start) + text.slice(cut.end)).trim(), cut.removed.trim());
    setConfirmed(true);
  };

  if (confirmed) return (
    <div style={c.confirmed}>
      <div style={{ fontSize: 28 }}>✅</div>
      <strong style={{ fontSize: 15 }}>Article découpé avec succès !</strong>
      <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 12px", textAlign: "center" }}>
        Les étudiants verront l'article sans la section <em>{missingSection}</em>.
      </p>
      <button type="button" style={c.btnOutline} onClick={() => { reset(); setText(""); }}>
        ↺ Recommencer
      </button>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%" }}>

      {/* Steps header */}
      <div style={c.stepsRow}>
        {[
          { n: 1, label: inputMode === "file" ? "Importez le fichier texte" : "Collez l'article complet" },
          { n: 2, label: <>Sélectionnez <strong>{missingSection || "la section"}</strong></> },
          { n: 3, label: <>Cliquez <strong>✂️ Retirer</strong></> },
        ].map((s, i, arr) => (
          <span key={s.n} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={c.stepNum}>{s.n}</span>
            <span style={{ fontSize: 12, color: "#374151" }}>{s.label}</span>
            {i < arr.length - 1 && <span style={{ color: "#d1d5db", margin: "0 4px" }}>→</span>}
          </span>
        ))}
      </div>

      {/* Input mode toggle */}
      {!cut && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={c.modeToggle}>
            {[{ id: "paste", icon: "📋", label: "Coller" }, { id: "file", icon: "📂", label: "Importer fichier" }].map(m => (
              <button key={m.id} type="button" onClick={() => setInputMode(m.id)} style={{
                ...c.modeBtn,
                background: inputMode === m.id ? "#6366f1" : "transparent",
                color:      inputMode === m.id ? "#fff"    : "#64748b",
              }}>
                {m.icon} {m.label}
              </button>
            ))}
          </div>
          {inputMode === "file" && (
            <span style={{ fontSize: 11, color: "#94a3b8" }}>Formats : .txt · .md (pour PDF/Word, copiez le texte)</span>
          )}
        </div>
      )}

      {!cut ? (
        <>
          {inputMode === "file" ? (
            <div style={c.dropZone} onClick={() => fileRef.current?.click()}>
              <input ref={fileRef} type="file" accept=".txt,.md,.text" style={{ display: "none" }} onChange={handleFile} />
              <span style={{ fontSize: 32 }}>📂</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#6366f1" }}>Cliquer pour importer un fichier</span>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>.txt · .md — max 2 Mo</span>
              {fileErr && <span style={{ fontSize: 12, color: "#dc2626", marginTop: 4 }}>{fileErr}</span>}
              {text && <span style={{ fontSize: 12, color: "#16a34a", marginTop: 4 }}>✓ Fichier chargé — passez en mode Coller pour éditer</span>}
            </div>
          ) : (
            <textarea
              ref={taRef}
              style={c.fullTA}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={`Collez ici l'article complet (avec toutes les sections, y compris ${missingSection || "la section manquante"})…`}
            />
          )}

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" style={{ ...c.btnCut, opacity: !text.trim() ? 0.45 : 1 }}
              disabled={!text.trim()} onClick={handleCut}>
              ✂️ Retirer la sélection
            </button>
            <span style={{ fontSize: 11, color: "#94a3b8" }}>
              {text.trim() ? "Sélectionnez le texte à supprimer dans la zone ci-dessus, puis cliquez ici" : "Importez ou collez l'article d'abord"}
            </span>
          </div>
        </>
      ) : (
        <>
          {/* Preview */}
          <div style={c.previewLabel}>Aperçu — la partie en rouge sera supprimée pour les étudiants :</div>
          <div style={c.preview}>
            <span>{text.slice(0, cut.start)}</span>
            <span style={c.removedSpan}>{cut.removed}</span>
            <span>{text.slice(cut.end)}</span>
          </div>
          <div style={c.removedInfo}>
            <span style={{ color: "#dc2626", fontWeight: 600, fontSize: 12 }}>✂️ Section retirée ({cut.removed.length} car.) :</span>
            <span style={{ color: "#64748b", fontSize: 11, marginLeft: 6 }}>
              «{cut.removed.slice(0, 90)}{cut.removed.length > 90 ? "…" : ""}»
            </span>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" style={c.btnOutline} onClick={reset}>↺ Refaire</button>
            <button type="button" style={c.btnConfirm} onClick={handleConfirm}>✓ Confirmer le découpage</button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────
export default function SectionLearnModal({
  open, onClose,
  selectedSections, sectionsConfig, articleSections,
  missingSection, onMissingChange,
  onUpdateSection, onToggleSection,
  allSectionNames,
  sectionGuidance, onUpdateGuidance,
  onArticleTextConfirm,
  docType = "article",
}) {
  const [guidanceOpen, setGuidanceOpen] = useState(true);
  const [aiLoading, setAiLoading]       = useState(false);
  const [aiError, setAiError]           = useState("");

  if (!open) return null;

  const diff    = SECTION_DIFFICULTY[missingSection];
  const diffCfg = DIFF_CFG[diff];
  const needsGuidance  = diff === "complex" || diff === "intermediate";
  const currentStarters = sectionGuidance?.[missingSection] ?? DEFAULT_STARTERS[missingSection] ?? [];
  const currentCriteria = sectionsConfig?.[missingSection]?.criteria || [];

  const updateStarter = (idx, val) => {
    const arr = [...currentStarters]; arr[idx] = val;
    onUpdateGuidance?.(missingSection, arr);
  };
  const addStarter    = () => onUpdateGuidance?.(missingSection, [...currentStarters, ""]);
  const removeStarter = idx => onUpdateGuidance?.(missingSection, currentStarters.filter((_, i) => i !== idx));

  const generateWithAI = async () => {
    if (!missingSection) return;
    setAiLoading(true); setAiError("");
    try {
      const { starters } = await api.sessions.generateStarters(missingSection, currentCriteria, docType);
      onUpdateGuidance?.(missingSection, starters);
    } catch (e) {
      setAiError(e.message || "Erreur IA");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div style={m.overlay} onClick={onClose} role="presentation">
      <div style={m.panel} onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div style={m.header}>
          <div>
            <h2 style={m.title}>Section à apprendre</h2>
            <p style={m.subtitle}>L'article fourni aura cette section retirée — les étudiants devront la rédiger.</p>
          </div>
          <button type="button" onClick={onClose} style={m.closeBtn}>×</button>
        </div>

        {/* ── 2-column body ── */}
        <div style={m.body}>

          {/* ── Left : section picker + AI starters ── */}
          <div style={m.leftCol}>

            {/* Section manquante picker */}
            <div>
              <div style={m.colLabel}>❓ Section manquante *</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {allSectionNames.map(name => {
                  const isMissing = missingSection === name;
                  const color  = sectionsConfig[name]?.color || "#6366f1";
                  const d      = SECTION_DIFFICULTY[name];
                  const dc     = DIFF_CFG[d];
                  return (
                    <button key={name} type="button" onClick={() => onMissingChange(name)} style={{
                      padding: "7px 12px", borderRadius: 999, fontWeight: 600, fontSize: 12, cursor: "pointer",
                      border: isMissing ? `2px solid ${color}` : "2px solid #e2e8f0",
                      background: isMissing ? `${color}15` : "#fff",
                      color: isMissing ? color : "#64748b",
                      display: "flex", alignItems: "center", gap: 5,
                    }}>
                      {isMissing && "❓ "}{name}
                      {dc && <span style={{ width: 7, height: 7, borderRadius: "50%", background: dc.dot, display: "inline-block", flexShrink: 0 }} />}
                    </button>
                  );
                })}
              </div>
              {missingSection && diffCfg && (
                <div style={{ marginTop: 10, padding: "7px 11px", borderRadius: 8, background: diffCfg.bg, fontSize: 12, color: diffCfg.color, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: diffCfg.dot, display: "inline-block" }} />
                  Section {diffCfg.label}
                  {diff === "complex" && " — aide à la rédaction activée"}
                </div>
              )}
            </div>

            {/* AI Starters — always visible when section selected */}
            {missingSection && (
              <div style={m.guidanceBox}>
                <div style={m.guidanceHead}>
                  <button type="button" style={m.guidanceToggle} onClick={() => setGuidanceOpen(v => !v)}>
                    <span style={{ fontSize: 14 }}>🧭</span>
                    <span style={{ fontWeight: 700, fontSize: 12, color: "#6d28d9" }}>Amorces — {missingSection}</span>
                    <span style={{ marginLeft: "auto", fontSize: 10, color: "#7c3aed" }}>{guidanceOpen ? "▲" : "▼"}</span>
                  </button>
                  {/* AI generate button */}
                  <button
                    type="button"
                    style={{ ...m.aiBtn, opacity: aiLoading ? 0.6 : 1 }}
                    onClick={generateWithAI}
                    disabled={aiLoading}
                    title="Générer des amorces avec l'IA selon les critères IMRAD"
                  >
                    {aiLoading ? "⏳" : "✨"} {aiLoading ? "Génération…" : "Générer avec l'IA"}
                  </button>
                </div>

                {aiError && <div style={{ fontSize: 11, color: "#dc2626", margin: "4px 0" }}>⚠ {aiError}</div>}

                {guidanceOpen && (
                  <div style={{ marginTop: 12 }}>
                    {!needsGuidance && (
                      <p style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8, lineHeight: 1.5 }}>
                        Section {diffCfg?.label} — des amorces restent utiles pour guider les étudiants.
                      </p>
                    )}
                    <div style={{ fontSize: 11, color: "#6d28d9", marginBottom: 8, lineHeight: 1.5 }}>
                      Ces phrases s'afficheront aux étudiants comme suggestions cliquables.
                    </div>
                    {currentStarters.length === 0 && !aiLoading && (
                      <div style={{ fontSize: 12, color: "#94a3b8", padding: "8px 0", fontStyle: "italic" }}>
                        Aucune amorce — cliquez "✨ Générer avec l'IA" ou ajoutez manuellement.
                      </div>
                    )}
                    {currentStarters.map((s, i) => (
                      <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 11, color: "#7c3aed", fontWeight: 800, minWidth: 18 }}>{i + 1}.</span>
                        <input type="text" value={s} onChange={e => updateStarter(i, e.target.value)}
                          style={m.starterInput} placeholder={`Amorce ${i + 1}…`} />
                        <button type="button" onClick={() => removeStarter(i)} style={m.removeBtn}>×</button>
                      </div>
                    ))}
                    <button type="button" onClick={addStarter} style={m.addBtn}>+ Ajouter une amorce</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Right : open Article Cutter fullscreen ── */}
          <div style={m.rightCol}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16, padding: 32 }}>
              <div style={{ fontSize: 48 }}>✂️</div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>Article Cutter</div>
                <p style={{ fontSize: 13, color: "#64748b", maxWidth: 320, lineHeight: 1.6 }}>
                  Importez un article PDF / Word / Texte, sélectionnez la section à cacher, puis validez pour générer l'article final à envoyer aux étudiants.
                </p>
              </div>
              <button
                type="button"
                style={{ padding: "12px 28px", background: "#6366f1", color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: "pointer" }}
                onClick={() => { if (typeof window !== "undefined") { window.__articleCutterOpen = true; window.dispatchEvent(new CustomEvent("open-article-cutter")); } }}
              >
                🚀 Ouvrir l'outil de découpe
              </button>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={m.footer}>
          <button type="button" style={m.btnValidate} onClick={onClose} disabled={!missingSection}>
            ✓ Valider la configuration
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────
const m = {
  overlay:       { position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  panel:         { background: "#fff", borderRadius: 18, width: "100%", maxWidth: 1020, maxHeight: "94vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.22)", overflow: "hidden" },
  header:        { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "18px 24px 14px", borderBottom: "1px solid #f1f5f9", flexShrink: 0 },
  title:         { margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" },
  subtitle:      { margin: "4px 0 0", fontSize: 12, color: "#64748b" },
  closeBtn:      { border: "none", background: "#f1f5f9", width: 34, height: 34, borderRadius: 8, fontSize: 20, cursor: "pointer", color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  body:          { display: "flex", flex: 1, overflow: "hidden", minHeight: 0 },
  leftCol:       { width: 310, flexShrink: 0, borderRight: "1px solid #f1f5f9", padding: "18px 16px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16, background: "#fafbfc" },
  rightCol:      { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  colLabel:      { fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 },
  guidanceBox:   { background: "#faf5ff", border: "1.5px solid #ddd6fe", borderRadius: 10, padding: "12px 14px" },
  guidanceHead:  { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  guidanceToggle:{ display: "flex", alignItems: "center", gap: 6, flex: 1, background: "transparent", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit", minWidth: 0 },
  aiBtn:         { padding: "5px 10px", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", border: "none", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0, fontFamily: "inherit" },
  starterInput:  { flex: 1, padding: "6px 10px", borderRadius: 7, border: "1px solid #ddd6fe", fontSize: 12, fontFamily: "inherit", outline: "none", background: "#fff" },
  removeBtn:     { border: "none", background: "#fee2e2", color: "#b91c1c", borderRadius: 5, width: 24, height: 24, cursor: "pointer", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  addBtn:        { padding: "5px 12px", border: "1.5px dashed #a78bfa", background: "transparent", color: "#7c3aed", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer", marginTop: 2 },
  cutHeader:     { display: "flex", alignItems: "center", gap: 8, padding: "14px 18px 10px", borderBottom: "1px solid #fff7ed", background: "#fff7ed", flexShrink: 0, flexWrap: "wrap" },
  cutBody:       { flex: 1, padding: "16px 18px", overflowY: "auto" },
  footer:        { padding: "12px 24px", borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "flex-end", flexShrink: 0 },
  btnValidate:   { padding: "11px 28px", background: "#6366f1", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer", fontSize: 14 },
};

const c = {
  stepsRow:     { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: "4px 0 8px" },
  stepNum:      { width: 20, height: 20, borderRadius: "50%", background: "#6366f1", color: "#fff", fontWeight: 800, fontSize: 11, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  modeToggle:   { display: "flex", background: "#f1f5f9", borderRadius: 8, padding: 3, gap: 2 },
  modeBtn:      { padding: "6px 12px", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all .15s" },
  dropZone:     { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "28px 20px", border: "2px dashed #c7d2fe", borderRadius: 12, background: "#f8f7ff", cursor: "pointer", gap: 6, minHeight: 180, textAlign: "center" },
  fullTA:       { width: "100%", padding: "12px 14px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 13, fontFamily: "monospace", resize: "vertical", outline: "none", boxSizing: "border-box", minHeight: 240, lineHeight: 1.75, color: "#1e293b", background: "#fff" },
  btnCut:       { padding: "9px 18px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer", flexShrink: 0, fontFamily: "inherit" },
  previewLabel: { fontSize: 10, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 },
  preview:      { background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "14px 16px", fontSize: 13, fontFamily: "monospace", lineHeight: 1.7, color: "#1e293b", maxHeight: 260, overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word" },
  removedSpan:  { background: "#fee2e2", color: "#dc2626", textDecoration: "line-through", borderRadius: 3, padding: "0 2px" },
  removedInfo:  { padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 12, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4 },
  btnOutline:   { padding: "8px 16px", background: "#fff", color: "#64748b", border: "1.5px solid #e2e8f0", borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" },
  btnConfirm:   { flex: 1, padding: "9px 20px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
  confirmed:    { display: "flex", flexDirection: "column", alignItems: "center", padding: 40, background: "#f0fdf4", borderRadius: 12, border: "1px solid #bbf7d0", gap: 6 },
};
