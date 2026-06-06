import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import api from "./api";

const css = `
  @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  *{box-sizing:border-box;margin:0;padding:0}
  ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:#D1D5DB;border-radius:99px}
  .fade-up{animation:fadeUp .35s ease forwards}
  .course-card{background:#fff;border-radius:14px;border:1px solid #EAECF0;padding:20px;cursor:pointer;transition:all .2s;position:relative;overflow:hidden}
  .course-card:hover{transform:translateY(-3px);box-shadow:0 8px 24px rgba(0,0,0,.08);border-color:#D1D5DB}
  .btn-primary{background:#6C63FF;color:#fff;border:none;padding:10px 20px;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s}
  .btn-primary:hover{background:#5a52e0}
  .btn-ghost{background:transparent;color:#6B7280;border:1px solid #EAECF0;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;transition:all .15s}
  .btn-ghost:hover{background:#F9FAFB;color:#1A1D23}
  .search-input{width:100%;background:#fff;border:1.5px solid #EAECF0;border-radius:10px;padding:11px 14px 11px 38px;font-size:14px;color:#1A1D23;font-family:inherit;outline:none;transition:border-color .15s}
  .search-input:focus{border-color:#6C63FF}
  .filter-btn{padding:7px 14px;border-radius:8px;font-size:12px;font-weight:500;cursor:pointer;border:1px solid #EAECF0;background:#fff;color:#6B7280;font-family:inherit;transition:all .15s}
  .filter-btn.active{background:#6C63FF;color:#fff;border-color:#6C63FF}
  .filter-btn:hover:not(.active){background:#F3F4F6}
  .skeleton{background:linear-gradient(90deg,#F3F4F6 25%,#E9EAEC 50%,#F3F4F6 75%);background-size:200% 100%;animation:shimmer 1.2s infinite;border-radius:8px}
  @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
  .tag{display:inline-block;padding:3px 9px;border-radius:6px;font-size:11px;font-weight:500;background:#F3F4F6;color:#4B5563}
  .enrolled-badge{background:#D1FAE5;color:#065F46;padding:3px 9px;border-radius:6px;font-size:11px;font-weight:600}
`;

const courseColor = (i) => ["#6C63FF","#0EA5E9","#10B981","#F59E0B","#EC4899","#14B8A6"][i % 6];
const courseThumb = (title) => title.split(" ").slice(0,2).map(w=>w[0]).join("").toUpperCase();

export default function CourseCatalog() {
  useAuth();
  const navigate  = useNavigate();

  const [courses,   setCourses]   = useState([]);
  const [enrolled,  setEnrolled]  = useState(new Set());
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [category,  setCategory]  = useState("All");
  const [level,     setLevel]     = useState("All");
  const [enrolling, setEnrolling] = useState(null);
  const [error,     setError]     = useState("");

  const categories = ["All", "AI / ML", "Frontend", "Backend", "CS Fundamentals", "Database", "DevOps"];
  const levels     = ["All", "beginner", "intermediate", "advanced"];

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

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { published: true };
      if (category !== "All") params.category = category;
      if (level !== "All")    params.level     = level;
      if (search)             params.search    = search;
      const [cRes, eRes] = await Promise.all([
        api.courses.getAll(params),
        api.courses.getEnrolled(),
      ]);
      setCourses(cRes.courses || []);
      setEnrolled(new Set((eRes.courses || []).map(c => c._id)));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [category, level, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleEnroll = async (courseId) => {
    setEnrolling(courseId); setError("");
    try {
      await api.courses.enroll(courseId);
      setEnrolled(prev => new Set([...prev, courseId]));
    } catch (e) { setError(e.message); }
    finally { setEnrolling(null); }
  };

  return (
    <div style={{ minHeight:"100vh", background:"#F7F8FC", fontFamily:"'DM Sans','Segoe UI',sans-serif", padding:"32px" }}>
      <div style={{ maxWidth:1000, margin:"0 auto" }}>

        {/* Header */}
        <div className="fade-up" style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24 }}>
          <button onClick={() => navigate("/student")} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:"#9CA3AF", padding:0 }}>←</button>
          <div>
            <h1 style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:24, color:"#1A1D23", letterSpacing:"-.02em" }}>Course Catalog</h1>
            <p style={{ fontSize:13, color:"#9CA3AF", marginTop:3 }}>{courses.length} courses available</p>
          </div>
        </div>

        {/* Search */}
        <div className="fade-up" style={{ position:"relative", marginBottom:16 }}>
          <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:16, color:"#9CA3AF" }}>⌕</span>
          <input className="search-input" placeholder="Search courses..." value={search} onChange={e => setSearch(e.target.value)}/>
        </div>

        {/* Filters */}
        <div className="fade-up" style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:24 }}>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            {categories.map(c => <button key={c} className={`filter-btn ${category===c?"active":""}`} onClick={() => setCategory(c)}>{c}</button>)}
          </div>
          <div style={{ width:1, background:"#EAECF0" }}/>
          <div style={{ display:"flex", gap:6 }}>
            {levels.map(l => <button key={l} className={`filter-btn ${level===l?"active":""}`} onClick={() => setLevel(l)}>{l==="All"?"All Levels":l.charAt(0).toUpperCase()+l.slice(1)}</button>)}
          </div>
        </div>

        {error && <div style={{ background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:10, padding:"12px 16px", fontSize:13, color:"#DC2626", marginBottom:16 }}>⚠ {error}</div>}

        {/* Grid */}
        {loading ? (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16 }}>
            {[0,1,2,3,4,5].map(i => (
              <div key={i} style={{ background:"#fff", borderRadius:14, padding:20, border:"1px solid #EAECF0" }}>
                <div className="skeleton" style={{ height:44, width:44, borderRadius:10, marginBottom:12 }}/>
                <div className="skeleton" style={{ height:16, width:"70%", marginBottom:8 }}/>
                <div className="skeleton" style={{ height:12, width:"45%", marginBottom:16 }}/>
                <div className="skeleton" style={{ height:36, borderRadius:9 }}/>
              </div>
            ))}
          </div>
        ) : courses.length === 0 ? (
          <div style={{ textAlign:"center", padding:64, background:"#fff", borderRadius:14, border:"1px solid #EAECF0" }}>
            <p style={{ fontSize:48, marginBottom:12 }}>🔍</p>
            <p style={{ fontWeight:700, fontSize:16, color:"#1A1D23", marginBottom:6 }}>No courses found</p>
            <p style={{ fontSize:13, color:"#9CA3AF" }}>Try different filters or search terms</p>
          </div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:16 }}>
            {courses.map((c, i) => {
              const color   = courseColor(i);
              const isEnrolled = enrolled.has(c._id);
              return (
                <div className="course-card fade-up" key={c._id}>
                  <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:color, borderRadius:"14px 14px 0 0" }}/>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12, marginTop:4 }}>
                    <div style={{ width:44, height:44, borderRadius:10, background:color+"18", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color, letterSpacing:"0.05em" }}>{courseThumb(c.title)}</div>
                    {isEnrolled && <span className="enrolled-badge">✓ Enrolled</span>}
                  </div>
                  <p style={{ fontWeight:700, fontSize:14, color:"#1A1D23", lineHeight:1.4, marginBottom:4 }}>{c.title}</p>
                  <p style={{ fontSize:12, color:"#9CA3AF", marginBottom:8 }}>{c.teacher?.name || "Instructor"}</p>
                  {c.description && <p style={{ fontSize:12, color:"#6B7280", lineHeight:1.5, marginBottom:12, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>{c.description}</p>}
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
                    <span className="tag">{c.category}</span>
                    <span className="tag" style={{ background:"#EEF2FF", color:"#4F46E5" }}>{c.level}</span>
                    <span className="tag">◫ {c.modules?.length || 0} modules</span>
                    {c.rating > 0 && <span className="tag">★ {c.rating}</span>}
                  </div>
                  {isEnrolled ? (
                    <div style={{ display:"flex", gap:8 }}>
                      <button className="btn-primary" style={{ flex:1 }} onClick={() => navigate(`/student/courses/${c._id}`)}>Ressources →</button>
                      <button className="btn-ghost" style={{ flex:1 }} onClick={async () => {
                        if (!confirm("Se désinscrire ?")) return;
                        try { await api.courses.unenroll(c._id); setEnrolled(p => { const n = new Set(p); n.delete(c._id); return n; }); }
                        catch (e) { setError(e.message); }
                      }}>Quitter</button>
                    </div>
                  ) : (
                    <button className="btn-primary" style={{ width:"100%", justifyContent:"center" }}
                      onClick={() => handleEnroll(c._id)} disabled={enrolling === c._id}>
                      {enrolling === c._id ? "Enrolling…" : "Enroll for Free"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
