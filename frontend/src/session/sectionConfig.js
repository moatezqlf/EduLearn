/** Niveaux de difficulté IMRAD (image 2) */
export const SECTION_LEVELS = {
  simple: {
    id: "simple",
    label: "Niveau 1 — Simple",
    color: "#22c55e",
    bg: "#ecfdf5",
    border: "#86efac",
    sections: ["Titre", "Abstract", "Conclusion"],
    methods: [
      { label: "Génération directe", desc: "Production guidée par prompt" },
      { label: "Prompt synthèse", desc: "Résumé et reformulation" },
      { label: "Éval. reformulation", desc: "Évaluation de la reformulation" },
    ],
  },
  intermediate: {
    id: "intermediate",
    label: "Niveau 2 — Intermédiaire",
    color: "#8b5cf6",
    bg: "#f5f3ff",
    border: "#c4b5fd",
    sections: ["Introduction", "Résultats"],
    methods: [
      { label: "Questions socratiques", desc: "Questionnement guidé" },
      { label: "Analyse contextuelle", desc: "Mise en contexte approfondie" },
      { label: "Éval. cohérence", desc: "Évaluation de la cohérence" },
    ],
  },
  complex: {
    id: "complex",
    label: "Niveau 3 — Complexe",
    color: "#f97316",
    bg: "#fff7ed",
    border: "#fdba74",
    sections: ["Méthodes", "Discussion"],
    methods: [
      { label: "Scaffold progressif", desc: "Échafaudage étape par étape" },
      { label: "Indices adaptatifs", desc: "Aide contextuelle personnalisée" },
      { label: "Éval. raisonnement", desc: "Évaluation du raisonnement scientifique" },
    ],
  },
};

/** Retourne le niveau d'une section (article scientifique) */
export function getSectionLevel(sectionName) {
  for (const [key, level] of Object.entries(SECTION_LEVELS)) {
    if (level.sections.includes(sectionName)) return key;
  }
  return null;
}

/** Spécialités / domaines pour inscription étudiant */
export const SPECIALITES = [
  "Informatique / IT",
  "Sciences de la Vie / Biologie",
  "Médecine / Santé",
  "Chimie",
  "Physique",
  "Mathématiques",
  "Économie / Gestion",
  "Droit",
  "Lettres / Langues",
  "Sciences Humaines / Social",
  "Ingénierie",
  "Sciences de l'Éducation",
  "Autre",
];

/** Workflow pédagogique enseignant → étudiant (image 3) */
export const LEARNING_WORKFLOW = [
  {
    step: 1,
    label: "Lecture de l'article",
    desc: "Les apprenants lisent un exemple d'article complet",
    icon: "📖",
    phase: "reading",
  },
  {
    step: 2,
    label: "Section à apprendre",
    desc: "Les apprenants complètent la section manquante choisie",
    icon: "✍️",
    phase: "writing",
  },
];
