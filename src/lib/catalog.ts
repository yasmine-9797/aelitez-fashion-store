// SAMPLE / DEMO catalogue. Replace with real products (or fetch from an inventory API).
export type Category = "Women" | "Men" | "Ethnic & Everyday" | "Accessories";

export interface Product {
  id: string;
  name: string;
  category: Category;
  price: number; // INR
  compareAt?: number;
  colors: { name: string; hex: string }[];
  sizes: string[];
  badge?: "New" | "Bestseller";
  image: string;
  description: string;
}

const u = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&h=1000&q=75`;

export const PRODUCTS: Product[] = [
  { id: "p1", name: "Relaxed Linen-Blend Shirt", category: "Women", price: 1199, compareAt: 1599, badge: "New",
    colors: [{ name: "Ivory", hex: "#efe8da" }, { name: "Sage", hex: "#a3b18a" }], sizes: ["XS", "S", "M", "L", "XL"],
    image: u("photo-1485462537746-965f33f7f6a7"), description: "An easy oversized shirt in a breathable linen-blend — tuck it, knot it or wear it open." },
  { id: "p2", name: "Oversized Heavyweight Tee", category: "Men", price: 699, badge: "Bestseller",
    colors: [{ name: "Black", hex: "#141414" }, { name: "Off-white", hex: "#f2efe8" }, { name: "Olive", hex: "#5b5f3a" }], sizes: ["S", "M", "L", "XL", "XXL"],
    image: u("photo-1521572163474-6864f9cf17ab"), description: "Dropped shoulders, a boxy fit and soft cotton jersey. The everyday essential." },
  { id: "p3", name: "Printed Anarkali Kurta", category: "Ethnic & Everyday", price: 1499, compareAt: 1999,
    colors: [{ name: "Indigo", hex: "#2d3a6b" }, { name: "Rust", hex: "#a5502f" }], sizes: ["XS", "S", "M", "L", "XL"],
    image: u("photo-1610030469983-98e550d6193c"), description: "Flowing silhouette with an all-over print — festive enough for occasions, easy enough for everyday." },
  { id: "p4", name: "Utility Cargo Trousers", category: "Men", price: 1299, badge: "New",
    colors: [{ name: "Charcoal", hex: "#2b2b2b" }, { name: "Khaki", hex: "#b59f74" }], sizes: ["28", "30", "32", "34", "36"],
    image: u("photo-1517438476312-10d79c077509"), description: "Relaxed straight leg with roomy cargo pockets and an adjustable hem." },
  { id: "p5", name: "Wide-Leg Pleated Pants", category: "Women", price: 1099,
    colors: [{ name: "Sand", hex: "#cdb994" }, { name: "Black", hex: "#141414" }], sizes: ["XS", "S", "M", "L", "XL"],
    image: u("photo-1594633312681-425c7b97ccd1"), description: "High-rise, front-pleated and fluid — polished without trying too hard." },
  { id: "p6", name: "Cotton Co-ord Set", category: "Ethnic & Everyday", price: 1799, compareAt: 2299, badge: "Bestseller",
    colors: [{ name: "Cream", hex: "#ede3cf" }, { name: "Mint", hex: "#bfd8c2" }], sizes: ["S", "M", "L", "XL"],
    image: u("photo-1583391733956-3750e0ff4e8b"), description: "A matching shirt-and-trouser set in soft cotton. Wear together or style apart." },
  { id: "p7", name: "Classic Denim Overshirt", category: "Men", price: 1399,
    colors: [{ name: "Mid wash", hex: "#5a7396" }, { name: "Dark wash", hex: "#27344d" }], sizes: ["S", "M", "L", "XL"],
    image: u("photo-1588850561407-ed78c282e89b"), description: "A sturdy layering piece with chest pockets — over a tee or buttoned up." },
  { id: "p8", name: "Canvas Everyday Tote", category: "Accessories", price: 549,
    colors: [{ name: "Natural", hex: "#e4d8bf" }, { name: "Black", hex: "#141414" }], sizes: ["One size"],
    image: u("photo-1544816155-12df9643f363"), description: "Roomy, durable canvas tote for the daily carry." },
];

export const CATEGORIES: Category[] = ["Women", "Men", "Ethnic & Everyday", "Accessories"];

export type SortKey = "featured" | "price-asc" | "price-desc";

export function filterProducts(list: Product[], opts: { query: string; category: Category | "All"; sort: SortKey }) {
  const q = opts.query.trim().toLowerCase();
  const out = list.filter(
    (p) =>
      (opts.category === "All" || p.category === opts.category) &&
      (!q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)),
  );
  if (opts.sort === "price-asc") out.sort((a, b) => a.price - b.price);
  if (opts.sort === "price-desc") out.sort((a, b) => b.price - a.price);
  return out;
}

export const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export const STORE_ADDRESS = "No. 49, ABT Road, Karuvampalayam, Tiruppur, Tamil Nadu, India";
export const MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(STORE_ADDRESS)}`;
export const DIRECTIONS_URL = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(STORE_ADDRESS)}`;
export const INSTAGRAM_URL = "https://www.instagram.com/aelitezclothings/";
