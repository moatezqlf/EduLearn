/**
 * Additional routes: user approval, settings, modules/resources,
 * forum, chat, email, unenroll.
 */
import express from "express";
import multer from "multer";
import fs from "fs";
import {
  User, Course, Enrollment,
  ForumTopic, ForumReply, ChatMessage,
} from "./models.js";
import { getPlatformSettings, updatePlatformSettings } from "./services/settings.js";
import { sendEmail } from "./services/email.js";
import { getIO } from "./Socket.server.js";

const resourceStorage = multer.diskStorage({
  destination: (_, __, cb) => {
    const dir = "uploads/resources";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`),
});
const uploadResource = multer({
  storage: resourceStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
});

export function registerExtraRoutes(router, { auth, role }) {

  // ── Profile (any authenticated active user) ─────────────────
  router.put("/users/:id", auth, async (req, res) => {
    try {
      if (req.params.id !== req.user.id && req.user.role !== "admin")
        return res.status(403).json({ message: "Forbidden" });
      const { name, bio, avatar } = req.body;
      const update = {};
      if (name !== undefined) update.name = name;
      if (bio !== undefined)  update.bio  = bio;
      if (avatar !== undefined) update.avatar = avatar;
      const user = await User.findByIdAndUpdate(req.params.id, update, { new: true });
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json(user.toSafeObject());
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  router.get("/users/:id", auth, async (req, res) => {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user.toSafeObject());
  });

  // ── Admin: approve / reject / delete ────────────────────────
  router.patch("/users/:id/approve", auth, role("admin"), async (req, res) => {
    const user = await User.findByIdAndUpdate(
      req.params.id, { status: "active" }, { new: true }
    );
    if (!user) return res.status(404).json({ message: "User not found" });
    const settings = await getPlatformSettings();
    if (settings.email_notifs) {
      sendEmail({
        to: user.email,
        subject: "EduLearn — Compte approuvé",
        html: `<p>Bonjour ${user.name},</p><p>Votre compte EduLearn a été approuvé. Vous pouvez vous connecter.</p>`,
      }).catch(console.error);
    }
    res.json(user.toSafeObject());
  });

  router.delete("/users/:id/reject", auth, role("admin"), async (req, res) => {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ message: "User removed", id: req.params.id });
  });

  router.delete("/users/:id", auth, role("admin"), async (req, res) => {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ message: "User deleted" });
  });

  // ── Admin: enroll student in a course ──────────────────────
  router.post("/admin/enroll", auth, role("admin"), async (req, res) => {
    try {
      const { studentId, courseId } = req.body;
      if (!studentId || !courseId) return res.status(400).json({ message: "studentId and courseId required" });
      const [student, course] = await Promise.all([
        User.findById(studentId),
        Course.findById(courseId),
      ]);
      if (!student) return res.status(404).json({ message: "Student not found" });
      if (!course)  return res.status(404).json({ message: "Course not found" });
      const existing = await Enrollment.findOne({ student: studentId, course: courseId });
      if (existing) return res.json({ message: "Already enrolled", enrollment: existing });
      const enrollment = await Enrollment.create({ student: studentId, course: courseId, progress: 0 });
      await Course.findByIdAndUpdate(courseId, { $inc: { enrollments: 1 } });
      res.status(201).json({ message: "Enrolled", enrollment });
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  // ── Platform settings ───────────────────────────────────────
  router.get("/settings", async (_req, res) => {
    try {
      const settings = await getPlatformSettings();
      res.json({ settings });
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  router.put("/settings", auth, role("admin"), async (req, res) => {
    try {
      const allowed = ["ai_feedback", "peer_review", "auto_grade", "email_notifs", "maintenance", "open_reg"];
      const patch = {};
      for (const k of allowed) {
        if (req.body[k] !== undefined) patch[k] = Boolean(req.body[k]);
      }
      const settings = await updatePlatformSettings(patch);
      res.json({ settings });
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  // ── Unenroll ────────────────────────────────────────────────
  router.delete("/courses/:id/enroll", auth, async (req, res) => {
    try {
      const enrollment = await Enrollment.findOneAndDelete({
        student: req.user.id,
        course: req.params.id,
      });
      if (!enrollment) return res.status(404).json({ message: "Not enrolled" });
      await Course.findByIdAndUpdate(req.params.id, { $inc: { enrollments: -1 } });
      await User.findByIdAndUpdate(req.user.id, { $pull: { enrolledCourses: req.params.id } });
      res.json({ message: "Unenrolled" });
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  // ── Course modules & resources ──────────────────────────────
  router.get("/courses/:id/modules", auth, async (req, res) => {
    const course = await Course.findById(req.params.id).select("modules title teacher");
    if (!course) return res.status(404).json({ message: "Course not found" });
    res.json({ modules: course.modules, title: course.title });
  });

  router.post("/courses/:id/modules", auth, role("teacher", "admin"), async (req, res) => {
    try {
      const course = await Course.findOne({ _id: req.params.id, teacher: req.user.id });
      if (!course && req.user.role !== "admin")
        return res.status(404).json({ message: "Course not found" });
      const c = course || await Course.findById(req.params.id);
      if (!c) return res.status(404).json({ message: "Course not found" });
      const mod = {
        title: req.body.title,
        description: req.body.description || "",
        videoUrl: req.body.videoUrl || "",
        duration: Number(req.body.duration) || 0,
        order: c.modules.length + 1,
        resources: [],
      };
      c.modules.push(mod);
      await c.save();
      res.status(201).json({ module: c.modules[c.modules.length - 1], course: c });
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  router.post(
    "/courses/:courseId/modules/:moduleId/resources",
    auth,
    role("teacher", "admin"),
    uploadResource.single("file"),
    async (req, res) => {
      try {
        const course = await Course.findById(req.params.courseId);
        if (!course) return res.status(404).json({ message: "Course not found" });
        if (course.teacher.toString() !== req.user.id && req.user.role !== "admin")
          return res.status(403).json({ message: "Forbidden" });
        const mod = course.modules.id(req.params.moduleId);
        if (!mod) return res.status(404).json({ message: "Module not found" });
        const resource = {
          title: req.body.title || req.file?.originalname || "Resource",
          url: req.file ? `/uploads/resources/${req.file.filename}` : req.body.url,
          type: req.file?.mimetype || req.body.type || "link",
        };
        if (!resource.url) return res.status(400).json({ message: "File or URL required" });
        mod.resources.push(resource);
        await course.save();
        res.status(201).json({ resource, module: mod });
      } catch (err) { res.status(500).json({ message: err.message }); }
    }
  );

  // ── Forum ───────────────────────────────────────────────────
  router.get("/forum/topics", auth, async (req, res) => {
    const filter = {};
    if (req.query.course) filter.course = req.query.course;
    const topics = await ForumTopic.find(filter)
      .populate("author", "name role avatar")
      .populate("course", "title")
      .sort({ createdAt: -1 })
      .limit(50);
    const withCounts = await Promise.all(topics.map(async (t) => {
      const replyCount = await ForumReply.countDocuments({ topic: t._id });
      return { ...t.toObject(), replyCount };
    }));
    res.json({ topics: withCounts });
  });

  router.get("/forum/topics/:id", auth, async (req, res) => {
    const topic = await ForumTopic.findById(req.params.id)
      .populate("author", "name role avatar")
      .populate("course", "title");
    if (!topic) return res.status(404).json({ message: "Topic not found" });
    const replies = await ForumReply.find({ topic: topic._id })
      .populate("author", "name role avatar")
      .sort({ createdAt: 1 });
    res.json({ topic, replies });
  });

  router.post("/forum/topics", auth, async (req, res) => {
    try {
      const { title, body, courseId } = req.body;
      if (!title?.trim() || !body?.trim())
        return res.status(400).json({ message: "Title and body required" });
      const topic = await ForumTopic.create({
        title: title.trim(),
        body: body.trim(),
        author: req.user.id,
        course: courseId || null,
      });
      const populated = await ForumTopic.findById(topic._id)
        .populate("author", "name role avatar");
      res.status(201).json({ topic: populated });
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  router.post("/forum/topics/:id/replies", auth, async (req, res) => {
    try {
      const topic = await ForumTopic.findById(req.params.id);
      if (!topic) return res.status(404).json({ message: "Topic not found" });
      const reply = await ForumReply.create({
        topic: topic._id,
        author: req.user.id,
        body: req.body.body,
      });
      const populated = await ForumReply.findById(reply._id)
        .populate("author", "name role avatar");
      res.status(201).json({ reply: populated });
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  // ── Chat ────────────────────────────────────────────────────
  router.get("/chat/conversations", auth, async (req, res) => {
    const uid = req.user.id;
    const messages = await ChatMessage.find({
      $or: [{ from: uid }, { to: uid }],
    }).sort({ createdAt: -1 }).limit(200);

    const partnerIds = new Set();
    for (const m of messages) {
      const other = m.from.toString() === uid ? m.to.toString() : m.from.toString();
      partnerIds.add(other);
    }
    const users = await User.find({ _id: { $in: [...partnerIds] } }).select("name role avatar email");
    const convos = await Promise.all(users.map(async (u) => {
      const last = await ChatMessage.findOne({
        $or: [
          { from: uid, to: u._id },
          { from: u._id, to: uid },
        ],
      }).sort({ createdAt: -1 });
      const unread = await ChatMessage.countDocuments({ from: u._id, to: uid, read: false });
      return { user: u.toSafeObject(), lastMessage: last, unread };
    }));
    convos.sort((a, b) => new Date(b.lastMessage?.createdAt || 0) - new Date(a.lastMessage?.createdAt || 0));
    res.json({ conversations: convos });
  });

  router.get("/chat/messages", auth, async (req, res) => {
    const { with: withId, course } = req.query;
    if (!withId) return res.status(400).json({ message: "with user id required" });
    const filter = {
      $or: [
        { from: req.user.id, to: withId },
        { from: withId, to: req.user.id },
      ],
    };
    if (course) filter.course = course;
    const messages = await ChatMessage.find(filter)
      .populate("from", "name avatar")
      .populate("to", "name avatar")
      .sort({ createdAt: 1 })
      .limit(100);
    await ChatMessage.updateMany({ from: withId, to: req.user.id, read: false }, { read: true });
    res.json({ messages });
  });

  router.post("/chat/messages", auth, async (req, res) => {
    try {
      const { to, body, courseId } = req.body;
      if (!to || !body?.trim()) return res.status(400).json({ message: "to and body required" });
      const recipient = await User.findById(to);
      if (!recipient) return res.status(404).json({ message: "Recipient not found" });
      const msg = await ChatMessage.create({
        from: req.user.id,
        to,
        body: body.trim(),
        course: courseId || null,
      });
      const populated = await ChatMessage.findById(msg._id)
        .populate("from", "name avatar")
        .populate("to", "name avatar");
      const io = getIO();
      if (io) {
        io.to(`user:${to}`).emit("chat_message", populated);
      }
      res.status(201).json({ message: populated });
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  // ── Email ───────────────────────────────────────────────────
  router.post("/email/send", auth, async (req, res) => {
    try {
      const { to, subject, body } = req.body;
      if (!to || !subject || !body)
        return res.status(400).json({ message: "to, subject, body required" });
      let recipient;
      if (to.includes("@")) {
        recipient = await User.findOne({ email: to.toLowerCase() });
      } else {
        recipient = await User.findById(to);
      }
      if (!recipient) return res.status(404).json({ message: "Recipient not found" });
      const sender = await User.findById(req.user.id);
      await sendEmail({
        to: recipient.email,
        subject,
        html: `<p><strong>${sender.name}</strong> (${sender.role}) vous écrit via EduLearn :</p><p>${body.replace(/\n/g, "<br>")}</p>`,
        text: body,
      });
      res.json({ sent: true, to: recipient.email });
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  router.post("/admin/announcement", auth, role("admin"), async (req, res) => {
    try {
      const { subject, body, role: targetRole } = req.body;
      if (!subject || !body) return res.status(400).json({ message: "subject and body required" });
      const filter = { status: "active" };
      if (targetRole && targetRole !== "all") filter.role = targetRole;
      const users = await User.find(filter).select("email name");
      let sent = 0;
      for (const u of users) {
        try {
          await sendEmail({
            to: u.email,
            subject,
            html: `<p>Bonjour ${u.name},</p><p>${body.replace(/\n/g, "<br>")}</p><p>— L'équipe EduLearn</p>`,
            text: body,
          });
          sent++;
        } catch { /* continue */ }
      }
      res.json({ sent, total: users.length });
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  // Contacts for chat/email (teachers see students in courses, etc.)
  router.get("/contacts", auth, async (req, res) => {
    try {
      let contacts = [];
      if (req.user.role === "student") {
        const enrollments = await Enrollment.find({ student: req.user.id }).select("course");
        const courseIds = enrollments.map(e => e.course);
        const courses = await Course.find({ _id: { $in: courseIds } }).select("teacher");
        const teacherIds = [...new Set(courses.map(c => c.teacher.toString()))];
        contacts = await User.find({ _id: { $in: teacherIds }, status: "active" }).select("name email role avatar");
        const peers = await Enrollment.find({ course: { $in: courseIds }, student: { $ne: req.user.id } })
          .populate("student", "name email role avatar");
        const peerUsers = peers.map(e => e.student).filter(Boolean);
        contacts = [...contacts, ...peerUsers];
      } else if (req.user.role === "teacher") {
        const courses = await Course.find({ teacher: req.user.id }).select("_id");
        const courseIds = courses.map(c => c._id);
        const enrollments = await Enrollment.find({ course: { $in: courseIds } }).populate("student", "name email role avatar");
        contacts = enrollments.map(e => e.student).filter(Boolean);
      } else {
        contacts = await User.find({ status: "active", role: { $in: ["student", "teacher"] } })
          .select("name email role avatar").limit(100);
      }
      const seen = new Set();
      const unique = contacts.filter(c => {
        const id = c._id?.toString();
        if (!id || seen.has(id) || id === req.user.id) return false;
        seen.add(id);
        return true;
      });
      res.json({ contacts: unique });
    } catch (err) { res.status(500).json({ message: err.message }); }
  });
}
