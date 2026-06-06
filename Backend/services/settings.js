import { PlatformSettings } from "../models.js";

const DEFAULTS = {
  ai_feedback: true,
  peer_review: true,
  auto_grade: false,
  email_notifs: true,
  maintenance: false,
  open_reg: true,
  auto_approve_registrations: true,
};

export async function getPlatformSettings() {
  let doc = await PlatformSettings.findOne({ key: "global" });
  if (!doc) {
    doc = await PlatformSettings.create({ key: "global", ...DEFAULTS });
  }
  return { ...DEFAULTS, ...doc.toObject() };
}

export async function updatePlatformSettings(patch) {
  const doc = await PlatformSettings.findOneAndUpdate(
    { key: "global" },
    { $set: patch },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return { ...DEFAULTS, ...doc.toObject() };
}
