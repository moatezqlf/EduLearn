import { useState } from "react";

export default function SpecialtyGroupsPanel({ groups, loading, totalStudents, pendingCount = 0, onRefresh }) {
  const [open, setOpen] = useState(false);
  const [selectedSpeciality, setSelectedSpeciality] = useState(null);

  const total = totalStudents ?? groups?.reduce((s, g) => s + (g.count || 0), 0) ?? 0;

  return (
    <div style={{ marginTop: 8 }}>
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "9px 14px", borderRadius: 10,
          border: `1.5px solid ${open ? "#8b5cf6" : "#e2e8f0"}`,
          background: open ? "#f5f3ff" : "#fafafa",
          cursor: "pointer", fontFamily: "inherit", transition: "all .15s",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 15 }}>👥</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>Consulter les groupes</span>
          {!loading && total > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "#8b5cf6", padding: "1px 8px", borderRadius: 999 }}>
              {total} étudiant{total > 1 ? "s" : ""}
            </span>
          )}
          {loading && <span style={{ fontSize: 11, color: "#94a3b8" }}>Chargement…</span>}
          {pendingCount > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, color: "#d97706", background: "#fffbeb", border: "1px solid #fde68a", padding: "1px 7px", borderRadius: 999 }}>
              ⏳ {pendingCount}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {onRefresh && open && (
            <span
              title="Actualiser"
              onClick={e => { e.stopPropagation(); onRefresh(); }}
              style={{ fontSize: 13, color: "#6366f1", cursor: "pointer", padding: "2px 6px", borderRadius: 6, background: "#eef2ff" }}
            >↻</span>
          )}
          <span style={{ fontSize: 9, color: "#94a3b8", display: "inline-block", transition: "transform .2s", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
        </div>
      </button>

      {/* Expanded content */}
      {open && (
        <div style={{ marginTop: 8, border: "1.5px solid #e9d5ff", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 16 }}>
              <div style={st.spinner} />
              <span style={{ fontSize: 13, color: "#64748b" }}>Chargement des groupes…</span>
            </div>
          ) : !groups?.length ? (
            <div style={{ padding: "20px 16px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
              Aucun étudiant inscrit à vos cours pour le moment.
            </div>
          ) : (
            <>
              {pendingCount > 0 && (
                <div style={{ padding: "8px 14px", background: "#fffbeb", borderBottom: "1px solid #fde68a", fontSize: 12, color: "#92400e" }}>
                  ⚠️ <strong>{pendingCount} étudiant{pendingCount > 1 ? "s" : ""} en attente d'approbation</strong>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: 260 }}>
                {/* Left — specialty list */}
                <div style={{ padding: 14, borderRight: "1px solid #f1f5f9" }}>
                  <div style={st.colLabel}>Domaine</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {groups.map(g => (
                      <button
                        key={g.specialite}
                        type="button"
                        onClick={() => setSelectedSpeciality(g.specialite)}
                        style={{
                          padding: "10px 12px", border: "1.5px solid",
                          borderColor: selectedSpeciality === g.specialite ? "#8b5cf6" : "#e2e8f0",
                          background: selectedSpeciality === g.specialite ? "#f5f3ff" : "#fff",
                          borderRadius: 9, textAlign: "left", cursor: "pointer", transition: "all .15s",
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>{g.specialite}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                          {g.count} étudiant{g.count > 1 ? "s" : ""}
                          {g.activeCount < g.count && ` · ⏳ ${g.count - g.activeCount}`}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Right — selected group */}
                <div style={{ padding: 14 }}>
                  {selectedSpeciality ? (() => {
                    const g = groups.find(x => x.specialite === selectedSpeciality);
                    if (!g) return null;
                    return (
                      <>
                        <div style={st.colLabel}>{g.specialite}</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                          <div style={st.stat}><span style={st.statV}>{g.count}</span><span style={st.statL}>Inscrits</span></div>
                          {g.activeCount < g.count && (
                            <div style={st.stat}><span style={{ ...st.statV, color: "#d97706" }}>{g.count - g.activeCount}</span><span style={st.statL}>En attente</span></div>
                          )}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" }}>
                          {(g.students || []).map(s => (
                            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ width: 28, height: 28, borderRadius: "50%", background: s.pending ? "#fef3c7" : "#eef2ff", color: s.pending ? "#d97706" : "#6366f1", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 11, flexShrink: 0 }}>
                                {(s.name || "?")[0].toUpperCase()}
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 500, color: s.pending ? "#94a3b8" : "#334155" }}>
                                {s.name}{s.pending && <span style={{ fontSize: 10, color: "#d97706", marginLeft: 4 }}>⏳</span>}
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    );
                  })() : (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "#94a3b8", fontSize: 13 }}>
                      <span style={{ fontSize: 24, marginBottom: 6 }}>👈</span>
                      Sélectionnez un domaine
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const st = {
  spinner:  { width: 16, height: 16, border: "2px solid #e2e8f0", borderTopColor: "#6366f1", borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 },
  colLabel: { fontSize: 11, fontWeight: 800, color: "#8b5cf6", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 },
  stat:     { background: "#f8fafc", borderRadius: 9, padding: "10px 8px", textAlign: "center", border: "1px solid #e2e8f0" },
  statV:    { display: "block", fontSize: 18, fontWeight: 700, color: "#6366f1", marginBottom: 2 },
  statL:    { display: "block", fontSize: 10, color: "#94a3b8", fontWeight: 600 },
};
