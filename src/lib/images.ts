// Responsive image helpers. Uploaded images come in two WebP sizes (…-800 / …-1600); Pexels
// demo images are resized by their CDN; anything else is used as-is.

const PEXELS = /^https:\/\/images\.pexels\.com\//;
const UPLOAD = /-1600\.webp$/;

/** URL for an image at roughly `width` pixels wide (4:5 crop for Pexels). */
export function imageAt(url: string, width: number): string {
  if (PEXELS.test(url)) {
    const u = new URL(url);
    u.searchParams.set("w", String(width));
    u.searchParams.set("h", String(Math.round(width * 1.25)));
    return u.toString();
  }
  if (UPLOAD.test(url) && width <= 800) return url.replace(UPLOAD, "-800.webp");
  return url;
}

export function srcSet(url: string): string | undefined {
  if (PEXELS.test(url)) return [400, 600, 800, 1200].map((w) => `${imageAt(url, w)} ${w}w`).join(", ");
  if (UPLOAD.test(url)) return `${url.replace(UPLOAD, "-800.webp")} 800w, ${url} 1600w`;
  return undefined;
}
