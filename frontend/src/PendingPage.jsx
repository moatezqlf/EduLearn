import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function PendingPage() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#F7F8FC", fontFamily: "'DM Sans', sans-serif", padding: 24,
    }}>
      <div style={{
        maxWidth: 440, background: "#fff", borderRadius: 16, padding: 32,
        border: "1px solid #EAECF0", textAlign: "center",
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1A1D23", marginBottom: 8 }}>
          Compte en attente
        </h1>
        <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.6, marginBottom: 20 }}>
          {user?.name ? `Bonjour ${user.name}, ` : ""}
          votre inscription a été enregistrée. Un administrateur doit valider votre compte
          avant que vous puissiez accéder à la plateforme.
        </p>
        <p style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 24 }}>{user?.email}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button
            onClick={() => navigate("/login")}
            style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid #EAECF0", background: "#fff", cursor: "pointer", fontSize: 13 }}
          >
            Retour connexion
          </button>
          <button
            onClick={logout}
            style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: "#6C63FF", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
          >
            Déconnexion
          </button>
        </div>
      </div>
    </div>
  );
}
