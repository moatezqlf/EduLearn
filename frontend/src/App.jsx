import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import { LanguageProvider } from "./i18n/LanguageContext";
import ProtectedRoute    from "./ProtectedRoute";
import LoginPage         from "./LoginPage";
import StudentDashboard  from "./StudentDashboard";
import TeacherDashboard  from "./TeacherDashboard";
import AdminDashboard    from "./AdminDashboard";
import AiFeedbackPanel   from "./AiFeedbackPanel";
import SubmitAssignment from "./SubmitAssignment";
import CreateCourse      from "./CreateCourse";
import CourseCatalog     from "./CourseCatalog";
import CreateAssignment from "./CreateAssignment";
import GradeSubmission from "./GradeSubmission";
import TeacherSession    from "./Teachersession";
import StudentSession    from "./Studentsession";
import JoinSession       from "./JoinSession";
import PendingPage       from "./PendingPage";
import Communication     from "./Communication";
import CourseDetail      from "./CourseDetail";

function UnauthorizedPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  return (
    <div style={{ display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#F7F8FC",fontFamily:"sans-serif",gap:16 }}>
      <div style={{ fontSize:48 }}>🚫</div>
      <h2 style={{ fontSize:22,fontWeight:700,color:"#1A1D23" }}>Access Denied</h2>
      <p style={{ fontSize:14,color:"#6B7280" }}>You don't have permission to view this page.</p>
      <div style={{ display:"flex",gap:10 }}>
        <button onClick={() => navigate(-1)} style={{ padding:"8px 18px",borderRadius:8,border:"1px solid #EAECF0",background:"#fff",cursor:"pointer",fontSize:13 }}>Go Back</button>
        {user && <button onClick={logout} style={{ padding:"8px 18px",borderRadius:8,border:"none",background:"#EF4444",color:"#fff",cursor:"pointer",fontSize:13 }}>Logout</button>}
      </div>
    </div>
  );
}

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  const map = { student:"/student", teacher:"/teacher", admin:"/admin" };
  return <Navigate to={map[user.role] || "/login"} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
      <AuthProvider>
        <Routes>
          <Route path="/login"        element={<LoginPage />} />
          <Route path="/pending"      element={<PendingPage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
          <Route path="/"             element={<RootRedirect />} />

          {/* Student */}
          <Route path="/student"                         element={<ProtectedRoute roles={["student"]}><StudentDashboard /></ProtectedRoute>} />
          <Route path="/student/catalog"                 element={<ProtectedRoute roles={["student"]}><CourseCatalog /></ProtectedRoute>} />
          <Route path="/student/courses/:courseId"      element={<ProtectedRoute roles={["student"]}><CourseDetail /></ProtectedRoute>} />
          <Route path="/student/communication"          element={<ProtectedRoute roles={["student"]}><Communication /></ProtectedRoute>} />
          <Route path="/student/submit"                  element={<ProtectedRoute roles={["student"]}><SubmitAssignment /></ProtectedRoute>} />
          <Route path="/student/feedback/:submissionId?" element={<ProtectedRoute roles={["student"]}><AiFeedbackPanel /></ProtectedRoute>} />
          <Route path="/student/peer"                    element={<ProtectedRoute roles={["student"]}><StudentSession /></ProtectedRoute>} />

          {/* Teacher */}
          <Route path="/teacher"                           element={<ProtectedRoute roles={["teacher"]}><TeacherDashboard /></ProtectedRoute>} />
          <Route path="/teacher/courses/new"               element={<ProtectedRoute roles={["teacher","admin"]}><CreateCourse /></ProtectedRoute>} />
          <Route path="/teacher/assignments/new"           element={<ProtectedRoute roles={["teacher","admin"]}><CreateAssignment /></ProtectedRoute>} />
          <Route path="/teacher/assignments/new/:courseId" element={<ProtectedRoute roles={["teacher","admin"]}><CreateAssignment /></ProtectedRoute>} />
          <Route path="/teacher/submissions/:submissionId" element={<ProtectedRoute roles={["teacher","admin"]}><GradeSubmission /></ProtectedRoute>} />
          <Route path="/teacher/feedback/:submissionId"    element={<ProtectedRoute roles={["teacher","admin"]}><AiFeedbackPanel /></ProtectedRoute>} />
          <Route path="/teacher/peer"                      element={<ProtectedRoute roles={["teacher","admin"]}><TeacherSession /></ProtectedRoute>} />
          <Route path="/teacher/courses/:courseId"        element={<ProtectedRoute roles={["teacher","admin"]}><CourseDetail /></ProtectedRoute>} />
          <Route path="/teacher/communication"             element={<ProtectedRoute roles={["teacher","admin"]}><Communication /></ProtectedRoute>} />

          {/* Join via notification link */}
          <Route path="/join/:code" element={<ProtectedRoute roles={["student"]}><JoinSession /></ProtectedRoute>} />

          {/* Admin */}
          <Route path="/admin" element={<ProtectedRoute roles={["admin"]}><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/communication" element={<ProtectedRoute roles={["admin"]}><Communication /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}