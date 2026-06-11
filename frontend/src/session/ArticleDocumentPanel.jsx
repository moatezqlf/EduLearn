import { resolveMediaUrl, fileIcon, downloadSessionArticle } from "./articleUtils";

/**
 * Étape 1 étudiant : lecture / téléchargement du document (sans sections IMRAD).
 */
/**
 * mode="complete"  → Article 1: lecture structure (section encore présente)
 * mode="exercise"  → Article 2: section retirée, texte coupé (default)
 */
export default function ArticleDocumentPanel({
  question,
  instructions,
  articleFileUrl,
  articleFileName,
  articleFileMime,
  articleTextContent,
  missingSection,
  resourceType,
  onContinue,
  continueLabel,
  hideContinue = false,
  mode = "exercise",
}) {
  const fileUrl = resolveMediaUrl(articleFileUrl);
  const isPdf = (articleFileMime || "").includes("pdf") || (articleFileName || "").toLowerCase().endsWith(".pdf");
  const hasFile = Boolean(fileUrl);
  const hasText = Boolean(articleTextContent?.trim());
  const isComplete = mode === "complete";

  const handleDownload = () => {
    downloadSessionArticle({ question, articleFileUrl, articleFileName });
  };

  return (
    <div style={st.card}>
      <div style={st.head}>
        {isComplete ? (
          <>
            <span style={{ ...st.badge, background: "#dcfce7", color: "#16a34a" }}>Lecture — Article complet</span>
            <p style={st.hint}>Lisez cet article complet pour comprendre la structure d&apos;un article scientifique.</p>
          </>
        ) : (
          <>
            <span style={st.badge}>Exercice — Section manquante</span>
            <p style={st.hint}>
              La section <strong style={{ color: "#6366f1" }}>{missingSection || "?"}</strong> a été retirée.
              Lisez l&apos;article puis rédigez cette section.
            </p>
          </>
        )}
      </div>

      {question && <p style={st.question}>{question}</p>}
      {instructions && <p style={st.instructions}>{instructions}</p>}

      {/* File document */}
      {hasFile && (
        <>
          <div style={st.fileBox}>
            <span style={{ fontSize: 40 }}>{fileIcon(articleFileMime, articleFileName)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{articleFileName || "Document"}</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                {resourceType === "word" ? "Document Word" : isPdf ? "PDF" : "Fichier"}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button type="button" style={st.btnPrimary} onClick={handleDownload}>⬇ Télécharger</button>
              <a href={fileUrl} target="_blank" rel="noopener noreferrer" style={st.btnOutline}>
                Ouvrir dans un nouvel onglet
              </a>
            </div>
          </div>

          {/* Continue button ABOVE the PDF so it's always visible without scrolling */}
          {!hideContinue && (
            <button type="button" style={st.continueBtnTop} onClick={onContinue}>
              {continueLabel || (isComplete
                ? `J'ai lu — Passer à l'exercice →`
                : `J'ai lu — Passer à la rédaction →`
              )}
            </button>
          )}

          {isPdf && <iframe title="Aperçu PDF" src={fileUrl} style={st.pdfFrame} />}
        </>
      )}

      {/* Text content — exercise mode shows cut article; complete mode shows nothing extra */}
      {!hasFile && hasText && !isComplete && (
        <div style={st.textArticle}>
          <div style={st.textArticleHeader}>
            <span style={{ fontWeight: 700, fontSize: 13, color: "#374151" }}>📄 Article (section manquante)</span>
            <span style={{ fontSize: 11, color: "#dc2626" }}>Section « {missingSection} » retirée</span>
          </div>
          <div style={st.textContent}>{articleTextContent}</div>
        </div>
      )}

      {/* No content fallback */}
      {!hasFile && (!hasText || isComplete) && (
        <div style={st.empty}>
          <p>Le professeur n&apos;a pas encore joint de document. Consultez les consignes ci-dessus.</p>
        </div>
      )}

      {!isComplete && missingSection && (
        <div style={st.nextHint}>
          <strong>Section à rédiger :</strong> {missingSection}
          <span style={{ display: "block", fontSize: 12, color: "#92400e", marginTop: 4 }}>
            Vous la rédigerez à l&apos;étape suivante.
          </span>
        </div>
      )}

      {!hideContinue && (
        <button type="button" style={st.continueBtn} onClick={onContinue}>
          {continueLabel || (isComplete
            ? `Passer à l'exercice — section « ${missingSection || "à apprendre"} » →`
            : `Passer à la rédaction →`
          )}
        </button>
      )}
    </div>
  );
}

const st = {
  card: { background: "#fff", borderRadius: 16, padding: 24, border: "1px solid #e2e8f0", marginBottom: 16 },
  head: { marginBottom: 12 },
  badge: { fontWeight: 800, fontSize: 13, color: "#6366f1" },
  hint: { margin: "6px 0 0", fontSize: 12, color: "#64748b" },
  question: { fontSize: 15, fontWeight: 600, color: "#0f172a", margin: "0 0 8px", lineHeight: 1.5 },
  instructions: { fontSize: 13, color: "#475569", margin: "0 0 16px", lineHeight: 1.6 },
  fileBox: {
    display: "flex", alignItems: "center", gap: 16, padding: 16,
    background: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0", marginBottom: 16, flexWrap: "wrap",
  },
  btnPrimary: {
    padding: "10px 16px", background: "#6366f1", color: "#fff", border: "none",
    borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer",
  },
  btnOutline: {
    padding: "8px 14px", background: "#fff", color: "#6366f1", border: "1px solid #c7d2fe",
    borderRadius: 10, fontWeight: 600, fontSize: 12, textAlign: "center", textDecoration: "none",
  },
  empty: { padding: 20, background: "#f8fafc", borderRadius: 10, fontSize: 13, color: "#64748b", marginBottom: 16 },
  pdfFrame: { width: "100%", height: 600, border: "1px solid #e2e8f0", borderRadius: 10, marginBottom: 16 },
  textArticle: { border: "1.5px solid #e2e8f0", borderRadius: 12, overflow: "hidden", marginBottom: 16 },
  textArticleHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" },
  textContent: { padding: "16px 20px", fontSize: 14, lineHeight: 1.8, color: "#1e293b", maxHeight: 520, overflowY: "auto", whiteSpace: "pre-wrap", fontFamily: "Georgia, serif", background: "#fff" },
  nextHint: {
    padding: 14, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10,
    fontSize: 13, color: "#78350f", marginBottom: 16,
  },
  continueBtn: {
    width: "100%", padding: "16px 0", background: "#6366f1", color: "#fff", border: "none",
    borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: "pointer",
    boxShadow: "0 4px 14px rgba(99,102,241,0.35)", letterSpacing: "0.01em",
  },
  continueBtnTop: {
    display: "block", width: "100%", padding: "13px 0", marginBottom: 14,
    background: "#22c55e", color: "#fff", border: "none",
    borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: "pointer",
    boxShadow: "0 3px 10px rgba(34,197,94,0.30)", letterSpacing: "0.01em",
  },
};
