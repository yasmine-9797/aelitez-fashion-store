// Request/form schemas shared by the storefront (react-hook-form) and the API (request validation).
import { z } from "zod";

// ───────────── India-specific rules ─────────────

export const INDIAN_STATES = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
] as const;
export type IndianState = (typeof INDIAN_STATES)[number];

/** Strips spaces/dashes and a leading +91, 91 or 0 so "+91 98765-43210" → "9876543210". */
export function normalizeIndianPhone(input: string): string {
  const digits = input.replace(/[\s\-().]/g, "").replace(/^\+/, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

/** Indian mobile numbers are 10 digits starting with 6, 7, 8 or 9. */
export const isValidIndianMobile = (phone: string): boolean => /^[6-9]\d{9}$/.test(phone);

/** Indian PIN codes are six digits and never start with 0. */
export const isValidPincode = (pin: string): boolean => /^[1-9]\d{5}$/.test(pin);

// ───────────── Primitives ─────────────

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email address")
  .max(254, "Email address is too long")
  .email("Enter a valid email address")
  .transform((v) => v.toLowerCase());

export const phoneSchema = z
  .string()
  .trim()
  .min(1, "Enter a mobile number")
  .transform(normalizeIndianPhone)
  .refine(isValidIndianMobile, "Enter a valid 10-digit Indian mobile number");

export const pincodeSchema = z
  .string()
  .trim()
  .refine(isValidPincode, "Enter a valid 6-digit PIN code");

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(128, "Use at most 128 characters")
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Include at least one letter and one number");

const nameSchema = z.string().trim().min(2, "Enter your full name").max(80, "Name is too long");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

// ───────────── Auth & profile ─────────────

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  marketingConsent: z.boolean().optional(),
});
export type RegisterInput = z.input<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(128),
});
export type LoginInput = z.input<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password").max(128),
  newPassword: passwordSchema,
});

export const profileSchema = z.object({
  name: nameSchema,
  phone: phoneSchema.optional().or(z.literal("").transform(() => undefined)),
  marketingConsent: z.boolean().optional(),
});
export type ProfileInput = z.input<typeof profileSchema>;

// ───────────── Addresses & checkout ─────────────

export const addressSchema = z.object({
  fullName: nameSchema,
  phone: phoneSchema,
  line1: z.string().trim().min(3, "Enter the house/flat number and street").max(120),
  line2: optionalText(120),
  landmark: optionalText(80),
  city: z.string().trim().min(2, "Enter your city").max(60),
  state: z.enum(INDIAN_STATES, { errorMap: () => ({ message: "Select your state" }) }),
  pincode: pincodeSchema,
  isDefault: z.boolean().optional(),
});
export type AddressInput = z.input<typeof addressSchema>;
export type Address = z.output<typeof addressSchema>;

export const contactSchema = z.object({ email: emailSchema, phone: phoneSchema });

export const checkoutSchema = z
  .object({
    contact: contactSchema,
    addressId: z.string().min(1).max(40).optional(),
    address: addressSchema.optional(),
    saveAddress: z.boolean().optional(),
    shippingMethodCode: z.string().min(1).max(40),
    paymentMethod: z.enum(["RAZORPAY", "COD"]),
    couponCode: z.string().trim().max(40).optional(),
  })
  .refine((v) => Boolean(v.addressId) !== Boolean(v.address), {
    message: "Choose a saved address or enter a new one",
    path: ["address"],
  });
export type CheckoutInput = z.input<typeof checkoutSchema>;

export const couponCodeSchema = z
  .string()
  .trim()
  .min(2, "Enter a coupon code")
  .max(40)
  .transform((v) => v.toUpperCase());

// ───────────── Cart & wishlist ─────────────

export const addCartItemSchema = z.object({
  variantId: z.string().min(1).max(40),
  quantity: z.number().int().min(1).max(99),
});

export const updateCartItemSchema = z.object({ quantity: z.number().int().min(1).max(99) });

// ───────────── After-sales ─────────────

export const reviewSchema = z.object({
  rating: z.number().int().min(1, "Choose a rating").max(5),
  title: optionalText(80),
  body: z.string().trim().min(10, "Tell us a little more (at least 10 characters)").max(2000),
});
export type ReviewInput = z.input<typeof reviewSchema>;

export const RETURN_REASONS = {
  SIZE_ISSUE: "Size or fit issue",
  DAMAGED: "Item arrived damaged or defective",
  WRONG_ITEM: "Received the wrong item",
  NOT_AS_DESCRIBED: "Item not as described",
  OTHER: "Other",
} as const;
export type ReturnReason = keyof typeof RETURN_REASONS;

export const returnRequestSchema = z.object({
  reason: z.enum(Object.keys(RETURN_REASONS) as [ReturnReason, ...ReturnReason[]]),
  details: optionalText(1000),
});
export type ReturnRequestInput = z.input<typeof returnRequestSchema>;

export const newsletterSchema = z.object({
  email: emailSchema,
  consent: z.literal(true, { errorMap: () => ({ message: "Please tick the consent box to continue" }) }),
  source: z.string().max(40).optional(),
});
