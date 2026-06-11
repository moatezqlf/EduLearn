import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import api from "./api";
import GroupsPanel from "./session/GroupsPanel";
import SpecialtyGroupsPanel from "./session/SpecialtyGroupsPanel";
import ArticleUploadModal from "./session/ArticleUploadModal";
import SectionLearnModal from "./session/SectionLearnModal";
import ArticleCutterTool from "./session/ArticleCutterTool";
import SessionProgressPanel from "./session/SessionProgressPanel";
import { LEARNING_WORKFLOW } from "./session/sectionConfig";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const SOCKET_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/\/api\/?$/, "");

// ─── Document type / IMRAD config data ───────────────────
const DOCUMENT_TYPES = [
  { id: "article", icon: "📄", label: "Article Scientifique", desc: "Structure IMRAD — revues & conférences" },
  { id: "memoire", icon: "📝", label: "Mémoire PFE", desc: "Structure académique algérienne / maghrébine" },
];

const RESOURCE_TYPES = [
  // { id: "pdf", icon: "📕", label: "PDF" },
  // { id: "word", icon: "📘", label: "Word (.docx)" },
  // { id: "txt", icon: "📝", label: "Texte (.txt)" },
  // { id: "article", icon: "📄", label: "Article IMRAD" },
  // { id: "cours", icon: "📚", label: "Cours (modules)", isCourse: true },
  // { id: "ressource", icon: "🔗", label: "Autre ressource" },
];

const cloneSections = (src) =>
  Object.fromEntries(
    Object.entries(src).map(([name, data]) => [
      name,
      { color: data.color, letter: data.letter, criteria: [...data.criteria] },
    ])
  );

const LANGUAGES = [];


const SECTIONS_ARTICLE = {
  Titre: {
    color: "#64748b", letter: "T",
    criteria: [
      "Titre précis et informatif reflétant le contenu",
      "Conforme aux normes du domaine disciplinaire",
      "Longueur et formulation appropriées",
    ],
  },
  Abstract: {
    color: "#8b5cf6", letter: "A",
    criteria: [
      "Résumé structuré (contexte, objectifs, méthodes, résultats, conclusion)",
      "Longueur conforme aux exigences (souvent 150–300 mots)",
      "Autonome et compréhensible sans lire l'article complet",
      "Mots-clés pertinents si requis",
    ],
  },
  Introduction: {
    color: "#22c55e", letter: "I",
    criteria: [
      "Présente le contexte général du domaine",
      "Identifie clairement le gap / problème de recherche",
      "Formule une question ou hypothèse de recherche précise",
      "Justifie l'intérêt scientifique et l'originalité",
    ],
  },
  Méthodes: {
    color: "#3b82f6", letter: "M",
    criteria: [
      "Décrit le design de l'étude (expérimental, qualitatif, quantitatif…)",
      "Détaille la collecte de données (échantillon, instruments, protocole)",
      "Explique les outils d'analyse utilisés",
      "Assure la reproductibilité de l'étude",
    ],
  },
  Résultats: {
    color: "#f59e0b", letter: "R",
    criteria: [
      "Présente les données objectivement sans interprétation",
      "Utilise des tableaux/figures appropriés et bien légendés",
      "Répond directement à la question de recherche",
      "Distingue résultats principaux et secondaires",
    ],
  },
  Discussion: {
    color: "#ef4444", letter: "D",
    criteria: [
      "Interprète les résultats en lien avec la littérature",
      "Compare avec les études antérieures (similitudes/différences)",
      "Discute les limites de l'étude",
      "Propose des perspectives et recommandations",
    ],
  },
  Conclusion: {
    color: "#a855f7", letter: "C",
    criteria: [
      "Répond clairement à la question de recherche initiale",
      "Synthétise les apports principaux de l'étude",
      "Évite d'introduire de nouvelles informations",
      "Ouvre sur des pistes de recherche futures",
    ],
  },
};

const SECTIONS_MEMOIRE = {
  Titre: {
    color: "#64748b", letter: "T",
    criteria: [
      "Titre clair reflétant le sujet et le domaine",
      "Formulation académique conforme aux normes PFE",
      "Cohérence avec la problématique annoncée",
    ],
  },
  Abstract: {
    color: "#8b5cf6", letter: "A",
    criteria: [
      "Résumé / résumé exécutif structuré",
      "Présente contexte, objectifs, approche et résultats attendus",
      "Compréhensible en lecture autonome",
    ],
  },
  Introduction: {
    color: "#22c55e", letter: "I",
    criteria: [
      "Présente le contexte et la problématique",
      "Définit les objectifs du projet",
      "Annonce le plan du mémoire",
      "Justifie le choix du sujet",
    ],
  },
  "État de l'Art": {
    color: "#06b6d4", letter: "E",
    criteria: [
      "Revue complète de la littérature existante",
      "Analyse critique des travaux connexes",
      "Identification des lacunes dans l'existant",
      "Positionnement par rapport aux solutions existantes",
    ],
  },
  Conception: {
    color: "#3b82f6", letter: "C",
    criteria: [
      "Architecture globale du système",
      "Diagrammes UML (cas d'utilisation, classes, séquences)",
      "Choix technologiques justifiés",
      "Modélisation de la base de données",
    ],
  },
  Réalisation: {
    color: "#f59e0b", letter: "R",
    criteria: [
      "Environnement et outils de développement",
      "Captures d'écran des interfaces réalisées",
      "Fonctionnalités implémentées avec détails",
      "Tests et validation du système",
    ],
  },
  Conclusion: {
    color: "#a855f7", letter: "C",
    criteria: [
      "Bilan du travail réalisé",
      "Objectifs atteints vs objectifs initiaux",
      "Difficultés rencontrées et solutions",
      "Perspectives et améliorations futures",
    ],
  },
};


const PHASES = [
  { id: 0, key: "setup",   label: "Setup",       icon: "⚙️", desc: "Configure session" },
  { id: 1, key: "writing", label: "Writing",     icon: "✍️", desc: "Students write answers" },
  { id: 2, key: "review",  label: "Peer Review", icon: "👥", desc: "Students review peers" },
  { id: 3, key: "ai",      label: "AI Eval",     icon: "🤖", desc: "AI evaluates answers" },
  { id: 4, key: "results", label: "Results",     icon: "📊", desc: "Show results & best answer" },
];

const PHASE_NAMES = ["setup", "writing", "review", "ai", "results"];

const FIXED_CRITERIA = [
  { id: "clarity",       label: "Clarity",       desc: "Is the writing clear and easy to understand?" },
  { id: "structure",     label: "Structure",     desc: "Is the answer well-organized with logical flow?" },
  { id: "argumentation", label: "Argumentation", desc: "Are arguments well-supported with evidence?" },
  { id: "scientific",    label: "Scientific Accuracy", desc: "Is the content factually correct?" },
];

export default function TeacherSession() {
  const navigate = useNavigate();
  const socketRef = useRef(null);

  const [question, setQuestion]       = useState("");
  const [instructions, setInstructions] = useState("");
  const [examples, setExamples]       = useState("");
  const [videoFile, setVideoFile]     = useState(null);
  const [videoPreview, setVideoPreview] = useState(null);
  const [sessionCode, setSessionCode] = useState(null);
  const [sessionId, setSessionId]     = useState(null);

  // ── IMRAD config state ──
  const [setupStep, setSetupStep]             = useState(1);
  const [docType, setDocType]                 = useState("article");
  const [resourceType, setResourceType]       = useState("article");
  const [activityMode, setActivityMode]       = useState("section_learn");
  const [language, setLanguage]               = useState("FR + EN (auto)");
  const [sectionsConfig, setSectionsConfig]   = useState(() => cloneSections(SECTIONS_ARTICLE));
  const [selectedSections, setSelectedSections] = useState(() => Object.keys(SECTIONS_ARTICLE));
  const [editingSection, setEditingSection]   = useState(null);
  const [articleSections, setArticleSections] = useState({});
  const [articleFile, setArticleFile]         = useState(null);
  const [missingSection, setMissingSection]   = useState("Introduction");
  const [articleModalOpen, setArticleModalOpen] = useState(false);
  const [sectionModalOpen, setSectionModalOpen] = useState(false);
  const [specialtyGroups, setSpecialtyGroups]   = useState([]);
  const [specialtyTotal, setSpecialtyTotal]     = useState(0);
  const [specialtyPending, setSpecialtyPending] = useState(0);
  const [specialtyLoading, setSpecialtyLoading] = useState(true);
  const [targetSpecialites, setTargetSpecialites] = useState([]);
  const [sectionGuidance, setSectionGuidance]           = useState({});
  const [articleTextContent, setArticleTextContent]     = useState("");
  const [articleCutterOpen, setArticleCutterOpen]       = useState(false);
  const [sectionTimings, setSectionTimings]             = useState({}); // { "Introduction": 30 } (minutes)

  const toggleSection = (name) => {
    setSelectedSections(prev =>
      prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name]
    );
  };

  const updateArticleSection = (name, value) => {
    setArticleSections(prev => ({ ...prev, [name]: value }));
  };

  const handleDocTypeChange = (id) => {
    setDocType(id);
    const defaults = id === "memoire" ? SECTIONS_MEMOIRE : SECTIONS_ARTICLE;
    setSectionsConfig(cloneSections(defaults));
    setSelectedSections(Object.keys(defaults));
    setEditingSection(null);
    setMissingSection(Object.keys(defaults).includes("Introduction") ? "Introduction" : Object.keys(defaults)[0]);
  };

  const updateCriterion = (sectionName, index, value) => {
    setSectionsConfig(prev => {
      const next = { ...prev };
      const criteria = [...next[sectionName].criteria];
      criteria[index] = value;
      next[sectionName] = { ...next[sectionName], criteria };
      return next;
    });
  };

  const addCriterion = (sectionName) => {
    setSectionsConfig(prev => {
      const next = { ...prev };
      next[sectionName] = {
        ...next[sectionName],
        criteria: [...next[sectionName].criteria, ""],
      };
      return next;
    });
  };

  const removeCriterion = (sectionName, index) => {
    setSectionsConfig(prev => {
      const next = { ...prev };
      const criteria = next[sectionName].criteria.filter((_, i) => i !== index);
      if (criteria.length === 0) return prev;
      next[sectionName] = { ...next[sectionName], criteria };
      return next;
    });
  };

  const [phase, setPhase]             = useState(0);
  const [round, setRound]             = useState(1);
  const [currentSectionKey, setCurrentSectionKey] = useState("");
  const [students, setStudents]       = useState([]);
  const [answers, setAnswers]         = useState([]);
  const [groups, setGroups]           = useState([]);
  const [groupsOpen, setGroupsOpen]   = useState(false);
  const [connected, setConnected]     = useState(false);
  const [loading, setLoading]         = useState(false);
  const [activeTab, setActiveTab]     = useState("config");

  const totalRounds = 1;

  const fetchGroups = () => {
    setSpecialtyLoading(true);
    api.sessions.getStudentGroupsBySpecialty()
      .then(res => {
        setSpecialtyGroups(res.groups || []);
        setSpecialtyTotal(res.totalStudents || 0);
        setSpecialtyPending(res.pendingCount || 0);
      })
      .catch(() => setSpecialtyGroups([]))
      .finally(() => setSpecialtyLoading(false));
  };

  useEffect(() => { fetchGroups(); }, []);

  useEffect(() => {
    const handler = () => setArticleCutterOpen(true);
    window.addEventListener("open-article-cutter", handler);
    return () => window.removeEventListener("open-article-cutter", handler);
  }, []);

  const handleArticleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      setArticleFile(null);
      return;
    }
    setArticleFile(file);
    setArticleSections({});
    e.target.value = "";
  };

  const showDocStructure = resourceType === "article";
  const isCourseResource = resourceType === "cours";

  const toggleTargetSpecialite = (spec) => {
    setTargetSpecialites(prev =>
      prev.includes(spec) ? prev.filter(s => s !== spec) : [...prev, spec]
    );
  };

  useEffect(() => {
    const token = localStorage.getItem("edulearn_token");
    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", (e) => {
      console.error("Teacher socket connect_error:", e?.message || e);
      setConnected(false);
    });
    socket.on("student_joined", ({ students: s }) => setStudents(s));
    socket.on("answer_submitted", ({ answers: a }) => { if (a) setAnswers(a); });
    socket.on("groups_formed", ({ groups: g }) => setGroups(g));
    socket.on("phase_changed", (data) => {
      const p = data?.phase ?? data;
      const idx = PHASE_NAMES.indexOf(p);
      if (idx >= 0) setPhase(idx);
      if (data?.currentSectionKey != null) setCurrentSectionKey(data.currentSectionKey);
      if (data?.currentRound != null) setRound(data.currentRound);
    });
    socket.on("round_changed", ({ round: r }) => setRound(r));

    return () => socket.disconnect();
  }, []);

  const handleVideoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
  };

  const handleCreateSession = async () => {
    // Auto-generate question from missingSection if not set
    const finalQuestion = question.trim()
      || `Rédigez la section « ${missingSection} » de l'article selon les critères définis.`;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("question", finalQuestion);
      formData.append("instructions", instructions);
      formData.append("examples", examples);
      formData.append("criteria", JSON.stringify(FIXED_CRITERIA.map(c => c.id)));
      // ── IMRAD evaluation config ──
      formData.append("docType", docType);
      formData.append("resourceType", resourceType);
      formData.append("activityMode", activityMode);
      formData.append("language", language);
      formData.append("targetSpecialites", JSON.stringify(targetSpecialites));
      formData.append("selectedSections", JSON.stringify(selectedSections));
      formData.append("evaluationCriteria", JSON.stringify(
        Object.entries(sectionsConfig)
          .filter(([name]) => selectedSections.includes(name))
          .reduce((acc, [name, data]) => ({
            ...acc,
            [name]: data.criteria.filter(c => String(c).trim()),
          }), {})
      ));
      formData.append("articleSections", JSON.stringify(
        Object.fromEntries(
          selectedSections
            .filter(name => String(articleSections[name] || "").trim())
            .map(name => [name, articleSections[name].trim()])
        )
      ));
      formData.append("missingSection", missingSection || selectedSections[0] || "");
      formData.append("sectionGuidance", JSON.stringify(sectionGuidance));
      formData.append("sectionTimings", JSON.stringify(sectionTimings));
      if (articleTextContent) formData.append("articleTextContent", articleTextContent);
      if (videoFile) formData.append("video", videoFile);
      if (articleFile) formData.append("article", articleFile);

      const token = localStorage.getItem("edulearn_token");
      const res = await fetch(`${API_URL}/sessions/create`, {
        method: "POST",
        body: formData,
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const err = await res.json();
        console.error("Create session failed:", JSON.stringify(err));
        return;
      }

      const data = await res.json();
      console.log("Session created:", data);

      const newSessionId = data.sessionId;
      setSessionCode(data.code);
      setSessionId(newSessionId);
      setCurrentSectionKey(missingSection || selectedSections[0] || "");
      socketRef.current.emit("teacher_join", { sessionId: newSessionId });
      // Auto-start writing phase immediately after session creation
      setTimeout(() => {
        socketRef.current.emit("advance_phase", { sessionId: newSessionId, phase: "writing" });
      }, 800);
      setActiveTab("live");
      setPhase(1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const advancePhase = () => {
    if (phase >= 4) return;
    const next = phase + 1;
    socketRef.current.emit("advance_phase", { sessionId, phase: PHASE_NAMES[next] });
    setPhase(next);
  };

  const handleEndSession = () => {
    if (!sessionId) return;
    if (!window.confirm("Terminer définitivement cette session ? Les étudiants verront les résultats finaux.")) return;
    socketRef.current.emit("end_session", { sessionId });
    setPhase(4);
  };

  const answeredCount = Array.isArray(answers)
    ? answers.filter(a => {
        if (a.round !== round) return false;
        if (String(a.content || "").trim()) return true;
        const sa = a.sectionAnswers;
        if (sa && typeof sa === "object")
          return Object.values(sa).some(v => String(v || "").trim());
        return false;
      }).length
    : 0;

  const liveStatusText =
    phase === 1 ? `${answeredCount} / ${Math.max(students.length, 1)} students answered (writing)`
      : phase === 2 ? "Peer review in progress"
        : phase === 3 ? "AI evaluation phase"
          : phase === 4 ? "Results phase"
            : "—";

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.backBtn} onClick={() => window.history.back()}>←</div>
          <div>
            <h1 style={styles.title}>Scientific Writing Workshop</h1>
            <div style={styles.connBadge}>
              <span style={{ ...styles.connDot, background: connected ? "#22c55e" : "#ef4444" }} />
              {connected ? "Connected" : "Disconnected"}
            </div>
          </div>
        </div>
        {sessionCode && (
          <div style={styles.codeBox}>
            <div style={styles.codeLabel}>Session Code</div>
            <div style={styles.codeValue}>{sessionCode}</div>
          </div>
        )}
      </div>

      <div style={styles.body}>
        <div style={styles.leftPanel}>
          <div style={styles.tabs}>
            {["config", "live", "analytics"].map(t => (
              <button key={t} style={{ ...styles.tab, ...(activeTab === t ? styles.tabActive : {}) }} onClick={() => setActiveTab(t)}>
                {{ config: "⚙️ Config", live: "🎓 Learning Process", analytics: "📊 Analytics" }[t]}
              </button>
            ))}
          </div>

          {activeTab === "config" && (
            <>
            <div style={styles.wizardSteps}>
              {[
                { n: 1, label: "Type de ressource" },
                { n: 2, label: "Parcours & lancement" },
              ].map(({ n, label }) => (
                <div key={n} style={{ display: "flex", alignItems: "center", flex: n < 2 ? 1 : undefined }}>
                  <div style={{
                    ...styles.wizardStepDot,
                    background: setupStep >= n ? "#6366f1" : "#e2e8f0",
                    color: setupStep >= n ? "#fff" : "#94a3b8",
                  }}>{setupStep > n ? "✓" : n}</div>
                  <span style={{
                    ...styles.wizardStepLabel,
                    color: setupStep === n ? "#6366f1" : setupStep > n ? "#1e293b" : "#94a3b8",
                    fontWeight: setupStep === n ? 700 : 500,
                  }}>{label}</span>
                  {n < 2 && <div style={{ ...styles.wizardStepLine, background: setupStep > n ? "#6366f1" : "#e2e8f0" }} />}
                </div>
              ))}
            </div>

            {setupStep === 1 && (
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Publier une ressource pédagogique</h2>
              {/* <p style={styles.stepHint}>Choisissez le format de publication (cours, PDF, article scientifique, ressource libre).</p> */}
              {/* <h3 style={styles.sectionHeader}>Type de ressource</h3> */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
                {RESOURCE_TYPES.map(rt => (
                  <button
                    key={rt.id}
                    type="button"
                    onClick={() => setResourceType(rt.id)}
                    style={{
                      padding: "12px 16px", borderRadius: 12, cursor: "pointer", fontWeight: 600, fontSize: 13,
                      border: resourceType === rt.id ? "2px solid #6366f1" : "2px solid #e2e8f0",
                      background: resourceType === rt.id ? "#eef2ff" : "#fff",
                      color: resourceType === rt.id ? "#6366f1" : "#64748b",
                    }}
                  >
                    {rt.icon} {rt.label}
                  </button>
                ))}
              </div>

              {isCourseResource && (
                <div style={styles.infoBox}>
                  <strong>Cours avec modules</strong> — créez un cours complet (vidéos, PDF par module) via l&apos;éditeur de cours.
                  <button
                    type="button"
                    style={{ ...styles.smallBtn, marginTop: 10, display: "block", background: "#6366f1", color: "#fff", border: "none" }}
                    onClick={() => navigate("/teacher/courses/new")}
                  >
                    + Nouveau cours
                  </button>
                </div>
              )}

              {showDocStructure && (
              <>
              <h3 style={styles.sectionHeader}>Structure du document</h3>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {DOCUMENT_TYPES.map(dt => (
                  <div
                    key={dt.id}
                    onClick={() => handleDocTypeChange(dt.id)}
                    style={{
                      flex: "1 1 220px", padding: 20, borderRadius: 14, cursor: "pointer", transition: "all 0.2s",
                      border: docType === dt.id ? "2px solid #6366f1" : "2px solid #e2e8f0",
                      background: docType === dt.id ? "#eef2ff" : "#fff",
                      boxShadow: docType === dt.id ? "0 4px 12px rgba(99,102,241,0.12)" : "none",
                    }}
                  >
                    <div style={{ fontSize: 28, marginBottom: 10 }}>{dt.icon}</div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: docType === dt.id ? "#6366f1" : "#1e293b", marginBottom: 6 }}>
                      {dt.label}
                    </div>
                    <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>{dt.desc}</div>
                  </div>
                ))}
              </div>
              </>
              )}

              <div style={styles.wizardNav}>
                <button
                  type="button"
                  style={{ ...styles.btn, marginTop: 0, opacity: isCourseResource ? 0.5 : 1 }}
                  disabled={isCourseResource}
                  onClick={() => setSetupStep(2)}
                >
                  Suivant →
                </button>
              </div>
            </div>
            )}

            {setupStep === 2 && (
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Parcours pédagogique</h2>
              <p style={styles.stepHint}>
                Configurez les deux premières étapes : lecture de l&apos;article complet, puis section à apprendre.
              </p>

              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b", alignSelf: "center" }}>Langue :</span>
                {LANGUAGES.map(lang => (
                  <button key={lang} type="button" onClick={() => setLanguage(lang)} style={{
                    padding: "6px 12px", borderRadius: 999, fontWeight: 600, fontSize: 11, cursor: "pointer",
                    border: language === lang ? "2px solid #6366f1" : "2px solid #e2e8f0",
                    background: language === lang ? "#6366f1" : "transparent",
                    color: language === lang ? "#fff" : "#64748b",
                  }}>{lang}</button>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
                {LEARNING_WORKFLOW.map(w => {
                  const clickable = w.step === 1 || w.step === 2;
                  const configured =
                    (w.step === 1 && articleFile) ||
                    (w.step === 2 && (missingSection || articleTextContent) && activityMode === "section_learn");
                  return (
                    <div
                      key={w.step}
                      role={clickable ? "button" : undefined}
                      tabIndex={clickable ? 0 : undefined}
                      onClick={() => {
                        if (w.step === 1) {
                          setActivityMode("full_read");
                          setArticleModalOpen(true);
                        } else if (w.step === 2) {
                          setActivityMode("section_learn");
                          setArticleCutterOpen(true);
                        }
                      }}
                      onKeyDown={e => {
                        if (!clickable) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          if (w.step === 1) { setActivityMode("full_read"); setArticleModalOpen(true); }
                          if (w.step === 2) { setActivityMode("section_learn"); setArticleCutterOpen(true); }
                        }
                      }}
                      style={{
                        background: configured ? "#ecfdf5" : "#faf5ff",
                        borderRadius: 14, padding: 16,
                        border: configured ? "2px solid #86efac" : "2px solid #e9d5ff",
                        cursor: clickable ? "pointer" : "default",
                        opacity: clickable ? 1 : 0.85,
                        transition: "transform 0.15s",
                      }}
                    >
                      <div style={{
                        width: 28, height: 28, borderRadius: "50%", background: configured ? "#22c55e" : "#8b5cf6", color: "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 800, fontSize: 13, marginBottom: 8,
                      }}>{configured ? "✓" : w.step}</div>
                      <div style={{ fontSize: 22, marginBottom: 6 }}>{w.icon}</div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#6d28d9", marginBottom: 4 }}>{w.label}</div>
                      <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.45 }}>{w.desc}</div>
                      {clickable && (
                        <div style={{ marginTop: 10, fontSize: 11, fontWeight: 700, color: "#6366f1" }}>
                          {w.step === 1 ? "Cliquer pour importer l'article →" : w.step === 2 ? (
                            <span>
                              Cliquer pour configurer la section →
                              <span style={{ display: "block", marginTop: 4, fontSize: 10, color: "#22c55e", fontWeight: 700 }}>
                                ✂️ ou ouvrir l&apos;Article Cutter
                              </span>
                            </span>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <SpecialtyGroupsPanel
                groups={specialtyGroups}
                loading={specialtyLoading}
                totalStudents={specialtyTotal}
                pendingCount={specialtyPending}
                onRefresh={fetchGroups}
              />

              {specialtyGroups.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <h3 style={styles.sectionHeader}>Cibler des spécialités (optionnel)</h3>
                  <p style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
                    Laissez vide pour notifier tous vos étudiants inscrits.
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {specialtyGroups.map(g => (
                      <button
                        key={g.specialite}
                        type="button"
                        onClick={() => toggleTargetSpecialite(g.specialite)}
                        style={{
                          padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer",
                          border: targetSpecialites.includes(g.specialite) ? "2px solid #6366f1" : "2px solid #e2e8f0",
                          background: targetSpecialites.includes(g.specialite) ? "#eef2ff" : "#fff",
                          color: targetSpecialites.includes(g.specialite) ? "#6366f1" : "#64748b",
                        }}
                      >
                        {g.specialite} ({g.count})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* <div style={{ marginTop: 20 }}>
                <h3 style={styles.sectionHeader}>Critères par section (optionnel)</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
                  {Object.entries(sectionsConfig)
                    .filter(([name]) => selectedSections.includes(name))
                    .map(([name, { color, criteria }]) => (
                      <div key={name} style={{
                        background: "#fafbfc", borderRadius: 10, padding: 12,
                        border: "1px solid #e2e8f0", borderTop: `3px solid ${color}`,
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color }}>{name}</span>
                          <button type="button" onClick={() => setEditingSection(editingSection === name ? null : name)} style={styles.smallBtn}>
                            {editingSection === name ? "Fermer" : "Modifier"}
                          </button>
                        </div>
                        {editingSection === name ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {criteria.map((c, i) => (
                              <input key={i} type="text" value={c} onChange={e => updateCriterion(name, i, e.target.value)} style={styles.criterionInput} />
                            ))}
                            <button type="button" onClick={() => addCriterion(name)} style={styles.addCriterionBtn}>+ critère</button>
                          </div>
                        ) : (
                          <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: 11, color: "#64748b" }}>
                            {criteria.filter(c => String(c).trim()).slice(0, 3).map((c, i) => <li key={i}>· {c}</li>)}
                          </ul>
                        )}
                      </div>
                    ))}
                </div>
              </div> */}

              {/* Timing par phase */}
              {missingSection && (
                <div style={{ marginTop: 20, padding: "16px 20px", background: "#fafafa", borderRadius: 12, border: "1px solid #e2e8f0" }}>
                  <h3 style={{ ...styles.sectionHeader, marginTop: 0, marginBottom: 4 }}>⏱ Durée par phase</h3>
                  <p style={{ fontSize: 12, color: "#64748b", marginBottom: 16, marginTop: 0 }}>
                    Définissez le temps de chaque phase pour la section <strong>{missingSection}</strong>. Laissez vide = sans limite.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {[
                      { key: `${missingSection}_read`, icon: "📖", label: "Lecture", hint: "Temps pour lire l'article complet", color: "#0ea5e9", bg: "#f0f9ff" },
                      { key: missingSection,            icon: "✍️", label: "Rédaction", hint: "Temps pour écrire la section", color: "#6366f1", bg: "#eef2ff" },
                      { key: `${missingSection}_review`, icon: "👥", label: "Feedback pairs", hint: "Temps pour la phase de relecture", color: "#f59e0b", bg: "#fffbeb" },
                    ].map(({ key, icon, label, hint, color, bg }) => (
                      <div key={key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: bg, borderRadius: 10, border: `1.5px solid ${color}30` }}>
                        <span style={{ fontSize: 18, minWidth: 24 }}>{icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{label}</div>
                          <div style={{ fontSize: 11, color: "#94a3b8" }}>{hint}</div>
                        </div>
                        <input
                          type="number"
                          min={1}
                          max={120}
                          value={sectionTimings[key] || ""}
                          onChange={e => setSectionTimings(prev => ({
                            ...prev,
                            [key]: e.target.value === "" ? undefined : Math.max(1, Math.min(120, Number(e.target.value) || 0)),
                          }))}
                          placeholder="—"
                          style={{ width: 64, padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${color}60`, fontSize: 14, textAlign: "center", outline: "none", background: "#fff" }}
                        />
                        <span style={{ fontSize: 12, color: "#94a3b8", minWidth: 24 }}>min</span>
                        {sectionTimings[key] > 0 && (
                          <span style={{ fontSize: 12, fontWeight: 700, color, background: color + "18", padding: "3px 10px", borderRadius: 999, minWidth: 58, textAlign: "center" }}>
                            {sectionTimings[key]} min
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={styles.wizardNav}>
                <button type="button" style={styles.btnGhost} onClick={() => setSetupStep(1)}>← Retour</button>
                <button
                  type="button"
                  style={{ ...styles.btn, marginTop: 0, flex: 1, opacity: (!missingSection || !articleFile || loading) ? 0.5 : 1 }}
                  disabled={!missingSection || !articleFile || loading}
                  onClick={handleCreateSession}
                >
                  {loading ? "Création…" : "🚀 Lancer la session →"}
                </button>
              </div>
            </div>
            )}
            </>
          )}

          {activeTab === "live" && (
            <div style={styles.card}>
              {/* Groups toggle button */}
              <button
                type="button"
                onClick={() => setGroupsOpen(o => !o)}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: groupsOpen ? "#f0f9ff" : "#f8fafc", cursor: "pointer", marginBottom: 16, fontFamily: "inherit", transition: "all .15s" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16 }}>👥</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>Groupes</span>
                  {groups.length > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "#6366f1", padding: "1px 8px", borderRadius: 999 }}>{groups.length}</span>
                  )}
                  {groups.length === 0 && (
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>— se forment automatiquement</span>
                  )}
                </div>
                <span style={{ fontSize: 10, color: "#94a3b8", transition: "transform .2s", display: "inline-block", transform: groupsOpen ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
              </button>
              {groupsOpen && <div style={{ marginBottom: 16 }}><GroupsPanel groups={groups} /></div>}

              <h2 style={styles.cardTitle}>Session Control</h2>
              <div style={styles.stepper}>
                {PHASES.slice(1).map((p, i) => (
                  <div key={p.id} style={styles.stepRow}>
                    <div style={{ ...styles.stepCircle, background: phase > p.id ? "#6366f1" : phase === p.id ? "#818cf8" : "#e2e8f0", color: phase >= p.id ? "#fff" : "#94a3b8" }}>
                      {phase > p.id ? "✓" : p.icon}
                    </div>
                    <div style={styles.stepInfo}>
                      <div style={{ ...styles.stepLabel, color: phase >= p.id ? "#1e293b" : "#94a3b8" }}>{p.label}</div>
                      <div style={styles.stepDesc}>{p.desc}</div>
                    </div>
                    {i < PHASES.length - 2 && <div style={styles.stepLine} />}
                  </div>
                ))}
              </div>
              {/* Auto-flow status */}
              <div style={{ margin: "12px 0 8px", padding: "10px 14px", background: "#f0fdf4", borderRadius: 10, border: "1px solid #bbf7d0", fontSize: 13, color: "#166534", display: "flex", alignItems: "center", gap: 8 }}>
                <span>🤖</span>
                <span style={{ fontWeight: 600 }}>Flux automatique actif</span>
                <span style={{ color: "#64748b", fontSize: 12 }}>— le système avance les phases automatiquement.</span>
              </div>
              {phase === 1 && (
                <>
                  <div style={styles.progressBar}><div style={{ ...styles.progressFill, width: `${(answeredCount / Math.max(students.length, 1)) * 100}%` }} /></div>
                  <div style={styles.progressLabel}>{liveStatusText}</div>
                </>
              )}
              {phase !== 1 && <div style={styles.progressLabel}>{liveStatusText}</div>}
              {/* End session */}
              <div style={{ marginTop: 20, borderTop: "1px solid #fee2e2", paddingTop: 16 }}>
                <button
                  style={{ width: "100%", padding: "12px 0", background: phase >= 4 ? "#ef4444" : "#fff", color: phase >= 4 ? "#fff" : "#dc2626", border: "1.5px solid #fca5a5", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}
                  onClick={handleEndSession}
                >
                  🔴 Terminer la session
                </button>
              </div>
            </div>
          )}

          {activeTab === "analytics" && (
            <div style={styles.card}>
              {sessionId ? (
                <SessionProgressPanel
                  sessionId={sessionId}
                  selectedSections={selectedSections}
                />
              ) : (
                <div style={styles.emptyState}>Lancez la session pour accéder aux analytics.</div>
              )}
            </div>
          )}
        </div>

        <div style={styles.sidebar}>
          <div style={styles.sideCard}>
            <h3 style={styles.sideTitle}>Session Info</h3>
            <div style={styles.infoRow}><span style={styles.infoKey}>Phase</span><span style={styles.infoValPurple}>{PHASES[phase]?.label || "Setup"}</span></div>
            {currentSectionKey ? (
              <div style={styles.infoRow}><span style={styles.infoKey}>Section</span><span style={{ ...styles.infoValPurple, color: "#059669" }}>{currentSectionKey}</span></div>
            ) : null}
            <div style={styles.infoRow}><span style={styles.infoKey}>Students</span><span style={styles.infoVal}>{students.length}</span></div>
            <div style={styles.infoRow}><span style={styles.infoKey}>Groups</span><span style={styles.infoVal}>{groups.length}</span></div>
            <div style={styles.infoRow}><span style={styles.infoKey}>Answers</span><span style={styles.infoVal}>{answeredCount}</span></div>
          </div>
          <div style={styles.sideCard}>
            <h3 style={styles.sideTitle}>Flow Guide</h3>
            {PHASES.map(p => (
              <div key={p.id} style={{ ...styles.flowItem, opacity: phase >= p.id ? 1 : 0.4 }}>
                <div style={{ ...styles.flowNum, background: phase > p.id ? "#6366f1" : phase === p.id ? "#818cf8" : "#e2e8f0", color: phase >= p.id ? "#fff" : "#94a3b8" }}>
                  {phase > p.id ? "✓" : p.id}
                </div>
                <div>
                  <div style={styles.flowLabel}>{p.label}</div>
                  <div style={styles.flowDesc}>{p.desc}</div>
                </div>
              </div>
            ))}
            <div style={styles.roundNote}>Parcours en une séance : lecture → section à apprendre → feedback pairs → évaluation IA.</div>
          </div>
          {students.length > 0 && (
            <div style={styles.sideCard}>
              <h3 style={styles.sideTitle}>Students ({students.length})</h3>
              {students.map(s => (
                <div key={s.id} style={styles.studentRow}>
                  <div style={styles.studentAvatar}>{s.name?.[0]?.toUpperCase()}</div>
                  <span style={styles.studentName}>{s.name}</span>
                  {answers.find(a => a.studentId === s.id && a.round === round) && <span style={styles.doneTag}>✓</span>}
                </div>
              ))}
            </div>
          )}
          {groups.length > 0 && (
            <div style={styles.sideCard}>
              <h3 style={styles.sideTitle}>Groupes (≤4)</h3>
              {groups.map((g, gi) => (
                <div key={gi} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#6366f1", marginBottom: 6 }}>Groupe {gi + 1}</div>
                  {(g.members || []).map(m => (
                    <div key={m.id} style={{ fontSize: 12, color: "#475569", padding: "2px 0" }}>
                      {m.name}{m.isReceiver ? " ★" : ""}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ArticleUploadModal
        open={articleModalOpen}
        onClose={() => setArticleModalOpen(false)}
        articleFile={articleFile}
        onFileSelect={handleArticleFileSelect}
        onClearFile={() => setArticleFile(null)}
        resourceType={resourceType}
      />
      <SectionLearnModal
        open={sectionModalOpen}
        onClose={() => setSectionModalOpen(false)}
        selectedSections={selectedSections}
        sectionsConfig={sectionsConfig}
        articleSections={articleSections}
        missingSection={missingSection}
        onMissingChange={setMissingSection}
        onUpdateSection={updateArticleSection}
        onToggleSection={toggleSection}
        allSectionNames={Object.keys(sectionsConfig)}
        sectionGuidance={sectionGuidance}
        onUpdateGuidance={(sectionName, starters) =>
          setSectionGuidance(prev => ({ ...prev, [sectionName]: starters }))
        }
        docType={docType}
        onArticleTextConfirm={(visibleText, _removed, _section) => {
          setArticleTextContent(visibleText);
        }}
      />

      {/* ── Article Cutter fullscreen overlay ── */}
      {articleCutterOpen && (
        <div style={{ position: "fixed", inset: 0, background: "#f8fafc", zIndex: 2000, display: "flex", flexDirection: "column" }}>
          <ArticleCutterTool
            missingSection={missingSection}
            onMissingChange={setMissingSection}
            allSectionNames={Object.keys(sectionsConfig)}
            sectionsConfig={sectionsConfig}
            sectionGuidance={sectionGuidance}
            onUpdateGuidance={(sectionName, starters) =>
              setSectionGuidance(prev => ({ ...prev, [sectionName]: starters }))
            }
            docType={docType}
            onConfirm={(visibleText) => {
              setArticleTextContent(visibleText);
              setActivityMode("section_learn");
              setArticleCutterOpen(false);
              setSectionModalOpen(false);
            }}
            onClose={() => setArticleCutterOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
const styles = {
  page: { minHeight: "100vh", background: "#f8fafc", fontFamily: "'Segoe UI', sans-serif" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 32px", background: "#fff", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 10 },
  headerLeft: { display: "flex", alignItems: "center", gap: 16 },
  backBtn: { cursor: "pointer", fontSize: 20, color: "#64748b", padding: "4px 8px", borderRadius: 6 },
  title: { margin: 0, fontSize: 20, fontWeight: 700, color: "#0f172a" },
  connBadge: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b", marginTop: 4 },
  connDot: { width: 8, height: 8, borderRadius: "50%", display: "inline-block" },
  codeBox: { background: "#f1f5f9", border: "2px solid #6366f1", borderRadius: 12, padding: "8px 20px", textAlign: "center" },
  codeLabel: { fontSize: 11, color: "#6366f1", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 },
  codeValue: { fontSize: 28, fontWeight: 800, color: "#0f172a", letterSpacing: 4 },
  body: { display: "flex", gap: 24, padding: "24px 32px", maxWidth: 1300, margin: "0 auto" },
  leftPanel: { flex: 1, minWidth: 0 },
  sidebar: { width: 280, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16 },
  tabs: { display: "flex", gap: 4, marginBottom: 16, background: "#f1f5f9", borderRadius: 10, padding: 4 },
  tab: { flex: 1, padding: "8px 0", border: "none", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13, color: "#64748b", fontWeight: 500 },
  tabActive: { background: "#fff", color: "#6366f1", fontWeight: 700, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" },
  card: { background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", border: "1px solid #e2e8f0" },
  cardTitle: { margin: "0 0 20px", fontSize: 18, fontWeight: 700, color: "#0f172a" },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6, marginTop: 16 },
  textarea: { width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: 14, color: "#1e293b", resize: "vertical", outline: "none", fontFamily: "inherit", boxSizing: "border-box", background: "#fafafa" },
  uploadZone: { border: "2px dashed #c7d2fe", borderRadius: 12, padding: 24, textAlign: "center", cursor: "pointer", background: "#f8f7ff" },
  uploadIcon: { fontSize: 32, marginBottom: 8 },
  uploadText: { fontSize: 14, color: "#6366f1", fontWeight: 600 },
  uploadSub: { fontSize: 12, color: "#94a3b8", marginTop: 4 },
  videoPreview: { width: "100%", borderRadius: 8, maxHeight: 200 },
  criteriaGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 4 },
  criteriaChip: { background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10, padding: "10px 12px" },
  criteriaName: { fontSize: 13, fontWeight: 700, color: "#0284c7", marginBottom: 3 },
  criteriaDesc: { fontSize: 11, color: "#64748b", lineHeight: 1.4 },
  infoBox: { background: "#eef2ff", borderLeft: "4px solid #6366f1", borderRadius: "0 10px 10px 0", padding: "12px 16px", fontSize: 13, color: "#3730a3", lineHeight: 1.6, marginTop: 20 },
  btn: { width: "100%", marginTop: 20, padding: "14px 0", background: "#6366f1", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer" },
  btnOutline: { flex: 1, padding: "10px 0", background: "#fff", color: "#6366f1", border: "2px solid #6366f1", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer" },
  btnDark: { flex: 1, padding: "10px 0", background: "#1e293b", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer" },
  controlRow: { display: "flex", gap: 10, marginTop: 20, marginBottom: 16 },
  stepper: { display: "flex", flexDirection: "column", gap: 0 },
  stepRow: { display: "flex", alignItems: "flex-start", gap: 12, position: "relative", paddingBottom: 16 },
  stepCircle: { width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0, fontWeight: 700 },
  stepInfo: { paddingTop: 4 },
  stepLabel: { fontSize: 14, fontWeight: 600 },
  stepDesc: { fontSize: 12, color: "#94a3b8" },
  stepLine: { position: "absolute", left: 17, top: 36, width: 2, height: "calc(100% - 20px)", background: "#e2e8f0" },
  progressBar: { height: 6, background: "#e2e8f0", borderRadius: 4, overflow: "hidden", marginBottom: 6 },
  progressFill: { height: "100%", background: "#6366f1", borderRadius: 4, transition: "width 0.5s" },
  progressLabel: { fontSize: 12, color: "#64748b", textAlign: "center" },
  answerCard: { border: "1px solid #e2e8f0", borderRadius: 10, padding: 14, marginBottom: 10 },
  answerHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  answerName: { fontSize: 14, fontWeight: 700, color: "#1e293b" },
  aiScore: { fontSize: 13, fontWeight: 700, color: "#6366f1", background: "#eef2ff", padding: "2px 8px", borderRadius: 20 },
  answerPreview: { fontSize: 13, color: "#64748b", lineHeight: 1.5, margin: "4px 0" },
  emptyState: { textAlign: "center", color: "#94a3b8", padding: 40, fontSize: 14 },
  sideCard: { background: "#fff", borderRadius: 14, padding: 18, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", border: "1px solid #e2e8f0" },
  sideTitle: { margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: 0.5 },
  infoRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f1f5f9" },
  infoKey: { fontSize: 13, color: "#64748b" },
  infoVal: { fontSize: 15, fontWeight: 700, color: "#1e293b" },
  infoValPurple: { fontSize: 13, fontWeight: 700, color: "#6366f1" },
  infoValOrange: { fontSize: 15, fontWeight: 700, color: "#f59e0b" },
  flowItem: { display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 },
  flowNum: { width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 },
  flowLabel: { fontSize: 13, fontWeight: 600, color: "#1e293b" },
  flowDesc: { fontSize: 11, color: "#94a3b8" },
  roundNote: { background: "#eef2ff", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#4338ca", marginTop: 8, lineHeight: 1.5 },
  studentRow: { display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid #f8fafc" },
  studentAvatar: { width: 28, height: 28, borderRadius: "50%", background: "#6366f1", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 },
  studentName: { flex: 1, fontSize: 13, color: "#374151" },
  doneTag: { fontSize: 12, color: "#22c55e", fontWeight: 700 },
  sectionHeader: { fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6366f1", marginBottom: 14, margin: "0 0 14px" },
  smallBtn: { padding: "5px 12px", borderRadius: 8, border: "1px solid #e2e8f0", background: "transparent", fontSize: 11, fontWeight: 600, color: "#64748b", cursor: "pointer" },
  wizardSteps: { display: "flex", alignItems: "center", marginBottom: 20, padding: "16px 20px", background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" },
  wizardStepDot: { width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 },
  wizardStepLabel: { fontSize: 12, marginLeft: 8, marginRight: 12, whiteSpace: "nowrap" },
  wizardStepLine: { flex: 1, height: 2, marginRight: 12, borderRadius: 1 },
  wizardNav: { display: "flex", gap: 12, marginTop: 24, alignItems: "center" },
  btnGhost: { padding: "12px 20px", background: "#fff", color: "#64748b", border: "1.5px solid #e2e8f0", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer", flexShrink: 0 },
  stepHint: { margin: "0 0 16px", fontSize: 13, color: "#64748b", lineHeight: 1.5 },
  editSectionBtn: { padding: "4px 10px", borderRadius: 8, border: "1px solid", background: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", flexShrink: 0 },
  criterionInput: { flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12, fontFamily: "inherit", outline: "none", background: "#fff" },
  criterionRemoveBtn: { width: 28, height: 28, borderRadius: 6, border: "1px solid #fecaca", background: "#fef2f2", color: "#ef4444", fontSize: 16, cursor: "pointer", flexShrink: 0, lineHeight: 1 },
  addCriterionBtn: { padding: "8px 12px", borderRadius: 8, border: "1px dashed #c7d2fe", background: "#f8f7ff", color: "#6366f1", fontSize: 12, fontWeight: 600, cursor: "pointer", alignSelf: "flex-start" },
};
