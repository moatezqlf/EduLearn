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
  .textarea-field{width:100%;background:#F9FAFB;border:1.5px solid #EAECF0;border-radius:10px;padding:12px 14px;font-size:13px;color:#1A1D23;font-family:inherit;outline:none;transition:border-color .15s;resize:vertical;min-height:200px;line-height:1.7}
  .textarea-field:focus{border-color:#6C63FF;background:#fff}
  .btn-primary{background:#6C63FF;color:#fff;border:none;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s;display:flex;align-items:center;gap:8px}
  .btn-primary:hover:not(:disabled){background:#5a52e0;transform:translateY(-1px)}
  .btn-primary:disabled{opacity:.5;cursor:not-allowed}
  .btn-ghost{background:transparent;color:#6B7280;border:1px solid #EAECF0;padding:10px 20px;border-radius:10px;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;transition:all .15s}
  .btn-ghost:hover{background:#F9FAFB;color:#1A1D23}
  .label{font-size:12px;font-weight:600;color:#4B5563;letter-spacing:.02em;margin-bottom:6px;display:block}
  .section-title{font-family:'Syne',sans-serif;font-size:18px;font-weight:700;color:#1A1D23;letter-spacing:-.02em}
  .assignment-card{border:2px solid #EAECF0;border-radius:12px;padding:16px;cursor:pointer;transition:all .15s;background:#fff}
  .assignment-card:hover{border-color:#6C63FF;background:#F5F3FF}
  .assignment-card.selected{border-color:#6C63FF;background:#EEF2FF}
  .skeleton{background:linear-gradient(90deg,#F3F4F6 25%,#E9EAEC 50%,#F3F4F6 75%);background-size:200% 100%;animation:shimmer 1.2s infinite;border-radius:6px}
  @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
  .error-banner{background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:12px 16px;font-size:13px;color:#DC2626;display:flex;align-items:center;gap:8px}
  .success-banner{background:#D1FAE5;border:1px solid #6EE7B7;border-radius:10px;padding:12px 16px;font-size:13px;color:#065F46;display:flex;align-items:center;gap:8px}
  .progress-bar{height:4px;background:#F3F4F6;border-radius:99px;overflow:hidden;margin-top:8px}
  .progress-fill{height:100%;border-radius:99px;background:#6C63FF;transition:width .3s ease}
`;

export default function SubmitAssignment() {
 useAuth();
  const navigate = useNavigate();

  const [, setCourses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [selected,    setSelected]    = useState(null); // selected assignment
  const [content,     setContent]     = useState("");
  const [loading,     setLoading]     = useState(true);
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState("");
  const [success,     setSuccess]     = useState("");
  const [step,        setStep]        = useState(1); // 1=select, 2=write, 3=done

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

  // Load enrolled courses
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await api.courses.getEnrolled();
        setCourses(res.courses || []);
        // Load assignments for all enrolled courses
        const allAssignments = [];
        for (const course of (res.courses || [])) {
          try {
            const aRes = await api.assignments.getByCourse(course._id);
            (aRes.assignments || []).forEach(a => allAssignments.push({ ...a, courseTitle: course.title, courseId: course._id }));
          } catch (e) { void e; }
        }
        setAssignments(allAssignments);
      } catch (e) { setError(e.message); }
      finally { setLoading(false); }
    })();
  }, []);

  const handleSubmit = async () => {
    if (!content.trim()) { setError("Please write your submission first."); return; }
    setSubmitting(true); setError("");
    try {
      const res = await api.submissions.submit(selected._id, { content });
      setSuccess("Submission sent successfully! AI feedback will be generated shortly.");
      setStep(3);
      // Auto-redirect to feedback after 2s
      setTimeout(() => navigate(`/student/feedback/${res.submission._id}`), 2000);
    } catch (e) { setError(e.message); }
    finally { setSubmitting(false); }
  };

  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
  const charPct   = Math.min(100, (content.length / 2000) * 100);

  return (
    <div style={{ minHeight:"100vh", background:"#F7F8FC", fontFamily:"'DM Sans','Segoe UI',sans-serif", padding:"32px" }}>
      <div style={{ maxWidth:760, margin:"0 auto", display:"flex", flexDirection:"column", gap:20 }}>

        {/* Header */}
        <div className="fade-up" style={{ display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={() => navigate("/student")} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:"#9CA3AF", padding:0 }}>←</button>
          <div>
            <h1 className="section-title">Submit Assignment</h1>
            <p style={{ fontSize:13, color:"#9CA3AF", marginTop:3 }}>Your work will be reviewed by AI and your teacher</p>
          </div>
        </div>

        {/* Steps indicator */}
        <div style={{ display:"flex", alignItems:"center", gap:0 }}>
          {[["1","Select","Select assignment"],["2","Write","Write your answer"],["3","Done","Submitted!"]].map(([n,label,],i) => (
            <div key={n} style={{ display:"flex", alignItems:"center", flex: i < 2 ? 1 : "none" }}>
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                <div style={{ width:32, height:32, borderRadius:"50%", background:step>i+1?"#10B981":step===i+1?"#6C63FF":"#F3F4F6", color:step>=i+1?"#fff":"#9CA3AF", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, transition:"all .3s" }}>{step>i+1?"✓":n}</div>
                <span style={{ fontSize:11, fontWeight:600, color:step===i+1?"#6C63FF":step>i+1?"#10B981":"#9CA3AF" }}>{label}</span>
              </div>
              {i < 2 && <div style={{ flex:1, height:2, background:step>i+1?"#10B981":"#F3F4F6", margin:"0 8px", marginBottom:20, transition:"background .3s" }}/>}
            </div>
          ))}
        </div>

        {error && <div className="error-banner">⚠ {error}<button onClick={()=>setError("")} style={{marginLeft:"auto",background:"none",border:"none",cursor:"pointer",fontSize:16,color:"#DC2626"}}>×</button></div>}
        {success && <div className="success-banner">✓ {success}</div>}

        {/* Step 1 — Select assignment */}
        {step === 1 && (
          <div className="fade-up">
            <div className="card">
              <h2 style={{ fontSize:15, fontWeight:700, color:"#1A1D23", marginBottom:16 }}>Choose an assignment</h2>
              {loading ? (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {[0,1,2].map(i => <div key={i} className="skeleton" style={{ height:80, borderRadius:12 }}/>)}
                </div>
              ) : assignments.length === 0 ? (
                <div style={{ textAlign:"center", padding:32 }}>
                  <p style={{ fontSize:32, marginBottom:8 }}>📋</p>
                  <p style={{ fontWeight:600, color:"#1A1D23", marginBottom:4 }}>No assignments available</p>
                  <p style={{ fontSize:13, color:"#9CA3AF" }}>Enroll in courses to see assignments</p>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {assignments.map(a => {
                    const due = new Date(a.dueDate);
                    const overdue = due < Date.now();
                    return (
                      <div key={a._id} className={`assignment-card ${selected?._id===a._id?"selected":""}`} onClick={() => setSelected(a)}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                          <div>
                            <p style={{ fontWeight:600, fontSize:14, color:"#1A1D23", marginBottom:4 }}>{a.title}</p>
                            <p style={{ fontSize:12, color:"#9CA3AF" }}>{a.courseTitle}</p>
                          </div>
                          <div style={{ textAlign:"right", flexShrink:0 }}>
                            <span style={{ fontSize:11, fontWeight:600, padding:"3px 10px", borderRadius:6, background:overdue?"#FEE2E2":"#FFF3CD", color:overdue?"#DC2626":"#92600A" }}>
                              {overdue ? "Overdue" : "Due "+due.toLocaleDateString("en-GB",{day:"numeric",month:"short"})}
                            </span>
                            <p style={{ fontSize:11, color:"#9CA3AF", marginTop:4 }}>{a.maxScore} pts</p>
                          </div>
                        </div>
                        {a.rubric?.length > 0 && (
                          <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginTop:8 }}>
                            {a.rubric.map(r => <span key={r._id} style={{ fontSize:10, background:"#F3F4F6", color:"#4B5563", padding:"2px 8px", borderRadius:5 }}>{r.criterion}</span>)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {selected && (
              <button className="btn-primary" style={{ marginTop:16, width:"100%", justifyContent:"center" }} onClick={() => setStep(2)}>
                Continue with "{selected.title}" →
              </button>
            )}
          </div>
        )}

        {/* Step 2 — Write submission */}
        {step === 2 && selected && (
          <div className="fade-up" style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {/* Assignment details */}
            <div className="card" style={{ background:"#F5F3FF", border:"1px solid #C7D2FB" }}>
              <p style={{ fontWeight:700, fontSize:15, color:"#1A1D23", marginBottom:4 }}>{selected.title}</p>
              <p style={{ fontSize:12, color:"#6B7280", marginBottom:12 }}>{selected.courseTitle} · {selected.maxScore} points</p>
              {selected.description && <p style={{ fontSize:13, color:"#4B5563", lineHeight:1.6, marginBottom:12 }}>{selected.description}</p>}
              {selected.rubric?.length > 0 && (
                <div>
                  <p style={{ fontSize:11, fontWeight:600, color:"#4F46E5", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:8 }}>Grading Rubric</p>
                  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                    {selected.rubric.map(r => (
                      <div key={r._id} style={{ display:"flex", justifyContent:"space-between", fontSize:12 }}>
                        <span style={{ color:"#4B5563" }}>• {r.criterion}</span>
                        <span style={{ fontWeight:600, color:"#4F46E5" }}>{r.weight} pts</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Text editor */}
            <div className="card">
              <label className="label">Your Answer</label>
              <textarea
                className="textarea-field"
                placeholder="Write your answer here... Be detailed and reference the rubric criteria above."
                value={content}
                onChange={e => setContent(e.target.value)}
              />
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:8, fontSize:11, color:"#9CA3AF" }}>
                <span>{wordCount} words</span>
                <span>{content.length} / 2000 chars</span>
              </div>
              <div className="progress-bar"><div className="progress-fill" style={{ width:charPct+"%" }}/></div>
            </div>

            <div style={{ display:"flex", gap:10 }}>
              <button className="btn-ghost" onClick={() => setStep(1)}>← Back</button>
              <button className="btn-primary" style={{ flex:1, justifyContent:"center" }} onClick={handleSubmit} disabled={submitting || !content.trim()}>
                {submitting ? <><div style={{ width:16, height:16, border:"2px solid #ffffff44", borderTopColor:"#fff", borderRadius:"50%", animation:"spin .8s linear infinite" }}/> Submitting…</> : "◈ Submit & Get AI Feedback"}
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Done */}
        {step === 3 && (
          <div className="card fade-up" style={{ textAlign:"center", padding:48 }}>
            <div style={{ fontSize:48, marginBottom:16 }}>🎉</div>
            <h2 style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:22, color:"#1A1D23", marginBottom:8 }}>Submitted!</h2>
            <p style={{ fontSize:14, color:"#6B7280", marginBottom:24 }}>AI feedback is being generated — redirecting you now...</p>
            <div style={{ width:40, height:40, border:"3px solid #E5E7EB", borderTopColor:"#6C63FF", borderRadius:"50%", animation:"spin .8s linear infinite", margin:"0 auto" }}/>
          </div>
        )}
      </div>
    </div>
  );
}
