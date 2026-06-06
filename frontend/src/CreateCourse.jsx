import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import api from "./api";

const css = `
  @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  *{box-sizing:border-box;margin:0;padding:0}
  ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:#D1D5DB;border-radius:99px}
  .fade-up{animation:fadeUp .35s ease forwards}
  .card{background:#fff;border-radius:14px;border:1px solid #EAECF0;padding:24px}
  .input-field{width:100%;background:#F9FAFB;border:1.5px solid #EAECF0;border-radius:10px;padding:11px 14px;font-size:14px;color:#1A1D23;font-family:inherit;outline:none;transition:border-color .15s}
  .input-field:focus{border-color:#6C63FF;background:#fff}
  .textarea-field{width:100%;background:#F9FAFB;border:1.5px solid #EAECF0;border-radius:10px;padding:12px 14px;font-size:13px;color:#1A1D23;font-family:inherit;outline:none;transition:border-color .15s;resize:vertical;min-height:100px;line-height:1.7}
  .textarea-field:focus{border-color:#6C63FF;background:#fff}
  .select-field{width:100%;background:#F9FAFB;border:1.5px solid #EAECF0;border-radius:10px;padding:11px 14px;font-size:14px;color:#1A1D23;font-family:inherit;outline:none;cursor:pointer}
  .select-field:focus{border-color:#6C63FF}
  .btn-primary{background:#6C63FF;color:#fff;border:none;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s;display:flex;align-items:center;gap:8px}
  .btn-primary:hover:not(:disabled){background:#5a52e0}
  .btn-primary:disabled{opacity:.5;cursor:not-allowed}
  .btn-ghost{background:transparent;color:#6B7280;border:1px solid #EAECF0;padding:10px 20px;border-radius:10px;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;transition:all .15s}
  .btn-ghost:hover{background:#F9FAFB;color:#1A1D23}
  .btn-danger{background:#FEF2F2;color:#DC2626;border:1px solid #FECACA;padding:6px 12px;border-radius:7px;font-size:12px;cursor:pointer;font-family:inherit}
  .btn-add{background:#F5F3FF;color:#4F46E5;border:1px solid #C7D2FB;padding:8px 16px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s}
  .btn-add:hover{background:#EEF2FF}
  .label{font-size:12px;font-weight:600;color:#4B5563;letter-spacing:.02em;margin-bottom:6px;display:block}
  .section-title{font-family:'Syne',sans-serif;font-size:18px;font-weight:700;color:#1A1D23;letter-spacing:-.02em}
  .module-row{display:flex;align-items:center;gap:10px;padding:12px 14px;background:#F9FAFB;border:1px solid #EAECF0;border-radius:10px}
  .error-banner{background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:12px 16px;font-size:13px;color:#DC2626;display:flex;align-items:center;gap:8px}
  .success-banner{background:#D1FAE5;border:1px solid #6EE7B7;border-radius:10px;padding:12px 16px;font-size:13px;color:#065F46;display:flex;align-items:center;gap:8px}
`;

const CATEGORIES = ["AI / ML", "Frontend", "Backend", "CS Fundamentals", "Database", "DevOps", "Mobile", "Design", "Other"];
const LEVELS     = ["beginner", "intermediate", "advanced"];

export default function CreateCourse() {
  useAuth();
  const navigate  = useNavigate();

  const [form, setForm] = useState({
    title: "", description: "", category: "AI / ML", level: "beginner",
    tags: "",
  });
  const [modules,   setModules]   = useState([{ title: "", duration: 30, order: 1 }]);
  const [submitting,setSubmitting]= useState(false);
  const [error,     setError]     = useState("");
  const [success,   setSuccess]   = useState("");

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

  const setField = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const addModule = () => setModules(m => [...m, { title: "", duration: 30, order: m.length + 1 }]);
  const removeModule = (i) => setModules(m => m.filter((_,idx) => idx !== i).map((mod,idx) => ({ ...mod, order: idx+1 })));
  const updateModule = (i, k, v) => setModules(m => m.map((mod,idx) => idx===i ? { ...mod, [k]: v } : mod));

  const handleSubmit = async (publish = false) => {
    if (!form.title.trim()) { setError("Course title is required."); return; }
    if (modules.some(m => !m.title.trim())) { setError("All modules need a title."); return; }
    setSubmitting(true); setError("");
    try {
      const payload = {
        ...form,
        tags: form.tags.split(",").map(t => t.trim()).filter(Boolean),
        modules: modules.map(m => ({ ...m, duration: Number(m.duration) })),
        published: publish,
      };
      const res = await api.courses.create(payload);
      if (publish && res.course?._id) {
        await api.courses.publish(res.course._id);
      }
      setSuccess(publish ? "Course published successfully!" : "Course saved as draft!");
      setTimeout(() => navigate("/teacher"), 1500);
    } catch (e) { setError(e.message); }
    finally { setSubmitting(false); }
  };

  return (
    <div style={{ minHeight:"100vh", background:"#F7F8FC", fontFamily:"'DM Sans','Segoe UI',sans-serif", padding:"32px" }}>
      <div style={{ maxWidth:760, margin:"0 auto", display:"flex", flexDirection:"column", gap:20 }}>

        {/* Header */}
        <div className="fade-up" style={{ display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={() => navigate("/teacher")} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:"#9CA3AF", padding:0 }}>←</button>
          <div>
            <h1 className="section-title">Create New Course</h1>
            <p style={{ fontSize:13, color:"#9CA3AF", marginTop:3 }}>Fill in the details and add your modules</p>
          </div>
        </div>

        {error   && <div className="error-banner">⚠ {error}</div>}
        {success && <div className="success-banner">✓ {success}</div>}

        {/* Basic info */}
        <div className="card fade-up">
          <h2 style={{ fontSize:15, fontWeight:700, color:"#1A1D23", marginBottom:18 }}>Course Information</h2>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div>
              <label className="label">Course Title *</label>
              <input className="input-field" placeholder="e.g. Machine Learning Fundamentals" value={form.title} onChange={setField("title")}/>
            </div>
            <div>
              <label className="label">Description</label>
              <textarea className="textarea-field" placeholder="What will students learn in this course?" value={form.description} onChange={setField("description")}/>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
              <div>
                <label className="label">Category</label>
                <select className="select-field" value={form.category} onChange={setField("category")}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Level</label>
                <select className="select-field" value={form.level} onChange={setField("level")}>
                  {LEVELS.map(l => <option key={l} value={l}>{l.charAt(0).toUpperCase()+l.slice(1)}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Tags <span style={{ color:"#9CA3AF", fontWeight:400 }}>(comma separated)</span></label>
              <input className="input-field" placeholder="python, neural networks, deep learning" value={form.tags} onChange={setField("tags")}/>
            </div>
          </div>
        </div>

        {/* Modules */}
        <div className="card fade-up">
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
            <h2 style={{ fontSize:15, fontWeight:700, color:"#1A1D23" }}>Modules <span style={{ color:"#9CA3AF", fontWeight:400, fontSize:13 }}>({modules.length})</span></h2>
            <button className="btn-add" onClick={addModule}>+ Add Module</button>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {modules.map((mod, i) => (
              <div key={i} className="module-row">
                <div style={{ width:28, height:28, borderRadius:"50%", background:"#6C63FF", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, flexShrink:0 }}>{i+1}</div>
                <input className="input-field" style={{ flex:1 }} placeholder={`Module ${i+1} title`} value={mod.title} onChange={e => updateModule(i,"title",e.target.value)}/>
                <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
                  <input type="number" className="input-field" style={{ width:70 }} placeholder="min" value={mod.duration} onChange={e => updateModule(i,"duration",e.target.value)} min={1}/>
                  <span style={{ fontSize:11, color:"#9CA3AF", whiteSpace:"nowrap" }}>min</span>
                </div>
                {modules.length > 1 && <button className="btn-danger" onClick={() => removeModule(i)}>✕</button>}
              </div>
            ))}
          </div>
          <p style={{ fontSize:11, color:"#9CA3AF", marginTop:10 }}>Total duration: {modules.reduce((s,m) => s + Number(m.duration||0), 0)} minutes</p>
        </div>

        {/* AI Feedback settings */}
        <div className="card fade-up" style={{ background:"#F5F3FF", border:"1px solid #C7D2FB" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:32, height:32, borderRadius:8, background:"#6C63FF", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:14 }}>◈</div>
            <div>
              <p style={{ fontWeight:700, fontSize:14, color:"#1A1D23" }}>AI Feedback enabled</p>
              <p style={{ fontSize:12, color:"#6B7280" }}>Students will receive Claude-powered feedback on their assignments</p>
            </div>
            <div style={{ marginLeft:"auto", width:36, height:20, background:"#6C63FF", borderRadius:10, position:"relative" }}>
              <div style={{ position:"absolute", top:2, right:2, width:16, height:16, background:"#fff", borderRadius:"50%" }}/>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display:"flex", gap:10 }}>
          <button className="btn-ghost" onClick={() => navigate("/teacher")}>Cancel</button>
          <button className="btn-ghost" onClick={() => handleSubmit(false)} disabled={submitting} style={{ flex:1, justifyContent:"center", display:"flex", alignItems:"center", gap:8 }}>
            {submitting ? "Saving…" : "💾 Save as Draft"}
          </button>
          <button className="btn-primary" onClick={() => handleSubmit(true)} disabled={submitting} style={{ flex:1, justifyContent:"center" }}>
            {submitting ? <><div style={{ width:16, height:16, border:"2px solid #ffffff44", borderTopColor:"#fff", borderRadius:"50%", animation:"spin .8s linear infinite" }}/> Publishing…</> : "🚀 Publish Course"}
          </button>
        </div>
      </div>
    </div>
  );
}
