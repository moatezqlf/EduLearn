/** Affiche les groupes automatiques (max 4 apprenants). */
export default function GroupsPanel({ groups }) {
  if (!groups?.length) {
    return (
      <div style={st.empty}>
        Les groupes seront formés automatiquement au passage en phase « Feedback pairs » (max. 4 par groupe).
      </div>
    );
  }

  return (
    <div style={st.wrap}>
      <div style={st.title}>Groupes ({groups.length}) — max. 4 apprenants</div>
      <div style={st.grid}>
        {groups.map((g, gi) => (
          <div key={gi} style={st.groupCard}>
            <div style={st.groupHead}>Groupe {gi + 1}</div>
            <div style={st.members}>
              {(g.members || []).map((m, mi) => (
                <div key={m.id || mi} style={st.member}>
                  <span style={st.avatar}>{(m.name || "?")[0].toUpperCase()}</span>
                  <span style={st.name}>{m.name || "—"}</span>
                  {m.isReceiver && <span style={st.badge}>★ Receveur</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const st = {
  wrap: { marginTop: 20 },
  title: { fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 12 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 },
  groupCard: {
    background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14,
  },
  groupHead: { fontSize: 12, fontWeight: 700, color: "#6366f1", marginBottom: 10 },
  members: { display: "flex", flexDirection: "column", gap: 8 },
  member: { display: "flex", alignItems: "center", gap: 8, fontSize: 13 },
  avatar: {
    width: 28, height: 28, borderRadius: "50%", background: "#eef2ff", color: "#6366f1",
    display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12,
  },
  name: { flex: 1, color: "#334155", fontWeight: 500 },
  badge: {
    fontSize: 10, fontWeight: 700, color: "#059669", background: "#d1fae5",
    padding: "2px 8px", borderRadius: 99,
  },
  empty: {
    marginTop: 16, padding: 14, background: "#f8fafc", borderRadius: 10,
    fontSize: 13, color: "#64748b", lineHeight: 1.5, border: "1px dashed #e2e8f0",
  },
};
