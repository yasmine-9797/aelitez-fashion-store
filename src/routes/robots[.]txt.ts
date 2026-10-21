import { createFileRoute } from "@tanstack/react-router";
import { absoluteUrl } from "@/lib/seo";

/** Allows the storefront, keeps private areas out of search, and points crawlers at the sitemap. */
export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: () =>
        new Response(
          ["User-agent: *", "Allow: /", "Disallow: /account", "Disallow: /checkout", "Disallow: /cart", "Disallow: /admin", "Disallow: /reset-password", "Disallow: /verify-email", "", `Sitemap: ${absoluteUrl("/sitemap.xml")}`, ""].join("\n"),
          { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" } },
        ),
    },
  },
});
