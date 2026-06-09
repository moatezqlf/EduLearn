import { createContext, useContext, useState, useCallback } from "react";
import T from "./translations";

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem("edulearn_lang") || "fr");

  const toggleLang = useCallback(() => {
    setLang(prev => {
      const next = prev === "fr" ? "en" : "fr";
      localStorage.setItem("edulearn_lang", next);
      return next;
    });
  }, []);

  const t = useCallback((key) => T[lang]?.[key] ?? T["fr"]?.[key] ?? key, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, t, toggleLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLang must be used inside LanguageProvider");
  return ctx;
}

// Standalone toggle button — drop anywhere in the UI
export function LangToggle({ style }) {
  const { lang, toggleLang } = useLang();
  return (
    <button
      onClick={toggleLang}
      title={lang === "fr" ? "Switch to English" : "Passer en français"}
      style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "6px 11px", borderRadius: 8,
        border: "1px solid #EAECF0", background: "#fff",
        cursor: "pointer", fontSize: 12, fontWeight: 600,
        color: "#374151", fontFamily: "inherit",
        transition: "all .15s",
        ...style,
      }}
    >
      <span style={{ fontSize: 14 }}>{lang === "fr" ? "🇫🇷" : "🇬🇧"}</span>
      <span>{lang === "fr" ? "FR" : "EN"}</span>
    </button>
  );
}
