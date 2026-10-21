// API response shapes (DTOs) shared by the API and the storefront.
import type { Department, SizeGroup } from "./catalog";
import type { OrderPaymentStatus, OrderStatus, PaymentMethod } from "./order-status";

/** Every successful response is `{ data }`; list endpoints add `meta`. */
export interface ApiSuccess<T> {
  data: T;
}
export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
export interface ApiPage<T> {
  data: T[];
  meta: PageMeta;
}
/** Every error response is `{ error }`. `details` carries field errors for validation failures. */
export interface ApiErrorBody {
  error: { code: string; message: string; details?: Record<string, string[]> };
}

export type Role = "CUSTOMER" | "STAFF" | "ADMIN";

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  role: Role;
  emailVerified: boolean;
  phone: string | null;
  marketingConsent: boolean;
}

export interface AppConfigDTO {
  payments: { razorpay: { enabled: boolean; keyId: string | null }; cod: { enabled: boolean } };
  emailEnabled: boolean;
  returnWindowDays: number;
  maxCartQuantity: number;
}

// ───────────── Catalogue ─────────────

export interface CategoryDTO {
  id: string;
  name: string;
  slug: string;
  department: Department;
  parentId: string | null;
  description: string | null;
  isFeatured: boolean;
  /** Active, published products in this category or its descendants. */
  productCount: number;
  children: CategoryDTO[];
}

export interface ImageDTO {
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
  colorId: string | null;
}

export interface ColorDTO {
  id: string;
  name: string;
  hex: string;
}

export interface SizeDTO {
  id: string;
  label: string;
  group: SizeGroup;
  ageGuidance: string | null;
}

export interface ProductCardDTO {
  id: string;
  slug: string;
  name: string;
  department: Department;
  pricePaise: number;
  compareAtPaise: number | null;
  discountPercent: number;
  image: ImageDTO | null;
  hoverImage: ImageDTO | null;
  colors: ColorDTO[];
  inStock: boolean;
  isNew: boolean;
  ratingAvg: number | null;
  ratingCount: number;
}

export interface VariantDTO {
  id: string;
  sku: string;
  size: SizeDTO;
  color: ColorDTO;
  pricePaise: number;
  /** Units the customer can buy now (capped at the cart maximum). */
  available: number;
  lowStock: boolean;
}

export interface ProductDetailDTO extends ProductCardDTO {
  description: string;
  fabric: string | null;
  care: string | null;
  specs: { label: string; value: string }[];
  images: ImageDTO[];
  variants: VariantDTO[];
  categories: { name: string; slug: string }[];
  ageMinMonths: number | null;
  ageMaxMonths: number | null;
  publishedAt: string | null;
}

export interface ProductFacetsDTO {
  sizes: (SizeDTO & { count: number })[];
  colors: (ColorDTO & { count: number })[];
  priceRange: { minPaise: number; maxPaise: number } | null;
  /** True once any product has real sales — only then is "Most popular" sorting offered. */
  hasSalesData: boolean;
}

export interface ProductListDTO {
  items: ProductCardDTO[];
  meta: PageMeta;
  facets: ProductFacetsDTO;
}

export interface ReviewDTO {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  authorName: string;
  verifiedPurchase: boolean;
  createdAt: string;
}

// ───────────── Cart ─────────────

export type CartIssue = "OUT_OF_STOCK" | "QUANTITY_REDUCED" | "UNAVAILABLE";

export interface CartItemDTO {
  id: string;
  variantId: string;
  productId: string;
  productSlug: string;
  productName: string;
  sku: string;
  size: string;
  color: string;
  image: ImageDTO | null;
  unitPricePaise: number;
  compareAtPaise: number | null;
  quantity: number;
  lineTotalPaise: number;
  available: number;
  issue: CartIssue | null;
}

export interface CartDTO {
  id: string;
  items: CartItemDTO[];
  itemCount: number;
  subtotalPaise: number;
  /** True when every line can be bought as-is. */
  purchasable: boolean;
}

export interface ShippingMethodDTO {
  code: string;
  name: string;
  description: string | null;
  feePaise: number;
  freeAbovePaise: number | null;
  minDays: number;
  maxDays: number;
  codAllowed: boolean;
}

export interface CheckoutQuoteDTO {
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  totalPaise: number;
  coupon: { code: string; description: string | null } | null;
  couponError: string | null;
  shippingMethod: ShippingMethodDTO | null;
}

// ───────────── Orders ─────────────

export interface OrderItemDTO {
  id: string;
  productSlug: string;
  productName: string;
  sku: string;
  size: string;
  color: string;
  imageUrl: string | null;
  unitPricePaise: number;
  quantity: number;
  lineTotalPaise: number;
}

export interface OrderSummaryDTO {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  paymentMethod: PaymentMethod;
  totalPaise: number;
  itemCount: number;
  createdAt: string;
}

export interface OrderDetailDTO extends OrderSummaryDTO {
  email: string;
  phone: string;
  items: OrderItemDTO[];
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  couponCode: string | null;
  shippingAddress: {
    fullName: string;
    phone: string;
    line1: string;
    line2: string | null;
    landmark: string | null;
    city: string;
    state: string;
    pincode: string;
  };
  shippingMethod: { code: string; name: string; minDays: number; maxDays: number };
  shipment: { carrier: string; trackingNumber: string | null; trackingUrl: string | null; shippedAt: string | null; deliveredAt: string | null } | null;
  events: { status: OrderStatus; note: string | null; createdAt: string }[];
  paidAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  deliveredAt: string | null;
  reservationExpiresAt: string | null;
  canCancel: boolean;
  canRequestReturn: boolean;
  returnRequest: { status: string; reason: string; createdAt: string } | null;
}

export interface CheckoutResultDTO {
  order: OrderDetailDTO;
  /** Present for online payment — pass to Razorpay Checkout. */
  razorpay: { keyId: string; orderId: string; amountPaise: number; currency: string; name: string; email: string; phone: string } | null;
}

export interface AddressDTO {
  id: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}
