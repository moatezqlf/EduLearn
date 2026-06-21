// ─────────────────────────────────────────────────────────────
//  api.js  —  Centralized API client with JWT auth
//  Usage:  import api from './api'
//          const courses = await api.courses.getAll()
// ─────────────────────────────────────────────────────────────

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

// ── Token helpers ─────────────────────────────────────────────
export const tokenStorage = {
  get:    ()      => localStorage.getItem("edulearn_token"),
  set:    (token) => {
    localStorage.setItem("edulearn_token", token);
    // Same-tab notification (storage event doesn't fire in same window)
    window.dispatchEvent(new Event("auth:token"));
  },
  remove: ()      => {
    localStorage.removeItem("edulearn_token");
    window.dispatchEvent(new Event("auth:logout"));
  },
};

// ── Core fetch wrapper ────────────────────────────────────────
async function request(endpoint, options = {}) {
  const token = tokenStorage.get();

  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // Token expired → force logout
  if (response.status === 401) {
    tokenStorage.remove();
    window.dispatchEvent(new Event("auth:logout"));
    throw new Error("Session expired. Please log in again.");
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || "Request failed");
  }

  // 204 No Content
  if (response.status === 204) return null;

  return response.json();
}

// ── Streaming fetch (for AI responses) ───────────────────────
export async function streamRequest(endpoint, body, onChunk, onDone, onError) {
  const token = tokenStorage.get();

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || "Stream request failed");
    }

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") { onDone?.(); return; }
          try {
            const parsed = JSON.parse(raw);
            onChunk?.(parsed);
          } catch {
            // non-JSON SSE line, skip
          }
        }
      }
    }
    onDone?.();
  } catch (err) {
    onError?.(err);
  }
}

// ── Shorthand methods ─────────────────────────────────────────
const get    = (url, opts)       => request(url, { method: "GET",    ...opts });
const post   = (url, data, opts) => request(url, { method: "POST",   body: JSON.stringify(data), ...opts });
const put    = (url, data, opts) => request(url, { method: "PUT",    body: JSON.stringify(data), ...opts });
const patch  = (url, data, opts) => request(url, { method: "PATCH",  body: JSON.stringify(data), ...opts });
const del    = (url, opts)       => request(url, { method: "DELETE", ...opts });

// ─────────────────────────────────────────────────────────────
//  AUTH
// ─────────────────────────────────────────────────────────────
export const auth = {
  login:          (email, password)  => post("/auth/login",   { email, password }),
  register:       (data)             => post("/auth/register", data),
  logout:         ()                 => { tokenStorage.remove(); return post("/auth/logout"); },
  me:             ()                 => get("/auth/me"),
  refreshToken:   ()                 => post("/auth/refresh"),
  forgotPassword: (email)            => post("/auth/forgot-password", { email }),
  resetPassword:  (token, password)  => post("/auth/reset-password",  { token, password }),
};

// ─────────────────────────────────────────────────────────────
//  USERS  (admin)
// ─────────────────────────────────────────────────────────────
export const users = {
  getAll:   (params = {})    => get("/users?"    + new URLSearchParams(params)),
  getById:  (id)             => get(`/users/${id}`),
  update:   (id, data)       => put(`/users/${id}`, data),
  ban:      (id)             => patch(`/users/${id}/ban`),
  restore:  (id)             => patch(`/users/${id}/restore`),
  approve:  (id)             => patch(`/users/${id}/approve`),
  reject:   (id)             => del(`/users/${id}/reject`),
  delete:   (id)             => del(`/users/${id}`),
  invite:   (email, role)    => post("/users/invite", { email, role }),
  getStats: ()               => get("/users/stats"),
};

export const settings = {
  get:    ()           => get("/settings"),
  update: (data)       => put("/settings", data),
};

export const admin = {
  enroll: (studentId, courseId) => post("/admin/enroll", { studentId, courseId }),
};

export const forum = {
  getTopics:  (params = {}) => get("/forum/topics?" + new URLSearchParams(params)),
  getTopic:   (id)          => get(`/forum/topics/${id}`),
  createTopic:(data)        => post("/forum/topics", data),
  reply:      (id, body)    => post(`/forum/topics/${id}/replies`, { body }),
};

export const chat = {
  getConversations: () => get("/chat/conversations"),
  getMessages:      (withId, courseId) => {
    const q = new URLSearchParams({ with: withId });
    if (courseId) q.set("course", courseId);
    return get("/chat/messages?" + q);
  },
  send: (to, body, courseId) => post("/chat/messages", { to, body, courseId }),
};

export const emailApi = {
  send:         (data) => post("/email/send", data),
  announcement: (data) => post("/admin/announcement", data),
};

export const contacts = {
  getAll: () => get("/contacts"),
};

// ─────────────────────────────────────────────────────────────
//  COURSES
// ─────────────────────────────────────────────────────────────
export const courses = {
  getAll:     (params = {})       => get("/courses?"     + new URLSearchParams(params)),
  getById:    (id)                => get(`/courses/${id}`),
  create:     (data)              => post("/courses",      data),
  update:     (id, data)          => put(`/courses/${id}`, data),
  delete:     (id)                => del(`/courses/${id}`),
  publish:    (id)                => patch(`/courses/${id}/publish`),
  unpublish:  (id)                => patch(`/courses/${id}/unpublish`),
  enroll:     (id)                => post(`/courses/${id}/enroll`),
  unenroll:   (id)                => del(`/courses/${id}/enroll`),
  getModules: (id)                => get(`/courses/${id}/modules`),
  addModule:  (id, data)          => post(`/courses/${id}/modules`, data),
  addResource:(courseId, moduleId, formData) =>
    fetch(`${BASE_URL}/courses/${courseId}/modules/${moduleId}/resources`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenStorage.get()}` },
      body: formData,
    }).then(async (r) => {
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || "Upload failed"); }
      return r.json();
    }),
  getEnrolled:    ()               => get("/courses/enrolled"),
  getMyResources: ()               => get("/courses/my-resources"),
  getProgress: (id)               => get(`/courses/${id}/progress`),
  updateProgress: (id, moduleId)  => patch(`/courses/${id}/progress`, { moduleId }),
};

// ─────────────────────────────────────────────────────────────
//  ASSIGNMENTS
// ─────────────────────────────────────────────────────────────
export const assignments = {
  getByCourse:  (courseId)        => get(`/courses/${courseId}/assignments`),
  getById:      (id)              => get(`/assignments/${id}`),
  create:       (courseId, data)  => post(`/courses/${courseId}/assignments`, data),
  update:       (id, data)        => put(`/assignments/${id}`, data),
  delete:       (id)              => del(`/assignments/${id}`),
};

// ─────────────────────────────────────────────────────────────
//  SUBMISSIONS
// ─────────────────────────────────────────────────────────────
export const submissions = {
  getAll:       (params = {})       => get("/submissions?"    + new URLSearchParams(params)),
  getById:      (id)                => get(`/submissions/${id}`),
  getByStudent: ()                  => get("/submissions/mine"),
  submit:       (assignmentId, data)=> post(`/assignments/${assignmentId}/submissions`, data),
  grade:        (id, score, comment)=> patch(`/submissions/${id}/grade`, { score, comment }),
  getForReview: (id)                => get(`/submissions/${id}/peer-review`),
  submitPeerReview: (id, data)      => post(`/submissions/${id}/peer-review`, data),
};

// ─────────────────────────────────────────────────────────────
//  AI FEEDBACK  ← core feature
// ─────────────────────────────────────────────────────────────
export const aiFeedback = {
  // One-shot feedback (returns full JSON)
  generate: (submissionId) =>
    post(`/feedback/generate`, { submissionId }),

  // Streaming feedback (SSE) — calls onChunk for each token
  generateStream: (submissionId, { onChunk, onDone, onError }) =>
    streamRequest(
      "/feedback/generate-stream",
      { submissionId },
      onChunk,
      onDone,
      onError
    ),

  // Batch: AI reviews all pending submissions for a course
  batchGenerate: (courseId) =>
    post("/feedback/batch", { courseId }),

  // Get all feedbacks for a submission
  getBySubmission: (submissionId) =>
    get(`/submissions/${submissionId}/feedback`),

  // Get all feedbacks received by current student
  getMine: () =>
    get("/feedback/mine"),

  // Teacher approves/edits AI-generated feedback before release
  approve: (feedbackId, edits) =>
    patch(`/feedback/${feedbackId}/approve`, edits),
};

// ─────────────────────────────────────────────────────────────
//  ANALYTICS  (admin / teacher)
// ─────────────────────────────────────────────────────────────
export const analytics = {
  platform:     ()        => get("/analytics/platform"),
  course:       (id)      => get(`/analytics/courses/${id}`),
  teacher:      ()        => get("/analytics/teacher"),
  student:      ()        => get("/analytics/student"),
  exportCSV:    (type)    => get(`/analytics/export?type=${type}`),
};

// ─────────────────────────────────────────────────────────────
//  TEACHERS  (for student browse / follow)
// ─────────────────────────────────────────────────────────────
export const teachers = {
  /** List all active teachers */
  getAll:       ()           => get("/teachers"),
  /** Check if current user follows a teacher */
  followStatus: (teacherId)  => get(`/follow/status/${teacherId}`),
  /** Follow a teacher */
  follow:       (teacherId)  => post("/follow",  { teacherId }),
  /** Unfollow a teacher — sends teacherId in body */
  unfollow:     (teacherId)  => request("/follow", {
    method: "DELETE",
    body: JSON.stringify({ teacherId }),
  }),
};

// ─────────────────────────────────────────────────────────────
//  SESSIONS  (HTTP — create session + notify followers)
// ─────────────────────────────────────────────────────────────
export const sessions = {
  /** Teacher: create a session and notify all followers in one call */
  create: (question) => post("/sessions", { question }),
  getActive: () => get("/sessions/active"),
  getHistory: () => get("/sessions/history"),
  getReceived: () => get("/sessions/received"),
  getStudentGroupsBySpecialty: () => get("/students/groups-by-specialty"),
  /** Student: AI assist while writing peer feedback */
  assistPeerFeedback: (data) => post("/sessions/assist-peer-feedback", data),
  /** Teacher: AI-generate sentence starters for a section */
  generateStarters: (sectionName, criteria, docType) =>
    post("/sessions/generate-starters", { sectionName, criteria, docType }),
  /** Teacher: extract text from a PDF/txt/md file (FormData) */
  extractText: (formData) => {
    const token = tokenStorage.get();
    return fetch(`${BASE_URL}/sessions/extract-text`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then(r => r.ok ? r.json() : r.json().then(e => { throw new Error(e.message); }));
  },
};

// ─────────────────────────────────────────────────────────────
//  NOTIFICATIONS
// ─────────────────────────────────────────────────────────────
export const notifications = {
  /** Get all notifications for a user */
  getAll:   (userId)  => get(`/notifications/${userId}`),
  /** Mark one notification read */
  markRead: (id)      => patch(`/notifications/${id}/read`),
  /** Mark all notifications read */
  markAll:  ()        => patch("/notifications/read-all"),
};

// ─────────────────────────────────────────────────────────────
//  Default export — all namespaces grouped
// ─────────────────────────────────────────────────────────────
const api = {
  auth, users, settings, admin, courses, assignments, submissions, aiFeedback,
  analytics, teachers, sessions, notifications, forum, chat, email: emailApi, contacts,
};
export default api;
