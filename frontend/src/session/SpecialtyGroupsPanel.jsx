import { useState } from "react";

/** Liste des groupes d'étudiants par spécialité avec nouveau design (enseignants). */
export default function SpecialtyGroupsPanel({ groups, loading, totalStudents, pendingCount = 0, onRefresh }) {
  const [showGroups, setShowGroups] = useState(false);
  const [selectedSpeciality, setSelectedSpeciality] = useState(null);

  if (loading) {
    return (
      <div style={st.loadingRow}>
        <div style={st.spinner} />
        <span style={{ fontSize: 13, color: "#64748b" }}>Chargement des groupes…</span>
      </div>
    );
  }

  if (!groups?.length) {
    return (
      <div style={st.emptyBox}>
        <span style={{ fontSize: 28, display: "block", marginBottom: 8 }}>👥</span>
        <strong style={{ fontSize: 13, color: "#374151" }}>Aucun étudiant inscrit à vos cours</strong>
        <p style={{ fontSize: 12, color: "#94a3b8", margin: "4px 0 10px" }}>
          Les groupes par spécialité apparaîtront ici dès qu&apos;ils s&apos;inscriront.
        </p>
        {onRefresh && (
          <button type="button" onClick={onRefresh} style={st.refreshBtn}>↻ Actualiser</button>
        )}
      </div>
    );
  }

  // If not showing groups yet, show initial button
  if (!showGroups) {
    return (
      <div style={st.wrap}>
        <div style={st.initialContainer}>
          <div style={st.initialContent}>
            <span style={st.initialIcon}>👥</span>
            <h3 style={st.initialTitle}>Consulter les groupes</h3>
            <p style={st.initialDesc}>
              {totalStudents} étudiant{totalStudents !== 1 ? "s" : ""} inscrits
              {pendingCount > 0 && ` · ${pendingCount} en attente`}
            </p>
            <button 
              type="button" 
              onClick={() => setShowGroups(true)} 
              style={st.consultBtn}
            >
              Consulter les groupes →
            </button>
            {onRefresh && (
              <button type="button" onClick={onRefresh} style={st.refreshBtnSmall}>
                ↻ Actualiser
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Show specialties and selected group
  const selectedGroup = selectedSpeciality 
    ? groups.find(g => g.specialite === selectedSpeciality) 
    : null;

  return (
    <div style={st.wrap}>
      <div style={st.headerRow}>
        <button 
          type="button" 
          onClick={() => setShowGroups(false)}
          style={st.backBtn}
          title="Retour"
        >
          ← Retour
        </button>
        <div style={st.title}>
          Groupes par spécialité ({groups.length})
        </div>
        {onRefresh && (
          <button type="button" onClick={onRefresh} style={st.refreshBtn} title="Actualiser les groupes">
            ↻ Actualiser
          </button>
        )}
      </div>

      {pendingCount > 0 && (
        <div style={st.pendingWarning}>
          ⚠️ <strong>{pendingCount} étudiant{pendingCount > 1 ? "s" : ""} en attente d'approbation</strong>
        </div>
      )}

      <div style={st.twoColumnLayout}>
        {/* Left: Specialty list */}
        <div style={st.specialtyList}>
          <h4 style={st.columnTitle}>Choisir un domaine</h4>
          <div style={st.specialtyGrid}>
            {groups.map(g => (
              <button
                key={g.specialite}
                type="button"
                onClick={() => setSelectedSpeciality(g.specialite)}
                style={{
                  ...st.specialtyCard,
                  ...(selectedSpeciality === g.specialite ? st.specialtyCardActive : {}),
                }}
              >
                <div style={st.specialtyName}>{g.specialite}</div>
                <div style={st.specialtyCount}>{g.count} étudiant{g.count > 1 ? "s" : ""}</div>
                {g.activeCount < g.count && (
                  <div style={st.pendingCountSmall}>⏳ {g.count - g.activeCount} en attente</div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Selected group details */}
        <div style={st.groupDetails}>
          {selectedGroup ? (
            <>
              <h4 style={st.columnTitle}>{selectedGroup.specialite}</h4>
              <div style={st.groupStatsRow}>
                <div style={st.groupStat}>
                  <span style={st.statValue}>{selectedGroup.count}</span>
                  <span style={st.statLabel}>Inscrits</span>
                </div>
                {selectedGroup.activeCount < selectedGroup.count && (
                  <div style={st.groupStat}>
                    <span style={st.statValue}>{selectedGroup.count - selectedGroup.activeCount}</span>
                    <span style={st.statLabel}>En attente</span>
                  </div>
                )}
              </div>
              <div style={st.membersList}>
                {(selectedGroup.students || []).map(s => (
                  <div key={s.id} style={st.memberItem}>
                    <span 
                      style={{ 
                        ...st.memberAvatar, 
                        opacity: s.pending ? 0.5 : 1, 
                        background: s.pending ? "#fef3c7" : "#eef2ff", 
                        color: s.pending ? "#d97706" : "#6366f1" 
                      }}
                    >
                      {(s.name || "?")[0].toUpperCase()}
                    </span>
                    <span style={{ ...st.memberName, color: s.pending ? "#94a3b8" : "#334155" }}>
                      {s.name}
                      {s.pending && <span style={{ fontSize: 10, color: "#d97706", marginLeft: 4 }}>⏳</span>}
                    </span>
                  </div>
                ))}
                {selectedGroup.count > selectedGroup.students?.length && (
                  <div style={st.moreInfo}>
                    + {selectedGroup.count - (selectedGroup.students?.length || 0)} autre{selectedGroup.count - (selectedGroup.students?.length || 0) > 1 ? "s" : ""}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={st.emptySelection}>
              <span style={{ fontSize: 28, display: "block", marginBottom: 8 }}>👈</span>
              <p style={{ color: "#94a3b8" }}>Sélectionnez un domaine pour voir les étudiants</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const st = {
  wrap:                { marginTop: 8 },
  headerRow:           { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 10 },
  backBtn:             { padding: "5px 12px", border: "1px solid #e2e8f0", background: "#fff", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#6366f1", flexShrink: 0 },
  title:               { fontSize: 14, fontWeight: 700, color: "#0f172a", flex: 1 },
  pendingBadge:        { fontSize: 11, fontWeight: 600, background: "#fef3c7", color: "#d97706", padding: "2px 8px", borderRadius: 99, border: "1px solid #fde68a" },
  pendingWarning:      { padding: "9px 13px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, fontSize: 12, color: "#92400e", marginBottom: 12, lineHeight: 1.55 },

  // Initial state - before consulting
  initialContainer:    { padding: 40, textAlign: "center", background: "#f8f7ff", borderRadius: 16, border: "2px solid #e9d5ff" },
  initialContent:      { maxWidth: 320, margin: "0 auto" },
  initialIcon:         { display: "block", fontSize: 48, marginBottom: 16 },
  initialTitle:        { fontSize: 18, fontWeight: 700, color: "#1e1b4b", marginBottom: 8 },
  initialDesc:         { fontSize: 13, color: "#64748b", marginBottom: 16, lineHeight: 1.5 },
  consultBtn:          { width: "100%", padding: "12px 20px", background: "#8b5cf6", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", marginBottom: 10 },
  refreshBtnSmall:     { width: "100%", padding: "8px 16px", background: "transparent", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#64748b" },

  // Two column layout
  twoColumnLayout:     { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, minHeight: 400 },
  specialtyList:       { display: "flex", flexDirection: "column" },
  columnTitle:         { fontSize: 13, fontWeight: 700, color: "#6366f1", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12, margin: "0 0 12px 0" },
  specialtyGrid:       { display: "grid", gridTemplateColumns: "1fr", gap: 8 },
  specialtyCard:       { 
    padding: "14px 16px", 
    border: "2px solid #e2e8f0", 
    background: "#fff", 
    borderRadius: 10, 
    textAlign: "left", 
    cursor: "pointer", 
    transition: "all 0.2s",
    fontSize: 13,
    fontWeight: 600,
  },
  specialtyCardActive: { 
    borderColor: "#8b5cf6", 
    background: "#f5f3ff", 
    boxShadow: "0 2px 8px rgba(139, 92, 246, 0.15)"
  },
  specialtyName:       { fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 4 },
  specialtyCount:      { fontSize: 12, color: "#94a3b8" },
  pendingCountSmall:   { fontSize: 11, color: "#d97706", marginTop: 4, fontWeight: 600 },

  // Group details - right column
  groupDetails:        { display: "flex", flexDirection: "column", borderLeft: "2px solid #e2e8f0", paddingLeft: 24 },
  groupStatsRow:       { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 },
  groupStat:           { background: "#f8fafc", borderRadius: 10, padding: 12, textAlign: "center", border: "1px solid #e2e8f0" },
  statValue:           { display: "block", fontSize: 20, fontWeight: 700, color: "#6366f1", marginBottom: 4 },
  statLabel:           { display: "block", fontSize: 11, color: "#94a3b8", fontWeight: 600 },

  membersList:         { display: "flex", flexDirection: "column", gap: 8, flex: 1, overflowY: "auto" },
  memberItem:          { display: "flex", alignItems: "center", gap: 10, padding: "8px 0" },
  memberAvatar:        { width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, flexShrink: 0 },
  memberName:          { fontSize: 13, fontWeight: 500 },
  moreInfo:            { fontSize: 12, color: "#94a3b8", marginTop: 8, padding: "8px 0", borderTop: "1px solid #e2e8f0" },

  emptySelection:      { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "#94a3b8" },

  // Existing styles
  refreshBtn:          { padding: "5px 12px", border: "1px solid #e2e8f0", background: "#fff", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#6366f1", flexShrink: 0 },
  loadingRow:          { display: "flex", alignItems: "center", gap: 10, padding: 14, background: "#f8fafc", borderRadius: 10, border: "1px dashed #e2e8f0" },
  spinner:             { width: 16, height: 16, border: "2px solid #e2e8f0", borderTopColor: "#6366f1", borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 },
  emptyBox:            { padding: 20, background: "#f8fafc", borderRadius: 10, fontSize: 13, color: "#64748b", border: "1px dashed #e2e8f0", textAlign: "center" },
};
