import ArticleDocumentPanel from "./ArticleDocumentPanel";

/** Visualise une ressource publiée par l'enseignant (hors session live). */
export default function ResourceArticleViewer({ resource, onClose }) {
  if (!resource) return null;

  return (
    <div style={st.overlay} onClick={onClose} role="presentation">
      <div style={st.viewer} onClick={e => e.stopPropagation()}>
        <div style={st.head}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Ressource du professeur</h2>
          <button type="button" onClick={onClose} style={st.closeBtn}>×</button>
        </div>
        <ArticleDocumentPanel
          question={resource.question}
          instructions={resource.instructions}
          articleFileUrl={resource.articleFileUrl}
          articleFileName={resource.articleFileName}
          articleFileMime={resource.articleFileMime}
          missingSection={resource.missingSection}
          resourceType={resource.resourceType}
          hideContinue
        />
      </div>
    </div>
  );
}

const st = {
  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
  viewer: { background: "#fff", borderRadius: 16, maxWidth: 760, width: "100%", maxHeight: "90vh", overflow: "auto", padding: 24 },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  closeBtn: { border: "none", background: "#f1f5f9", width: 36, height: 36, borderRadius: 8, fontSize: 22, cursor: "pointer" },
};
