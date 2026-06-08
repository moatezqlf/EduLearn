// ============================================================================
// PROMPT BUILDERS — VERSION AMÉLIORÉE (sessions d'écriture scientifique)
// ============================================================================

/**
 * 1. Évaluation de la qualité du feedback pair (Peer Review Quality)
 */
export function buildFeedbackQualityPrompt({
  sectionKey,
  ratings = {},
  comment = "",
  reviewedAnswer = "",
  criteria = [],
  language = "FR",
}) {
  const effectiveCriteria =
    criteria.length > 0
      ? criteria
      : ["Spécificité", "Actionnabilité", "Équité / Objectivité", "Pertinence"];

  const criteriaBlock = effectiveCriteria
    .map((c, i) => `  ${i + 1}. ${c}`)
    .join("\n");

  return `<role>
Tu es un expert en pédagogie universitaire spécialisé dans la méta-évaluation du feedback par les pairs. Tu évalues si un feedback donné par un étudiant est utile, précis et constructif.
</role>

<context>
- Section évaluée : "${sectionKey}"
- Langue de réponse : ${language}
</context>

<original_answer>
${reviewedAnswer || "[Aucune réponse fournie]"}
</original_answer>

<peer_feedback>
Notations données par le pair : ${JSON.stringify(ratings, null, 2)}

Commentaire du pair :
"${comment || "[Aucun commentaire]"}"
</peer_feedback>

<task>
Évalue la QUALITÉ du feedback ci-dessus (pas la réponse originale) selon ces critères, chacun noté de 0 à 5 :

${criteriaBlock}

PROCESSUS À SUIVRE :
1. Lis d'abord la réponse originale pour comprendre le contexte.
2. Analyse le feedback du pair : est-il spécifique ? Donne-t-il des pistes concrètes ?
3. Identifie les forces et faiblesses DU FEEDBACK (pas de la réponse).
4. Calcule un score global sur 20 (somme des critères × coefficient).

CONTRAINTES :
- Chaque "strength" et "weakness" doit citer un élément concret du feedback.
- Ne donne PAS de score extrême (0 ou 20) sans justification détaillée.
- Le champ "reason" doit expliquer le lien entre les critères et le score.
</task>

<output_format>
Retourne UNIQUEMENT du JSON valide, sans texte avant ni après :
{
  "score": 14,
  "criteriaBreakdown": [
    { "criterion": "Spécificité", "score": 4, "note": "Le pair cite des passages précis" }
  ],
  "strengths": ["Identifie un problème de structure au §2 avec citation"],
  "weaknesses": ["Ne propose pas d'alternative concrète pour améliorer"],
  "reason": "Le feedback montre une bonne compréhension du texte et pointe des faiblesses réelles. Cependant, il manque de suggestions actionnables. Le pair identifie les problèmes mais ne guide pas vers des solutions."
}
</output_format>`;
}

/**
 * 2. Comparaison de réponses par section (Section Comparison)
 */
export function buildSectionComparisonPrompt({
  sectionKey,
  question,
  topAnswer,
  otherAnswers = [],
  criteria = [],
  language = "FR",
}) {
  const effectiveCriteria =
    criteria.length > 0
      ? criteria
      : ["Clarté et lisibilité", "Structure logique", "Rigueur scientifique", "Pertinence par rapport à la question"];

  const criteriaBlock = effectiveCriteria
    .map((c, i) => `  ${i + 1}. ${c}`)
    .join("\n");

  const allAnswers = [topAnswer, ...otherAnswers];
  const answersBlock = allAnswers
    .map(
      (a, i) =>
        `--- Réponse ${String.fromCharCode(65 + i)} ---\n${a || "[Vide]"}`
    )
    .join("\n\n");

  return `<role>
Tu es un évaluateur académique comparant plusieurs réponses d'étudiants pour la même section d'un document scientifique.
</role>

<context>
- Section : "${sectionKey}"
- Langue de réponse : ${language}
- La Réponse A est pré-sélectionnée comme meilleure candidate.
</context>

<question>
${question || "[Pas de question spécifique]"}
</question>

<answers>
${answersBlock}
</answers>

<task>
Compare ces réponses selon les critères suivants :

${criteriaBlock}

PROCESSUS À SUIVRE :
1. Évalue chaque réponse indépendamment sur chaque critère (0-5).
2. Identifie les forces communes à toutes les réponses.
3. Identifie pourquoi la Réponse A se distingue (ou pas).
4. Note les lacunes des autres réponses par rapport à A.
5. Vérifie si A est réellement la meilleure — sinon, signale-le.

CONTRAINTES :
- Cite des passages ou éléments précis pour justifier chaque point.
- Si les réponses sont de qualité très similaire, indique-le clairement.
</task>

<output_format>
Retourne UNIQUEMENT du JSON valide :
{
  "sectionKey": "${sectionKey}",
  "rankingConfidence": "high | medium | low",
  "confirmedBest": "A",
  "whyBest": [
    "Structure IMRAD respectée avec transitions claires entre sous-sections",
    "Utilise 3 références récentes (post-2020) pertinentes"
  ],
  "commonStrengths": ["Toutes les réponses abordent correctement le contexte"],
  "gaps": [
    "Réponse B manque de données quantitatives pour appuyer l'argument principal",
    "Réponse C ne cite aucune source"
  ],
  "summary": "La Réponse A se distingue par sa rigueur méthodologique et sa structure claire. Les réponses B et C abordent le sujet correctement mais manquent de profondeur analytique."
}
</output_format>`;
}

/**
 * 3. Évaluation d'une réponse de section (Section Answer Evaluation)
 */
export function buildSectionAnswerEvalPrompt({
  sectionKey,
  question,
  criteria = [],
  studentAnswer,
  docType = "article",
  level = "Master 2 / PFE",
  language = "FR",
  feedbackStyle = "detailed",
}) {
  const effectiveCriteria =
    criteria.length > 0
      ? criteria
      : [
          "Pertinence par rapport à l'objectif de la section",
          "Clarté de l'expression",
          "Structure et organisation logique",
          "Rigueur scientifique et qualité des sources",
        ];

  const criteriaBlock = effectiveCriteria
    .map((c, i) => `  ${i + 1}. ${c} (0-5 points)`)
    .join("\n");

  const styleInstructions = {
    detailed: `STYLE DE FEEDBACK : Détaillé
- Explique chaque note de critère avec des citations du texte.
- Fournis des corrections ligne par ligne (3-5 max, les plus impactantes).
- Réécris le paragraphe le plus faible comme exemple d'amélioration.`,

    socratic: `STYLE DE FEEDBACK : Socratique
- Pour chaque faiblesse, formule une QUESTION qui guide l'étudiant vers la solution.
  Exemple : au lieu de "Il manque une définition", demande "Comment le lecteur peut-il comprendre ton argument sans définir ce concept clé ?"
- Ne donne PAS directement la correction. Oriente.
- Les "lineCorrections" doivent contenir la question dans le champ "improved".`,

    synthetic: `STYLE DE FEEDBACK : Synthétique
- Maximum 2 forces, 2 faiblesses, 2 corrections.
- Chaque point en 1 phrase maximum.
- Le "detailedWhy" ne doit pas dépasser 3 phrases.`,
  };

  return `<role>
Tu es un évaluateur académique expérimenté en rédaction scientifique de niveau ${level}. Tu évalues avec rigueur mais bienveillance, en visant toujours la progression de l'étudiant.
</role>

<context>
- Section à évaluer : "${sectionKey}"
- Type de document : ${docType}
- Niveau attendu : ${level}
- Langue de réponse : ${language}
</context>

<grading_scale>
BARÈME DE RÉFÉRENCE (pour ancrer ton évaluation) :
- 0-4 / 20 : Insuffisant — Hors sujet ou incompréhensible.
- 5-9 / 20 : Faible — Le sujet est abordé mais avec des lacunes majeures.
- 10-13 / 20 : Passable — Les éléments essentiels sont présents mais manquent de profondeur.
- 14-16 / 20 : Bien — Travail solide avec quelques points à améliorer.
- 17-20 / 20 : Excellent — Qualité publiable, rigueur exceptionnelle.
</grading_scale>

<question_context>
${question || "[Pas de contexte de question spécifique pour cette section]"}
</question_context>

<student_answer>
${studentAnswer || "[Aucune réponse soumise]"}
</student_answer>

<evaluation_criteria>
Évalue selon ces critères (chacun sur 5 points, total sur 20) :

${criteriaBlock}
</evaluation_criteria>

<task>
${styleInstructions[feedbackStyle] || styleInstructions.detailed}

PROCESSUS OBLIGATOIRE :
1. Lis la réponse entière avant de noter.
2. Évalue chaque critère individuellement avec justification.
3. Calcule le score total = somme des critères.
4. Identifie les 2-3 forces principales.
5. Identifie les 2-3 faiblesses prioritaires (les plus impactantes).
6. Propose 3-5 corrections ciblées sur des passages précis.
7. Réécris UNIQUEMENT le paragraphe le plus faible (pas toute la section).
8. Donne 1-2 conseils "feed-forward" pour les prochaines étapes.

CONTRAINTES :
- Le score DOIT correspondre à la somme des sous-scores des critères.
- Ne donne PAS 0/5 ou 5/5 sur un critère sans justification forte.
- Cite toujours le texte de l'étudiant quand tu identifies un problème.
- Si la réponse est vide, donne 0/20 et explique ce qui est attendu.
</task>

<output_format>
Retourne UNIQUEMENT du JSON valide, sans markdown ni texte autour :
{
  "sectionKey": "${sectionKey}",
  "score": 13,
  "rubricMapping": [
    { "criterion": "Pertinence", "score": 4, "reason": "Aborde correctement l'objectif mais dévie au §3" },
    { "criterion": "Clarté", "score": 3, "reason": "Phrases trop longues, vocabulaire parfois imprécis" }
  ],
  "strengths": [
    "Introduction contextualisée avec une problématique claire",
    "Bonne utilisation des connecteurs logiques entre paragraphes"
  ],
  "weaknesses": [
    "§3 : l'argument sur X n'est pas appuyé par une source",
    "Conclusion absente — la section s'arrête sans synthèse"
  ],
  "lineCorrections": [
    {
      "original": "Les résultats montrent que c'est bien.",
      "issue": "Formulation vague et non-scientifique",
      "improved": "Les résultats indiquent une corrélation positive (r=0.72) entre X et Y."
    }
  ],
  "weakestParagraphRewrite": "Le troisième paragraphe, actuellement imprécis, pourrait être reformulé ainsi : [version améliorée]",
  "feedForward": [
    "Pour la section suivante (Discussion), pense à relier ces résultats à ta problématique initiale",
    "Ajoute 2-3 références post-2020 pour renforcer l'ancrage théorique"
  ],
  "detailedWhy": "Le travail montre une compréhension du sujet mais reste en surface. La structure est présente mais les arguments manquent de preuves. Le score de 13/20 reflète un travail passable qui nécessite un approfondissement des sources et une meilleure rigueur dans l'argumentation."
}
</output_format>`;
}

/**
 * 4. Évaluation de soumission de code (optionnel)
 */
export function buildCodeEvalPrompt({
  problemDescription,
  studentCode,
  studentExplanation = "",
  language = "FR",
  programmingLanguage = "JavaScript",
  level = "Master 2 / PFE",
}) {
  return `<role>
Tu es un tuteur expérimenté en programmation (${programmingLanguage}), spécialisé dans l'évaluation pédagogique de code pour des étudiants de niveau ${level}.
</role>

<context>
- Langage : ${programmingLanguage}
- Niveau : ${level}
- Langue de réponse : ${language}
</context>

<problem>
${problemDescription || "[Aucun énoncé fourni]"}
</problem>

<student_code>
${studentCode || "[Aucun code soumis]"}
</student_code>

<student_explanation>
${studentExplanation || "[Aucune explication fournie]"}
</student_explanation>

<evaluation_criteria>
Évalue selon 4 axes (chacun sur 5 points) :
  1. Exactitude — Le code résout-il correctement le problème ?
  2. Efficacité — Complexité algorithmique, performance.
  3. Lisibilité — Nommage, structure, commentaires, conventions.
  4. Qualité de l'explication — L'étudiant comprend-il ce qu'il a écrit ?
</evaluation_criteria>

<grading_scale>
- 0-4 : Le code ne fonctionne pas ou est hors sujet.
- 5-9 : Approche partielle, erreurs majeures.
- 10-13 : Fonctionne mais avec des défauts significatifs.
- 14-16 : Bon code, quelques optimisations possibles.
- 17-20 : Code élégant, explication limpide, rien à redire.
</grading_scale>

<task>
PROCESSUS :
1. Teste mentalement le code avec 2-3 cas (normal, edge case, erreur).
2. Évalue chaque critère avec justification.
3. Propose des corrections avec des snippets de code concrets.
4. Si l'explication est incomplète, indique ce qui manque.

CONTRAINTES :
- Chaque suggestion DOIT inclure un exemple de code "avant/après".
- Ne dis pas "bon travail" sans citer un élément précis.
- Limite-toi à 3-5 suggestions prioritaires.
</task>

<output_format>
Retourne UNIQUEMENT du JSON valide :
{
  "score": 14,
  "rubricMapping": [
    { "criterion": "Exactitude", "score": 4, "reason": "Résout le problème, edge case non géré pour input vide" },
    { "criterion": "Efficacité", "score": 3, "reason": "Boucle imbriquée O(n²) évitable avec un Set" }
  ],
  "strengths": [
    "Utilisation correcte de async/await avec gestion d'erreurs try/catch",
    "Nommage descriptif des variables (studentAnswer, feedbackScore)"
  ],
  "weaknesses": [
    "Pas de validation des inputs : crash si studentCode est undefined",
    "L'explication ne mentionne pas la complexité algorithmique"
  ],
  "codeCorrections": [
    {
      "original": "for (let i=0; i<arr.length; i++) { for (let j=0; j<arr.length; j++) {",
      "issue": "Complexité O(n²) inutile",
      "improved": "const seen = new Set();\\nfor (const item of arr) { if (seen.has(item)) return true; seen.add(item); }"
    }
  ],
  "feedForward": [
    "Pense à ajouter des tests unitaires pour valider les edge cases",
    "Documente la complexité dans ton explication"
  ],
  "detailedWhy": "Le code fonctionne et montre une bonne compréhension des bases. L'approche est correcte mais pas optimale. Le score de 14/20 reflète un travail solide qui gagnerait en efficacité et en robustesse."
}
</output_format>`;
}

// ══════════════════════════════════════════════════════════════
// 5. LearnLens — évaluation section manquante (grille IMRAD 1–4)
// ══════════════════════════════════════════════════════════════

const SECTION_CRITERIA = {
  titre: [
    { id: "C1", name: "Cohérence avec l'article (reflète ce que l'article rapporte réellement)", desc: "1: Trompeur / hors sujet | 2: Partiellement fidèle | 3: Fidèle | 4: Capture précisément le cœur de l'article" },
    { id: "C2", name: "Concision", desc: "1: Trop long/confus | 2: Quelques mots de trop | 3: Adéquat | 4: Concis et percutant" },
    { id: "C3", name: "Mots-clés / repérabilité", desc: "1: Absents | 2: Génériques | 3: Présents | 4: Bien choisis" },
    { id: "C4", name: "Spécificité", desc: "1: Trop général | 2: Peu spécifique | 3: Spécifique | 4: Précis et distinctif" },
  ],
  abstract: [
    { id: "C1", name: "Fidélité à l'article fourni (résume réellement l'intro, les méthodes, les résultats présents)", desc: "1: Contredit l'article | 2: Approximatif / omet l'essentiel | 3: Fidèle | 4: Synthèse exacte et fidèle" },
    { id: "C2", name: "Autonomie", desc: "1: Incompréhensible seul | 2: Nécessite l'article | 3: Compréhensible seul | 4: Parfaitement autonome" },
    { id: "C3", name: "Complétude (contexte, objectif, méthode, résultats, portée)", desc: "1: Plusieurs manques | 2: Un manque clé | 3: Tous présents | 4: Tous présents et bien dosés" },
    { id: "C4", name: "Respect des contraintes (longueur, pas d'abréviation non définie)", desc: "1: Non respectées | 2: Partielles | 3: Respectées | 4: Irréprochable" },
  ],
  introduction: [
    { id: "C1", name: "Raccord avec la suite (mène à la question que les méthodes/résultats présents traitent)", desc: "1: Décalée du reste | 2: Lien faible | 3: Cohérente avec la suite | 4: Prépare parfaitement la suite" },
    { id: "C2", name: "Contexte / problème (le « verrou »)", desc: "1: Absent | 2: Confus | 3: Clair | 4: Clair et engageant" },
    { id: "C3", name: "Justification / écart dans la littérature", desc: "1: Absente | 2: Évoquée | 3: Justifiée | 4: Solidement justifiée" },
    { id: "C4", name: "Objectif / question annoncé(e)", desc: "1: Absent | 2: Implicite | 3: Annoncé | 4: Annoncé clairement et tôt" },
  ],
  methodes: [
    { id: "C1", name: "Cohérence avec les résultats présents (les méthodes décrites peuvent produire ces résultats)", desc: "1: Incompatibles | 2: Partiellement compatibles | 3: Compatibles | 4: Parfaitement alignées sur les résultats" },
    { id: "C2", name: "Reproductibilité", desc: "1: Impossible à refaire | 2: Détails insuffisants | 3: Refaisable | 4: Détails complets et précis" },
    { id: "C3", name: "Justification des choix", desc: "1: Aucune | 2: Partielle | 3: Présente | 4: Solidement argumentée" },
    { id: "C4", name: "Organisation", desc: "1: Confuse | 2: Inégale | 3: Logique | 4: Claire et structurée" },
  ],
  resultats: [
    { id: "C1", name: "Cohérence méthodes → discussion (les résultats correspondent aux méthodes et à ce que la discussion interprète)", desc: "1: Incohérents | 2: Faiblement cohérents | 3: Cohérents | 4: Parfaitement alignés en amont et en aval" },
    { id: "C2", name: "Faits sans interprétation", desc: "1: Mélangés à l'analyse | 2: Interprétation qui déborde | 3: Factuels | 4: Rigoureusement factuels" },
    { id: "C3", name: "Figures / tableaux", desc: "1: Illisibles/absents | 2: Peu clairs | 3: Clairs | 4: Clairs, autonomes, sans redondance" },
    { id: "C4", name: "Réponse aux questions posées", desc: "1: Hors sujet | 2: Partielle | 3: Répond | 4: Répond pleinement" },
  ],
  discussion: [
    { id: "C1", name: "Fidélité aux résultats présents (interprète les résultats de l'article, n'en invente pas)", desc: "1: Invente / contredit | 2: S'éloigne par endroits | 3: Fidèle | 4: Strictement ancrée dans les résultats" },
    { id: "C2", name: "Interprétation", desc: "1: Absente/erronée | 2: Superficielle | 3: Pertinente | 4: Fine, sans surinterprétation" },
    { id: "C3", name: "Lien à la littérature + limites", desc: "1: Absents | 2: Faibles | 3: Présents | 4: Riches et honnêtes" },
    { id: "C4", name: "Démontré vs suggéré", desc: "1: Confondus | 2: Flou | 3: Distingués | 4: Clairement distingués" },
  ],
  conclusion: [
    { id: "C1", name: "Cohérence avec intro et résultats présents (répond à la question posée, reflète les résultats)", desc: "1: Décalée | 2: Lien partiel | 3: Cohérente | 4: Boucle parfaitement la question initiale" },
    { id: "C2", name: "Réponse à la question initiale", desc: "1: Absente | 2: Partielle | 3: Claire | 4: Claire et nuancée" },
    { id: "C3", name: "Messages-clés", desc: "1: Noyés | 2: Peu nets | 3: Identifiables | 4: Saillants et mémorables" },
    { id: "C4", name: "Pas de résultat nouveau", desc: "1: En introduit | 2: Ambigu | 3: Respecté | 4: Respecté" },
  ],
};

// Normalize section key to match SECTION_CRITERIA keys
function normalizeSectionForCriteria(sectionKey) {
  const s = (sectionKey || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // strip accents
    .trim();
  if (s.includes("titre") || s.includes("title")) return "titre";
  if (s.includes("abstract") || s.includes("resume") || s.includes("résumé")) return "abstract";
  if (s.includes("intro")) return "introduction";
  if (s.includes("meth") || s.includes("materiel")) return "methodes";
  if (s.includes("result")) return "resultats";
  if (s.includes("discuss")) return "discussion";
  if (s.includes("conclu")) return "conclusion";
  return s; // fallback: use as-is (may not match, will use intro criteria as default)
}

const SCORE_LABELS = { 1: "Insuffisant", 2: "À améliorer", 3: "Satisfaisant", 4: "Excellent" };

const STYLE_INSTRUCTIONS = {
  detaille: `Si "detaille" :
  - Pour chaque critère, fournis une justification précise (2-3 phrases) en citant des passages de la production.
  - Indique concrètement ce qui fonctionne et ce qui doit être amélioré.
  - Propose une suggestion actionnable par critère noté ≤ 2.`,
  socratique: `Si "socratique" :
  - Pour chaque critère, formule 1 à 2 questions ouvertes guidantes qui amènent l'apprenant à identifier lui-même ses points faibles.
  - Ne donne pas la réponse directement ; oriente la réflexion.`,
  synthetique: `Si "synthetique" :
  - Fournis un feedback global en 3-5 phrases maximum.
  - Mentionne uniquement les 2 points forts principaux et les 2 axes d'amélioration prioritaires.
  - Pas de détail par critère dans le feedback (les scores suffisent).`,
};

export function buildLearnLensEvalPrompt({
  sectionKey = "Introduction",
  feedbackStyle = "detaille",
  articleContext = "",
  studentAnswer = "",
}) {
  const sectionNorm = normalizeSectionForCriteria(sectionKey);
  const criteria = SECTION_CRITERIA[sectionNorm] || SECTION_CRITERIA.introduction;
  const styleKey = (feedbackStyle || "detaille").toLowerCase();
  const styleInstr = STYLE_INSTRUCTIONS[styleKey] || STYLE_INSTRUCTIONS.detaille;

  const criteriaBlock = criteria
    .map(c => `${c.id}. ${c.name}\n   ${c.desc}`)
    .join("\n");

  const criteriaSchema = criteria.map(c => (
    `    { "id": "${c.id}", "name": "${c.name}", "score": <1|2|3|4>, "label": "<${Object.values(SCORE_LABELS).join("|")}>", "feedback": "<texte adapté au style>" }`
  )).join(",\n");

  return `Tu es un évaluateur expert en rédaction scientifique, spécialisé dans la structure IMRAD et les conventions de publication académique. Tu évalues la production d'un apprenant dans un contexte pédagogique universitaire.

══════════════════════════════════════════════
CONTEXTE DE L'EXERCICE
══════════════════════════════════════════════

L'apprenant a reçu un article scientifique réel dont la section "${sectionKey}" a été retirée. Il devait rédiger cette section manquante. Tu dois évaluer sa production selon deux dimensions :
1. QUALITÉ INTRINSÈQUE : la section est-elle bien rédigée selon les standards académiques du genre ?
2. COHÉRENCE AVEC L'ARTICLE : s'accorde-t-elle avec les sections présentes (mêmes objectifs, mêmes résultats, même terminologie) ?

══════════════════════════════════════════════
ARTICLE ORIGINAL (sections fournies à l'apprenant)
══════════════════════════════════════════════

${articleContext?.trim() || "[Aucun contexte d'article fourni — évalue uniquement la qualité intrinsèque]"}

══════════════════════════════════════════════
PRODUCTION DE L'APPRENANT (section "${sectionKey}")
══════════════════════════════════════════════

${studentAnswer?.trim() || "[Aucune réponse soumise]"}

══════════════════════════════════════════════
ÉCHELLE DE NOTATION
══════════════════════════════════════════════

Chaque critère est noté de 1 à 4 :
- 1 = Insuffisant
- 2 = À améliorer
- 3 = Satisfaisant
- 4 = Excellent

══════════════════════════════════════════════
GRILLE DE CRITÈRES — section "${sectionKey}"
══════════════════════════════════════════════

Utilise UNIQUEMENT ces 4 critères :

${criteriaBlock}

══════════════════════════════════════════════
STYLE DE FEEDBACK : ${styleKey}
══════════════════════════════════════════════

${styleInstr}

══════════════════════════════════════════════
FORMAT DE SORTIE
══════════════════════════════════════════════

Réponds UNIQUEMENT avec un objet JSON valide, sans backticks, sans texte avant ou après :

{
  "section": "${sectionKey}",
  "feedbackStyle": "${styleKey}",
  "overallScore": <moyenne arithmétique des 4 scores arrondie à 1 décimale>,
  "criteria": [
${criteriaSchema}
  ],
  "summary": "<synthèse globale 2-4 phrases : points forts, faiblesses majeures, prochaine étape>",
  "strengths": ["<point fort 1>", "<point fort 2>"],
  "improvements": ["<amélioration prioritaire 1>", "<amélioration prioritaire 2>"]
}

RÈGLES IMPÉRATIVES :
1. Évalue UNIQUEMENT les 4 critères listés ci-dessus.
2. overallScore = moyenne arithmétique des 4 scores, arrondie à 1 décimale.
3. Un score de 4 est réservé aux productions réellement excellentes.
4. Si la production est vide ou < 20 mots, attribue 1 à tous les critères et explique pourquoi.
5. Ancre chaque évaluation dans des éléments concrets du texte de l'apprenant ET de l'article.
6. Rédige tout en français.
7. Renvoie UNIQUEMENT le JSON, rien d'autre.`;
}
