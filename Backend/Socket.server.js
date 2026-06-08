
// Socket.server.js
import { Server } from "socket.io";
import Anthropic from "@anthropic-ai/sdk";
import { Session, SessionSubmission } from "./Session.model.js";
import jwt from "jsonwebtoken";
import { buildLearnLensEvalPrompt } from "./prompts/sessionWritingEval.js";

let _client = null;
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

async function callAiModel(prompt) {
  // Prefer NVIDIA when configured; fallback to Anthropic.
  if (process.env.NVIDIA_API_KEY) {
    const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.NVIDIA_MODEL || "meta/llama-3.1-70b-instruct",
        temperature: 0.2,
        max_tokens: 1800,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`NVIDIA API error (${res.status}): ${txt || "request failed"}`);
    }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || "";
  }

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });
  return response?.content?.[0]?.text || "";
}

function normalizeAiFeedback(rawText) {
  const fallback = { basic: String(rawText || "").trim(), corrections: [], rewrite: "", score: null };
  try {
    const parsed = JSON.parse(String(rawText || "").replace(/```json|```/g, "").trim());

    // ── LearnLens format: overallScore (1–4) + criteria[] ──
    if (parsed.overallScore != null && Array.isArray(parsed.criteria)) {
      const avgScore = Number(parsed.overallScore);
      // Convert 1–4 scale to /20 (multiply by 5)
      const score20 = Math.round(avgScore * 5);
      // Build criteriaScores map from criteria[] for backward compat display
      const criteriaScores = {};
      for (const c of parsed.criteria) {
        criteriaScores[c.id] = {
          score: c.score,       // 1–4
          scoreMax: 4,
          label: c.label,
          name: c.name,
          comment: c.feedback,
        };
      }
      return {
        score: score20,
        overallScore: avgScore,
        basic: parsed.summary || "",
        criteriaScores,
        strengths: parsed.strengths || [],
        feedForward: parsed.improvements || [],
        weaknesses: parsed.improvements || [],
        corrections: [],
        rewrite: "",
        learnlens: parsed,  // keep raw for richer display
      };
    }

    // ── Legacy/generic format ──
    const criteria = parsed.criteriaScores || {};
    const hasDetailed = parsed.detailedEvaluation || parsed.noteGlobale != null || parsed.globalScore != null;

    const score =
      Number.isFinite(Number(parsed.score)) ? Number(parsed.score)
        : Number.isFinite(Number(parsed.noteGlobale)) ? Number(parsed.noteGlobale)
          : Number.isFinite(Number(parsed.globalScore)) ? Number(parsed.globalScore)
            : null;

    const details = parsed.detailedEvaluation || {};
    const as05 = (obj, key) => {
      const v = obj?.[key];
      if (v == null) return undefined;
      const n = Number(v);
      if (!Number.isFinite(n)) return undefined;
      return Math.max(0, Math.min(5, n));
    };

    return {
      score,
      level: parsed.level || "",
      basic: parsed.basic || parsed.summary || "",
      criteriaScores: Object.keys(criteria).length ? criteria : {
        scientific: { score: as05(details, "qualiteScientifique"), comment: "Scientific quality" },
        structure:  { score: as05(details, "logique"),             comment: "Logical structure" },
        argumentation: { score: as05(details, "argumentation"),    comment: "Argumentation" },
        clarity:    { score: as05(details, "clarity"),             comment: "Clarity" },
      },
      strengths: parsed.strengths || parsed.forces || [],
      weaknesses: parsed.weaknesses || parsed.faiblesses || [],
      feedForward: parsed.feedForward || [],
      suggestions: parsed.suggestionsPrecises || parsed.suggestions || [],
      corrections: parsed.corrections || [],
      rewrite: parsed.rewrite || "",
      detailedEvaluation: hasDetailed ? (parsed.detailedEvaluation || details) : undefined,
    };
  } catch {
    return fallback;
  }
}

let _io = null;
export function getIO() { return _io; }

export function initSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Authenticate sockets with the same JWT used by REST.
  // Frontend sends it as: io(SOCKET_URL, { auth: { token } })
  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, "");

      if (!token) return next(new Error("Unauthorized"));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      socket.data.userId = decoded.id;
      socket.data.role = decoded.role;
      return next();
    } catch {
      return next(new Error("Unauthorized"));
    }
  });

  _io = io;
  registerSessionEvents(io);
  registerChatEvents(io);
  console.log("Socket.io initialized");
  return io;
}

function registerChatEvents(io) {
  io.on("connection", (socket) => {
    const userId = socket.data.userId;
    if (userId) socket.join(`user:${userId}`);

    socket.on("join_user_room", () => {
      if (userId) socket.join(`user:${userId}`);
    });
  });
}

/**
 * Session participant id:
 * - distinct per connected participant (user + typed name), so 4 students
 *   on shared credentials don't overwrite one another.
 * - still stable across reconnects for same user/name pair.
 */
function canonicalStudentId(socket, name) {
  const uid = socket?.data?.userId ? String(socket.data.userId) : "";
  const n = String(name || socket?.data?.name || "").trim().toLowerCase();
  if (uid && n) return `${uid}::${n}`;
  if (uid) return uid;
  return socket.id;
}

/** Resolve section text from sectionAnswers with tolerant matching + content fallback */
function extractSectionText(sub, sectionKey, selectedSections) {
  const sa = sub.sectionAnswers && typeof sub.sectionAnswers === "object" ? sub.sectionAnswers : {};
  const sk = (sectionKey || "").trim();
  if (sk && sa[sk]?.trim()) return sa[sk].trim();
  const lower = sk.toLowerCase();
  for (const k of Object.keys(sa)) {
    if (k.toLowerCase() === lower && sa[k]?.trim()) return sa[k].trim();
  }
  if (Object.keys(sa).length === 1) {
    const only = Object.keys(sa)[0];
    if (sa[only]?.trim()) return sa[only].trim();
  }
  if (Array.isArray(selectedSections) && selectedSections.length === 1) {
    const k0 = selectedSections[0];
    if (sa[k0]?.trim()) return sa[k0].trim();
  }
  return (sub.content || "").trim();
}

/** Rubric + meta for student UI (problème, section, critères). */
function sessionClientMeta(session) {
  if (!session) return {};
  let ec = session.evaluationCriteria;
  if (ec instanceof Map) ec = Object.fromEntries(ec);
  if (!ec || typeof ec !== "object") ec = {};
  let articleSections = session.articleSections;
  if (articleSections instanceof Map) articleSections = Object.fromEntries(articleSections);
  if (!articleSections || typeof articleSections !== "object") articleSections = {};
  return {
    evaluationCriteria: ec,
    docType: session.docType || session.sessionConfig?.docType || "article",
    resourceType: session.resourceType || "article",
    level: session.level || "",
    language: session.language || "",
    articleSections,
    articleFileUrl:     session.articleFileUrl || null,
    articleFileName:    session.articleFileName || "",
    articleFileMime:    session.articleFileMime || "",
    missingSection:     session.missingSection || "",
    activityMode:       session.activityMode || "section_learn",
    articleTextContent: session.articleTextContent || "",
    sectionGuidance: (() => {
      let sg = session.sectionGuidance;
      if (sg instanceof Map) sg = Object.fromEntries(sg);
      return (sg && typeof sg === "object") ? sg : {};
    })(),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
function registerSessionEvents(io) {
  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    // Join a per-user room so we can emit notifications to that userId
    // e.g. io.to(userId).emit("new_session", payload)
    if (socket.data?.userId) {
      socket.join(String(socket.data.userId));
    }

    // ── Teacher joins ────────────────────────────────────────────────────────
    socket.on("teacher_join", ({ sessionId }) => {
      const room = `session:${sessionId}`;
      socket.join(room);
      socket.data = { role: "teacher", sessionId: String(sessionId) };
      console.log("Teacher joined room:", room);
    });

    // ── Student joins (from StudentSession.jsx via "join_session") ────────
    // FIX: The frontend emits "join_session" after the REST /sessions/join call
    socket.on("join_session", async ({ sessionId, studentName }) => {
      const sid = String(sessionId);
      const room = `session:${sid}`;
      const stableId = canonicalStudentId(socket, studentName);

      // Join the socket room
      socket.join(room);
      socket.data = {
        ...(socket.data || {}),
        role: "student",
        sessionId: sid,
        studentId: stableId,
        name: studentName,
      };
      console.log(`Student "${studentName}" joined room ${room} (socket: ${socket.id}, stableId: ${stableId})`);

      // Update the student's socketId in the DB so we can target them later
      try {
        const session = await Session.findById(sid);
        if (session) {
          // Match by name or by stored userId
          let existingIdx = session.students.findIndex(
            s => String(s.id) === String(stableId)
          );
          if (existingIdx >= 0) {
            session.students[existingIdx].id = stableId;
            session.students[existingIdx].userId = String(socket.data?.userId || "");
            session.students[existingIdx].socketId = socket.id;
            if (studentName) session.students[existingIdx].name = studentName;
          } else {
            session.students.push({
              id: stableId,
              userId: String(socket.data?.userId || ""),
              name: studentName,
              socketId: socket.id,
            });
          }
          await session.save();

          // Broadcast updated student list to everyone in the room
          io.to(room).emit("student_joined", { students: session.students });
          console.log(`Emitted student_joined to ${room}, total: ${session.students.length}`);
        }
      } catch (err) {
        console.error("join_session DB error:", err.message);
      }

      // Full session_info for sectioned UI + late joiners
      try {
        const session = await Session.findById(sid);
        if (session) {
          socket.emit("session_info", {
            sessionId: sid,
            question: session.question,
            instructions: session.instructions || "",
            example: session.examples || "",
            videoUrl: session.videoUrl,
            selectedSections: session.selectedSections || [],
            currentSectionKey: session.currentSectionKey || session.selectedSections?.[0] || "",
            currentRound: session.currentRound || 1,
            phase: session.phase,
            ...sessionClientMeta(session),
          });
          if (session.phase && session.phase !== "waiting") {
            socket.emit("phase_changed", {
              phase: session.phase,
              currentSectionKey: session.currentSectionKey || session.selectedSections?.[0] || "",
              currentRound: session.currentRound || 1,
              selectedSections: session.selectedSections || [],
              ...sessionClientMeta(session),
            });
          }
          if (session.phase === "review") {
            await assignReviewAssignments(io, sid);
          }
        }
      } catch (e) { /* ignore */ }
    });

    // ── Legacy: student_join with callback (keep for backward compat) ─────
    socket.on("student_join", async ({ code, name }, callback) => {
      try {
        if (!callback || typeof callback !== "function") return;

        const session = await Session.findOne({ code: code.toUpperCase() });
        if (!session) return callback({ success: false, message: "Code invalide" });
        if (session.phase === "done") return callback({ success: false, message: "Session terminée" });

        const sid = session._id.toString();
        const room = `session:${sid}`;
        const stableId = canonicalStudentId(socket, name);
        const student = { id: stableId, userId: stableId, name, socketId: socket.id };

        const fresh = await Session.findById(session._id);
        if (fresh) {
          const idx = fresh.students.findIndex(
            st => String(st.id) === String(stableId)
          );
          if (idx >= 0) {
            fresh.students[idx].id = stableId;
            fresh.students[idx].userId = String(socket.data?.userId || "");
            fresh.students[idx].socketId = socket.id;
            fresh.students[idx].name = name;
          } else {
            fresh.students.push(student);
          }
          await fresh.save();
        }
        socket.join(room);
        socket.data = {
          ...(socket.data || {}),
          role: "student",
          sessionId: sid,
          studentId: stableId,
          name,
        };

        socket.emit("session_info", {
          sessionId: sid,
          question: session.question,
          instructions: session.instructions || "",
          example: session.examples || "",
          videoUrl: session.videoUrl,
          selectedSections: session.selectedSections || [],
          currentSectionKey: session.currentSectionKey || session.selectedSections?.[0] || "",
          currentRound: session.currentRound || 1,
          phase: session.phase,
          ...sessionClientMeta(session),
        });
        socket.emit("phase_changed", {
          phase: session.phase,
          currentSectionKey: session.currentSectionKey || session.selectedSections?.[0] || "",
          currentRound: session.currentRound || 1,
          selectedSections: session.selectedSections || [],
          ...sessionClientMeta(session),
        });

        const updated = await Session.findById(session._id);
        io.to(room).emit("student_joined", { students: updated.students });

        if (session.phase === "review") {
          await assignReviewAssignments(io, sid);
        }

        callback({ success: true, studentId: stableId, sessionId: sid });
      } catch (err) {
        console.error("student_join error:", err);
        if (callback) callback({ success: false, message: err.message });
      }
    });

    // ── Teacher advances phase ───────────────────────────────────────────────
    socket.on("advance_phase", async ({ sessionId, phase }) => {
      const sid = String(sessionId);
      const room = `session:${sid}`;
      console.log(`advance_phase: room=${room}, phase=${phase}`);

      await Session.findByIdAndUpdate(sid, { phase });
      const sessionAfter = await Session.findById(sid);
      const payload = {
        phase,
        currentSectionKey: sessionAfter?.currentSectionKey || sessionAfter?.selectedSections?.[0] || "",
        currentRound: sessionAfter?.currentRound || 1,
        selectedSections: sessionAfter?.selectedSections || [],
        ...sessionClientMeta(sessionAfter),
      };
      io.to(room).emit("phase_changed", payload);

      const sockets = await io.in(room).fetchSockets();
      console.log(`Room ${room} has ${sockets.length} sockets`);

      // Sectioned flow hooks (backward compatible with existing round flow)
      if (phase === "review") {
        await assignGroups(io, sid);
        await assignReviewAssignments(io, sid);
      }
      if (phase === "ai") {
        await runSectionAiEvaluation(io, sid);
      }
      if (phase === "results") await emitSectionResults(io, sid);
    });

    // ── Next round ───────────────────────────────────────────────────────────
    socket.on("next_round", async ({ sessionId, round }) => {
      const sid = String(sessionId);
      const sessionBefore = await Session.findById(sid);
      const selected = sessionBefore?.selectedSections || [];
      const prevIdx = Number(sessionBefore?.currentSectionIndex || 0);
      const nextSectionIndex = selected.length > 0 ? Math.min(prevIdx + 1, selected.length - 1) : 0;
      const nextSectionKey = selected[nextSectionIndex] || sessionBefore?.currentSectionKey || "";

      const session = await Session.findByIdAndUpdate(
        sid,
        {
          currentRound: round,
          phase: "writing",
          currentSectionIndex: nextSectionIndex,
          currentSectionKey: nextSectionKey,
        },
        { returnDocument: "after" }
      );

      const groups = rotateReceivers(session.groups, round);
      await Session.findByIdAndUpdate(sid, { groups });

      for (const group of groups) {
        const receiver = group.members.find(m => m.isReceiver);
        const prevSubmission = await SessionSubmission.findOne({
          sessionId: sid, studentId: receiver?.id, round: round - 1,
        });
        for (const member of group.members) {
          const memberSocket = io.sockets.sockets.get(member.socketId);
          if (memberSocket) {
            memberSocket.emit("round_changed", {
              round,
              receiver: { id: receiver?.id, name: receiver?.name },
              receiverAnswer: prevSubmission?.content || "",
            });
          }
        }
      }

      io.to(`session:${sid}`).emit("phase_changed", {
        phase: "writing",
        currentRound: session?.currentRound || round,
        currentSectionKey: session?.currentSectionKey || nextSectionKey,
        selectedSections: session?.selectedSections || selected,
        ...sessionClientMeta(session),
      });
    });

    // ── Submit answer ────────────────────────────────────────────────────────
    socket.on("submit_answer", async ({ sessionId, studentName, answer, sectionAnswers, sectionKey }) => {
      const sid = String(sessionId);
      try {
        const session = await Session.findById(sid);
        const round = session?.currentRound || 1;
        const sk = (sectionKey || session?.currentSectionKey || session?.selectedSections?.[0] || "").trim();
        const stableId = canonicalStudentId(socket, studentName);

        const prev = await SessionSubmission.findOne({ sessionId: sid, studentId: stableId, round }).lean();
        const mergedAnswers = {
          ...(prev?.sectionAnswers && typeof prev.sectionAnswers === "object" ? prev.sectionAnswers : {}),
          ...(sectionAnswers && typeof sectionAnswers === "object" ? sectionAnswers : {}),
        };
        if (sk && answer != null) mergedAnswers[sk] = answer;

        await SessionSubmission.findOneAndUpdate(
          { sessionId: sid, studentId: stableId, round },
          {
            content: answer != null ? answer : prev?.content,
            sectionKey: sk || undefined,
            studentName: studentName || socket.data?.name,
            sectionAnswers: mergedAnswers,
            submittedAt: new Date(),
          },
          { upsert: true, returnDocument: "after" }
        );

        const count = await SessionSubmission.countDocuments({ sessionId: sid, round });
        const allAnswers = await SessionSubmission.find({ sessionId: sid });

        io.to(`session:${sid}`).emit("answer_submitted", {
          studentId: stableId,
          studentName: studentName || socket.data?.name,
          content: answer,
          round,
          answeredCount: count,
          totalStudents: session?.students?.length || 0,
          answers: allAnswers,
        });
        console.log(`Answer submitted by ${studentName}, count: ${count}/${session?.students?.length}`);
      } catch (err) {
        console.error("submit_answer error:", err.message);
      }
    });

    // ── Submit peer review ───────────────────────────────────────────────────
    socket.on("submit_review", async ({ sessionId, studentName, ratings, comment, sectionKey, revieweeStudentId }) => {
      const sid = String(sessionId);
      try {
        const session = await Session.findById(sid);
        const round = session?.currentRound || 1;
        const sk = sectionKey || session?.currentSectionKey || session?.selectedSections?.[0] || "";
        const reviewerId = canonicalStudentId(socket, studentName || socket.data?.name);

        // Sectioned flow: target submission by reviewee id (stable user id)
        let targetId = revieweeStudentId;
        if (!targetId) {
          const group = session?.groups?.find(g => g.members.some(m => m.socketId === socket.id));
          targetId = group?.members?.find(m => m.isReceiver)?.id;
        }

        if (targetId) {
          await SessionSubmission.findOneAndUpdate(
            { sessionId: sid, studentId: String(targetId), round },
            {
              $push: {
                peerReviews: {
                  reviewerId,
                  sectionKey: sk,
                  revieweeStudentId: String(targetId),
                  ratings,
                  comment,
                  submittedAt: new Date(),
                },
              },
            },
            { upsert: true }
          );
        }

        io.to(`session:${sid}`).emit("review_submitted", { studentName, revieweeStudentId: targetId, sectionKey: sk });
      } catch (err) {
        console.error("submit_review error:", err.message);
      }
    });

    // ── Request AI feedback ──────────────────────────────────────────────────
    socket.on("request_ai_feedback", async ({ sessionId, studentId, answer, round }) => {
      try {
        const sid = String(sessionId);
        const session = await Session.findById(sid);
        const rid = canonicalStudentId(socket, socket.data?.name);

        const sectionKey = session.missingSection || session.currentSectionKey
          || (session.selectedSections || [])[0] || "Introduction";
        const hasArticleContext = Boolean(session.articleTextContent?.trim());
        const feedbackStyle = session.sessionConfig?.feedbackStyle || "detaille";

        const prompt = hasArticleContext
          ? buildLearnLensEvalPrompt({
              sectionKey,
              feedbackStyle,
              articleContext: session.articleTextContent,
              studentAnswer: answer,
            })
          : buildInlineFeedbackPrompt({
              question: session.question,
              instructions: session.instructions,
              examples: session.examples,
              answer,
              docType: session.docType || session.sessionConfig?.docType || "article",
              level: session.level || "Master 2 / PFE",
              language: session.language || "FR + EN (auto)",
              selectedSections: session.selectedSections || [],
              evaluationCriteria: session.evaluationCriteria || {},
            });

        console.log(`Requesting AI feedback [${hasArticleContext ? "LearnLens" : "generic"}] for student:`, studentId || rid);

        const rawText = await callAiModel(prompt);
        const parsed = normalizeAiFeedback(rawText);

        await SessionSubmission.findOneAndUpdate(
          { sessionId: sid, studentId: rid, round },
          { aiFeedback: parsed, aiScore: parsed.score },
          { upsert: true }
        );

        socket.emit("ai_feedback", { feedback: parsed, score: parsed.score });
        console.log("AI feedback sent, score:", parsed.score);

        const allAnswers = await SessionSubmission.find({ sessionId: sid });
        io.to(`session:${sid}`).emit("answer_submitted", { answers: allAnswers });
      } catch (err) {
        console.error("AI feedback error:", err.message);
        socket.emit("error", { message: "AI feedback failed: " + err.message });
      }
    });

    // ── Submit revision ──────────────────────────────────────────────────────
    socket.on("submit_revision", async ({ sessionId, studentId, round, revision }) => {
      const sid = String(sessionId);
      await SessionSubmission.findOneAndUpdate(
        { sessionId: sid, studentId, round },
        { $push: { revisions: { content: revision, submittedAt: new Date() } } }
      );
      socket.emit("revision_saved");
    });

    // ── Disconnect ───────────────────────────────────────────────────────────
    socket.on("disconnect", async () => {
      console.log("Socket disconnected:", socket.id);
      if (socket.data?.sessionId && socket.data?.role === "student") {
        const sid = socket.data.sessionId;
        await Session.findByIdAndUpdate(sid, {
          $pull: { students: { socketId: socket.id } },
        });
        const session = await Session.findById(sid);
        if (session) {
          io.to(`session:${sid}`).emit("student_joined", { students: session.students });
        }
      }
    });
  });
}

// ── Inline prompt builder (no external import needed) ────────────────────────
function buildInlineFeedbackPrompt({ question, instructions, examples, answer, docType, level, language, selectedSections, evaluationCriteria }) {
  const criteriaText = Object.entries(evaluationCriteria || {})
    .map(([sec, crit]) => `  ${sec}:\n${(crit || []).map(c => `    - ${c}`).join("\n")}`)
    .join("\n");

  const words = answer.trim().split(/\s+/).filter(Boolean).length;
  const tooShort = words < 30;
  const partial  = words >= 30 && words < 70;

  return `Tu es un correcteur expert en rédaction scientifique académique (niveau ${level || "Master / PFE"}).
Ta mission : évaluer rigoureusement la réponse d'un étudiant sur une section de ${docType === "memoire" ? "mémoire PFE" : "article scientifique"} (langue : ${language || "FR"}).

═══ CONTEXTE DE L'EXERCICE ═══
Problématique : "${question}"
${instructions ? `Instructions spécifiques : "${instructions}"` : ""}
${examples ? `Exemple de réponse attendue :\n"${examples}"` : ""}
${criteriaText ? `\nCRITÈRES D'ÉVALUATION PAR SECTION :\n${criteriaText}` : ""}

═══ RÉPONSE DE L'ÉTUDIANT (${words} mots) ═══
"${answer}"

═══ RÈGLES D'ÉVALUATION STRICTES ═══
${tooShort ? `🔴 RÉPONSE TRÈS COURTE (${words} mots < 30 mots minimum) :
  - Score plafonné à 3/20 — réponse insuffisante, ne représente pas une rédaction académique.
  - Explique clairement pourquoi la longueur est insuffisante pour cette section.` : ""}
${partial ? `🟡 RÉPONSE INCOMPLÈTE (${words} mots) :
  - Score plafonné à 10/20 — réponse partielle, manque de développement.
  - Une section académique de qualité nécessite 80–250 mots selon le type.` : ""}

1. Le score /20 = somme des 4 critères (chacun /5). NE PAS arrondir arbitrairement.
2. CITER des passages EXACTS de la réponse pour justifier chaque critique.
3. Les weaknesses et feedForward doivent être ACTIONNABLES et SPÉCIFIQUES à cette réponse.
4. La réécriture ("rewrite") doit être substantielle : minimum 80 mots, style académique formel.
5. Si la réponse est hors-sujet ou ne répond pas à la problématique, signale-le explicitement.
6. NE PAS inventer du contenu absent de la réponse — évalue uniquement ce qui est écrit.

BARÈME DÉTAILLÉ (chaque critère noté /5) :
  Clarté (0-5) :       0=incompréhensible · 3=acceptable · 5=excellent, vocabulaire précis et phrases claires
  Structure (0-5) :    0=aucun plan · 3=plan partiel · 5=intro/développement/conclusion bien articulés
  Argumentation (0-5): 0=affirmations sans preuves · 3=quelques arguments · 5=arguments étayés et cohérents
  Précision sci. (0-5):0=erreurs factuelles · 3=correct mais superficiel · 5=terminologie et contenu experts

Réponds UNIQUEMENT avec du JSON valide (sans balises markdown, sans texte avant/après) :
{
  "score": <entier 0-20, somme des 4 critères>,
  "level": "<Excellent (18-20) | Très bien (15-17) | Bien (12-14) | Satisfaisant (10-11) | Insuffisant (6-9) | Faible (0-5)>",
  "basic": "<3-4 phrases : évaluation globale SPÉCIFIQUE avec citations de la réponse>",
  "criteriaScores": {
    "clarity":       { "score": <0-5>, "comment": "<explication avec exemple précis tiré de la réponse>" },
    "structure":     { "score": <0-5>, "comment": "<explication avec exemple précis tiré de la réponse>" },
    "argumentation": { "score": <0-5>, "comment": "<explication avec exemple précis tiré de la réponse>" },
    "scientific":    { "score": <0-5>, "comment": "<explication avec exemple précis tiré de la réponse>" }
  },
  "strengths":   ["<point fort 1 avec citation exacte>", "<point fort 2>"],
  "weaknesses":  ["<faiblesse 1 avec citation exacte>", "<faiblesse 2>"],
  "feedForward": ["<conseil actionnable 1>", "<conseil actionnable 2>", "<conseil actionnable 3>"],
  "suggestions": ["<suggestion de reformulation précise>", "<autre suggestion>"],
  "corrections": [
    { "original": "<phrase exacte problématique de la réponse>", "issue": "<problème>", "suggestion": "<version améliorée>" }
  ],
  "rewrite": "<version améliorée COMPLÈTE — minimum 80 mots, niveau académique, intègre les critères manquants>",
  "detailedWhy": "<justification détaillée du score : 2-3 phrases techniques expliquant le niveau obtenu>"
}`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Split an array into groups respecting min/max size.
 * min=2, max=4 → e.g. 5→[3,2], 9→[3,3,3], 13→[4,3,3,3], 1→[[1]]
 */
function splitIntoBalancedGroups(arr, minSize = 2, maxSize = 4) {
  const n = arr.length;
  if (n === 0) return [];
  if (n <= minSize) return [arr]; // can't enforce min with fewer students

  const numGroups = Math.ceil(n / maxSize);
  const baseSize  = Math.floor(n / numGroups);
  const larger    = n - baseSize * numGroups; // first `larger` groups get baseSize+1

  const groups = [];
  let start = 0;
  for (let i = 0; i < numGroups; i++) {
    const size = i < larger ? baseSize + 1 : baseSize;
    groups.push(arr.slice(start, start + size));
    start += size;
  }
  return groups;
}

async function assignGroups(io, sessionId) {
  const session = await Session.findById(sessionId);
  const students = session.students.map(s => s.toObject ? s.toObject() : { ...s });

  // Fisher-Yates shuffle
  for (let i = students.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [students[i], students[j]] = [students[j], students[i]];
  }

  const chunks = splitIntoBalancedGroups(students, 2, 4);
  const groups = chunks.map(chunk => ({
    members: chunk.map((s, idx) => ({
      id: s.id, name: s.name, socketId: s.socketId, isReceiver: idx === 0,
    })),
  }));

  const updated = await Session.findByIdAndUpdate(sessionId, { groups }, { returnDocument: "after" });
  io.to(`session:${sessionId}`).emit("groups_formed", { groups: updated.groups });
  console.log(`Groups formed: ${groups.length} groups (sizes: ${groups.map(g => g.members.length).join(", ")})`);
}

// ── Sectioned flow: assign multiple peers to review ───────────────────────────
async function assignReviewAssignments(io, sessionId, { perStudent = 2 } = {}) {
  const session = await Session.findById(sessionId);
  if (!session) return;

  const selected = session.selectedSections || [];
  const sectionKey = session.currentSectionKey || selected[0] || "Section";
  const round = session.currentRound || 1;

  const submissions = await SessionSubmission.find({ sessionId, round })
    .select("studentId studentName content sectionAnswers");

  const answerByStudentId = new Map();
  for (const s of submissions) {
    const text = extractSectionText(s, sectionKey, selected);
    if (text) answerByStudentId.set(String(s.studentId), text);
  }

  const members = (session.students || []).map(m => {
    const sidStable = m.userId || m.id;
    return {
      socketId: m.socketId,
      studentId: sidStable,
      studentName: m.name,
    };
  }).filter(m => m.studentId);

  for (const me of members) {
    const candidates = members
      .filter(x => x.studentId !== me.studentId && answerByStudentId.has(String(x.studentId)))
      .sort(() => Math.random() - 0.5)
      .slice(0, perStudent);

    const assignments = candidates.map(c => ({
      revieweeStudentId: c.studentId,
      revieweeName: c.studentName,
      sectionKey,
      answerText: answerByStudentId.get(String(c.studentId)) || "",
    }));

    const payload = {
      sessionId,
      round,
      sectionKey,
      assignments,
    };

    // Prefer JWT user room (reconnect-safe); fallback to live socket
    io.to(String(me.studentId)).emit("review_assignments", payload);
    const sock = me.socketId && io.sockets.sockets.get(me.socketId);
    if (sock) sock.emit("review_assignments", payload);
  }

  io.to(`session:${sessionId}`).emit("review_assignments_ready", {
    sectionKey,
    perStudent,
  });
}

function rotateReceivers(groups, round) {
  return (groups || []).map(group => {
    const members = (group.members || []).map((m, idx) => {
      const mObj = m.toObject ? m.toObject() : { ...m };
      return { ...mObj, isReceiver: idx === (round - 1) % (group.members.length || 1) };
    });
    return { members };
  });
}

async function emitSectionResults(io, sessionId) {
  const session = await Session.findById(sessionId);
  if (!session) return;

  const sectionKey = session.currentSectionKey || session.selectedSections?.[0] || "Section";
  const round = session.currentRound || 1;

  const submissions = await SessionSubmission.find({ sessionId, round });

  const MIN_WORDS_FOR_BEST = 25; // answers below this are never "best answer"

  const withMeta = submissions.map(s => {
    const text = extractSectionText(s, sectionKey, session.selectedSections || []);
    const wordCount = (text || "").trim().split(/\s+/).filter(Boolean).length;
    const scoreVals = (s.peerReviews || []).map(pr => {
      const r = pr.ratings || {};
      const vals = ["clarity", "structure", "argumentation", "scientific"]
        .map(k => Number(r[k] || 0))
        .filter(Boolean);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    }).filter(v => v > 0);
    const peerAvg = scoreVals.length ? (scoreVals.reduce((a, b) => a + b, 0) / scoreVals.length) : null;
    const aiScore = Number.isFinite(s.aiScore) ? Number(s.aiScore) : null;
    return { s, aiScore, peerAvg, wordCount };
  });

  // Prefer submissions above minimum word count; among those rank by aiScore → peerAvg → recency
  const ranked = [...withMeta].sort((a, b) => {
    const aValid = a.wordCount >= MIN_WORDS_FOR_BEST ? 1 : 0;
    const bValid = b.wordCount >= MIN_WORDS_FOR_BEST ? 1 : 0;
    if (bValid !== aValid) return bValid - aValid; // valid answers first
    const aAi = a.aiScore ?? -1;
    const bAi = b.aiScore ?? -1;
    if (bAi !== aAi) return bAi - aAi;
    const aPeer = a.peerAvg ?? -1;
    const bPeer = b.peerAvg ?? -1;
    if (bPeer !== aPeer) return bPeer - aPeer;
    return new Date(b.s.submittedAt || 0) - new Date(a.s.submittedAt || 0);
  });

  const top = ranked[0]?.s || null;
  const bestAnswer = top
    ? {
        studentId: top.studentId,
        studentName: top.studentName,
        content: extractSectionText(top, sectionKey, session.selectedSections || []),
        aiScore: top.aiScore ?? null,
        aiFeedback: top.aiFeedback || null,
      }
    : null;

  const topMeta = ranked[0];
  const hasAiScores   = ranked.some(x => x.aiScore != null);
  const hasPeerScores = ranked.some(x => x.peerAvg != null);
  let bestAnswerReason = "";
  if (bestAnswer) {
    if (!topMeta || topMeta.wordCount < MIN_WORDS_FOR_BEST) {
      bestAnswerReason = `Aucune réponse suffisamment développée soumise (minimum ${MIN_WORDS_FOR_BEST} mots requis). La meilleure réponse disponible est affichée à titre indicatif.`;
    } else if (hasAiScores) {
      bestAnswerReason = `Sélectionnée pour le score IA le plus élevé (${topMeta.aiScore}/20) sur la section « ${sectionKey} ».`;
    } else if (hasPeerScores) {
      bestAnswerReason = `Sélectionnée d'après la meilleure note moyenne de révision par les pairs (score IA en attente).`;
    } else {
      bestAnswerReason = `Sélectionnée comme la soumission la plus récente et complète (évaluation IA non encore disponible).`;
    }
  }

  // Best feedback = peer review with highest avg rating (temporary heuristic; upgraded in ai-prompts todo)
  let bestFeedback = null;
  for (const sub of submissions) {
    for (const pr of sub.peerReviews || []) {
      const r = pr.ratings || {};
      const vals = ["clarity", "structure", "argumentation", "scientific"].map(k => Number(r[k] || 0)).filter(Boolean);
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      if (!bestFeedback || avg > bestFeedback.avg) {
        bestFeedback = {
          avg,
          revieweeStudentId: sub.studentId,
          revieweeName: sub.studentName,
          reviewerId: pr.reviewerId,
          comment: pr.comment || "",
          ratings: pr.ratings || {},
          submittedAt: pr.submittedAt,
        };
      }
    }
  }
  if (bestFeedback) delete bestFeedback.avg;

  const payload = {
    sessionId,
    round,
    sectionKey,
    bestAnswer,
    bestAnswerReason,
    bestFeedback,
    rankings: ranked.map(({ s, aiScore, peerAvg }) => ({
      studentName: s.studentName,
      aiScore: aiScore ?? null,
      peerAverage: peerAvg ?? null,
    })),
  };

  // New canonical event
  io.to(`session:${sessionId}`).emit("section_results", payload);

  // Backward compat events (will be removed after frontend migration)
  io.to(`session:${sessionId}`).emit("session_results", payload);
  io.to(`session:${sessionId}`).emit("results", payload);
}

async function runSectionAiEvaluation(io, sessionId) {
  const session = await Session.findById(sessionId);
  if (!session) return;

  const sectionKey = session.currentSectionKey || session.selectedSections?.[0] || "Section";
  const round = session.currentRound || 1;
  const room = `session:${sessionId}`;

  if (!process.env.ANTHROPIC_API_KEY) {
    io.to(room).emit("error", { message: "AI key missing on server." });
    return;
  }

  const submissions = await SessionSubmission.find({ sessionId, round });
  const targets = submissions.filter(s => {
    const text = extractSectionText(s, sectionKey, session.selectedSections || []);
    return Boolean(text?.trim());
  });

  if (targets.length === 0) {
    io.to(room).emit("ai_eval_progress", {
      done: 0,
      total: 0,
      sectionKey,
      status: "No submissions to evaluate.",
    });
    await Session.findByIdAndUpdate(sessionId, { phase: "results" });
    io.to(room).emit("phase_changed", {
      phase: "results",
      currentSectionKey: sectionKey,
      currentRound: round,
      selectedSections: session.selectedSections || [],
      ...sessionClientMeta(session),
    });
    await emitSectionResults(io, sessionId);
    return;
  }

  let done = 0;
  io.to(room).emit("ai_eval_progress", {
    done,
    total: targets.length,
    sectionKey,
    status: "AI evaluation started",
  });

  for (const sub of targets) {
    const answer = extractSectionText(sub, sectionKey, session.selectedSections || []);
    try {
      const prompt = buildInlineFeedbackPrompt({
        question: session.question,
        instructions: session.instructions,
        examples: session.examples,
        answer,
        docType: session.docType || session.sessionConfig?.docType || "article",
        level: session.level || "Master 2 / PFE",
        language: session.language || "FR + EN (auto)",
        selectedSections: session.selectedSections || [],
        evaluationCriteria: session.evaluationCriteria || {},
      });

      const rawText = await callAiModel(prompt);
      const parsed = normalizeAiFeedback(rawText);

      await SessionSubmission.findOneAndUpdate(
        { sessionId, studentId: sub.studentId, round },
        {
          aiFeedback: parsed,
          aiScore: Number.isFinite(Number(parsed?.score)) ? Number(parsed.score) : null,
        }
      );
    } catch (err) {
      await SessionSubmission.findOneAndUpdate(
        { sessionId, studentId: sub.studentId, round },
        {
          aiFeedback: {
            basic: "AI evaluation failed for this answer.",
            error: err?.message || "Unknown error",
            sectionKey,
          },
          aiScore: null,
        }
      );
    } finally {
      done += 1;
      io.to(room).emit("ai_eval_progress", {
        done,
        total: targets.length,
        sectionKey,
        status: done >= targets.length ? "AI evaluation completed" : "AI evaluation running",
      });
    }
  }

  await Session.findByIdAndUpdate(sessionId, { phase: "results" });
  io.to(room).emit("phase_changed", {
    phase: "results",
    currentSectionKey: sectionKey,
    currentRound: round,
    selectedSections: session.selectedSections || [],
    ...sessionClientMeta(session),
  });
  await emitSectionResults(io, sessionId);
}