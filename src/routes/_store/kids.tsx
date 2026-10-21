import { createFileRoute } from "@tanstack/react-router";
import { ProductListing } from "@/components/shop/ProductListing";
import { fetchProducts, qk } from "@/lib/queries";
import { toApiQuery, validateShopSearch } from "@/lib/shop-search";
import { pageHead } from "@/lib/seo";

const DEPARTMENT = "KIDS" as const;

export const Route = createFileRoute("/_store/kids")({
  validateSearch: validateShopSearch,
  loaderDeps: ({ search }) => search,
  // First page is rendered on the server (SEO); later filter changes are fetched in the browser.
  loader: ({ deps, context }) => {
    const query = toApiQuery(deps, DEPARTMENT);
    return context.queryClient.ensureQueryData({ queryKey: qk.products(query), queryFn: () => fetchProducts(query) }).catch(() => null);
  },
  head: ({ match }) =>
    pageHead({
      title: "Kids' clothing — baby, girls, boys & teens",
      description: "Shop kids' clothing at AELITEZ CLOTHINGS — baby and infant essentials, toddler outfits, girls' and boys' clothing, party wear and ethnic sets.",
      path: match.search.category ? `/kids?category=${match.search.category}` : "/kids",
      noindex: Boolean(match.search.q || match.search.sizes || match.search.colors || match.search.minPrice || match.search.maxPrice || match.search.page),
    }),
  component: Page,
});

function Page() {
  const search = Route.useSearch();
  const initial = Route.useLoaderData();
  return <ProductListing path="/kids" search={search} {...(DEPARTMENT ? { department: DEPARTMENT } : {})} eyebrow="Kids' collection" title="Kids" intro="Baby basics, toddler outfits, girls' and boys' clothing, teen styles, party wear and festive ethnic sets." initialData={initial} />;
}
