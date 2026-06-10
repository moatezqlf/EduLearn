const BACKEND = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/\/api\/?$/, "");

export function resolveMediaUrl(path) {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${BACKEND}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Détecte un contenu binaire (ex. PDF lu comme texte). */
export function isBinaryGarbage(text) {
  if (!text || typeof text !== "string") return false;
  const t = text.trim();
  if (t.startsWith("%PDF-")) return true;
  if (t.includes("\u0000")) return true;
  const nonPrintable = (t.match(/[^\x09\x0a\x0d\x20-\x7E\u00A0-\u024F]/g) || []).length;
  return t.length > 80 && nonPrintable / t.length > 0.35;
}

export function fileIcon(mime = "", name = "") {
  const m = (mime || "").toLowerCase();
  const n = (name || "").toLowerCase();
  if (m.includes("pdf") || n.endsWith(".pdf")) return "📕";
  if (m.includes("word") || n.endsWith(".docx") || n.endsWith(".doc")) return "📘";
  if (m.includes("text") || n.endsWith(".txt") || n.endsWith(".md")) return "📝";
  return "📎";
}

/** Télécharge le fichier article ou génère un .txt depuis les sections. */
export function downloadSessionArticle({
  question,
  articleFileUrl,
  articleFileName,
  articleSections,
  selectedSections,
  missingSection,
}) {
  if (articleFileUrl) {
    const url = resolveMediaUrl(articleFileUrl);
    const a = document.createElement("a");
    a.href = url;
    a.download = articleFileName || "document";
    a.target = "_blank";
    a.rel = "noopener";
    a.click();
    return;
  }
  const sections = selectedSections?.length
    ? selectedSections
    : Object.keys(articleSections || {});
  const lines = [
    question ? `# ${question}\n` : "",
    ...sections.map(name => {
      const isMissing = name === missingSection;
      const content = articleSections?.[name];
      const body = isMissing
        ? "[Section à compléter par l'apprenant]\n"
        : isBinaryGarbage(content)
          ? "[Document fourni en fichier — téléchargez depuis la plateforme]\n"
          : `${content || "[Non fourni]"}\n`;
      return `## ${name}\n${body}`;
    }),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `article-${(question || "edulearn").slice(0, 40).replace(/[^\w\s-]/g, "")}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
