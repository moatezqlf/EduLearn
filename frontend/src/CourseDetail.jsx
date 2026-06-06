import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "./AuthContext";
import api from "./api";

const API_ORIGIN = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/\/api\/?$/, "");

export default function CourseDetail() {
  const { courseId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [modules, setModules] = useState([]);
  const [enrolled, setEnrolled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploadModule, setUploadModule] = useState("");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadFile, setUploadFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const isTeacher = user?.role === "teacher" || user?.role === "admin";
  const back = user?.role === "teacher" ? "/teacher" : "/student";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, mRes, eRes] = await Promise.all([
        api.courses.getById(courseId),
        api.courses.getModules(courseId),
        user?.role === "student" ? api.courses.getEnrolled() : Promise.resolve({ courses: [] }),
      ]);
      setCourse(cRes.course);
      setModules(mRes.modules || cRes.course?.modules || []);
      setEnrolled((eRes.courses || []).some(c => c._id === courseId));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [courseId, user?.role]);

  useEffect(() => { load(); }, [load]);

  const handleUnenroll = async () => {
    if (!confirm("Se désinscrire de ce cours ?")) return;
    try {
      await api.courses.unenroll(courseId);
      setEnrolled(false);
    } catch (e) { setError(e.message); }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!uploadModule || !uploadFile) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", uploadFile);
      fd.append("title", uploadTitle || uploadFile.name);
      await api.courses.addResource(courseId, uploadModule, fd);
      setUploadFile(null);
      setUploadTitle("");
      await load();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}>Chargement…</div>;

  return (
    <div style={{ minHeight: "100vh", background: "#F7F8FC", fontFamily: "'DM Sans', sans-serif", padding: 32 }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <button onClick={() => navigate(back)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", marginBottom: 16 }}>← Retour</button>

        {error && <div style={{ background: "#FEF2F2", color: "#DC2626", padding: 12, borderRadius: 8, marginBottom: 16 }}>{error}</div>}

        <div style={{ background: "#fff", borderRadius: 14, padding: 24, border: "1px solid #EAECF0", marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>{course?.title}</h1>
          <p style={{ color: "#6B7280", fontSize: 14, lineHeight: 1.6 }}>{course?.description}</p>
          <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 12 }}>
            Enseignant : {course?.teacher?.name || "—"} · {course?.category} · {course?.level}
          </p>
          {user?.role === "student" && enrolled && (
            <button onClick={handleUnenroll} style={{ marginTop: 16, padding: "8px 14px", borderRadius: 8, border: "1px solid #FECACA", background: "#FEF2F2", color: "#DC2626", cursor: "pointer", fontSize: 12 }}>
              Se désinscrire
            </button>
          )}
        </div>

        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Ressources pédagogiques</h2>

        {modules.length === 0 ? (
          <p style={{ color: "#9CA3AF" }}>Aucun module pour ce cours.</p>
        ) : modules.map((mod, i) => (
          <div key={mod._id || i} style={{ background: "#fff", borderRadius: 12, padding: 18, border: "1px solid #EAECF0", marginBottom: 12 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{mod.title}</h3>
            {mod.description && <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 10 }}>{mod.description}</p>}
            {mod.videoUrl && (
              <a href={mod.videoUrl.startsWith("http") ? mod.videoUrl : `${API_ORIGIN}${mod.videoUrl}`} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "#6C63FF" }}>
                ▶ Vidéo
              </a>
            )}
            {(mod.resources || []).length > 0 && (
              <ul style={{ marginTop: 12, paddingLeft: 18 }}>
                {mod.resources.map((r, j) => (
                  <li key={j} style={{ marginBottom: 6 }}>
                    <a href={r.url?.startsWith("http") ? r.url : `${API_ORIGIN}${r.url}`} target="_blank" rel="noreferrer" download style={{ fontSize: 13, color: "#0EA5E9" }}>
                      📎 {r.title || "Télécharger"}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {isTeacher && (
          <form onSubmit={handleUpload} style={{ background: "#fff", borderRadius: 12, padding: 20, border: "1px solid #EAECF0", marginTop: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Publier une ressource</h3>
            <select value={uploadModule} onChange={e => setUploadModule(e.target.value)} required style={{ width: "100%", padding: 10, marginBottom: 10, borderRadius: 8, border: "1px solid #EAECF0" }}>
              <option value="">Choisir un module</option>
              {modules.map((m, i) => <option key={m._id || i} value={m._id}>{m.title}</option>)}
            </select>
            <input placeholder="Titre du document" value={uploadTitle} onChange={e => setUploadTitle(e.target.value)} style={{ width: "100%", padding: 10, marginBottom: 10, borderRadius: 8, border: "1px solid #EAECF0" }} />
            <input type="file" onChange={e => setUploadFile(e.target.files?.[0])} required style={{ marginBottom: 12 }} />
            <button type="submit" disabled={busy} style={{ padding: "10px 18px", background: "#6C63FF", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
              {busy ? "Envoi…" : "Publier"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
