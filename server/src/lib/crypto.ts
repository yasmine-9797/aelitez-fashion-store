import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** 256-bit random token, URL-safe. */
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString("base64url");

export const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

export const hmacSha256Hex = (secret: string, payload: string | Buffer): string =>
  createHmac("sha256", secret).update(payload).digest("hex");

/** Constant-time string comparison (false for different lengths). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
