// ─────────────────────────────────────────────────────────────
//  models.js  —  Mongoose schemas for EduLearn
//  npm install mongoose bcryptjs
// ─────────────────────────────────────────────────────────────
import mongoose from "mongoose";
import bcrypt   from "bcryptjs";

const { Schema, model } = mongoose;

// ══════════════════════════════════════════════════════════════
//  USER
// ══════════════════════════════════════════════════════════════
const userSchema = new Schema({
  name:      { type: String, required: true, trim: true },
  email:     { type: String, required: true, unique: true, lowercase: true },
  password:  { type: String, required: true, minlength: 6, select: false },
  role:      { type: String, enum: ["student", "teacher", "admin"], default: "student" },
  specialite:{ type: String, default: "" },
  avatar:    { type: String, default: "" },
  bio:       { type: String, default: "" },
  status:    { type: String, enum: ["active", "inactive", "banned", "pending"], default: "active" },
  enrolledCourses: [{ type: Schema.Types.ObjectId, ref: "Course" }],
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
}); 

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

export const User = model("User", userSchema);

// ══════════════════════════════════════════════════════════════
//  MODULE  (sub-document inside Course)
// ══════════════════════════════════════════════════════════════
const moduleSchema = new Schema({
  title:       { type: String, required: true },
  description: { type: String, default: "" },
  videoUrl:    { type: String, default: "" },
  duration:    { type: Number, default: 0 },   // minutes
  order:       { type: Number, required: true },
  resources:   [{ title: String, url: String }],
}, { timestamps: true });

// ══════════════════════════════════════════════════════════════
//  COURSE
// ══════════════════════════════════════════════════════════════
const courseSchema = new Schema({
  title:       { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  teacher:     { type: Schema.Types.ObjectId, ref: "User", required: true },
  thumbnail:   { type: String, default: "" },
  category:    { type: String, default: "General" },
  level:       { type: String, enum: ["beginner","intermediate","advanced"], default: "beginner" },
  tags:        [String],
  modules:     [moduleSchema],
  published:   { type: Boolean, default: false },
  rating:      { type: Number, default: 0, min: 0, max: 5 },
  ratingCount: { type: Number, default: 0 },
  enrollments: { type: Number, default: 0 },
}, { timestamps: true });

// Virtual: completion rate
courseSchema.virtual("completionRate").get(function () {
  return this.modules.length ? Math.round((this.completedModules / this.modules.length) * 100) : 0;
});

export const Course = model("Course", courseSchema);

// ══════════════════════════════════════════════════════════════
//  ENROLLMENT  (student ↔ course progress)
// ══════════════════════════════════════════════════════════════
const enrollmentSchema = new Schema({
  student:          { type: Schema.Types.ObjectId, ref: "User",   required: true },
  course:           { type: Schema.Types.ObjectId, ref: "Course", required: true },
  completedModules: [{ type: Schema.Types.ObjectId }],
  progress:         { type: Number, default: 0 },   // 0-100
  completedAt:      { type: Date,   default: null },
  enrolledAt:       { type: Date,   default: Date.now },
}, { timestamps: true });

enrollmentSchema.index({ student: 1, course: 1 }, { unique: true });

export const Enrollment = model("Enrollment", enrollmentSchema);

// ══════════════════════════════════════════════════════════════
//  ASSIGNMENT
// ══════════════════════════════════════════════════════════════
const rubricItemSchema = new Schema({
  criterion: { type: String, required: true },
  weight:    { type: Number, required: true },   // max points
  description: { type: String, default: "" },
});

const assignmentSchema = new Schema({
  title:        { type: String, required: true },
  description:  { type: String, default: "" },
  course:       { type: Schema.Types.ObjectId, ref: "Course", required: true },
  teacher:      { type: Schema.Types.ObjectId, ref: "User",   required: true },
  dueDate:      { type: Date,   required: true },
  maxScore:     { type: Number, default: 100 },
  rubric:       [rubricItemSchema],
  peerReview:   { enabled: { type: Boolean, default: false }, reviewsRequired: { type: Number, default: 2 } },
  aiFeedback:   { enabled: { type: Boolean, default: true  } },
}, { timestamps: true });

export const Assignment = model("Assignment", assignmentSchema);

// ══════════════════════════════════════════════════════════════
//  SUBMISSION
// ══════════════════════════════════════════════════════════════
const submissionSchema = new Schema({
  assignment:  { type: Schema.Types.ObjectId, ref: "Assignment", required: true },
  course:      { type: Schema.Types.ObjectId, ref: "Course",     required: true },
  student:     { type: Schema.Types.ObjectId, ref: "User",       required: true },
  content:     { type: String, required: true },   // text or file URL
  fileUrl:     { type: String, default: "" },
  score:       { type: Number, default: null },
  gradedBy:    { type: Schema.Types.ObjectId, ref: "User", default: null },
  gradedAt:    { type: Date,   default: null },
  teacherNote: { type: String, default: "" },
  status:      { type: String, enum: ["pending","ai_reviewed","graded","returned"], default: "pending" },
  submittedAt: { type: Date, default: Date.now },
}, { timestamps: true });

submissionSchema.index({ assignment: 1, student: 1 }, { unique: true });

export const Submission = model("Submission", submissionSchema);

// ══════════════════════════════════════════════════════════════
//  AI FEEDBACK
// ══════════════════════════════════════════════════════════════
const criteriaScoreSchema = new Schema({
  criterion: String,
  weight:    Number,
  score:     Number,
  comment:   String,
});

const feedbackSchema = new Schema({
  submission:    { type: Schema.Types.ObjectId, ref: "Submission", required: true },
  student:       { type: Schema.Types.ObjectId, ref: "User",       required: true },
  generatedBy:   { type: String, enum: ["claude","peer","teacher"], default: "claude" },
  peer:          { type: Schema.Types.ObjectId, ref: "User", default: null },
  overallScore:  { type: Number, required: true },
  level:         { type: String, enum: ["Excellent","Good","Satisfactory","Needs Work"] },
  summary:       { type: String, required: true },
  strengths:     [String],
  improvements:  [String],
  suggestion:    { type: String, default: "" },
  criteriaScores:[criteriaScoreSchema],
  approvedBy:    { type: Schema.Types.ObjectId, ref: "User", default: null },
  approvedAt:    { type: Date,   default: null },
  releasedAt:    { type: Date,   default: null },
  model:         { type: String, default: "claude-sonnet-4-20250514" },
  promptTokens:  { type: Number, default: 0 },
  outputTokens:  { type: Number, default: 0 },
}, { timestamps: true });

export const Feedback = model("Feedback", feedbackSchema);

// ══════════════════════════════════════════════════════════════
//  PEER REVIEW  (student reviewing another student's submission)
// ══════════════════════════════════════════════════════════════
const peerReviewSchema = new Schema({
  submission: { type: Schema.Types.ObjectId, ref: "Submission", required: true },
  reviewer:   { type: Schema.Types.ObjectId, ref: "User",       required: true },
  score:      { type: Number, required: true },
  comment:    { type: String, required: true },
  criteria:   [{ criterion: String, score: Number }],
  submittedAt:{ type: Date, default: Date.now },
}, { timestamps: true });

peerReviewSchema.index({ submission: 1, reviewer: 1 }, { unique: true });

export const PeerReview = model("PeerReview", peerReviewSchema);

// ══════════════════════════════════════════════════════════════
//  FOLLOW  (student → teacher subscription)
// ══════════════════════════════════════════════════════════════
const followSchema = new Schema({
  student: { type: Schema.Types.ObjectId, ref: "User", required: true },
  teacher: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

// One student can follow a teacher only once
followSchema.index({ student: 1, teacher: 1 }, { unique: true });

export const Follow = model("Follow", followSchema);

// ══════════════════════════════════════════════════════════════
//  NOTIFICATION
//  Created for each follower when a teacher starts a session
// ══════════════════════════════════════════════════════════════
const notificationSchema = new Schema({
  userId:      { type: Schema.Types.ObjectId, ref: "User", required: true },
  teacherName: { type: String, required: true },
  question:    { type: String, required: true },
  joinCode:    { type: String, required: true },
  read:        { type: Boolean, default: false },
}, { timestamps: true });

notificationSchema.index({ userId: 1, createdAt: -1 });

export const Notification = model("Notification", notificationSchema);

// ══════════════════════════════════════════════════════════════
//  PLATFORM SETTINGS  (singleton document)
// ══════════════════════════════════════════════════════════════
const platformSettingsSchema = new Schema({
  key:                      { type: String, default: "global", unique: true },
  ai_feedback:              { type: Boolean, default: true },
  peer_review:              { type: Boolean, default: true },
  auto_grade:               { type: Boolean, default: false },
  email_notifs:             { type: Boolean, default: true },
  maintenance:              { type: Boolean, default: false },
  open_reg:                 { type: Boolean, default: true },
  auto_approve_registrations: { type: Boolean, default: true },
}, { timestamps: true });

export const PlatformSettings = model("PlatformSettings", platformSettingsSchema);

// ══════════════════════════════════════════════════════════════
//  FORUM
// ══════════════════════════════════════════════════════════════
const forumTopicSchema = new Schema({
  title:   { type: String, required: true, trim: true },
  body:    { type: String, required: true },
  author:  { type: Schema.Types.ObjectId, ref: "User", required: true },
  course:  { type: Schema.Types.ObjectId, ref: "Course", default: null },
}, { timestamps: true });

export const ForumTopic = model("ForumTopic", forumTopicSchema);

const forumReplySchema = new Schema({
  topic:  { type: Schema.Types.ObjectId, ref: "ForumTopic", required: true },
  author: { type: Schema.Types.ObjectId, ref: "User", required: true },
  body:   { type: String, required: true },
}, { timestamps: true });

export const ForumReply = model("ForumReply", forumReplySchema);

// ══════════════════════════════════════════════════════════════
//  CHAT  (direct messages between users)
// ══════════════════════════════════════════════════════════════
const chatMessageSchema = new Schema({
  from:    { type: Schema.Types.ObjectId, ref: "User", required: true },
  to:      { type: Schema.Types.ObjectId, ref: "User", required: true },
  course:  { type: Schema.Types.ObjectId, ref: "Course", default: null },
  body:    { type: String, required: true, trim: true },
  read:    { type: Boolean, default: false },
}, { timestamps: true });

chatMessageSchema.index({ from: 1, to: 1, createdAt: -1 });

export const ChatMessage = model("ChatMessage", chatMessageSchema);

// ── DB connect helper ─────────────────────────────────────────
export async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/edulearn");
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  }
}
