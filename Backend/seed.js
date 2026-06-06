import dotenv from "dotenv";
import mongoose from "mongoose";
import { User, Course, Assignment, Enrollment, Submission } from "./models.js";

dotenv.config();

await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/edulearn", {
  serverSelectionTimeoutMS: 10000,
  directConnection: true,
});
console.log("MongoDB connected ✓");

// 1. Clear existing
await Promise.all([User, Course, Assignment, Enrollment, Submission].map(M => M.deleteMany({})));

// 2. Users
const admin = await User.create({ name: "Admin",         email: "demo.admin@edulearn.io",   password: "demo1234", role: "admin",   status: "active" });
const t1    = await User.create({ name: "Dr. Sarah Chen",email: "demo.teacher@edulearn.io", password: "demo1234", role: "teacher", status: "active" });
const s1    = await User.create({ name: "Lmo Bensalem",  email: "demo.student@edulearn.io", password: "demo1234", role: "student", status: "active" });
const s2    = await User.create({ name: "Amina Khelil",  email: "amina@student.dz",         password: "demo1234", role: "student", status: "active" });

// 3. Courses
const ml = await Course.create({
  title: "Machine Learning Fundamentals", teacher: t1._id,
  description: "From linear regression to neural networks.", category: "AI / ML",
  level: "intermediate", published: true, rating: 4.8, ratingCount: 142,
  modules: [
    { title: "Introduction to ML",     order: 1, duration: 25 },
    { title: "Linear Regression",      order: 2, duration: 40 },
    { title: "Gradient Descent",       order: 3, duration: 35 },
    { title: "Neural Networks Basics", order: 4, duration: 55 },
    { title: "Backpropagation",        order: 5, duration: 60 },
  ],
});

const react = await Course.create({
  title: "React & Modern Web Dev", teacher: t1._id,
  description: "Build production-grade React apps.", category: "Frontend",
  level: "intermediate", published: true, rating: 4.6, ratingCount: 98,
  modules: [
    { title: "JSX & Components", order: 1, duration: 30 },
    { title: "Hooks Deep Dive",  order: 2, duration: 45 },
    { title: "Context & State",  order: 3, duration: 40 },
    { title: "React Router",     order: 4, duration: 35 },
  ],
});

// 4. Assignment
const a1 = await Assignment.create({
  title: "Neural Network from Scratch", course: ml._id, teacher: t1._id,
  dueDate: new Date(Date.now() + 86400000),
  maxScore: 100,
  rubric: [
    { criterion: "Correctness of forward pass", weight: 25, description: "Forward pass accuracy" },
    { criterion: "Backpropagation derivation",  weight: 30, description: "Manual gradient derivation" },
    { criterion: "Code quality & readability",  weight: 20, description: "Clean, commented code" },
    { criterion: "Results analysis",            weight: 15, description: "Test accuracy and analysis" },
    { criterion: "Depth of understanding",      weight: 10, description: "Conceptual explanation" },
  ],
  aiFeedback: { enabled: true },
  peerReview:  { enabled: true, reviewsRequired: 2 },
});

// 5. Enrollments
await Enrollment.create({ student: s1._id, course: ml._id,    progress: 72, completedModules: [ml.modules[0]._id, ml.modules[1]._id, ml.modules[2]._id] });
await Enrollment.create({ student: s1._id, course: react._id, progress: 45, completedModules: [react.modules[0]._id] });
await Enrollment.create({ student: s2._id, course: ml._id,    progress: 30 });

// 6. Submission
await Submission.create({
  assignment: a1._id, course: ml._id, student: s1._id,
  content: `I implemented a 2-layer neural network using only NumPy.
Forward pass: Z1 = W1·X + b1, A1 = ReLU(Z1), Z2 = W2·A1 + b2, A2 = Sigmoid(Z2).
Backprop: dW2 = (1/m) A1·dZ2^T, dW1 = (1/m) X·dZ1^T.
Learning rate 0.01, 1000 iterations. Test accuracy: 92%.`,
  status: "pending",
});

console.log("✓ Seed complete");
console.log("  Admin   → demo.admin@edulearn.io   / demo1234");
console.log("  Teacher → demo.teacher@edulearn.io / demo1234");
console.log("  Student → demo.student@edulearn.io / demo1234");
process.exit(0);