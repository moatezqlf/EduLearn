import { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { SPECIALITES } from "./session/sectionConfig";

const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Syne:wght@600;700;800&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  .auth-root { min-height: 100vh; display: grid; grid-template-columns: 1fr 1fr; font-family: 'DM Sans', sans-serif; }
  @media (max-width: 768px) { .auth-root { grid-template-columns: 1fr; } .auth-panel { display: none !important; } }
  .auth-panel { background: #13151A; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px; position: relative; overflow: hidden; }
  .auth-form-side { background: #F7F8FC; display: flex; align-items: center; justify-content: center; padding: 48px 40px; }
  .auth-card { width: 100%; max-width: 420px; }
  .input-group { display: flex; flex-direction: column; gap: 5px; }
  .input-label { font-size: 12px; font-weight: 600; color: #4B5563; letter-spacing: 0.02em; }
  .input-field { background: #fff; border: 1.5px solid #E5E7EB; border-radius: 10px; padding: 11px 14px; font-size: 14px; color: #1A1D23; font-family: inherit; outline: none; transition: border-color 0.15s; width: 100%; }
  .input-field:focus { border-color: #6C63FF; box-shadow: 0 0 0 3px #6C63FF18; }
  .input-field::placeholder { color: #C4C9D4; }
  .btn-submit { width: 100%; padding: 13px; border-radius: 10px; border: none; background: #6C63FF; color: #fff; font-size: 14px; font-weight: 600; font-family: inherit; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; justify-content: center; gap: 8px; }
  .btn-submit:hover:not(:disabled) { background: #5a52e0; }
  .btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }
  .tab-toggle { display: flex; background: #EAECF0; border-radius: 10px; padding: 3px; margin-bottom: 28px; }
  .tab-btn { flex: 1; padding: 8px; border: none; border-radius: 8px; font-size: 13px; font-weight: 500; font-family: inherit; cursor: pointer; transition: all 0.15s; background: transparent; color: #6B7280; }
  .tab-btn.active { background: #fff; color: #1A1D23; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
  .role-picker { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .role-btn { padding: 10px 8px; border-radius: 9px; border: 1.5px solid #E5E7EB; background: #fff; font-size: 12px; font-weight: 500; font-family: inherit; cursor: pointer; transition: all 0.15s; text-align: center; color: #4B5563; }
  .role-btn.active { border-color: #6C63FF; background: #EEF2FF; color: #4F46E5; font-weight: 600; }
  .divider { display: flex; align-items: center; gap: 12px; color: #9CA3AF; font-size: 12px; margin: 4px 0; }
  .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: #E5E7EB; }
  .error-banner { background: #FEF2F2; border: 1px solid #FECACA; border-radius: 9px; padding: 10px 14px; font-size: 13px; color: #DC2626; display: flex; align-items: center; gap: 8px; }
  @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
  .fade-up { animation: fadeUp 0.4s ease forwards; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { animation: spin 0.8s linear infinite; }
`;

const roleOptions = [
  { value: "student", label: "Apprenant", icon: "🎓" },
  { value: "teacher", label: "Enseignant", icon: "👩‍🏫" },
];

const ROLE_REDIRECT = { student: "/student", teacher: "/teacher", admin: "/admin" };

const goTo = (role) => { window.location.href = ROLE_REDIRECT[role] || "/"; };

export default function LoginPage() {
  const { login, register, user } = useAuth();

  const [mode, setMode] = useState("login");
  const [role, setRole] = useState("student");
  const [form, setForm] = useState({ name: "", email: "", password: "", specialite: "" });
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState("");
  const [pendingMsg, setPendingMsg] = useState("");

  // Already logged in → go to dashboard
  useEffect(() => {
    if (user) goTo(user.role);
  }, [user]);

  useEffect(() => { setErr(""); setPendingMsg(""); }, [mode]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      let u;
      if (mode === "login") {
        u = await login(form.email, form.password);
        goTo(u.role);
      } else {
        if (!form.name.trim()) { setErr("Le nom est requis"); setBusy(false); return; }
        if (role === "student" && !form.specialite) { setErr("La spécialité / domaine est requis"); setBusy(false); return; }
        const res = await register({ name: form.name, email: form.email, password: form.password, role, specialite: form.specialite });
        if (res?.pending) {
          setPendingMsg(res.message || "Compte en attente de validation par l'administrateur.");
          setMode("login");
          return;
        }
        goTo(res.role);
      }
    } catch (e) {
      if (e.message?.includes("attente") || e.message?.includes("pending"))
        setPendingMsg(e.message);
      else
        setErr(e.message || "Une erreur est survenue");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <style>{css}</style>
      <div className="auth-root">

        {/* Left panel */}
        <div className="auth-panel">
          <div style={{ position:"absolute", width:300, height:300, background:"#6C63FF", borderRadius:"50%", filter:"blur(60px)", opacity:.15, top:-80, left:-60 }}/>
          <div style={{ position:"absolute", width:200, height:200, background:"#0EA5E9", borderRadius:"50%", filter:"blur(60px)", opacity:.15, bottom:60, right:-40 }}/>
          <div style={{ position:"relative", zIndex:1, textAlign:"center", maxWidth:360 }}>
            <div style={{ width:56, height:56, background:"#6C63FF", borderRadius:16, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 24px", fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:22, color:"#fff" }}>E</div>
            <h2 style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:32, color:"#fff", lineHeight:1.15, marginBottom:14 }}>
              Learn.<br/>Teach.<br/>Grow.
            </h2>
            <p style={{ fontSize:14, color:"#6B7280", lineHeight:1.7, marginBottom:32 }}>
              EduLearn brings AI-powered personalized feedback to every student submission.
            </p>
            {[
              { icon:"◈", text:"AI feedback on every submission" },
              { icon:"⊕", text:"Peer review system" },
              // { icon:"◎", text:"Real-time progress analytics" },
            ].map(f => (
              <div key={f.text} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12, textAlign:"left" }}>
                <div style={{ width:30, height:30, borderRadius:8, background:"#6C63FF22", border:"1px solid #6C63FF44", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:"#A5A0FF", flexShrink:0 }}>{f.icon}</div>
                <span style={{ fontSize:13, color:"#9CA3AF" }}>{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right form */}
        <div className="auth-form-side">
          <div className="auth-card fade-up">
            <div style={{ marginBottom:28 }}>
              <h1 style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:24, color:"#1A1D23", marginBottom:6 }}>
                {mode === "login" ? "Welcome back" : "Create account"}
              </h1>
              <p style={{ fontSize:13, color:"#9CA3AF" }}>
                {mode === "login" ? "Sign in to your EduLearn account" : "Join thousands of learners today"}
              </p>
            </div>

            <div className="tab-toggle">
              <button className={`tab-btn ${mode==="login"?"active":""}`} onClick={() => setMode("login")}>Sign In</button>
              <button className={`tab-btn ${mode==="register"?"active":""}`} onClick={() => setMode("register")}>Register</button>
            </div>

            <form onSubmit={submit} style={{ display:"flex", flexDirection:"column", gap:16 }}>

              {mode === "register" && (
                <div className="input-group">
                  <span className="input-label">I am a</span>
                  <div className="role-picker">
                    {roleOptions.map(r => (
                      <button key={r.value} type="button" className={`role-btn ${role===r.value?"active":""}`} onClick={() => setRole(r.value)}>
                        <div style={{ fontSize:18, marginBottom:4 }}>{r.icon}</div>
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {mode === "register" && (
                <div className="input-group">
                  <label className="input-label">Full Name</label>
                  <input className="input-field" placeholder="Your full name" value={form.name} onChange={set("name")} required/>
                </div>
              )}

              {mode === "register" && role === "student" && (
                <div className="input-group">
                  <label className="input-label">Spécialité / Domaine</label>
                  <select
                    className="input-field"
                    value={form.specialite}
                    onChange={set("specialite")}
                    required
                    style={{ cursor: "pointer" }}
                  >
                    <option value="">Sélectionnez votre domaine…</option>
                    {SPECIALITES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="input-group">
                <label className="input-label">Email</label>
                <input className="input-field" type="email" placeholder="you@example.com" value={form.email} onChange={set("email")} required/>
              </div>

              <div className="input-group">
                <label className="input-label">Password</label>
                <input className="input-field" type="password" placeholder={mode==="register"?"Min. 6 characters":"••••••••"} value={form.password} onChange={set("password")} required minLength={6}/>
              </div>

              {pendingMsg && (
                <div style={{ background: "#EEF2FF", border: "1px solid #C7D2FE", borderRadius: 9, padding: "10px 14px", fontSize: 13, color: "#3730A3" }}>
                  ✓ {pendingMsg}
                </div>
              )}
              {err && <div className="error-banner"><span>⚠</span> {err}</div>}

              <button className="btn-submit" type="submit" disabled={busy}>
                {busy
                  ? <><div style={{ width:16, height:16, border:"2px solid #ffffff44", borderTopColor:"#fff", borderRadius:"50%" }} className="spin"/> Processing…</>
                  : mode==="login" ? "Sign In →" : "Create Account →"
                }
              </button>

            </form>
          </div>
        </div>
      </div>
    </>
  );
}