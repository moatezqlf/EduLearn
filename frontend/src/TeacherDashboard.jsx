import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { useLang, LangToggle } from "./i18n/LanguageContext";
import api from "./api";

const fmt = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso), diff = Date.now() - d;
  if (diff < 3600000)   return Math.floor(diff / 60000) + "m ago";
  if (diff < 86400000)  return "Today, " + d.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" });
  if (diff < 172800000) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

const statusCfg = {
  pending:     { label: "Pending",     bg: "#FFF3CD", color: "#92600A", dot: "#F59E0B" },
  ai_reviewed: { label: "AI Reviewed", bg: "#EEF2FF", color: "#3730A3", dot: "#6C63FF" },
  graded:      { label: "Graded",      bg: "#D1FAE5", color: "#065F46", dot: "#10B981" },
  returned:    { label: "Returned",    bg: "#FEE2E2", color: "#DC2626", dot: "#EF4444" },
};

const navItems = [
  { id: "dashboard",     key: "nav_dashboard",     icon: "⊞" },
  { id: "courses",       key: "nav_courses",        icon: "◫" },
  { id: "students",      key: "nav_students",       icon: "⊕" },
  { id: "history",       key: "nav_history",        icon: "◉" },
  { id: "communication", key: "nav_communication",  icon: "💬", route: "/teacher/communication" },
  { id: "profile",       key: "nav_profile",        icon: "⊙" },
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
  .sub-row{display:grid;align-items:center;grid-template-columns:36px 1fr 130px 100px 110px 80px;gap:10px;padding:11px 16px;border-bottom:1px solid #F3F4F6;font-size:12px;transition:background .12s;cursor:pointer}
  .sub-row:hover{background:#FAFAFA}
  .sub-row:last-child{border-bottom:none}
  .course-row{display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:10px;background:#fff;border:1px solid #EAECF0;cursor:pointer;transition:all .15s}
  .course-row:hover{border-color:#C7D2E0;box-shadow:0 2px 10px rgba(0,0,0,.05)}
  .btn-primary{background:#1A1D23;color:#fff;border:none;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;transition:all .15s}
  .btn-primary:hover{background:#2D3139}
  .btn-sm{background:transparent;color:#6B7280;border:1px solid #EAECF0;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:500;cursor:pointer;font-family:inherit;transition:all .15s}
  .btn-sm:hover{background:#F3F4F6;color:#1A1D23}
  .btn-ai{background:#EEF2FF;color:#4F46E5;border:1px solid #C7D2FB;padding:5px 11px;border-radius:7px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s}
  .btn-ai:hover{background:#E0E7FF}
  .tab{padding:6px 14px;border-radius:8px;font-size:12px;font-weight:500;cursor:pointer;border:none;font-family:inherit;transition:all .15s}
  .tab.active{background:#1A1D23;color:#fff}
  .tab:not(.active){background:transparent;color:#6B7280}
  .tab:not(.active):hover{background:#F3F4F6;color:#1A1D23}
  .section-title{font-family:'Syne',sans-serif;font-size:15px;font-weight:700;color:#1A1D23;letter-spacing:-.01em}
  .avatar{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0}
  .badge{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:5px;font-size:11px;font-weight:600}
  .stat-card{background:#fff;border-radius:14px;padding:18px 20px;border:1px solid #EAECF0;flex:1}
  .skeleton{background:linear-gradient(90deg,#F3F4F6 25%,#E9EAEC 50%,#F3F4F6 75%);background-size:200% 100%;animation:shimmer 1.2s infinite;border-radius:6px}
  @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
  .progress-bar{height:5px;background:#F3F4F6;border-radius:99px;overflow:hidden}
  .progress-fill{height:100%;border-radius:99px;transition:width .8s cubic-bezier(.4,0,.2,1)}
  .error-banner{background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:12px 16px;font-size:13px;color:#DC2626;display:flex;align-items:center;gap:8px}
  .dropdown{position:relative;display:inline-block}
  .dropdown-menu{position:absolute;top:calc(100% + 6px);right:0;background:#fff;border:1px solid #EAECF0;border-radius:10px;padding:6px;min-width:180px;z-index:100;box-shadow:0 4px 20px rgba(0,0,0,.1)}
  .dropdown-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:7px;font-size:13px;color:#1A1D23;cursor:pointer;transition:background .12s}
  .dropdown-item:hover{background:#F3F4F6}
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
    .sub-row{grid-template-columns:36px 1fr 80px!important}
    .sub-col-hide{display:none!important}
    .header-row{flex-wrap:wrap;gap:10px}
    .header-row h1{font-size:18px!important}
    .courses-grid{grid-template-columns:1fr!important}
  }
  @media(max-width:480px){
    .stats-row .stat-card{min-width:100%!important}
    .main-pad{padding:12px 10px!important}
    .header-row h1{font-size:16px!important}
  }
`;

const colors  = ["#6C63FF","#0EA5E9","#10B981","#F59E0B","#EC4899"];
const avColor = s => colors[(s || "A").charCodeAt(0) % colors.length];

const Donut = ({ value, size = 46, stroke = 5, color }) => {
  const r = (size - stroke * 2) / 2, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#F3F4F6" strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={c - (value/100)*c} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 1s cubic-bezier(.4,0,.2,1)" }}/>
    </svg>
  );
};

const Spark = ({ data, color, height = 60 }) => {
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height }}>
      {data.map((v, i) => (
        <div key={i} style={{ flex: 1, height: Math.max(4, (v/max)*height), background: i === data.length-1 ? color : color+"55", borderRadius: "3px 3px 0 0", transition: "height .6s ease" }}/>
      ))}
    </div>
  );
};

export default function TeacherDashboard() {
  const { user, logout } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [activeNav,    setActiveNav]    = useState("dashboard");
  const [isMobile,     setIsMobile]     = useState(() => window.innerWidth < 769);
  const [sidebarOpen,  setSidebarOpen]  = useState(() => window.innerWidth >= 769);

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth < 769;
      setIsMobile(mobile);
      if (!mobile) setSidebarOpen(true);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const [activeTab,    setActiveTab]    = useState("all");
  const [selected,     setSelected]     = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [grading,      setGrading]      = useState(null);

  // Profile edit state
  const [editName,     setEditName]     = useState(user?.name || "");
  const [editBio,      setEditBio]      = useState(user?.bio  || "");
  const [savingProfile,setSavingProfile]= useState(false);
  const [profileMsg,   setProfileMsg]   = useState("");

  const [courses,      setCourses]      = useState([]);
  const [submissions,  setSubmissions]  = useState([]);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [analytics,    setAnalytics]    = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");
  const [batchMsg,     setBatchMsg]     = useState("");
  const [batchBusy,    setBatchBusy]    = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true); setError("");
    try {
      // Fetch only THIS teacher's courses (filter server-side)
      const [cRes, sRes, aRes] = await Promise.all([
        api.courses.getAll({ teacher: user?._id }),
        api.submissions.getAll({ teacher: user?._id, limit: 50 }),
        api.analytics.teacher(),
      ]);
      const hRes = await api.sessions.getHistory().catch(() => ({ history: [] }));
      setCourses(cRes.courses || []);
      setSubmissions(sRes.submissions || []);
      setSessionHistory(hRes.history || []);
      setAnalytics(aRes);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Syne:wght@700&display=swap";
    document.head.appendChild(link);
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
    // Close dropdown on outside click
    const close = () => setShowDropdown(false);
    document.addEventListener("click", close);
    return () => {
      document.head.removeChild(link);
      document.head.removeChild(style);
      document.removeEventListener("click", close);
    };
  }, []);

  const filtered  = activeTab === "all" ? submissions : submissions.filter(s => s.status === activeTab);
  const pending   = submissions.filter(s => s.status === "pending").length;

  const handleGrade = async (subId, score, note) => {
    try {
      await api.submissions.grade(subId, score, note);
      setSubmissions(prev => prev.map(s => s._id === subId ? { ...s, score, teacherNote: note, status: "graded" } : s));
      setGrading(null); setSelected(null);
    } catch (e) { alert(e.message); }
  };

  const handleGenerateAI = async (subId) => {
    setBatchBusy(true); setBatchMsg("");
    try {
      await api.aiFeedback.generate(subId);
      setBatchMsg("✓ AI feedback generated!");
      setSubmissions(prev => prev.map(s => s._id === subId ? { ...s, status: "ai_reviewed" } : s));
      if (selected?._id === subId) setSelected(s => ({ ...s, status: "ai_reviewed" }));
    } catch (e) { setBatchMsg("Error: " + e.message); }
    finally { setBatchBusy(false); }
  };

  const saveProfile = async () => {
    setSavingProfile(true); setProfileMsg("");
    try {
      await api.users.update(user._id, { name: editName, bio: editBio });
      setProfileMsg("✓ Profile updated successfully!");
    } catch (e) { setProfileMsg("Error: " + e.message); }
    finally { setSavingProfile(false); }
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? t("greeting_morning") : hour < 18 ? t("greeting_afternoon") : t("greeting_evening");

  const statCards = [
    { label: t("nav_students"),      value: analytics ? String(analytics.students)   : "—", sub: t("stat_active"),    icon: "⊕", accent: "#6C63FF" },
    { label: t("nav_courses"),       value: String(courses.length),                          sub: "total",             icon: "◫", accent: "#0EA5E9" },
    { label: t("status_pending"),    value: String(pending),                                 sub: t("btn_refresh"),    icon: "✎", accent: "#EF4444", urgent: pending > 0 },
    { label: t("submissions"),       value: analytics ? String(analytics.submissions) : "—", sub: "all time",          icon: "◎", accent: "#10B981" },
  ];

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
        {sidebarOpen && (
          <div style={{ margin: "0 6px 14px", padding: "6px 10px", background: "#F0FDF4", borderRadius: 8, fontSize: 11, color: "#166534", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10B981", display: "inline-block" }}/> {t("role_teacher")}
          </div>
        )}
        <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
          {navItems.map(item => (
            <div key={item.id} className={`nav-item ${activeNav === item.id ? "active" : ""}`} onClick={() => { item.route ? navigate(item.route) : setActiveNav(item.id); if (isMobile) setSidebarOpen(false); }}>
              <span style={{ fontSize: 15, width: 20, textAlign: "center" }}>{item.icon}</span>
              {sidebarOpen && <span>{t(item.key)}</span>}
              {sidebarOpen && item.id === "subs" && pending > 0 && (
                <span style={{ marginLeft: "auto", background: "#EF4444", color: "#fff", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 99 }}>{pending}</span>
              )}
            </div>
          ))}
        </nav>
        <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: 14, display: "flex", alignItems: "center", gap: 10, padding: "14px 6px 0" }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#10B981,#0EA5E9)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
            {user?.name?.slice(0,2).toUpperCase() || "TC"}
          </div>
          {sidebarOpen && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#1A1D23", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.name || t("role_teacher")}</div>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>{t("role_teacher")}</div>
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
            <p style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 3 }}>{new Date().toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
            <h1 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 24, color: "#1A1D23", letterSpacing: "-.02em" }}>
              {greeting}, {user?.name?.split(" ")[0] || t("role_teacher")} 👩‍🏫
            </h1>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <LangToggle />
            <button className="btn-sm" onClick={() => setSidebarOpen(v => !v)} style={{ padding: "8px 12px" }}>☰</button>
            <button className="btn-sm" onClick={fetchAll} style={{ padding: "8px 12px" }}>↻</button>

            {/* + New dropdown */}
            <div className="dropdown" onClick={e => e.stopPropagation()}>
              <button className="btn-primary" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}
                onClick={() => setShowDropdown(v => !v)}>
                + {t("btn_new")} ▾
              </button>
              {showDropdown && (
                <div className="dropdown-menu">
                  <div className="dropdown-item" onClick={() => { setShowDropdown(false); navigate("/teacher/courses/new"); }}>
                    <span style={{ fontSize: 16 }}>◫</span>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: 13 }}>{t("new_course")}</p>
                      <p style={{ fontSize: 11, color: "#9CA3AF" }}>Create a full course with modules</p>
                    </div>
                  </div>
                  <div className="dropdown-item" onClick={() => { setShowDropdown(false); navigate("/teacher/assignments/new"); }}>
                    <span style={{ fontSize: 16 }}>✎</span>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: 13 }}>New Assignment</p>
                      <p style={{ fontSize: 11, color: "#9CA3AF" }}>Add a task with rubric & AI feedback</p>
                    </div>
                  </div>
                  <div className="dropdown-item" onClick={() => { setShowDropdown(false); navigate("/teacher/peer"); }}>
                    <span style={{ fontSize: 16 }}>◈</span>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: 13 }}>Peer Session</p>
                      <p style={{ fontSize: 11, color: "#9CA3AF" }}>Launch AI-powered peer feedback</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {error && <div className="error-banner" style={{ marginBottom: 20 }}>⚠ {error} <button onClick={fetchAll} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#DC2626", fontWeight: 600, fontSize: 12 }}>Retry</button></div>}

        {/* ── PROFILE ── */}
        {activeNav === "profile" && (
          <div className="fade-up" style={{ maxWidth: 600 }}>
            <div className="card" style={{ padding: 24, marginBottom: 20 }}>
              <h2 className="section-title" style={{ marginBottom: 20 }}>My Profile</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24, padding: 16, background: "#F9FAFB", borderRadius: 12 }}>
                <div style={{ width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(135deg,#10B981,#0EA5E9)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 22, fontWeight: 700 }}>
                  {user?.name?.slice(0,2).toUpperCase() || "TC"}
                </div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 16, color: "#1A1D23" }}>{user?.name}</p>
                  <p style={{ fontSize: 13, color: "#9CA3AF" }}>{user?.email} · Teacher</p>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#4B5563", display: "block", marginBottom: 6 }}>Full Name</label>
                  <input className="input-field" value={editName} onChange={e => setEditName(e.target.value)} placeholder="Your full name"/>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#4B5563", display: "block", marginBottom: 6 }}>Email</label>
                  <input className="input-field" value={user?.email || ""} disabled style={{ opacity: .6, cursor: "not-allowed" }}/>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#4B5563", display: "block", marginBottom: 6 }}>Bio</label>
                  <input className="input-field" value={editBio} onChange={e => setEditBio(e.target.value)} placeholder="Tell students about yourself..."/>
                </div>
              </div>
              {profileMsg && (
                <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: profileMsg.startsWith("✓") ? "#D1FAE5" : "#FEE2E2", color: profileMsg.startsWith("✓") ? "#065F46" : "#DC2626", fontSize: 13 }}>
                  {profileMsg}
                </div>
              )}
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button className="btn-primary" style={{ background: "#10B981" }} onClick={saveProfile} disabled={savingProfile}>
                  {savingProfile ? "Saving…" : "Save Changes"}
                </button>
                <button className="btn-sm" style={{ color: "#EF4444", borderColor: "#FECACA" }} onClick={logout}>Sign Out</button>
              </div>
            </div>
          </div>
        )}

        {activeNav === "history" && (
          <div className="fade-up">
            <div className="card" style={{ padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span className="section-title">Historique Session</span>
                <span style={{ fontSize: 12, color: "#9CA3AF" }}>{sessionHistory.length} session(s)</span>
              </div>
              {sessionHistory.length === 0 ? (
                <p style={{ fontSize: 13, color: "#9CA3AF", padding: "12px 4px" }}>Aucune session historique disponible.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {sessionHistory.map((h) => (
                    <div key={h.sessionId} style={{ border: "1px solid #EAECF0", borderRadius: 10, padding: 12, background: "#fff" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "#1A1D23" }}>{h.currentSectionKey || "Session"}</div>
                        <div style={{ fontSize: 11, color: "#9CA3AF" }}>{fmt(h.createdAt)}</div>
                      </div>
                      <div style={{ fontSize: 12, color: "#4B5563", marginBottom: 8, lineHeight: 1.5 }}>{h.question}</div>
                      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11, color: "#6B7280" }}>
                        <span>Code: <strong>{h.code}</strong></span>
                        <span>Submissions: <strong>{h.interactions?.submissions ?? 0}</strong></span>
                        <span>Participants: <strong>{h.interactions?.participants ?? 0}</strong></span>
                        <span>Peer reviews: <strong>{h.interactions?.peerReviews ?? 0}</strong></span>
                        <span>AI moyenne: <strong>{h.interactions?.avgAiScore ?? "—"}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── MAIN DASHBOARD ── */}
        {activeNav !== "profile" && activeNav !== "history" && (
          <>
            {/* Stats */}
            <div style={{ display: "flex", gap: 14, marginBottom: 28 }} className="fade-up">
              {statCards.map((s, i) => (
                <div className="stat-card" key={i} style={{ position: "relative", overflow: "hidden" }}>
                  {s.urgent && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "#EF4444", borderRadius: "14px 14px 0 0" }}/>}
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 24 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

                {/* Submissions table */}
                <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                  <div style={{ padding: "16px 20px", borderBottom: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                    <span className="section-title">Submissions</span>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {[["all","All"],["pending","Pending"],["ai_reviewed","AI Reviewed"],["graded","Graded"]].map(([v,l]) => (
                        <button key={v} className={`tab ${activeTab===v?"active":""}`} onClick={() => setActiveTab(v)} style={{ fontSize: 11, padding: "5px 11px" }}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <div className="sub-row" style={{ background: "#FAFAFA", fontWeight: 600, color: "#9CA3AF", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #EAECF0", cursor: "default" }}>
                    <span/><span>Student</span><span>Assignment</span><span>Submitted</span><span>Status</span><span></span>
                  </div>
                  {loading ? [0,1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 44, margin: "4px 16px", borderRadius: 8 }}/>) :
                   filtered.length === 0 ? <p style={{ padding: 24, textAlign: "center", fontSize: 13, color: "#9CA3AF" }}>No submissions yet.</p> :
                   filtered.map(s => {
                    const sc = statusCfg[s.status] || statusCfg.pending;
                    const initials = (s.student?.name || "?").split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase();
                    return (
                      <div key={s._id} className="sub-row" onClick={() => setSelected(selected?._id === s._id ? null : s)} style={{ background: selected?._id === s._id ? "#F5F3FF" : undefined }}>
                        <div className="avatar" style={{ background: avColor(s.student?.name) }}>{initials}</div>
                        <span style={{ fontWeight: 500, color: "#1A1D23", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.student?.name || "Student"}</span>
                        <span style={{ color: "#4B5563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.assignment?.title || "Assignment"}</span>
                        <span style={{ color: "#9CA3AF" }}>{fmt(s.submittedAt)}</span>
                        <span className="badge" style={{ background: sc.bg, color: sc.color }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: sc.dot }}/>{sc.label}</span>
                        <button className="btn-sm" onClick={e => { e.stopPropagation(); navigate(`/teacher/submissions/${s._id}`); }}>
                          {s.status === "pending" ? "Grade" : "View"}
                        </button>
                      </div>
                    );
                  })}

                  {/* Expanded panel */}
                  {selected && (
                    <div style={{ margin: "0 16px 16px", background: "#F5F3FF", border: "1px solid #C7D2FB", borderRadius: 12, padding: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                        <div>
                          <p style={{ fontWeight: 700, fontSize: 14, color: "#1A1D23" }}>{selected.assignment?.title || "Assignment"}</p>
                          <p style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>by {selected.student?.name} · {fmt(selected.submittedAt)}</p>
                        </div>
                        {selected.score != null && (
                          <div style={{ background: "#fff", border: "1px solid #C7D2FB", borderRadius: 10, padding: "8px 16px", textAlign: "center" }}>
                            <p style={{ fontSize: 22, fontWeight: 700, color: "#4F46E5", fontFamily: "'Syne',sans-serif" }}>{selected.score}</p>
                            <p style={{ fontSize: 10, color: "#9CA3AF" }}>/100</p>
                          </div>
                        )}
                      </div>
                      {selected.content && (
                        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#4B5563", lineHeight: 1.6, maxHeight: 100, overflowY: "auto", marginBottom: 12, whiteSpace: "pre-wrap" }}>{selected.content}</div>
                      )}
                      {grading?.id === selected._id ? (
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <input type="number" min={0} max={100} placeholder="Score /100" value={grading.score}
                            onChange={e => setGrading(g => ({ ...g, score: e.target.value }))}
                            style={{ width: 100, padding: "6px 10px", border: "1px solid #C7D2FB", borderRadius: 7, fontSize: 13, fontFamily: "inherit", outline: "none" }}/>
                          <input type="text" placeholder="Comment (optional)" value={grading.note}
                            onChange={e => setGrading(g => ({ ...g, note: e.target.value }))}
                            style={{ flex: 1, padding: "6px 10px", border: "1px solid #C7D2FB", borderRadius: 7, fontSize: 13, fontFamily: "inherit", outline: "none" }}/>
                          <button className="btn-primary" style={{ fontSize: 12 }} onClick={() => handleGrade(selected._id, Number(grading.score), grading.note)}>Save</button>
                          <button className="btn-sm" onClick={() => setGrading(null)}>Cancel</button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button className="btn-ai" style={{ flex: 1 }} onClick={() => handleGenerateAI(selected._id)} disabled={batchBusy}>
                            {batchBusy ? "Processing…" : "◈ Generate AI Feedback"}
                          </button>
                          <button className="btn-primary" style={{ flex: 1 }} onClick={() => setGrading({ id: selected._id, score: "", note: "" })}>✎ Grade Manually</button>
                          <button className="btn-sm" onClick={() => navigate(`/teacher/submissions/${selected._id}`)}>Full View</button>
                        </div>
                      )}
                      {batchMsg && <p style={{ fontSize: 12, color: batchMsg.startsWith("✓") ? "#10B981" : "#DC2626", marginTop: 8 }}>{batchMsg}</p>}
                    </div>
                  )}
                </div>

                {/* My Courses — only this teacher's */}
                <section>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <span className="section-title">My Courses ({courses.length})</span>
                    <button className="btn-primary" style={{ fontSize: 12, padding: "6px 14px" }} onClick={() => navigate("/teacher/courses/new")}>+ New Course</button>
                  </div>
                  {loading ? [0,1].map(i => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 10, marginBottom: 8 }}/>) :
                   courses.length === 0 ? (
                    <div className="card" style={{ padding: 24, textAlign: "center" }}>
                      <p style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 12 }}>You haven't created any courses yet.</p>
                      <button className="btn-primary" onClick={() => navigate("/teacher/courses/new")}>Create your first course</button>
                    </div>
                   ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {courses.map((c, i) => {
                        const color = colors[i % colors.length];
                        const thumb = c.title.split(" ").slice(0,2).map(w => w[0]).join("").toUpperCase();
                        return (
                          <div className="course-row" key={c._id}>
                            <div style={{ width: 42, height: 42, borderRadius: 10, background: color+"18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color, flexShrink: 0 }}>{thumb}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                <p style={{ fontWeight: 600, fontSize: 13, color: "#1A1D23", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</p>
                                <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 5, background: c.published ? "#D1FAE5" : "#F3F4F6", color: c.published ? "#065F46" : "#6B7280", flexShrink: 0 }}>
                                  {c.published ? "Published" : "Draft"}
                                </span>
                              </div>
                              <div style={{ display: "flex", gap: 14, fontSize: 11, color: "#9CA3AF" }}>
                                <span>⊕ {c.enrollments || 0} students</span>
                                <span>◫ {c.modules?.length || 0} modules</span>
                                {c.rating > 0 && <span>★ {c.rating}</span>}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                              <button className="btn-sm" onClick={e => { e.stopPropagation(); navigate(`/teacher/courses/${c._id}`); }}>Ressources</button>
                              <button className="btn-sm" onClick={e => { e.stopPropagation(); navigate(`/teacher/assignments/new/${c._id}`); }}>+ Devoir</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                   )}
                </section>
              </div>

              {/* Right column */}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div className="card" style={{ padding: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <span className="section-title" style={{ fontSize: 14 }}>Submissions / Week</span>
                    <span style={{ fontSize: 11, color: "#9CA3AF" }}>Last 7 days</span>
                  </div>
                  <Spark data={[12,19,8,24,17,21,9]} color="#6C63FF" height={60}/>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                    {"MTWTFSS".split("").map((d, i) => <span key={i} style={{ flex: 1, textAlign: "center", fontSize: 9, color: "#9CA3AF" }}>{d}</span>)}
                  </div>
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between" }}>
                    <div><p style={{ fontSize: 18, fontWeight: 700, color: "#1A1D23", fontFamily: "'Syne',sans-serif" }}>{submissions.length}</p><p style={{ fontSize: 11, color: "#9CA3AF" }}>total submissions</p></div>
                    <div style={{ textAlign: "right" }}><p style={{ fontSize: 13, fontWeight: 600, color: "#10B981" }}>+18%</p><p style={{ fontSize: 11, color: "#9CA3AF" }}>vs last week</p></div>
                  </div>
                </div>

                {courses.filter(c => c.published).length > 0 && (
                  <div className="card" style={{ padding: 18 }}>
                    <span className="section-title" style={{ fontSize: 14, display: "block", marginBottom: 14 }}>Completion Rates</span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {courses.filter(c => c.published).slice(0,4).map((c, i) => {
                        const pct = 62, color = colors[i % colors.length];
                        return (
                          <div key={c._id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ position: "relative", width: 46, height: 46, flexShrink: 0 }}>
                              <Donut value={pct} size={46} stroke={5} color={color}/>
                              <span style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", fontSize: 10, fontWeight: 700, color: "#1A1D23" }}>{pct}%</span>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 12, fontWeight: 600, color: "#1A1D23", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</p>
                              <p style={{ fontSize: 11, color: "#9CA3AF" }}>{c.enrollments || 0} students</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div style={{ background: "#1A1D23", borderRadius: 14, border: "1px solid #2D3139", padding: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 26, height: 26, borderRadius: 7, background: "#6C63FF22", border: "1px solid #6C63FF44", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#A5A0FF" }}>◈</div>
                    <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: "#fff" }}>AI Grading Assistant</span>
                  </div>
                  <p style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.6, marginBottom: 12 }}>
                    {pending} pending submission{pending !== 1 ? "s" : ""} waiting for review.
                  </p>
                  <button className="btn-primary" style={{ width: "100%", background: "#6C63FF", padding: "10px 16px", fontSize: 12 }}
                    onClick={() => navigate("/teacher/peer")}>
                    ◈ Launch Peer Session
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}