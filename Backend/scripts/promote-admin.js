/**
 * Promouvoir un utilisateur en administrateur (validation des comptes).
 * Usage: node Backend/scripts/promote-admin.js votre@email.com
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { User } from "../models.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Usage: node Backend/scripts/promote-admin.js <email>");
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/edulearn");
const user = await User.findOneAndUpdate(
  { email },
  { role: "admin", status: "active" },
  { returnDocument: "after" }
);
if (!user) {
  console.error("Utilisateur introuvable:", email);
  process.exit(1);
}
console.log("✓ Compte admin actif:", user.email, "— connectez-vous sur /login puis /admin");
process.exit(0);
