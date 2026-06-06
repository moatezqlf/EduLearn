// ─────────────────────────────────────────────────────────────
//  ProtectedRoute.jsx  —  Role-based route guard
// ─────────────────────────────────────────────────────────────
// import { Navigate, useLocation } from "react-router-dom";
// import { useAuth } from "./AuthContext";

// export default function ProtectedRoute({ children, roles = [] }) {
//   const { user, loading } = useAuth();
//   const location = useLocation();

//   if (loading) return <FullScreenSpinner />;

//   if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

//   if (roles.length && !roles.includes(user.role))
//     return <Navigate to="/unauthorized" replace />;

//   return children;
// }

// function FullScreenSpinner() {
//   return (
//     <div style={{
//       display: "flex", alignItems: "center", justifyContent: "center",
//       minHeight: "100vh", background: "#F7F8FC",
//     }}>
//       <div style={{
//         width: 36, height: 36,
//         border: "3px solid #E5E7EB",
//         borderTopColor: "#6C63FF",
//         borderRadius: "50%",
//         animation: "spin 0.8s linear infinite",
//       }} />
//       <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
//     </div>
//   );
// }


import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function ProtectedRoute({ children, roles = [] }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh", background:"#F7F8FC" }}>
      <div style={{ width:36, height:36, border:"3px solid #E5E7EB", borderTopColor:"#6C63FF", borderRadius:"50%", animation:"spin 0.8s linear infinite" }}/>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  if (user.status === "pending") return <Navigate to="/pending" replace />;

  const userRole = Array.isArray(user.role) ? user.role[0] : user.role;
if (roles.length && !roles.includes(userRole)) {
    console.log("Role mismatch:", user.role, "expected:", roles);
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}