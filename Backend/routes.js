import express   from "express";
import jwt       from "jsonwebtoken";
import multer    from "multer";
import fs        from "fs";
import { createRequire } from "module";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).href;
const _require = createRequire(import.meta.url);
const pdfParse = _require("pdf-parse");
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  User, Course, Enrollment, Assignment,
  Submission, Feedback, PeerReview,
  Follow, Notification,
} from "./models.js";
import { PeerSession, Session, SessionSubmission } from "./Session.model.js";
import { getIO } from "./Socket.server.js";
import { getPlatformSettings } from "./services/settings.js";
import { sendEmail } from "./services/email.js";
import { registerExtraRoutes } from "./routesExtra.js";

const router = express.Router();

// ── Gemini AI setup (kept for backward compat if credits available) ──────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "no-key");
const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// ── Claude / Anthropic setup ─────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Unified AI call: NVIDIA first → Anthropic fallback ───────
async function callAi(prompt, maxTokens = 800) {
  if (process.env.NVIDIA_API_KEY) {
    const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.NVIDIA_MODEL || "meta/llama-3.1-70b-instruct",
        temperature: 0.3,
        max_tokens: maxTokens,
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
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });
  return response?.content?.[0]?.text || "";
}

// ── Multer — video upload ────────────────────────────────────
const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = "uploads/videos";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const uploadVideo = multer({
  storage: videoStorage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_, file, cb) =>
    cb(null, ["video/mp4", "video/quicktime", "video/webm"].includes(file.mimetype)),
});

const ARTICLE_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
  "text/markdown",
]);

const uploadSessionMedia = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const isVideo = file.fieldname === "video";
      const dir = isVideo ? "uploads/videos" : "uploads/articles";
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`),
  }),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (file.fieldname === "video") {
      return cb(null, ["video/mp4", "video/quicktime", "video/webm"].includes(file.mimetype));
    }
    if (file.fieldname === "article") {
      const extOk = /\.(pdf|docx?|txt|md)$/i.test(file.originalname || "");
      return cb(null, ARTICLE_MIMES.has(file.mimetype) || extOk);
    }
    cb(null, false);
  },
});

/**
 * askAI — unified helper using NVIDIA → Anthropic fallback
 */
async function askAI(systemPrompt, userPrompt) {
  const combined = `${systemPrompt}\n\n${userPrompt}`;
  return callAi(combined, 1024);
}

// ── Middleware ────────────────────────────────────────────────
// IMPORTANT: do not trust role embedded in JWT long-term.
// We verify JWT for identity, then load the user's current role from DB.
const auth = async (req, res, next) => {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return res.status(401).json({ message: "Unauthorized" });
  try {
    const decoded = jwt.verify(h.slice(7), process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("role status");
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    if (user.status === "banned") return res.status(403).json({ message: "Account suspended" });
    if (user.status === "pending") return res.status(403).json({ message: "Account pending admin approval", pending: true });
    req.user = { id: user._id.toString(), role: user.role, status: user.status };
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
};

const role = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role) ? next() : res.status(403).json({ message: "Forbidden" });

// ── Build feedback prompt (assignment rubric) ─────────────────
function buildFeedbackPrompt(submission, assignment) {
  const rubricText = assignment.rubric
    .map(r => `- ${r.criterion} (${r.weight} pts): ${r.description || ""}`)
    .join("\n");

  return `You are an expert educational feedback assistant. Respond ONLY with valid JSON, no markdown.

Assignment: "${assignment.title}"
Max Score: ${assignment.maxScore}
Rubric:
${rubricText}

Student Submission:
${submission.content}

Return this exact JSON structure:
{
  "overallScore": <0-${assignment.maxScore}>,
  "level": "<Excellent|Good|Satisfactory|Needs Work>",
  "summary": "<2-3 sentence overall assessment>",
  "strengths": ["<point 1>", "<point 2>", "<point 3>"],
  "improvements": ["<area 1>", "<area 2>"],
  "suggestion": "<one concrete actionable next step>",
  "criteriaScores": [
    { "criterion": "<name>", "weight": <max>, "score": <earned>, "comment": "<brief>" }
  ]
}`;
}

// ── Build scientific writing feedback prompt (peer session) ───
export function buildSessionFeedbackPrompt({ question, instructions, examples, answer }) {
  return `You are an expert scientific writing coach evaluating a student's answer.

CONTEXT:
- Question: "${question}"
${instructions ? `- Teacher Instructions: "${instructions}"` : ""}
${examples     ? `- Model Answer Example:\n"${examples}"`   : ""}

STUDENT'S ANSWER:
"${answer}"

Respond ONLY with valid JSON (no markdown, no extra text):

{
  "score": <integer 0-20>,
  "basic": "<2-3 sentence overall assessment — explain WHY the answer is strong or weak>",
  "corrections": [
    {
      "original":   "<exact problematic sentence from the student answer>",
      "issue":      "<why this is weak>",
      "suggestion": "<improved version>"
    }
  ],
  "rewrite": "<a full improved version of the complete answer>"
}

SCORING (each criterion /5 → total /20):
- Clarity:             Is the writing clear and concise?
- Structure:           Is there a logical intro, body, conclusion?
- Argumentation:       Are claims supported with evidence or reasoning?
- Scientific Accuracy: Is the content factually correct and precise?`;
}

// ══════════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════════
router.post("/auth/register", async (req, res) => {
  try {
    const { name, email, password, role: userRole = "student", specialite } = req.body;
    const settings = await getPlatformSettings();
    if (settings.maintenance)
      return res.status(503).json({ message: "Plateforme en maintenance. Réessayez plus tard." });
    if (!settings.open_reg)
      return res.status(403).json({ message: "Les inscriptions sont fermées." });
    if (await User.findOne({ email })) return res.status(400).json({ message: "Email already in use" });
    if (!["student", "teacher"].includes(userRole))
      return res.status(400).json({ message: "Invalid role" });
    if (userRole === "student" && !specialite?.trim())
      return res.status(400).json({ message: "La spécialité / domaine est requis pour les apprenants." });

    const adminCount = await User.countDocuments({ role: "admin", status: "active" });
    const autoApprove =
      userRole === "teacher" ||
      settings.auto_approve_registrations ||
      adminCount === 0;

    const user = await User.create({
      name, email, password, role: userRole,
      specialite: userRole === "student" ? specialite.trim() : "",
      status: autoApprove ? "active" : "pending",
    });

    if (autoApprove) {
      const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
      return res.status(201).json({
        token,
        user: user.toSafeObject(),
        message: "Compte créé. Vous pouvez vous connecter.",
      });
    }

    res.status(201).json({
      pending: true,
      message: "Inscription enregistrée. Un administrateur doit valider votre compte avant la connexion.",
      user: user.toSafeObject(),
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post("/auth/login", async (req, res) => {
  try {
    const settings = await getPlatformSettings();
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ message: "Invalid credentials" });
    if (user.status === "banned") return res.status(403).json({ message: "Account suspended" });
    if (user.status === "pending")
      return res.status(403).json({ message: "Compte en attente de validation par l'administrateur.", pending: true });
    if (settings.maintenance && user.role !== "admin")
      return res.status(503).json({ message: "Plateforme en maintenance." });
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: user.toSafeObject() });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post("/auth/logout", (req, res) => {
  res.json({ message: "Logged out" });
});

router.get("/auth/me", async (req, res) => {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return res.status(401).json({ message: "Unauthorized" });
  try {
    const decoded = jwt.verify(h.slice(7), process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    res.json(user.toSafeObject());
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
});

// ══════════════════════════════════════════════════════════════
//  USERS  (admin)
// ══════════════════════════════════════════════════════════════
router.get("/users", auth, role("admin"), async (req, res) => {
  const { role: r, status, search, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (r)      filter.role   = r;
  if (status) filter.status = status;
  if (search) filter.$or = [
    { name:  { $regex: search, $options: "i" } },
    { email: { $regex: search, $options: "i" } },
  ];
  const [users, total] = await Promise.all([
    User.find(filter).skip((page - 1) * limit).limit(+limit).sort({ createdAt: -1 }),
    User.countDocuments(filter),
  ]);
  res.json({ users, total, page: +page, pages: Math.ceil(total / limit) });
});

router.patch("/users/:id/ban", auth, role("admin"), async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { status: "banned" }, { returnDocument: "after" });
  res.json(user?.toSafeObject());
});

router.patch("/users/:id/restore", auth, role("admin"), async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { status: "active" }, { returnDocument: "after" });
  res.json(user?.toSafeObject());
});

router.get("/users/stats", auth, role("admin"), async (req, res) => {
  const [total, teachers, students, banned, pending] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: "teacher", status: "active" }),
    User.countDocuments({ role: "student", status: "active" }),
    User.countDocuments({ status: "banned" }),
    User.countDocuments({ status: "pending" }),
  ]);
  res.json({ total, teachers, students, banned, pending });
});

// ══════════════════════════════════════════════════════════════
//  COURSES
// ══════════════════════════════════════════════════════════════
router.get("/courses", async (req, res) => {
  const { category, level, search, published, teacher } = req.query;
  const filter = {};
  if (published !== undefined) filter.published = published === "true";
  if (teacher && teacher !== "undefined") filter.teacher = teacher;
  if (category) filter.category = category;
  if (level)    filter.level    = level;
  if (search)   filter.title    = { $regex: search, $options: "i" };
  const courses = await Course.find(filter)
    .populate("teacher", "name avatar")
    .sort({ createdAt: -1 });
  res.json({ courses });
});

router.get("/courses/enrolled", auth, async (req, res) => {
  const enrollments = await Enrollment.find({ student: req.user.id })
    .populate({ path: "course", populate: { path: "teacher", select: "name" } });
  res.json({ courses: enrollments.map(e => ({ ...e.course.toObject(), progress: e.progress })) });
});

router.get("/courses/:id", async (req, res) => {
  const course = await Course.findById(req.params.id).populate("teacher", "name avatar bio");
  if (!course) return res.status(404).json({ message: "Course not found" });
  res.json({ course });
});

router.post("/courses", auth, role("teacher", "admin"), async (req, res) => {
  const course = await Course.create({ ...req.body, teacher: req.user.id });
  res.status(201).json({ course });
});

router.put("/courses/:id", auth, role("teacher", "admin"), async (req, res) => {
  const course = await Course.findOneAndUpdate(
    { _id: req.params.id, teacher: req.user.id },
    req.body, { returnDocument: "after", runValidators: true }
  );
  if (!course) return res.status(404).json({ message: "Not found or unauthorized" });
  res.json({ course });
});

router.patch("/courses/:id/publish", auth, role("teacher", "admin"), async (req, res) => {
  const course = await Course.findByIdAndUpdate(req.params.id, { published: true }, { returnDocument: "after" });
  res.json({ course });
});

router.post("/courses/:id/enroll", auth, async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course?.published) return res.status(400).json({ message: "Course not available" });
  const enrollment = await Enrollment.findOneAndUpdate(
    { student: req.user.id, course: req.params.id },
    { student: req.user.id, course: req.params.id },
    { upsert: true, returnDocument: "after" }
  );
  await Course.findByIdAndUpdate(req.params.id, { $inc: { enrollments: 1 } });
  res.status(201).json({ enrollment });
});

router.patch("/courses/:id/progress", auth, async (req, res) => {
  const { moduleId } = req.body;
  const course = await Course.findById(req.params.id);
  const enrollment = await Enrollment.findOne({ student: req.user.id, course: req.params.id });
  if (!enrollment) return res.status(404).json({ message: "Not enrolled" });
  if (!enrollment.completedModules.includes(moduleId)) {
    enrollment.completedModules.push(moduleId);
    enrollment.progress = Math.round((enrollment.completedModules.length / course.modules.length) * 100);
    if (enrollment.progress === 100) enrollment.completedAt = new Date();
    await enrollment.save();
  }
  res.json({ progress: enrollment.progress });
});

// ══════════════════════════════════════════════════════════════
//  ASSIGNMENTS
// ══════════════════════════════════════════════════════════════
router.get("/courses/:courseId/assignments", auth, async (req, res) => {
  const assignments = await Assignment.find({ course: req.params.courseId }).sort({ dueDate: 1 });
  res.json({ assignments });
});

router.post("/courses/:courseId/assignments", auth, role("teacher", "admin"), async (req, res) => {
  const assignment = await Assignment.create({ ...req.body, course: req.params.courseId, teacher: req.user.id });
  res.status(201).json({ assignment });
});

router.put("/assignments/:id", auth, role("teacher", "admin"), async (req, res) => {
  const assignment = await Assignment.findByIdAndUpdate(req.params.id, req.body, { returnDocument: "after" });
  res.json({ assignment });
});

// ══════════════════════════════════════════════════════════════
//  SUBMISSIONS
// ══════════════════════════════════════════════════════════════
router.get("/submissions", auth, role("teacher", "admin"), async (req, res) => {
  const { status, course, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (course) filter.course = course;
  if (req.user.role === "teacher") filter.course = { $in: await Course.find({ teacher: req.user.id }).distinct("_id") };
  const [submissions, total] = await Promise.all([
    Submission.find(filter)
      .populate("student", "name avatar email")
      .populate("assignment", "title maxScore")
      .populate("course", "title")
      .skip((page - 1) * limit).limit(+limit).sort({ submittedAt: -1 }),
    Submission.countDocuments(filter),
  ]);
  res.json({ submissions, total });
});

router.get("/submissions/mine", auth, async (req, res) => {
  const submissions = await Submission.find({ student: req.user.id })
    .populate("assignment", "title dueDate maxScore")
    .populate("course", "title")
    .sort({ submittedAt: -1 });
  res.json({ submissions });
});

router.post("/assignments/:assignmentId/submissions", auth, async (req, res) => {
  const assignment = await Assignment.findById(req.params.assignmentId);
  if (!assignment) return res.status(404).json({ message: "Assignment not found" });
  const existing = await Submission.findOne({ assignment: req.params.assignmentId, student: req.user.id });
  if (existing) return res.status(400).json({ message: "Already submitted" });
  const submission = await Submission.create({
    assignment: req.params.assignmentId,
    course: assignment.course,
    student: req.user.id,
    content: req.body.content,
    fileUrl: req.body.fileUrl || "",
  });
  if (assignment.aiFeedback?.enabled) {
    generateAndSaveFeedback(submission._id, assignment).catch(console.error);
  }
  res.status(201).json({ submission });
});

router.patch("/submissions/:id/grade", auth, role("teacher", "admin"), async (req, res) => {
  const { score, comment } = req.body;
  const submission = await Submission.findByIdAndUpdate(req.params.id,
    { score, teacherNote: comment, gradedBy: req.user.id, gradedAt: new Date(), status: "graded" },
    { returnDocument: "after" }
  );
  res.json({ submission });
});

// ══════════════════════════════════════════════════════════════
//  AI FEEDBACK  (assignment-based, Gemini)
// ══════════════════════════════════════════════════════════════
async function generateAndSaveFeedback(submissionId, assignment = null) {
  const submission = await Submission.findById(submissionId).populate("student");
  if (!submission) throw new Error("Submission not found");
  if (!assignment) assignment = await Assignment.findById(submission.assignment);

  const systemPrompt = "You are an expert educational feedback assistant. Respond ONLY with valid JSON, no markdown.";
  const userPrompt   = buildFeedbackPrompt(submission, assignment);

  const raw    = await askAI(systemPrompt, userPrompt);
  const clean  = raw.replace(/```json\n?|```\n?/g, "").trim();
  const parsed = JSON.parse(clean);

  const feedback = await Feedback.create({
    submission:     submissionId,
    student:        submission.student._id,
    generatedBy:    "ai",
    overallScore:   parsed.overallScore,
    level:          parsed.level,
    summary:        parsed.summary,
    strengths:      parsed.strengths,
    improvements:   parsed.improvements,
    suggestion:     parsed.suggestion,
    criteriaScores: parsed.criteriaScores,
    model:          "gemini-2.0-flash",
    promptTokens:   0,
    outputTokens:   0,
  });

  await Submission.findByIdAndUpdate(submissionId, { status: "ai_reviewed" });
  return feedback;
}

router.post("/feedback/generate", auth, async (req, res) => {
  try {
    const feedback = await generateAndSaveFeedback(req.body.submissionId);
    res.json({ success: true, feedback });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post("/feedback/generate-stream", auth, async (req, res) => {
  const submission = await Submission.findById(req.body.submissionId);
  const assignment = await Assignment.findById(submission?.assignment);
  if (!submission || !assignment) return res.status(404).json({ message: "Not found" });

  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.flushHeaders();

  let fullText = "";
  try {
    const systemPrompt = "You are an expert educational feedback assistant. Respond ONLY with valid JSON.";
    const userPrompt   = buildFeedbackPrompt(submission, assignment);

    fullText = await callAi(`${systemPrompt}\n\n${userPrompt}`, 1200);
    // Simulate streaming so client receives the full text as one chunk
    res.write(`data: ${JSON.stringify({ chunk: fullText })}\n\n`);

    const clean  = fullText.replace(/```json\n?|```\n?/g, "").trim();
    const parsed = JSON.parse(clean);
    const saved  = await Feedback.create({
      submission:  submission._id,
      student:     submission.student,
      generatedBy: "ai",
      model:       process.env.NVIDIA_API_KEY ? "nvidia" : "claude",
      ...parsed,
    });
    await Submission.findByIdAndUpdate(submission._id, { status: "ai_reviewed" });

    res.write(`data: ${JSON.stringify({ done: true, feedbackId: saved._id })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

router.post("/feedback/batch", auth, role("teacher", "admin"), async (req, res) => {
  const { courseId } = req.body;
  const pending = await Submission.find({ course: courseId, status: "pending" });
  const assignment = pending[0] ? await Assignment.findById(pending[0].assignment) : null;
  if (!assignment) return res.json({ processed: 0 });

  let processed = 0;
  for (const sub of pending) {
    try { await generateAndSaveFeedback(sub._id, assignment); processed++; }
    catch (e) { console.error(`Batch failed for ${sub._id}:`, e.message); }
  }
  res.json({ processed, total: pending.length });
});

router.get("/submissions/:id/feedback", auth, async (req, res) => {
  const feedbacks = await Feedback.find({ submission: req.params.id }).sort({ createdAt: -1 });
  res.json({ feedbacks });
});

router.patch("/feedback/:id/approve", auth, role("teacher", "admin"), async (req, res) => {
  const feedback = await Feedback.findByIdAndUpdate(req.params.id,
    { ...req.body, approvedBy: req.user.id, approvedAt: new Date(), releasedAt: new Date() },
    { returnDocument: "after" }
  );
  res.json({ feedback });
});

router.get("/feedback/mine", auth, async (req, res) => {
  const feedbacks = await Feedback.find({ student: req.user.id })
    .populate("submission", "content submittedAt")
    .sort({ createdAt: -1 });
  res.json({ feedbacks });
});

// ══════════════════════════════════════════════════════════════
//  PEER REVIEWS
// ══════════════════════════════════════════════════════════════
router.post("/submissions/:id/peer-review", auth, async (req, res) => {
  const review = await PeerReview.create({
    submission: req.params.id,
    reviewer:   req.user.id,
    score:      req.body.score,
    comment:    req.body.comment,
    criteria:   req.body.criteria || [],
  });
  await Feedback.create({
    submission:   req.params.id,
    student:      (await Submission.findById(req.params.id)).student,
    generatedBy:  "peer",
    peer:         req.user.id,
    overallScore: req.body.score,
    summary:      req.body.comment,
    strengths:    [],
    improvements: [],
  });
  res.status(201).json({ review });
});

// ══════════════════════════════════════════════════════════════
//  ANALYTICS
// ══════════════════════════════════════════════════════════════
router.get("/analytics/platform", auth, role("admin"), async (req, res) => {
  const [users, courses, submissions, feedbacks] = await Promise.all([
    User.countDocuments(),
    Course.countDocuments({ published: true }),
    Submission.countDocuments(),
    Feedback.countDocuments({ generatedBy: { $in: ["claude", "ai"] } }),
  ]);
  res.json({ users, courses, submissions, aiFeedbacks: feedbacks, revenue: users * 4.5 });
});

router.get("/analytics/teacher", auth, role("teacher", "admin"), async (req, res) => {
  const teacherCourses = await Course.find({ teacher: req.user.id }).distinct("_id");
  const [students, submissions, pending] = await Promise.all([
    Enrollment.countDocuments({ course: { $in: teacherCourses } }),
    Submission.countDocuments({ course: { $in: teacherCourses } }),
    Submission.countDocuments({ course: { $in: teacherCourses }, status: "pending" }),
  ]);
  res.json({ courses: teacherCourses.length, students, submissions, pending });
});

router.get("/analytics/student", auth, async (req, res) => {
  const [enrolled, submissions, feedbacks] = await Promise.all([
    Enrollment.countDocuments({ student: req.user.id }),
    Submission.countDocuments({ student: req.user.id }),
    Feedback.countDocuments({ student: req.user.id }),
  ]);
  const scored = await Submission.find({ student: req.user.id, score: { $ne: null } });
  const avgScore = scored.length
    ? Math.round(scored.reduce((s, x) => s + x.score, 0) / scored.length)
    : null;
  res.json({ enrolled, submissions, feedbacks, avgScore });
});

// ══════════════════════════════════════════════════════════════
//  FOLLOW SYSTEM
// ══════════════════════════════════════════════════════════════
router.post("/follow", auth, async (req, res) => {
  try {
    if (req.user.role !== "student")
      return res.status(403).json({ message: "Only students can follow teachers" });
    const { teacherId } = req.body;
    if (!teacherId) return res.status(400).json({ message: "teacherId required" });
    const teacher = await User.findById(teacherId);
    if (!teacher || teacher.role !== "teacher")
      return res.status(404).json({ message: "Teacher not found" });
    await Follow.findOneAndUpdate(
      { student: req.user.id, teacher: teacherId },
      { student: req.user.id, teacher: teacherId },
      { upsert: true, returnDocument: "after" }
    );
    res.status(201).json({ following: true, teacherId });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete("/follow", auth, async (req, res) => {
  try {
    const { teacherId } = req.body;
    if (!teacherId) return res.status(400).json({ message: "teacherId required" });
    await Follow.findOneAndDelete({ student: req.user.id, teacher: teacherId });
    res.json({ following: false, teacherId });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get("/follow/status/:teacherId", auth, async (req, res) => {
  try {
    const doc = await Follow.findOne({ student: req.user.id, teacher: req.params.teacherId });
    res.json({ following: !!doc });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get("/teachers", auth, async (req, res) => {
  try {
    const teachers = await User.find({ role: "teacher", status: "active" })
      .select("name avatar bio")
      .sort({ name: 1 });
    res.json({ teachers });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ══════════════════════════════════════════════════════════════
//  SESSIONS  (PeerSession — existing flow)
// ══════════════════════════════════════════════════════════════
router.post("/sessions", auth, role("teacher", "admin"), async (req, res) => {
  try {
    const { question } = req.body;
    if (!question?.trim()) return res.status(400).json({ message: "question required" });

    let code, attempts = 0;
    do {
      code = Math.random().toString(36).slice(2, 8).toUpperCase();
      if (++attempts > 10) return res.status(500).json({ message: "Could not generate unique code" });
    } while (await PeerSession.exists({ code }));

    const session = await PeerSession.create({
      code,
      teacher:  req.user.id,
      question: question.trim(),
      phase:    "waiting",
    });

    // Notify ALL students enrolled in this teacher's courses (ignore "follow" rule)
    const teacher = await User.findById(req.user.id).select("name");
    const teacherCourses = await Course.find({ teacher: req.user.id }).distinct("_id");
    const enrollments = await Enrollment.find({ course: { $in: teacherCourses } }).select("student");
    const studentIds = [...new Set(enrollments.map(e => e.student?.toString()).filter(Boolean))];

    if (studentIds.length > 0 && teacher) {
      const notificationDocs = studentIds.map(studentId => ({
        userId:      studentId,
        teacherName: teacher.name,
        question:    question.trim(),
        joinCode:    code,
        read:        false,
      }));
      await Notification.insertMany(notificationDocs);

      const io      = getIO();
      const payload = { teacherName: teacher.name, question: question.trim(), joinCode: code };
      for (const studentId of studentIds) {
        io.to(studentId).emit("new_session", payload);
      }
    }

    res.status(201).json({
      session:        { id: session._id, code: session.code, question: session.question },
      notifiedCount:  studentIds.length,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get("/sessions/active", auth, async (req, res) => {
  try {
    const follows    = await Follow.find({ student: req.user.id }).select("teacher");
    const teacherIds = follows.map(f => f.teacher);
    if (teacherIds.length === 0) return res.json({ sessions: [] });

    const sessions = await PeerSession.find({
      teacher:   { $in: teacherIds },
      phase:     { $ne: "done" },
      expiresAt: { $gt: new Date() },
    })
      .populate("teacher", "name avatar")
      .select("code question phase teacher allMembers groups currentRound createdAt expiresAt")
      .sort({ createdAt: -1 });

    const formatted = sessions.map(s => ({
      id:           s._id,
      code:         s.code,
      question:     s.question,
      phase:        s.phase,
      teacher:      s.teacher,
      currentRound: s.currentRound,
      totalMembers: s.allMembers?.length  || 0,
      totalGroups:  s.groups?.length      || 0,
      hasJoined:    s.allMembers?.some(m  => m.toString() === req.user.id) || false,
      createdAt:    s.createdAt,
      expiresAt:    s.expiresAt,
    }));
    res.json({ sessions: formatted });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Section-level progress for teacher dashboard ─────────────────────────────
router.get("/sessions/:sessionId/section-progress", auth, async (req, res) => {
  try {
    const session = await Session.findById(req.params.sessionId).lean();
    if (!session) return res.status(404).json({ message: "Session not found" });

    const userId = String(req.user.id);
    if (req.user.role !== "admin") {
      const isTeacher = String(session.createdBy) === userId;
      const isStudent = (session.students || []).some(s =>
        String(s.userId || s.id || "").startsWith(userId)
      );
      if (!isTeacher && !isStudent) return res.status(403).json({ message: "Forbidden" });
    }

    const selectedSections = session.selectedSections || [];
    const submissions = await SessionSubmission.find({ sessionId: req.params.sessionId })
      .select("studentId studentName round sectionKey sectionAnswers sectionScores aiScore aiFeedback peerReviews submittedAt")
      .lean();

    // Build per-student aggregated data
    const studentMap = new Map();
    for (const sub of submissions) {
      const key = String(sub.studentId);
      if (!studentMap.has(key)) {
        studentMap.set(key, {
          studentId: sub.studentId,
          studentName: sub.studentName,
          sectionScores: {},
          submissions: [],
          lastActivityAt: null,
        });
      }
      const entry = studentMap.get(key);
      entry.submissions.push(sub);

      const subAt = sub.submittedAt ? new Date(sub.submittedAt) : null;
      if (subAt && (!entry.lastActivityAt || subAt > entry.lastActivityAt)) {
        entry.lastActivityAt = subAt;
      }

      // Merge sectionScores from the document field
      if (sub.sectionScores && typeof sub.sectionScores === "object") {
        for (const [sk, sv] of Object.entries(sub.sectionScores)) {
          const existing = entry.sectionScores[sk];
          const svAt = sv?.submittedAt ? new Date(sv.submittedAt) : new Date(0);
          const existAt = existing?.submittedAt ? new Date(existing.submittedAt) : new Date(0);
          if (!existing || svAt > existAt) entry.sectionScores[sk] = sv;
        }
      }

      // Fallback: derive from aiScore + sectionKey when sectionScores not yet written
      if (sub.sectionKey && Number.isFinite(Number(sub.aiScore)) && !entry.sectionScores[sub.sectionKey]) {
        entry.sectionScores[sub.sectionKey] = {
          score: Number(sub.aiScore),
          submittedAt: sub.submittedAt,
        };
      }
    }

    // Build student list with completed sections
    const students = [];
    for (const [, entry] of studentMap) {
      const completedSections = selectedSections.filter(sk =>
        entry.submissions.some(sub => {
          const sa = sub.sectionAnswers || {};
          return (sa[sk] && String(sa[sk]).trim()) ||
            (sub.sectionKey === sk && String(sub.content || "").trim());
        })
      );

      // Last section = most recently submitted sectionKey
      const lastSub = [...entry.submissions]
        .filter(s => s.sectionKey)
        .sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0))[0];
      const lastSectionKey = lastSub?.sectionKey || completedSections.at(-1) || "";

      // Peer review average per section
      const peerAverages = {};
      for (const sub of entry.submissions) {
        const sk = sub.sectionKey || "";
        if (!sk) continue;
        const scores = (sub.peerReviews || []).flatMap(pr => {
          const r = pr.ratings || {};
          return ["clarity", "structure", "argumentation", "scientific"]
            .map(k => Number(r[k] || 0))
            .filter(Boolean);
        });
        if (scores.length) peerAverages[sk] = Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2));
      }

      students.push({
        studentId: entry.studentId,
        studentName: entry.studentName,
        sectionScores: entry.sectionScores,
        peerAverages,
        completedSections,
        lastSectionKey,
        lastActivityAt: entry.lastActivityAt,
      });
    }

    // Build group progress
    const groupProgress = (session.groups || []).map((group, idx) => {
      const memberData = (group.members || []).map(m => {
        const mId = String(m.userId || m.id || "");
        const studData = students.find(s => {
          const sId = String(s.studentId || "");
          return sId === mId || sId.startsWith(mId + "::") || mId.startsWith(sId + "::");
        });
        return {
          id: m.id,
          name: m.name,
          isReceiver: m.isReceiver,
          completedSections: studData?.completedSections || [],
          lastSectionKey: studData?.lastSectionKey || "",
          sectionScores: studData?.sectionScores || {},
        };
      });

      const sectionsAllDone = selectedSections.filter(sk =>
        memberData.length > 0 && memberData.every(m => m.completedSections.includes(sk))
      );
      const lastActivities = memberData
        .map(m => students.find(s => s.studentName === m.name)?.lastActivityAt)
        .filter(Boolean)
        .sort((a, b) => new Date(b) - new Date(a));

      return {
        groupIndex: idx,
        members: memberData.map(({ id, name, isReceiver }) => ({ id, name, isReceiver })),
        sectionsCompleted: sectionsAllDone,
        currentSectionKey: session.currentSectionKey || "",
        lastActivityAt: lastActivities[0] || null,
      };
    });

    // Section-level stats
    const sectionStats = {};
    for (const sk of selectedSections) {
      const scores = students
        .map(s => s.sectionScores[sk]?.score)
        .filter(v => Number.isFinite(Number(v)))
        .map(Number);
      const submitted = students.filter(s => s.completedSections.includes(sk)).length;
      sectionStats[sk] = {
        avgScore: scores.length ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)) : null,
        maxScore: scores.length ? Math.max(...scores) : null,
        minScore: scores.length ? Math.min(...scores) : null,
        submitted,
        total: students.length,
        completionRate: students.length > 0 ? Number((submitted / students.length).toFixed(2)) : 0,
      };
    }

    res.json({
      sessionId: session._id,
      code: session.code,
      phase: session.phase,
      currentSectionKey: session.currentSectionKey || "",
      currentSectionIndex: session.currentSectionIndex || 0,
      selectedSections,
      configuredTimings: session.sectionTimings || {},
      timings: session.sectionTimerLog || [],
      students,
      groups: groupProgress,
      sectionStats,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/sessions/history", auth, async (req, res) => {
  try {
    const role = req.user.role;
    const uid = String(req.user.id);
    const studentIdRegex = new RegExp(`^${uid}(::|$)`);

    if (role === "teacher" || role === "admin") {
      const sessions = await Session.find({ createdBy: uid })
        .select("code question phase selectedSections currentSectionKey currentRound createdAt updatedAt")
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

      const sessionIds = sessions.map(s => s._id);
      const submissions = await SessionSubmission.find({ sessionId: { $in: sessionIds } })
        .select("sessionId studentId studentName aiScore peerReviews submittedAt")
        .lean();

      const bySession = new Map();
      for (const s of sessions) bySession.set(String(s._id), { submissions: 0, uniqueStudents: new Set(), reviews: 0, avgAi: [] });
      for (const sub of submissions) {
        const key = String(sub.sessionId);
        const bucket = bySession.get(key);
        if (!bucket) continue;
        bucket.submissions += 1;
        bucket.uniqueStudents.add(String(sub.studentId || ""));
        bucket.reviews += Array.isArray(sub.peerReviews) ? sub.peerReviews.length : 0;
        if (Number.isFinite(Number(sub.aiScore))) bucket.avgAi.push(Number(sub.aiScore));
      }

      const history = sessions.map(s => {
        const m = bySession.get(String(s._id));
        const avgAi = m?.avgAi?.length ? (m.avgAi.reduce((a, b) => a + b, 0) / m.avgAi.length) : null;
        return {
          sessionId: s._id,
          code: s.code,
          question: s.question,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          phase: s.phase,
          currentRound: s.currentRound || 1,
          currentSectionKey: s.currentSectionKey || s.selectedSections?.[0] || "",
          interactions: {
            submissions: m?.submissions || 0,
            participants: m?.uniqueStudents?.size || 0,
            peerReviews: m?.reviews || 0,
            avgAiScore: avgAi != null ? Number(avgAi.toFixed(2)) : null,
          },
        };
      });
      return res.json({ history });
    }

    const mySubs = await SessionSubmission.find({ studentId: studentIdRegex })
      .select("sessionId studentId studentName sectionKey aiScore peerReviews submittedAt createdAt")
      .sort({ submittedAt: -1 })
      .limit(200)
      .lean();
    const sessionIds = [...new Set(mySubs.map(s => String(s.sessionId)))];
    const sessions = await Session.find({ _id: { $in: sessionIds } })
      .select("code question phase currentRound currentSectionKey selectedSections createdAt updatedAt")
      .lean();
    const sessionById = new Map(sessions.map(s => [String(s._id), s]));

    const history = mySubs.map(sub => {
      const session = sessionById.get(String(sub.sessionId));
      return {
        sessionId: sub.sessionId,
        code: session?.code || "—",
        question: session?.question || "",
        sectionKey: sub.sectionKey || session?.currentSectionKey || session?.selectedSections?.[0] || "",
        submittedAt: sub.submittedAt || sub.createdAt,
        phase: session?.phase || "done",
        currentRound: session?.currentRound || 1,
        interactions: {
          peerReviewsReceived: Array.isArray(sub.peerReviews) ? sub.peerReviews.length : 0,
          aiScore: Number.isFinite(Number(sub.aiScore)) ? Number(sub.aiScore) : null,
        },
      };
    });
    return res.json({ history });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  SCIENTIFIC WRITING SESSIONS  (new — video + AI feedback)
// ══════════════════════════════════════════════════════════════

// GET /api/students/groups-by-specialty — teacher cible les groupes par spécialité
router.get("/students/groups-by-specialty", auth, role("teacher", "admin"), async (req, res) => {
  try {
    const teacherCourses = await Course.find({ teacher: req.user.id }).distinct("_id");
    const enrollments = await Enrollment.find({ course: { $in: teacherCourses } })
      .populate({ path: "student", select: "name email specialite status" });
    const seen = new Set();
    const groups = {};
    let pendingCount = 0;
    for (const e of enrollments) {
      const st = e.student;
      if (!st) continue;
      // Include active AND pending students (pending shown with flag)
      if (!["active", "pending"].includes(st.status)) continue;
      const id = String(st._id);
      if (seen.has(id)) continue;
      seen.add(id);
      const spec = (st.specialite || "Autre").trim() || "Autre";
      if (!groups[spec]) groups[spec] = [];
      const isPending = st.status === "pending";
      if (isPending) pendingCount++;
      groups[spec].push({ id, name: st.name, email: st.email, specialite: spec, pending: isPending });
    }
    const list = Object.entries(groups)
      .map(([specialite, students]) => ({
        specialite,
        count: students.length,
        activeCount: students.filter(s => !s.pending).length,
        students,
      }))
      .sort((a, b) => a.specialite.localeCompare(b.specialite, "fr"));
    res.json({ groups: list, totalStudents: seen.size, pendingCount });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/sessions/received — articles / ressources publiées pour l'étudiant
router.get("/sessions/received", auth, role("student"), async (req, res) => {
  try {
    const student = await User.findById(req.user.id).select("specialite");
    const spec = (student?.specialite || "").trim();
    const enrollments = await Enrollment.find({ student: req.user.id }).select("course");
    const courseIds = enrollments.map(e => e.course);
    const teacherIds = await Course.find({ _id: { $in: courseIds } }).distinct("teacher");

    const sessionsRaw = await Session.find({ createdBy: { $in: teacherIds } })
      .populate("createdBy", "name")
      .select("code question instructions docType resourceType activityMode missingSection articleSections articleFileUrl articleFileName articleFileMime selectedSections evaluationCriteria targetSpecialites createdAt videoUrl")
      .sort({ createdAt: -1 })
      .limit(120)
      .lean();

    const sessions = sessionsRaw.filter(s => {
      const targets = s.targetSpecialites || [];
      if (!targets.length) return true;
      if (!spec) return true;
      return targets.includes(spec);
    }).slice(0, 80);

    res.json({
      resources: sessions.map(s => ({
        sessionId: s._id,
        code: s.code,
        question: s.question,
        instructions: s.instructions,
        docType: s.docType,
        resourceType: s.resourceType || "article",
        activityMode: s.activityMode || "section_learn",
        missingSection: s.missingSection,
        articleSections: s.articleSections || {},
        articleFileUrl: s.articleFileUrl || null,
        articleFileName: s.articleFileName || "",
        articleFileMime: s.articleFileMime || "",
        selectedSections: s.selectedSections || [],
        evaluationCriteria: s.evaluationCriteria || {},
        targetSpecialites: s.targetSpecialites || [],
        teacherName: s.createdBy?.name || "",
        createdAt: s.createdAt,
        videoUrl: s.videoUrl,
      })),
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/sessions/create  — teacher creates session with video + instructions
router.post("/sessions/create", auth, role("teacher", "admin"), uploadSessionMedia.fields([
  { name: "video", maxCount: 1 },
  { name: "article", maxCount: 1 },
]), async (req, res) => {
  try {
    const { question, instructions, examples, criteria, sessionConfig } = req.body;
    if (!question?.trim()) return res.status(400).json({ message: "question required" });

    // Scheduled session support
    const scheduledAtRaw = req.body.scheduledAt;
    const scheduledAt = scheduledAtRaw ? new Date(scheduledAtRaw) : null;
    const isScheduled = !!(scheduledAt && scheduledAt > new Date());

    let code, attempts = 0;
    do {
      code = Math.random().toString(36).slice(2, 7).toUpperCase();
      if (++attempts > 10) return res.status(500).json({ message: "Could not generate unique code" });
    } while (await Session.exists({ code }));

    const selectedSections = JSON.parse(req.body.selectedSections || "[]");
    let articleSections = JSON.parse(req.body.articleSections || "{}");
    const missingSection = req.body.missingSection || "";
    const articleFile = req.files?.article?.[0];
    const targetSpecialites = JSON.parse(req.body.targetSpecialites || "[]");
    const activityMode = req.body.activityMode === "full_read" ? "full_read" : "section_learn";

    const session = await Session.create({
      code,
      question:     question.trim(),
      instructions: instructions  || "",
      examples:     examples      || "",
      criteria:     JSON.parse(criteria || "[]"),
      docType:      req.body.docType || "article",
      resourceType: req.body.resourceType || "article",
      activityMode,
      language:     req.body.language || "FR + EN (auto)",
      selectedSections,
      evaluationCriteria: JSON.parse(req.body.evaluationCriteria || "{}"),
      articleSections,
      articleFileUrl:     articleFile ? `/uploads/articles/${articleFile.filename}` : null,
      articleFileName:    articleFile?.originalname || "",
      articleFileMime:    articleFile?.mimetype || "",
      missingSection:     activityMode === "section_learn" ? (missingSection || selectedSections[0] || "") : "",
      articleTextContent: req.body.articleTextContent || "",
      sectionGuidance:    JSON.parse(req.body.sectionGuidance || "{}"),
      sectionTimings:     JSON.parse(req.body.sectionTimings || "{}"),
      targetSpecialites: Array.isArray(targetSpecialites) ? targetSpecialites : [],
      sessionConfig: sessionConfig ? JSON.parse(sessionConfig) : undefined,
      videoUrl:     req.files?.video?.[0] ? `/uploads/videos/${req.files.video[0].filename}` : null,
      createdBy:    req.user.id,
      currentSectionIndex: 0,
      currentSectionKey:   missingSection || selectedSections[0] || "",
      totalRounds: 1,
      currentRound: 1,
      scheduledAt:  isScheduled ? scheduledAt : null,
      isScheduled:  !!isScheduled,
    });

    // Notify students enrolled in teacher's courses, filtered by spécialité if set
    let notifiedCount = 0;
    try {
      const teacher = await User.findById(req.user.id).select("name");
      const teacherCourses = await Course.find({ teacher: req.user.id }).distinct("_id");
      const enrollments = await Enrollment.find({ course: { $in: teacherCourses } })
        .populate({ path: "student", select: "_id specialite status" });
      const targets = targetSpecialites.length > 0 ? new Set(targetSpecialites) : null;
      const studentIds = [...new Set(
        enrollments
          .filter(e => {
            const st = e.student;
            if (!st || st.status !== "active") return false;
            if (!targets) return true;
            const spec = (st.specialite || "Autre").trim() || "Autre";
            return targets.has(spec);
          })
          .map(e => e.student._id?.toString())
          .filter(Boolean)
      )];
      notifiedCount = studentIds.length;

      // Cache student IDs in session for scheduler auto-activation
      if (isScheduled && studentIds.length > 0) {
        await Session.findByIdAndUpdate(session._id, { targetStudentIds: studentIds });
      }

      if (studentIds.length > 0 && teacher) {
        const appUrl = process.env.FRONTEND_URL || "http://localhost:5173";
        const studentDocs = await User.find({ _id: { $in: studentIds } }).select("email name").lean();

        if (isScheduled) {
          // ── Scheduled session: send announcement email, no live socket event ──
          const scheduledLabel = scheduledAt.toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short" });
          const missingSection = session.missingSection || "";
          for (const st of studentDocs) {
            if (!st.email) continue;
            sendEmail({
              to: st.email,
              subject: `📅 Session planifiée — ${teacher.name}`,
              html: `
                <div style="font-family:sans-serif;max-width:540px;margin:0 auto;padding:24px;background:#f7f8fc;border-radius:12px;">
                  <div style="background:#1a1d23;border-radius:10px;padding:20px 24px;color:#fff;margin-bottom:20px;">
                    <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">Session planifiée — EduLearn</p>
                    <h2 style="margin:0;font-size:20px;font-weight:700;">${teacher.name} a planifié une session</h2>
                  </div>
                  <div style="background:#eef2ff;border-radius:10px;padding:16px 20px;border:1.5px solid #c7d2fe;margin-bottom:16px;text-align:center;">
                    <p style="margin:0 0 4px;font-size:11px;color:#6366f1;font-weight:700;text-transform:uppercase;letter-spacing:.05em;">📅 Date de la session</p>
                    <p style="margin:0;font-size:20px;font-weight:800;color:#1a1d23;">${scheduledLabel}</p>
                  </div>
                  <div style="background:#fff;border-radius:10px;padding:16px 20px;border:1px solid #eaecf0;margin-bottom:16px;">
                    <p style="margin:0 0 6px;font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;">Sujet</p>
                    <p style="margin:0;font-size:15px;color:#1a1d23;font-weight:600;line-height:1.5;">${question.trim()}</p>
                  </div>
                  <div style="display:flex;gap:12px;margin-bottom:20px;">
                    <div style="flex:1;background:#fff;border-radius:10px;padding:14px 16px;border:1px solid #eaecf0;">
                      <p style="margin:0 0 4px;font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;">Code session</p>
                      <p style="margin:0;font-size:22px;font-weight:800;color:#6c63ff;letter-spacing:3px;">${code}</p>
                    </div>
                    ${missingSection ? `<div style="flex:1;background:#fff;border-radius:10px;padding:14px 16px;border:1px solid #eaecf0;">
                      <p style="margin:0 0 4px;font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;">Section à préparer</p>
                      <p style="margin:0;font-size:15px;font-weight:800;color:#f59e0b;">${missingSection}</p>
                    </div>` : ""}
                  </div>
                  <div style="background:#f0fdf4;border-radius:10px;padding:12px 16px;border:1px solid #bbf7d0;margin-bottom:20px;font-size:12px;color:#166534;">
                    💡 Préparez la section <strong>${missingSection || "indiquée"}</strong> avant la session. Un rappel vous sera envoyé à l'ouverture.
                  </div>
                  <a href="${appUrl}/student" style="display:block;background:#6c63ff;color:#fff;text-align:center;padding:13px;border-radius:9px;text-decoration:none;font-weight:700;font-size:14px;">
                    Voir mes sessions →
                  </a>
                  <p style="margin:16px 0 0;font-size:11px;color:#9ca3af;text-align:center;">EduLearn — Plateforme d'apprentissage collaboratif</p>
                </div>`,
            }).catch(e => console.error("[Scheduled email]", e.message));
          }
        } else {
          // ── Instant session: live socket + email ──
          const notificationDocs = studentIds.map(studentId => ({
            userId:      studentId,
            teacherName: teacher.name,
            question:    question.trim(),
            joinCode:    code,
            read:        false,
          }));
          await Notification.insertMany(notificationDocs);

          const io = getIO();
          const payload = { teacherName: teacher.name, question: question.trim(), joinCode: code };
          for (const studentId of studentIds) {
            io.to(studentId).emit("new_session", payload);
          }

          const startedAt = new Date().toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short" });
          for (const st of studentDocs) {
            if (!st.email) continue;
            sendEmail({
              to: st.email,
              subject: `📚 Nouvelle session disponible — ${teacher.name}`,
              html: `
                <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f7f8fc;border-radius:12px;">
                  <div style="background:#1a1d23;border-radius:10px;padding:20px 24px;color:#fff;margin-bottom:20px;">
                    <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">Session pairs — EduLearn</p>
                    <h2 style="margin:0;font-size:20px;font-weight:700;">${teacher.name} vous invite</h2>
                  </div>
                  <div style="background:#fff;border-radius:10px;padding:20px 24px;border:1px solid #eaecf0;margin-bottom:16px;">
                    <p style="margin:0 0 8px;font-size:12px;color:#9ca3af;text-transform:uppercase;font-weight:600;">Sujet de la session</p>
                    <p style="margin:0;font-size:16px;color:#1a1d23;font-weight:600;line-height:1.5;">${question.trim()}</p>
                  </div>
                  <div style="background:#fff;border-radius:10px;padding:16px 24px;border:1px solid #eaecf0;margin-bottom:20px;display:flex;gap:24px;">
                    <div>
                      <p style="margin:0 0 4px;font-size:11px;color:#9ca3af;font-weight:600;">CODE DE REJOINDRE</p>
                      <p style="margin:0;font-size:24px;font-weight:800;color:#6c63ff;letter-spacing:3px;">${code}</p>
                    </div>
                    <div>
                      <p style="margin:0 0 4px;font-size:11px;color:#9ca3af;font-weight:600;">LANCÉE LE</p>
                      <p style="margin:0;font-size:13px;font-weight:600;color:#1a1d23;">${startedAt}</p>
                    </div>
                  </div>
                  <a href="${appUrl}/student/peer" style="display:block;background:#6c63ff;color:#fff;text-align:center;padding:13px;border-radius:9px;text-decoration:none;font-weight:700;font-size:14px;">
                    ◈ Rejoindre la session →
                  </a>
                  <p style="margin:16px 0 0;font-size:11px;color:#9ca3af;text-align:center;">EduLearn — Plateforme d'apprentissage collaboratif</p>
                </div>`,
            }).catch(e => console.error("[Session email]", e.message));
          }
        }
      }
    } catch (e) {
      console.error("Notify followers failed:", e.message);
    }

    res.status(201).json({
      success: true, code, sessionId: session._id, notifiedCount,
      scheduled: isScheduled, scheduledAt: isScheduled ? scheduledAt : null,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/sessions/ai-feedback  — generate Claude feedback for a student answer
router.post("/sessions/ai-feedback", auth, async (req, res) => {
  try {
    const { sessionId, studentId, answer, round } = req.body;

    const session = await Session.findById(sessionId);
    if (!session) return res.status(404).json({ message: "Session not found" });

    const prompt = buildSessionFeedbackPrompt({
      question:     session.question,
      instructions: session.instructions,
      examples:     session.examples,
      answer,
    });

    const response = await anthropic.messages.create({
      model:      "claude-opus-4-5",
      max_tokens: 1500,
      messages:   [{ role: "user", content: prompt }],
    });

    let parsed;
    try {
      parsed = JSON.parse(response.content[0].text.replace(/```json|```/g, "").trim());
    } catch {
      parsed = { basic: response.content[0].text, corrections: [], rewrite: "", score: 10 };
    }

    await SessionSubmission.findOneAndUpdate(
      { sessionId, studentId, round },
      { aiFeedback: parsed, aiScore: parsed.score, content: answer },
      { upsert: true, returnDocument: "after" }
    );

    res.json({ feedback: parsed, score: parsed.score });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/sessions/assist-peer-feedback — guide student peer review (no direct Anthropic from browser)
router.post("/sessions/assist-peer-feedback", auth, async (req, res) => {
  try {
    const { sessionId, question, sectionKey, peerAnswer, draftComment } = req.body;
    if (!peerAnswer?.trim()) return res.status(400).json({ message: "peerAnswer required" });

    let contextQuestion = question || "";
    if (sessionId) {
      const session = await Session.findById(sessionId).select("question instructions");
      if (session) {
        contextQuestion = session.question || contextQuestion;
      }
    }

    const prompt = `You help university students write constructive peer feedback on scientific writing.
Respond ONLY with valid JSON (no markdown):

{
  "strengths": ["<specific strength 1>", "<strength 2>"],
  "weaknesses": ["<specific weakness 1>", "<weakness 2>"],
  "inconsistencies": ["<logical or factual inconsistency if any>"],
  "tips": ["<actionable tip for the reviewer>"],
  "suggestedComment": "<3-6 sentences of constructive peer feedback in French, academic tone>"
}

CONTEXT:
- Research question: "${contextQuestion}"
${sectionKey ? `- Section reviewed: "${sectionKey}"` : ""}

PEER'S TEXT TO REVIEW:
"${String(peerAnswer).slice(0, 6000)}"

${draftComment?.trim() ? `REVIEWER'S DRAFT COMMENT:\n"${String(draftComment).slice(0, 2000)}"\nImprove and complete this draft.` : "The reviewer has not written a comment yet. Suggest a full constructive comment."}

Be specific, reference the text, and stay formative (not punitive).`;

    const raw = await callAi(prompt, 600);
    let assist;
    try {
      assist = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch {
      assist = { strengths: [], weaknesses: [], inconsistencies: [], tips: [], suggestedComment: raw };
    }
    res.json({ assist });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sessions/extract-text — extract text from PDF/Word/text file
const uploadDoc = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});
router.post("/sessions/extract-text", auth, uploadDoc.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ message: "Aucun fichier reçu." });

    const ext = (file.originalname || "").split(".").pop().toLowerCase();

    // Plain text / markdown — return as-is
    if (["txt", "md", "text"].includes(ext) || file.mimetype?.startsWith("text/")) {
      const text = file.buffer.toString("utf-8");
      return res.json({ text, method: "text", chars: text.length });
    }

    // PDF — try free local extraction first; Claude OCR only for truly scanned PDFs
    if (ext === "pdf" || file.mimetype === "application/pdf") {
      // Step 1: pdf-parse
      let localText = "";
      try {
        const parsed = await pdfParse(file.buffer);
        localText = (parsed.text || "").trim();
      } catch { /* fall through */ }

      // Step 2: pdfjs-dist (handles more PDF types/encodings)
      if (localText.length < 60) {
        try {
          const uint8 = new Uint8Array(file.buffer);
          const doc = await pdfjsLib.getDocument({ data: uint8, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
          const pages = [];
          for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();
            pages.push(content.items.map(item => item.str).join(" "));
          }
          localText = pages.join("\n").trim();
        } catch { /* fall through */ }
      }

      if (localText.length >= 60) {
        return res.json({ text: localText, method: "pdf-local", chars: localText.length });
      }

      // Step 3: scanned PDF — Claude OCR (requires API credits)
      try {
        const base64 = file.buffer.toString("base64");
        const response = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 6000,
          messages: [{
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
              { type: "text", text: "Extrait TOUT le texte de ce PDF en préservant exactement la structure : titres de sections en majuscules ou sur leur propre ligne, paragraphes séparés par des sauts de ligne. Retourne UNIQUEMENT le texte brut, sans commentaire, sans balise markdown." },
            ],
          }],
        });
        const text = response.content[0].text || "";
        return res.json({ text, method: "claude-ocr", chars: text.length });
      } catch (ocrErr) {
        const msg = ocrErr.message || "";
        if (msg.includes("credit balance") || msg.includes("402") || ocrErr.status === 400) {
          return res.status(402).json({ message: "OCR_CREDITS_EXHAUSTED" });
        }
        throw ocrErr;
      }
    }

    return res.status(415).json({ message: "Format non supporté. Utilisez PDF, .txt ou .md." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sessions/generate-starters — AI-generated sentence starters for a section
router.post("/sessions/generate-starters", auth, async (req, res) => {
  try {
    const { sectionName, criteria = [], docType = "article" } = req.body;
    if (!sectionName) return res.status(400).json({ message: "sectionName required" });

    const criteriaText = criteria.length
      ? criteria.map((c, i) => `${i + 1}. ${c}`).join("\n")
      : "Critères standards IMRAD";

    const prompt = `Tu es expert en rédaction scientifique académique (articles IMRAD, mémoires PFE).
Génère exactement 5 amorces de phrases en français pour aider un étudiant à rédiger la section "${sectionName}" d'un ${docType === "memoire" ? "mémoire PFE" : "article scientifique"}.

Critères d'évaluation de la section :
${criteriaText}

Règles :
- Chaque amorce doit commencer une phrase académique et se terminer par "…"
- Elles doivent être variées : contexte, argument, comparaison, limite, perspective
- Ton académique et formel en français
- Adapter spécifiquement à la section "${sectionName}" et à ses critères

Réponds UNIQUEMENT avec un tableau JSON valide (sans markdown) :
["amorce 1…", "amorce 2…", "amorce 3…", "amorce 4…", "amorce 5…"]`;

    const raw = await callAi(prompt, 400);
    let starters;
    try {
      starters = JSON.parse(raw.replace(/```json|```/g, "").trim());
      if (!Array.isArray(starters)) throw new Error("not array");
    } catch {
      starters = raw.split("\n").map(l => l.replace(/^[-\d."[\]]+\s*/, "").trim())
        .filter(l => l.length > 8 && !l.startsWith("{")).slice(0, 5);
    }

    res.json({ starters });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/sessions/:id/results  — top answer + all feedbacks for a session
router.get("/sessions/:id/results", auth, async (req, res) => {
  try {
    const submissions = await SessionSubmission.find({ sessionId: req.params.id })
      .sort({ aiScore: -1 });
    res.json({ topAnswer: submissions[0] || null, allFeedbacks: submissions });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ══════════════════════════════════════════════════════════════
//  EVALUATE PEER FEEDBACK QUALITY  (LLM judge)
// ══════════════════════════════════════════════════════════════
router.post("/sessions/evaluate-feedback-quality", auth, async (req, res) => {
  try {
    const { sessionId, sectionKey, peerAnswer, feedbackText, criteria } = req.body;
    if (!feedbackText?.trim()) return res.status(400).json({ message: "feedbackText required" });

    const session = sessionId ? await Session.findById(sessionId).lean() : null;
    const critList = Array.isArray(criteria) && criteria.length > 0
      ? criteria
      : (session?.evaluationCriteria?.[sectionKey] || []);

    const criteriaBlock = critList.length > 0
      ? `Critères d'évaluation de la section « ${sectionKey} » :\n${critList.map((c, i) => `${i + 1}. ${c}`).join("\n")}`
      : `Section concernée : ${sectionKey || "inconnue"}`;

    const prompt = `Tu es un expert pédagogique spécialisé en écriture scientifique.
Tu dois évaluer la qualité d'un feedback écrit par un apprenant sur la production d'un pair.

${criteriaBlock}

Production du pair (section « ${sectionKey} ») :
"""
${(peerAnswer || "").slice(0, 1200)}
"""

Feedback de l'apprenant à évaluer :
"""
${feedbackText.slice(0, 800)}
"""

Évalue ce feedback selon ces 4 dimensions, réponds en JSON strict :
{
  "clarity": { "score": 1-4, "comment": "..." },
  "relevance": { "score": 1-4, "comment": "..." },
  "constructiveness": { "score": 1-4, "comment": "..." },
  "domainAlignment": { "score": 1-4, "comment": "..." },
  "overallScore": 1-4,
  "summary": "résumé global du feedback en 2 phrases",
  "strengths": ["point fort 1", "point fort 2"],
  "improvements": ["à améliorer 1", "à améliorer 2"],
  "validFeedback": true/false
}

Légende scores : 1=insuffisant, 2=à améliorer, 3=satisfaisant, 4=excellent
"validFeedback" = true si le feedback est pertinent, clair et dans le domaine.
Réponds UNIQUEMENT avec le JSON valide, sans markdown.`;

    const raw = await callAi(prompt, 700);
    let evaluation;
    try {
      evaluation = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch {
      evaluation = { summary: raw, validFeedback: true, overallScore: 3, strengths: [], improvements: [] };
    }

    res.json({ evaluation });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ══════════════════════════════════════════════════════════════
//  NOTIFICATIONS
// ══════════════════════════════════════════════════════════════
router.get("/notifications/:userId", auth, async (req, res) => {
  try {
    if (req.user.id !== req.params.userId && req.user.role !== "admin")
      return res.status(403).json({ message: "Forbidden" });
    const notifications = await Notification.find({ userId: req.params.userId })
      .sort({ createdAt: -1 }).limit(50);
    const unreadCount = await Notification.countDocuments({ userId: req.params.userId, read: false });
    res.json({ notifications, unreadCount });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.patch("/notifications/:id/read", auth, async (req, res) => {
  try {
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { read: true }, { returnDocument: "after" }
    );
    if (!notif) return res.status(404).json({ message: "Notification not found" });
    res.json({ notification: notif });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.patch("/notifications/read-all", auth, async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user.id, read: false }, { read: true });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ──────────────────────────────────────────────────────────────
//  Scaffolding adaptatif — génération IA par mode
// ──────────────────────────────────────────────────────────────
router.post("/scaffolding/generate", auth, async (req, res) => {
  try {
    const { sessionId, sectionKey, mode = "questions" } = req.body;
    if (!sessionId || !sectionKey) return res.status(400).json({ message: "sessionId et sectionKey requis" });
    if (!["questions", "starters", "template"].includes(mode)) return res.status(400).json({ message: "Mode invalide" });

    const session = await Session.findById(sessionId).select("articleSections missingSection").lean();
    if (!session) return res.status(404).json({ message: "Session introuvable" });

    // Contenu original de la section (jamais envoyé directement au student)
    const originalContent = (session.articleSections?.[sectionKey] || "").trim();
    if (!originalContent) {
      return res.status(422).json({ message: `Contenu original de la section « ${sectionKey} » non disponible. Le scaffolding fonctionne uniquement avec des articles textuels (non PDF scanné).` });
    }

    const excerpt = originalContent.slice(0, 2500); // limite tokens

    const PROMPTS = {
      questions: `Tu es un assistant pédagogique spécialisé en rédaction académique.
À partir du contenu CONFIDENTIEL de la section « ${sectionKey} » ci-dessous, génère exactement 5 questions progressives (du général au spécifique) pour guider un étudiant dans la rédaction de cette section.
RÈGLES : Ne révèle JAMAIS le contenu original. Chaque question doit inclure un "hint" court (1 phrase).
Réponds UNIQUEMENT avec du JSON valide, sans texte autour :
{"items":[{"id":1,"question":"...","hint":"..."},{"id":2,"question":"...","hint":"..."},{"id":3,"question":"...","hint":"..."},{"id":4,"question":"...","hint":"..."},{"id":5,"question":"...","hint":"..."}]}

CONTENU CONFIDENTIEL :
${excerpt}`,

      starters: `Tu es un assistant pédagogique spécialisé en rédaction académique.
À partir du contenu CONFIDENTIEL de la section « ${sectionKey} » ci-dessous, génère exactement 6 amorces de phrases en français académique couvrant les idées clés. L'étudiant les complètera lui-même.
RÈGLES : Ne copie PAS de phrases entières du texte. Chaque amorce a un "purpose" court (3-5 mots).
Réponds UNIQUEMENT avec du JSON valide :
{"items":[{"id":1,"starter":"...","purpose":"..."},{"id":2,"starter":"...","purpose":"..."},{"id":3,"starter":"...","purpose":"..."},{"id":4,"starter":"...","purpose":"..."},{"id":5,"starter":"...","purpose":"..."},{"id":6,"starter":"...","purpose":"..."}]}

CONTENU CONFIDENTIEL :
${excerpt}`,

      template: `Tu es un assistant pédagogique spécialisé en rédaction académique.
À partir du contenu CONFIDENTIEL de la section « ${sectionKey} » ci-dessous, génère un plan structuré en 4 étapes pour rédiger cette section.
RÈGLES : Chaque étape a un "step" (titre), une "instruction" claire et un "example" concret FICTIF (pas copié du texte).
Réponds UNIQUEMENT avec du JSON valide :
{"items":[{"id":1,"step":"Étape 1 — ...","instruction":"...","example":"..."},{"id":2,"step":"Étape 2 — ...","instruction":"...","example":"..."},{"id":3,"step":"Étape 3 — ...","instruction":"...","example":"..."},{"id":4,"step":"Étape 4 — ...","instruction":"...","example":"..."}]}

CONTENU CONFIDENTIEL :
${excerpt}`,
    };

    const raw = await callAi(PROMPTS[mode], 1400);

    // Parse JSON — accepte les réponses wrappées en markdown
    const clean = raw.replace(/```json\n?|```\n?/g, "").trim();
    const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
    if (s === -1 || e === -1) throw new Error("Réponse IA non valide — réessayez.");
    const parsed = JSON.parse(clean.slice(s, e + 1));

    res.json({ mode, sectionKey, items: parsed.items || [] });
  } catch (err) {
    console.error("[Scaffolding]", err.message);
    res.status(500).json({ message: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
//  Student joins a session by code
// ──────────────────────────────────────────────────────────────
router.post("/sessions/join", auth, async (req, res) => {
  try {
    const { code, studentName } = req.body;
    if (!code) return res.status(400).json({ message: "Session code is required" });

    const session = await Session.findOne({ code: code.toUpperCase() });
    if (!session) {
      return res.status(404).json({ message: "Session introuvable. Vérifiez le code." });
    }

    if (session.isScheduled) {
      const scheduledLabel = session.scheduledAt
        ? new Date(session.scheduledAt).toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short" })
        : "une date ultérieure";
      return res.status(403).json({
        message: `Cette session n'est pas encore ouverte. Elle démarrera le ${scheduledLabel}.`,
        scheduled: true,
        scheduledAt: session.scheduledAt,
      });
    }

    res.json({
      sessionId: session._id,
      question: session.question,
      instructions: session.instructions || "",
      videoUrl: session.videoUrl || null,
      sessionConfig: {
        docType: session.docType || session.sessionConfig?.docType || "article",
        level: session.level || session.sessionConfig?.level || "Master 2 / PFE",
        language: session.language || session.sessionConfig?.language || "FR + EN (auto)",
        selectedSections: session.selectedSections || [],
        evaluationCriteria: session.evaluationCriteria || {},
      },
    });
  } catch (err) {
    console.error("Join session error:", err);
    res.status(500).json({ message: err.message });
  }
});

// Student submits answer
router.post("/sessions/:sessionId/submit", auth, async (req, res) => {
  try {
    const { answer, studentName, sectionAnswers } = req.body;
    const { sessionId } = req.params;
    res.json({ success: true });
  } catch (err) {
    console.error("Submit answer error:", err);
    res.status(500).json({ message: err.message });
  }
});

// Student submits peer review
router.post("/sessions/:sessionId/peer-review", auth, async (req, res) => {
  try {
    res.json({ success: true });
  } catch (err) {
    console.error("Peer review error:", err);
    res.status(500).json({ message: err.message });
  }
});

registerExtraRoutes(router, { auth, role });

// ── GET /api/sessions/scheduled — upcoming scheduled sessions for a student ──
router.get("/sessions/scheduled", auth, async (req, res) => {
  try {
    const sessions = await Session.find({
      isScheduled: true,
      targetStudentIds: req.user.id,
      scheduledAt: { $gt: new Date() },
    })
      .populate("createdBy", "name")
      .select("code question missingSection scheduledAt createdBy targetSpecialites")
      .sort({ scheduledAt: 1 })
      .lean();

    res.json({
      sessions: sessions.map(s => ({
        id:            s._id,
        code:          s.code,
        question:      s.question,
        missingSection: s.missingSection,
        scheduledAt:   s.scheduledAt,
        teacher:       s.createdBy,
      })),
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Scheduler: auto-activate sessions when scheduledAt is reached ─────────────
export async function initScheduler(io) {
  const activate = async () => {
    try {
      const due = await Session.find({
        isScheduled: true,
        scheduledAt: { $lte: new Date() },
      }).populate("createdBy", "name").lean();

      for (const session of due) {
        await Session.findByIdAndUpdate(session._id, { isScheduled: false });

        const teacherName = session.createdBy?.name || "Enseignant";
        const payload = { teacherName, question: session.question, joinCode: session.code };

        // Notify via socket (students connected at launch time)
        for (const studentId of session.targetStudentIds || []) {
          io.to(studentId).emit("new_session", payload);
        }

        // Send "now live" reminder email
        const appUrl = process.env.FRONTEND_URL || "http://localhost:5173";
        const studentDocs = await User.find({ _id: { $in: session.targetStudentIds || [] } })
          .select("email name").lean();
        for (const st of studentDocs) {
          if (!st.email) continue;
          sendEmail({
            to: st.email,
            subject: `🔔 La session commence maintenant — ${teacherName}`,
            html: `
              <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f7f8fc;border-radius:12px;">
                <div style="background:#1a1d23;border-radius:10px;padding:20px 24px;color:#fff;margin-bottom:20px;">
                  <p style="margin:0 0 4px;font-size:12px;color:#10b981;">🔴 EN DIRECT</p>
                  <h2 style="margin:0;font-size:20px;font-weight:700;">La session de ${teacherName} commence !</h2>
                </div>
                <div style="background:#fff;border-radius:10px;padding:16px 20px;border:1px solid #eaecf0;margin-bottom:20px;">
                  <p style="margin:0 0 4px;font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;">Code pour rejoindre</p>
                  <p style="margin:0;font-size:28px;font-weight:800;color:#6c63ff;letter-spacing:4px;">${session.code}</p>
                </div>
                <a href="${appUrl}/student/peer" style="display:block;background:#10b981;color:#fff;text-align:center;padding:14px;border-radius:9px;text-decoration:none;font-weight:700;font-size:15px;">
                  ◈ Rejoindre maintenant →
                </a>
                <p style="margin:16px 0 0;font-size:11px;color:#9ca3af;text-align:center;">EduLearn — Plateforme d'apprentissage collaboratif</p>
              </div>`,
          }).catch(e => console.error("[Live reminder email]", e.message));
        }

        console.log(`[Scheduler] Session ${session.code} activated`);
      }
    } catch (e) {
      console.error("[Scheduler] Error:", e.message);
    }
  };

  // Run immediately on start (catch sessions that should have started during downtime)
  await activate();
  // Then every 30 seconds
  setInterval(activate, 30_000);
  console.log("[Scheduler] Scheduled session watcher started");
}

export default router;