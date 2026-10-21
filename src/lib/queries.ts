// TanStack Query hooks for server state. The API is the source of truth for prices, stock,
// cart totals and orders — the UI only renders what it returns.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProductListQuery } from "@shared/catalog";
import type {
  AddressDTO,
  AppConfigDTO,
  CartDTO,
  CategoryDTO,
  CheckoutQuoteDTO,
  CheckoutResultDTO,
  OrderDetailDTO,
  OrderSummaryDTO,
  ProductCardDTO,
  ProductDetailDTO,
  ProductListDTO,
  ReviewDTO,
  ShippingMethodDTO,
  UserDTO,
} from "@shared/types";
import type { AddressInput, CheckoutInput, ProfileInput, RegisterInput, ReturnRequestInput, ReviewInput } from "@shared/validation";
import { api, apiConfigured, apiPage } from "./api";

export const qk = {
  config: ["config"] as const,
  me: ["me"] as const,
  cart: ["cart"] as const,
  wishlist: ["wishlist"] as const,
  home: ["home"] as const,
  shipping: ["shipping-methods"] as const,
  addresses: ["addresses"] as const,
  categories: (department?: string) => ["categories", department ?? "all"] as const,
  products: (q: Partial<ProductListQuery>) => ["products", q] as const,
  product: (slug: string) => ["product", slug] as const,
  related: (slug: string) => ["related", slug] as const,
  reviews: (slug: string, page: number) => ["reviews", slug, page] as const,
  eligibility: (slug: string) => ["review-eligibility", slug] as const,
  lookup: (slugs: string[]) => ["lookup", slugs.join(",")] as const,
  search: (q: string) => ["search", q] as const,
  orders: (page: number) => ["orders", page] as const,
  order: (id: string) => ["order", id] as const,
};

export interface HomeData {
  newArrivals: ProductCardDTO[];
  bestsellers: ProductCardDTO[];
  onSale: ProductCardDTO[];
  kids: ProductCardDTO[];
  women: ProductCardDTO[];
  featuredCategories: CategoryDTO[];
  testimonials: (ReviewDTO & { product: { name: string; slug: string } })[];
}

export interface ReviewsData {
  reviews: ReviewDTO[];
  meta: { page: number; total: number; totalPages: number };
  summary: { ratingAvg: number | null; ratingCount: number; distribution: { star: number; count: number }[] };
}

// ───────────── Fetchers (also used by route loaders for SSR) ─────────────

export const fetchHome = () => api<HomeData>("/home");
export const fetchProduct = (slug: string) => api<ProductDetailDTO>(`/products/${encodeURIComponent(slug)}`);
export const fetchProducts = (q: Partial<ProductListQuery>) => api<ProductListDTO>("/products", { query: q as Record<string, string> });
export const fetchCategories = (department?: string) => api<CategoryDTO[]>("/categories", { query: { department, nonEmpty: "1" } });

// ───────────── Session & config ─────────────

export function useConfig() {
  return useQuery({ queryKey: qk.config, queryFn: () => api<AppConfigDTO>("/config"), staleTime: 5 * 60_000, enabled: apiConfigured });
}

export function useMe() {
  return useQuery({ queryKey: qk.me, queryFn: () => api<UserDTO | null>("/auth/me"), staleTime: 60_000, retry: false, enabled: apiConfigured });
}

function useSessionChanged() {
  const qc = useQueryClient();
  return async (user: UserDTO | null) => {
    qc.setQueryData(qk.me, user);
    await Promise.all([qc.invalidateQueries({ queryKey: qk.cart }), qc.invalidateQueries({ queryKey: qk.wishlist }), qc.invalidateQueries({ queryKey: qk.addresses })]);
    qc.removeQueries({ queryKey: ["orders"] });
    qc.removeQueries({ queryKey: ["order"] });
  };
}

export function useLogin() {
  const changed = useSessionChanged();
  return useMutation({ mutationFn: (body: { email: string; password: string }) => api<UserDTO>("/auth/login", { method: "POST", body }), onSuccess: changed });
}

export function useRegister() {
  const changed = useSessionChanged();
  return useMutation({ mutationFn: (body: RegisterInput) => api<UserDTO>("/auth/register", { method: "POST", body }), onSuccess: changed });
}

export function useLogout() {
  const changed = useSessionChanged();
  return useMutation({ mutationFn: () => api("/auth/logout", { method: "POST" }), onSuccess: () => changed(null) });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: ProfileInput) => api<UserDTO>("/account/profile", { method: "PATCH", body }), onSuccess: (u) => qc.setQueryData(qk.me, u) });
}

// ───────────── Catalogue ─────────────

export function useHome(initialData?: HomeData | null) {
  return useQuery({ queryKey: qk.home, queryFn: fetchHome, staleTime: 60_000, enabled: apiConfigured, ...(initialData ? { initialData } : {}) });
}

export function useCategories(department?: string) {
  return useQuery({ queryKey: qk.categories(department), queryFn: () => fetchCategories(department), staleTime: 5 * 60_000, enabled: apiConfigured });
}

/** `initialData` is the server-rendered page — passing it avoids a refetch (and a hydration mismatch). */
export function useProducts(q: Partial<ProductListQuery>, initialData?: ProductListDTO | null) {
  return useQuery({
    queryKey: qk.products(q),
    queryFn: () => fetchProducts(q),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    enabled: apiConfigured,
    ...(initialData ? { initialData } : {}),
  });
}

export function useProduct(slug: string, initialData?: ProductDetailDTO) {
  return useQuery({ queryKey: qk.product(slug), queryFn: () => fetchProduct(slug), staleTime: 30_000, ...(initialData ? { initialData } : {}) });
}

export function useRelated(slug: string) {
  return useQuery({ queryKey: qk.related(slug), queryFn: () => api<ProductCardDTO[]>(`/products/${encodeURIComponent(slug)}/related`), staleTime: 60_000 });
}

export function useLookup(slugs: string[]) {
  return useQuery({ queryKey: qk.lookup(slugs), queryFn: () => api<ProductCardDTO[]>("/products/lookup", { query: { slugs } }), enabled: apiConfigured && slugs.length > 0, staleTime: 60_000 });
}

export function useSearch(q: string) {
  return useQuery({
    queryKey: qk.search(q),
    queryFn: ({ signal }) => api<{ products: ProductCardDTO[]; categories: { name: string; slug: string; department: string }[] }>("/search", { query: { q }, signal }),
    enabled: apiConfigured && q.trim().length >= 2,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function useReviews(slug: string, page: number) {
  return useQuery({ queryKey: qk.reviews(slug, page), queryFn: () => api<ReviewsData>(`/products/${encodeURIComponent(slug)}/reviews`, { query: { page } }), placeholderData: keepPreviousData });
}

export function useReviewEligibility(slug: string, enabled: boolean) {
  return useQuery({ queryKey: qk.eligibility(slug), queryFn: () => api<{ canReview: boolean; reason: string | null }>(`/products/${encodeURIComponent(slug)}/reviews/eligibility`), enabled });
}

export function useCreateReview(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ReviewInput) => api(`/products/${encodeURIComponent(slug)}/reviews`, { method: "POST", body }),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ["reviews", slug] }), qc.invalidateQueries({ queryKey: qk.eligibility(slug) }), qc.invalidateQueries({ queryKey: qk.product(slug) })]),
  });
}

// ───────────── Cart & wishlist ─────────────

export function useCart() {
  return useQuery({ queryKey: qk.cart, queryFn: () => api<CartDTO>("/cart"), staleTime: 15_000, enabled: apiConfigured });
}

function useCartMutation<V>(fn: (v: V) => Promise<CartDTO>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: (cart) => qc.setQueryData(qk.cart, cart) });
}

export const useAddToCart = () => useCartMutation((v: { variantId: string; quantity: number }) => api<CartDTO>("/cart/items", { method: "POST", body: v }));
export const useUpdateCartItem = () => useCartMutation((v: { id: string; quantity: number }) => api<CartDTO>(`/cart/items/${v.id}`, { method: "PATCH", body: { quantity: v.quantity } }));
export const useRemoveCartItem = () => useCartMutation((id: string) => api<CartDTO>(`/cart/items/${id}`, { method: "DELETE" }));

export function useWishlist(enabled: boolean) {
  return useQuery({ queryKey: qk.wishlist, queryFn: () => api<ProductCardDTO[]>("/wishlist"), enabled: apiConfigured && enabled, staleTime: 60_000 });
}

export function useToggleWishlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, saved }: { productId: string; saved: boolean }) =>
      saved ? api<ProductCardDTO[]>(`/wishlist/items/${productId}`, { method: "DELETE" }) : api<ProductCardDTO[]>("/wishlist/items", { method: "POST", body: { productId } }),
    onSuccess: (list) => qc.setQueryData(qk.wishlist, list),
  });
}

// ───────────── Addresses, checkout & orders ─────────────

export function useAddresses(enabled = true) {
  return useQuery({ queryKey: qk.addresses, queryFn: () => api<AddressDTO[]>("/account/addresses"), enabled: apiConfigured && enabled });
}

export function useSaveAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: AddressInput & { id?: string }) => (id ? api<AddressDTO[]>(`/account/addresses/${id}`, { method: "PATCH", body }) : api<AddressDTO[]>("/account/addresses", { method: "POST", body })),
    onSuccess: (list) => qc.setQueryData(qk.addresses, list),
  });
}

export function useDeleteAddress() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api<AddressDTO[]>(`/account/addresses/${id}`, { method: "DELETE" }), onSuccess: (list) => qc.setQueryData(qk.addresses, list) });
}

export function useShippingMethods() {
  return useQuery({ queryKey: qk.shipping, queryFn: () => api<ShippingMethodDTO[]>("/shipping-methods"), staleTime: 5 * 60_000, enabled: apiConfigured });
}

export function useQuote(input: { shippingMethodCode?: string | undefined; couponCode?: string | undefined }, enabled: boolean) {
  return useQuery({
    queryKey: ["quote", input],
    queryFn: () => api<CheckoutQuoteDTO>("/checkout/quote", { method: "POST", body: input }),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function usePlaceOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CheckoutInput) => api<CheckoutResultDTO>("/checkout", { method: "POST", body }),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: qk.cart }), qc.invalidateQueries({ queryKey: qk.addresses }), qc.invalidateQueries({ queryKey: ["orders"] })]),
  });
}

export function useOrders(page: number, enabled = true) {
  return useQuery({ queryKey: qk.orders(page), queryFn: () => apiPage<OrderSummaryDTO>("/orders", { query: { page } }), enabled, placeholderData: keepPreviousData });
}

export function useOrder(id: string) {
  return useQuery({ queryKey: qk.order(id), queryFn: () => api<OrderDetailDTO>(`/orders/${id}`) });
}

function useOrderMutation<V>(fn: (v: V) => Promise<OrderDetailDTO>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (order) => {
      qc.setQueryData(qk.order(order.id), order);
      void qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

export const useCancelOrder = () => useOrderMutation((v: { id: string; reason?: string }) => api<OrderDetailDTO>(`/orders/${v.id}/cancel`, { method: "POST", body: { reason: v.reason } }));
export const useRequestReturn = () => useOrderMutation((v: { id: string } & ReturnRequestInput) => api<OrderDetailDTO>(`/orders/${v.id}/returns`, { method: "POST", body: { reason: v.reason, details: v.details } }));
