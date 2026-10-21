import { createFileRoute } from "@tanstack/react-router";
import { ProductListing } from "@/components/shop/ProductListing";
import { fetchProducts, qk } from "@/lib/queries";
import { toApiQuery, validateShopSearch } from "@/lib/shop-search";
import { pageHead } from "@/lib/seo";

const DEPARTMENT = undefined;

export const Route = createFileRoute("/_store/shop")({
  validateSearch: validateShopSearch,
  loaderDeps: ({ search }) => search,
  // First page is rendered on the server (SEO); later filter changes are fetched in the browser.
  loader: ({ deps, context }) => {
    const query = toApiQuery(deps, DEPARTMENT);
    return context.queryClient.ensureQueryData({ queryKey: qk.products(query), queryFn: () => fetchProducts(query) }).catch(() => null);
  },
  head: ({ match }) =>
    pageHead({
      title: "Shop kids' & women's fashion",
      description: "Shop the full AELITEZ CLOTHINGS collection of kids' and women's fashion — dresses, ethnic wear, co-ords, party wear and everyday essentials.",
      path: match.search.category ? `/shop?category=${match.search.category}` : "/shop",
      noindex: Boolean(match.search.q || match.search.sizes || match.search.colors || match.search.minPrice || match.search.maxPrice || match.search.page),
    }),
  component: Page,
});

function Page() {
  const search = Route.useSearch();
  const initial = Route.useLoaderData();
  return <ProductListing path="/shop" search={search} {...(DEPARTMENT ? { department: DEPARTMENT } : {})} eyebrow="Shop all" title="Shop all" intro="Every new drop for kids and women — trend-led styles, premium feel, prices that make sense." initialData={initial} />;
}
