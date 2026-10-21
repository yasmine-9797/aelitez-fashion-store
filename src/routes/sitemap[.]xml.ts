import { createFileRoute } from "@tanstack/react-router";
import type { CategoryDTO, ProductListDTO } from "@shared/types";
import { API_URL } from "@/lib/api";
import { absoluteUrl } from "@/lib/seo";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1${path}`);
    return res.ok ? ((await res.json()) as { data: T }).data : null;
  } catch {
    return null;
  }
}

/** XML sitemap built from the live catalogue (published products and non-empty categories). */
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const urls: { loc: string; lastmod?: string }[] = ["/", "/shop", "/kids", "/women", ...["shipping", "returns", "privacy", "terms"].map((p) => `/policies/${p}`)].map((p) => ({ loc: absoluteUrl(p) }));
        const flat = (cats: CategoryDTO[]): CategoryDTO[] => cats.flatMap((c) => [c, ...flat(c.children)]);
        const categories = (await getJson<CategoryDTO[]>("/categories?nonEmpty=1")) ?? [];
        for (const c of flat(categories)) urls.push({ loc: absoluteUrl(`/${c.department === "KIDS" ? "kids" : "women"}?category=${c.slug}`) });
        for (let page = 1; page <= 50; page++) {
          const list = await getJson<ProductListDTO>(`/products?pageSize=48&page=${page}`);
          if (!list) break;
          for (const p of list.items) urls.push({ loc: absoluteUrl(`/products/${p.slug}`) });
          if (page >= list.meta.totalPages) break;
        }
        const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(u.loc)}</loc></url>`).join("\n")}\n</urlset>\n`;
        return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
      },
    },
  },
});
