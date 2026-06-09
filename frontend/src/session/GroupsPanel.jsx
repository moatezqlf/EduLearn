const ANON_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#0ea5e9", "#14b8a6", "#f59e0b"];

export default function GroupsPanel({ groups }) {
  if (!groups?.length) {
    return (
      <div style={st.empty}>
        <span style={{ fontSize: 20, marginRight: 8 }}>⏳</span>
        Les groupes se forment automatiquement au passage en phase « Feedback pairs ».
      </div>
    );
  }

  // Build a flat anonymous index across all groups so names stay consistent
  let globalIdx = 0;

  return (
    <div style={st.wrap}>
      <div style={st.header}>
        <span style={st.title}>👥 Groupes ({groups.length})</span>
        <span style={st.subtitle}>max. 4 apprenants · anonymisé</span>
      </div>
      <div style={st.grid}>
        {groups.map((g, gi) => {
          const members = g.members || [];
          return (
            <div key={gi} style={st.groupCard}>
              <div style={st.groupHead}>
                <div style={{ ...st.groupBadge, background: ANON_COLORS[gi % ANON_COLORS.length] + "1a", color: ANON_COLORS[gi % ANON_COLORS.length], border: `1px solid ${ANON_COLORS[gi % ANON_COLORS.length]}40` }}>
                  Groupe {gi + 1}
                </div>
                <span style={st.memberCount}>{members.length} membres</span>
              </div>
              <div style={st.members}>
                {members.map((m, mi) => {
                  const idx = globalIdx++;
                  const color = ANON_COLORS[idx % ANON_COLORS.length];
                  return (
                    <div key={m.id || mi} style={st.member}>
                      <div style={{ ...st.avatar, background: color + "18", color }}>
                        {String.fromCharCode(65 + idx)}
                      </div>
                      <span style={st.anonName}>Apprenant {String.fromCharCode(65 + idx)}</span>
                      {m.isReceiver && (
                        <span style={st.receiverBadge}>★ Receveur</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const st = {
  wrap: { marginTop: 20 },
  header: { display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 },
  title: { fontSize: 14, fontWeight: 800, color: "#0f172a" },
  subtitle: { fontSize: 11, color: "#94a3b8", fontWeight: 500 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 },
  groupCard: {
    background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 14px",
    boxShadow: "0 1px 3px rgba(0,0,0,.05)",
  },
  groupHead: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  groupBadge: { fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 999 },
  memberCount: { fontSize: 10, color: "#94a3b8", fontWeight: 600 },
  members: { display: "flex", flexDirection: "column", gap: 7 },
  member: { display: "flex", alignItems: "center", gap: 8 },
  avatar: {
    width: 28, height: 28, borderRadius: "50%",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: 800, fontSize: 12, flexShrink: 0,
  },
  anonName: { flex: 1, color: "#374151", fontWeight: 600, fontSize: 12 },
  receiverBadge: {
    fontSize: 9, fontWeight: 700, color: "#059669", background: "#d1fae5",
    padding: "2px 7px", borderRadius: 999, whiteSpace: "nowrap",
  },
  empty: {
    marginTop: 16, padding: "12px 14px", background: "#f8fafc", borderRadius: 10,
    fontSize: 13, color: "#64748b", lineHeight: 1.5, border: "1px dashed #e2e8f0",
    display: "flex", alignItems: "center",
  },
};
