import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import { useAuth } from "./AuthContext";
import api, { tokenStorage } from "./api";

const SOCKET_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/\/api\/?$/, "");

const css = `
  .comm-tab { padding: 8px 16px; border-radius: 8px; border: none; font-size: 13px; font-weight: 500; cursor: pointer; font-family: inherit; background: transparent; color: #6B7280; }
  .comm-tab.active { background: #1A1D23; color: #fff; }
  .comm-card { background: #fff; border: 1px solid #EAECF0; border-radius: 12px; padding: 16px; margin-bottom: 10px; }
  .msg-bubble { max-width: 75%; padding: 10px 14px; border-radius: 12px; font-size: 13px; line-height: 1.5; margin-bottom: 8px; }
  .msg-mine { background: #6C63FF; color: #fff; margin-left: auto; border-bottom-right-radius: 4px; }
  .msg-theirs { background: #F3F4F6; color: #1A1D23; border-bottom-left-radius: 4px; }
`;

export default function Communication() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("chat");
  const [contacts, setContacts] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [topics, setTopics] = useState([]);
  const [activeTopic, setActiveTopic] = useState(null);
  const [replies, setReplies] = useState([]);
  const [newTopic, setNewTopic] = useState({ title: "", body: "" });
  const [replyBody, setReplyBody] = useState("");
  const [emailForm, setEmailForm] = useState({ to: "", subject: "", body: "" });
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [unreadCounts, setUnreadCounts] = useState({});
  const socketRef = useRef(null);
  const bottomRef = useRef(null);
  const selectedRef = useRef(null);

  const back = user?.role === "teacher" ? "/teacher" : user?.role === "admin" ? "/admin" : "/student";

  const loadContacts = useCallback(async () => {
    try {
      const res = await api.contacts.getAll();
      setContacts(res.contacts || []);
    } catch { /* ignore */ }
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const res = await api.chat.getConversations();
      setConversations(res.conversations || []);
    } catch (e) { setError(e.message); }
  }, []);

  const loadMessages = useCallback(async (userId) => {
    if (!userId) return;
    try {
      const res = await api.chat.getMessages(userId);
      setMessages(res.messages || []);
    } catch (e) { setError(e.message); }
  }, []);

  const loadTopics = useCallback(async () => {
    try {
      const res = await api.forum.getTopics();
      setTopics(res.topics || []);
    } catch (e) { setError(e.message); }
  }, []);

  const loadTopic = async (id) => {
    try {
      const res = await api.forum.getTopic(id);
      setActiveTopic(res.topic);
      setReplies(res.replies || []);
    } catch (e) { setError(e.message); }
  };

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
    loadContacts();
    return () => document.head.removeChild(style);
  }, [loadContacts]);

  useEffect(() => {
    if (tab === "chat") loadConversations();
    if (tab === "forum") loadTopics();
  }, [tab, loadConversations, loadTopics]);

  useEffect(() => {
    if (selected) loadMessages(selected._id);
    selectedRef.current = selected;
  }, [selected, loadMessages]);

  useEffect(() => {
    const token = tokenStorage.get();
    if (!token) return;
    const socket = io(SOCKET_URL, { auth: { token } });
    socketRef.current = socket;
    socket.emit("join_user_room");
    socket.on("chat_message", (m) => {
      const fromId = String(m.from?._id || m.from || "");
      const toId   = String(m.to?._id   || m.to   || "");
      const isCurrentConv = selectedRef.current &&
        (fromId === selectedRef.current._id || toId === selectedRef.current._id);

      if (isCurrentConv) {
        setMessages(prev => [...prev, m]);
      } else {
        // Incoming message from another conversation → increment unread
        setUnreadCounts(prev => {
          const next = { ...prev, [fromId]: (prev[fromId] || 0) + 1 };
          const total = Object.values(next).reduce((a, b) => a + b, 0);
          sessionStorage.setItem("chat_unread", String(total));
          window.dispatchEvent(new CustomEvent("chat:unread", { detail: total }));
          return next;
        });
      }
      loadConversations();
    });
    return () => socket.disconnect();
  }, [loadConversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const selectContact = (u) => {
    setSelected(u);
    if (unreadCounts[u._id]) {
      setUnreadCounts(prev => {
        const next = { ...prev, [u._id]: 0 };
        const total = Object.values(next).reduce((a, b) => a + b, 0);
        sessionStorage.setItem("chat_unread", String(total));
        window.dispatchEvent(new CustomEvent("chat:unread", { detail: total }));
        return next;
      });
    }
  };

  const sendChat = async (e) => {
    e.preventDefault();
    if (!selected || !chatInput.trim()) return;
    try {
      await api.chat.send(selected._id, chatInput.trim());
      setChatInput("");
      await loadMessages(selected._id);
      loadConversations();
    } catch (e) { setError(e.message); }
  };

  const createTopic = async (e) => {
    e.preventDefault();
    try {
      await api.forum.createTopic(newTopic);
      setNewTopic({ title: "", body: "" });
      setMsg("Sujet publié !");
      loadTopics();
    } catch (e) { setError(e.message); }
  };

  const postReply = async (e) => {
    e.preventDefault();
    if (!activeTopic) return;
    try {
      await api.forum.reply(activeTopic._id, replyBody);
      setReplyBody("");
      loadTopic(activeTopic._id);
    } catch (e) { setError(e.message); }
  };

  const sendEmail = async (e) => {
    e.preventDefault();
    try {
      await api.email.send(emailForm);
      setMsg("Email envoyé !");
      setEmailForm({ to: "", subject: "", body: "" });
    } catch (e) { setError(e.message); }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F7F8FC", fontFamily: "'DM Sans', sans-serif", padding: 28 }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button onClick={() => navigate(back)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#9CA3AF" }}>←</button>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Communication</h1>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {[["chat", "💬 Chat"], ["forum", "📋 Forum"], ["email", "✉️ Email"]].map(([k, label]) => (
            <button key={k} className={`comm-tab ${tab === k ? "active" : ""}`} onClick={() => { setTab(k); setError(""); setActiveTopic(null); }}>{label}</button>
          ))}
        </div>

        {msg && <div style={{ background: "#D1FAE5", color: "#065F46", padding: 10, borderRadius: 8, marginBottom: 12 }}>{msg}</div>}
        {error && <div style={{ background: "#FEF2F2", color: "#DC2626", padding: 10, borderRadius: 8, marginBottom: 12 }}>{error}</div>}

        {tab === "chat" && (
          <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16, minHeight: 480 }}>
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #EAECF0", overflow: "hidden" }}>
              <p style={{ padding: "12px 14px", fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase" }}>Contacts</p>
              {[...contacts, ...conversations.map(c => c.user)].filter((u, i, arr) => u && arr.findIndex(x => x._id === u._id) === i).map(u => {
                const unread = unreadCounts[u._id] || 0;
                return (
                  <div key={u._id} onClick={() => selectContact(u)} style={{ padding: "10px 14px", cursor: "pointer", background: selected?._id === u._id ? "#EEF2FF" : "transparent", borderBottom: "1px solid #F3F4F6" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <p style={{ fontSize: 13, fontWeight: unread > 0 ? 700 : 600, color: unread > 0 ? "#1A1D23" : undefined }}>{u.name}</p>
                      {unread > 0 && (
                        <span style={{ background: "#ef4444", color: "#fff", borderRadius: "50%", minWidth: 18, height: 18, fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", flexShrink: 0 }}>
                          {unread > 9 ? "9+" : unread}
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: 11, color: "#9CA3AF" }}>{u.role === "teacher" ? "Enseignant" : "Apprenant"}</p>
                  </div>
                );
              })}
            </div>
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #EAECF0", display: "flex", flexDirection: "column" }}>
              {selected ? (
                <>
                  <p style={{ padding: 14, borderBottom: "1px solid #F3F4F6", fontWeight: 600 }}>{selected.name}</p>
                  <div style={{ flex: 1, padding: 14, overflowY: "auto", maxHeight: 360 }}>
                    {messages.map(m => {
                      const mine = (m.from?._id || m.from) === user?._id;
                      return (
                        <div key={m._id} className={`msg-bubble ${mine ? "msg-mine" : "msg-theirs"}`}>{m.body}</div>
                      );
                    })}
                    <div ref={bottomRef} />
                  </div>
                  <form onSubmit={sendChat} style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid #F3F4F6" }}>
                    <input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Votre message…" style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #EAECF0" }} />
                    <button type="submit" style={{ padding: "10px 16px", background: "#6C63FF", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>Envoyer</button>
                  </form>
                </>
              ) : (
                <p style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>Sélectionnez un contact</p>
              )}
            </div>
          </div>
        )}

        {tab === "forum" && (
          <div style={{ display: "grid", gridTemplateColumns: activeTopic ? "1fr 1fr" : "1fr", gap: 16 }}>
            <div>
              <form onSubmit={createTopic} className="comm-card" style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Nouveau sujet</h3>
                <input value={newTopic.title} onChange={e => setNewTopic(t => ({ ...t, title: e.target.value }))} placeholder="Titre" required style={{ width: "100%", padding: 10, marginBottom: 8, borderRadius: 8, border: "1px solid #EAECF0" }} />
                <textarea value={newTopic.body} onChange={e => setNewTopic(t => ({ ...t, body: e.target.value }))} placeholder="Message" required rows={3} style={{ width: "100%", padding: 10, marginBottom: 8, borderRadius: 8, border: "1px solid #EAECF0" }} />
                <button type="submit" style={{ padding: "8px 14px", background: "#6C63FF", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>Publier</button>
              </form>
              {topics.map(t => (
                <div key={t._id} className="comm-card" onClick={() => loadTopic(t._id)} style={{ cursor: "pointer" }}>
                  <p style={{ fontWeight: 600, fontSize: 14 }}>{t.title}</p>
                  <p style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>{t.author?.name} · {t.replyCount || 0} réponses</p>
                </div>
              ))}
            </div>
            {activeTopic && (
              <div className="comm-card">
                <h3 style={{ fontWeight: 700, marginBottom: 8 }}>{activeTopic.title}</h3>
                <p style={{ fontSize: 13, color: "#374151", marginBottom: 16, whiteSpace: "pre-wrap" }}>{activeTopic.body}</p>
                {replies.map(r => (
                  <div key={r._id} style={{ borderTop: "1px solid #F3F4F6", paddingTop: 10, marginTop: 10 }}>
                    <p style={{ fontSize: 11, color: "#9CA3AF" }}>{r.author?.name}</p>
                    <p style={{ fontSize: 13 }}>{r.body}</p>
                  </div>
                ))}
                <form onSubmit={postReply} style={{ marginTop: 16 }}>
                  <textarea value={replyBody} onChange={e => setReplyBody(e.target.value)} rows={2} placeholder="Votre réponse…" style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #EAECF0", marginBottom: 8 }} />
                  <button type="submit" style={{ padding: "8px 14px", background: "#1A1D23", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>Répondre</button>
                </form>
              </div>
            )}
          </div>
        )}

        {tab === "email" && (
          <form onSubmit={sendEmail} className="comm-card" style={{ maxWidth: 500 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Envoyer un email</h3>
            <select value={emailForm.to} onChange={e => setEmailForm(f => ({ ...f, to: e.target.value }))} required style={{ width: "100%", padding: 10, marginBottom: 10, borderRadius: 8, border: "1px solid #EAECF0" }}>
              <option value="">Destinataire</option>
              {contacts.map(c => <option key={c._id} value={c._id}>{c.name} ({c.email})</option>)}
            </select>
            <input value={emailForm.subject} onChange={e => setEmailForm(f => ({ ...f, subject: e.target.value }))} placeholder="Objet" required style={{ width: "100%", padding: 10, marginBottom: 10, borderRadius: 8, border: "1px solid #EAECF0" }} />
            <textarea value={emailForm.body} onChange={e => setEmailForm(f => ({ ...f, body: e.target.value }))} placeholder="Message" required rows={5} style={{ width: "100%", padding: 10, marginBottom: 12, borderRadius: 8, border: "1px solid #EAECF0" }} />
            <button type="submit" style={{ padding: "10px 18px", background: "#6C63FF", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>Envoyer</button>
          </form>
        )}
      </div>
    </div>
  );
}
