import { useState, useEffect, useRef, useMemo } from "react";
import { io } from "socket.io-client";
import { useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { tokenStorage } from "./api";
import PhaseBar from "./session/PhaseBar";
import PhaseReview from "./session/PhaseReview";
import { STUDENT_PHASES, PEER_CRITERIA } from "./session/sessionPhases";
import { LEARNING_WORKFLOW } from "./session/sectionConfig";
import { downloadSessionArticle, resolveMediaUrl } from "./session/articleUtils";
import ArticleDocumentPanel from "./session/ArticleDocumentPanel";
import ScaffoldingPanel from "./session/ScaffoldingPanel";
import SelfAssessmentWidget from "./session/SelfAssessmentWidget";

const SOCKET_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/\/api\/?$/, "");

const SECTION_COLORS = {
  Titre: "#64748b", Abstract: "#8b5cf6", Introduction: "#22c55e",
  Méthodes: "#3b82f6", Résultats: "#f59e0b", Discussion: "#ef4444", Conclusion: "#a855f7",
  "État de l'Art": "#06b6d4", Conception: "#3b82f6", Réalisation: "#f59e0b",
};
const SECTION_DIFF = {
  Titre: "simple", Abstract: "simple", Conclusion: "simple",
  Introduction: "intermediate", Résultats: "intermediate",
  Méthodes: "complex", Discussion: "complex", "État de l'Art": "complex",
  Conception: "intermediate", Réalisation: "intermediate",
};
const DIFF_LABEL = {
  simple:       { label: "Simple",        dot: "#22c55e" },
  intermediate: { label: "Intermédiaire", dot: "#f59e0b" },
  complex:      { label: "Complexe",      dot: "#ef4444" },
};

const CRITERIA = PEER_CRITERIA.map(c => ({
  id: c.id,
  label: c.label,
  emoji: c.emoji,
}));

const ACTIVE_STUDENT_PHASES = STUDENT_PHASES.filter(p => p.key !== "waiting");

const DOC_TYPE_LABELS = {
  article: "Article scientifique",
  memoire: "Mémoire PFE",
  hybride: "Hybride",
};

/** Problématique + section active + critères (grille prof). */
function TeacherSessionBrief({
  question,
  activeSectionKey,
  sectionCriteriaList,
  docType,
  level,
  language,
}) {
  const docLabel = DOC_TYPE_LABELS[docType] || docType || "";
  const meta = [docLabel, level, language].filter(Boolean).join(" · ");
  const show = Boolean(question?.trim() || activeSectionKey || meta);
  if (!show) return null;
  return (
    <div style={styles.teacherBriefCard}>
      <div style={styles.teacherBriefBadge}>Consigne du professeur</div>
      {question?.trim() ? (
        <>
          <div style={{ ...styles.teacherBriefSectionLabel, marginTop: 0 }}>Problématique</div>
          <p style={styles.teacherBriefQuestion}>{question}</p>
        </>
      ) : null}
      {activeSectionKey ? (
        <>
          <div style={styles.teacherBriefSectionLabel}>Section demandée</div>
          <div style={styles.teacherBriefSectionChip}>{activeSectionKey}</div>
        </>
      ) : null}
      {sectionCriteriaList.length > 0 ? (
        <>
          <div style={styles.teacherBriefSectionLabel}>Ce que doit contenir cette section</div>
          <ul style={styles.sectionCriteriaUl}>
            {sectionCriteriaList.map((text, i) => (
              <li key={i} style={styles.sectionCriteriaLi}>{text}</li>
            ))}
          </ul>
        </>
      ) : activeSectionKey ? (
        <p style={styles.teacherBriefFallback}>
          Aucune grille détaillée pour cette section. Suivez les instructions du professeur ci-dessous.
        </p>
      ) : null}
      {meta ? <div style={styles.teacherBriefMeta}>{meta}</div> : null}
    </div>
  );
}

/** Barre de progression du parcours pédagogique (image 3). */
function WorkflowBar({ currentStep }) {
  return (
    <div style={workflowStyles.bar}>
      {LEARNING_WORKFLOW.map(w => {
        const active = w.step === currentStep;
        const done = w.step < currentStep;
        return (
          <div key={w.step} style={{
            ...workflowStyles.step,
            borderColor: active ? "#8b5cf6" : done ? "#22c55e" : "#e2e8f0",
            background: active ? "#faf5ff" : done ? "#ecfdf5" : "#fff",
          }}>
            <div style={{
              ...workflowStyles.stepNum,
              background: done ? "#22c55e" : active ? "#8b5cf6" : "#e2e8f0",
              color: done || active ? "#fff" : "#94a3b8",
            }}>{done ? "✓" : w.step}</div>
            <div style={{ fontSize: 16 }}>{w.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 11, color: active ? "#6d28d9" : done ? "#059669" : "#64748b" }}>
              {w.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function StudentSession() {
  const socketRef = useRef(null);
  const joinedRef = useRef(false);
  const preReadRef = useRef(false); // article read during waiting phase → skip read step on writing start
  const location = useLocation();
  const { user } = useAuth();

  // Join
  const [code, setCode]           = useState("");
  const [name, setName]           = useState("");
  const [joined, setJoined]       = useState(false);
  const [studentId, setStudentId] = useState(null);
  const [sessionId, setSessionId] = useState(null);

  // Session content
  const [question, setQuestion]       = useState("");
  const [instructions, setInstructions] = useState("");
  const [example, setExample]         = useState("");
  const [videoUrl, setVideoUrl]       = useState(null);
  const [phase, setPhase]             = useState("waiting");
  const [round, setRound]             = useState(1);
  const [isReceiver, setIsReceiver]   = useState(false);
  const [receiverName, setReceiverName] = useState("");
  const [receiverAnswer, setReceiverAnswer] = useState("");
  const [selectedSections, setSelectedSections] = useState([]);
  const [currentSectionKey, setCurrentSectionKey] = useState("");
  const [evaluationCriteria, setEvaluationCriteria] = useState({});
  const [sessionDocType, setSessionDocType] = useState("article");
  const [sessionLevel, setSessionLevel] = useState("");
  const [sessionLanguage, setSessionLanguage] = useState("");
  const [articleSections, setArticleSections] = useState({});
  const [articleFileUrl, setArticleFileUrl] = useState(null);
  const [articleFileName, setArticleFileName] = useState("");
  const [articleFileMime, setArticleFileMime] = useState("");
  const [sessionResourceType, setSessionResourceType] = useState("article");
  const [missingSection, setMissingSection] = useState("");
  const [sectionGuidance, setSectionGuidance]       = useState({});
  const [articleTextContent, setArticleTextContent] = useState("");
  const [articleRead, setArticleRead] = useState(false);
  const [studentLearnStep, setStudentLearnStep] = useState("read");
  const [activeWritingTab, setActiveWritingTab] = useState(1); // 1=article, 2=section, 3=feedback

  useEffect(() => {
    if (phase === "writing" && !articleFileUrl) {
      setStudentLearnStep("write");
      setArticleRead(true);
      setActiveWritingTab(2);
    }
  }, [phase, articleFileUrl]);

  const [reviewAssignments, setReviewAssignments] = useState([]);
  const [reviewIdx, setReviewIdx]   = useState(0);
  const [reviewPackLoaded, setReviewPackLoaded] = useState(false);

  // Timers
  const [phaseEndsAt, setPhaseEndsAt]       = useState(null); // ISO string (writing phase, from server)
  const [timeLeft, setTimeLeft]             = useState(null); // seconds remaining (writing)
  const [sectionTimings, setSectionTimings] = useState({});  // { Introduction: 30, Introduction_read: 10 }
  const [readEndsAt, setReadEndsAt]         = useState(null); // local reading countdown (ISO string)
  const [readTimeLeft, setReadTimeLeft]     = useState(null); // seconds
  const autoSubmittedRef                    = useRef(false);

  // Writing
  const [answer, setAnswer]           = useState("");
  const [submitted, setSubmitted]     = useState(false);
  const [wordCount, setWordCount]     = useState(0);

  useEffect(() => {
    if (submitted) setActiveWritingTab(3);
  }, [submitted]);

  // Peer review
  const [peerRatings, setPeerRatings] = useState({ clarity: 0, structure: 0, argumentation: 0, scientific: 0 });
  const [peerComment, setPeerComment] = useState("");
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  // AI feedback
  const [aiFeedback, setAiFeedback]   = useState(null);
  const [aiLoading, setAiLoading]     = useState(false);
  const [aiEvalProgress, setAiEvalProgress] = useState(null);

  // Self-assessment (dismissed per-section)
  const [selfAssessmentDismissed, setSelfAssessmentDismissed] = useState({});

  // Revision
  const [revision, setRevision]       = useState("");
  const [revisionSubmitted, setRevisionSubmitted] = useState(false);
  const [versions, setVersions]       = useState([]);

  // Results
  const [results, setResults]         = useState(null);

  const [connected, setConnected]     = useState(false);
  const [error, setError]             = useState("");
  const [scheduledInfo, setScheduledInfo] = useState(null); // { scheduledAt } when session not yet open

  // Countdown timer (writing) — updates every second
  useEffect(() => {
    if (!phaseEndsAt) { setTimeLeft(null); return; }
    const tick = () => {
      const diff = Math.max(0, Math.floor((new Date(phaseEndsAt) - Date.now()) / 1000));
      setTimeLeft(diff);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [phaseEndsAt]);

  // Reading countdown timer — auto-advance tab 1 → 2 when expires
  useEffect(() => {
    if (!readEndsAt) { setReadTimeLeft(null); return; }
    const tick = () => {
      const diff = Math.max(0, Math.floor((new Date(readEndsAt) - Date.now()) / 1000));
      setReadTimeLeft(diff);
      if (diff === 0) {
        setActiveWritingTab(2);
        setStudentLearnStep("write");
        setArticleRead(true);
        setReadEndsAt(null);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [readEndsAt]);

  // Auto-submit when writing timer expires
  useEffect(() => {
    if (timeLeft !== 0 || submitted || autoSubmittedRef.current) return;
    if (!answer.trim()) return;
    autoSubmittedRef.current = true;
    handleSubmitAnswer();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  // If we arrived from /join/:code, prefill code and name (from logged-in user)
  useEffect(() => {
    const joinCode = location.state?.joinCode;
    if (joinCode && !code) setCode(String(joinCode).toUpperCase());
    if (user?.name && !name) setName(user.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, user]);

  useEffect(() => {
    const token = tokenStorage.get();
    if (!token) {
      setError("You must be logged in to join a session.");
      return;
    }

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Student socket connected:", socket.id);
      setConnected(true);

      // Re-join room on reconnect
      if (joinedRef.current && code && name) {
        console.log("Reconnecting: re-joining session with code:", code);
        socket.emit("student_join", { code: code.toUpperCase(), name }, (res) => {
          if (res?.success) {
            setStudentId(res.studentId);
            setSessionId(res.sessionId);
          }
        });
      }
    });

    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", (e) => {
      console.error("Socket connect_error:", e?.message || e);
      setError(e?.message || "Socket connection failed");
    });

    socket.on("session_info", (payload) => {
      const { question: q, instructions: i, example: ex, videoUrl: v, sessionId: sid,
        selectedSections: ss, currentSectionKey: csk, currentRound: cr, phase: ph,
        evaluationCriteria: ec, docType: dt, level: lv, language: lang,
        articleSections: artSec, missingSection: missSec,
        articleFileUrl: artUrl, articleFileName: artName, articleFileMime: artMime,
        resourceType: rType, activityMode: actMode,
        sectionGuidance: sg, articleTextContent: atc,
        phaseEndsAt: pha,
        sectionTimings: stim } = payload;
      console.log("Received session_info, sessionId:", sid);
      setQuestion(q || "");
      setInstructions(i || "");
      setExample(ex || "");
      setVideoUrl(v);
      if (sid) setSessionId(sid);
      if (Array.isArray(ss)) setSelectedSections(ss);
      const sec = csk || missSec || (ss && ss[0]) || "";
      if (sec) setCurrentSectionKey(sec);
      if (missSec) setMissingSection(missSec);
      if (artSec && typeof artSec === "object") setArticleSections(artSec);
      if (artUrl) setArticleFileUrl(artUrl);
      if (artName) setArticleFileName(artName);
      if (artMime) setArticleFileMime(artMime);
      if (rType) setSessionResourceType(rType);
      if (artUrl) setStudentLearnStep("read");
      if (cr != null) setRound(cr);
      if (ph) setPhase(ph);
      if (ec && typeof ec === "object") setEvaluationCriteria(ec);
      if (dt) setSessionDocType(dt);
      if (lv != null) setSessionLevel(lv || "");
      if (lang != null) setSessionLanguage(lang || "");
      if (sg && typeof sg === "object") setSectionGuidance(sg);
      if (atc) setArticleTextContent(atc);
      if (pha) setPhaseEndsAt(pha);
      if (stim && typeof stim === "object") setSectionTimings(stim);
    });

    socket.on("phase_changed", (data) => {
      const p = data?.phase ?? data;
      console.log("Phase changed to:", p);
      setPhase(p);
      if (data?.currentSectionKey != null) setCurrentSectionKey(data.currentSectionKey);
      if (Array.isArray(data?.selectedSections)) setSelectedSections(data.selectedSections);
      if (data?.currentRound != null) setRound(data.currentRound);
      if (data?.evaluationCriteria && typeof data.evaluationCriteria === "object") {
        setEvaluationCriteria(data.evaluationCriteria);
      }
      if (data?.docType) setSessionDocType(data.docType);
      if (data?.level != null) setSessionLevel(data.level || "");
      if (data?.language != null) setSessionLanguage(data.language || "");
      if (data?.articleSections && typeof data.articleSections === "object") setArticleSections(data.articleSections);
      if (data?.missingSection) setMissingSection(data.missingSection);
      if (data?.articleFileUrl) setArticleFileUrl(data.articleFileUrl);
      if (data?.articleFileName) setArticleFileName(data.articleFileName);
      if (data?.articleFileMime) setArticleFileMime(data.articleFileMime);
      if (data?.resourceType) setSessionResourceType(data.resourceType);
      // Timer
      setPhaseEndsAt(data?.phaseEndsAt || null);
      if (data?.sectionTimings) setSectionTimings(data.sectionTimings);
      if (p === "writing") {
        setSubmitted(false);
        setAnswer("");
        autoSubmittedRef.current = false;
        if (preReadRef.current) {
          // Student already read the article during waiting phase → jump straight to writing
          setArticleRead(true);
          setStudentLearnStep("write");
          setActiveWritingTab(2);
          preReadRef.current = false;
        } else {
          setArticleRead(false);
          setStudentLearnStep("read");
        }
        // Start local reading countdown if configured
        const sk = data?.currentSectionKey || data?.missingSection || "";
        const timings = data?.sectionTimings || {};
        const readMins = Number(timings[sk + "_read"] || 0);
        if (readMins > 0) {
          setReadEndsAt(new Date(Date.now() + readMins * 60 * 1000).toISOString());
        } else {
          setReadEndsAt(null);
        }
      }
      if (p === "review") {
        setReviewSubmitted(false);
        setReviewAssignments([]);
        setReviewIdx(0);
        setReviewPackLoaded(false);
        setPhaseEndsAt(null);
      }
    });

    socket.on("review_assignments", (payload) => {
      const list = payload?.assignments || [];
      setReviewAssignments(list);
      setReviewIdx(0);
      setReviewPackLoaded(true);
      setPeerRatings({ clarity: 0, structure: 0, argumentation: 0, scientific: 0 });
      setPeerComment("");
      setReviewSubmitted(false);
    });

    socket.on("round_changed", ({ round: r, receiver, receiverAnswer: ra }) => {
      setRound(r);
      setReceiverName(receiver?.name || "");
      setReceiverAnswer(ra || "");
      setSubmitted(false);
      setReviewSubmitted(false);
      setRevisionSubmitted(false);
      setAiFeedback(null);
      setRevision("");
    });

    socket.on("ai_feedback", ({ feedback, score }) => {
      console.log("AI feedback received, score:", score);
      setAiFeedback({ feedback, score });
      setAiLoading(false);
    });

    socket.on("results", (payload) => {
      const topAnswer = payload?.bestAnswer ?? payload?.topAnswer;
      const allFeedbacks = payload?.rankings ?? payload?.allFeedbacks;
      setResults({ topAnswer, allFeedbacks, sectionResults: payload });
    });

    socket.on("section_results", (payload) => {
      setResults({ topAnswer: payload?.bestAnswer, allFeedbacks: payload?.rankings, sectionResults: payload });
    });

    socket.on("ai_eval_progress", (payload) => {
      setAiEvalProgress(payload || null);
    });

    socket.on("error", ({ message }) => {
      console.error("Socket error:", message);
      setError(message);
    });

    return () => socket.disconnect();
  }, [code, name]); // keep re-join data current

  // Update isReceiver when studentId changes
  useEffect(() => {
    // nothing needed here, handled in round_changed
  }, [studentId]);

  const handleJoin = () => {
    if (!code.trim() || !name.trim()) return;
    setError(""); setScheduledInfo(null);

    socketRef.current.emit("student_join",
      { code: code.trim().toUpperCase(), name: name.trim() },
      (res) => {
        console.log("student_join response:", res);
        if (res?.success) {
          setJoined(true);
          joinedRef.current = true;
          setStudentId(res.studentId);
          setSessionId(res.sessionId);
        } else if (res?.scheduled) {
          setScheduledInfo({ scheduledAt: res.scheduledAt });
        } else {
          setError(res?.message || "Code invalide. Vérifiez et réessayez.");
        }
      }
    );
  };

  // Auto-join when coming from notifications (/join/:code)
  useEffect(() => {
    const fromInvite = !!location.state?.joinCode;
    if (!fromInvite) return;
    if (!connected) return;
    if (joinedRef.current || joined) return;
    if (!code?.trim() || !name?.trim()) return;
    handleJoin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, code, name, joined, location.state]);

  const handleSubmitAnswer = () => {
    if (!answer.trim()) return;
    const sk = currentSectionKey || selectedSections[0] || "";
    const sectionAnswers = sk ? { [sk]: answer } : {};
    socketRef.current.emit("submit_answer", {
      sessionId,
      studentName: name,
      answer,
      sectionKey: sk,
      sectionAnswers,
    });
    setSubmitted(true);
    setAiLoading(true);
    socketRef.current.emit("request_ai_feedback", { sessionId, studentId, answer, round });
  };

  const handleSubmitReview = () => {
    const cur = reviewAssignments[reviewIdx];
    if (!cur?.revieweeStudentId) {
      socketRef.current.emit("submit_review", {
        sessionId,
        studentName: name,
        ratings: peerRatings,
        comment: peerComment,
        sectionKey: currentSectionKey || selectedSections[0],
      });
      setReviewSubmitted(true);
      return;
    }
    socketRef.current.emit("submit_review", {
      sessionId,
      studentName: name,
      ratings: peerRatings,
      comment: peerComment,
      sectionKey: cur.sectionKey || currentSectionKey || selectedSections[0],
      revieweeStudentId: cur.revieweeStudentId,
    });
    if (reviewIdx + 1 >= reviewAssignments.length) {
      setReviewSubmitted(true);
    } else {
      setReviewIdx(reviewIdx + 1);
      setPeerRatings({ clarity: 0, structure: 0, argumentation: 0, scientific: 0 });
      setPeerComment("");
    }
  };

  const handleSubmitRevision = () => {
    socketRef.current.emit("submit_revision", { sessionId, studentId, round, revision });
    setRevisionSubmitted(true);
    setVersions(prev => [...prev, { round, version: prev.length + 1, text: revision, isRevision: true }]);
  };

  const handleAnswerChange = (e) => {
    const val = e.target.value;
    setAnswer(val);
    setWordCount(val.trim().split(/\s+/).filter(Boolean).length);
  };

  const StarRating = ({ criteriaId, value }) => (
    <div style={styles.stars}>
      {[1, 2, 3, 4, 5].map(n => (
        <span key={n} style={{ ...styles.star, color: n <= value ? "#f59e0b" : "#e2e8f0", cursor: "pointer" }}
          onClick={() => setPeerRatings(prev => ({ ...prev, [criteriaId]: n }))} >★</span>
      ))}
    </div>
  );

  const activeSectionKey = currentSectionKey || missingSection || (selectedSections.length ? selectedSections[0] : "");

  const workflowStep = useMemo(() => {
    if (phase === "waiting") return 1;
    if (phase === "writing" && studentLearnStep === "read") return 1;
    if (phase === "writing" && !submitted) return 2;
    if (phase === "writing" && submitted) return 3;
    if (phase === "review" || phase === "ai" || phase === "results") return 4;
    return 1;
  }, [phase, studentLearnStep, submitted]);

  const hasDocument = Boolean(articleFileUrl) || Object.keys(articleSections).some(k => String(articleSections[k]).trim());

  const handleDownloadArticle = () => {
    downloadSessionArticle({
      question,
      articleFileUrl,
      articleFileName,
      articleSections,
      selectedSections,
      missingSection,
    });
  };

  const sectionCriteriaList = useMemo(() => {
    const raw = evaluationCriteria?.[activeSectionKey];
    if (!Array.isArray(raw)) return [];
    return raw.map(t => String(t).trim()).filter(Boolean);
  }, [evaluationCriteria, activeSectionKey]);

  // Guidance starters: from teacher config or built-in defaults for complex sections
  const BUILTIN_STARTERS = {
    Discussion: ["Ces résultats indiquent que…", "Contrairement à [Auteur, année], nos résultats montrent que…", "Une limite de cette étude réside dans…", "Des recherches futures pourraient explorer…"],
    Méthodes:   ["Cette étude adopte une approche [qualitative/quantitative/mixte]…", "Les participants ont été sélectionnés selon…", "Les données ont été collectées à l'aide de…", "L'analyse a été réalisée avec…"],
    Introduction: ["Dans le domaine de…, il est établi que…", "Cependant, peu d'études ont examiné…", "Cette étude a pour objectif de…"],
    "État de l'Art": ["Les travaux de [Auteur, année] ont montré que…", "Plusieurs approches ont été proposées pour…", "Notre contribution se distingue par…"],
  };
  const activeStarters = sectionGuidance?.[activeSectionKey] ?? BUILTIN_STARTERS[activeSectionKey] ?? [];
  const hasGuidance = sectionCriteriaList.length > 0 || activeStarters.length > 0;

  // ── JOIN SCREEN ──
  if (!joined) return (
    <div style={styles.joinPage}>
      <div style={styles.joinCard}>
        <div style={styles.joinIcon}>🎓</div>
        <h1 style={styles.joinTitle}>Join Session</h1>
        <p style={styles.joinSub}>Enter the code your teacher shared</p>
        {error && <div style={styles.errorBox}>{error}</div>}
        {scheduledInfo && (
          <div style={{ margin: "0 0 16px", padding: "14px 16px", background: "#eef2ff", border: "1.5px solid #c7d2fe", borderRadius: 12, textAlign: "center" }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>📅</div>
            <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "#4f46e5" }}>Session pas encore ouverte</p>
            <p style={{ margin: 0, fontSize: 13, color: "#6366f1" }}>
              Démarrage le <strong>
                {scheduledInfo.scheduledAt
                  ? new Date(scheduledInfo.scheduledAt).toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short" })
                  : "—"}
              </strong>
            </p>
            <p style={{ margin: "8px 0 0", fontSize: 11, color: "#818cf8" }}>Revenez à l'heure prévue pour rejoindre.</p>
          </div>
        )}
        <input style={styles.joinInput} placeholder="Code de session (ex. AB12C)" value={code}
          onChange={e => { setCode(e.target.value.toUpperCase()); setScheduledInfo(null); }} maxLength={6} />
        <input style={styles.joinInput} placeholder="Votre nom complet" value={name}
          onChange={e => setName(e.target.value)} />
        <button style={{ ...styles.joinBtn, opacity: (!code || !name) ? 0.5 : 1 }}
          onClick={handleJoin} disabled={!code || !name}>Rejoindre →</button>
      </div>
    </div>
  );

  // ── WAITING ──
  if (phase === "waiting") return (
    <div style={styles.waitPage}>
      <div style={{ ...styles.waitCard, maxWidth: 780, width: "100%" }}>
        {/* Status bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 6 }}>
          <div style={styles.spinner} />
          <h2 style={{ ...styles.waitTitle, margin: 0 }}>En attente du début de la session…</h2>
        </div>
        <p style={styles.waitSub}>Bonjour <strong>{name}</strong> ! Votre enseignant démarrera la session sous peu.</p>

        <div style={{ textAlign: "left", margin: "24px auto 0" }}>
          <WorkflowBar currentStep={1} />

          {hasDocument && articleFileUrl ? (
            <>
              <div style={styles.readingPreBanner}>
                📖 <strong>Profitez de ce temps</strong> pour lire attentivement l'article complet ci-dessous. Cliquez <em>J'ai lu</em> quand vous avez terminé — vous passerez directement à la rédaction dès le lancement.
              </div>
              <ArticleDocumentPanel
                question={question}
                instructions={instructions}
                articleFileUrl={articleFileUrl}
                articleFileName={articleFileName}
                articleFileMime={articleFileMime}
                articleTextContent={articleTextContent}
                missingSection={missingSection}
                resourceType={sessionResourceType}
                mode="complete"
                onContinue={() => {
                  preReadRef.current = true;
                  setArticleRead(true);
                }}
                continueLabel={articleRead ? "✓ Article lu — En attente du lancement…" : "J'ai lu l'article — Prêt(e) à rédiger →"}
                hideContinue={articleRead}
              />
            </>
          ) : (
            <div style={styles.waitNoDoc}>
              <span style={{ fontSize: 32 }}>⏳</span>
              <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: 14 }}>L'enseignant n'a pas encore joint de document. Le contenu apparaîtra ici dès que la session commence.</p>
            </div>
          )}
        </div>

        <p style={styles.waitDebug}>Session : {sessionId ? "✓ connecté" : "…"} | Phase : {phase}</p>
        <div style={styles.connBadge}>
          <span style={{ ...styles.connDot, background: connected ? "#22c55e" : "#ef4444" }} />
          {connected ? "Connecté" : "Reconnexion…"}
        </div>
      </div>
    </div>
  );

  const insertStarter = (s) => {
    const sep = answer.trim() && !answer.endsWith(" ") ? " " : "";
    const nv = answer + sep + s;
    setAnswer(nv);
    setWordCount(nv.trim().split(/\s+/).filter(Boolean).length);
  };

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.headerTitle}>
            {phase === "writing" ? "✍️ Rédaction Article Scientifique" : "Scientific Writing Workshop"}
          </h1>
          <div style={styles.headerMeta}>
            <span style={styles.nameBadge}>👤 {name}</span>
            {(missingSection || currentSectionKey) && phase === "writing" && (
              <span style={{ ...styles.roundBadge, background: "#ede9fe", color: "#6d28d9" }}>
                Section : {missingSection || currentSectionKey}
              </span>
            )}
          </div>
        </div>
        {phase === "writing" && (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>{wordCount} mot{wordCount !== 1 ? "s" : ""}</span>
            {timeLeft !== null && (
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 14px", borderRadius: 999,
                background: timeLeft <= 60 ? "#fef2f2" : timeLeft <= 300 ? "#fffbeb" : "#eef2ff",
                border: `2px solid ${timeLeft <= 60 ? "#fca5a5" : timeLeft <= 300 ? "#fde68a" : "#c7d2fe"}`,
              }}>
                <span style={{ fontSize: 16 }}>{timeLeft <= 60 ? "🔴" : timeLeft <= 300 ? "🟡" : "⏱"}</span>
                <span style={{
                  fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums",
                  color: timeLeft <= 60 ? "#dc2626" : timeLeft <= 300 ? "#d97706" : "#4338ca",
                }}>
                  {String(Math.floor(timeLeft / 60)).padStart(2, "0")}:{String(timeLeft % 60).padStart(2, "0")}
                </span>
                {timeLeft <= 60 && <span style={{ fontSize: 11, fontWeight: 700, color: "#dc2626" }}>Temps écoulé!</span>}
              </div>
            )}
            <div style={styles.connBadge}>
              <span style={{ ...styles.connDot, background: connected ? "#22c55e" : "#ef4444" }} />
              {connected ? "Connecté" : "Reconnexion…"}
            </div>
          </div>
        )}
      </div>

      {phase !== "writing" && (
        <div style={{ padding: "0 32px", maxWidth: 1200, margin: "0 auto" }}>
          <WorkflowBar currentStep={workflowStep} />
          <PhaseBar phases={ACTIVE_STUDENT_PHASES} currentPhase={phase} readonly />
        </div>
      )}

      <div style={styles.body}>
        {/* ── WRITING PHASE — tab-based design ── */}
        {phase === "writing" && (
          <div style={nw.page}>

            {/* Tab bar */}
            <div style={nw.tabBar}>
              {[
                { t: 1, label: "① Section à apprendre" },
                { t: 2, label: "② Section à rédiger" },
                { t: 3, label: "③ Résultat & feedback IA" },
              ].map(tb => (
                <button key={tb.t} type="button"
                  onClick={() => { setActiveWritingTab(tb.t); if (tb.t === 2) { setStudentLearnStep("write"); setArticleRead(true); } }}
                  style={{ ...nw.tabBtn, fontWeight: activeWritingTab === tb.t ? 700 : 400, color: activeWritingTab === tb.t ? "#1e293b" : "#94a3b8", borderBottom: activeWritingTab === tb.t ? "2.5px solid #8b5cf6" : "2.5px solid transparent" }}>
                  {tb.label}
                </button>
              ))}
            </div>

            {/* ── Tab 1 : Section à apprendre ── */}
            {activeWritingTab === 1 && (
              <div style={nw.tabContent}>
                {/* Reading timer banner */}
                {readTimeLeft !== null && readTimeLeft > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: readTimeLeft <= 60 ? "#fef2f2" : "#fffbeb", border: `1px solid ${readTimeLeft <= 60 ? "#fca5a5" : "#fde68a"}`, borderRadius: 10, marginBottom: 14 }}>
                    <span style={{ fontSize: 18 }}>{readTimeLeft <= 60 ? "🔴" : "⏱"}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: readTimeLeft <= 60 ? "#dc2626" : "#d97706" }}>
                      Temps de lecture : {String(Math.floor(readTimeLeft / 60)).padStart(2, "0")}:{String(readTimeLeft % 60).padStart(2, "0")} — Puis passage automatique à la rédaction
                    </span>
                  </div>
                )}
                <ArticleDocumentPanel
                  question={question}
                  instructions={instructions}
                  articleFileUrl={articleFileUrl}
                  articleFileName={articleFileName}
                  articleFileMime={articleFileMime}
                  articleTextContent={articleTextContent}
                  missingSection={missingSection || activeSectionKey}
                  resourceType={sessionResourceType}
                  mode="complete"
                  onContinue={() => { setActiveWritingTab(2); setStudentLearnStep("write"); setArticleRead(true); setReadEndsAt(null); }}
                  continueLabel="J'ai lu — Passer à la rédaction →"
                />
              </div>
            )}

            {/* ── Tab 2 : Section à compléter ── */}
            {activeWritingTab === 2 && !submitted && (
              <div style={nw.tabContent}>
                {/* Article header */}
                <div style={nw.articleHeader}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>
                      ✍️ Section à apprendre —{" "}
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "#8b5cf6" }}>
                      {missingSection || activeSectionKey}
                    </span>
                    <div style={{ fontSize: 12, color: "#6d28d9", marginTop: 4, background: "#f5f3ff", padding: "5px 10px", borderRadius: 8, display: "inline-block" }}>
                      💡 Lis attentivement l'article (onglet ①), puis complète cette section. Appuie-toi sur les critères à gauche et les amorces de phrases.
                    </div>
                  </div>
                  <div style={nw.sectionBadgeLg}>SECTION À<br/>APPRENDRE</div>
                </div>

                {/* Left col: criteria + starters | Right col: article + inline writing */}
                <div style={nw.exerciseLayout}>

                  {/* Left sidebar */}
                  <div style={nw.exerciseSidebar}>
                    {sectionCriteriaList.length > 0 && (
                      <div style={nw.sideCard}>
                        <div style={nw.sideCardTitle}>À couvrir</div>
                        <ol style={{ paddingLeft: 18, margin: "8px 0 0", display: "flex", flexDirection: "column", gap: 6 }}>
                          {sectionCriteriaList.map((c, i) => (
                            <li key={i} style={{ fontSize: 12, color: "#374151", lineHeight: 1.5 }}>{c}</li>
                          ))}
                        </ol>
                      </div>
                    )}
                    {question && (
                      <div style={nw.sideCard}>
                        <div style={nw.sideCardTitle}>Consigne</div>
                        <p style={{ fontSize: 12, color: "#374151", lineHeight: 1.6, margin: "6px 0 0" }}>{question}</p>
                      </div>
                    )}
                    {/* Teacher-configured starters (kept as quick-access) */}
                    {activeStarters.length > 0 && (
                      <div style={nw.sideCard}>
                        <div style={nw.sideCardTitle}>Amorces du professeur</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                          {activeStarters.map((s, i) => (
                            <div key={i} style={nw.starterCard}>
                              <p style={{ fontSize: 12, color: "#374151", lineHeight: 1.5, margin: 0 }}>{s}</p>
                              <button type="button" style={nw.starterBtn} onClick={() => insertStarter(s)}>+ Ajouter</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* AI Scaffolding panel */}
                    {sessionId && (activeSectionKey || missingSection) && (
                      <ScaffoldingPanel
                        sessionId={sessionId}
                        sectionKey={activeSectionKey || missingSection}
                        onInsert={insertStarter}
                      />
                    )}

                    <div style={{ ...nw.sideCard, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#166534", marginBottom: 6 }}>TU PEUX RELIRE L'ARTICLE COMPLET</div>
                      <button type="button" onClick={() => setActiveWritingTab(1)}
                        style={{ background: "none", border: "none", color: "#6366f1", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                        ← Revenir à l'étape 1
                      </button>
                      <span style={{ fontSize: 11, color: "#64748b" }}> pour comparer la structure avec l'article de référence.</span>
                    </div>
                  </div>

                  {/* Article document + inline writing */}
                  <div style={nw.articleDoc}>
                    {/* Rendered article text */}
                    {articleTextContent?.trim() ? (
                      <div style={nw.articleBody}>
                        {articleTextContent.split("\n").filter(l => l.trim()).map((line, i) => {
                          const t = line.trim();
                          const isHeading = /^\d+[.)]\s+\S/.test(t) && t.length < 90;
                          const isAllCaps = t === t.toUpperCase() && t.length > 3 && t.length < 80 && /[A-Z]{2}/.test(t);
                          if (isHeading) return <h3 key={i} style={nw.articleH3}>{t}</h3>;
                          if (isAllCaps) return <h4 key={i} style={nw.articleH4}>{t}</h4>;
                          return <p key={i} style={nw.articleP}>{t}</p>;
                        })}
                      </div>
                    ) : articleFileUrl ? (
                      <div style={{ padding: "20px 24px", background: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0", marginBottom: 16, textAlign: "center" }}>
                        <p style={{ fontSize: 13, color: "#64748b" }}>
                          L'article est disponible en PDF.{" "}
                          <a href={resolveMediaUrl(articleFileUrl)} target="_blank" rel="noopener noreferrer" style={{ color: "#6366f1", fontWeight: 600 }}>
                            Ouvrir l'article ↗
                          </a>
                        </p>
                      </div>
                    ) : null}

                    {/* Inline writing box */}
                    <div style={nw.inlineWritingBox}>
                      <div style={nw.inlineBadge}>✍️ SECTION À APPRENDRE</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#6d28d9", marginBottom: 4 }}>
                        <span style={{ color: "#8b5cf6" }}>{missingSection || activeSectionKey}</span>
                        {" "}— C'est à toi !
                      </div>
                      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10, lineHeight: 1.5, background: "#faf5ff", padding: "8px 12px", borderRadius: 8, border: "1px solid #e9d5ff" }}>
                        Si tu veux mieux compléter cette section, retourne lire l'article complet dans l'onglet ①. La structure de l'article de référence t'aidera à comprendre ce que doit contenir la section <strong>{missingSection || activeSectionKey}</strong>.
                      </div>
                      <textarea
                        style={nw.writingTextarea}
                        placeholder={`Rédige ici la section ${missingSection || activeSectionKey}. Astuces : (1) utilise la structure de l'article complet comme modèle, (2) sois clair et argumenté, (3) appuie-toi sur les critères à gauche.`}
                        value={answer}
                        onChange={handleAnswerChange}
                        autoFocus
                      />
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, flexWrap: "wrap", gap: 8 }}>
                        <span style={{ fontSize: 11, color: "#94a3b8" }}>{wordCount} mot{wordCount !== 1 ? "s" : ""}</span>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button type="button" style={nw.draftBtn} onClick={() => {/* draft saved locally */}}>
                            💾 Enregistrer le brouillon
                          </button>
                          <button type="button"
                            style={{ ...nw.submitBtn, opacity: answer.trim().length < 10 ? 0.45 : 1 }}
                            disabled={answer.trim().length < 10}
                            onClick={handleSubmitAnswer}>
                            Soumettre ma section ↑
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Tab 3 : Soumission & feedback ── */}
            {(activeWritingTab === 3 || submitted) && (
              <div style={nw.tabContent}>
                {submitted ? (
                  <div style={nw.feedbackWrap}>
                    <div style={nw.submittedBanner}>
                      <span style={nw.checkCircle}>✓</span>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#166534" }}>Section soumise avec succès !</div>
                        <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>{aiLoading ? "Évaluation IA en cours…" : "Évaluation terminée"}</div>
                      </div>
                      {aiLoading && <div style={styles.miniSpinner} />}
                    </div>

                    {aiFeedback && (
                      <div style={nw.aiFeedback}>
                        <div style={nw.aiFeedbackHeader}>
                          <span style={{ fontSize: 15, fontWeight: 700 }}>Évaluation IA</span>
                          {aiFeedback.feedback?.learnlens
                            ? <span style={{ ...nw.scoreChip, background: "#dcfce7", color: "#166534" }}>
                                {aiFeedback.feedback.overallScore}/4
                              </span>
                            : <span style={nw.scoreChip}>{aiFeedback.score}/20</span>
                          }
                        </div>
                        {aiFeedback.feedback?.basic && <p style={{ fontSize: 14, color: "#1e293b", lineHeight: 1.7, margin: "12px 0 0" }}>{aiFeedback.feedback.basic}</p>}

                        {/* ── LearnLens criteria (1–4 scale) ── */}
                        {aiFeedback.feedback?.learnlens?.criteria?.length > 0 && (
                          <div style={{ marginTop: 16 }}>
                            <div style={nw.layerLabel}>Grille d&apos;évaluation — {aiFeedback.feedback.learnlens.section}</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                              {aiFeedback.feedback.learnlens.criteria.map(c => {
                                const pct = ((c.score - 1) / 3) * 100;
                                const color = c.score >= 4 ? "#22c55e" : c.score === 3 ? "#3b82f6" : c.score === 2 ? "#f59e0b" : "#ef4444";
                                return (
                                  <div key={c.id} style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 16px", border: "1px solid #e2e8f0" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                      <span style={{ fontSize: 12, fontWeight: 700, color: "#374151", flex: 1 }}>{c.id}. {c.name}</span>
                                      <span style={{ fontSize: 12, fontWeight: 800, color, marginLeft: 8, whiteSpace: "nowrap" }}>{c.score}/4 — {c.label}</span>
                                    </div>
                                    <div style={{ height: 6, background: "#e2e8f0", borderRadius: 99, overflow: "hidden" }}>
                                      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99, transition: "width 0.6s" }} />
                                    </div>
                                    {c.feedback && <p style={{ fontSize: 12, color: "#475569", margin: "8px 0 0", lineHeight: 1.6 }}>{c.feedback}</p>}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* ── Generic criteria (0–5 scale, legacy) ── */}
                        {!aiFeedback.feedback?.learnlens && aiFeedback.feedback?.criteriaScores && Object.keys(aiFeedback.feedback.criteriaScores).length > 0 && (
                          <div style={{ marginTop: 16 }}>
                            <div style={nw.layerLabel}>Critères détaillés</div>
                            <div style={styles.criteriaGrid}>
                              {Object.entries(aiFeedback.feedback.criteriaScores).map(([key, val]) => {
                                const sc = val?.score;
                                const hasSc = Number.isFinite(sc);
                                return (
                                  <div key={key} style={styles.criteriaScoreCard}>
                                    <div style={styles.criteriaScoreHeader}>
                                      <span style={styles.criteriaScoreLabel}>{val?.label || { clarity: "💡 Clarté", structure: "🏗️ Structure", argumentation: "📣 Argumentation", scientific: "🔬 Scientifique" }[key] || key}</span>
                                      <span style={styles.criteriaScoreValue}>{hasSc ? `${sc}/5` : "—"}</span>
                                    </div>
                                    {hasSc && <div style={styles.criteriaScoreBar}><div style={{ ...styles.criteriaScoreFill, width: `${(sc/5)*100}%`, background: sc>=4?"#22c55e":sc>=3?"#f59e0b":"#ef4444" }} /></div>}
                                    {val?.comment && <p style={styles.criteriaScoreComment}>{val.comment}</p>}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {aiFeedback.feedback?.feedForward?.length > 0 && (
                          <div style={{ marginTop: 14 }}>
                            <div style={nw.layerLabel}>Points à améliorer</div>
                            {aiFeedback.feedback.feedForward.map((t, i) => <div key={i} style={nw.feedItem}>→ {t}</div>)}
                          </div>
                        )}
                        {aiFeedback.feedback?.strengths?.length > 0 && (
                          <div style={{ marginTop: 14 }}>
                            <div style={nw.layerLabel}>Points forts</div>
                            {aiFeedback.feedback.strengths.map((s, i) => <div key={i} style={{ ...nw.feedItem, color: "#166534" }}>✓ {s}</div>)}
                          </div>
                        )}
                        {aiFeedback.feedback?.rewrite && (
                          <div style={{ marginTop: 14 }}>
                            <div style={nw.layerLabel}>Version améliorée suggérée</div>
                            <div style={styles.rewriteBox}>{aiFeedback.feedback.rewrite}</div>
                          </div>
                        )}
                        {!revisionSubmitted ? (
                          <div style={{ marginTop: 20 }}>
                            <div style={nw.layerLabel}>Réviser ma réponse (optionnel)</div>
                            <textarea style={styles.revisionTextarea} placeholder="Révisez votre réponse en tenant compte du feedback…" value={revision} onChange={e => setRevision(e.target.value)} rows={6} />
                            <button style={nw.submitBtn} onClick={handleSubmitRevision} disabled={!revision.trim()}>Soumettre la révision →</button>
                          </div>
                        ) : (
                          <div style={{ marginTop: 12, color: "#166534", fontWeight: 600, fontSize: 13 }}>✅ Révision soumise !</div>
                        )}

                        {/* ── Self-assessment widget ── */}
                        {sessionId && (missingSection || currentSectionKey) && !selfAssessmentDismissed[missingSection || currentSectionKey] && (
                          <SelfAssessmentWidget
                            sessionId={sessionId}
                            sectionKey={missingSection || currentSectionKey}
                            studentName={name}
                            onDismiss={() => setSelfAssessmentDismissed(prev => ({ ...prev, [missingSection || currentSectionKey]: true }))}
                          />
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: 48, color: "#94a3b8", fontSize: 14 }}>
                    Soumettez votre section dans l'onglet <strong>② Section à compléter</strong> pour voir le feedback ici.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── PEER REVIEW PHASE ── */}
        {phase === "review" && (
          <div style={styles.mainCol}>
            {!reviewPackLoaded && !reviewSubmitted ? (
              <div style={styles.doneCard}>
                <div style={styles.spinner} />
                <h3>Loading peer texts…</h3>
                <p style={{ color: "#64748b" }}>Please wait.</p>
              </div>
            ) : reviewAssignments.length === 0 && !reviewSubmitted ? (
              <div style={styles.card}>
                <div style={styles.cardTitle}>👥 Peer Review — Peer's Answer (0/0)</div>
                <div style={styles.peerAnswerBox}>
                  <p style={{ margin: 0, color: "#64748b" }}>
                    Nothing to review yet. You need <strong>at least two submitted answers</strong> for section «{" "}
                    {currentSectionKey || "current"} » to build peer pairs. If only one student submitted, wait for
                    others or ask the teacher to return to the writing phase.
                  </p>
                </div>
              </div>
            ) : reviewAssignments.length > 0 && !reviewSubmitted ? (
              <PhaseReview
                key={reviewAssignments[reviewIdx]?.revieweeStudentId || reviewIdx}
                assignment={reviewAssignments[reviewIdx]}
                reviewIdx={reviewIdx}
                total={reviewAssignments.length}
                peerRatings={peerRatings}
                onRatingChange={setPeerRatings}
                peerComment={peerComment}
                onCommentChange={setPeerComment}
                onSubmit={handleSubmitReview}
                sessionId={sessionId}
                question={question}
                sectionKey={currentSectionKey || selectedSections[0]}
                sectionCriteria={sectionCriteriaList}
                styles={styles}
              />
            ) : isReceiver && reviewAssignments.length === 0 ? (
              <div style={styles.receiverWait}>
                <div style={styles.receiverIcon}>⭐</div>
                <h2>You are the receiver this round!</h2>
                <p>Your peers are reviewing your answer. Please wait...</p>
              </div>
            ) : !reviewSubmitted && receiverName ? (
              <div style={styles.card}>
                <div style={styles.cardTitle}>👥 Peer Review — {receiverName}'s Answer</div>
                <div style={styles.peerAnswerBox}>{receiverAnswer}</div>
                <div style={styles.criteriaSection}>
                  <div style={styles.layerLabel}>Rate each criterion (1–5 ⭐)</div>
                  {CRITERIA.map(c => (
                    <div key={c.id} style={styles.criteriaRow}>
                      <div style={styles.criteriaInfo}>
                        <span style={styles.criteriaEmoji}>{c.emoji}</span>
                        <span style={styles.criteriaName}>{c.label}</span>
                      </div>
                      <StarRating criteriaId={c.id} value={peerRatings[c.id]} />
                    </div>
                  ))}
                </div>
                <label style={styles.label}>Written Comment</label>
                <textarea style={styles.textarea}
                  placeholder="Provide constructive feedback. What was done well? What can be improved?"
                  value={peerComment} onChange={e => setPeerComment(e.target.value)} rows={5} />
                <button style={{ ...styles.submitBtn, opacity: !peerComment.trim() ? 0.5 : 1 }}
                  onClick={handleSubmitReview} disabled={!peerComment.trim()}>Submit Review →</button>
              </div>
            ) : (
              <div style={styles.doneCard}><div style={styles.doneIcon}>✅</div><h3>Review submitted!</h3><p>Waiting for other students...</p></div>
            )}
          </div>
        )}

        {/* ── AI EVALUATION PHASE ── */}
        {phase === "ai" && (
          <div style={styles.mainCol}>
            <div style={styles.doneCard}>
              <div style={styles.spinner} />
              <h3>AI is evaluating all answers...</h3>
              <p>Results will appear shortly.</p>
              {aiEvalProgress && (
                <p style={{ marginTop: 8, color: "#64748b", fontSize: 13 }}>
                  {aiEvalProgress.done}/{aiEvalProgress.total} - {aiEvalProgress.status}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── RESULTS PHASE ── */}
        {phase === "results" && (
          <div style={styles.mainCol}>
            <div style={styles.card}>
              <div style={styles.cardTitle}>
                📊 Résultats de la session
                {results?.sectionResults?.sectionKey && (
                  <span style={{ fontWeight: 500, color: "#6366f1" }}> — {results.sectionResults.sectionKey}</span>
                )}
              </div>
              {(results?.topAnswer || results?.sectionResults?.bestAnswer) && (() => {
                const best = results.topAnswer || results.sectionResults?.bestAnswer;
                const fb   = best?.aiFeedback || {};
                const score = best?.aiScore ?? null;
                const scoreColor = score == null ? "#6366f1" : score >= 15 ? "#22c55e" : score >= 10 ? "#f59e0b" : "#ef4444";
                const levelLabels = { "Excellent (18-20)": "Excellent", "Très bien (15-17)": "Très bien", "Bien (12-14)": "Bien", "Satisfaisant (10-11)": "Satisfaisant", "Insuffisant (6-9)": "Insuffisant", "Faible (0-5)": "Faible" };
                const level = levelLabels[fb.level] || fb.level || "";
                const CRIT_LABELS = { clarity: "💡 Clarté", structure: "🏗️ Structure", argumentation: "📣 Argumentation", scientific: "🔬 Précision scientifique", concision: "✂️ Concision", precision: "🎯 Précision", keywords: "🔑 Mots-clés", formulation: "📝 Formulation", context: "🌐 Contexte/Problème", objective: "🎯 Objectif", method: "🧪 Méthode", results_conclusion: "📊 Résultats/Conclusion", funnel: "🔽 Entonnoir", literature: "📚 Revue de littérature", gap: "🔍 Lacune identifiée", sample: "👥 Participants", instruments: "🛠️ Matériel & Mesures", procedure: "📋 Procédure", analysis: "📐 Analyse statistique", data: "📊 Données", order: "🔢 Ordre logique", objectivity: "⚖️ Objectivité", significance: "📈 Signification stat.", interpretation: "💭 Interprétation", comparison: "🔄 Comparaison littérature", limitations: "⚠️ Limites", implications: "💡 Implications", synthesis: "📝 Synthèse", answer: "✅ Réponse objectif", perspectives: "🔭 Perspectives" };
                const cs = (fb.criteriaScores && typeof fb.criteriaScores === "object") ? fb.criteriaScores : {};
                const criteriaEntries = Object.entries(cs).filter(([, v]) => v && v.score != null);
                return (
                  <div style={{ background: "#fffbeb", borderRadius: 14, border: "1px solid #fde68a", overflow: "hidden", marginBottom: 8 }}>
                    {/* Header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", background: "#fef9c3", borderBottom: "1px solid #fde68a" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 22 }}>🏆</span>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: "#92400e" }}>Meilleure réponse de la session</div>
                          <div style={{ fontSize: 11, color: "#a16207", marginTop: 2 }}>Section : <strong>{results.sectionResults?.sectionKey || activeSectionKey}</strong></div>
                        </div>
                      </div>
                      {score != null && (
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 26, fontWeight: 900, color: scoreColor }}>{score}<span style={{ fontSize: 14, color: "#94a3b8" }}>/20</span></div>
                          {level && <div style={{ fontSize: 11, fontWeight: 700, color: scoreColor, background: scoreColor + "18", padding: "2px 8px", borderRadius: 999 }}>{level}</div>}
                        </div>
                      )}
                    </div>

                    {/* Answer text */}
                    <div style={{ padding: "14px 18px", background: "#fff", borderBottom: "1px solid #fde68a" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#a16207", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Contenu de la réponse</div>
                      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: "#1e293b", whiteSpace: "pre-wrap" }}>{best.content}</p>
                    </div>

                    {/* Reason */}
                    {results?.sectionResults?.bestAnswerReason && (
                      <div style={{ padding: "10px 18px", fontSize: 12, color: "#78350f", lineHeight: 1.6, background: "#fffde7", borderBottom: "1px solid #fde68a" }}>
                        <span style={{ fontWeight: 700 }}>Pourquoi cette réponse ? </span>{results.sectionResults.bestAnswerReason}
                      </div>
                    )}

                    {/* AI assessment */}
                    {fb.basic && (
                      <div style={{ padding: "12px 18px", borderBottom: criteriaEntries.length ? "1px solid #fde68a" : "none" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Évaluation IA</div>
                        <p style={{ margin: 0, fontSize: 13, color: "#78350f", lineHeight: 1.65 }}>{fb.basic}</p>
                      </div>
                    )}

                    {/* Criteria grid */}
                    {criteriaEntries.length > 0 && (
                      <div style={{ padding: "12px 18px", borderBottom: (fb.strengths?.length || fb.weaknesses?.length || fb.feedForward?.length) ? "1px solid #fde68a" : "none" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Détail par critère</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          {criteriaEntries.map(([k, v]) => {
                            const pct = ((v.score || 0) / 5) * 100;
                            const cc = v.score >= 4 ? "#22c55e" : v.score >= 3 ? "#3b82f6" : v.score >= 2 ? "#f59e0b" : "#ef4444";
                            return (
                              <div key={k} style={{ background: "#fff", border: "1px solid #fde68a", borderRadius: 10, padding: "10px 12px" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{v?.label || CRIT_LABELS[k] || k}</span>
                                  <span style={{ fontSize: 13, fontWeight: 800, color: cc }}>{v.score}/5</span>
                                </div>
                                <div style={{ height: 4, background: "#f1f5f9", borderRadius: 99, marginBottom: 6 }}>
                                  <div style={{ height: "100%", width: `${pct}%`, background: cc, borderRadius: 99 }} />
                                </div>
                                {v.comment && <p style={{ margin: 0, fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>{v.comment}</p>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Strengths / Weaknesses / FeedForward */}
                    {(fb.strengths?.length > 0 || fb.weaknesses?.length > 0 || fb.feedForward?.length > 0) && (
                      <div style={{ padding: "12px 18px", display: "grid", gridTemplateColumns: fb.feedForward?.length ? "1fr 1fr 1fr" : "1fr 1fr", gap: 10 }}>
                        {fb.strengths?.length > 0 && (
                          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 12px" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#166534", marginBottom: 6 }}>✓ Points forts</div>
                            <ul style={{ margin: 0, paddingLeft: 14, fontSize: 11, color: "#374151", lineHeight: 1.6 }}>
                              {fb.strengths.map((s, i) => <li key={i}>{s}</li>)}
                            </ul>
                          </div>
                        )}
                        {fb.weaknesses?.length > 0 && (
                          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 12px" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#991b1b", marginBottom: 6 }}>⚠ À améliorer</div>
                            <ul style={{ margin: 0, paddingLeft: 14, fontSize: 11, color: "#374151", lineHeight: 1.6 }}>
                              {fb.weaknesses.map((s, i) => <li key={i}>{s}</li>)}
                            </ul>
                          </div>
                        )}
                        {fb.feedForward?.length > 0 && (
                          <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "10px 12px" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#1e3a8a", marginBottom: 6 }}>→ Feed-forward</div>
                            <ul style={{ margin: 0, paddingLeft: 14, fontSize: 11, color: "#374151", lineHeight: 1.6 }}>
                              {fb.feedForward.map((s, i) => <li key={i}>{s}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
              {versions.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div style={styles.layerLabel}>📈 Your Writing Progress</div>
                  {versions.map((v, i) => (
                    <div key={i} style={styles.versionRow}>
                      <div style={styles.versionBadge}>v{v.version}{v.isRevision ? " (revised)" : ""}</div>
                      <div style={styles.versionText}>{v.text?.slice(0, 80)}...</div>
                      {v.score && <div style={styles.versionScore}>{v.score}/20</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Right Sidebar ── */}
        <div style={styles.sidebar}>
          <div style={styles.sideCard}>
            <div style={styles.sideTitle}>Session Progress</div>
            {ACTIVE_STUDENT_PHASES.map((p, i) => {
              const ci = ACTIVE_STUDENT_PHASES.findIndex(x => x.key === phase);
              const done = ci > i;
              const active = ci === i;
              return (
                <div key={p.key} style={styles.progressRow}>
                  <div style={{ ...styles.progressDot, background: done ? "#22c55e" : active ? "#6366f1" : "#e2e8f0" }}>
                    {done ? "✓" : i + 1}
                  </div>
                  <span style={{ ...styles.progressLabel2, color: active ? "#6366f1" : done ? "#22c55e" : "#94a3b8" }}>
                    {p.label}
                  </span>
                </div>
              );
            })}
          </div>
          {aiFeedback && (
            <div style={{ ...styles.sideCard, borderLeft: "4px solid #6366f1" }}>
              <div style={styles.sideTitle}>Your AI Score</div>
              <div style={styles.bigScore}>{aiFeedback.score}<span style={styles.bigScoreMax}>/20</span></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Workflow & Article styles ──
const workflowStyles = {
  bar: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 16 },
  step: { borderRadius: 12, padding: "10px 12px", border: "2px solid #e2e8f0", textAlign: "center" },
  stepNum: { width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 11, margin: "0 auto 6px" },
  articleCard: { background: "#fff", borderRadius: 16, padding: 20, border: "1px solid #e2e8f0", marginBottom: 16 },
  articleHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 },
  articleBadge: { fontWeight: 800, fontSize: 13, color: "#6366f1" },
  articleHint: { fontSize: 12, color: "#64748b", display: "block", marginTop: 4 },
  downloadBtn: {
    padding: "8px 14px", borderRadius: 8, border: "1px solid #c7d2fe", background: "#eef2ff",
    color: "#4f46e5", fontSize: 12, fontWeight: 700, cursor: "pointer",
  },
  articleSection: { borderRadius: 10, padding: 14, marginBottom: 10 },
  articleSectionHeader: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" },
  levelTag: { fontSize: 10, fontWeight: 600, color: "#64748b", background: "#f1f5f9", borderRadius: 999, padding: "2px 8px" },
  missingTag: { fontSize: 10, fontWeight: 700, color: "#d97706", background: "#fef3c7", borderRadius: 999, padding: "2px 8px" },
  missingBox: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, border: "2px dashed #fbbf24", borderRadius: 10, background: "#fffbeb", gap: 8 },
  articleText: { margin: 0, fontSize: 13, lineHeight: 1.7, color: "#374151", whiteSpace: "pre-wrap" },
};

// ── Styles ──
const styles = {
  page: { minHeight: "100vh", background: "#f8fafc", fontFamily: "'Segoe UI', sans-serif" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 32px", background: "#fff", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 10 },
  headerTitle: { margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: "#0f172a" },
  headerMeta: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  nameBadge: { fontSize: 12, background: "#f1f5f9", color: "#475569", borderRadius: 20, padding: "3px 10px" },
  roundBadge: { fontSize: 12, background: "#eef2ff", color: "#6366f1", borderRadius: 20, padding: "3px 10px", fontWeight: 700 },
  stepBanner: {
    display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
    padding: "12px 16px", background: "#eef2ff", borderRadius: 12, marginBottom: 16,
    fontSize: 14, fontWeight: 600, color: "#3730a3",
  },
  stepBannerNum: {
    width: 28, height: 28, borderRadius: "50%", background: "#6366f1", color: "#fff",
    display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800,
  },
  stepBackLink: {
    marginLeft: "auto", border: "none", background: "transparent", color: "#6366f1",
    fontSize: 12, fontWeight: 600, cursor: "pointer", textDecoration: "underline",
  },
  receiverBadge: { fontSize: 12, background: "#fefce8", color: "#d97706", borderRadius: 20, padding: "3px 10px", fontWeight: 700 },
  phasePill: { background: "#0f172a", color: "#fff", borderRadius: 20, padding: "6px 16px", fontSize: 12, fontWeight: 700, letterSpacing: 1 },
  body: { display: "flex", gap: 24, padding: "24px 32px", maxWidth: 1200, margin: "0 auto" },
  mainCol: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 16 },
  sidebar: { width: 240, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16 },
  joinPage: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #eef2ff 0%, #f0fdf4 100%)" },
  joinCard: { background: "#fff", borderRadius: 20, padding: 40, width: 380, boxShadow: "0 8px 32px rgba(0,0,0,0.1)", textAlign: "center" },
  joinIcon: { fontSize: 48, marginBottom: 16 },
  joinTitle: { margin: "0 0 8px", fontSize: 26, fontWeight: 800, color: "#0f172a" },
  joinSub: { color: "#64748b", fontSize: 14, marginBottom: 24 },
  joinInput: { width: "100%", padding: "12px 16px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 15, marginBottom: 12, boxSizing: "border-box", outline: "none" },
  joinBtn: { width: "100%", padding: "14px 0", background: "#6366f1", color: "#fff", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: "pointer" },
  errorBox: { background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 16 },
  waitPage: { minHeight: "100vh", display: "flex", alignItems: "flex-start", justifyContent: "center", background: "#f8fafc", padding: "40px 16px" },
  waitCard: { textAlign: "center", padding: 40, background: "#fff", borderRadius: 20, boxShadow: "0 4px 24px rgba(0,0,0,0.06)", border: "1px solid #e2e8f0" },
  waitTitle: { fontSize: 20, fontWeight: 700, color: "#1e293b", margin: "16px 0 8px" },
  waitSub: { color: "#64748b", fontSize: 14, marginBottom: 4 },
  waitDebug: { color: "#94a3b8", fontSize: 12, marginTop: 16 },
  readingPreBanner: {
    display: "flex", alignItems: "flex-start", gap: 8,
    padding: "12px 16px", background: "#eff6ff", border: "1px solid #bfdbfe",
    borderRadius: 10, fontSize: 13, color: "#1e40af", lineHeight: 1.55, marginBottom: 14,
  },
  waitNoDoc: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    padding: 32, background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: 12,
    textAlign: "center", gap: 4,
  },
  spinner: { width: 40, height: 40, border: "3px solid #e2e8f0", borderTop: "3px solid #6366f1", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 16px" },
  miniSpinner: { width: 20, height: 20, border: "2px solid #e2e8f0", borderTop: "2px solid #6366f1", borderRadius: "50%", animation: "spin 1s linear infinite", marginLeft: "auto" },
  connBadge: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b", marginTop: 12 },
  connDot: { width: 8, height: 8, borderRadius: "50%", display: "inline-block" },
  questionCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 20 },
  teacherBriefCard: { background: "#fff", border: "1px solid #c7d2fe", borderRadius: 14, padding: 20, borderLeft: "4px solid #6366f1" },
  teacherBriefBadge: { display: "inline-block", fontSize: 11, fontWeight: 700, color: "#6366f1", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 },
  teacherBriefSectionLabel: { fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.6, marginTop: 14, marginBottom: 6 },
  teacherBriefQuestion: { margin: 0, fontSize: 15, color: "#0f172a", lineHeight: 1.65, fontWeight: 600 },
  teacherBriefSectionChip: { display: "inline-block", background: "#ecfdf5", color: "#047857", fontWeight: 700, fontSize: 15, padding: "8px 14px", borderRadius: 10 },
  sectionCriteriaUl: { margin: "4px 0 0", paddingLeft: 20, color: "#334155", fontSize: 14, lineHeight: 1.65 },
  sectionCriteriaLi: { marginBottom: 6 },
  teacherBriefMeta: { marginTop: 14, fontSize: 12, color: "#94a3b8" },
  teacherBriefFallback: { margin: "8px 0 0", fontSize: 13, color: "#64748b", lineHeight: 1.5, fontStyle: "italic" },
  qLabel: { fontSize: 12, fontWeight: 700, color: "#6366f1", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 },
  qText: { fontSize: 16, color: "#1e293b", fontWeight: 600, lineHeight: 1.6, margin: 0 },
  instructionCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 20 },
  instructionTabs: { display: "flex", flexDirection: "column", gap: 16 },
  instrBlock: {},
  instrTitle: { fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 8 },
  instrText: { fontSize: 14, color: "#475569", lineHeight: 1.6, margin: 0 },
  exampleBox: { background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "12px 16px", fontSize: 14, color: "#166534", lineHeight: 1.6 },
  video: { width: "100%", borderRadius: 10, maxHeight: 220 },
  card: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 24 },
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  cardTitle: { fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 16 },
  wordCount: { fontSize: 12, color: "#94a3b8", background: "#f1f5f9", borderRadius: 20, padding: "3px 10px" },
  bigTextarea: { width: "100%", padding: "14px 16px", border: "1.5px solid #e2e8f0", borderRadius: 12, fontSize: 14, lineHeight: 1.7, resize: "vertical", outline: "none", fontFamily: "inherit", boxSizing: "border-box", color: "#1e293b" },
  textarea: { width: "100%", padding: "12px 14px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 14, resize: "vertical", outline: "none", fontFamily: "inherit", boxSizing: "border-box" },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#374151", margin: "16px 0 6px" },
  writingTips: { fontSize: 12, color: "#94a3b8", marginTop: 8, background: "#f8fafc", borderRadius: 8, padding: "8px 12px" },
  submitBtn: { width: "100%", marginTop: 16, padding: "13px 0", background: "#6366f1", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer" },
  submittedBanner: { display: "flex", alignItems: "center", gap: 14, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: "14px 18px", marginBottom: 20 },
  checkIcon: { fontSize: 24, color: "#22c55e" },
  submittedTitle: { fontSize: 15, fontWeight: 700, color: "#166534" },
  submittedSub: { fontSize: 13, color: "#4ade80" },
  aiFeedbackCard: { background: "#fafafa", border: "1px solid #e2e8f0", borderRadius: 14, padding: 20 },
  aiHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  aiTitle: { fontSize: 15, fontWeight: 700, color: "#0f172a" },
  aiScoreBadge: { background: "#6366f1", color: "#fff", borderRadius: 20, padding: "4px 14px", fontSize: 14, fontWeight: 800 },
  feedbackLayer: { marginBottom: 16 },
  layerLabel: { fontSize: 12, fontWeight: 700, color: "#6366f1", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 },
  layerText: { fontSize: 14, color: "#374151", lineHeight: 1.6, margin: 0 },
  correctionRow: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px", marginBottom: 8 },
  correctionOriginal: { fontSize: 13, color: "#dc2626", marginBottom: 6 },
  correctionSuggestion: { fontSize: 13, color: "#059669" },
  rewriteBox: { background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 10, padding: "14px 16px", fontSize: 14, color: "#3730a3", lineHeight: 1.7 },
  revisionTextarea: { width: "100%", padding: "12px 14px", border: "1.5px solid #c7d2fe", borderRadius: 10, fontSize: 14, resize: "vertical", outline: "none", fontFamily: "inherit", boxSizing: "border-box", marginTop: 8 },
  revisionBtn: { marginTop: 10, padding: "10px 20px", background: "#4f46e5", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer" },
  revisionDone: { marginTop: 10, color: "#22c55e", fontWeight: 600, fontSize: 14 },
  peerAnswerBox: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px", fontSize: 14, color: "#374151", lineHeight: 1.7, marginBottom: 20 },
  criteriaSection: { marginBottom: 16 },
  criteriaRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f1f5f9" },
  criteriaInfo: { display: "flex", alignItems: "center", gap: 8 },
  criteriaEmoji: { fontSize: 18 },
  criteriaName: { fontSize: 14, fontWeight: 600, color: "#374151" },
  stars: { display: "flex", gap: 4 },
  star: { fontSize: 24, lineHeight: 1 },
  receiverWait: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 32, textAlign: "center" },
  receiverIcon: { fontSize: 48, marginBottom: 12 },
  doneCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 40, textAlign: "center" },
  doneIcon: { fontSize: 48, marginBottom: 12 },
  topAnswerCard: { background: "linear-gradient(135deg, #fefce8, #fef9c3)", border: "1px solid #fde68a", borderRadius: 14, padding: 20 },
  topAnswerLabel: { fontSize: 13, fontWeight: 700, color: "#d97706", marginBottom: 4 },
  topAnswerAuthor: { fontSize: 12, color: "#92400e", marginBottom: 12 },
  topAnswerText: { fontSize: 14, color: "#1e293b", lineHeight: 1.6, margin: "0 0 12px" },
  topAnswerScore: { fontSize: 14, fontWeight: 700, color: "#d97706" },
  versionRow: { display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #f1f5f9" },
  versionBadge: { background: "#eef2ff", color: "#6366f1", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" },
  versionText: { flex: 1, fontSize: 13, color: "#64748b" },
  versionScore: { fontSize: 13, fontWeight: 700, color: "#6366f1", whiteSpace: "nowrap" },
  sideCard: { background: "#fff", borderRadius: 14, padding: 18, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", border: "1px solid #e2e8f0" },
  sideTitle: { fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14 },
  progressRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 },
  progressDot: { width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0 },
  progressLabel2: { fontSize: 13, fontWeight: 500 },
  bigScore: { fontSize: 42, fontWeight: 900, color: "#6366f1", lineHeight: 1 },
  bigScoreMax: { fontSize: 18, color: "#94a3b8", fontWeight: 400 },
  levelBadge: { fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" },
  criteriaGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  criteriaScoreCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 14px" },
  criteriaScoreHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  criteriaScoreLabel: { fontSize: 13, fontWeight: 600, color: "#374151" },
  criteriaScoreValue: { fontSize: 15, fontWeight: 800, color: "#6366f1" },
  criteriaScoreBar: { height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden", marginBottom: 6 },
  criteriaScoreFill: { height: "100%", borderRadius: 3, transition: "width 0.5s" },
  criteriaScoreComment: { fontSize: 12, color: "#64748b", lineHeight: 1.4, margin: 0 },
  strengthItem: { fontSize: 13, color: "#166534", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "8px 12px", marginBottom: 6, lineHeight: 1.4 },
  weaknessItem: { fontSize: 13, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 12px", marginBottom: 6, lineHeight: 1.4 },
  correctionIssue: { fontSize: 12, color: "#6366f1", marginBottom: 4, fontStyle: "italic" },
  guidanceCard: { background: "#faf5ff", border: "1.5px solid #ddd6fe", borderRadius: 14, padding: 18, marginBottom: 4 },
  guidanceHeader: { display: "flex", alignItems: "center", gap: 8, marginBottom: 14 },
  guidanceTitle: { fontWeight: 700, fontSize: 14, color: "#6d28d9" },
  guidanceSectionLabel: { fontSize: 11, fontWeight: 700, color: "#7c3aed", textTransform: "uppercase", letterSpacing: "0.06em" },
  guidanceCriterionItem: { fontSize: 13, color: "#374151", lineHeight: 1.6, marginBottom: 4 },
  starterChip: {
    padding: "6px 12px", borderRadius: 999, border: "1.5px solid #c4b5fd", background: "#fff",
    color: "#6d28d9", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
    transition: "all .12s", lineHeight: 1.4,
  },

  // Document reading section
  documentSection: {
    background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 20,
    marginBottom: 16, display: "flex", flexDirection: "column", gap: 14,
  },
  documentHeader: {
    display: "flex", alignItems: "flex-start", gap: 12,
  },
  documentTitle: {
    margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "#1e293b",
  },
  documentDesc: {
    margin: "0", fontSize: 14, color: "#64748b", lineHeight: 1.6,
  },
  consultButton: {
    alignSelf: "flex-start", padding: "12px 24px", background: "#6366f1", color: "#fff",
    border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer",
    transition: "all 0.2s", 
  },
};

// ── Editor styles (image-3 inspired) ──
const ed = {
  page: {
    minHeight: "100vh", display: "flex", flexDirection: "column",
    background: "linear-gradient(135deg, #f0f4ff 0%, #f8fafc 100%)",
    fontFamily: "'Segoe UI', sans-serif",
  },
  topBar: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "12px 28px", background: "#fff",
    borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 10,
    boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
  },
  backBtn: {
    border: "1px solid #e2e8f0", background: "#fff", color: "#64748b",
    padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit",
  },
  topTitle: { fontSize: 16, fontWeight: 700, color: "#0f172a" },
  wordBadge: {
    background: "#eef2ff", color: "#6366f1", borderRadius: 20,
    padding: "4px 12px", fontSize: 12, fontWeight: 700,
  },
  tabsBar: {
    display: "flex", gap: 0, padding: "0 28px",
    background: "#fff", borderBottom: "1px solid #e2e8f0", overflowX: "auto",
  },
  tab: {
    display: "flex", alignItems: "center", gap: 7,
    padding: "12px 18px", fontSize: 13, cursor: "default",
    whiteSpace: "nowrap", transition: "all .15s", userSelect: "none",
  },
  body: {
    display: "grid",
    gridTemplateColumns: "240px 1fr 280px",
    gap: 0, flex: 1, overflow: "hidden",
    maxHeight: "calc(100vh - 110px)",
  },
  leftPanel: {
    padding: "24px 20px", background: "#fff",
    borderRight: "1px solid #e2e8f0", overflowY: "auto",
  },
  panelLabel: {
    fontSize: 10, fontWeight: 800, color: "#94a3b8",
    textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8,
  },
  consignText: { fontSize: 13, color: "#334155", lineHeight: 1.7, margin: 0 },
  criterionItem: {
    fontSize: 12, color: "#475569", lineHeight: 1.65,
    paddingLeft: 2,
  },
  centerPanel: {
    display: "flex", flexDirection: "column", padding: "24px 28px",
    background: "#f8fafc", overflowY: "auto",
  },
  sectionHeading: {
    display: "flex", alignItems: "baseline", gap: 0,
    marginBottom: 16, paddingBottom: 12,
    borderBottom: "1px solid #e2e8f0",
  },
  textarea: {
    flex: 1, width: "100%", padding: "18px 20px",
    border: "1.5px solid #e2e8f0", borderRadius: 14,
    fontSize: 15, lineHeight: 1.8, color: "#1e293b",
    resize: "none", outline: "none", fontFamily: "inherit",
    background: "#fff", boxSizing: "border-box",
    minHeight: "calc(100vh - 340px)",
    boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
    transition: "border-color .15s",
  },
  footer: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    marginTop: 14, gap: 12, flexWrap: "wrap",
  },
  footerHint: { fontSize: 12, color: "#94a3b8", flex: 1 },
  submitBtn: {
    padding: "12px 28px", background: "#6366f1", color: "#fff",
    border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700,
    cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
    boxShadow: "0 4px 14px rgba(99,102,241,0.3)",
    transition: "all .15s",
  },
  rightPanel: {
    padding: "24px 18px", background: "#fff",
    borderLeft: "1px solid #e2e8f0", overflowY: "auto",
  },
  starterCard: {
    background: "linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%)",
    border: "1px solid #ddd6fe", borderRadius: 12, padding: "12px 14px",
  },
  starterText: {
    fontSize: 13, color: "#3730a3", lineHeight: 1.55,
    margin: "0 0 10px", fontStyle: "italic",
  },
  starterBtn: {
    width: "100%", padding: "8px 0", background: "#6366f1", color: "#fff",
    border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700,
    cursor: "pointer", fontFamily: "inherit",
  },
};

// ── New writing interface styles (tab-based design) ──
const nw = {
  page:         { display: "flex", flexDirection: "column", gap: 0, background: "#f1f5f9", minHeight: "100vh", fontFamily: "'Segoe UI', sans-serif" },
  progressCard: { background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "20px 32px" },
  progressTitle:{ fontSize: 10, fontWeight: 800, color: "#94a3b8", letterSpacing: "0.12em", marginBottom: 14 },
  progressSteps:{ display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap" },
  progressStep: { display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderRadius: 14, minWidth: 160, flex: "0 0 auto" },
  progressNum:  { width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, flexShrink: 0 },
  progressArrow:{ fontSize: 22, color: "#d1d5db", margin: "0 8px", userSelect: "none" },
  tabBar:       { background: "#fff", borderBottom: "1px solid #e2e8f0", display: "flex", gap: 0, padding: "0 32px" },
  tabBtn:       { padding: "14px 20px", background: "none", border: "none", fontSize: 13, cursor: "pointer", fontFamily: "inherit", transition: "all .15s" },
  tabContent:   { maxWidth: 1100, width: "100%", margin: "0 auto", padding: "24px 20px" },
  articleHeader:{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff", borderRadius: 12, padding: "14px 20px", marginBottom: 16, border: "1px solid #e2e8f0", flexWrap: "wrap", gap: 10 },
  sectionBadgeLg:{ background: "#f59e0b", color: "#fff", fontWeight: 800, fontSize: 11, padding: "8px 14px", borderRadius: 8, textAlign: "center", lineHeight: 1.4, letterSpacing: "0.04em", border: "2px dashed #fbbf24" },
  exerciseLayout:{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 20 },
  exerciseSidebar:{ display: "flex", flexDirection: "column", gap: 12 },
  sideCard:     { background: "#fff", borderRadius: 12, padding: "14px 16px", border: "1px solid #e2e8f0" },
  sideCardTitle:{ fontSize: 10, fontWeight: 800, color: "#f59e0b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 },
  starterCard:  { background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 8, padding: "10px 12px" },
  starterBtn:   { padding: "4px 10px", background: "#8b5cf6", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", marginTop: 6 },
  articleDoc:   { background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", overflow: "hidden" },
  articleBody:  { padding: "28px 32px", maxHeight: 600, overflowY: "auto" },
  articleH3:    { fontSize: 16, fontWeight: 700, color: "#1e293b", margin: "20px 0 8px", lineHeight: 1.4 },
  articleH4:    { fontSize: 14, fontWeight: 700, color: "#374151", margin: "14px 0 6px", lineHeight: 1.4, textTransform: "uppercase", letterSpacing: "0.05em" },
  articleP:     { fontSize: 14, color: "#374151", lineHeight: 1.8, margin: "0 0 10px" },
  inlineWritingBox: { borderTop: "3px dashed #f59e0b", padding: "20px 28px 24px", background: "#fffbeb" },
  inlineBadge:  { display: "inline-block", background: "#f59e0b", color: "#fff", fontWeight: 800, fontSize: 10, padding: "4px 10px", borderRadius: 6, letterSpacing: "0.08em", marginBottom: 10 },
  writingTextarea:{ width: "100%", boxSizing: "border-box", minHeight: 160, padding: "12px 14px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 14, fontFamily: "Georgia, serif", lineHeight: 1.8, resize: "vertical", outline: "none", color: "#1e293b", background: "#fff" },
  submitBtn:    { padding: "11px 24px", background: "#6366f1", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
  draftBtn:     { padding: "10px 18px", background: "#fff", color: "#64748b", border: "1.5px solid #e2e8f0", borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
  feedbackWrap: { display: "flex", flexDirection: "column", gap: 16 },
  submittedBanner:{ display: "flex", alignItems: "center", gap: 14, padding: "18px 22px", background: "#dcfce7", border: "1px solid #86efac", borderRadius: 14 },
  checkCircle:  { width: 36, height: 36, borderRadius: "50%", background: "#16a34a", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18, flexShrink: 0 },
  aiFeedback:   { background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", padding: "20px 24px" },
  aiFeedbackHeader:{ display: "flex", justifyContent: "space-between", alignItems: "center" },
  scoreChip:    { padding: "4px 14px", background: "#6366f1", color: "#fff", borderRadius: 20, fontWeight: 800, fontSize: 14 },
  layerLabel:   { fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 },
  feedItem:     { fontSize: 13, color: "#374151", lineHeight: 1.6, padding: "4px 0", borderLeft: "3px solid #e2e8f0", paddingLeft: 10, marginBottom: 4 },
};

// import { useState, useEffect, useRef, useCallback } from "react";
// import { io } from "socket.io-client";

// const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
// const WS  = import.meta.env.VITE_API_URL?.replace("/api","") || "http://localhost:5000";

// const PHASES = { JOIN: "join", WRITING: "writing", REVIEW: "review", AI: "ai", RESULTS: "results" };

// const SECTIONS_ARTICLE = [
//   { id: "introduction", label: "Introduction",  letter: "I", color: "#22c55e", hint: "Contexte général, gap identifié, question de recherche, justification de l'originalité" },
//   { id: "methodes",     label: "Méthodes",      letter: "M", color: "#3b82f6", hint: "Design de l'étude, collecte de données, outils d'analyse, reproductibilité" },
//   { id: "resultats",    label: "Résultats",     letter: "R", color: "#f59e0b", hint: "Données objectives, tableaux/figures, réponse à la question, résultats principaux vs secondaires" },
//   { id: "discussion",   label: "Discussion",    letter: "D", color: "#ef4444", hint: "Interprétation, comparaison avec la littérature, limites, perspectives" },
//   { id: "conclusion",   label: "Conclusion",    letter: "C", color: "#a855f7", hint: "Réponse à la question initiale, synthèse des apports, pistes futures" },
// ];

// const SECTIONS_MEMOIRE = [
//   { id: "introduction", label: "Introduction",    letter: "I", color: "#22c55e", hint: "Contexte, problématique, objectifs, plan du mémoire" },
//   { id: "etat_art",     label: "État de l'Art",   letter: "E", color: "#06b6d4", hint: "Revue de littérature, analyse critique, lacunes, positionnement" },
//   { id: "conception",   label: "Conception",       letter: "C", color: "#3b82f6", hint: "Architecture, diagrammes UML, choix technologiques, modélisation BDD" },
//   { id: "realisation",  label: "Réalisation",      letter: "R", color: "#f59e0b", hint: "Environnement, captures d'écran, fonctionnalités, tests" },
//   { id: "conclusion",   label: "Conclusion",       letter: "C", color: "#a855f7", hint: "Bilan, objectifs atteints, difficultés, perspectives" },
// ];

// function getSections(docType) {
//   if (docType === "memoire") return SECTIONS_MEMOIRE;
//   if (docType === "hybride") return [...SECTIONS_ARTICLE, ...SECTIONS_MEMOIRE.filter(s => !SECTIONS_ARTICLE.find(a => a.id === s.id))];
//   return SECTIONS_ARTICLE;
// }

// function scoreColor(score, max = 5) {
//   const pct = score / max;
//   if (pct >= 0.8) return "#10b981";
//   if (pct >= 0.6) return "#f59e0b";
//   return "#ef4444";
// }

// function StarRating({ value, onChange, readonly = false }) {
//   const [hover, setHover] = useState(0);
//   return (
//     <div style={{ display: "flex", gap: 4 }}>
//       {[1,2,3,4,5].map(n => (
//         <span key={n} onClick={() => !readonly && onChange(n)} onMouseEnter={() => !readonly && setHover(n)} onMouseLeave={() => !readonly && setHover(0)} style={{ fontSize: 22, cursor: readonly ? "default" : "pointer", color: n <= (hover || value) ? "#f59e0b" : "#d1d5db", transition: "color 0.15s" }}>★</span>
//       ))}
//     </div>
//   );
// }

// function PhaseBar({ phase }) {
//   const steps = [
//     { id: PHASES.WRITING, label: "Writing" },
//     { id: PHASES.REVIEW,  label: "Peer Review" },
//     { id: PHASES.AI,      label: "AI Eval" },
//     { id: PHASES.RESULTS, label: "Results" },
//   ];
//   const active = steps.findIndex(s => s.id === phase);
//   return (
//     <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 28 }}>
//       {steps.map((s, i) => {
//         const done = i < active, current = i === active;
//         return (
//           <div key={s.id} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : "none" }}>
//             <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
//               <div style={{ width: 28, height: 28, borderRadius: "50%", background: done ? "#6366f1" : current ? "#818cf8" : "#e5e7eb", border: current ? "2px solid #6366f1" : "2px solid transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: done || current ? "#fff" : "#9ca3af", boxShadow: current ? "0 0 0 4px #e0e7ff" : "none", transition: "all 0.3s" }}>{done ? "✓" : i + 1}</div>
//               <span style={{ fontSize: 11, fontWeight: current ? 700 : 400, color: current ? "#6366f1" : done ? "#374151" : "#9ca3af", whiteSpace: "nowrap" }}>{s.label}</span>
//             </div>
//             {i < steps.length - 1 && <div style={{ flex: 1, height: 2, margin: "0 6px", marginBottom: 18, background: done ? "#6366f1" : "#e5e7eb", transition: "background 0.4s" }} />}
//           </div>
//         );
//       })}
//     </div>
//   );
// }

// function WaitingScreen({ message = "En attente du professeur…" }) {
//   return (
//     <div style={{ textAlign: "center", padding: "60px 20px" }}>
//       <div style={{ width: 56, height: 56, borderRadius: "50%", border: "3px solid #e5e7eb", borderTop: "3px solid #6366f1", margin: "0 auto 20px", animation: "spin 1s linear infinite" }} />
//       <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
//       <p style={{ color: "#6b7280", fontSize: 15 }}>{message}</p>
//     </div>
//   );
// }

// function AiFeedbackCard({ section, sectionDef }) {
//   const [open, setOpen] = useState(true);
//   const score = section.score ?? null;
//   const color = sectionDef?.color || "#6366f1";
//   const letter = sectionDef?.letter || "?";
//   return (
//     <div style={{ background: "#fff", borderRadius: 14, marginBottom: 14, overflow: "hidden", border: "1px solid #e5e7eb", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
//       <div onClick={() => setOpen(o => !o)} style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", background: open ? "#fafafa" : "#fff", borderBottom: open ? "1px solid #f3f4f6" : "none", borderLeft: `4px solid ${color}` }}>
//         <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
//           <span style={{ width: 26, height: 26, borderRadius: 7, background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}>{letter}</span>
//           <span style={{ fontWeight: 700, fontSize: 14, color: "#1f2937" }}>{section.label}</span>
//           {score !== null && <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 10px", background: scoreColor(score) + "18", color: scoreColor(score), borderRadius: 20 }}>{score}/5</span>}
//         </div>
//         <span style={{ color: "#9ca3af", fontSize: 14 }}>▾</span>
//       </div>
//       {open && (
//         <div style={{ padding: "16px 18px" }}>
//           {score !== null && <div style={{ marginBottom: 14 }}><div style={{ height: 6, background: "#f3f4f6", borderRadius: 3, overflow: "hidden" }}><div style={{ height: "100%", borderRadius: 3, width: `${(score / 5) * 100}%`, background: `linear-gradient(90deg, ${color}, ${color}bb)`, transition: "width 0.6s ease" }} /></div></div>}
//           {section.strengths?.length > 0 && <div style={{ marginBottom: 14 }}><div style={{ fontSize: 12, fontWeight: 700, color: "#10b981", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>✓ Points forts</div>{section.strengths.map((s, i) => <div key={i} style={{ fontSize: 13, color: "#374151", lineHeight: 1.7, display: "flex", gap: 8, marginBottom: 4 }}><span style={{ color: "#10b981" }}>·</span><span>{s}</span></div>)}</div>}
//           {section.weaknesses?.length > 0 && <div style={{ marginBottom: 14 }}><div style={{ fontSize: 12, fontWeight: 700, color: "#ef4444", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>✗ Points à améliorer</div>{section.weaknesses.map((w, i) => <div key={i} style={{ fontSize: 13, color: "#374151", lineHeight: 1.7, display: "flex", gap: 8, marginBottom: 4 }}><span style={{ color: "#ef4444" }}>·</span><span>{w}</span></div>)}</div>}
//           {section.suggestion && <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "12px 14px" }}><div style={{ fontSize: 12, fontWeight: 700, color: "#3b82f6", marginBottom: 6 }}>💡 Suggestion</div><div style={{ fontSize: 13, color: "#1e40af", lineHeight: 1.7 }}>{section.suggestion}</div></div>}
//           {!section.strengths && !section.weaknesses && section.text && <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.7, margin: 0 }}>{section.text}</p>}
//         </div>
//       )}
//     </div>
//   );
// }

// // ─── MAIN ────────────────────────────────────────────────────────────────────
// export default function StudentSession() {
//   const [phase, setPhase] = useState(PHASES.JOIN);
//   const [sessionCode, setSessionCode] = useState("");
//   const [studentName, setStudentName] = useState("");
//   const [sessionId, setSessionId] = useState(null);
//   const [question, setQuestion] = useState("");
//   const [instructions, setInstructions] = useState("");
//   const [videoUrl, setVideoUrl] = useState(null);
//   const [docType, setDocType] = useState("article");
//   const [sectionAnswers, setSectionAnswers] = useState({});
//   const [submitted, setSubmitted] = useState(false);
//   const [activeSection, setActiveSection] = useState("");

//   const [peerAnswer, setPeerAnswer] = useState("");
//   const [peerName, setPeerName] = useState("");
//   const [peerCriteria, setPeerCriteria] = useState([]);
//   const [peerRatings, setPeerRatings] = useState({});
//   const [peerComment, setPeerComment] = useState("");
//   const [reviewSubmitted, setReviewSubmitted] = useState(false);

//   const [aiFeedback, setAiFeedback] = useState(null);
//   const [aiLoading, setAiLoading] = useState(false);
//   const [aiRaw, setAiRaw] = useState("");
//   const [results, setResults] = useState(null);
//   const [error, setError] = useState("");
//   const [joinLoading, setJoinLoading] = useState(false);

//   const socketRef = useRef(null);
//   const token = localStorage.getItem("edulearn_token");
//   const currentSections = getSections(docType);

//   // Set default active section
//   useEffect(() => {
//     if (currentSections.length > 0 && !activeSection) {
//       setActiveSection(currentSections[0].id);
//     }
//   }, [currentSections, activeSection]);

//   // ── SOCKET ──────────────────────────────────────────────────────────────────
//   useEffect(() => {
//     if (!sessionId) return;
//     const socket = io(WS, { auth: { token } });
//     socketRef.current = socket;

//     socket.emit("join_session", { sessionId, studentName });

//     // FIX: Listen for ALL possible phase event names the teacher might emit
//     const handlePhase = (data) => {
//       console.log("[Student] phase event:", data);
//       // data could be a string like "review" or an object like { phase: "review" }
//       const p = typeof data === "string" ? data : (data.phase || data);
//       setPhase(p);
//       if (p === "review" || p === PHASES.REVIEW) {
//         setPeerAnswer(data?.peerAnswer || "");
//         setPeerName(data?.peerName || "");
//         setPeerCriteria(data?.criteria || []);
//         setReviewSubmitted(false);
//       }
//       if (p === "ai" || p === PHASES.AI) setAiLoading(true);
//     };

//     socket.on("phase_changed", handlePhase);
//     socket.on("advance_phase", handlePhase);

//     socket.on("ai_feedback_ready", ({ feedback, raw }) => {
//       setAiLoading(false);
//       setAiRaw(raw || "");
//       try {
//         if (typeof feedback === "object" && feedback !== null) setAiFeedback(feedback);
//         else { setAiFeedback(null); setAiRaw(raw || String(feedback)); }
//       } catch { setAiFeedback(null); setAiRaw(raw || String(feedback)); }
//     });

//     socket.on("session_results", (data) => { setResults(data); setPhase(PHASES.RESULTS); });

//     return () => socket.disconnect();
//   }, [sessionId]);

//   // ── Stable textarea handler ─────────────────────────────────────────────────
//   const handleSectionChange = useCallback((sectionId, value) => {
//     setSectionAnswers(prev => ({ ...prev, [sectionId]: value }));
//   }, []);

//   // ── Computed ────────────────────────────────────────────────────────────────
//   const totalWords = Object.values(sectionAnswers).reduce((s, t) => s + (t?.trim() ? t.trim().split(/\s+/).length : 0), 0);
//   const filledSections = Object.values(sectionAnswers).filter(v => v?.trim()).length;
//   const canSubmit = filledSections > 0;

//   // ── JOIN ─────────────────────────────────────────────────────────────────────
//   const handleJoin = async () => {
//     if (!sessionCode.trim() || !studentName.trim()) { setError("Remplis tous les champs."); return; }
//     setJoinLoading(true); setError("");
//     try {
//       const res = await fetch(`${API}/sessions/join`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
//         body: JSON.stringify({ code: sessionCode.toUpperCase(), studentName }),
//       });
//       const data = await res.json();
//       if (!res.ok) throw new Error(data.message || "Code invalide");
//       setSessionId(data.sessionId);
//       setQuestion(data.question || "");
//       setInstructions(data.instructions || "");
//       setVideoUrl(data.videoUrl || null);
//       setDocType(data.sessionConfig?.docType || "article");
//       setPhase(PHASES.WRITING);
//     } catch (e) { setError(e.message); }
//     setJoinLoading(false);
//   };

//   // ── SUBMIT ───────────────────────────────────────────────────────────────────
//   const handleSubmitAnswer = async () => {
//     const fullAnswer = currentSections.map(s => {
//       const text = (sectionAnswers[s.id] || "").trim();
//       return text ? `[${s.label}]\n${text}` : "";
//     }).filter(Boolean).join("\n\n");
//     if (!fullAnswer.trim()) return;
//     try {
//       await fetch(`${API}/sessions/${sessionId}/submit`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
//         body: JSON.stringify({ answer: fullAnswer, studentName, sectionAnswers }),
//       });
//       setSubmitted(true);
//       if (socketRef.current) socketRef.current.emit("submit_answer", { sessionId, studentName, answer: fullAnswer, sectionAnswers });
//     } catch (e) { setError("Erreur lors de la soumission."); }
//   };

//   const handleSubmitReview = async () => {
//     try {
//       await fetch(`${API}/sessions/${sessionId}/peer-review`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
//         body: JSON.stringify({ ratings: peerRatings, comment: peerComment, studentName }),
//       });
//       setReviewSubmitted(true);
//       if (socketRef.current) socketRef.current.emit("submit_review", { sessionId, studentName, ratings: peerRatings, comment: peerComment });
//     } catch (e) { setError("Erreur lors de l'envoi du peer review."); }
//   };

//   const parsedSections = aiFeedback?.sections || [];
//   const globalScore = aiFeedback?.globalScore ?? null;
//   const globalComment = aiFeedback?.globalComment ?? "";
//   const Card = ({ children, style = {} }) => <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 24, boxShadow: "0 2px 8px rgba(0,0,0,0.05)", ...style }}>{children}</div>;
//   const docLabel = docType === "memoire" ? "Mémoire PFE" : docType === "hybride" ? "Hybride" : "Article IMRAD";
//   const docIcon = docType === "memoire" ? "🎓" : docType === "hybride" ? "🔀" : "📄";

//   // ═══ JOIN SCREEN ═══════════════════════════════════════════════════════════
//   if (phase === PHASES.JOIN) return (
//     <div style={{ minHeight: "100vh", background: "#f5f3ff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans','Segoe UI',sans-serif", padding: 20 }}>
//       <div style={{ background: "#fff", borderRadius: 20, padding: "40px 36px", width: "100%", maxWidth: 420, boxShadow: "0 8px 40px rgba(99,102,241,0.12)", border: "1px solid #e0e7ff" }}>
//         <div style={{ textAlign: "center", marginBottom: 28 }}>
//           <div style={{ fontSize: 44, marginBottom: 10 }}>🎓</div>
//           <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#1f2937" }}>Join Session</h2>
//           <p style={{ margin: "6px 0 0", color: "#6b7280", fontSize: 14 }}>Enter the code your teacher shared</p>
//         </div>
//         {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px", marginBottom: 16, color: "#dc2626", fontSize: 13 }}>{error}</div>}
//         <input value={sessionCode} onChange={e => setSessionCode(e.target.value.toUpperCase())} placeholder="Session Code (e.g. AB12C)" maxLength={6} style={inputStyle} onKeyDown={e => e.key === "Enter" && handleJoin()} />
//         <input value={studentName} onChange={e => setStudentName(e.target.value)} placeholder="Your full name" style={{ ...inputStyle, marginTop: 10 }} onKeyDown={e => e.key === "Enter" && handleJoin()} />
//         <button onClick={handleJoin} disabled={joinLoading || !sessionCode.trim() || !studentName.trim()} style={{ width: "100%", marginTop: 18, padding: "14px", background: joinLoading ? "#a5b4fc" : "linear-gradient(135deg,#6366f1,#8b5cf6)", border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
//           {joinLoading ? "Joining…" : "Join →"}
//         </button>
//       </div>
//     </div>
//   );

//   // ═══ MAIN SESSION ══════════════════════════════════════════════════════════
//   return (
//     <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
//       <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
//         <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
//           <div style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", borderRadius: 8, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#fff" }}>L</div>
//           <span style={{ fontWeight: 700, fontSize: 15, color: "#1f2937" }}>LearnLens</span>
//         </div>
//         <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
//           <span style={{ fontSize: 12, color: "#6366f1", fontWeight: 700, background: "#eef2ff", padding: "4px 10px", borderRadius: 20 }}>{docIcon} {docLabel}</span>
//           <span style={{ fontSize: 13, color: "#6b7280" }}>👤 {studentName}</span>
//         </div>
//       </div>

//       <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 20px 60px" }}>
//         {phase !== PHASES.JOIN && <PhaseBar phase={phase} />}

//         {question && phase !== PHASES.RESULTS && (
//           <div style={{ background: "linear-gradient(135deg,#eef2ff,#f0fdf4)", border: "1px solid #c7d2fe", borderRadius: 12, padding: "14px 18px", marginBottom: 22 }}>
//             <div style={{ fontSize: 11, fontWeight: 700, color: "#6366f1", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Question</div>
//             <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#1f2937", lineHeight: 1.6 }}>{question}</p>
//             {instructions && <p style={{ margin: "8px 0 0", fontSize: 13, color: "#4b5563", lineHeight: 1.6 }}>{instructions}</p>}
//           </div>
//         )}

//         {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px", marginBottom: 16, color: "#dc2626", fontSize: 13 }}>{error}</div>}

//         {/* ── WRITING ─────────────────────────────────────────────────────── */}
//         {phase === PHASES.WRITING && (
//           <Card>
//             {videoUrl && (
//               <div style={{ marginBottom: 18 }}>
//                 <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>📽 Vidéo</div>
//                 <video src={`${WS}${videoUrl}`} controls style={{ width: "100%", borderRadius: 10, border: "1px solid #e5e7eb" }} />
//               </div>
//             )}

//             {!submitted ? (
//               <>
//                 <div style={{ marginBottom: 16 }}>
//                   <label style={{ fontSize: 15, fontWeight: 700, color: "#374151" }}>✍️ Votre réponse — {docIcon} {docLabel}</label>
//                 </div>

//                 {/* Section tabs — INLINE (no child component = no re-render bug) */}
//                 <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
//                   {currentSections.map(s => {
//                     const isActive = activeSection === s.id;
//                     const hasContent = (sectionAnswers[s.id] || "").trim().length > 0;
//                     return (
//                       <button key={s.id} onClick={() => setActiveSection(s.id)} style={{
//                         display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, cursor: "pointer",
//                         border: isActive ? `2px solid ${s.color}` : "2px solid #e5e7eb",
//                         background: isActive ? `${s.color}0d` : hasContent ? "#f0fdf4" : "#fff",
//                       }}>
//                         <span style={{ width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, background: isActive ? s.color : hasContent ? "#22c55e" : "#e5e7eb", color: isActive || hasContent ? "#fff" : "#9ca3af" }}>
//                           {hasContent && !isActive ? "✓" : s.letter}
//                         </span>
//                         <span style={{ fontSize: 13, fontWeight: isActive ? 700 : 500, color: isActive ? s.color : hasContent ? "#374151" : "#6b7280" }}>{s.label}</span>
//                       </button>
//                     );
//                   })}
//                 </div>

//                 {/* Active section editor */}
//                 {(() => {
//                   const s = currentSections.find(sec => sec.id === activeSection);
//                   if (!s) return null;
//                   const words = (sectionAnswers[s.id] || "").trim() ? (sectionAnswers[s.id] || "").trim().split(/\s+/).length : 0;
//                   return (
//                     <div key={s.id}>
//                       <div style={{ background: `${s.color}08`, border: `1px solid ${s.color}25`, borderRadius: 10, padding: "10px 14px", marginBottom: 12, display: "flex", alignItems: "flex-start", gap: 10 }}>
//                         <span style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0, background: s.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800 }}>{s.letter}</span>
//                         <div>
//                           <div style={{ fontSize: 13, fontWeight: 700, color: s.color, marginBottom: 2 }}>{s.label}</div>
//                           <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>{s.hint}</div>
//                         </div>
//                       </div>
//                       <div style={{ position: "relative" }}>
//                         <textarea
//                           value={sectionAnswers[s.id] || ""}
//                           onChange={e => handleSectionChange(s.id, e.target.value)}
//                           placeholder={`Rédigez la partie "${s.label}" ici…`}
//                           rows={10}
//                           style={{ width: "100%", boxSizing: "border-box", padding: 14, borderRadius: 10, border: `1.5px solid ${s.color}40`, fontSize: 14, lineHeight: 1.8, color: "#1f2937", resize: "vertical", outline: "none", fontFamily: "inherit" }}
//                         />
//                         <span style={{ position: "absolute", bottom: 10, right: 14, fontSize: 11, color: words < 5 ? "#ef4444" : "#10b981", background: "#fff", padding: "2px 6px", borderRadius: 6 }}>{words} mots</span>
//                       </div>
//                     </div>
//                   );
//                 })()}

//                 {/* Progress */}
//                 <div style={{ marginTop: 16, background: "#f9fafb", border: "1px solid #f3f4f6", borderRadius: 10, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
//                   <div style={{ display: "flex", gap: 6 }}>
//                     {currentSections.map(s => <div key={s.id} title={s.label} style={{ width: 10, height: 10, borderRadius: "50%", background: (sectionAnswers[s.id] || "").trim() ? s.color : "#e5e7eb" }} />)}
//                   </div>
//                   <div style={{ fontSize: 12, color: "#6b7280" }}>
//                     <strong style={{ color: "#374151" }}>{filledSections}</strong>/{currentSections.length} sections · <strong style={{ color: totalWords >= 2 ? "#10b981" : "#ef4444" }}>{totalWords}</strong> mots total
//                   </div>
//                 </div>

//                 <button onClick={handleSubmitAnswer} disabled={!canSubmit} style={{
//                   marginTop: 16, width: "100%", padding: "13px",
//                   background: canSubmit ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "#e5e7eb",
//                   border: "none", borderRadius: 12, color: canSubmit ? "#fff" : "#9ca3af",
//                   fontSize: 15, fontWeight: 700, cursor: canSubmit ? "pointer" : "not-allowed",
//                 }}>
//                   Soumettre ma réponse ({filledSections}/{currentSections.length} sections) →
//                 </button>
//               </>
//             ) : (
//               <WaitingScreen message="Réponse soumise ✓ — En attente du professeur pour la prochaine phase…" />
//             )}
//           </Card>
//         )}

//         {/* ── PEER REVIEW ─────────────────────────────────────────────────── */}
//         {phase === PHASES.REVIEW && (
//           <div>
//             <Card style={{ marginBottom: 16 }}>
//               <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>📝 Réponse de {peerName || "votre pair"}</div>
//               <div style={{ background: "#f9fafb", border: "1px solid #f3f4f6", borderRadius: 10, padding: 16, fontSize: 14, lineHeight: 1.8, color: "#374151", maxHeight: 260, overflowY: "auto", whiteSpace: "pre-wrap" }}>
//                 {peerAnswer || <span style={{ color: "#9ca3af" }}>Pas de réponse disponible.</span>}
//               </div>
//             </Card>
//             {!reviewSubmitted ? (
//               <Card>
//                 <div style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 16 }}>⭐ Évaluation par critères</div>
//                 {(peerCriteria.length > 0 ? peerCriteria : [
//                   { id: "structure", label: "Structure", desc: "Organisation et plan logique" },
//                   { id: "argumentation", label: "Argumentation", desc: "Arguments bien supportés" },
//                   { id: "clarity", label: "Clarté", desc: "Écriture claire et précise" },
//                   { id: "originality", label: "Originalité", desc: "Analyse personnelle présente" },
//                 ]).map(c => (
//                   <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid #f3f4f6" }}>
//                     <div><div style={{ fontSize: 14, fontWeight: 600, color: "#1f2937" }}>{c.label}</div><div style={{ fontSize: 12, color: "#6b7280" }}>{c.desc}</div></div>
//                     <StarRating value={peerRatings[c.id] || 0} onChange={v => setPeerRatings(r => ({ ...r, [c.id]: v }))} />
//                   </div>
//                 ))}
//                 <div style={{ marginTop: 16 }}>
//                   <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 8 }}>Commentaire (optionnel)</label>
//                   <textarea value={peerComment} onChange={e => setPeerComment(e.target.value)} placeholder="Commentaire constructif…" rows={4} style={{ width: "100%", boxSizing: "border-box", padding: 12, borderRadius: 10, border: "1.5px solid #e5e7eb", fontSize: 13, lineHeight: 1.7, color: "#1f2937", resize: "vertical", outline: "none", fontFamily: "inherit" }} />
//                 </div>
//                 <button onClick={handleSubmitReview} disabled={Object.keys(peerRatings).length === 0} style={{ marginTop: 16, width: "100%", padding: "13px", background: Object.keys(peerRatings).length > 0 ? "linear-gradient(135deg,#0ea5e9,#6366f1)" : "#e5e7eb", border: "none", borderRadius: 12, color: Object.keys(peerRatings).length > 0 ? "#fff" : "#9ca3af", fontSize: 15, fontWeight: 700, cursor: Object.keys(peerRatings).length > 0 ? "pointer" : "not-allowed" }}>
//                   Soumettre mon évaluation →
//                 </button>
//               </Card>
//             ) : (
//               <Card><WaitingScreen message="Évaluation envoyée ✓ — En attente des autres étudiants…" /></Card>
//             )}
//           </div>
//         )}

//         {/* ── AI EVAL ─────────────────────────────────────────────────────── */}
//         {phase === PHASES.AI && (
//           <div>
//             {aiLoading ? (
//               <Card>
//                 <div style={{ textAlign: "center", padding: "40px 20px" }}>
//                   <div style={{ fontSize: 36, marginBottom: 16 }}>🤖</div>
//                   <div style={{ fontWeight: 700, fontSize: 16, color: "#1f2937", marginBottom: 8 }}>Analyse en cours…</div>
//                   <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 20 }}>Évaluation {docIcon} {docLabel} section par section</p>
//                   <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 20 }}>
//                     {currentSections.map((s, i) => <div key={s.id} style={{ width: 28, height: 28, borderRadius: 7, background: s.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, animation: `pulse 1.5s ease-in-out ${i * 0.2}s infinite` }}>{s.letter}</div>)}
//                   </div>
//                   <style>{`@keyframes pulse{0%,100%{opacity:.4;transform:scale(.9)}50%{opacity:1;transform:scale(1)}}`}</style>
//                 </div>
//               </Card>
//             ) : aiFeedback || aiRaw ? (
//               <div>
//                 {globalScore !== null && (
//                   <Card style={{ marginBottom: 16, background: "linear-gradient(135deg,#eef2ff,#f0fdf4)", border: "1px solid #c7d2fe" }}>
//                     <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
//                       <div>
//                         <div style={{ fontSize: 12, fontWeight: 700, color: "#6366f1", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Score Global — {docIcon} {docLabel}</div>
//                         <div style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.6 }}>{globalComment}</div>
//                       </div>
//                       <div style={{ textAlign: "center" }}>
//                         <div style={{ fontSize: 36, fontWeight: 900, color: scoreColor(globalScore, 20) }}>{globalScore}</div>
//                         <div style={{ fontSize: 12, color: "#6b7280" }}>/20</div>
//                       </div>
//                     </div>
//                     {parsedSections.length > 0 && (
//                       <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
//                         {parsedSections.map((s, i) => {
//                           const def = currentSections.find(cs => cs.label.toLowerCase() === (s.label || "").toLowerCase()) || currentSections[i];
//                           return <div key={i} style={{ flex: "1 1 0", minWidth: 80, textAlign: "center", background: "#fff", borderRadius: 10, padding: "8px 6px", border: `1px solid ${def?.color || "#e5e7eb"}30` }}>
//                             <div style={{ fontSize: 11, fontWeight: 700, color: def?.color || "#6b7280", marginBottom: 2 }}>{s.label}</div>
//                             <div style={{ fontSize: 18, fontWeight: 800, color: scoreColor(s.score || 0) }}>{s.score || "—"}<span style={{ fontSize: 11, color: "#9ca3af" }}>/5</span></div>
//                           </div>;
//                         })}
//                       </div>
//                     )}
//                   </Card>
//                 )}
//                 {parsedSections.length > 0 ? (
//                   <div>
//                     <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 12 }}>Détail par section</div>
//                     {parsedSections.map((s, i) => <AiFeedbackCard key={i} section={s} sectionDef={currentSections.find(cs => cs.label.toLowerCase() === (s.label || "").toLowerCase()) || currentSections[i]} />)}
//                   </div>
//                 ) : (
//                   <Card><div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", marginBottom: 12 }}>🤖 Feedback AI</div><pre style={{ fontSize: 13, color: "#374151", lineHeight: 1.8, whiteSpace: "pre-wrap", margin: 0, fontFamily: "inherit" }}>{aiRaw}</pre></Card>
//                 )}
//                 <div style={{ marginTop: 16 }}><WaitingScreen message="En attente des résultats finaux…" /></div>
//               </div>
//             ) : (
//               <Card><WaitingScreen message="En attente du feedback AI…" /></Card>
//             )}
//           </div>
//         )}

//         {/* ── RESULTS ─────────────────────────────────────────────────────── */}
//         {phase === PHASES.RESULTS && (
//           <div>
//             <div style={{ textAlign: "center", marginBottom: 24, background: "linear-gradient(135deg,#eef2ff,#fdf4ff)", border: "1px solid #e0e7ff", borderRadius: 16, padding: 24 }}>
//               <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
//               <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#1f2937" }}>Session terminée !</h2>
//             </div>
//             {results ? (
//               <div>
//                 {results.bestAnswer && (
//                   <Card style={{ marginBottom: 16, border: "1.5px solid #fbbf24" }}>
//                     <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}><span style={{ fontSize: 20 }}>🏆</span><div style={{ fontSize: 14, fontWeight: 800, color: "#d97706" }}>Meilleure réponse</div><span style={{ fontSize: 12, color: "#6b7280", marginLeft: "auto" }}>par {results.bestAnswer.studentName}</span></div>
//                     <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: 14, fontSize: 13, lineHeight: 1.8, color: "#374151", whiteSpace: "pre-wrap" }}>{results.bestAnswer.text}</div>
//                   </Card>
//                 )}
//                 {results.rankings?.length > 0 && (
//                   <Card>
//                     <div style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 14 }}>📊 Classement</div>
//                     {results.rankings.map((r, i) => (
//                       <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < results.rankings.length - 1 ? "1px solid #f3f4f6" : "none" }}>
//                         <div style={{ width: 28, height: 28, borderRadius: "50%", background: i === 0 ? "#fef9c3" : "#f9fafb", border: `2px solid ${i === 0 ? "#fbbf24" : "#e5e7eb"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800 }}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</div>
//                         <div style={{ flex: 1, fontSize: 14, fontWeight: r.name === studentName ? 700 : 400, color: r.name === studentName ? "#6366f1" : "#374151" }}>{r.name} {r.name === studentName && "(vous)"}</div>
//                         <div style={{ fontSize: 13, fontWeight: 700, color: scoreColor(r.aiScore, 20) }}>{r.aiScore ?? "—"}/20</div>
//                       </div>
//                     ))}
//                   </Card>
//                 )}
//               </div>
//             ) : <Card><WaitingScreen message="Chargement…" /></Card>}
//             <div style={{ textAlign: "center", marginTop: 24 }}>
//               <button onClick={() => { setPhase(PHASES.JOIN); setSessionId(null); setSubmitted(false); setSectionAnswers({}); setAiFeedback(null); setAiRaw(""); setResults(null); setSessionCode(""); setStudentName(""); setActiveSection(""); }} style={{ padding: "12px 28px", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", border: "none", borderRadius: 12, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
//                 ← Nouvelle session
//               </button>
//             </div>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }

// const inputStyle = { width: "100%", boxSizing: "border-box", padding: "13px 16px", borderRadius: 12, border: "1.5px solid #e5e7eb", fontSize: 15, color: "#1f2937", outline: "none", fontFamily: "inherit" };