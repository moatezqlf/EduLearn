/** Phases alignées sur le backend Socket (phase_changed). */
export const STUDENT_PHASES = [
  { key: "waiting", label: "Attente" },
  { key: "writing", label: "Rédaction" },
  { key: "review", label: "Feedback pairs" },
  { key: "ai", label: "Évaluation IA" },
  { key: "results", label: "Résultats" },
];

export const TEACHER_LIVE_PHASES = [
  { key: "writing", label: "Rédaction", icon: "✍️", desc: "Les étudiants rédigent la section manquante" },
  { key: "review", label: "Feedback pairs", icon: "👥", desc: "Relecture par les pairs (groupes ≤ 4)" },
  { key: "ai", label: "Évaluation IA", icon: "🤖", desc: "Analyse automatique des productions" },
  { key: "results", label: "Résultats", icon: "📊", desc: "Synthèse et meilleure réponse" },
];

export function phaseIndex(phases, currentKey) {
  const i = phases.findIndex(p => p.key === currentKey);
  return i >= 0 ? i : 0;
}

export const PEER_CRITERIA = [
  { id: "clarity", label: "Clarté", emoji: "💡" },
  { id: "structure", label: "Structure", emoji: "🏗️" },
  { id: "argumentation", label: "Argumentation", emoji: "📣" },
  { id: "scientific", label: "Précision scientifique", emoji: "🔬" },
];
