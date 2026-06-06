import { fileIcon } from "./articleUtils";

const ACCEPT = ".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

/** Import d'un document complet (sans découpage par sections). */
export default function ArticleUploadModal({
  open,
  onClose,
  articleFile,
  onFileSelect,
  onClearFile,
  resourceType,
}) {
  if (!open) return null;

  const labelByType = {
    pdf: "PDF",
    word: "Word (.doc, .docx)",
    txt: "Texte (.txt, .md)",
    article: "document",
    ressource: "fichier",
    cours: "document de cours",
  };

  return (
    <div style={overlay} onClick={onClose} role="presentation">
      <div style={panel} onClick={e => e.stopPropagation()}>
        <div style={head}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Lecture de l&apos;article</h2>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748b" }}>
              Téléversez un fichier {labelByType[resourceType] || "PDF, Word ou texte"}. Les étudiants le liront ou le téléchargeront avant la section à apprendre.
            </p>
          </div>
          <button type="button" onClick={onClose} style={closeBtn}>×</button>
        </div>

        <label style={uploadZone}>
          <input
            type="file"
            accept={ACCEPT}
            style={{ display: "none" }}
            onChange={onFileSelect}
          />
          <div style={{ fontSize: 36, marginBottom: 8 }}>📎</div>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#4f46e5" }}>
            Choisir un fichier
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
            PDF · Word (.docx) · Texte (.txt, .md) — max. 50 Mo
          </div>
        </label>

        {articleFile && (
          <div style={fileCard}>
            <span style={{ fontSize: 28 }}>{fileIcon(articleFile.type, articleFile.name)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis" }}>
                {articleFile.name}
              </div>
              <div style={{ fontSize: 11, color: "#64748b" }}>
                {(articleFile.size / 1024).toFixed(0)} Ko
              </div>
            </div>
            <button type="button" style={removeBtn} onClick={onClearFile}>
              Retirer
            </button>
          </div>
        )}

        <div style={foot}>
          <button
            type="button"
            style={{ ...btnPrimary, opacity: articleFile ? 1 : 0.5 }}
            onClick={onClose}
            disabled={!articleFile}
          >
            Enregistrer et fermer
          </button>
        </div>
      </div>
    </div>
  );
}

const overlay = { position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 };
const panel = { background: "#fff", borderRadius: 16, maxWidth: 480, width: "100%", padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" };
const head = { display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 20 };
const closeBtn = { border: "none", background: "#f1f5f9", width: 36, height: 36, borderRadius: 8, fontSize: 22, cursor: "pointer", color: "#64748b" };
const uploadZone = { display: "block", padding: 28, background: "#f8f7ff", border: "2px dashed #c7d2fe", borderRadius: 14, textAlign: "center", cursor: "pointer", marginBottom: 16 };
const fileCard = { display: "flex", alignItems: "center", gap: 12, padding: 14, background: "#ecfdf5", border: "1px solid #86efac", borderRadius: 12, marginBottom: 8 };
const removeBtn = { border: "none", background: "#fff", padding: "6px 10px", borderRadius: 8, fontSize: 12, cursor: "pointer", color: "#64748b" };
const foot = { display: "flex", justifyContent: "flex-end", marginTop: 8 };
const btnPrimary = { padding: "10px 20px", background: "#6366f1", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer" };
