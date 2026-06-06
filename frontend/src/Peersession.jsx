import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { sessions } from "./api";

const css = `
  @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}
  *{box-sizing:border-box;margin:0;padding:0}
  .fade-up{animation:fadeUp .35s ease forwards}
  .card{background:#fff;border-radius:14px;border:1px solid #EAECF0;padding:20px}
  .phase-bar{display:flex;gap:6px;margin-bottom:20px}
  .phase-pill{flex:1;padding:8px 4px;border-radius:9px;border:1px solid #EAECF0;font-size:11px;font-weight:500;text-align:center;color:#9CA3AF;background:#F9FAFB;cursor:pointer;transition:all .15s}
  .phase-pill.active{background:#EEF2FF;color:#4F46E5;border-color:#C7D2FB;font-weight:600}
  .phase-pill.done{background:#D1FAE5;color:#065F46;border-color:#6EE7B7}
  .student-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:16px}
  .student-card{background:#F9FAFB;border-radius:10px;border:1px solid #EAECF0;padding:12px;cursor:pointer;transition:all .15s;text-align:center}
  .student-card:hover{border-color:#6C63FF}
  .student-card.selected{border:1.5px solid #6C63FF;background:#EEF2FF}
  .student-card.receiver{border:1.5px solid #10B981;background:#D1FAE5}
  .avatar{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;margin:0 auto 8px}
  .feedback-card{background:#F9FAFB;border-radius:10px;border:1px solid #EAECF0;padding:14px;margin-bottom:10px}
  .feedback-card.best{border:1.5px solid #10B981;background:#D1FAE5}
  .btn{display:inline-flex;align-items:center;gap:7px;padding:10px 20px;border-radius:9px;font-size:13px;font-weight:500;cursor:pointer;border:none;font-family:inherit;transition:all .15s}
  .btn-purple{background:#6C63FF;color:#fff}.btn-purple:hover:not(:disabled){background:#5a52e0}
  .btn-green{background:#10B981;color:#fff}.btn-green:hover:not(:disabled){background:#059669}
  .btn-dark{background:#1A1D23;color:#fff}.btn-dark:hover:not(:disabled){background:#2D3139}
  .btn-ghost{background:transparent;color:#6B7280;border:1px solid #EAECF0}.btn-ghost:hover{background:#F9FAFB}
  .btn:disabled{opacity:.45;cursor:not-allowed}
  .input-field{width:100%;background:#F9FAFB;border:1.5px solid #EAECF0;border-radius:10px;padding:11px 14px;font-size:14px;color:#1A1D23;font-family:inherit;outline:none;transition:border-color .15s}
  .input-field:focus{border-color:#6C63FF;background:#fff}
  .textarea-field{width:100%;background:#F9FAFB;border:1.5px solid #EAECF0;border-radius:10px;padding:12px 14px;font-size:13px;color:#1A1D23;font-family:inherit;outline:none;resize:vertical;min-height:120px;line-height:1.7;transition:border-color .15s}
  .textarea-field:focus{border-color:#6C63FF;background:#fff}
  .score-chip{display:inline-block;padding:3px 8px;border-radius:99px;font-size:11px;background:#F3F4F6;color:#4B5563;margin-right:4px}
  .quiz-opt{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;margin-top:6px;cursor:pointer;border:1px solid #EAECF0;font-size:13px;color:#1A1D23;background:#fff;transition:background .12s}
  .quiz-opt:hover{background:#F9FAFB}
  .quiz-opt.selected{background:#EEF2FF;border-color:#C7D2FB;color:#4F46E5}
  .quiz-opt.correct{background:#D1FAE5;border-color:#6EE7B7;color:#065F46}
  .quiz-opt.wrong{background:#FEE2E2;border-color:#FECACA;color:#DC2626}
  .label{font-size:12px;font-weight:600;color:#4B5563;letter-spacing:.02em;margin-bottom:6px;display:block}
  .section-title{font-family:'Syne',sans-serif;font-size:15px;font-weight:700;color:#1A1D23;letter-spacing:-.01em}
  .error-banner{background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:12px 16px;font-size:13px;color:#DC2626;margin-bottom:12px}
  .stream-text{font-size:12px;color:#4B5563;line-height:1.7;white-space:pre-wrap;font-family:monospace;background:#F9FAFB;padding:12px;border-radius:8px;border:1px solid #EAECF0;max-height:200px;overflow-y:auto}
  .progress-bar{height:4px;background:#F3F4F6;border-radius:99px;overflow:hidden;margin-top:6px}
  .progress-fill{height:100%;border-radius:99px;background:#6C63FF;transition:width .3s}
`;

const PHASES = ["Setup","Answers","Peer Feedback","AI Improve","Evaluate","Quiz"];
const colors  = ["#6C63FF","#10B981","#F59E0B","#EF4444"];
const bgs     = ["#EEF2FF","#D1FAE5","#FFF3CD","#FEE2E2"];

const QUIZ_QUESTIONS = [
  { type:"mcq", q:"Which type of feedback is most useful during the learning process?", opts:["Summative","Formative","Evaluative","Normative"], correct:1 },
  { type:"mcq", q:"What does the P-E-E framework stand for?", opts:["Plan-Execute-Evaluate","Point-Evidence-Explanation","Prepare-Engage-Examine","Present-Extend-Explain"], correct:1 },
  { type:"mcq", q:"According to Hattie & Timperley, how many levels of feedback exist?", opts:["Two","Three","Four","Five"], correct:2 },
  { type:"short", q:"In 2–3 sentences, explain the difference between peer feedback and teacher feedback." },
  { type:"writing", q:"Write a short paragraph (80–120 words) evaluating the role of AI-assisted peer feedback in collaborative learning. Include at least one academic reference." },
];

export default function PeerSession() {
  const { user }   = useAuth();
  const navigate   = useNavigate();
  useParams();

  const isTeacher = user?.role === "teacher" || user?.role === "admin";

  // ── State ──────────────────────────────────────────────────
  const [phase,        setPhase]        = useState(0);
  const [question,     setQuestion]     = useState("");
  const [members,      setMembers]      = useState([]); // 4 student objects
  const [round,        setRound]        = useState(0);  // 0-3 → rotation automatique
  const receiverIdx = round % 4;  // chaque round, le receveur change automatiquement
  const [answers,      setAnswers]      = useState({}); // { studentId: text }
  const [rawFeedbacks, setRawFeedbacks] = useState({}); // { reviewerId: text }
  const [improved,     setImproved]     = useState({}); // { reviewerId: text }
  const [scores,       setScores]       = useState({}); // { reviewerId: {relevance,depth,clarity,helpfulness} }
  const [bestReviewer, setBestReviewer] = useState(null);
  const [quizAnswers,  setQuizAnswers]  = useState({});
  const [quizChecked,  setQuizChecked]  = useState(false);
  const [shortAns,     setShortAns]     = useState("");
  const [writingAns,   setWritingAns]   = useState("");

  const [loading,      setLoading]      = useState(false);
  const [streaming,    setStreaming]     = useState(false);
  const [streamText,   setStreamText]   = useState("");
  const [error,        setError]        = useState("");

  // ── Demo members (replace with real API call) ──────────────
  useEffect(() => {
    setMembers([
      { _id:"s1", name:"Amina Khelil",   initials:"AK" },
      { _id:"s2", name:"Youcef Brahim",  initials:"YB" },
      { _id:"s3", name:"Sara Mansouri",  initials:"SM" },
      { _id:"s4", name:"Karim Dali",     initials:"KD" },
    ]);
  }, []);

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

  // ── Reviewers = all except receiver ───────────────────────
  const reviewers = members.filter((_, i) => i !== receiverIdx);
  const receiver  = members[receiverIdx];

  // ── AI: improve feedbacks via backend (Gemini) ───────────────
  const improveWithAI = useCallback(async () => {
    setLoading(true); setError(""); setStreamText("");
    const newImproved = {};
    const peerAnswer = answers[members[receiverIdx]?._id] || "";
    for (const reviewer of reviewers) {
      const raw = rawFeedbacks[reviewer._id] || "";
      if (!raw.trim()) continue;
      try {
        const { assist } = await sessions.assistPeerFeedback({
          question,
          peerAnswer,
          draftComment: raw,
        });
        newImproved[reviewer._id] = assist?.suggestedComment?.trim() || raw;
      } catch {
        newImproved[reviewer._id] = raw;
      }
    }
    setImproved(newImproved);
    // Auto-score
    const newScores = {};
    reviewers.forEach(r => {
      const text = newImproved[r._id] || "";
      const len  = text.length;
      newScores[r._id] = {
        relevance:   Math.min(100, 60 + Math.floor(len/30)),
        depth:       Math.min(100, 50 + Math.floor(len/25)),
        clarity:     Math.min(100, 65 + Math.floor(len/40)),
        helpfulness: Math.min(100, 55 + Math.floor(len/28)),
      };
    });
    setScores(newScores);
    const best = reviewers.reduce((b, r) => {
      const sc = newScores[r._id];
      const bsc = newScores[b._id];
      const avgSc  = (sc.relevance+sc.depth+sc.clarity+sc.helpfulness)/4;
      const avgBsc = (bsc.relevance+bsc.depth+bsc.clarity+bsc.helpfulness)/4;
      return avgSc > avgBsc ? r : b;
    }, reviewers[0]);
    setBestReviewer(best);
    setLoading(false);
    setPhase(4);
  }, [rawFeedbacks, reviewers, question, answers, members, receiverIdx]);

  // ── AI: evaluate writing answer (backend) ─────────────────
  const evaluateWriting = useCallback(async () => {
    if (!writingAns.trim()) { setError("Please write your answer first."); return; }
    setStreaming(true); setStreamText(""); setError("");
    try {
      const { assist } = await sessions.assistPeerFeedback({
        question: "Évaluez le rôle du feedback par les pairs dans l'apprentissage collaboratif.",
        peerAnswer: writingAns,
        draftComment: "",
      });
      const lines = [
        assist?.suggestedComment && `Commentaire type:\n${assist.suggestedComment}`,
        assist?.strengths?.length && `Points forts:\n${assist.strengths.join("\n")}`,
        assist?.weaknesses?.length && `À améliorer:\n${assist.weaknesses.join("\n")}`,
        assist?.tips?.length && `Conseils:\n${assist.tips.join("\n")}`,
      ].filter(Boolean);
      setStreamText(lines.join("\n\n") || "Évaluation non disponible.");
    } catch (e) {
      setError(e.message);
    } finally {
      setStreaming(false);
    }
  }, [writingAns]);

  const avg = (sc) => sc ? Math.round((sc.relevance+sc.depth+sc.clarity+sc.helpfulness)/4) : 0;

  // ══════════════════════════════════════════════════════════
  return (
    <div style={{ minHeight:"100vh", background:"#F7F8FC", fontFamily:"'DM Sans','Segoe UI',sans-serif", padding:"28px 32px" }}>
      <div style={{ maxWidth:860, margin:"0 auto" }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24 }}>
          <button onClick={() => navigate(isTeacher ? "/teacher" : "/student")} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:"#9CA3AF" }}>←</button>
          <div>
            <h1 style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:22, color:"#1A1D23" }}>
              {isTeacher ? "Peer Feedback Session" : "Collaborative Feedback"}
            </h1>
            <p style={{ fontSize:13, color:"#9CA3AF", marginTop:2 }}>Group of 4 · AI-powered peer review</p>
          </div>
          <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
            {PHASES.map((p, i) => (
              <div key={p} onClick={() => i <= phase && setPhase(i)} style={{ padding:"5px 10px", borderRadius:8, fontSize:11, fontWeight:500, cursor: i <= phase ? "pointer" : "default",
                background: i < phase ? "#D1FAE5" : i === phase ? "#EEF2FF" : "#F3F4F6",
                color: i < phase ? "#065F46" : i === phase ? "#4F46E5" : "#9CA3AF",
                border: i === phase ? "1px solid #C7D2FB" : "1px solid transparent",
              }}>{i < phase ? "✓" : i+1} {p}</div>
            ))}
          </div>
        </div>

        {error && <div className="error-banner">⚠ {error} <button onClick={()=>setError("")} style={{marginLeft:"auto",background:"none",border:"none",cursor:"pointer",fontSize:16,color:"#DC2626"}}>×</button></div>}

        {/* ── PHASE 0: Setup ── */}
        {phase === 0 && (
          <div className="fade-up">
            <div className="card" style={{ marginBottom:16 }}>
              <span className="section-title">Teacher's Question</span>
              <p style={{ fontSize:12, color:"#9CA3AF", margin:"4px 0 12px" }}>Write a question or writing prompt for the group</p>
              <textarea className="textarea-field" placeholder="e.g. Explain the importance of feedback in the learning process and how it contributes to academic improvement..." value={question} onChange={e => setQuestion(e.target.value)} style={{ minHeight:80 }}/>
            </div>

            <div className="card" style={{ marginBottom:16 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <span className="section-title">Group Members</span>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:12, color:"#9CA3AF" }}>Round</span>
                  <div style={{ display:"flex", gap:4 }}>
                    {[0,1,2,3].map(i => (
                      <div key={i} style={{ width:24, height:24, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, background: i===round?"#6C63FF":"#F3F4F6", color: i===round?"#fff":"#9CA3AF", cursor:"pointer", transition:"all .15s" }}
                        onClick={() => { setRound(i); setAnswers({}); setRawFeedbacks({}); setImproved({}); setScores({}); setBestReviewer(null); }}>
                        {i+1}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ background:"#EEF2FF", border:"1px solid #C7D2FB", borderRadius:10, padding:"10px 14px", marginBottom:12, fontSize:12, color:"#4F46E5" }}>
                <span style={{ fontWeight:600 }}>Auto-rotation: </span>
                Each round, a different student receives feedback from the other 3. Round {round+1} → <span style={{ fontWeight:700 }}>{members[receiverIdx]?.name}</span> is the receiver.
              </div>
              <div className="student-grid">
                {members.map((m, i) => (
                  <div key={m._id} className={`student-card ${i === receiverIdx ? "receiver" : ""}`} style={{ cursor:"default" }}>
                    <div className="avatar" style={{ background:bgs[i], color:colors[i] }}>{m.initials}</div>
                    <p style={{ fontSize:12, fontWeight:600, color:"#1A1D23" }}>{m.name}</p>
                    <p style={{ fontSize:10, color: i===receiverIdx?"#10B981":"#9CA3AF", marginTop:3, fontWeight: i===receiverIdx?600:400 }}>
                      {i===receiverIdx ? "★ Receiver (auto)" : "Reviewer"}
                    </p>
                  </div>
                ))}
              </div>
              <p style={{ fontSize:11, color:"#9CA3AF", marginTop:10 }}>
                After 4 rounds, every student will have been the receiver once.
              </p>
            </div>

            <button className="btn btn-purple" style={{ width:"100%", justifyContent:"center", padding:"13px" }}
              disabled={!question.trim()} onClick={() => setPhase(1)}>
              Start Session →
            </button>
          </div>
        )}

        {/* ── PHASE 1: Answers ── */}
        {phase === 1 && (
          <div className="fade-up">
            <div className="card" style={{ marginBottom:16, background:"#EEF2FF", border:"1px solid #C7D2FB" }}>
              <p style={{ fontSize:11, fontWeight:600, color:"#4F46E5", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:6 }}>Question</p>
              <p style={{ fontSize:14, color:"#3730A3", lineHeight:1.6 }}>{question}</p>
            </div>

            {members.map((m, i) => (
              <div key={m._id} className="card" style={{ marginBottom:12 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                  <div className="avatar" style={{ background:bgs[i], color:colors[i], width:32, height:32, fontSize:11, flexShrink:0 }}>{m.initials}</div>
                  <div>
                    <p style={{ fontSize:13, fontWeight:600, color:"#1A1D23" }}>{m.name}</p>
                    <p style={{ fontSize:11, color: i===receiverIdx?"#10B981":"#9CA3AF" }}>{i===receiverIdx?"Feedback Receiver":"Reviewer"}</p>
                  </div>
                </div>
                <textarea className="textarea-field" placeholder={`${m.name}'s answer to the question...`}
                  value={answers[m._id] || ""} onChange={e => setAnswers(a => ({ ...a, [m._id]: e.target.value }))}
                  style={{ minHeight:90 }}/>
              </div>
            ))}

            <div style={{ display:"flex", gap:10 }}>
              <button className="btn btn-ghost" onClick={() => setPhase(0)}>← Back</button>
              <button className="btn btn-purple" style={{ flex:1, justifyContent:"center" }}
                disabled={!receiver || !answers[receiver._id]?.trim()}
                onClick={() => setPhase(2)}>Continue to Peer Feedback →</button>
            </div>
          </div>
        )}

        {/* ── PHASE 2: Raw Feedback ── */}
        {phase === 2 && (
          <div className="fade-up">
            <div className="card" style={{ marginBottom:16, background:"#D1FAE5", border:"1px solid #6EE7B7" }}>
              <p style={{ fontSize:11, fontWeight:600, color:"#065F46", marginBottom:6 }}>REVIEWING: {receiver?.name}'s answer</p>
              <p style={{ fontSize:13, color:"#065F46", lineHeight:1.6 }}>{answers[receiver?._id] || "(no answer)"}</p>
            </div>

            {reviewers.map((r) => (
              <div key={r._id} className="card" style={{ marginBottom:12 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                  <div className="avatar" style={{ background:bgs[members.indexOf(r)], color:colors[members.indexOf(r)], width:32, height:32, fontSize:11, flexShrink:0 }}>{r.initials}</div>
                  <p style={{ fontSize:13, fontWeight:600, color:"#1A1D23" }}>{r.name}'s Feedback</p>
                </div>
                <textarea className="textarea-field"
                  placeholder="Write constructive feedback: comment on clarity, grammar, argumentation, coherence..."
                  value={rawFeedbacks[r._id] || ""}
                  onChange={e => setRawFeedbacks(f => ({ ...f, [r._id]: e.target.value }))}
                  style={{ minHeight:90 }}/>
              </div>
            ))}

            <div style={{ display:"flex", gap:10 }}>
              <button className="btn btn-ghost" onClick={() => setPhase(1)}>← Back</button>
              <button className="btn btn-purple" style={{ flex:1, justifyContent:"center" }}
                disabled={reviewers.some(r => !rawFeedbacks[r._id]?.trim()) || loading}
                onClick={async () => { setPhase(3); await improveWithAI(); }}>
                {loading ? <><div style={{ width:14, height:14, border:"2px solid #ffffff44", borderTopColor:"#fff", borderRadius:"50%", animation:"spin .8s linear infinite" }}/> Amélioration IA…</> : "✨ Améliorer avec l'IA →"}
              </button>
            </div>
          </div>
        )}

        {/* ── PHASE 3: AI Improving ── */}
        {phase === 3 && (
          <div className="fade-up">
            <div className="card" style={{ textAlign:"center", padding:48 }}>
              {loading ? (
                <>
                  <div style={{ width:48, height:48, border:"3px solid #EEF2FF", borderTopColor:"#6C63FF", borderRadius:"50%", animation:"spin .8s linear infinite", margin:"0 auto 20px" }}/>
                  <p style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:18, color:"#1A1D23", marginBottom:8 }}>Claude is improving feedbacks…</p>
                  <p style={{ fontSize:13, color:"#9CA3AF" }}>Applying academic writing standards and pedagogical frameworks</p>
                  <div style={{ marginTop:20, display:"flex", flexDirection:"column", gap:8 }}>
                    {["Analyzing feedback quality…","Applying academic standards…","Adding actionable suggestions…","Scoring each feedback…"].map((s,i) => (
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:"#6B7280" }}>
                        <div style={{ width:6, height:6, borderRadius:"50%", background:"#6C63FF", animation:`pulse ${1+i*.2}s infinite` }}/>
                        {s}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize:40, marginBottom:12 }}>✓</div>
                  <p style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:18, color:"#10B981", marginBottom:8 }}>Feedbacks improved!</p>
                  <button className="btn btn-purple" onClick={() => setPhase(4)} style={{ margin:"0 auto" }}>View Results →</button>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── PHASE 4: Evaluate ── */}
        {phase === 4 && (
          <div className="fade-up">
            <h2 className="section-title" style={{ marginBottom:14 }}>AI-Improved Feedbacks & Evaluation</h2>
            {reviewers.map((r) => {
              const sc    = scores[r._id];
              const avgSc = avg(sc);
              const isBest = bestReviewer?._id === r._id;
              return (
                <div key={r._id} className={`card ${isBest?"":""}`} style={{ marginBottom:12, border: isBest?"1.5px solid #10B981":"1px solid #EAECF0", background: isBest?"#F0FDF4":"#fff" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <div className="avatar" style={{ background:bgs[members.indexOf(r)], color:colors[members.indexOf(r)], width:32, height:32, fontSize:11, flexShrink:0 }}>{r.initials}</div>
                      <div>
                        <p style={{ fontSize:13, fontWeight:600, color:"#1A1D23" }}>{r.name}</p>
                        {isBest && <span style={{ fontSize:10, background:"#10B981", color:"#fff", padding:"1px 8px", borderRadius:99, fontWeight:600 }}>Best Feedback</span>}
                      </div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <p style={{ fontSize:22, fontWeight:700, color: isBest?"#10B981":"#6C63FF", fontFamily:"'Syne',sans-serif", lineHeight:1 }}>{avgSc}</p>
                      <p style={{ fontSize:10, color:"#9CA3AF" }}>/ 100</p>
                    </div>
                  </div>
                  <p style={{ fontSize:12, color:"#4B5563", lineHeight:1.7, marginBottom:10 }}>{improved[r._id] || rawFeedbacks[r._id] || ""}</p>
                  {sc && (
                    <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                      {["relevance","depth","clarity","helpfulness"].map(k => (
                        <span key={k} className="score-chip">{k.charAt(0).toUpperCase()+k.slice(1)}: {sc[k]}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {bestReviewer && (
              <div className="card" style={{ background:"#EEF2FF", border:"1px solid #C7D2FB", marginBottom:16 }}>
                <p style={{ fontSize:12, fontWeight:700, color:"#4F46E5", marginBottom:6 }}>◈ Best Feedback delivered to {receiver?.name}</p>
                <p style={{ fontSize:12, color:"#3730A3", lineHeight:1.7 }}>{improved[bestReviewer._id] || ""}</p>
              </div>
            )}

            <div style={{ display:"flex", gap:10 }}>
              <button className="btn btn-ghost" onClick={() => setPhase(2)}>← Back</button>
              {round < 3 ? (
                <button className="btn btn-green" style={{ flex:1, justifyContent:"center" }}
                  onClick={() => {
                    setRound(r => r + 1);
                    setPhase(0);
                    setAnswers({});
                    setRawFeedbacks({});
                    setImproved({});
                    setScores({});
                    setBestReviewer(null);
                    setQuizAnswers({});
                    setQuizChecked(false);
                    setShortAns("");
                    setWritingAns("");
                    setStreamText("");
                  }}>
                  Next Round ({round + 2}/4) — {members[(round + 1) % 4]?.name} receives →
                </button>
              ) : (
                <button className="btn btn-purple" style={{ flex:1, justifyContent:"center" }} onClick={() => setPhase(5)}>
                  All 4 rounds done — Final Quiz →
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── PHASE 5: Quiz ── */}
        {phase === 5 && (
          <div className="fade-up">
            <h2 className="section-title" style={{ marginBottom:14 }}>Final Individual Quiz</h2>
            {QUIZ_QUESTIONS.map((q, qi) => (
              <div key={qi} className="card" style={{ marginBottom:12 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                  <div style={{ width:24, height:24, borderRadius:"50%", background:"#EEF2FF", color:"#4F46E5", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, flexShrink:0 }}>{qi+1}</div>
                  <span style={{ fontSize:10, padding:"2px 8px", borderRadius:99, background: q.type==="mcq"?"#EEF2FF":q.type==="short"?"#D1FAE5":"#FFF3CD", color: q.type==="mcq"?"#4F46E5":q.type==="short"?"#065F46":"#92600A", fontWeight:600 }}>
                    {q.type==="mcq"?"Multiple Choice":q.type==="short"?"Short Answer":"Writing Task"}
                  </span>
                </div>
                <p style={{ fontSize:13, color:"#1A1D23", lineHeight:1.6, marginBottom:8 }}>{q.q}</p>

                {q.type === "mcq" && q.opts.map((opt, oi) => {
                  let cls = "quiz-opt";
                  if (quizChecked) cls += oi===q.correct?" correct":quizAnswers[qi]===oi?" wrong":"";
                  else if (quizAnswers[qi]===oi) cls = "quiz-opt selected";
                  return (
                    <div key={oi} className={cls} onClick={() => { if(!quizChecked) setQuizAnswers(a=>({...a,[qi]:oi})); }}>
                      <span style={{ width:18, height:18, borderRadius:"50%", border:"1px solid #E5E7EB", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, flexShrink:0 }}>{String.fromCharCode(65+oi)}</span>
                      {opt}
                    </div>
                  );
                })}

                {q.type === "short" && (
                  <textarea className="textarea-field" style={{ minHeight:70 }} placeholder="Write your answer..."
                    value={shortAns} onChange={e => setShortAns(e.target.value)}/>
                )}

                {q.type === "writing" && (
                  <>
                    <textarea className="textarea-field" style={{ minHeight:120 }} placeholder="Write your paragraph (80–120 words)..."
                      value={writingAns} onChange={e => setWritingAns(e.target.value)}/>
                    <div style={{ display:"flex", justifyContent:"space-between", marginTop:4, fontSize:11, color:"#9CA3AF" }}>
                      <span>{writingAns.trim().split(/\s+/).filter(Boolean).length} words</span>
                      <span>{writingAns.trim().split(/\s+/).filter(Boolean).length >= 80 && writingAns.trim().split(/\s+/).filter(Boolean).length <= 120 ? "✓ Good length" : "Target: 80–120 words"}</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: Math.min(100,(writingAns.trim().split(/\s+/).filter(Boolean).length/120)*100)+"%" }}/>
                    </div>
                  </>
                )}
              </div>
            ))}

            {!quizChecked ? (
              <button className="btn btn-dark" style={{ width:"100%", justifyContent:"center" }} onClick={() => setQuizChecked(true)}>
                Check MCQ Answers
              </button>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                <div style={{ padding:"12px 16px", background:"#D1FAE5", border:"1px solid #6EE7B7", borderRadius:10, fontSize:13, color:"#065F46", fontWeight:600 }}>
                  MCQ: {[0,1,2].filter(i => quizAnswers[i] === QUIZ_QUESTIONS[i].correct).length}/3 correct
                </div>
                <button className="btn btn-purple" style={{ width:"100%", justifyContent:"center" }}
                  disabled={streaming || !writingAns.trim()} onClick={evaluateWriting}>
                  {streaming ? <><div style={{ width:14, height:14, border:"2px solid #ffffff44", borderTopColor:"#fff", borderRadius:"50%", animation:"spin .8s linear infinite" }}/> Evaluating…</> : "◈ Evaluate My Writing with Claude"}
                </button>
                {streamText && (
                  <div className="card">
                    <p style={{ fontSize:12, fontWeight:700, color:"#1A1D23", marginBottom:8 }}>AI Evaluation Result</p>
                    <div className="stream-text">{streamText}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}