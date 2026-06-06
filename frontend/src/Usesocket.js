// ─────────────────────────────────────────────────────────────
//  useSocket.js  —  React hook for Socket.io connection
//  Usage: const { socket, connected } = useSocket()
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { tokenStorage } from "./api";

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace("/api", "") || "http://localhost:5000";

let sharedSocket = null; // singleton

export function useSocket() {
  const [connected, setConnected] = useState(false);
  const [token, setToken] = useState(() => tokenStorage.get());
  const socketRef = useRef(null);

  useEffect(() => {
    const syncToken = () => setToken(tokenStorage.get());
    window.addEventListener("storage", syncToken);
    window.addEventListener("auth:token", syncToken);
    window.addEventListener("auth:logout", syncToken);
    return () => {
      window.removeEventListener("storage", syncToken);
      window.removeEventListener("auth:token", syncToken);
      window.removeEventListener("auth:logout", syncToken);
    };
  }, []);

  useEffect(() => {
    if (!token) {
      // Ensure we don't keep an authenticated socket alive after logout
      if (sharedSocket) {
        sharedSocket.disconnect();
        sharedSocket = null;
      }
      setConnected(false);
      return;
    }

    if (!sharedSocket) {
      sharedSocket = io(SOCKET_URL, {
        auth: { token },
        transports: ["websocket"],
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });
    } else {
      // Token may have changed (refresh/login). Update auth and reconnect.
      sharedSocket.auth = { token };
      if (!sharedSocket.connected) sharedSocket.connect();
    }

    socketRef.current = sharedSocket;

    const onConnect    = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    sharedSocket.on("connect",    onConnect);
    sharedSocket.on("disconnect", onDisconnect);
    setTimeout(() => setConnected(sharedSocket.connected), 0);

    return () => {
      sharedSocket.off("connect",    onConnect);
      sharedSocket.off("disconnect", onDisconnect);
    };
  }, [token]);

  return { socket: sharedSocket, connected };
}