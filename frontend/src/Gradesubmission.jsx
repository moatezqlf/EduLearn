import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
  .textarea-field{width:100%;background:#F9FAFB;border:1.5px solid #EAECF0;border-radius:10px;padding:12px 14px;font-size:13px;color:#1A1D23;font-family:inherit;outline:none;resize:vertical;min-height:100px;line-height:1.7}
  .textarea-field:focus{border-color:#6C63FF;background:#fff}
  .btn-primary{background:#1A1D23;color:#fff;border:none;padding:11px 22px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s;display:flex;align-items:center;gap:8px}
  .btn-primary:hover:not(:disabled){background:#2D3139}
  .btn-primary:disabled{opacity:.5;cursor:not-allowed}
  .btn-ai{background:#6C63FF;color:#fff;border:none;padding:11px 22px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s;display:flex;align-items:center;gap:8px}
  .btn-ai:hover:not(:disabled){background:#5a52e0}
  .btn-ghost{background:transparent;color:#6B7280;border:1px solid #EAECF0;padding:10px 20px;border-radius:10px;font-size:13px;cursor:pointer;font-family:inherit}
  .btn-ghost:hover{background:#F9FAFB}
  .label{font-size:12px;font-weight:600;color:#4B5563;letter-spacing:.02em;margin-bottom:6px;display:block}
  .criterion-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #F3F4F6}
  .score-input{width:70px;background:#F9FAFB;border:1.5px solid #EAECF0;border-radius:8px;padding:7px 10px;font-size:13px;font-weight:600;color:#1A1D23;font-family:inherit;outline:none;text-align:center}
  .score-input:focus{border-color:#6C63FF}
  .progress-bar{height:6px;background:#F3F4F6;border-radius:99px;overflow:hidden;flex:1}
  .progress-fill{height:100%;border-radius:99px;transition:width .4s ease}
  .status-badge{padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600}
  .error-banner{background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:12px 16px;font-size:13px;color:#DC2626}
  .success-banner{background:#D1FAE5;border:1px solid #6EE7B7;border-radius:10px;padding:12px 16px;font-size:13px;color:#065F46}
`;

const Ring = ({ value, size=80, stroke=6 }) => {
  const r=(size-stroke*2)/2, c=2*Math.PI*r;
  const color = value>=80?"#10B981":value>=60?"#F59E0B":"#EF4444";
  return (
    <div style={{ position:"relative", width:size, height:size, display:"inline-flex", alignItems:"center", justifyContent:"center" }}>
      <svg width={size} height={size} style={{ transform:"rotate(-90deg)", position:"absolute" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#F3F4F6" strokeWidth={stroke}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={c-(value/100)*c} strokeLinecap="round"
          style={{ transition:"stroke-dashoffset 1s ease" }}/>
      </svg>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:18, fontWeight:700, color, lineHeight:1 }}>{value}</div>
        <div style={{ fontSize:9, color:"#9CA3AF" }}>/100</div>
      </div>
    </div>
  );
};

export default function GradeSubmission() {
  const { submissionId } = useParams();
  const { user } = useAuth();
  const navigate  = useNavigate();

  const [submission, setSubmission] = useState(null);
  const [feedback,   setFeedback]   = useState(null);
  const [scores,     setScores]     = useState({});
  const [note,       setNote]       = useState("");
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [aiLoading,  setAiLoading]  = useState(false);
  const [error,      setError]      = useState("");
  const [success,    setSuccess]    = useState("");

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
    if (!submissionId) return;
    (async () => {
      setLoading(true);
      try {
        const [sRes, fRes] = await Promise.all([
          api.submissions.getById(submissionId),
          api.aiFeedback.getBySubmission(submissionId),
        ]);
        const sub = sRes.submission || sRes;
        setSubmission(sub);
        setNote(sub.teacherNote || "");
        // Init scores from rubric
        if (sub.assignment?.rubric) {
          const init = {};
          sub.assignment.rubric.forEach(r => { init[r._id] = ""; });
          setScores(init);
        }
        const aiF = (fRes.feedbacks || []).find(f => f.generatedBy === "claude");
        if (aiF) setFeedback(aiF);
      } catch (e) { setError(e.message); }
      finally { setLoading(false); }
    })();
  }, [submissionId]);

  const totalScore = () => {
    if (!submission?.assignment?.rubric) return 0;
    return submission.assignment.rubric.reduce((sum, r) => sum + Number(scores[r._id] || 0), 0);
  };

  const handleGrade = async () => {
    setSaving(true); setError("");
    try {
      await api.submissions.grade(submissionId, totalScore(), note);
      setSuccess("Submission graded successfully!");
      setTimeout(() => navigate("/teacher"), 1500);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleGenerateAI = async () => {
    setAiLoading(true); setError("");
    try {
      const res = await api.aiFeedback.generate(submissionId);
      setFeedback(res.feedback);
      setSuccess("AI feedback generated!");
    } catch (e) { setError(e.message); }
    finally { setAiLoading(false); }
  };

  const handleApprove = async () => {
    if (!feedback) return;
    try {
      await api.aiFeedback.approve(feedback._id, {});
      setSuccess("Feedback approved and released to student!");
      setFeedback(f => ({ ...f, approvedAt: new Date() }));
    } catch (e) { setError(e.message); }
  };

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh", background:"#F7F8FC" }}>
      <div style={{ width:36, height:36, border:"3px solid #E5E7EB", borderTopColor:"#6C63FF", borderRadius:"50%", animation:"spin .8s linear infinite" }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:"#F7F8FC", fontFamily:"'DM Sans','Segoe UI',sans-serif", padding:"32px" }}>
      <div style={{ maxWidth:900, margin:"0 auto", display:"grid", gridTemplateColumns:"1fr 320px", gap:24 }}>

        {/* LEFT */}
        <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

          {/* Header */}
          <div className="fade-up" style={{ display:"flex", alignItems:"center", gap:12 }}>
            <button onClick={() => navigate("/teacher")} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:"#9CA3AF" }}>←</button>
            <div>
              <h1 style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:20, color:"#1A1D23" }}>Grade Submission</h1>
              <p style={{ fontSize:13, color:"#9CA3AF", marginTop:2 }}>{submission?.student?.name} · {submission?.assignment?.title}</p>
            </div>
          </div>

          {error   && <div className="error-banner">⚠ {error}</div>}
          {success && <div className="success-banner">✓ {success}</div>}

          {/* Submission content */}
          <div className="card fade-up">
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <h2 style={{ fontSize:14, fontWeight:700, color:"#1A1D23" }}>Student Submission</h2>
              <span className="status-badge" style={{ background:"#FFF3CD", color:"#92600A" }}>
                {submission?.status === "graded" ? "Graded" : submission?.status === "ai_reviewed" ? "AI Reviewed" : "Pending"}
              </span>
            </div>
            <div style={{ background:"#F9FAFB", border:"1px solid #EAECF0", borderRadius:10, padding:"14px 16px", fontSize:13, color:"#4B5563", lineHeight:1.8, whiteSpace:"pre-wrap", maxHeight:300, overflowY:"auto" }}>
              {submission?.content}
            </div>
            <p style={{ fontSize:11, color:"#9CA3AF", marginTop:8 }}>
              Submitted: {submission?.submittedAt ? new Date(submission.submittedAt).toLocaleString("fr-FR") : "—"} · By: {submission?.student?.name}
            </p>
          </div>

          {/* Rubric scoring */}
          {submission?.assignment?.rubric?.length > 0 && (
            <div className="card fade-up">
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                <h2 style={{ fontSize:14, fontWeight:700, color:"#1A1D23" }}>Score by Criterion</h2>
                <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
                  <span style={{ fontSize:24, fontWeight:700, color:"#6C63FF", fontFamily:"'Syne',sans-serif" }}>{totalScore()}</span>
                  <span style={{ fontSize:13, color:"#9CA3AF" }}>/ {submission.assignment.maxScore || 100}</span>
                </div>
              </div>
              {submission.assignment.rubric.map(r => {
                const val = Number(scores[r._id] || 0);
                const pct = Math.round((val / r.weight) * 100);
                const color = pct>=80?"#10B981":pct>=60?"#F59E0B":"#EF4444";
                return (
                  <div className="criterion-row" key={r._id}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontSize:13, fontWeight:500, color:"#1A1D23", marginBottom:6 }}>{r.criterion}</p>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: val ? pct+"%" : "0%", background:color }}/>
                        </div>
                        <span style={{ fontSize:11, color:"#9CA3AF", whiteSpace:"nowrap" }}>max {r.weight}</span>
                      </div>
                    </div>
                    <input
                      className="score-input"
                      type="number" min={0} max={r.weight}
                      placeholder="0"
                      value={scores[r._id]}
                      onChange={e => setScores(s => ({ ...s, [r._id]: e.target.value }))}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* Teacher note */}
          <div className="card fade-up">
            <label className="label">Teacher Comment (optional)</label>
            <textarea className="textarea-field" placeholder="Add a personal note for the student..." value={note} onChange={e => setNote(e.target.value)}/>
          </div>

          {/* Actions */}
          <div style={{ display:"flex", gap:10 }}>
            <button className="btn-ghost" onClick={() => navigate("/teacher")}>Cancel</button>
            <button className="btn-ai" onClick={handleGenerateAI} disabled={aiLoading} style={{ flex:1, justifyContent:"center" }}>
              {aiLoading ? <><div style={{ width:14, height:14, border:"2px solid #ffffff44", borderTopColor:"#fff", borderRadius:"50%", animation:"spin .8s linear infinite" }}/> Generating…</> : "◈ Generate AI Feedback"}
            </button>
            <button className="btn-primary" onClick={handleGrade} disabled={saving} style={{ flex:1, justifyContent:"center" }}>
              {saving ? "Saving…" : "✓ Save Grade"}
            </button>
          </div>
        </div>

        {/* RIGHT — AI Feedback */}
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {feedback ? (
            <>
              <div className="card" style={{ textAlign:"center", padding:24 }}>
                <p style={{ fontSize:12, color:"#9CA3AF", marginBottom:12, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em" }}>AI Score</p>
                <Ring value={feedback.overallScore || 0}/>
                {feedback.level && (
                  <span style={{ display:"inline-block", marginTop:10, padding:"4px 12px", borderRadius:6, fontSize:12, fontWeight:700, background:"#EEF2FF", color:"#4F46E5" }}>{feedback.level}</span>
                )}
              </div>

              <div className="card">
                <p style={{ fontSize:13, fontWeight:700, color:"#1A1D23", marginBottom:8 }}>Summary</p>
                <p style={{ fontSize:12, color:"#4B5563", lineHeight:1.6 }}>{feedback.summary}</p>
              </div>

              {feedback.strengths?.length > 0 && (
                <div className="card" style={{ background:"#F0FDF4", border:"1px solid #BBF7D0" }}>
                  <p style={{ fontSize:12, fontWeight:700, color:"#166534", marginBottom:8 }}>✓ Strengths</p>
                  {feedback.strengths.map((s, i) => <p key={i} style={{ fontSize:12, color:"#166534", lineHeight:1.5, marginBottom:4 }}>• {s}</p>)}
                </div>
              )}

              {feedback.improvements?.length > 0 && (
                <div className="card" style={{ background:"#FFFBEB", border:"1px solid #FDE68A" }}>
                  <p style={{ fontSize:12, fontWeight:700, color:"#92600A", marginBottom:8 }}>→ To Improve</p>
                  {feedback.improvements.map((s, i) => <p key={i} style={{ fontSize:12, color:"#92600A", lineHeight:1.5, marginBottom:4 }}>• {s}</p>)}
                </div>
              )}

              {!feedback.approvedAt ? (
                <button className="btn-primary" style={{ width:"100%", justifyContent:"center", background:"#10B981" }} onClick={handleApprove}>
                  ✓ Approve & Release to Student
                </button>
              ) : (
                <div style={{ padding:"10px 14px", background:"#D1FAE5", border:"1px solid #6EE7B7", borderRadius:10, fontSize:12, color:"#065F46", fontWeight:600, textAlign:"center" }}>
                  ✓ Released to student
                </div>
              )}
            </>
          ) : (
            <div className="card" style={{ textAlign:"center", padding:32 }}>
              <div style={{ fontSize:32, marginBottom:12 }}>◈</div>
              <p style={{ fontWeight:700, color:"#1A1D23", marginBottom:6 }}>No AI Feedback yet</p>
              <p style={{ fontSize:12, color:"#9CA3AF", marginBottom:16 }}>Click "Generate AI Feedback" to analyze this submission with Claude</p>
              <button className="btn-ai" style={{ width:"100%", justifyContent:"center" }} onClick={handleGenerateAI} disabled={aiLoading}>
                {aiLoading ? "Generating…" : "◈ Generate AI Feedback"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}