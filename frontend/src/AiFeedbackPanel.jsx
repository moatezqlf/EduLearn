import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import api from "./api";

const css=`
  @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes barFill{from{width:0}to{width:var(--w)}}
  *{box-sizing:border-box;margin:0;padding:0}
  ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:#D1D5DB;border-radius:99px}
  .fade-up{animation:fadeUp .35s ease forwards}
  .spin{animation:spin .8s linear infinite}
  .card{background:#fff;border-radius:14px;border:1px solid #EAECF0}
  .dark{background:#13151A;border:1px solid #2D3139;border-radius:14px}
  .criterion-bar{height:6px;border-radius:99px;background:#F3F4F6;overflow:hidden;flex:1}
  .criterion-fill{height:100%;border-radius:99px;width:var(--w);animation:barFill .9s cubic-bezier(.4,0,.2,1) forwards}
  .btn{display:inline-flex;align-items:center;gap:7px;padding:10px 18px;border-radius:9px;font-size:13px;font-weight:500;cursor:pointer;border:none;font-family:inherit;transition:all .15s}
  .btn-purple{background:#6C63FF;color:#fff}
  .btn-purple:hover{background:#5a52e0}
  .btn-dark{background:#1A1D23;color:#fff}
  .btn-dark:hover{background:#2D3139}
  .btn-ghost{background:transparent;color:#6B7280;border:1px solid #EAECF0}
  .btn-ghost:hover{background:#F3F4F6;color:#1A1D23}
  .btn:disabled{opacity:.45;cursor:not-allowed}
  .step-dot{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0}
  .section-label{font-family:'Syne',sans-serif;font-size:13px;font-weight:700;color:#1A1D23;letter-spacing:-.01em}
  .prose-block{font-size:13px;color:#374151;line-height:1.75;white-space:pre-wrap;word-break:break-word;min-height:24px}
  .cursor-blink::after{content:'|';animation:pulse .7s infinite;color:#6C63FF;margin-left:1px}
  .submission-box{background:#F9FAFB;border:1px solid #EAECF0;border-radius:10px;padding:14px 16px;font-size:12px;color:#4B5563;line-height:1.7;max-height:160px;overflow-y:auto;white-space:pre-wrap}
  .error-banner{background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:16px;display:flex;gap:12px;align-items:center}
  .skeleton{background:linear-gradient(90deg,#F3F4F6 25%,#E9EAEC 50%,#F3F4F6 75%);background-size:200% 100%;animation:shimmer 1.2s infinite;border-radius:6px}
  @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
`;

const steps=["Reading submission","Applying rubric","Generating feedback","Scoring criteria","Finalizing"];
const levelColors={Excellent:"#10B981",Good:"#6C63FF",Satisfactory:"#F59E0B","Needs Work":"#EF4444"};

const Ring=({score,size=100,stroke=8})=>{
  const r=(size-stroke*2)/2,c=2*Math.PI*r;
  const color=score>=80?"#10B981":score>=60?"#F59E0B":"#EF4444";
  return (
    <div style={{position:"relative",width:size,height:size,display:"inline-flex",alignItems:"center",justifyContent:"center"}}>
      <svg width={size} height={size} style={{transform:"rotate(-90deg)",position:"absolute"}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#F3F4F6" strokeWidth={stroke}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={c-(score/100)*c} strokeLinecap="round"
          style={{transition:"stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)"}}/>
      </svg>
      <div style={{textAlign:"center"}}>
        <span style={{fontSize:26,fontWeight:700,fontFamily:"'Syne',sans-serif",color}}>{score}</span>
        <span style={{display:"block",fontSize:10,color:"#9CA3AF",marginTop:-2}}>/100</span>
      </div>
    </div>
  );
};

const CriterionRow=({criterion,weight,score,comment})=>{
  const pct=score!=null?Math.round((score/weight)*100):0;
  const color=pct>=80?"#10B981":pct>=60?"#F59E0B":"#EF4444";
  return (
    <div style={{marginBottom:comment?12:8}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:12,color:"#4B5563",flex:1,minWidth:0}}>{criterion}</span>
        <div className="criterion-bar"><div className="criterion-fill" style={{"--w":score!=null?pct+"%":"0%",background:color}}/></div>
        <span style={{fontSize:12,fontWeight:700,color,minWidth:36,textAlign:"right"}}>{score!=null?`${score}/${weight}`:"—"}</span>
      </div>
      {comment&&<p style={{fontSize:11,color:"#9CA3AF",marginTop:3,paddingLeft:2}}>{comment}</p>}
    </div>
  );
};

export default function AiFeedbackPanel() {
  const { submissionId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [submission, setSubmission] = useState(null);
  const [existing,   setExisting]   = useState(null);   // already-generated feedback
  const [status,     setStatus]     = useState("idle"); // idle|loading|streaming|done|error
  const [streamText, setStreamText] = useState("");
  const [feedback,   setFeedback]   = useState(null);
  const [currentStep,setCurrentStep]= useState(0);
  const [errorMsg,   setErrorMsg]   = useState("");
  const [pageLoad,   setPageLoad]   = useState(true);
  const streamRef  = useRef(null);
  const bottomRef  = useRef(null);

  useEffect(()=>{
    const link=document.createElement("link");
    link.rel="stylesheet";
    link.href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Syne:wght@700&display=swap";
    document.head.appendChild(link);
    const style=document.createElement("style");
    style.textContent=css;
    document.head.appendChild(style);
    return()=>{ document.head.removeChild(link); document.head.removeChild(style); };
  },[]);

  // Load submission + existing feedback
  useEffect(()=>{
    if (!submissionId) { setPageLoad(false); return; }
    (async()=>{
      try {
        const [sRes, fRes] = await Promise.all([
          api.submissions.getById(submissionId),
          api.aiFeedback.getBySubmission(submissionId),
        ]);
        setSubmission(sRes.submission || sRes);
        const aiF = (fRes.feedbacks||[]).find(f=>f.generatedBy==="claude");
        if (aiF) { setExisting(aiF); setFeedback(aiF); setStatus("done"); }
      } catch(e) { setErrorMsg(e.message); }
      finally { setPageLoad(false); }
    })();
  },[submissionId]);

  useEffect(()=>{ if(status==="streaming") bottomRef.current?.scrollIntoView({behavior:"smooth",block:"nearest"}); },[streamText,status]);

  const runSteps=async()=>{ for(let i=0;i<steps.length;i++){ setCurrentStep(i); await new Promise(r=>setTimeout(r,520+Math.random()*300)); } };

  const generate=async()=>{
    if(!submissionId&&!submission) { setErrorMsg("No submission selected."); return; }
    setStatus("loading"); setStreamText(""); setFeedback(null); setErrorMsg(""); setCurrentStep(0);
    runSteps();
    try {
      await api.aiFeedback.generateStream(
        submission?._id || submissionId,
        {
          onChunk: ({chunk})=>{ if(chunk){ setStatus("streaming"); setStreamText(t=>t+chunk); } },
          onDone:  async()=>{
            // Fetch the saved feedback after streaming
            try {
              const fRes = await api.aiFeedback.getBySubmission(submission?._id||submissionId);
              const saved=(fRes.feedbacks||[]).find(f=>f.generatedBy==="claude");
              if(saved){ setFeedback(saved); setStatus("done"); }
              else { setErrorMsg("Feedback was generated but could not be retrieved."); setStatus("error"); }
            } catch(e){ setErrorMsg(e.message); setStatus("error"); }
          },
          onError: (e)=>{ setErrorMsg(e.message||"Stream error"); setStatus("error"); },
        }
      );
    } catch(e){ setErrorMsg(e.message); setStatus("error"); }
  };

  const reset=()=>{ clearInterval(streamRef.current); setStatus("idle"); setStreamText(""); setFeedback(null); setCurrentStep(0); setErrorMsg(""); setExisting(null); };

  if(pageLoad) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#F7F8FC"}}><div className="spin" style={{width:32,height:32,border:"3px solid #E5E7EB",borderTopColor:"#6C63FF",borderRadius:"50%"}}/></div>;

  return (
    <div style={{fontFamily:"'DM Sans','Segoe UI',sans-serif",background:"#F7F8FC",minHeight:"100vh",padding:"32px",color:"#1A1D23"}}>
      <div style={{maxWidth:860,margin:"0 auto",display:"flex",flexDirection:"column",gap:20}}>

        {/* Header */}
        <div className="fade-up" style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between"}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
              <button onClick={()=>navigate(-1)} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#9CA3AF",padding:0,lineHeight:1}}>←</button>
              <div style={{width:36,height:36,borderRadius:10,background:"#6C63FF",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:16}}>◈</div>
              <h1 style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:22,letterSpacing:"-.02em"}}>AI Feedback</h1>
              <span style={{fontSize:10,background:"#EEF2FF",color:"#4F46E5",padding:"3px 8px",borderRadius:99,fontWeight:700}}>CLAUDE</span>
            </div>
            <p style={{fontSize:13,color:"#6B7280",paddingLeft:46}}>Personalized feedback powered by Claude AI</p>
          </div>
          {status!=="idle"&&!existing&&<button className="btn btn-ghost" onClick={reset} style={{fontSize:12}}>↺ Reset</button>}
        </div>

        {/* Submission preview */}
        {submission ? (
          <div className="card fade-up" style={{padding:20}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
              <div>
                <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:15}}>{submission.assignment?.title||"Assignment"}</span>
                <p style={{fontSize:12,color:"#9CA3AF",marginTop:3}}>{submission.course?.title} · Submitted {submission.submittedAt?new Date(submission.submittedAt).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}):""}</p>
              </div>
              <span style={{fontSize:11,background:submission.status==="graded"?"#D1FAE5":submission.status==="ai_reviewed"?"#EEF2FF":"#FFF3CD",color:submission.status==="graded"?"#065F46":submission.status==="ai_reviewed"?"#3730A3":"#92600A",fontWeight:600,padding:"4px 10px",borderRadius:6,flexShrink:0}}>{submission.status==="graded"?"Graded":submission.status==="ai_reviewed"?"AI Reviewed":"Awaiting Review"}</span>
            </div>
            <div className="submission-box">{submission.content}</div>
            {submission.assignment?.rubric?.length>0&&(
              <div style={{marginTop:14}}>
                <p style={{fontSize:11,color:"#9CA3AF",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:8}}>Rubric</p>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {submission.assignment.rubric.map(r=>(
                    <span key={r._id||r.criterion} style={{fontSize:11,background:"#F3F4F6",color:"#4B5563",padding:"4px 10px",borderRadius:6,fontWeight:500}}>
                      {r.criterion} <span style={{color:"#9CA3AF"}}>·{r.weight}pts</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : !submissionId ? (
          <div className="card" style={{padding:24,textAlign:"center"}}>
            <p style={{fontSize:13,color:"#9CA3AF",marginBottom:12}}>No submission selected. Go back and select a submission to generate feedback.</p>
            <button className="btn btn-dark" onClick={()=>navigate(-1)}>← Go Back</button>
          </div>
        ) : null}

        {/* Already has feedback notice */}
        {existing&&status==="done"&&(
          <div style={{background:"#F0FDF4",border:"1px solid #BBF7D0",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#166534",display:"flex",alignItems:"center",gap:8}}>
            ✓ AI feedback already generated — showing saved results below.
            <button onClick={reset} style={{marginLeft:"auto",background:"none",border:"none",cursor:"pointer",color:"#166534",fontWeight:600,fontSize:12}}>Regenerate</button>
          </div>
        )}

        {/* Generate button */}
        {status==="idle"&&submission&&(
          <div className="fade-up">
            <button className="btn btn-purple" style={{width:"100%",justifyContent:"center",padding:"13px 20px",fontSize:14}} onClick={generate}>
              <span style={{fontSize:16}}>◈</span> Generate AI Feedback
            </button>
          </div>
        )}

        {/* Steps */}
        {(status==="loading"||status==="streaming")&&(
          <div className="dark fade-up" style={{padding:20}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
              <div className="spin" style={{width:18,height:18,border:"2px solid #6C63FF44",borderTopColor:"#6C63FF",borderRadius:"50%"}}/>
              <span style={{color:"#fff",fontSize:13,fontWeight:600}}>{status==="loading"?"Analyzing submission…":"Streaming response…"}</span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {steps.map((s,i)=>{
                const done=i<currentStep,active=i===currentStep;
                return (
                  <div key={s} style={{display:"flex",alignItems:"center",gap:10,opacity:i>currentStep?0.3:1,transition:"opacity .3s"}}>
                    <div className="step-dot" style={{background:done?"#10B981":active?"#6C63FF":"#2D3139",color:"#fff"}}>{done?"✓":i+1}</div>
                    <span style={{fontSize:12,color:done?"#10B981":active?"#fff":"#6B7280",fontWeight:active?600:400}}>{s}</span>
                    {active&&<div style={{width:5,height:5,borderRadius:"50%",background:"#6C63FF",animation:"pulse .7s infinite",marginLeft:4}}/>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Stream preview */}
        {status==="streaming"&&streamText&&!feedback&&(
          <div className="card" style={{padding:18}}>
            <p style={{fontSize:11,color:"#9CA3AF",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:10}}>Live Output</p>
            <div className={`prose-block cursor-blink`} style={{fontFamily:"monospace",fontSize:11,background:"#F9FAFB",padding:12,borderRadius:8,border:"1px solid #EAECF0",maxHeight:160,overflowY:"auto"}}>
              {streamText}<div ref={bottomRef}/>
            </div>
          </div>
        )}

        {/* Structured result */}
        {status==="done"&&feedback&&(
          <div style={{display:"flex",flexDirection:"column",gap:16}} className="fade-up">
            <div className="card" style={{padding:24,display:"flex",alignItems:"center",gap:28}}>
              <Ring score={feedback.overallScore||0}/>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                  <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:18}}>Overall Score</span>
                  {feedback.level&&<span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:6,background:(levelColors[feedback.level]||"#6B7280")+"18",color:levelColors[feedback.level]||"#6B7280"}}>{feedback.level}</span>}
                </div>
                <p style={{fontSize:13,color:"#4B5563",lineHeight:1.7}}>{feedback.summary}</p>
              </div>
            </div>

            {feedback.criteriaScores?.length>0&&(
              <div className="card" style={{padding:20}}>
                <span className="section-label" style={{display:"block",marginBottom:14}}>Criteria Breakdown</span>
                {feedback.criteriaScores.map((c,i)=><CriterionRow key={i} criterion={c.criterion} weight={c.weight} score={c.score} comment={c.comment}/>)}
              </div>
            )}

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              {feedback.strengths?.length>0&&(
                <div className="card" style={{padding:18}}>
                  <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:12}}><span style={{fontSize:16}}>✦</span><span className="section-label" style={{fontSize:13,color:"#10B981"}}>Strengths</span></div>
                  <ul style={{listStyle:"none",display:"flex",flexDirection:"column",gap:8}}>
                    {feedback.strengths.map((s,i)=><li key={i} style={{display:"flex",gap:8,fontSize:13,color:"#374151",lineHeight:1.5}}><span style={{color:"#10B981",flexShrink:0,marginTop:1}}>✓</span>{s}</li>)}
                  </ul>
                </div>
              )}
              {feedback.improvements?.length>0&&(
                <div className="card" style={{padding:18}}>
                  <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:12}}><span style={{fontSize:16}}>⬆</span><span className="section-label" style={{fontSize:13,color:"#F59E0B"}}>To Improve</span></div>
                  <ul style={{listStyle:"none",display:"flex",flexDirection:"column",gap:8}}>
                    {feedback.improvements.map((s,i)=><li key={i} style={{display:"flex",gap:8,fontSize:13,color:"#374151",lineHeight:1.5}}><span style={{color:"#F59E0B",flexShrink:0,marginTop:1}}>→</span>{s}</li>)}
                  </ul>
                </div>
              )}
            </div>

            {feedback.suggestion&&(
              <div style={{background:"#EEF2FF",border:"1px solid #C7D2FB",borderRadius:12,padding:"16px 20px",display:"flex",gap:12,alignItems:"flex-start"}}>
                <span style={{fontSize:18,flexShrink:0}}>◈</span>
                <div><p style={{fontSize:12,fontWeight:700,color:"#4F46E5",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>Next Step</p><p style={{fontSize:13,color:"#3730A3",lineHeight:1.6}}>{feedback.suggestion}</p></div>
              </div>
            )}

            {/* Teacher approve (if teacher) */}
            {user?.role==="teacher"&&!feedback.approvedAt&&(
              <div style={{background:"#FFF3CD",border:"1px solid #FDE68A",borderRadius:10,padding:"12px 16px",display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:14}}>⚠</span>
                <p style={{fontSize:12,color:"#92600A",flex:1}}>This AI feedback has not been approved yet. Review and approve before releasing to the student.</p>
                <button className="btn btn-dark" style={{fontSize:12}} onClick={async()=>{ await api.aiFeedback.approve(feedback._id,{}); setFeedback(f=>({...f,approvedAt:new Date()})); }}>Approve & Release</button>
              </div>
            )}

            <div style={{display:"flex",gap:10}}>
              <button className="btn btn-dark" style={{flex:1,justifyContent:"center"}} onClick={()=>navigate(-1)}>← Back to Dashboard</button>
              <button className="btn btn-ghost">⬇ Download PDF</button>
            </div>
          </div>
        )}

        {/* Error */}
        {status==="error"&&(
          <div className="error-banner fade-up">
            <span style={{fontSize:20}}>⚠</span>
            <div style={{flex:1}}><p style={{fontSize:13,fontWeight:600,color:"#DC2626"}}>Error generating feedback</p><p style={{fontSize:12,color:"#7F1D1D",marginTop:2}}>{errorMsg}</p></div>
            <button className="btn btn-dark" style={{fontSize:12}} onClick={generate}>Retry</button>
          </div>
        )}
      </div>
    </div>
  );
}
