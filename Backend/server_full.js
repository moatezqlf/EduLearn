// ─────────────────────────────────────────────────────────────
//  server_full.js  —  Entry point with Socket.io
// ─────────────────────────────────────────────────────────────
// Charger .env AVANT routes.js (sinon GEMINI_API_KEY / JWT sont undefined)
import "dotenv/config";

import http    from "http";
import express from "express";
import cors    from "cors";
import { connectDB } from "./models.js";
import router        from "./routes.js";
import { initSocket } from "./Socket.server.js";
await connectDB();

const app    = express();
const server = http.createServer(app);
app.use(cors({ origin: true, credentials: true }));
// app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173", credentials: true }));
app.use(express.json({ limit: "5mb" }));
app.use("/api", router);
app.use("/uploads", express.static("uploads"));

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: err.message || "Internal server error" });
});

// Init Socket.io — creates io, stores it for getIO(), registers all events
initSocket(server);

server.listen(process.env.PORT || 5000, () =>
  console.log(`EduLearn API + Socket.io → http://localhost:${process.env.PORT || 5000}`)
);