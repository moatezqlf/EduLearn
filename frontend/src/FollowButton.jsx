// ─────────────────────────────────────────────────────────────
//  FollowButton.jsx
//  Reusable button to follow/unfollow a teacher.
//
//  Props:
//    teacherId  (string)  — Mongo _id of the teacher
//    teacherName (string) — shown in aria-label
//
//  Usage:
//    <FollowButton teacherId={teacher._id} teacherName={teacher.name} />
// ─────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import api         from "./api";

export default function FollowButton({ teacherId, teacherName = "teacher" }) {
  const { user } = useAuth();

  const [following, setFollowing] = useState(false);
  const [loading,   setLoading]   = useState(true);

  // Only students can follow teachers
  const isStudent = user?.role === "student";

  // ── Fetch current follow status ───────────────────────────
  useEffect(() => {
    if (!isStudent || !teacherId) { setLoading(false); return; }

    api.teachers.followStatus(teacherId)
      .then(({ following: f }) => setFollowing(f))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [teacherId, isStudent]);

  // ── Toggle follow / unfollow ──────────────────────────────
  const toggle = async () => {
    if (loading) return;
    setLoading(true);
    try {
      if (following) {
        await api.teachers.unfollow(teacherId);
        setFollowing(false);
      } else {
        await api.teachers.follow(teacherId);
        setFollowing(true);
      }
    } catch (err) {
      alert(err.message || "Action failed");
    } finally {
      setLoading(false);
    }
  };

  // Don't render for teachers / admins
  if (!isStudent) return null;

  const label     = following ? "Following" : "Follow";
  const ariaLabel = following
    ? `Unfollow ${teacherName}`
    : `Follow ${teacherName}`;

  return (
    <button
      onClick={toggle}
      disabled={loading}
      aria-label={ariaLabel}
      style={{
        padding:      "6px 16px",
        borderRadius: 8,
        border:       following ? "1.5px solid #6366F1" : "none",
        background:   following ? "#fff"                : "#6366F1",
        color:        following ? "#6366F1"             : "#fff",
        fontWeight:   600,
        fontSize:     13,
        cursor:       loading ? "not-allowed" : "pointer",
        opacity:      loading ? 0.65          : 1,
        transition:   "all .15s",
        whiteSpace:   "nowrap",
      }}
    >
      {loading ? "…" : (following ? "✓ " + label : "+ " + label)}
    </button>
  );
}
