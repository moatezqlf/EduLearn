// ─────────────────────────────────────────────────────────────
//  JoinSession.jsx  —  Landing page for /join/:code
//
//  When a student clicks a notification, they land here.
//  The page shows the join code and a "Join Now" button that
//  navigates to the existing StudentSession page with the
//  code pre-filled via router state.
// ─────────────────────────────────────────────────────────────
import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function JoinSession() {
  const { code }   = useParams();
  const navigate   = useNavigate();
  const { user }   = useAuth();

  // Auto-redirect non-students to login or unauthorized
  useEffect(() => {
    if (!user) {
      navigate("/login", { replace: true });
    } else if (user.role !== "student") {
      navigate("/unauthorized", { replace: true });
    }
  }, [user, navigate]);

  const handleJoin = () => {
    // Navigate to the existing StudentSession page and pass the code
    // so the session hook can auto-join without user typing it.
    navigate("/student/peer", { state: { joinCode: code } });
  };

  return (
    <div style={{
      minHeight:      "100vh",
      display:        "flex",
      flexDirection:  "column",
      alignItems:     "center",
      justifyContent: "center",
      background:     "#F7F8FC",
      fontFamily:     "sans-serif",
      gap:            20,
      padding:        24,
    }}>
      {/* Card */}
      <div style={{
        background:   "#fff",
        borderRadius: 16,
        padding:      "36px 40px",
        boxShadow:    "0 4px 24px rgba(0,0,0,.08)",
        textAlign:    "center",
        maxWidth:     440,
        width:        "100%",
      }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🎓</div>

        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#111827", marginBottom: 8 }}>
          You've been invited!
        </h2>

        <p style={{ fontSize: 14, color: "#6B7280", marginBottom: 24 }}>
          Your teacher started a live peer-feedback session. Use the code below to join.
        </p>

        {/* Join code chip */}
        <div style={{
          display:      "inline-block",
          background:   "#EEF2FF",
          color:        "#4F46E5",
          fontWeight:   800,
          fontSize:     28,
          letterSpacing: 6,
          borderRadius: 10,
          padding:      "10px 24px",
          marginBottom: 28,
          fontFamily:   "monospace",
        }}>
          {code}
        </div>

        <div>
          <button
            onClick={handleJoin}
            style={{
              width:        "100%",
              padding:      "12px 0",
              background:   "#6366F1",
              color:        "#fff",
              border:       "none",
              borderRadius: 10,
              fontSize:     15,
              fontWeight:   700,
              cursor:       "pointer",
              transition:   "background .15s",
            }}
            onMouseOver={e => e.currentTarget.style.background = "#4F46E5"}
            onMouseOut={e  => e.currentTarget.style.background = "#6366F1"}
          >
            Join Session →
          </button>

          <button
            onClick={() => navigate("/student")}
            style={{
              marginTop:    10,
              width:        "100%",
              padding:      "10px 0",
              background:   "none",
              border:       "1px solid #E5E7EB",
              borderRadius: 10,
              fontSize:     13,
              color:        "#6B7280",
              cursor:       "pointer",
            }}
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
