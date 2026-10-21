import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { env } from "../config/env.ts";
import { badRequest } from "./errors.ts";

/**
 * File storage. This local-disk implementation serves files from /uploads. For multi-instance
 * production, swap it for object storage (S3/R2/GCS) behind the same interface — keys are
 * always generated server-side, so user input never reaches the filesystem path.
 */
export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<string>;
  remove(key: string): Promise<void>;
}

export const uploadRoot = path.resolve(env.UPLOAD_DIR);

const KEY_PATTERN = /^[a-z0-9][a-z0-9/_-]*\.[a-z0-9]+$/;

export const localStorage: Storage = {
  async put(key, body) {
    if (!KEY_PATTERN.test(key) || key.includes("..")) throw new Error("Invalid storage key");
    const file = path.join(uploadRoot, key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body);
    return `${env.PUBLIC_API_URL.replace(/\/$/, "")}/uploads/${key}`;
  },
  async remove(key) {
    if (!KEY_PATTERN.test(key) || key.includes("..")) return;
    await fs.rm(path.join(uploadRoot, key), { force: true });
  },
};

export const storage: Storage = localStorage;

const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "avif"]);
export const ALLOWED_UPLOAD_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

/**
 * Decodes and re-encodes an uploaded image: anything that is not a real image in an allowed
 * format is rejected, EXIF/metadata is stripped, orientation is applied, and two responsive
 * WebP sizes are produced (…-1600.webp for detail views, …-800.webp for grids).
 */
export async function processProductImage(input: Buffer) {
  const meta = await sharp(input, { limitInputPixels: 40_000_000 })
    .metadata()
    .catch(() => {
      throw badRequest("That file is not a valid image.", "INVALID_IMAGE");
    });
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) throw badRequest("Upload a JPEG, PNG, WebP or AVIF image.", "INVALID_IMAGE");
  if ((meta.width ?? 0) < 400 || (meta.height ?? 0) < 400) throw badRequest("Images must be at least 400×400 pixels.", "IMAGE_TOO_SMALL");

  const render = (width: number) =>
    sharp(input, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width, height: Math.round(width * 1.25), fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });

  const [large, small] = await Promise.all([render(1600), render(800)]);
  return { large: large.data, small: small.data, width: large.info.width, height: large.info.height };
}
