// "Recently viewed" is a per-browser convenience (slugs only), not account data.
import { useCallback, useEffect, useState } from "react";

const KEY = "aez-recently-viewed";
const MAX = 12;

function read(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function useRecentlyViewed(currentSlug?: string) {
  const [slugs, setSlugs] = useState<string[]>([]);
  useEffect(() => setSlugs(read()), []);
  const record = useCallback((slug: string) => {
    const next = [slug, ...read().filter((s) => s !== slug)].slice(0, MAX);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable — fine */
    }
    setSlugs(next);
  }, []);
  return { slugs: currentSlug ? slugs.filter((s) => s !== currentSlug) : slugs, record };
}
