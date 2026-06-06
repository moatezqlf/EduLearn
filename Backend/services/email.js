/**
 * Email service — uses SMTP when configured, otherwise logs to console.
 * Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM in .env
 */

export async function sendEmail({ to, subject, html, text }) {
  const from = process.env.SMTP_FROM || "edulearn@localhost";
  const body = text || html?.replace(/<[^>]+>/g, " ") || "";

  if (!process.env.SMTP_HOST) {
    console.log("[Email — dev mode]", { to, subject, body: body.slice(0, 200) });
    return { sent: true, mode: "console" };
  }

  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
    await transporter.sendMail({ from, to, subject, html, text: body });
    return { sent: true, mode: "smtp" };
  } catch (err) {
    console.error("[Email error]", err.message);
    throw new Error("Failed to send email");
  }
}
