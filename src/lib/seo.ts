// Page metadata helpers. SITE_URL drives canonical URLs, Open Graph and the sitemap.
export const SITE_NAME = "AELITEZ CLOTHINGS";
export const SITE_URL = String(import.meta.env.VITE_SITE_URL ?? "http://localhost:8080").replace(/\/$/, "");

export const absoluteUrl = (path: string) => `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;

interface PageMeta {
  title: string;
  description: string;
  path: string;
  image?: string | undefined;
  noindex?: boolean;
  type?: "website" | "product";
}

/** Title, description, canonical, Open Graph and Twitter tags for a route `head()`. */
export function pageHead({ title, description, path, image, noindex, type = "website" }: PageMeta) {
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
  return {
    meta: [
      { title: fullTitle },
      { name: "description", content: description },
      { property: "og:title", content: fullTitle },
      { property: "og:description", content: description },
      { property: "og:type", content: type },
      { property: "og:url", content: absoluteUrl(path) },
      { property: "og:site_name", content: SITE_NAME },
      ...(image ? [{ property: "og:image", content: image }, { name: "twitter:image", content: image }] : []),
      { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
      ...(noindex ? [{ name: "robots", content: "noindex, nofollow" }] : []),
    ],
    links: [{ rel: "canonical", href: absoluteUrl(path) }],
  };
}

/** Pages that are personal or transactional — never indexed. */
export const privateHead = (title: string) => ({
  meta: [{ title: `${title} | ${SITE_NAME}` }, { name: "robots", content: "noindex, nofollow" }],
});
