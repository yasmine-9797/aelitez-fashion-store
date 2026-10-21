import { createFileRoute } from "@tanstack/react-router";
import { ProductListing } from "@/components/shop/ProductListing";
import { fetchProducts, qk } from "@/lib/queries";
import { toApiQuery, validateShopSearch } from "@/lib/shop-search";
import { pageHead } from "@/lib/seo";

const DEPARTMENT = "WOMEN" as const;

export const Route = createFileRoute("/_store/women")({
  validateSearch: validateShopSearch,
  loaderDeps: ({ search }) => search,
  // First page is rendered on the server (SEO); later filter changes are fetched in the browser.
  loader: ({ deps, context }) => {
    const query = toApiQuery(deps, DEPARTMENT);
    return context.queryClient.ensureQueryData({ queryKey: qk.products(query), queryFn: () => fetchProducts(query) }).catch(() => null);
  },
  head: ({ match }) =>
    pageHead({
      title: "Women's clothing — ethnic, western & occasion wear",
      description: "Shop women's fashion at AELITEZ CLOTHINGS — kurtas, co-ord sets, dresses, tops, jeans, sarees, lehengas and occasion wear.",
      path: match.search.category ? `/women?category=${match.search.category}` : "/women",
      noindex: Boolean(match.search.q || match.search.sizes || match.search.colors || match.search.minPrice || match.search.maxPrice || match.search.page),
    }),
  component: Page,
});

function Page() {
  const search = Route.useSearch();
  const initial = Route.useLoaderData();
  return <ProductListing path="/women" search={search} {...(DEPARTMENT ? { department: DEPARTMENT } : {})} eyebrow="Women's collection" title="Women" intro="Kurtas, co-ord sets, dresses, tops, jeans, occasion wear and accessories — premium looks for less." initialData={initial} />;
}
