import fs from "node:fs/promises";
import path from "node:path";
import nodemailer, { type Transporter } from "nodemailer";
import { emailEnabled, env, isTest } from "../config/env.ts";
import { logger, maskEmail } from "./logger.ts";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Messages "sent" during tests, for assertions. */
export const testOutbox: MailMessage[] = [];

let transporter: Transporter | undefined;
function getTransporter(): Transporter {
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? "" } } : {}),
  });
  return transporter;
}

/**
 * Sends an email. Returns false when email is not configured. Without SMTP, development
 * writes messages to ./.outbox so flows can be tried locally; production only logs that
 * nothing was sent (never the message, which may contain a token).
 */
export async function sendMail(message: MailMessage): Promise<boolean> {
  if (isTest) {
    testOutbox.push(message);
    return true;
  }
  if (emailEnabled) {
    await getTransporter().sendMail({ from: env.MAIL_FROM, ...message });
    return true;
  }
  if (env.NODE_ENV === "development") {
    const dir = path.resolve(".outbox");
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${Date.now()}-${message.subject.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.html`);
    await fs.writeFile(file, `<!-- To: ${message.to} | Subject: ${message.subject} -->\n${message.html}`);
    logger.info({ file }, "SMTP not configured — email written to the local outbox");
    return false;
  }
  logger.warn({ to: maskEmail(message.to), subject: message.subject }, "SMTP not configured — email not sent");
  return false;
}

// ───────────── Templates ─────────────

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;color:#141414">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-top:4px solid #e11d24">
<tr><td style="padding:28px 32px"><p style="margin:0 0 4px;font-size:22px;font-weight:800;letter-spacing:1px">A<span style="color:#e11d24">ELITE</span>Z</p>
<p style="margin:0 0 24px;font-size:10px;letter-spacing:4px;color:#5c5c5c">CLOTHINGS</p>
<h1 style="font-size:20px;margin:0 0 16px">${escape(title)}</h1>${bodyHtml}
<p style="margin:32px 0 0;font-size:12px;color:#5c5c5c">AELITEZ CLOTHINGS · No. 49, ABT Road, Karuvampalayam, Tiruppur, Tamil Nadu, India</p>
</td></tr></table></td></tr></table></body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${escape(href)}" style="background:#e11d24;color:#ffffff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:700">${escape(label)}</a></p>`;

export function passwordResetEmail(to: string, name: string, link: string): MailMessage {
  return {
    to,
    subject: "Reset your AELITEZ password",
    text: `Hi ${name},\n\nUse this link to reset your password (valid for 30 minutes):\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
    html: layout(
      "Reset your password",
      `<p>Hi ${escape(name)},</p><p>Use the button below to choose a new password. The link is valid for 30 minutes.</p>${button(link, "Reset password")}<p style="font-size:13px;color:#5c5c5c">If you didn't ask for this, you can safely ignore this email.</p>`,
    ),
  };
}

export function verificationEmail(to: string, name: string, link: string): MailMessage {
  return {
    to,
    subject: "Confirm your email for AELITEZ",
    text: `Hi ${name},\n\nConfirm your email address:\n${link}\n\nThis link is valid for 24 hours.`,
    html: layout("Confirm your email", `<p>Hi ${escape(name)},</p><p>Please confirm your email address to finish setting up your account.</p>${button(link, "Confirm email")}`),
  };
}

export function orderConfirmationEmail(to: string, name: string, orderNumber: string, totalText: string, link: string): MailMessage {
  return {
    to,
    subject: `Order ${orderNumber} confirmed`,
    text: `Hi ${name},\n\nThank you! Your order ${orderNumber} (${totalText}) is confirmed.\nTrack it here: ${link}`,
    html: layout(
      `Order ${orderNumber} confirmed`,
      `<p>Hi ${escape(name)},</p><p>Thank you for shopping with us. Your order <strong>${escape(orderNumber)}</strong> for <strong>${escape(totalText)}</strong> is confirmed.</p>${button(link, "Track your order")}`,
    ),
  };
}
