import { useState, useRef, useCallback, useEffect } from "react";
import api from "../api";

// ── Article section auto-detection ───────────────────────────
const SECTION_PATTERNS = {
  title:        /^(?!abstract|introduction|method|result|discussion|conclusion|résumé|méthode|résultat).{5,150}$/i,
  abstract:     /^(\d+\.?\s*)?(abstract|résumé|summary)\b/i,
  introduction: /^(\d+\.?\s*)?(introduction)\b/i,
  methods:      /^(\d+\.?\s*)?(methods?|méthodologie|matériels?\s*(and|et)\s*methods?|méthodes?|participants?\s*(and|et)|study\s+design)\b/i,
  results:      /^(\d+\.?\s*)?(results?|résultats?|findings?)\b/i,
  discussion:   /^(\d+\.?\s*)?(discussion|discussion\s*(and|et)\s*conclusion)\b/i,
  conclusion:   /^(\d+\.?\s*)?(conclusion|concluding\s*remarks?|perspectives?|study\s+limitations?)\b/i,
};

const SECTION_PATTERN_LABELS = {
  title: "Titre", abstract: "Abstract", introduction: "Introduction",
  methods: "Méthodes", results: "Résultats", discussion: "Discussion", conclusion: "Conclusion",
};

function splitArticle(text) {
  const lines = text.split("\n");
  const sections = {};
  let currentSection = "title";
  let buffer = [];

  for (const line of lines) {
    const trimmed = line.trim();
    let matched = false;
    // Only test potential section headers: short lines (≤80 chars), not mid-sentence
    if (trimmed.length >= 3 && trimmed.length <= 80 && !/[,;]/.test(trimmed)) {
      for (const [section, pattern] of Object.entries(SECTION_PATTERNS)) {
        if (section !== "title" && pattern.test(trimmed)) {
          sections[currentSection] = buffer.join("\n").trim();
          currentSection = section;
          buffer = [];
          matched = true;
          break;
        }
      }
    }
    if (!matched) buffer.push(line);
  }
  sections[currentSection] = buffer.join("\n").trim();
  return sections;
}

// ── Clean & structure extracted article text ─────────────────
function cleanArticleText(raw) {
  let text = raw;

  // Strip ## section markers from prior structuring runs (prevents doubling on re-click)
  text = text.replace(/^## (Titre|Abstract|Introduction|Méthodes|Résultats|Discussion|Conclusion)\s*$/gm, "$1");

  // Normalize spaced-out PDF section headers: "A B S T R A C T" → "ABSTRACT"
  text = text.replace(/^([A-Z] ){2,}[A-Z]\s*$/gm, m => m.replace(/\s/g, ""));

  // Strip journal header noise: "ARTICLE IN PRESS", "ARTICLE INFO", keyword lists above abstract
  text = text.replace(/^ARTICLE\s+(IN\s+PRESS|INFO)\s*$/gm, "");
  text = text.replace(/^Keywords?:.*$/gim, "");

  // Fix PDF line-break hyphens: "effec-\ntive" → "effective"
  text = text.replace(/(\w)-\s*\n\s*([a-zàâéèêëîïôùûü])/g, "$1$2");

  // Remove References / Bibliography section and everything after
  const REF_RX = /\n[ \t]*(?:references?|bibliograph(?:y|ie?)|works cited|liste des références?|références?\s*bibliographiques?|sources?)\s*[\n:]/i;
  const refM = REF_RX.exec(text);
  if (refM) {
    text = text.slice(0, refM.index);
  } else {
    // Numbered reference block: ≥3 consecutive "[1] ..." lines
    const blockM = /(?:\n\[\d+\][^\n]+){3,}/.exec(text);
    if (blockM) text = text.slice(0, blockM.index);
  }

  // Process line by line
  const lines = text.split("\n");
  const out = [];
  let blankCount = 0;

  for (const line of lines) {
    const t = line.trim();

    // Page numbers: "5", "- 5 -", "Page 5 of 10"
    if (/^-?\s*\d{1,4}\s*-?$/.test(t)) continue;
    if (/^page\s*\d+(\s+(of|sur|de|\/)\s*\d+)?$/i.test(t)) continue;

    // DOI / ISSN / ISBN / copyright / email lines
    if (/^(doi|issn|isbn|copyright|©|e-?mail|tel\.|fax:)/i.test(t)) continue;
    if (/^https?:\/\/(doi\.org|dx\.doi\.org)/i.test(t)) continue;

    // Numbered footnote lines: "[1] Author, Year..."
    if (/^\[\d+\]\s+[A-ZÀÂÉÈ]/.test(t)) continue;

    // Blank lines — cap at 2 consecutive
    if (t === "") {
      blankCount++;
      if (blankCount <= 2) out.push("");
      continue;
    }
    blankCount = 0;
    out.push(line);
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

const SECTION_ORDER_KEYS = ["title","abstract","introduction","methods","results","discussion","conclusion"];
const SECTION_LABELS_MAP = {
  title:"Titre", abstract:"Abstract", introduction:"Introduction",
  methods:"Méthodes", results:"Résultats", discussion:"Discussion", conclusion:"Conclusion",
};

function reassembleSections(sections) {
  let out = "";
  for (const key of SECTION_ORDER_KEYS) {
    const content = sections[key]?.trim();
    if (content) {
      out += `## ${SECTION_LABELS_MAP[key] || key}\n\n${content}\n\n`;
    }
  }
  // Unrecognized sections
  for (const [key, content] of Object.entries(sections)) {
    if (!SECTION_ORDER_KEYS.includes(key) && content?.trim()) {
      out += `## ${key}\n\n${content.trim()}\n\n`;
    }
  }
  return out.trim();
}

// ── Constants ─────────────────────────────────────────────────
const SECTION_COLORS = {
  Titre: "#64748b", Abstract: "#8b5cf6", Introduction: "#22c55e",
  Méthodes: "#3b82f6", Résultats: "#f59e0b", Discussion: "#ef4444", Conclusion: "#a855f7",
  "État de l'Art": "#06b6d4", Conception: "#3b82f6", Réalisation: "#f59e0b",
};
const SECTION_DIFF = {
  Titre: "simple", Abstract: "simple", Conclusion: "simple",
  Introduction: "intermediate", Résultats: "intermediate",
  Méthodes: "complex", Discussion: "complex",
  "État de l'Art": "complex", Conception: "intermediate", Réalisation: "intermediate",
};
const DIFF_DOT = { simple: "#22c55e", intermediate: "#f59e0b", complex: "#ef4444" };

const DEFAULT_STARTERS = {
  Discussion:   ["Ces résultats indiquent que…", "Contrairement à [Auteur, année], nos résultats montrent que…", "Une limite de cette étude réside dans…", "Des recherches futures pourraient explorer…"],
  Méthodes:     ["Cette étude adopte une approche [qualitative/quantitative/mixte]…", "Les participants ont été sélectionnés selon…", "Les données ont été collectées à l'aide de…", "L'analyse statistique a été réalisée avec…"],
  Introduction: ["Dans le domaine de…, il est établi que…", "Cependant, peu d'études ont examiné…", "Cette étude a pour objectif de…", "Notre hypothèse de recherche est que…"],
  "État de l'Art": ["Les travaux de [Auteur, année] ont montré que…", "Plusieurs approches ont été proposées pour…", "Notre contribution se distingue par…"],
};

const STATUS_CFG = {
  ready:     { dot: "#94a3b8", label: "Prêt",                 color: "#64748b" },
  loaded:    { dot: "#22c55e", label: "Fichier chargé",        color: "#15803d" },
  ocr:       { dot: "#f59e0b", label: "OCR en cours…",         color: "#a16207" },
  ocrDone:   { dot: "#22c55e", label: "OCR terminé",           color: "#15803d" },
  cut:       { dot: "#22c55e", label: "Section retirée",       color: "#6d28d9" },
  validated: { dot: "#22c55e", label: "Validé — prêt à envoyer", color: "#15803d" },
  error:     { dot: "#ef4444", label: "Erreur",                color: "#dc2626" },
};

// ── Helpers ───────────────────────────────────────────────────
function detectSectionInText(text, sectionName) {
  if (!text || !sectionName) return null;
  const n = sectionName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nu = n.toUpperCase();
  const patterns = [
    // Markdown heading on its own line
    new RegExp(`(?:^|\\n)(#{1,4}\\s*${n}\\s*)(?:\\n|$)`, "im"),
    // Bold markdown on its own line
    new RegExp(`(?:^|\\n)(\\*\\*${n}\\*\\*\\s*)(?:\\n|$)`, "im"),
    // Standalone line (exact match)
    new RegExp(`(?:^|\\n)(${n}\\s*)(?:\\n|$)`, "im"),
    // Numbered section on its own line: "1. Introduction\n"
    new RegExp(`(?:^|\\n)(\\d+[.)\\s]\\s*${n}[\\s:\\-]*)(?:\\n|$)`, "im"),
    // Numbered section in flowing text: "1. Introduction " followed by a word (pdfjs)
    new RegExp(`(?:\\.|\\n|\\s)(\\d+[.)\\s]\\s*${n})(?=\\s+[A-ZÀÂÉÈÊËÎÏÔÙÛÜ])`, "im"),
    // ALL CAPS version on its own line
    new RegExp(`(?:^|\\n)(${nu}\\s*)(?:\\n|$)`, "m"),
    // ALL CAPS in flowing text after sentence end
    new RegExp(`(?:\\.|\\n|\\s)(${nu})(?=\\s+[A-ZÀÂÉÈÊËÎÏÔÙÛÜ])`, "m"),
    // Roman numeral section: "I. Introduction", "II. Méthodes"
    new RegExp(`(?:^|\\n|\\s)([IVXivx]+\\.\\s*${n})(?=\\s|\\n|$)`, "im"),
  ];
  for (const pat of patterns) {
    const m = pat.exec(text);
    if (m != null) {
      // Return position of the match group, not the lookahead/lookbehind char
      return m.index + m[0].indexOf(m[1]);
    }
  }
  return null;
}

function findNextSectionStart(text, afterPos, allNames, currentName) {
  const others = allNames.filter(n => n !== currentName);
  let best = text.length;
  const slice = text.slice(afterPos + 1);
  for (const n of others) {
    const pos = detectSectionInText(slice, n);
    if (pos !== null) best = Math.min(best, afterPos + 1 + pos);
  }
  return best;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

const FILE_ICONS = { pdf: "PDF", docx: "DOCX", txt: "TXT", md: "MD" };
const FILE_COLORS = { pdf: "#ef4444", docx: "#3b82f6", txt: "#64748b", md: "#64748b" };

// ── Main Component ────────────────────────────────────────────
export default function ArticleCutterTool({
  missingSection, onMissingChange,
  allSectionNames, sectionsConfig,
  sectionGuidance, onUpdateGuidance,
  onConfirm, docType = "article",
  onClose,
}) {
  // ── State ──
  const [text, setText]           = useState("");
  const [inputMode, setInputMode] = useState("paste");
  const [fileInfo, setFileInfo]   = useState(null); // { name, ext, size }
  const [status, setStatus]       = useState("ready");
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrMsg, setOcrMsg]       = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [cutRange, setCutRange]   = useState(null);
  const [finalText, setFinalText] = useState("");
  const [validated, setValidated] = useState(false);
  const [exportFormat, setExportFormat] = useState("md");
  const [extractLoading, setExtractLoading] = useState(false);
  const [extractDone, setExtractDone] = useState(false); // true after first attempt
  const [detectedSections, setDetectedSections] = useState({}); // auto-split result
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [customSections, setCustomSections] = useState([]);
  const [storedFile, setStoredFile] = useState(null); // keep File object for OCR re-send
  const [viewMode, setViewMode] = useState("raw"); // "raw" | "structured"
  const [structuredSections, setStructuredSections] = useState({}); // after clean+structure
  const [sectionsOpen, setSectionsOpen] = useState(true);
  const [formatsOpen, setFormatsOpen]   = useState(false);
  const [amorcesOpen, setAmorcesOpen]   = useState(true);

  const taRef   = useRef(null);
  const fileRef = useRef(null);
  const dropRef = useRef(null);

  const effectiveSections = [...allSectionNames, ...customSections];
  const currentStarters = sectionGuidance?.[missingSection] ?? DEFAULT_STARTERS[missingSection] ?? [];

  // Auto-detect sections whenever text changes and is substantial
  useEffect(() => {
    if (text.length < 100) { setDetectedSections({}); return; }
    const split = splitArticle(text);
    // Keep only non-empty sections
    const nonEmpty = Object.fromEntries(
      Object.entries(split).filter(([, v]) => v.trim().length > 20)
    );
    setDetectedSections(nonEmpty);
  }, [text]);

  // ── File processing ───────────────────────────────────────
  const processFile = useCallback(async (file) => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    setFileInfo({ name: file.name, ext, size: file.size });
    setStoredFile(file); // ← keep reference for OCR retry
    // Don't set "loaded" yet — wait for extraction to complete
    setStatus("ready"); setCutRange(null); setValidated(false);
    setFinalText(""); setText(""); setExtractDone(false); setOcrMsg("");

    // Text / Markdown: read client-side instantly
    if (["txt", "md", "text"].includes(ext)) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const t = e.target.result || "";
        setText(t);
        setStatus(t.length > 10 ? "loaded" : "error");
        setExtractDone(true);
      };
      reader.readAsText(file, "utf-8");
      return;
    }

    // PDF / DOCX: send to backend for Claude extraction
    setExtractLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.sessions.extractText(fd);
      const extracted = (res.text || "").trim();
      setText(extracted);
      const isScanned = (res.chars ?? extracted.length) < 60;
      setStatus(isScanned ? "ocr" : "loaded");
      if (isScanned) setOcrMsg("Ce PDF semble scanné ou sans texte sélectionnable.");
    } catch (e) {
      setStatus("error");
      setOcrMsg(`Erreur d'extraction : ${e.message}`);
    } finally {
      setExtractLoading(false);
      setExtractDone(true);
    }
  }, []);

  // ── Activate OCR: re-send the stored file ─────────────────
  const activateOcr = useCallback(async () => {
    const file = storedFile;
    if (!file) {
      setOcrMsg("Fichier introuvable — veuillez re-importer le PDF.");
      return;
    }
    setStatus("ocr"); setOcrProgress(5); setOcrMsg("Initialisation de l'extraction…");
    setExtractLoading(true);

    const interval = setInterval(() => {
      setOcrProgress(p => {
        const next = p < 30 ? p + 5 : p < 60 ? p + 4 : p < 85 ? p + 3 : p;
        if (p < 30)  setOcrMsg("Analyse de la structure du document…");
        else if (p < 60) setOcrMsg("Extraction du texte avec Claude AI…");
        else if (p < 85) setOcrMsg("Finalisation et nettoyage du texte…");
        return next;
      });
    }, 700);

    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.sessions.extractText(fd);
      clearInterval(interval);
      setOcrProgress(100);
      const extracted = (res.text || "").trim();
      setText(extracted);
      setExtractDone(true);
      if (extracted.length < 20) {
        setStatus("error");
        setOcrMsg("Impossible d'extraire le texte. Essayez de coller le texte manuellement (mode Coller).");
      } else {
        setStatus("ocrDone");
        setOcrMsg(`Extraction terminée — ${extracted.length.toLocaleString("fr")} caractères extraits.`);
      }
    } catch (e) {
      clearInterval(interval);
      setStatus("error");
      setExtractDone(true);
      const raw = e.message || "";
      if (raw.includes("OCR_CREDITS_EXHAUSTED") || raw.includes("credit balance") || e.status === 402) {
        setOcrMsg("OCR Claude indisponible (crédits insuffisants). Collez le texte manuellement via le bouton ci-dessous.");
      } else {
        setOcrMsg(`Erreur OCR : ${raw}`);
      }
    } finally {
      setExtractLoading(false);
    }
  }, [storedFile]);

  // ── Drag & Drop ───────────────────────────────────────────
  const handleDrop = useCallback((e) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) { setInputMode("file"); processFile(file); }
  }, [processFile]);

  const handleFileChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  }, [processFile]);

  // ── Cutting ───────────────────────────────────────────────
  const handleManualCut = () => {
    const ta = taRef.current;
    if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    if (s === e) return alert("Sélectionnez d'abord le texte de la section à retirer.");
    setCutRange({ start: s, end: e, section: missingSection, method: "manual" });
    setStatus("cut"); setValidated(false); setFinalText("");
  };

  const handleAutocut = () => {
    if (!text || !missingSection) return;
    const startPos = detectSectionInText(text, missingSection);
    if (startPos === null) {
      alert(`Section « ${missingSection} » non trouvée dans le texte. Sélectionnez-la manuellement.`);
      return;
    }
    const endPos = findNextSectionStart(text, startPos + missingSection.length, effectiveSections, missingSection);
    // For line-based text go back to line start; for flowing text stay at startPos
    const prevNl = text.lastIndexOf("\n", startPos);
    const lineStart = prevNl !== -1 && (startPos - prevNl) < 120 ? prevNl + 1 : startPos;
    setCutRange({ start: lineStart, end: endPos, section: missingSection, method: "auto" });
    setStatus("cut"); setValidated(false); setFinalText("");
  };

  const resetCut = () => { setCutRange(null); setStatus(text ? "loaded" : "ready"); setValidated(false); setFinalText(""); };

  // ── Validation ────────────────────────────────────────────
  const handleValidate = () => {
    if (!cutRange) return;
    const visible = (text.slice(0, cutRange.start) + text.slice(cutRange.end)).trim();
    const removed = text.slice(cutRange.start, cutRange.end).trim();
    setFinalText(visible);
    setValidated(true);
    setStatus("validated");
    onConfirm?.(visible, removed, missingSection);
  };

  // ── Export ────────────────────────────────────────────────
  const downloadFinal = () => {
    const blob = new Blob([finalText], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `article-sans-${missingSection?.toLowerCase() || "section"}.${exportFormat === "html" ? "html" : "md"}`;
    a.click();
  };
  const copyFinal = async () => {
    await navigator.clipboard.writeText(finalText);
  };

  // ── Clean + structure ─────────────────────────────────────
  const handleStructure = () => {
    if (!text.trim()) return;
    const cleaned = cleanArticleText(text);
    const sections = splitArticle(cleaned);
    const nonEmpty = Object.fromEntries(
      Object.entries(sections).filter(([, v]) => v?.trim().length > 10)
    );
    setStructuredSections(nonEmpty);
    const reassembled = reassembleSections(nonEmpty);
    setText(reassembled);
    setViewMode("structured");
    setCutRange(null);
    setValidated(false);
    setFinalText("");
    if (status !== "loaded") setStatus("loaded");
  };

  // ── Starters helpers ──────────────────────────────────────
  const updateStarter = (idx, val) => {
    const arr = [...currentStarters]; arr[idx] = val;
    onUpdateGuidance?.(missingSection, arr);
  };
  const removeStarter = (idx) => onUpdateGuidance?.(missingSection, currentStarters.filter((_, i) => i !== idx));
  const addStarter    = ()     => onUpdateGuidance?.(missingSection, [...currentStarters, ""]);

  // ── Status badge ──────────────────────────────────────────
  const effectiveStatus = extractLoading && !extractDone ? "extracting" : status;
  const STATUS_CFG_EXT = {
    ...STATUS_CFG,
    extracting: { dot: "#f59e0b", label: "Extraction en cours…", color: "#a16207" },
  };
  const sc = STATUS_CFG_EXT[effectiveStatus] || STATUS_CFG.ready;

  // ── Render helpers ────────────────────────────────────────
  const renderTextWithCut = () => {
    if (!cutRange || !text) return null;
    return (
      <div style={s.previewBox}>
        <span>{text.slice(0, cutRange.start)}</span>
        <span style={s.removedSpan}>{text.slice(cutRange.start, cutRange.end)}</span>
        <span>{text.slice(cutRange.end)}</span>
      </div>
    );
  };

  const missingColor = SECTION_COLORS[missingSection] || "#6366f1";

  return (
    <div style={s.root}>

      {/* ── Left sidebar ── */}
      <div style={s.sidebar}>
        {/* App header */}
        <div style={s.sideHeader}>
          <div style={s.appIcon}>
            <span style={{ fontSize: 18 }}>✂️</span>
          </div>
          <div>
            <div style={s.appTitle}>Article Cutter</div>
            <div style={s.appSub}>Découpez vos articles scientifiques</div>
          </div>
        </div>

        {/* Section picker */}
        <div style={s.sideBlock}>
          <div style={{ ...s.sideLabel, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none", marginBottom: sectionsOpen ? 10 : 0 }} onClick={() => setSectionsOpen(o => !o)}>
            <span>🎯 Section à découper</span>
            <span style={{ fontSize: 9, color: "#94a3b8", display: "inline-block", transition: "transform .2s", transform: sectionsOpen ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
          </div>
          {sectionsOpen && (
            <>
              <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 10px", lineHeight: 1.4 }}>
                Cliquez pour cibler la section à cacher aux étudiants.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {effectiveSections.map(name => {
                  const isSel = missingSection === name;
                  const color = SECTION_COLORS[name] || "#6366f1";
                  const dot = DIFF_DOT[SECTION_DIFF[name]] || "#94a3b8";
                  return (
                    <button key={name} type="button" onClick={() => onMissingChange?.(name)} style={{
                      padding: "6px 11px", borderRadius: 999, border: isSel ? `2px solid ${color}` : "2px solid #e2e8f0",
                      background: isSel ? `${color}15` : "#fff", color: isSel ? color : "#64748b",
                      fontWeight: isSel ? 700 : 500, fontSize: 12, cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 5,
                    }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: isSel ? dot : "#d1d5db", display: "inline-block" }} />
                      {name}
                    </button>
                  );
                })}
                {addingSection ? (
                  <form onSubmit={e => { e.preventDefault(); if (newSectionName.trim()) { setCustomSections(p => [...p, newSectionName.trim()]); } setNewSectionName(""); setAddingSection(false); }} style={{ display: "flex", gap: 4, width: "100%" }}>
                    <input autoFocus value={newSectionName} onChange={e => setNewSectionName(e.target.value)} placeholder="Nom de la section…" style={s.miniInput} />
                    <button type="submit" style={s.miniBtn}>✓</button>
                    <button type="button" onClick={() => setAddingSection(false)} style={{ ...s.miniBtn, background: "#fee2e2", color: "#dc2626" }}>×</button>
                  </form>
                ) : (
                  <button type="button" onClick={() => setAddingSection(true)} style={s.addSectionBtn}>
                    🟡 + Section perso
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Auto-detected sections panel */}
        {Object.keys(detectedSections).length > 0 && (
          <div style={{ ...s.sideBlock, background: "#f0fdf4", borderLeft: "3px solid #22c55e" }}>
            <div style={{ ...s.sideLabel, color: "#15803d" }}>✅ Sections détectées</div>
            <p style={{ fontSize: 11, color: "#166534", margin: "0 0 10px", lineHeight: 1.4 }}>
              Cliquez sur une section pour la sélectionner comme section à cacher.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {Object.entries(detectedSections).map(([key, content]) => {
                const label = SECTION_PATTERN_LABELS[key] || key;
                const isSel = missingSection === label;
                const previewLen = Math.min(content.length, 60);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onMissingChange?.(label)}
                    style={{
                      textAlign: "left", padding: "7px 10px", borderRadius: 8, cursor: "pointer",
                      border: isSel ? "2px solid #16a34a" : "1.5px solid #d1fae5",
                      background: isSel ? "#dcfce7" : "#fff",
                      color: isSel ? "#15803d" : "#374151",
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 12 }}>{label}</div>
                    <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                      {content.slice(0, previewLen)}{content.length > previewLen ? "…" : ""}
                    </div>
                    <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>
                      {content.split(/\s+/).length} mots
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Formats */}
        <div style={s.sideBlock}>
          <div style={{ ...s.sideLabel, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none", marginBottom: formatsOpen ? 10 : 0 }} onClick={() => setFormatsOpen(o => !o)}>
            <span>📂 Formats acceptés</span>
            <span style={{ fontSize: 9, color: "#94a3b8", display: "inline-block", transition: "transform .2s", transform: formatsOpen ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
          </div>
          {formatsOpen && [
            { ext: "PDF", desc: "texte + OCR", color: "#fee2e2", tc: "#dc2626" },
            { ext: "DOCX", desc: ".docx", color: "#dbeafe", tc: "#2563eb" },
            { ext: "TXT", desc: ".txt / .md", color: "#f3f4f6", tc: "#374151" },
          ].map(f => (
            <div key={f.ext} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: f.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: f.tc, flexShrink: 0 }}>{f.ext}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{f.ext === "TXT" ? "Texte" : f.ext === "PDF" ? "PDF" : "Word"}</div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Starters */}
        {missingSection && (
          <div style={s.sideBlock}>
            <div style={{ ...s.sideLabel, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none", marginBottom: amorcesOpen ? 10 : 0 }} onClick={() => setAmorcesOpen(o => !o)}>
              <span>💡 Amorces — {missingSection}</span>
              <span style={{ fontSize: 9, color: "#94a3b8", display: "inline-block", transition: "transform .2s", transform: amorcesOpen ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
            </div>
            {amorcesOpen && (
              <>
                {currentStarters.map((st, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: "#94a3b8", minWidth: 14 }}>{i + 1}.</span>
                    <input type="text" value={st} onChange={e => updateStarter(i, e.target.value)}
                      style={s.starterInput} placeholder={`Amorce ${i + 1}…`} />
                    <button type="button" onClick={() => removeStarter(i)} style={s.xBtn}>×</button>
                  </div>
                ))}
                <button type="button" onClick={addStarter} style={s.addStarterBtn}>+ Ajouter une amorce</button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Main area ── */}
      <div style={s.main}>

        {/* Top bar */}
        <div style={s.topBar}>
          <div>
            <h2 style={s.mainTitle}>Outil de découpe</h2>
            <p style={s.mainSub}>
              Section à cacher aux étudiants :{" "}
              <strong style={{ color: missingColor }}>{missingSection || "—"}</strong>
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={s.statusBadge}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: sc.dot, display: "inline-block" }} />
              <span style={{ color: sc.color, fontWeight: 600, fontSize: 12 }}>{sc.label}</span>
            </div>
            {onClose && (
              <button type="button" onClick={onClose} style={s.closeBtn}>×</button>
            )}
          </div>
        </div>

        {/* Steps guide */}
        <div style={s.stepsBar}>
          {[
            { n: 1, text: <>Importez <strong>PDF / Word / Texte</strong></> },
            { n: 2, text: <>Sélectionnez la section à cacher</> },
            { n: 3, text: <>Cliquez <strong>Valider</strong> → envoyez aux étudiants</> },
          ].map((step, i) => (
            <span key={step.n} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#374151" }}>
              <span style={s.stepNum}>{step.n}</span>
              <span>{step.text}</span>
              {i < 2 && <span style={{ color: "#d1d5db", margin: "0 8px" }}>→</span>}
            </span>
          ))}
        </div>

        {/* Drop zone */}
        <div
          ref={dropRef}
          style={{ ...s.dropZone, borderColor: isDragging ? "#6366f1" : "#d1d5db", background: isDragging ? "#f5f3ff" : "#fafafa" }}
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input ref={fileRef} type="file" accept=".pdf,.txt,.md,.docx,.doc" style={{ display: "none" }} onChange={handleFileChange} />
          <div style={{ fontSize: 32, marginBottom: 8, color: "#94a3b8" }}>📄</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>Glissez votre article ici</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>PDF, Word, Markdown, Texte brut</div>
        </div>

        {/* OCR warning — only show after extraction attempt returned little/no text */}
        {extractDone && !extractLoading && (status === "ocr" || (["loaded","error"].includes(status) && fileInfo?.ext === "pdf" && text.length < 60)) && (
          <div style={s.ocrBanner}>
            <span style={{ fontSize: 18 }}>🔍</span>
            <div style={{ flex: 1 }}>
              <strong style={{ color: "#92400e" }}>Ce PDF semble scanné ou sans texte extractible</strong>
              <div style={{ fontSize: 12, color: "#78350f", marginTop: 2 }}>
                L'extraction automatique n'a pas trouvé de texte.
                Activez l'OCR Claude (recommandé) ou copiez-collez manuellement le texte via <strong>Coller</strong>.
              </div>
              {ocrMsg && ocrMsg.includes("Erreur") && (
                <div style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>{ocrMsg}</div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <button type="button" style={s.ocrBtn} onClick={activateOcr} disabled={extractLoading}>
                ⚡ Activer l'OCR
              </button>
              <button type="button" style={{ ...s.ocrBtn, background: "#fff", color: "#6366f1", border: "1px solid #c7d2fe" }} onClick={() => setInputMode("paste")}>
                📋 Coller manuellement
              </button>
            </div>
          </div>
        )}

        {/* Extraction loading (first pass) */}
        {extractLoading && status === "loaded" && !extractDone && (
          <div style={{ ...s.ocrProgress, background: "#eef2ff", border: "1px solid #c7d2fe" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#4338ca" }}>
              <div style={{ width: 16, height: 16, border: "2px solid #c7d2fe", borderTopColor: "#6366f1", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              <span>Extraction du texte en cours via Claude AI…</span>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* OCR progress */}
        {status === "ocr" && extractLoading && (
          <div style={s.ocrProgress}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13, fontWeight: 600, color: "#374151" }}>
              <span>🔍 OCR en cours…</span>
              <span>{ocrProgress} %</span>
            </div>
            <div style={{ height: 4, background: "#e2e8f0", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${ocrProgress}%`, background: "#6366f1", borderRadius: 4, transition: "width .4s ease" }} />
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{typeof ocrMsg === "string" ? ocrMsg : "Traitement…"}</div>
          </div>
        )}

        {/* Tabs + file chip + view toggle */}
        <div style={s.tabsRow}>
          {[{ id: "paste", icon: "📋", label: "Coller" }, { id: "file", icon: "📁", label: "Importer un fichier" }].map(m => (
            <button key={m.id} type="button" onClick={() => { setInputMode(m.id); if (m.id === "file") fileRef.current?.click(); }} style={{
              ...s.modeTab,
              background: inputMode === m.id ? "#1e293b" : "transparent",
              color: inputMode === m.id ? "#fff" : "#64748b",
              fontWeight: inputMode === m.id ? 600 : 400,
            }}>
              {m.icon} {m.label}
            </button>
          ))}
          {fileInfo && (
            <div style={s.fileChip}>
              <span style={{ fontSize: 10, fontWeight: 800, padding: "1px 5px", borderRadius: 4, background: FILE_COLORS[fileInfo.ext] || "#94a3b8", color: "#fff" }}>
                {fileInfo.ext?.toUpperCase()}
              </span>
              <span style={{ fontSize: 12, color: "#374151" }}>{fileInfo.name}</span>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>· {formatSize(fileInfo.size)}</span>
            </div>
          )}
          {/* View toggle — only when text exists */}
          {text.trim().length > 50 && (
            <div style={{ marginLeft: "auto", display: "flex", border: "1.5px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
              {[{ id: "raw", label: "📄 Brut" }, { id: "structured", label: "🗂️ Structuré" }].map(v => (
                <button key={v.id} type="button" onClick={() => setViewMode(v.id)} style={{
                  padding: "6px 13px", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  background: viewMode === v.id ? "#6366f1" : "#f8fafc",
                  color: viewMode === v.id ? "#fff" : "#64748b",
                }}>
                  {v.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Structured view ── */}
        {viewMode === "structured" && !cutRange && Object.keys(structuredSections).length > 0 ? (
          <div style={{ margin: "0 24px", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
            {/* Header bar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>
                {Object.keys(structuredSections).length} section{Object.keys(structuredSections).length > 1 ? "s" : ""} détectée{Object.keys(structuredSections).length > 1 ? "s" : ""} · Références, notes et numéros de page supprimés
              </span>
              <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 600 }}>✓ Texte structuré</span>
            </div>
            {/* Section cards */}
            <div style={{ maxHeight: 400, overflowY: "auto" }}>
              {SECTION_ORDER_KEYS.filter(k => structuredSections[k]?.trim()).map(key => {
                const label = SECTION_LABELS_MAP[key] || key;
                const color = SECTION_COLORS[label] || "#6366f1";
                const content = structuredSections[key].trim();
                const words = content.split(/\s+/).filter(Boolean).length;
                const isMissing = missingSection === label;
                return (
                  <div key={key} style={{ borderBottom: "1px solid #f1f5f9", padding: "14px 16px", background: isMissing ? `${color}08` : "#fff", cursor: "pointer", transition: "background .15s" }}
                    onClick={() => { onMissingChange?.(label); }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 800, color: isMissing ? color : "#1e293b" }}>{label}</span>
                      <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 4 }}>{words} mots</span>
                      {isMissing && (
                        <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: "#fff", background: color, padding: "2px 8px", borderRadius: 999 }}>
                          ✂️ À découper
                        </span>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: "#374151", lineHeight: 1.6, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {content}
                    </p>
                  </div>
                );
              })}
              {/* Unknown sections */}
              {Object.entries(structuredSections).filter(([k]) => !SECTION_ORDER_KEYS.includes(k)).map(([key, content]) => {
                const words = content.trim().split(/\s+/).filter(Boolean).length;
                return (
                  <div key={key} style={{ borderBottom: "1px solid #f1f5f9", padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "#64748b" }}>{key}</span>
                      <span style={{ fontSize: 11, color: "#94a3b8" }}>{words} mots</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: "#374151", lineHeight: 1.6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {content.trim()}
                    </p>
                  </div>
                );
              })}
            </div>
            <div style={{ padding: "8px 14px", background: "#f8fafc", borderTop: "1px solid #e2e8f0", fontSize: 11, color: "#94a3b8" }}>
              Cliquez sur une section pour la sélectionner comme section à découper · {text.length.toLocaleString("fr")} caractères
            </div>
          </div>
        ) : (
          /* ── Raw / cut preview ── */
          !cutRange ? (
            <div style={{ position: "relative" }}>
              <textarea
                ref={taRef}
                style={s.textarea}
                value={text}
                onChange={e => { setText(e.target.value); setViewMode("raw"); if (status !== "loaded") setStatus(e.target.value ? "loaded" : "ready"); }}
                placeholder={`Collez ici l'article complet (avec toutes les sections)…`}
                disabled={extractLoading}
              />
              <div style={s.taFooter}>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>{text.length.toLocaleString("fr")} caractères</span>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>Sélectionnez du texte → Retirer la sélection</span>
              </div>
              {extractDone && status === "ocr" && !extractLoading && (
                <div style={s.inlineBanner}>⚠️ PDF scanné détecté — activez l'OCR ci-dessus pour lire le texte</div>
              )}
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              {renderTextWithCut()}
              <div style={s.taFooter}>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>{(text.length - (cutRange.end - cutRange.start)).toLocaleString("fr")} caractères après découpe</span>
                <button type="button" onClick={resetCut} style={{ fontSize: 11, color: "#6366f1", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>↺ Réinitialiser</button>
              </div>
            </div>
          )
        )}

        {/* Action bar */}
        <div style={s.actionBar}>
          <button
            type="button"
            style={{ padding: "10px 16px", background: "#f0fdf4", color: "#16a34a", border: "1.5px solid #bbf7d0", borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", opacity: !text.trim() ? 0.4 : 1 }}
            disabled={!text.trim()}
            onClick={handleStructure}
          >
            🗂️ Nettoyer &amp; Structurer
          </button>
          <button
            type="button"
            style={{ ...s.btnCut, opacity: (!text.trim() || cutRange) ? 0.4 : 1 }}
            disabled={!text.trim() || !!cutRange}
            onClick={handleManualCut}
          >
            ✂️ Retirer la sélection
          </button>
          <button
            type="button"
            style={{ ...s.btnAuto, opacity: (!text.trim() || !missingSection) ? 0.4 : 1 }}
            disabled={!text.trim() || !missingSection}
            onClick={cutRange ? resetCut : handleAutocut}
          >
            ✨ {cutRange ? "Annuler la découpe" : `Retirer la section « ${missingSection || "?" } »`}
          </button>
          <button
            type="button"
            style={{ ...s.btnValidate, opacity: !cutRange ? 0.4 : 1, marginLeft: "auto" }}
            disabled={!cutRange}
            onClick={handleValidate}
          >
            ✓ Valider &amp; envoyer aux étudiants
          </button>
        </div>

        {/* ── Article final ── */}
        {validated && finalText && (
          <div style={s.finalSection}>
            <div style={s.finalHeader}>
              <div>
                <span style={{ fontSize: 16 }}>🏆</span>
                <strong style={{ fontSize: 14, color: "#1e293b" }}> Article final</strong>
                <span style={s.finalBadge}>À ENVOYER AUX ÉTUDIANTS</span>
              </div>
              <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0" }}>
                Ce fichier NE contient PAS la section « <strong>{cutRange?.section}</strong> ». L'étudiant devra la rédiger.
              </p>
            </div>

            <div style={s.exportBar}>
              <select value={exportFormat} onChange={e => setExportFormat(e.target.value)} style={s.exportSelect}>
                <option value="md">📝 Markdown (.md)</option>
                <option value="txt">📄 Texte (.txt)</option>
              </select>
              <button type="button" style={s.exportBtn} onClick={downloadFinal}>💾 Télécharger</button>
              <button type="button" style={s.exportBtnOutline} onClick={copyFinal}>📋 Copier (Markdown)</button>
              <button type="button" style={s.exportBtnOutline} onClick={() => {
                const html = `<pre style="font-family: Georgia, serif; line-height: 1.8; max-width: 800px; margin: 0 auto; padding: 20px;">${finalText.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`;
                navigator.clipboard.writeText(html);
              }}>🔗 Copier (HTML embed)</button>
            </div>

            <div style={s.finalPreview}>{finalText}</div>

            {/* Removed section info */}
            <div style={s.removedInfo}>
              {validated ? (
                <span style={s.validatedBadge}>✓ Validé ! L'article final est prêt. La section « {cutRange?.section} » ne sera PAS envoyée.</span>
              ) : (
                <>
                  <span style={s.removedBadge}>🔒 Section retirée</span>
                  <span style={s.removedLabel}>« {cutRange?.section} » retirée</span>
                </>
              )}
              <span style={s.revealHint} onClick={() => {
                const el = document.getElementById("hidden-section-reveal");
                if (el) el.style.display = el.style.display === "none" ? "block" : "none";
              }}>cliquez pour révéler (référence prof uniquement)</span>
              <div id="hidden-section-reveal" style={{ display: "none", marginTop: 8, padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 12, color: "#dc2626", whiteSpace: "pre-wrap" }}>
                {cutRange ? text.slice(cutRange.start, cutRange.end) : ""}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────
const s = {
  root:          { display: "flex", height: "100%", fontFamily: "'Segoe UI', sans-serif", background: "#f8fafc", overflow: "hidden" },
  sidebar:       { width: 272, flexShrink: 0, background: "#fff", borderRight: "1px solid #e2e8f0", overflowY: "auto", display: "flex", flexDirection: "column", gap: 0 },
  sideHeader:    { display: "flex", alignItems: "center", gap: 12, padding: "16px 16px 14px", borderBottom: "1px solid #f1f5f9" },
  appIcon:       { width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  appTitle:      { fontSize: 14, fontWeight: 700, color: "#1e293b" },
  appSub:        { fontSize: 11, color: "#94a3b8", marginTop: 1 },
  sideBlock:     { padding: "14px 16px", borderBottom: "1px solid #f1f5f9" },
  sideLabel:     { fontSize: 10, fontWeight: 800, color: "#f59e0b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 },
  addSectionBtn: { padding: "5px 11px", borderRadius: 999, border: "1.5px dashed #fde68a", background: "#fffbeb", color: "#a16207", fontSize: 12, fontWeight: 600, cursor: "pointer", marginTop: 4 },
  miniInput:     { flex: 1, padding: "5px 9px", borderRadius: 7, border: "1px solid #e2e8f0", fontSize: 12, fontFamily: "inherit", outline: "none" },
  miniBtn:       { padding: "4px 8px", border: "none", borderRadius: 6, background: "#eef2ff", color: "#6366f1", fontWeight: 700, cursor: "pointer", fontSize: 12 },
  starterInput:  { flex: 1, padding: "5px 9px", borderRadius: 7, border: "1px solid #e2e8f0", fontSize: 12, fontFamily: "inherit", outline: "none", background: "#fff" },
  xBtn:          { border: "none", background: "#f1f5f9", color: "#94a3b8", borderRadius: 5, width: 22, height: 22, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  addStarterBtn: { fontSize: 12, color: "#6366f1", fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: "4px 0", marginTop: 4 },
  main:          { flex: 1, display: "flex", flexDirection: "column", overflow: "auto", padding: "0 0 24px" },
  topBar:        { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 24px 12px", flexShrink: 0, borderBottom: "1px solid #f1f5f9", background: "#fff" },
  mainTitle:     { margin: 0, fontSize: 22, fontWeight: 700, color: "#0f172a" },
  mainSub:       { margin: "3px 0 0", fontSize: 13, color: "#64748b" },
  statusBadge:   { display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 20 },
  closeBtn:      { border: "none", background: "#f1f5f9", width: 32, height: 32, borderRadius: 8, fontSize: 18, cursor: "pointer", color: "#64748b" },
  stepsBar:      { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4, padding: "10px 24px", background: "#f8fafc", border: "1px solid #e2e8f0", margin: "0 24px", borderRadius: 10, flexShrink: 0, marginTop: 14 },
  stepNum:       { width: 20, height: 20, borderRadius: "50%", background: "#1e293b", color: "#fff", fontWeight: 800, fontSize: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  dropZone:      { margin: "14px 24px 0", borderRadius: 12, border: "2px dashed #d1d5db", padding: "28px 0", display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer", transition: "all .2s", flexShrink: 0 },
  ocrBanner:     { display: "flex", alignItems: "center", gap: 12, margin: "10px 24px 0", padding: "10px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, flexShrink: 0 },
  ocrBtn:        { padding: "7px 14px", background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: "pointer", flexShrink: 0 },
  ocrProgress:   { margin: "10px 24px 0", padding: "12px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, flexShrink: 0 },
  tabsRow:       { display: "flex", alignItems: "center", gap: 6, padding: "10px 24px 0", flexWrap: "wrap", flexShrink: 0 },
  modeTab:       { padding: "7px 14px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, fontWeight: 400, cursor: "pointer", fontFamily: "inherit", transition: "all .15s" },
  fileChip:      { display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 20, marginLeft: 4 },
  textarea:      { width: "100%", boxSizing: "border-box", padding: "14px 16px", border: "1px solid #e2e8f0", borderRadius: 0, fontSize: 13, fontFamily: "monospace", lineHeight: 1.75, resize: "vertical", outline: "none", color: "#1e293b", background: "#fff", minHeight: 240, height: 320 },
  previewBox:    { width: "100%", boxSizing: "border-box", padding: "14px 16px", border: "1px solid #e2e8f0", background: "#fff", fontSize: 13, fontFamily: "monospace", lineHeight: 1.75, color: "#1e293b", minHeight: 240, height: 320, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", resize: "vertical" },
  removedSpan:   { background: "#fee2e2", color: "#dc2626", textDecoration: "line-through", borderRadius: 3, padding: "0 2px" },
  taFooter:      { display: "flex", justifyContent: "space-between", padding: "6px 16px", background: "#f8fafc", borderTop: "1px solid #e2e8f0", border: "1px solid #e2e8f0", borderTop: "none" },
  inlineBanner:  { position: "absolute", bottom: 40, left: "50%", transform: "translateX(-50%)", padding: "8px 16px", background: "#ef4444", color: "#fff", borderRadius: 20, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" },
  actionBar:     { display: "flex", alignItems: "center", gap: 10, padding: "12px 24px", background: "#fff", borderTop: "1px solid #f1f5f9", flexShrink: 0, flexWrap: "wrap" },
  btnCut:        { padding: "10px 16px", background: "#fff", color: "#64748b", border: "1.5px solid #e2e8f0", borderRadius: 9, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
  btnAuto:       { padding: "10px 16px", background: "#fffbeb", color: "#d97706", border: "1.5px solid #fde68a", borderRadius: 9, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
  btnValidate:   { padding: "11px 22px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 14px rgba(22,163,74,0.3)" },
  finalSection:  { margin: "16px 24px 0", border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden", background: "#fff" },
  finalHeader:   { padding: "14px 18px", borderBottom: "1px solid #f1f5f9", background: "#fff" },
  finalBadge:    { marginLeft: 8, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "#dcfce7", color: "#16a34a", textTransform: "uppercase", letterSpacing: "0.04em" },
  exportBar:     { display: "flex", gap: 8, padding: "10px 16px", background: "#f8fafc", borderBottom: "1px solid #f1f5f9", flexWrap: "wrap", alignItems: "center" },
  exportSelect:  { padding: "6px 10px", border: "1px solid #e2e8f0", borderRadius: 7, fontSize: 12, fontFamily: "inherit", outline: "none", cursor: "pointer" },
  exportBtn:     { padding: "7px 14px", background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" },
  exportBtnOutline: { padding: "6px 12px", background: "#fff", color: "#64748b", border: "1px solid #e2e8f0", borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" },
  finalPreview:  { padding: "14px 18px", fontSize: 13, fontFamily: "Georgia, serif", lineHeight: 1.8, color: "#1e293b", whiteSpace: "pre-wrap", maxHeight: 220, overflowY: "auto", background: "#fff" },
  removedInfo:   { padding: "10px 16px", background: "#f8fafc", borderTop: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  removedBadge:  { fontSize: 11, fontWeight: 700, padding: "3px 8px", background: "#fef3c7", color: "#d97706", borderRadius: 6, border: "1px solid #fde68a" },
  removedLabel:  { fontSize: 12, fontWeight: 600, color: "#374151" },
  validatedBadge:{ fontSize: 12, fontWeight: 600, color: "#16a34a", background: "#dcfce7", padding: "5px 12px", borderRadius: 8, border: "1px solid #86efac" },
  revealHint:    { marginLeft: "auto", fontSize: 11, color: "#94a3b8", cursor: "pointer", textDecoration: "underline" },
};
