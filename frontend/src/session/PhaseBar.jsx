import { phaseIndex } from "./sessionPhases";

/**
 * Barre de progression des phases (lecture seule pour l'étudiant).
 */
export default function PhaseBar({ phases, currentPhase, readonly = true }) {
  const active = phaseIndex(phases, currentPhase);

  return (
    <div style={barStyles.wrap}>
      {phases.map((p, i) => {
        const done = i < active;
        const current = i === active;
        const clickable = !readonly && i <= active;
        return (
          <div key={p.key} style={barStyles.item}>
            <div
              style={{
                ...barStyles.pill,
                background: done ? "#D1FAE5" : current ? "#EEF2FF" : "#F9FAFB",
                color: done ? "#065F46" : current ? "#4F46E5" : "#9CA3AF",
                borderColor: current ? "#C7D2FB" : done ? "#6EE7B7" : "#EAECF0",
                fontWeight: current ? 600 : 500,
                cursor: clickable ? "pointer" : "default",
              }}
              title={p.desc || p.label}
            >
              {done ? "✓" : i + 1} {p.label}
            </div>
            {i < phases.length - 1 && (
              <div
                style={{
                  ...barStyles.connector,
                  background: done ? "#6C63FF" : "#EAECF0",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

const barStyles = {
  wrap: {
    display: "flex",
    alignItems: "center",
    gap: 0,
    marginBottom: 20,
    flexWrap: "wrap",
  },
  item: {
    display: "flex",
    alignItems: "center",
    flex: "1 1 auto",
    minWidth: 0,
  },
  pill: {
    flex: 1,
    padding: "8px 6px",
    borderRadius: 9,
    border: "1px solid",
    fontSize: 11,
    textAlign: "center",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    transition: "all 0.15s",
  },
  connector: {
    width: 12,
    height: 2,
    flexShrink: 0,
    margin: "0 2px",
  },
};
