
// ─────────────────────────────────────────────────────────────
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import api, { tokenStorage } from "./api";

// ── Context ───────────────────────────────────────────────────
const AuthContext = createContext(null);

// ── Provider ──────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);   // true while checking stored token
  const [error,   setError]   = useState(null);

  // On mount: rehydrate from stored token
 // On mount: rehydrate from stored token
useEffect(() => {
  const token = tokenStorage.get();

  const rehydrate = async () => {
    if (!token) { setLoading(false); return; }
    try {
      const u = await api.auth.me();
      setUser(u);
    } catch {
      tokenStorage.remove();
    } finally {
      setLoading(false);
    }
  };

  rehydrate();
}, []);
  // Listen for forced logout (401 from api.js)
  useEffect(() => {
    const handle = () => { setUser(null); };
    window.addEventListener("auth:logout", handle);
    return () => window.removeEventListener("auth:logout", handle);
  }, []);

  const login = useCallback(async (email, password) => {
    setError(null);
    const { token, user: u } = await api.auth.login(email, password);
    tokenStorage.set(token);
    setUser(u);
    return u;
  }, []);

  const register = useCallback(async (data) => {
    setError(null);
    const res = await api.auth.register(data);
    if (res.pending) {
      return { pending: true, message: res.message, user: res.user };
    }
    tokenStorage.set(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(() => {
    tokenStorage.remove();
    setUser(null);
    api.auth.logout().catch(() => {});
  }, []);

  const updateUser = useCallback((patch) => {
    setUser(prev => ({ ...prev, ...patch }));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
