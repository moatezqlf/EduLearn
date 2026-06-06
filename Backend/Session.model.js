// import mongoose from "mongoose";

// // ══════════════════════════════════════════════════════════════
// //  PEER SESSION  (ancien modèle — utilisé par routes.js POST /sessions)
// // ══════════════════════════════════════════════════════════════
// const peerSessionSchema = new mongoose.Schema({
//   code:         { type: String, required: true, unique: true, uppercase: true },
//   teacher:      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
//   question:     { type: String, required: true },
//   phase:        { type: String, default: "waiting" },
//   currentRound: { type: Number, default: 1 },
//   allMembers:   [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
//   groups:       [mongoose.Schema.Types.Mixed],
//   expiresAt:    { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) },
// }, { timestamps: true });

// export const PeerSession = mongoose.model("PeerSession", peerSessionSchema);

// // ══════════════════════════════════════════════════════════════
// //  SESSION  (scientific writing avec video + instructions)
// // ══════════════════════════════════════════════════════════════
// const memberSchema = new mongoose.Schema({
//   id:         String,
//   name:       String,
//   socketId:   String,
//   isReceiver: { type: Boolean, default: false },
// }, { _id: false });

// const groupSchema = new mongoose.Schema({
//   members: [memberSchema],
// }, { _id: false });

// const sessionSchema = new mongoose.Schema({
//   code:         { type: String, required: true, unique: true, uppercase: true },
//   question:     { type: String, required: true },
//   instructions: { type: String, default: "" },
//   examples:     { type: String, default: "" },
//   videoUrl:     { type: String, default: null },
//   criteria:     { type: [String], default: ["clarity", "structure", "argumentation", "scientific"] },
//   phase:        { type: String, default: "waiting" },
//   currentRound: { type: Number, default: 1 },
//  totalRounds:  { type: Number, default: 4 },
//   sessionConfig: {
//     docType:       { type: String, default: "article", enum: ["article", "memoire", "hybrid"] },
//     level:         { type: String, default: "M2",      enum: ["L3", "M1", "M2", "PhD"] },
//     feedbackStyle: { type: String, default: "detailed",enum: ["detailed", "summary", "socratic"] },
//     language:      { type: String, default: "both",    enum: ["both", "fr", "en"] },
//   },
//   students:     [memberSchema],
//   students:     [memberSchema],
//   groups:       [groupSchema],
//   createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
// }, { timestamps: true });

// export const Session = mongoose.model("Session", sessionSchema);

// // ══════════════════════════════════════════════════════════════
// //  SESSION SUBMISSION
// // ══════════════════════════════════════════════════════════════
// const peerReviewSchema = new mongoose.Schema({
//   reviewerId: String,
//   ratings: {
//     clarity:       { type: Number, min: 1, max: 5 },
//     structure:     { type: Number, min: 1, max: 5 },
//     argumentation: { type: Number, min: 1, max: 5 },
//     scientific:    { type: Number, min: 1, max: 5 },
//   },
//   comment:     String,
//   submittedAt: Date,
// }, { _id: false });

// const revisionSchema = new mongoose.Schema({
//   content:     String,
//   submittedAt: Date,
// }, { _id: false });

// const sessionSubmissionSchema = new mongoose.Schema({
//   sessionId:   { type: mongoose.Schema.Types.ObjectId, ref: "Session", required: true },
//   studentId:   { type: String, required: true },
//   studentName: String,
//   round:       { type: Number, required: true },
//   content:     String,
//   aiScore:     Number,
//   aiFeedback: {
//     score:       Number,
//     basic:       String,
//     corrections: [{ original: String, issue: String, suggestion: String }],
//     rewrite:     String,
//   },
//   peerReviews: [peerReviewSchema],
//   revisions:   [revisionSchema],
//   submittedAt: { type: Date, default: Date.now },
// }, { timestamps: true });

// sessionSubmissionSchema.index({ sessionId: 1, studentId: 1, round: 1 }, { unique: true });

// export const SessionSubmission = mongoose.model("SessionSubmission", sessionSubmissionSchema);
// export { SessionSubmission as Submission };

import mongoose from "mongoose";

// ══════════════════════════════════════════════════════════════
//  PEER SESSION  (ancien modèle)
// ══════════════════════════════════════════════════════════════
const peerSessionSchema = new mongoose.Schema({
  code:         { type: String, required: true, unique: true, uppercase: true },
  teacher:      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  question:     { type: String, required: true },
  phase:        { type: String, default: "waiting" },
  currentRound: { type: Number, default: 1 },
  allMembers:   [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  groups:       [mongoose.Schema.Types.Mixed],
  expiresAt:    { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) },
}, { timestamps: true });

export const PeerSession = mongoose.model("PeerSession", peerSessionSchema);

// ══════════════════════════════════════════════════════════════
//  SESSION  (scientific writing)
// ══════════════════════════════════════════════════════════════
const memberSchema = new mongoose.Schema({
  id:         String,
  userId:     String, // stable JWT user id (preferred for submissions + notifications)
  name:       String,
  socketId:   String,
  isReceiver: { type: Boolean, default: false },
}, { _id: false });

const groupSchema = new mongoose.Schema({
  members: [memberSchema],
}, { _id: false });

const sessionSchema = new mongoose.Schema({
  code:         { type: String, required: true, unique: true, uppercase: true },
  question:     { type: String, required: true },
  instructions: { type: String, default: "" },
  examples:     { type: String, default: "" },
  videoUrl:     { type: String, default: null },
  criteria:     { type: [String], default: ["clarity", "structure", "argumentation", "scientific"] },
  phase:        { type: String, default: "waiting" },
  currentRound: { type: Number, default: 1 },
  totalRounds:  { type: Number, default: 1 },

  // ── Publication & ciblage ──
  resourceType:       { type: String, default: "article" },
  activityMode:       { type: String, default: "section_learn", enum: ["full_read", "section_learn"] },
  targetSpecialites:  [{ type: String }],

  // ── IMRAD evaluation config (sent from TeacherSession) ──
  docType:            { type: String, default: "article" },
  language:           { type: String, default: "FR + EN (auto)" },
  selectedSections:   [{ type: String }],
  evaluationCriteria: { type: mongoose.Schema.Types.Mixed, default: {} },

  // ── Article fourni par l'enseignant (workflow image 3) ──
  articleSections:     { type: mongoose.Schema.Types.Mixed, default: {} },
  articleFileUrl:      { type: String, default: null },
  articleFileName:     { type: String, default: "" },
  articleFileMime:     { type: String, default: "" },
  missingSection:      { type: String, default: "" },
  // Article 2 — version avec section retirée (généré par ArticleCutterTool)
  articleTextContent:  { type: String, default: "" },
  sectionGuidance:     { type: mongoose.Schema.Types.Mixed, default: {} },

  // ── Section-by-section flow state ──
  // currentSectionKey is the active section being written/reviewed/evaluated.
  currentSectionIndex: { type: Number, default: 0 },
  currentSectionKey:   { type: String, default: "" },

  // Legacy sessionConfig (kept for backward compat)
  sessionConfig: {
    docType:       { type: String, default: "article" },
    level:         { type: String, default: "M2" },
    feedbackStyle: { type: String, default: "detailed" },
    language:      { type: String, default: "both" },
  },

  students:     [memberSchema],   // FIX: was duplicated, now single
  groups:       [groupSchema],
  createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

export const Session = mongoose.model("Session", sessionSchema);

// ══════════════════════════════════════════════════════════════
//  SESSION SUBMISSION
// ══════════════════════════════════════════════════════════════
const peerReviewSchema = new mongoose.Schema({
  reviewerId: String,
  sectionKey: String,
  revieweeStudentId: String,
  ratings: {
    clarity:       { type: Number, min: 1, max: 5 },
    structure:     { type: Number, min: 1, max: 5 },
    argumentation: { type: Number, min: 1, max: 5 },
    scientific:    { type: Number, min: 1, max: 5 },
  },
  comment:     String,
  submittedAt: Date,
}, { _id: false });

const revisionSchema = new mongoose.Schema({
  content:     String,
  submittedAt: Date,
}, { _id: false });

const sessionSubmissionSchema = new mongoose.Schema({
  sessionId:      { type: mongoose.Schema.Types.ObjectId, ref: "Session", required: true },
  studentId:      { type: String, required: true },
  studentName:    String,
  round:          { type: Number, required: true },
  sectionKey:     { type: String, default: "" }, // primary section for this submission (when sectioned mode)
  content:        String,
  sectionAnswers: { type: mongoose.Schema.Types.Mixed, default: {} },
  aiScore:        Number,
  // Flexible object: rubricMapping, lineCorrections, feedForward, criteriaScores, etc.
  aiFeedback: { type: mongoose.Schema.Types.Mixed, default: {} },
  peerReviews: [peerReviewSchema],
  revisions:   [revisionSchema],
  submittedAt: { type: Date, default: Date.now },
}, { timestamps: true });

sessionSubmissionSchema.index({ sessionId: 1, studentId: 1, round: 1 }, { unique: true });

export const SessionSubmission = mongoose.model("SessionSubmission", sessionSubmissionSchema);