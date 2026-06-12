import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { useLang, LangToggle } from "./i18n/LanguageContext";
import api from "./api";
import Activesessions from "./Activesessions";
import NotificationBell from "./NotificationBell";
import ResourceArticleViewer from "./session/ResourceArticleViewer";


const fmt = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso), diff = Date.now() - d;
  if (diff < 86400000)  return "Today";
  if (diff < 172800000) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

const courseColor  = i => ["#6C63FF","#0EA5E9","#10B981","#F59E0B","#EC4899","#14B8A6"][i % 6];
const courseThumb  = title => title.split(" ").slice(0,2).map(w => w[0]).join("").toUpperCase();

const statusCfg = {
  pending:     { label: "Pending",     bg: "#FFF3CD", color: "#92600A", dot: "#F59E0B" },
  ai_reviewed: { label: "AI Reviewed", bg: "#EEF2FF", color: "#3730A3", dot: "#6C63FF" },
  graded:      { label: "Graded",      bg: "#D1FAE5", color: "#065F46", dot: "#10B981" },
  returned:    { label: "Returned",    bg: "#FEE2E2", color: "#DC2626", dot: "#EF4444" },
};

const navItems = [
  { id: "dashboard",     key: "nav_dashboard",     icon: "⊞",  route: null },
  { id: "courses",       key: "nav_courses",        icon: "◫",  route: null },
  { id: "resources",     key: "nav_resources",      icon: "📄",  route: null },
  { id: "history",       key: "nav_history",        icon: "◉",  route: null },
  { id: "catalog",       key: "nav_catalog",        icon: "🔍", route: "/student/catalog" },
  { id: "communication", key: "nav_communication",  icon: "💬", route: "/student/communication" },
  { id: "profile",       key: "nav_profile",        icon: "⊙",  route: null },
];

const css = `
  @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  *{box-sizing:border-box;margin:0;padding:0}
  ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:#D1D5DB;border-radius:99px}
  .fade-up{animation:fadeUp .35s ease forwards}
  .nav-item{display:flex;align-items:center;gap:10px;padding:9px 14px;border-radius:10px;cursor:pointer;font-size:14px;color:#6B7280;transition:all .18s;white-space:nowrap;user-select:none}
  .nav-item:hover{background:#F3F4F6;color:#1A1D23}
  .nav-item.active{background:#1A1D23;color:#fff;font-weight:500}
  .card{background:#fff;border-radius:14px;border:1px solid #EAECF0}
  .course-card{background:#fff;border-radius:14px;padding:18px;border:1px solid #EAECF0;cursor:pointer;transition:all .2s;position:relative;overflow:hidden}
  .course-card:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.08)}
  .sub-row{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:10px;background:#fff;border:1px solid #EAECF0;transition:all .15s;cursor:pointer}
  .sub-row:hover{border-color:#D1D5DB;box-shadow:0 2px 8px rgba(0,0,0,.05)}
  .feedback-card{background:#fff;border-radius:14px;padding:16px;border:1px solid #EAECF0;transition:all .2s;cursor:pointer}
  .feedback-card:hover{box-shadow:0 4px 16px rgba(0,0,0,.06)}
  .stat-card{background:#fff;border-radius:14px;padding:18px 20px;border:1px solid #EAECF0;flex:1}
  .btn-primary{background:#1A1D23;color:#fff;border:none;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;transition:all .15s}
  .btn-primary:hover{background:#2D3139}
  .btn-ghost{background:transparent;color:#6B7280;border:1px solid #EAECF0;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;transition:all .15s}
  .btn-ghost:hover{background:#F9FAFB;color:#1A1D23}
  .progress-bar{height:5px;background:#F3F4F6;border-radius:99px;overflow:hidden}
  .progress-fill{height:100%;border-radius:99px;transition:width .8s cubic-bezier(.4,0,.2,1)}
  .section-title{font-family:'Syne',sans-serif;font-size:15px;font-weight:700;color:#1A1D23;letter-spacing:-.01em}
  .skeleton{background:linear-gradient(90deg,#F3F4F6 25%,#E9EAEC 50%,#F3F4F6 75%);background-size:200% 100%;animation:shimmer 1.2s infinite;border-radius:6px}
  @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
  .error-banner{background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:12px 16px;font-size:13px;color:#DC2626;display:flex;align-items:center;gap:8px}
  .input-field{width:100%;background:#F9FAFB;border:1.5px solid #EAECF0;border-radius:10px;padding:10px 14px;font-size:13px;color:#1A1D23;font-family:inherit;outline:none;transition:border-color .15s}
  .input-field:focus{border-color:#6C63FF;background:#fff}
  /* ── Responsive ── */
  .sidebar-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:39}
  @media(max-width:768px){
    .sidebar-overlay.open{display:block}
    .sidebar-mobile{position:fixed!important;left:0;top:0;bottom:0;z-index:40;box-shadow:4px 0 24px rgba(0,0,0,.12)}
    .main-pad{padding:16px 14px!important}
    .stats-row{flex-wrap:wrap!important}
    .stats-row .stat-card{min-width:calc(50% - 6px)!important}
    .courses-grid{grid-template-columns:1fr!important}
    .header-row{flex-wrap:wrap;gap:10px}
    .header-row h1{font-size:18px!important}
    .sub-row{flex-wrap:wrap}
  }
  @media(max-width:480px){
    .stats-row .stat-card{min-width:100%!important}
    .header-row h1{font-size:16px!important}
    .main-pad{padding:12px 10px!important}
  }
`;

const Ring = ({ value, size = 52, stroke = 4, color }) => {
  const r = (size - stroke * 2) / 2, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#E5E7EB" strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={c - (value/100)*c} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset .8s cubic-bezier(.4,0,.2,1)" }}/>
    </svg>
  );
};

const SkeletonCard = () => (
  <div className="card" style={{ padding: 18 }}>
    <div className="skeleton" style={{ height: 40, width: 40, borderRadius: 10, marginBottom: 12 }}/>
    <div className="skeleton" style={{ height: 14, width: "70%", marginBottom: 8 }}/>
    <div className="skeleton" style={{ height: 11, width: "45%", marginBottom: 14 }}/>
    <div className="skeleton" style={{ height: 5, borderRadius: 99 }}/>
  </div>
);

export default function StudentDashboard() {
  const { user, logout, updateUser } = useAuth();
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const [activeNav,   setActiveNav]   = useState("dashboard");
  const [isMobile,    setIsMobile]    = useState(() => window.innerWidth < 769);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 769);

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth < 769;
      setIsMobile(mobile);
      if (!mobile) setSidebarOpen(true);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Data
  const [courses,     setCourses]     = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [feedbacks,   setFeedbacks]   = useState([]);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [teacherResources, setTeacherResources] = useState([]);
  const [viewResource, setViewResource] = useState(null);
  const [stats,       setStats]       = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");

  // Profile
  const [editName,     setEditName]     = useState(user?.name || "");
  const [editBio,      setEditBio]      = useState(user?.bio  || "");
  const [savingProfile,setSavingProfile]= useState(false);
  const [profileMsg,   setProfileMsg]   = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [cRes, sRes, fRes, aRes] = await Promise.all([
        api.courses.getEnrolled(),
        api.submissions.getByStudent(),
        api.aiFeedback.getMine(),
        api.analytics.student(),
      ]);
      const [hRes, rRes] = await Promise.all([
        api.sessions.getHistory().catch(() => ({ history: [] })),
        api.sessions.getReceived().catch(() => ({ resources: [] })),
      ]);
      setCourses(cRes.courses     || []);
      setTeacherResources(rRes.resources || []);
      setSubmissions(sRes.submissions || []);
      setFeedbacks(fRes.feedbacks   || []);
      setSessionHistory(hRes.history || []);
      setStats(aRes);
    } catch (e) { setError(e.message || "Failed to load data"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Syne:wght@700&display=swap";
    document.head.appendChild(link);
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
    return () => { document.head.removeChild(link); document.head.removeChild(style); };
  }, []);

  // Handle nav clicks — some navigate to routes, others switch sections
  const handleNav = (item) => {
    if (item.route) {
      navigate(item.route);
    } else {
      setActiveNav(item.id);
    }
  };

  const saveProfile = async () => {
    setSavingProfile(true); setProfileMsg("");
    try {
      await api.users.update(user._id, { name: editName, bio: editBio });
      if (updateUser) updateUser({ name: editName, bio: editBio });
      setProfileMsg(t("profile_updated"));
      setTimeout(() => setProfileMsg(""), 3000);
    } catch (e) { setProfileMsg(t("error_load") + ": " + e.message); }
    finally { setSavingProfile(false); }
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? t("greeting_morning") : hour < 18 ? t("greeting_afternoon") : t("greeting_evening");

  const statCards = [
    { label: t("stat_enrolled"),    value: stats ? String(stats.enrolled)   : "—", sub: t("stat_active"),    icon: "◫", accent: "#6C63FF" },
    { label: t("stat_assignments"), value: stats ? String(stats.submissions) : "—", sub: t("stat_submitted"), icon: "✎", accent: "#0EA5E9" },
    { label: t("stat_avg_score"),   value: stats?.avgScore != null ? stats.avgScore + "%" : "—", sub: t("stat_average"), icon: "◎", accent: "#10B981" },
    { label: t("stat_feedbacks"),   value: stats ? String(stats.feedbacks)  : "—", sub: t("stat_reviews"),   icon: "◈", accent: "#F59E0B" },
  ];

  // ── Determine what to show based on activeNav ─────────────
  const showDashboard   = activeNav === "dashboard";
  const showCourses     = activeNav === "courses";
  const showResources   = activeNav === "resources";
  // Hidden tabs kept for backward compatibility with old internal links.
  const showAssignments = activeNav === "assignments";
  const showFeedback    = activeNav === "feedback";
  const showHistory     = activeNav === "history";
  const showProfile     = activeNav === "profile";

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "'DM Sans','Segoe UI',sans-serif", background: "#F7F8FC", color: "#1A1D23" }}>

      {/* Mobile overlay */}
      {isMobile && (
        <div className={`sidebar-overlay${sidebarOpen ? " open" : ""}`} onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={isMobile ? "sidebar-mobile" : ""} style={{ width: sidebarOpen ? 220 : (isMobile ? 0 : 64), transition: "width .25s ease", background: "#fff", borderRight: "1px solid #EAECF0", display: "flex", flexDirection: "column", padding: sidebarOpen ? "20px 12px" : (isMobile ? 0 : "20px 8px"), flexShrink: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 6px 20px", borderBottom: "1px solid #F3F4F6", marginBottom: 12 }}>
          <div style={{ width: 32, height: 32, background: "#1A1D23", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, fontFamily: "'Syne',sans-serif", fontWeight: 700, flexShrink: 0 }}>E</div>
          {sidebarOpen && <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, whiteSpace: "nowrap" }}>EduLearn</span>}
        </div>
        <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
          {navItems.map(item => (
            <div key={item.id} className={`nav-item ${activeNav === item.id ? "active" : ""}`} onClick={() => { handleNav(item); if (isMobile) setSidebarOpen(false); }}>
              <span style={{ fontSize: 15, width: 20, textAlign: "center" }}>{item.icon}</span>
              {sidebarOpen && <span>{t(item.key)}</span>}
            </div>
          ))}
        </nav>
        <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: 14, display: "flex", alignItems: "center", gap: 10, padding: "14px 6px 0" }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#6C63FF,#0EA5E9)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
            {user?.name?.slice(0,2).toUpperCase() || "??"}
          </div>
          {sidebarOpen && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#1A1D23", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.name || t("role_student")}</div>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>{t("role_student")}</div>
            </div>
          )}
          {sidebarOpen && <button onClick={logout} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#9CA3AF", padding: 4 }} title={t("btn_logout")}>⏻</button>}
        </div>
      </aside>

      {/* Main */}
      <main className="main-pad" style={{ flex: 1, overflow: "auto", padding: "28px 32px" }}>

        {/* Header */}
        <div className="header-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <div>
            <p style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 3 }}>{new Date().toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
            <h1 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 24, color: "#1A1D23", letterSpacing: "-.02em" }}>
              {greeting}, {user?.name?.split(" ")[0] || t("role_student")} 👋
            </h1>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <LangToggle />
            <NotificationBell />
            <button className="btn-ghost" onClick={() => setSidebarOpen(v => !v)} style={{ padding: "8px 12px" }}>☰</button>
            <button className="btn-ghost" onClick={fetchAll} style={{ padding: "8px 12px" }} title={t("btn_refresh")}>↻</button>
          </div>
        </div>

        {error && (
          <div className="error-banner" style={{ marginBottom: 20 }}>
            ⚠ {error}
            <button onClick={fetchAll} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#DC2626", fontWeight: 600, fontSize: 12 }}>{t("btn_retry")}</button>
          </div>
        )}

        {/* ── PROFILE ── */}
        {showProfile && (
          <div className="fade-up" style={{ maxWidth: 600 }}>
            <div className="card" style={{ padding: 24, marginBottom: 20 }}>
              <h2 className="section-title" style={{ marginBottom: 20 }}>{t("my_profile")}</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24, padding: 16, background: "#F9FAFB", borderRadius: 12 }}>
                <div style={{ width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(135deg,#6C63FF,#0EA5E9)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 22, fontWeight: 700 }}>
                  {user?.name?.slice(0,2).toUpperCase() || "??"}
                </div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 16, color: "#1A1D23" }}>{user?.name}</p>
                  <p style={{ fontSize: 13, color: "#9CA3AF" }}>{user?.email} · Student</p>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 20 }}>
                {[
                  { label: "Courses",   value: stats?.enrolled    || 0 },
                  { label: "Submitted", value: stats?.submissions  || 0 },
                  { label: "Avg Score", value: stats?.avgScore != null ? stats.avgScore + "%" : "—" },
                  { label: "Feedbacks", value: stats?.feedbacks    || 0 },
                ].map(s => (
                  <div key={s.label} style={{ background: "#F9FAFB", border: "1px solid #EAECF0", borderRadius: 10, padding: 12, textAlign: "center" }}>
                    <p style={{ fontSize: 20, fontWeight: 700, color: "#6C63FF", fontFamily: "'Syne',sans-serif" }}>{s.value}</p>
                    <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 3 }}>{s.label}</p>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#4B5563", display: "block", marginBottom: 6 }}>{t("full_name")}</label>
                  <input className="input-field" value={editName} onChange={e => setEditName(e.target.value)} placeholder={t("full_name")}/>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#4B5563", display: "block", marginBottom: 6 }}>{t("email_label")}</label>
                  <input className="input-field" value={user?.email || ""} disabled style={{ opacity: .6, cursor: "not-allowed" }}/>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#4B5563", display: "block", marginBottom: 6 }}>{t("bio")}</label>
                  <input className="input-field" value={editBio} onChange={e => setEditBio(e.target.value)} placeholder={t("bio")}/>
                </div>
              </div>
              {profileMsg && (
                <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: profileMsg.startsWith("✓") ? "#D1FAE5" : "#FEE2E2", color: profileMsg.startsWith("✓") ? "#065F46" : "#DC2626", fontSize: 13 }}>
                  {profileMsg}
                </div>
              )}
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button className="btn-primary" style={{ background: "#6C63FF" }} onClick={saveProfile} disabled={savingProfile}>
                  {savingProfile ? t("saving") : t("save_changes")}
                </button>
                <button className="btn-ghost" style={{ color: "#EF4444", borderColor: "#FECACA" }} onClick={logout}>{t("sign_out")}</button>
              </div>
            </div>
          </div>
        )}

        {/* ── COURSES SECTION ── */}
        {showCourses && (
          <div className="fade-up">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 className="section-title" style={{ fontSize: 18 }}>{t("my_courses")}</h2>
              <button className="btn-primary" onClick={() => navigate("/student/catalog")}>{t("browse_catalog")} →</button>
            </div>
            {loading ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                {[0,1,2].map(i => <SkeletonCard key={i}/>)}
              </div>
            ) : courses.length === 0 ? (
              <div className="card" style={{ padding: 40, textAlign: "center" }}>
                <p style={{ fontSize: 36, marginBottom: 12 }}>📚</p>
                <p style={{ fontWeight: 600, fontSize: 16, color: "#1A1D23", marginBottom: 4 }}>{t("no_courses_student_title")}</p>
                <p style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 20 }}>{t("no_courses_student_sub")}</p>
                <button className="btn-primary" onClick={() => navigate("/student/catalog")}>{t("explore_courses")}</button>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                {courses.map((c, i) => {
                  const color = courseColor(i);
                  const pct   = c.progress || 0;
                  return (
                    <div className="course-card fade-up" key={c._id || i} onClick={() => navigate(`/student/courses/${c._id}`)}>
                      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: color, borderRadius: "14px 14px 0 0" }}/>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, marginTop: 6 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: color+"18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color }}>{courseThumb(c.title)}</div>
                        <span style={{ fontSize: 11, background: "#F3F4F6", color: "#4B5563", padding: "3px 9px", borderRadius: 6, fontWeight: 500 }}>{c.category || "Course"}</span>
                      </div>
                      <p style={{ fontWeight: 600, fontSize: 14, color: "#1A1D23", lineHeight: 1.4, marginBottom: 4 }}>{c.title}</p>
                      <p style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 14 }}>{c.teacher?.name || "Instructor"}</p>
                      <div className="progress-bar"><div className="progress-fill" style={{ width: pct + "%", background: color }}/></div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "#6B7280" }}>
                        <span>{c.completedModules?.length || 0}/{c.modules?.length || 0} modules</span>
                        <span style={{ fontWeight: 600, color }}>{pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── ASSIGNMENTS SECTION ── */}
        {showAssignments && (
          <div className="fade-up">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 className="section-title" style={{ fontSize: 18 }}>{t("my_submissions")}</h2>
              <button className="btn-primary" onClick={() => navigate("/student/submit")}>{t("submit_assignment_btn")}</button>
            </div>
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[0,1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 60, borderRadius: 10 }}/>)}
              </div>
            ) : submissions.length === 0 ? (
              <div className="card" style={{ padding: 40, textAlign: "center" }}>
                <p style={{ fontSize: 36, marginBottom: 12 }}>✎</p>
                <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>{t("no_submissions")}</p>
                <p style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 20 }}>{t("no_submissions_sub")}</p>
                <button className="btn-primary" onClick={() => navigate("/student/submit")}>{t("submit_assignment_btn")}</button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {submissions.map(s => {
                  const sc = statusCfg[s.status] || statusCfg.pending;
                  return (
                    <div className="sub-row" key={s._id} onClick={() => navigate(`/student/feedback/${s._id}`)}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 500, color: "#1A1D23", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.assignment?.title || "Assignment"}</p>
                        <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{s.course?.title} · {fmt(s.submittedAt)}</p>
                      </div>
                      {s.score != null && <span style={{ fontSize: 13, fontWeight: 700, color: s.score >= 80 ? "#10B981" : s.score >= 60 ? "#F59E0B" : "#EF4444" }}>{s.score}pts</span>}
                      <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 6, background: sc.bg, color: sc.color, whiteSpace: "nowrap", flexShrink: 0 }}>
                        <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: sc.dot, marginRight: 5 }}/>
                        {sc.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── FEEDBACK SECTION ── */}
        {showFeedback && (
          <div className="fade-up">
            <h2 className="section-title" style={{ fontSize: 18, marginBottom: 16 }}>{t("ai_feedback_label")}</h2>
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[0,1,2].map(i => <div key={i} className="skeleton" style={{ height: 100, borderRadius: 14 }}/>)}
              </div>
            ) : feedbacks.length === 0 ? (
              <div className="card" style={{ padding: 40, textAlign: "center" }}>
                <p style={{ fontSize: 36, marginBottom: 12 }}>◈</p>
                <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>{t("no_feedback_title")}</p>
                <p style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 20 }}>Submit an assignment to get AI-powered feedback</p>
                <button className="btn-primary" onClick={() => navigate("/student/submit")}>Submit Assignment</button>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {feedbacks.map(f => {
                  const score = f.overallScore || 0;
                  const color = score >= 85 ? "#10B981" : score >= 70 ? "#F59E0B" : "#EF4444";
                  return (
                    <div className="feedback-card" key={f._id} onClick={() => navigate(`/student/feedback/${f.submission?._id || f.submission}`)}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                        <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: "#1A1D23" }}>
                            {f.generatedBy === "claude" ? "🤖 AI Feedback" : "👤 Peer Feedback"}
                          </p>
                          <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{fmt(f.createdAt)}</p>
                        </div>
                        <div style={{ position: "relative", width: 52, height: 52, flexShrink: 0 }}>
                          <Ring value={score} color={color}/>
                          <span style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", fontSize: 12, fontWeight: 700, color: "#1A1D23" }}>{score}</span>
                        </div>
                      </div>
                      {f.summary && <p style={{ fontSize: 12, color: "#4B5563", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>{f.summary}</p>}
                      {f.level && <span style={{ display: "inline-block", marginTop: 8, fontSize: 11, padding: "2px 10px", borderRadius: 99, background: color + "18", color, fontWeight: 600 }}>{f.level}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── RESOURCES SECTION ── */}
        {showResources && (
          <div className="fade-up">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 className="section-title" style={{ fontSize: 18 }}>{t("teacher_resources")}</h2>
              <span style={{ fontSize: 12, color: "#9CA3AF" }}>{teacherResources.length} publication(s)</span>
            </div>
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[0,1,2].map(i => <div key={i} className="skeleton" style={{ height: 60, borderRadius: 10 }}/>)}
              </div>
            ) : teacherResources.length === 0 ? (
              <div className="card" style={{ padding: 40, textAlign: "center" }}>
                <p style={{ fontSize: 36, marginBottom: 12 }}>📄</p>
                <p style={{ fontWeight: 600, fontSize: 16, color: "#1A1D23", marginBottom: 4 }}>{t("no_resources")}</p>
                <p style={{ fontSize: 13, color: "#9CA3AF" }}>{t("no_resources_sub")}</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {teacherResources.map(r => (
                  <div
                    key={r.sessionId}
                    className="card"
                    style={{ padding: 14, cursor: "pointer" }}
                    onClick={() => setViewResource(r)}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <div>
                        <p style={{ fontWeight: 600, fontSize: 14, color: "#1A1D23" }}>{r.question}</p>
                        <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>
                          {r.teacherName}
                          {r.missingSection ? ` · Section à apprendre : ${r.missingSection}` : ""}
                        </p>
                      </div>
                      <span style={{ fontSize: 11, color: "#6366f1", fontWeight: 600, flexShrink: 0 }}>Lire →</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {showHistory && (
          <div className="fade-up">
            <div className="card" style={{ padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h2 className="section-title" style={{ fontSize: 18 }}>{t("session_history_label")}</h2>
                <span style={{ fontSize: 12, color: "#9CA3AF" }}>{sessionHistory.length} session(s)</span>
              </div>
              {sessionHistory.length === 0 ? (
                <p style={{ fontSize: 13, color: "#9CA3AF", padding: "12px 4px" }}>{t("no_session_history_student")}</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {sessionHistory.map((h, idx) => (
                    <div key={`${h.sessionId}-${idx}`} style={{ border: "1px solid #EAECF0", borderRadius: 10, padding: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "#1A1D23" }}>{h.sectionKey || "Session"}</div>
                        <div style={{ fontSize: 11, color: "#9CA3AF" }}>{fmt(h.submittedAt)}</div>
                      </div>
                      <div style={{ fontSize: 12, color: "#4B5563", marginBottom: 8, lineHeight: 1.5 }}>{h.question}</div>
                      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11, color: "#6B7280" }}>
                        <span>Code: <strong>{h.code}</strong></span>
                        <span>Peer reviews: <strong>{h.interactions?.peerReviewsReceived ?? 0}</strong></span>
                        <span>AI score: <strong>{h.interactions?.aiScore ?? "—"}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── MAIN DASHBOARD ── */}
        {viewResource && (
          <ResourceArticleViewer resource={viewResource} onClose={() => setViewResource(null)} />
        )}

        {showDashboard && (
          <>
            {/* Active Sessions — shows live sessions from followed teachers */}
            <Activesessions />

            {/* Stats */}
            <div style={{ display: "flex", gap: 14, marginBottom: 28 }} className="fade-up">
              {statCards.map((s, i) => (
                <div className="stat-card" key={i}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <p style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 6, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</p>
                      {loading ? <div className="skeleton" style={{ height: 28, width: 60, marginBottom: 6 }}/> : <p style={{ fontSize: 26, fontWeight: 700, fontFamily: "'Syne',sans-serif", color: "#1A1D23", lineHeight: 1 }}>{s.value}</p>}
                      <p style={{ fontSize: 11, color: "#6B7280", marginTop: 5 }}>{s.sub}</p>
                    </div>
                    <div style={{ width: 36, height: 36, borderRadius: 10, fontSize: 16, background: s.accent + "15", display: "flex", alignItems: "center", justifyContent: "center", color: s.accent }}>{s.icon}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

                {/* Courses */}
                <section>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <span className="section-title">{t("my_courses")}</span>
                    <button className="btn-ghost" style={{ fontSize: 12, padding: "5px 12px" }} onClick={() => setActiveNav("courses")}>{t("view_all")}</button>
                  </div>
                  {loading ? (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      {[0,1].map(i => <SkeletonCard key={i}/>)}
                    </div>
                  ) : courses.length === 0 ? (
                    <div className="card" style={{ padding: 32, textAlign: "center" }}>
                      <p style={{ fontSize: 32, marginBottom: 8 }}>📚</p>
                      <p style={{ fontWeight: 600, color: "#1A1D23", marginBottom: 4 }}>{t("no_courses_student_title")}</p>
                      <p style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 16 }}>{t("no_courses_student_sub")}</p>
                      <button className="btn-primary" onClick={() => navigate("/student/catalog")}>{t("explore_courses")}</button>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      {courses.slice(0, 4).map((c, i) => {
                        const color = courseColor(i);
                        const pct   = c.progress || 0;
                        return (
                          <div className="course-card fade-up" key={c._id || i}>
                            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: color, borderRadius: "14px 14px 0 0" }}/>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, marginTop: 6 }}>
                              <div style={{ width: 40, height: 40, borderRadius: 10, background: color+"18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color, letterSpacing: "0.05em" }}>{courseThumb(c.title)}</div>
                              <span style={{ fontSize: 11, background: "#F3F4F6", color: "#4B5563", padding: "3px 9px", borderRadius: 6, fontWeight: 500 }}>{c.category || "Course"}</span>
                            </div>
                            <p style={{ fontWeight: 600, fontSize: 13, color: "#1A1D23", lineHeight: 1.4, marginBottom: 4 }}>{c.title}</p>
                            <p style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 12 }}>{c.teacher?.name || "Instructor"}</p>
                            <div className="progress-bar"><div className="progress-fill" style={{ width: pct + "%", background: color }}/></div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "#6B7280" }}>
                              <span>{c.completedModules?.length || 0}/{c.modules?.length || 0} modules</span>
                              <span style={{ fontWeight: 600, color }}>{pct}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* Submissions */}
                <section>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <span className="section-title">{t("recent_submissions")}</span>
                    <button className="btn-ghost" style={{ fontSize: 12, padding: "5px 12px" }} onClick={() => setActiveNav("assignments")}>{t("view_all")}</button>
                  </div>
                  {loading ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {[0,1,2].map(i => <div key={i} className="skeleton" style={{ height: 60, borderRadius: 10 }}/>)}
                    </div>
                  ) : submissions.length === 0 ? (
                    <div className="card" style={{ padding: 24, textAlign: "center" }}>
                      <p style={{ fontSize: 13, color: "#9CA3AF" }}>No submissions yet.</p>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {submissions.slice(0,5).map(s => {
                        const sc = statusCfg[s.status] || statusCfg.pending;
                        return (
                          <div className="sub-row" key={s._id} onClick={() => navigate(`/student/feedback/${s._id}`)}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 13, fontWeight: 500, color: "#1A1D23", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.assignment?.title || "Assignment"}</p>
                              <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{s.course?.title} · {fmt(s.submittedAt)}</p>
                            </div>
                            {s.score != null && <span style={{ fontSize: 13, fontWeight: 700, color: s.score >= 80 ? "#10B981" : s.score >= 60 ? "#F59E0B" : "#EF4444" }}>{s.score}pts</span>}
                            <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 6, background: sc.bg, color: sc.color, whiteSpace: "nowrap", flexShrink: 0 }}>
                              <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: sc.dot, marginRight: 5 }}/>
                              {sc.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>

              {/* Right */}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* AI Panel */}
                <div style={{ background: "#1A1D23", borderRadius: 16, padding: "20px", color: "#fff" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: "#6C63FF22", border: "1px solid #6C63FF44", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>◈</div>
                    <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14 }}>{t("ai_feedback_label")}</span>
                    <span style={{ marginLeft: "auto", fontSize: 10, background: "#6C63FF33", color: "#A5A0FF", padding: "2px 8px", borderRadius: 99, fontWeight: 600 }}>LIVE</span>
                  </div>
                  <p style={{ fontSize: 12, color: "#9CA3AF", lineHeight: 1.6, marginBottom: 14 }}>Get instant personalized feedback powered by Claude AI.</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <button className="btn-primary" style={{ background: "#6C63FF", padding: "10px 16px", justifyContent: "center", display: "flex" }} onClick={() => navigate("/student/submit")}>
                      ◈ {t("submit_ai_review")}
                    </button>
                    <button className="btn-primary" style={{ background: "#0F6E56", padding: "10px 16px", justifyContent: "center", display: "flex" }} onClick={() => navigate("/student/peer")}>
                      ⊕ {t("join_peer_session")}
                    </button>
                  </div>
                </div>

                {/* Recent feedbacks */}
                <div>
                  <p className="section-title" style={{ fontSize: 14, marginBottom: 12 }}>{t("recent_feedback")}</p>
                  {loading ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {[0,1].map(i => <div key={i} className="skeleton" style={{ height: 100, borderRadius: 14 }}/>)}
                    </div>
                  ) : feedbacks.length === 0 ? (
                    <div className="card" style={{ padding: 20, textAlign: "center" }}>
                      <p style={{ fontSize: 13, color: "#9CA3AF" }}>{t("no_feedback_short")}</p>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {feedbacks.slice(0,3).map(f => {
                        const score = f.overallScore || 0;
                        const color = score >= 85 ? "#10B981" : score >= 70 ? "#F59E0B" : "#EF4444";
                        return (
                          <div className="feedback-card" key={f._id} onClick={() => navigate(`/student/feedback/${f.submission?._id || f.submission}`)}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                              <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                                <p style={{ fontSize: 12, fontWeight: 600, color: "#1A1D23" }}>
                                  {f.generatedBy === "claude" ? "🤖 AI Feedback" : "👤 Peer Feedback"}
                                </p>
                                <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{fmt(f.createdAt)}</p>
                              </div>
                              <div style={{ position: "relative", width: 52, height: 52, flexShrink: 0 }}>
                                <Ring value={score} color={color}/>
                                <span style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", fontSize: 12, fontWeight: 700, color: "#1A1D23" }}>{score}</span>
                              </div>
                            </div>
                            {f.summary && <p style={{ fontSize: 12, color: "#4B5563", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{f.summary}</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Weekly activity */}
                <div className="card" style={{ padding: 16 }}>
                  <p className="section-title" style={{ fontSize: 14, marginBottom: 12 }}>{t("weekly_activity")}</p>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 60 }}>
                    {(stats?.weeklyActivity || [40,70,55,90,65,80,30]).map((h, i) => (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                        <div style={{ width: "100%", height: Math.max(4, h * 0.6), background: i === new Date().getDay() - 1 ? "#6C63FF" : "#E5E7EB", borderRadius: 4, transition: "height .5s ease" }}/>
                        <span style={{ fontSize: 9, color: "#9CA3AF" }}>{"MTWTFSS"[i]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}