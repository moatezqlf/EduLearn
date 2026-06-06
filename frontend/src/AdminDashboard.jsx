import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import api from "./api";

const fmt = (iso) => { if(!iso)return"—"; const d=new Date(iso); return d.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}); };
const navItems=[{id:"overview",label:"Overview",icon:"⊞"},{id:"users",label:"Users",icon:"⊕"},{id:"courses",label:"Courses",icon:"◫"},{id:"analytics",label:"Analytics",icon:"◎"},{id:"feedback",label:"AI Feedback",icon:"◈"},{id:"settings",label:"Settings",icon:"⊙"},{id:"logs",label:"System Logs",icon:"≡"}];
const roleConfig={ teacher:{label:"Teacher",bg:"#D1FAE5",color:"#065F46"}, student:{label:"Student",bg:"#EEF2FF",color:"#3730A3"}, admin:{label:"Admin",bg:"#FEF3C7",color:"#92600A"} };
const statusConfig={ active:{label:"Actif",bg:"#D1FAE5",color:"#065F46",dot:"#10B981"}, pending:{label:"En attente",bg:"#EEF2FF",color:"#3730A3",dot:"#6C63FF"}, inactive:{label:"Inactif",bg:"#F3F4F6",color:"#4B5563",dot:"#9CA3AF"}, banned:{label:"Banni",bg:"#FEE2E2",color:"#DC2626",dot:"#EF4444"} };
const platformDefaults=[{key:"ai_feedback",label:"AI Peer Feedback",desc:"Enable Claude-powered feedback",enabled:true},{key:"peer_review",label:"Peer Review System",desc:"Students review each other",enabled:true},{key:"auto_grade",label:"Auto-grading",desc:"AI scores objective assignments",enabled:false},{key:"email_notifs",label:"Email Notifications",desc:"Send activity emails",enabled:true},{key:"maintenance",label:"Maintenance Mode",desc:"Take platform offline",enabled:false},{key:"open_reg",label:"Open Registration",desc:"Allow new signups",enabled:true},{key:"auto_approve_registrations",label:"Approbation automatique",desc:"Approuve automatiquement les nouveaux comptes étudiants",enabled:true}];

const css=`
  @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
  *{box-sizing:border-box;margin:0;padding:0}
  ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:#3D3F47;border-radius:99px}
  .fade-up{animation:fadeUp .35s ease forwards}
  .nav-item{display:flex;align-items:center;gap:10px;padding:9px 14px;border-radius:10px;cursor:pointer;font-size:14px;color:#6B7280;transition:all .18s;white-space:nowrap;user-select:none}
  .nav-item:hover{background:#1e2128;color:#fff}
  .nav-item.active{background:#6C63FF;color:#fff;font-weight:500}
  .card{background:#fff;border-radius:14px;border:1px solid #EAECF0}
  .user-row{display:grid;align-items:center;grid-template-columns:36px 1fr 90px 90px 100px 80px;gap:10px;padding:11px 16px;border-bottom:1px solid #F3F4F6;font-size:12px;transition:background .12s;cursor:pointer}
  .user-row:hover{background:#FAFAFA}
  .user-row:last-child{border-bottom:none}
  .btn-primary{background:#6C63FF;color:#fff;border:none;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;transition:all .15s}
  .btn-primary:hover{background:#5a52e0}
  .btn-dark{background:#1A1D23;color:#fff;border:none;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;transition:all .15s}
  .btn-dark:hover{background:#2D3139}
  .btn-sm{background:transparent;color:#6B7280;border:1px solid #EAECF0;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:500;cursor:pointer;font-family:inherit;transition:all .15s}
  .btn-sm:hover{background:#F3F4F6;color:#1A1D23}
  .btn-danger{background:#FEF2F2;color:#DC2626;border:1px solid #FECACA;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:500;cursor:pointer;font-family:inherit;transition:all .15s}
  .btn-danger:hover{background:#FEE2E2}
  .tab{padding:6px 14px;border-radius:8px;font-size:12px;font-weight:500;cursor:pointer;border:none;font-family:inherit;transition:all .15s}
  .tab.active{background:#1A1D23;color:#fff}
  .tab:not(.active){background:transparent;color:#6B7280}
  .tab:not(.active):hover{background:#F3F4F6;color:#1A1D23}
  .section-title{font-family:'Syne',sans-serif;font-size:15px;font-weight:700;color:#1A1D23;letter-spacing:-.01em}
  .avatar{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0}
  .badge{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:5px;font-size:11px;font-weight:600}
  .toggle-wrap{position:relative;width:36px;height:20px;flex-shrink:0}
  .toggle-wrap input{position:absolute;opacity:0;width:100%;height:100%;cursor:pointer;margin:0;z-index:2}
  .toggle-track{position:absolute;inset:0;background:#D1D5DB;border-radius:10px;transition:background .2s}
  .toggle-wrap input:checked + .toggle-track{background:#6C63FF}
  .toggle-thumb{position:absolute;top:2px;left:2px;width:16px;height:16px;background:#fff;border-radius:50%;transition:transform .2s;box-shadow:0 1px 3px rgba(0,0,0,.2);pointer-events:none;z-index:1}
  .toggle-wrap input:checked ~ .toggle-thumb{transform:translateX(16px)}
  .search-wrap{position:relative}
  .search-icon{position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:13px;color:#9CA3AF;pointer-events:none}
  .search-input{background:#F7F8FC;border:1px solid #EAECF0;border-radius:8px;padding:8px 12px 8px 32px;font-size:13px;color:#1A1D23;font-family:inherit;outline:none;transition:border-color .15s;width:200px}
  .search-input:focus{border-color:#6C63FF;background:#fff}
  .stat-card{background:#fff;border-radius:14px;padding:18px 20px;border:1px solid #EAECF0;flex:1 1 0;min-width:0}
  .skeleton{background:linear-gradient(90deg,#F3F4F6 25%,#E9EAEC 50%,#F3F4F6 75%);background-size:200% 100%;animation:shimmer 1.2s infinite;border-radius:6px}
  .error-banner{background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:12px 16px;font-size:13px;color:#DC2626;display:flex;align-items:center;gap:8px}
  .bar{border-radius:3px 3px 0 0;transition:height .7s cubic-bezier(.4,0,.2,1);cursor:pointer}
  .bar:hover{filter:brightness(.88)}
`;

const avColors=["#6C63FF","#0EA5E9","#10B981","#F59E0B","#EC4899","#14B8A6"];
const avColor=s=>avColors[(s||"A").charCodeAt(0)%avColors.length];

const Toggle=({checked,onChange})=>(
  <div className="toggle-wrap">
    <input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/>
    <div className="toggle-track"/>
    <div className="toggle-thumb"/>
  </div>
);

const Bar=({data,color,height=90,labels})=>{
  const max=Math.max(...data,1);
  return (
    <div>
      <div style={{display:"flex",alignItems:"flex-end",gap:4,height}}>
        {data.map((v,i)=><div key={i} className="bar" style={{flex:1,height:Math.max(4,(v/max)*height),background:i===data.length-1?color:color+"60"}}/>)}
      </div>
      {labels&&<div style={{display:"flex",marginTop:4}}>{labels.map((l,i)=><span key={i} style={{flex:1,textAlign:"center",fontSize:9,color:"#9CA3AF"}}>{l}</span>)}</div>}
    </div>
  );
};

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeNav,   setActiveNav]   = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userFilter,  setUserFilter]  = useState("all");
  const [search,      setSearch]      = useState("");
  const [settings,    setSettings]    = useState(()=>Object.fromEntries(platformDefaults.map(s=>[s.key,s.enabled])));
  const [announce,    setAnnounce]    = useState({ subject: "", body: "", role: "all" });
  const [announceMsg, setAnnounceMsg] = useState("");
  const [chartMetric, setChartMetric] = useState("users");
  const [settingsSaved, setSettingsSaved] = useState(false);

  const [platformStats, setPlatformStats] = useState(null);
  const [userStats,     setUserStats]     = useState(null);
  const [users,         setUsers]         = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [usersLoading,  setUsersLoading]  = useState(false);
  const [error,         setError]         = useState("");
  const [enrollModal,   setEnrollModal]   = useState(null); // { userId, userName }
  const [teacherCourses, setTeacherCourses] = useState([]);
  const [enrolling,     setEnrolling]     = useState(false);

  const fetchPlatform = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [pRes, uRes] = await Promise.all([
        api.analytics.platform(),
        api.users.getStats(),
      ]);
      setPlatformStats(pRes);
      setUserStats(uRes);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const params = {};
      if (userFilter === "pending") params.status = "pending";
      else if (userFilter !== "all") params.role = userFilter;
      if (search) params.search = search;
      const res = await api.users.getAll(params);
      setUsers(res.users || []);
    } catch(e) { setError(e.message); }
    finally { setUsersLoading(false); }
  }, [userFilter, search]);

  useEffect(() => { fetchPlatform(); }, [fetchPlatform]);
  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  useEffect(() => {
    api.settings.get().then(res => {
      const s = res.settings || {};
      setSettings({
        ai_feedback: s.ai_feedback ?? true,
        peer_review: s.peer_review ?? true,
        auto_grade: s.auto_grade ?? false,
        email_notifs: s.email_notifs ?? true,
        maintenance: s.maintenance ?? false,
        open_reg: s.open_reg ?? true,
        auto_approve_registrations: s.auto_approve_registrations ?? true,
      });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel="stylesheet";
    link.href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Syne:wght@700&display=swap";
    document.head.appendChild(link);
    const style = document.createElement("style");
    style.textContent=css;
    document.head.appendChild(style);
    return ()=>{ document.head.removeChild(link); document.head.removeChild(style); };
  },[]);

  const handleBan = async (userId, currentStatus) => {
    const action = currentStatus==="banned" ? api.users.restore : api.users.ban;
    try {
      await action(userId);
      setUsers(prev=>prev.map(u=>u._id===userId?{...u,status:currentStatus==="banned"?"active":"banned"}:u));
    } catch(e) { alert(e.message); }
  };

  const handleApprove = async (userId) => {
    try {
      await api.users.approve(userId);
      setUsers(prev => prev.map(u => u._id === userId ? { ...u, status: "active" } : u));
      fetchPlatform();
    } catch (e) { alert(e.message); }
  };

  const handleReject = async (userId) => {
    if (!confirm("Supprimer cet utilisateur ?")) return;
    try {
      await api.users.reject(userId);
      setUsers(prev => prev.filter(u => u._id !== userId));
      fetchPlatform();
    } catch (e) { alert(e.message); }
  };

  const openEnrollModal = async (userId, userName) => {
    setEnrollModal({ userId, userName });
    try {
      const res = await api.courses.getAll({ limit: 50 });
      setTeacherCourses(res.courses || []);
    } catch { setTeacherCourses([]); }
  };

  const handleEnroll = async (courseId) => {
    if (!enrollModal) return;
    setEnrolling(true);
    try {
      await api.admin.enroll(enrollModal.userId, courseId);
      alert(`✓ ${enrollModal.userName} inscrit avec succès !`);
      setEnrollModal(null);
    } catch (e) {
      alert(e.message || "Erreur d'inscription");
    } finally { setEnrolling(false); }
  };

  const saveSettings = async () => {
    try {
      await api.settings.update(settings);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    } catch (e) { alert(e.message); }
  };

  const sendAnnouncement = async () => {
    try {
      const res = await api.email.announcement(announce);
      setAnnounceMsg(`Annonce envoyée à ${res.sent}/${res.total} utilisateurs`);
      setAnnounce({ subject: "", body: "", role: "all" });
    } catch (e) { alert(e.message); }
  };

  const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const mockGrowth=[120,145,160,178,195,210,230,258,280,310,360,platformStats?.users||420];
  const metricCfg={
    users:{label:"Total Users",color:"#6C63FF",data:mockGrowth,fmt:v=>v},
    revenue:{label:"Revenue (USD)",color:"#10B981",data:[800,950,880,1100,1050,1300,1250,1500,1480,1700,1900,Math.round(platformStats?.revenue||2200)],fmt:v=>"$"+v},
    submissions:{label:"Submissions",color:"#F59E0B",data:[40,62,55,80,74,90,85,105,98,120,115,platformStats?.submissions||140],fmt:v=>v},
  };
  const mc=metricCfg[chartMetric];

  const statCards=[
    {label:"Total Users",    value:platformStats?String(platformStats.users):"—",   sub:"registered accounts",    icon:"⊕",accent:"#6C63FF"},
    {label:"Active Teachers",value:userStats?String(userStats.teachers):"—",        sub:"courses live",            icon:"◫",accent:"#10B981"},
    {label:"Total Courses",  value:platformStats?String(platformStats.courses):"—", sub:"published",               icon:"◉",accent:"#0EA5E9"},
    {label:"AI Feedbacks",   value:platformStats?String(platformStats.aiFeedbacks):"—",sub:"generated",            icon:"◈",accent:"#EC4899"},
    {label:"Monthly Revenue",value:platformStats?"$"+Math.round(platformStats.revenue):"—",sub:"estimated",        icon:"◎",accent:"#F59E0B"},
  ];

  return (
    <div style={{display:"flex",minHeight:"100vh",fontFamily:"'DM Sans','Segoe UI',sans-serif",background:"#F7F8FC",color:"#1A1D23"}}>

      {/* Dark sidebar */}
      <aside style={{width:sidebarOpen?220:64,transition:"width .25s ease",background:"#13151A",borderRight:"1px solid #2D3139",display:"flex",flexDirection:"column",padding:"20px 12px",flexShrink:0,overflow:"hidden"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"4px 6px 20px",borderBottom:"1px solid #2D3139",marginBottom:12}}>
          <div style={{width:32,height:32,background:"#6C63FF",borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:14,fontFamily:"'Syne',sans-serif",fontWeight:700,flexShrink:0}}>E</div>
          {sidebarOpen&&<span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:15,whiteSpace:"nowrap",color:"#fff"}}>EduLearn</span>}
        </div>
        {sidebarOpen&&<div style={{margin:"0 6px 14px",padding:"6px 10px",background:"#6C63FF22",border:"1px solid #6C63FF44",borderRadius:8,fontSize:11,color:"#A5A0FF",fontWeight:600,display:"flex",alignItems:"center",gap:6}}><span style={{width:7,height:7,borderRadius:"50%",background:"#6C63FF",display:"inline-block"}}/> Super Admin</div>}
        <nav style={{flex:1,display:"flex",flexDirection:"column",gap:2}}>
          {navItems.map(item=>(
            <div key={item.id} className={`nav-item ${activeNav===item.id?"active":""}`} onClick={()=>setActiveNav(item.id)} style={{color:activeNav===item.id?"#fff":"#6B7280"}}>
              <span style={{fontSize:15,width:20,textAlign:"center"}}>{item.icon}</span>
              {sidebarOpen&&<span>{item.label}</span>}
            </div>
          ))}
        </nav>
        <div style={{borderTop:"1px solid #2D3139",paddingTop:14,display:"flex",alignItems:"center",gap:10,padding:"14px 6px 0"}}>
          <div style={{width:32,height:32,borderRadius:"50%",background:"#6C63FF",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:12,fontWeight:700,flexShrink:0}}>{user?.name?.slice(0,2).toUpperCase()||"AD"}</div>
          {sidebarOpen&&<div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:600,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user?.name||"Admin"}</div><div style={{fontSize:11,color:"#6B7280"}}>{user?.email}</div></div>}
          {sidebarOpen&&<button onClick={logout} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:"#6B7280",padding:4}} title="Logout">⏻</button>}
        </div>
      </aside>

      {/* Main */}
      <main style={{flex:1,overflow:"auto",padding:"28px 32px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:28}}>
          <div>
            <p style={{fontSize:12,color:"#9CA3AF",marginBottom:3}}>{new Date().toLocaleDateString("en-GB",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</p>
            <h1 style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:24,color:"#1A1D23",letterSpacing:"-.02em"}}>Admin Panel 🛡️</h1>
          </div>
          <div style={{display:"flex",gap:10}}>
            <button className="btn-sm" onClick={()=>setSidebarOpen(v=>!v)} style={{padding:"8px 12px"}}>☰</button>
            <button className="btn-sm" onClick={fetchPlatform} style={{padding:"8px 12px"}}>↻</button>
            <button className="btn-dark" style={{fontSize:12}}>⬇ Export</button>
            <button className="btn-primary" style={{fontSize:12}} onClick={()=>navigate("/admin/invite")}>+ Invite User</button>
          </div>
        </div>

        {error&&<div className="error-banner" style={{marginBottom:20}}>⚠ {error} <button onClick={fetchPlatform} style={{marginLeft:"auto",background:"none",border:"none",cursor:"pointer",color:"#DC2626",fontWeight:600,fontSize:12}}>Retry</button></div>}

        {/* Stats */}
        <div style={{display:"flex",gap:12,marginBottom:28,flexWrap:"wrap"}} className="fade-up">
          {statCards.map((s,i)=>(
            <div className="stat-card" key={i}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <p style={{fontSize:10,color:"#9CA3AF",marginBottom:6,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.06em",whiteSpace:"nowrap"}}>{s.label}</p>
                  {loading?<div className="skeleton" style={{height:26,width:60,marginBottom:6}}/>:<p style={{fontSize:22,fontWeight:700,fontFamily:"'Syne',sans-serif",color:"#1A1D23",lineHeight:1}}>{s.value}</p>}
                  <p style={{fontSize:11,color:"#6B7280",marginTop:5}}>{s.sub}</p>
                </div>
                <div style={{width:34,height:34,borderRadius:9,fontSize:14,background:s.accent+"15",display:"flex",alignItems:"center",justifyContent:"center",color:s.accent}}>{s.icon}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Grid */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:24}}>
          <div style={{display:"flex",flexDirection:"column",gap:24}}>

            {/* Analytics chart */}
            <div className="card" style={{padding:20}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <div>
                  <span className="section-title">{mc.label}</span>
                  <div style={{display:"flex",alignItems:"baseline",gap:6,marginTop:4}}>
                    {loading?<div className="skeleton" style={{height:28,width:80}}/>:<span style={{fontSize:28,fontWeight:700,fontFamily:"'Syne',sans-serif",color:mc.color}}>{mc.fmt(mc.data[mc.data.length-1])}</span>}
                    <span style={{fontSize:12,color:"#10B981",fontWeight:600}}>+{Math.round((mc.data[mc.data.length-1]-mc.data[mc.data.length-2])/(mc.data[mc.data.length-2]||1)*100)}% MoM</span>
                  </div>
                </div>
                <div style={{display:"flex",gap:6}}>
                  {Object.entries(metricCfg).map(([key,m])=>(
                    <button key={key} className={`tab ${chartMetric===key?"active":""}`} onClick={()=>setChartMetric(key)} style={{fontSize:11,padding:"5px 11px"}}>{m.label.split(" ")[0]}</button>
                  ))}
                </div>
              </div>
              <Bar data={mc.data} color={mc.color} height={100} labels={months}/>
            </div>

            {/* User management */}
            <div className="card" style={{padding:0,overflow:"hidden"}}>
              <div style={{padding:"16px 20px",borderBottom:"1px solid #F3F4F6",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
                <span className="section-title">User Management</span>
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                  <div className="search-wrap">
                    <span className="search-icon">⌕</span>
                    <input className="search-input" placeholder="Search users…" value={search} onChange={e=>setSearch(e.target.value)}/>
                  </div>
                  <div style={{display:"flex",gap:4}}>
                    {[["all","Tous"],["pending","En attente"],["teacher","Enseignants"],["student","Apprenants"]].map(([v,l])=>(
                      <button key={v} className={`tab ${userFilter===v?"active":""}`} onClick={()=>setUserFilter(v)} style={{fontSize:11,padding:"5px 11px"}}>{l}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="user-row" style={{background:"#FAFAFA",fontWeight:600,color:"#9CA3AF",fontSize:10,textTransform:"uppercase",letterSpacing:"0.05em",borderBottom:"1px solid #EAECF0",cursor:"default"}}>
                <span/><span>Name / Email</span><span>Role</span><span>Status</span><span>Joined</span><span>Actions</span>
              </div>
              {usersLoading ? [0,1,2,3].map(i=><div key={i} className="skeleton" style={{height:44,margin:"4px 16px",borderRadius:8}}/>) :
               users.length===0 ? <p style={{padding:24,textAlign:"center",fontSize:13,color:"#9CA3AF"}}>No users found.</p> :
               users.map(u=>{
                const rc=roleConfig[u.role]||roleConfig.student;
                const sc=statusConfig[u.status]||statusConfig.active;
                const initials=(u.name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
                return (
                  <div className="user-row" key={u._id}>
                    <div className="avatar" style={{background:avColor(u.name)}}>{initials}</div>
                    <div><p style={{fontWeight:600,fontSize:12,color:"#1A1D23",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.name}</p><p style={{fontSize:11,color:"#9CA3AF",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.email}</p></div>
                    <span className="badge" style={{background:rc.bg,color:rc.color}}>{rc.label}</span>
                    <span className="badge" style={{background:sc.bg,color:sc.color}}><span style={{width:5,height:5,borderRadius:"50%",background:sc.dot}}/>{sc.label}</span>
                    <span style={{color:"#6B7280",fontSize:11}}>{fmt(u.createdAt)}</span>
                    <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                      {u.status==="pending"&&<>
                        <button className="btn-sm" style={{color:"#065F46",borderColor:"#6EE7B7"}} onClick={()=>handleApprove(u._id)}>Accepter</button>
                        <button className="btn-danger" onClick={()=>handleReject(u._id)}>Refuser</button>
                      </>}
                      {u.role==="student"&&u.status==="active"&&(
                        <button className="btn-sm" style={{color:"#6366f1",borderColor:"#c7d2fe"}} onClick={()=>openEnrollModal(u._id,u.name)} title="Inscrire à un cours">+ Cours</button>
                      )}
                      {u.status!=="banned"&&u.status!=="pending"?<button className="btn-danger" onClick={()=>handleBan(u._id,u.status)}>Bannir</button>:null}
                      {u.status==="banned"?<button className="btn-sm" onClick={()=>handleBan(u._id,u.status)}>Restaurer</button>:null}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Settings */}
            <div className="card" style={{padding:20}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
                <span className="section-title">Platform Configuration</span>
                <button className="btn-primary" style={{fontSize:12,padding:"6px 14px",background:settingsSaved?"#10B981":"#6C63FF"}} onClick={saveSettings}>
                  {settingsSaved?"✓ Saved!":"Save Changes"}
                </button>
              </div>
              {platformDefaults.map((s,i)=>(
                <div key={s.key} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 0",borderBottom:i<platformDefaults.length-1?"1px solid #F3F4F6":"none"}}>
                  <div>
                    <p style={{fontSize:13,fontWeight:600,color:"#1A1D23"}}>{s.label}</p>
                    <p style={{fontSize:11,color:"#9CA3AF",marginTop:2}}>{s.desc}</p>
                  </div>
                  <Toggle checked={settings[s.key]} onChange={v=>setSettings(st=>({...st,[s.key]:v}))}/>
                </div>
              ))}
            </div>
          </div>

          {/* Right */}
          <div style={{display:"flex",flexDirection:"column",gap:16}}>

            {/* System health */}
            <div style={{background:"#13151A",borderRadius:14,border:"1px solid #2D3139",padding:18}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,color:"#fff"}}>System Health</span>
                <span style={{fontSize:10,background:"#10B98122",color:"#10B981",padding:"3px 8px",borderRadius:99,fontWeight:600}}>ALL OK</span>
              </div>
              {[
                {label:"API Uptime",    value:98,  unit:"% uptime", color:"#10B981"},
                {label:"DB Load",       value:34,  unit:"% used",   color:"#6C63FF"},
                {label:"Storage",       value:61,  unit:"% used",   color:"#F59E0B"},
                {label:"AI API Quota",  value:72,  unit:"% used",   color:"#0EA5E9"},
              ].map(m=>(
                <div key={m.label} style={{marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:5}}><span style={{color:"#9CA3AF"}}>{m.label}</span><span style={{color:"#fff",fontWeight:600}}>{m.value}{m.unit}</span></div>
                  <div style={{height:4,background:"#2D3139",borderRadius:99,overflow:"hidden"}}><div style={{height:"100%",width:m.value+"%",background:m.color,borderRadius:99,transition:"width .8s ease"}}/></div>
                </div>
              ))}
            </div>

            {/* User breakdown */}
            <div className="card" style={{padding:18}}>
              <span className="section-title" style={{fontSize:14,display:"block",marginBottom:14}}>User Breakdown</span>
              {loading ? <div className="skeleton" style={{height:80}}/> : (
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {[
                    {label:"Students",count:userStats?.students||0,color:"#6C63FF",total:userStats?.total||1},
                    {label:"Teachers",count:userStats?.teachers||0,color:"#10B981",total:userStats?.total||1},
                    {label:"En attente",count:userStats?.pending||0,color:"#6C63FF",total:userStats?.total||1},
                    {label:"Bannis",  count:userStats?.banned||0, color:"#EF4444",total:userStats?.total||1},
                  ].map(r=>(
                    <div key={r.label}>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}><span style={{color:"#4B5563",fontWeight:500}}>{r.label}</span><span style={{fontWeight:700,color:"#1A1D23"}}>{r.count}</span></div>
                      <div style={{height:5,background:"#F3F4F6",borderRadius:99,overflow:"hidden"}}><div style={{height:"100%",width:Math.round((r.count/r.total)*100)+"%",background:r.color,borderRadius:99,transition:"width .8s ease"}}/></div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick actions */}
            <div className="card" style={{padding:18}}>
              <span className="section-title" style={{fontSize:14,display:"block",marginBottom:12}}>Quick Actions</span>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <button className="btn-sm" style={{textAlign:"left",width:"100%",padding:"9px 12px",fontSize:12,borderRadius:8}} onClick={()=>navigate("/admin/communication")}>💬 Communication</button>
                {announceMsg&&<p style={{fontSize:11,color:"#10B981",marginTop:8}}>{announceMsg}</p>}
                <input className="search-input" style={{width:"100%",marginTop:10}} placeholder="Objet annonce" value={announce.subject} onChange={e=>setAnnounce(a=>({...a,subject:e.target.value}))}/>
                <textarea style={{width:"100%",marginTop:8,padding:8,borderRadius:8,border:"1px solid #EAECF0",fontSize:12,minHeight:60}} placeholder="Message" value={announce.body} onChange={e=>setAnnounce(a=>({...a,body:e.target.value}))}/>
                <select style={{width:"100%",marginTop:8,padding:8,borderRadius:8,border:"1px solid #EAECF0",fontSize:12}} value={announce.role} onChange={e=>setAnnounce(a=>({...a,role:e.target.value}))}>
                  <option value="all">Tous</option>
                  <option value="student">Apprenants</option>
                  <option value="teacher">Enseignants</option>
                </select>
                <button className="btn-primary" style={{width:"100%",marginTop:8,fontSize:12}} onClick={sendAnnouncement}>📧 Envoyer annonce</button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── Enroll Modal ── */}
      {enrollModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:"#fff",borderRadius:16,padding:24,width:"100%",maxWidth:460,boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div>
                <h3 style={{margin:0,fontSize:16,fontWeight:700,color:"#1A1D23"}}>Inscrire à un cours</h3>
                <p style={{margin:"4px 0 0",fontSize:12,color:"#9CA3AF"}}>Étudiant : <strong>{enrollModal.userName}</strong></p>
              </div>
              <button onClick={()=>setEnrollModal(null)} style={{border:"none",background:"#F3F4F6",width:32,height:32,borderRadius:8,cursor:"pointer",fontSize:18,color:"#6B7280"}}>×</button>
            </div>
            {teacherCourses.length === 0 ? (
              <p style={{fontSize:13,color:"#9CA3AF",textAlign:"center",padding:"20px 0"}}>Aucun cours disponible.</p>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:320,overflowY:"auto"}}>
                {teacherCourses.map(c => (
                  <div key={c._id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",border:"1px solid #EAECF0",borderRadius:10}}>
                    <div>
                      <p style={{fontSize:13,fontWeight:600,color:"#1A1D23",margin:0}}>{c.title}</p>
                      <p style={{fontSize:11,color:"#9CA3AF",margin:"2px 0 0"}}>{c.teacher?.name || "Enseignant"}</p>
                    </div>
                    <button
                      className="btn-primary"
                      style={{fontSize:11,padding:"5px 12px",background:"#6366f1",opacity:enrolling?0.6:1}}
                      disabled={enrolling}
                      onClick={()=>handleEnroll(c._id)}
                    >
                      {enrolling ? "…" : "+ Inscrire"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
