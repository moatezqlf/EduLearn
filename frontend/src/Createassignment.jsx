import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "./api";

const css = `
  @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  *{box-sizing:border-box;margin:0;padding:0}
  .fade-up{animation:fadeUp .35s ease forwards}
  .card{background:#fff;border-radius:14px;border:1px solid #EAECF0;padding:24px}
  .input-field{width:100%;background:#F9FAFB;border:1.5px solid #EAECF0;border-radius:10px;padding:11px 14px;font-size:14px;color:#1A1D23;font-family:inherit;outline:none;transition:border-color .15s}
  .input-field:focus{border-color:#6C63FF;background:#fff}
  .textarea-field{width:100%;background:#F9FAFB;border:1.5px solid #EAECF0;border-radius:10px;padding:12px 14px;font-size:13px;color:#1A1D23;font-family:inherit;outline:none;resize:vertical;min-height:80px;line-height:1.7}
  .textarea-field:focus{border-color:#6C63FF;background:#fff}
  .label{font-size:12px;font-weight:600;color:#4B5563;letter-spacing:.02em;margin-bottom:6px;display:block}
  .btn-primary{background:#6C63FF;color:#fff;border:none;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s;display:flex;align-items:center;gap:8px}
  .btn-primary:hover:not(:disabled){background:#5a52e0}
  .btn-primary:disabled{opacity:.5;cursor:not-allowed}
  .btn-ghost{background:transparent;color:#6B7280;border:1px solid #EAECF0;padding:10px 20px;border-radius:10px;font-size:13px;cursor:pointer;font-family:inherit;transition:all .15s}
  .btn-ghost:hover{background:#F9FAFB;color:#1A1D23}
  .btn-add{background:#F5F3FF;color:#4F46E5;border:1px solid #C7D2FB;padding:8px 16px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit}
  .btn-danger{background:#FEF2F2;color:#DC2626;border:1px solid #FECACA;padding:6px 10px;border-radius:7px;font-size:11px;cursor:pointer;font-family:inherit}
  .rubric-row{display:grid;grid-template-columns:1fr 80px 80px 32px;gap:8px;align-items:center;padding:10px;background:#F9FAFB;border:1px solid #EAECF0;border-radius:10px}
  .error-banner{background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:12px 16px;font-size:13px;color:#DC2626}
  .success-banner{background:#D1FAE5;border:1px solid #6EE7B7;border-radius:10px;padding:12px 16px;font-size:13px;color:#065F46}
  .toggle-row{display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid #F3F4F6}
  .toggle{width:36px;height:20px;border-radius:10px;position:relative;cursor:pointer;transition:background .2s}
  .toggle-thumb{position:absolute;top:2px;width:16px;height:16px;background:#fff;border-radius:50%;transition:left .2s;box-shadow:0 1px 3px rgba(0,0,0,.2)}
`;

export default function CreateAssignment() {
  const navigate   = useNavigate();
  const { courseId } = useParams();

  const [courses,     setCourses]     = useState([]);
  const [selCourse,   setSelCourse]   = useState(courseId || "");
  const [title,       setTitle]       = useState("");
  const [description, setDescription] = useState("");
  const [dueDate,     setDueDate]     = useState("");
  const [maxScore,    setMaxScore]    = useState(100);
  const [rubric,      setRubric]      = useState([
    { criterion: "Understanding", weight: 30, description: "" },
    { criterion: "Application",   weight: 40, description: "" },
    { criterion: "Presentation",  weight: 30, description: "" },
  ]);
  const [aiFeedback,  setAiFeedback]  = useState(true);
  const [peerReview,  setPeerReview]  = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState("");
  const [success,     setSuccess]     = useState("");

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
    api.courses.getAll({ published: false }).then(r => setCourses(r.courses || [])).catch(() => {});
  }, []);

  const totalWeight = rubric.reduce((s, r) => s + Number(r.weight || 0), 0);

  const addRubric = () => setRubric(r => [...r, { criterion: "", weight: 10, description: "" }]);
  const removeRubric = (i) => setRubric(r => r.filter((_, idx) => idx !== i));
  const updateRubric = (i, k, v) => setRubric(r => r.map((item, idx) => idx === i ? { ...item, [k]: v } : item));

  const handleSubmit = async () => {
    if (!title.trim())    { setError("Title is required."); return; }
    if (!selCourse)       { setError("Select a course."); return; }
    if (!dueDate)         { setError("Due date is required."); return; }
    if (totalWeight !== 100) { setError(`Rubric weights must total 100. Current total: ${totalWeight}`); return; }
    setSubmitting(true); setError("");
    try {
      await api.assignments.create(selCourse, {
        title, description, dueDate, maxScore: Number(maxScore),
        rubric: rubric.map(r => ({ ...r, weight: Number(r.weight) })),
        aiFeedback: { enabled: aiFeedback },
        peerReview:  { enabled: peerReview, reviewsRequired: 2 },
      });
      setSuccess("Assignment created successfully!");
      setTimeout(() => navigate("/teacher"), 1500);
    } catch (e) { setError(e.message); }
    finally { setSubmitting(false); }
  };

  return (
    <div style={{ minHeight:"100vh", background:"#F7F8FC", fontFamily:"'DM Sans','Segoe UI',sans-serif", padding:"32px" }}>
      <div style={{ maxWidth:720, margin:"0 auto", display:"flex", flexDirection:"column", gap:20 }}>

        <div className="fade-up" style={{ display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={() => navigate("/teacher")} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:"#9CA3AF" }}>←</button>
          <div>
            <h1 style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:22, color:"#1A1D23" }}>Create Assignment</h1>
            <p style={{ fontSize:13, color:"#9CA3AF", marginTop:3 }}>Define the task and grading rubric</p>
          </div>
        </div>

        {error   && <div className="error-banner">⚠ {error}</div>}
        {success && <div className="success-banner">✓ {success}</div>}

        {/* Basic info */}
        <div className="card fade-up">
          <h2 style={{ fontSize:15, fontWeight:700, color:"#1A1D23", marginBottom:16 }}>Assignment Details</h2>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div>
              <label className="label">Course *</label>
              <select className="input-field" value={selCourse} onChange={e => setSelCourse(e.target.value)}>
                <option value="">Select a course...</option>
                {courses.map(c => <option key={c._id} value={c._id}>{c.title}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Title *</label>
              <input className="input-field" placeholder="e.g. Neural Network from Scratch" value={title} onChange={e => setTitle(e.target.value)}/>
            </div>
            <div>
              <label className="label">Description</label>
              <textarea className="textarea-field" placeholder="Describe what students need to do..." value={description} onChange={e => setDescription(e.target.value)}/>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
              <div>
                <label className="label">Due Date *</label>
                <input className="input-field" type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)}/>
              </div>
              <div>
                <label className="label">Max Score</label>
                <input className="input-field" type="number" value={maxScore} onChange={e => setMaxScore(e.target.value)} min={1} max={1000}/>
              </div>
            </div>
          </div>
        </div>

        {/* Rubric */}
        <div className="card fade-up">
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <div>
              <h2 style={{ fontSize:15, fontWeight:700, color:"#1A1D23" }}>Grading Rubric</h2>
              <p style={{ fontSize:12, color: totalWeight===100?"#10B981":"#EF4444", marginTop:2 }}>Total: {totalWeight}/100 {totalWeight===100?"✓":""}</p>
            </div>
            <button className="btn-add" onClick={addRubric}>+ Add Criterion</button>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 80px 80px 32px", gap:8, padding:"0 10px 4px" }}>
              {["Criterion","Weight","Max pts",""].map(h => <span key={h} style={{ fontSize:10, fontWeight:600, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.05em" }}>{h}</span>)}
            </div>
            {rubric.map((r, i) => (
              <div className="rubric-row" key={i}>
                <input className="input-field" placeholder="e.g. Correctness" value={r.criterion} onChange={e => updateRubric(i,"criterion",e.target.value)} style={{ padding:"8px 10px", fontSize:13 }}/>
                <input className="input-field" type="number" value={r.weight} onChange={e => updateRubric(i,"weight",e.target.value)} min={1} max={100} style={{ padding:"8px 10px", fontSize:13, textAlign:"center" }}/>
                <div style={{ fontSize:13, fontWeight:600, color:"#6C63FF", textAlign:"center" }}>{Math.round((r.weight/100)*maxScore)}</div>
                {rubric.length > 1 && <button className="btn-danger" onClick={() => removeRubric(i)}>✕</button>}
              </div>
            ))}
          </div>
        </div>

        {/* Settings */}
        <div className="card fade-up">
          <h2 style={{ fontSize:15, fontWeight:700, color:"#1A1D23", marginBottom:4 }}>Feedback Settings</h2>
          <div>
            <div className="toggle-row">
              <div>
                <p style={{ fontSize:13, fontWeight:600, color:"#1A1D23" }}>AI Feedback (Claude)</p>
                <p style={{ fontSize:12, color:"#9CA3AF" }}>Auto-generate feedback on submissions</p>
              </div>
              <div className="toggle" style={{ background: aiFeedback?"#6C63FF":"#D1D5DB" }} onClick={() => setAiFeedback(v => !v)}>
                <div className="toggle-thumb" style={{ left: aiFeedback?18:2 }}/>
              </div>
            </div>
            <div className="toggle-row" style={{ borderBottom:"none" }}>
              <div>
                <p style={{ fontSize:13, fontWeight:600, color:"#1A1D23" }}>Peer Review</p>
                <p style={{ fontSize:12, color:"#9CA3AF" }}>Students review each other's work</p>
              </div>
              <div className="toggle" style={{ background: peerReview?"#6C63FF":"#D1D5DB" }} onClick={() => setPeerReview(v => !v)}>
                <div className="toggle-thumb" style={{ left: peerReview?18:2 }}/>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display:"flex", gap:10 }}>
          <button className="btn-ghost" onClick={() => navigate("/teacher")}>Cancel</button>
          <button className="btn-primary" style={{ flex:1, justifyContent:"center" }} onClick={handleSubmit} disabled={submitting}>
            {submitting ? <><div style={{ width:16, height:16, border:"2px solid #ffffff44", borderTopColor:"#fff", borderRadius:"50%", animation:"spin .8s linear infinite" }}/> Creating…</> : "✓ Create Assignment"}
          </button>
        </div>
      </div>
    </div>
  );
}