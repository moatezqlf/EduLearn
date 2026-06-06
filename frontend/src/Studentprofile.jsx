import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import api from "./api";

const css = `
  @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  *{box-sizing:border-box;margin:0;padding:0}
  .fade-up{animation:fadeUp .35s ease forwards}
  .card{background:#fff;border-radius:14px;border:1px solid #EAECF0;padding:20px}
  .input-field{width:100%;background:#F9FAFB;border:1.5px solid #EAECF0;border-radius:10px;padding:11px 14px;font-size:14px;color:#1A1D23;font-family:inherit;outline:none;transition:border-color .15s}
  .input-field:focus{border-color:#6C63FF;background:#fff}
  .btn-primary{background:#6C63FF;color:#fff;border:none;padding:11px 22px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s}
  .btn-primary:hover{background:#5a52e0}
  .btn-ghost{background:transparent;color:#6B7280;border:1px solid #EAECF0;padding:10px 20px;border-radius:10px;font-size:13px;cursor:pointer;font-family:inherit}
  .btn-ghost:hover{background:#F9FAFB}
  .btn-danger{background:#FEF2F2;color:#DC2626;border:1px solid #FECACA;padding:10px 20px;border-radius:10px;font-size:13px;cursor:pointer;font-family:inherit}
  .label{font-size:12px;font-weight:600;color:#4B5563;letter-spacing:.02em;margin-bottom:6px;display:block}
  .stat-box{background:#F9FAFB;border:1px solid #EAECF0;border-radius:10px;padding:16px;text-align:center}
  .success-banner{background:#D1FAE5;border:1px solid #6EE7B7;border-radius:10px;padding:12px 16px;font-size:13px;color:#065F46}
  .error-banner{background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:12px 16px;font-size:13px;color:#DC2626}
  .progress-bar{height:6px;background:#F3F4F6;border-radius:99px;overflow:hidden}
  .progress-fill{height:100%;border-radius:99px;background:#6C63FF;transition:width .6s ease}
`;

export default function StudentProfile() {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();

  const [name,    setName]    = useState(user?.name    || "");
  const [bio,     setBio]     = useState(user?.bio     || "");
  const [stats,   setStats]   = useState(null);
  const [courses, setCourses] = useState([]);
  const [saving,  setSaving]  = useState(false);
  const [success, setSuccess] = useState("");
  const [error,   setError]   = useState("");

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

  useEffect(() => {
    Promise.all([
      api.analytics.student(),
      api.courses.getEnrolled(),
    ]).then(([sRes, cRes]) => {
      setStats(sRes);
      setCourses(cRes.courses || []);
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true); setError("");
    try {
      await api.users.update(user._id, { name, bio });
      updateUser({ name, bio });
      setSuccess("Profile updated!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ minHeight:"100vh", background:"#F7F8FC", fontFamily:"'DM Sans','Segoe UI',sans-serif", padding:"32px" }}>
      <div style={{ maxWidth:700, margin:"0 auto", display:"flex", flexDirection:"column", gap:20 }}>

        <div className="fade-up" style={{ display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={() => navigate("/student")} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:"#9CA3AF" }}>←</button>
          <h1 style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:22, color:"#1A1D23" }}>My Profile</h1>
        </div>

        {error   && <div className="error-banner">⚠ {error}</div>}
        {success && <div className="success-banner">✓ {success}</div>}

        {/* Avatar + stats */}
        <div className="card fade-up" style={{ display:"flex", gap:24, alignItems:"flex-start" }}>
          <div style={{ width:72, height:72, borderRadius:"50%", background:"linear-gradient(135deg,#6C63FF,#0EA5E9)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:24, fontWeight:700, flexShrink:0 }}>
            {(user?.name||"?").slice(0,2).toUpperCase()}
          </div>
          <div style={{ flex:1 }}>
            <p style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:18, color:"#1A1D23" }}>{user?.name}</p>
            <p style={{ fontSize:13, color:"#9CA3AF", marginBottom:12 }}>{user?.email} · Student</p>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
              {[
                { label:"Courses",    value: stats?.enrolled    || 0 },
                { label:"Submitted",  value: stats?.submissions || 0 },
                { label:"Avg Score",  value: stats?.avgScore != null ? stats.avgScore+"%" : "—" },
                { label:"Feedbacks",  value: stats?.feedbacks   || 0 },
              ].map(s => (
                <div className="stat-box" key={s.label}>
                  <p style={{ fontSize:20, fontWeight:700, color:"#6C63FF", fontFamily:"'Syne',sans-serif" }}>{s.value}</p>
                  <p style={{ fontSize:11, color:"#9CA3AF", marginTop:3 }}>{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Edit profile */}
        <div className="card fade-up">
          <h2 style={{ fontSize:15, fontWeight:700, color:"#1A1D23", marginBottom:16 }}>Edit Profile</h2>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div>
              <label className="label">Full Name</label>
              <input className="input-field" value={name} onChange={e => setName(e.target.value)}/>
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input-field" value={user?.email || ""} disabled style={{ opacity:.6, cursor:"not-allowed" }}/>
            </div>
            <div>
              <label className="label">Bio</label>
              <input className="input-field" placeholder="Tell us about yourself..." value={bio} onChange={e => setBio(e.target.value)}/>
            </div>
          </div>
          <div style={{ display:"flex", gap:10, marginTop:16 }}>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</button>
          </div>
        </div>

        {/* Enrolled courses progress */}
        {courses.length > 0 && (
          <div className="card fade-up">
            <h2 style={{ fontSize:15, fontWeight:700, color:"#1A1D23", marginBottom:16 }}>Course Progress</h2>
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              {courses.map((c, i) => {
                const colors = ["#6C63FF","#0EA5E9","#10B981","#F59E0B"];
                const color  = colors[i % colors.length];
                return (
                  <div key={c._id}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                      <span style={{ fontSize:13, fontWeight:500, color:"#1A1D23" }}>{c.title}</span>
                      <span style={{ fontSize:12, fontWeight:700, color }}>{c.progress || 0}%</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width:(c.progress||0)+"%", background:color }}/>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Danger zone */}
        <div className="card fade-up" style={{ border:"1px solid #FECACA" }}>
          <h2 style={{ fontSize:15, fontWeight:700, color:"#DC2626", marginBottom:8 }}>Account</h2>
          <p style={{ fontSize:13, color:"#9CA3AF", marginBottom:14 }}>Sign out from your account on this device.</p>
          <button className="btn-danger" onClick={logout}>Sign Out</button>
        </div>
      </div>
    </div>
  );
}