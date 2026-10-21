// Seeds reference data (always) and, outside production, a clearly-labelled demo catalogue.
//
//   npm run db:seed                          # reference data + demo products (development)
//   SEED_DEMO_PRODUCTS=false npm run db:seed # reference data only
//
// Never seeds reviews, orders or customers — storefront sections that depend on those stay
// hidden until real activity exists. Demo products are never seeded when NODE_ENV=production.
import { discountPercent } from "@shared/money";
import { Department, InventoryMovementType, ProductStatus, SizeGroup, prisma } from "../src/lib/prisma.ts";

const isProduction = process.env["NODE_ENV"] === "production";
const seedDemo = !isProduction && process.env["SEED_DEMO_PRODUCTS"] !== "false";

// ───────────── Reference data ─────────────

const SIZES: { group: SizeGroup; labels: string[] }[] = [
  { group: SizeGroup.BABY, labels: ["0–3M", "3–6M", "6–12M", "12–18M", "18–24M"] },
  { group: SizeGroup.KIDS, labels: ["2–3Y", "3–4Y", "4–5Y", "5–6Y", "6–7Y", "7–8Y", "8–9Y", "9–10Y", "10–11Y", "11–12Y", "12–13Y", "13–14Y", "14–15Y", "15–16Y"] },
  { group: SizeGroup.WOMEN, labels: ["XS", "S", "M", "L", "XL", "XXL", "26", "28", "30", "32", "34"] },
  { group: SizeGroup.ONE_SIZE, labels: ["Free Size", "One Size"] },
];

const COLORS: [string, string][] = [
  ["Black", "#141414"],
  ["White", "#f7f7f5"],
  ["Ivory", "#efe8da"],
  ["Beige", "#d8c3a5"],
  ["Grey", "#9a9a9a"],
  ["Red", "#c8102e"],
  ["Maroon", "#6d1a2b"],
  ["Pink", "#f2a7bb"],
  ["Peach", "#f7b58c"],
  ["Mint", "#bfe3d0"],
  ["Sky Blue", "#9cc9ea"],
  ["Denim Blue", "#4a6e95"],
  ["Navy", "#1f2f55"],
  ["Mustard", "#d6a32b"],
  ["Multicolour", "#b04a8a"],
];

type CategorySeed = { name: string; slug: string; description?: string; featured?: boolean; children?: CategorySeed[] };
const CATEGORIES: Record<Department, CategorySeed[]> = {
  KIDS: [
    { name: "Baby Clothing", slug: "baby-clothing", description: "Soft, everyday pieces for the littlest ones." },
    { name: "Infant Essentials", slug: "infant-essentials", description: "Onesies, rompers and easy basics." },
    { name: "Toddler", slug: "toddler", description: "Play-ready outfits for 1–3 years." },
    { name: "Girls", slug: "girls" },
    { name: "Boys", slug: "boys" },
    { name: "Teen Girls", slug: "teen-girls" },
    { name: "Kids' Dresses", slug: "kids-dresses" },
    { name: "Kids' T-Shirts", slug: "kids-t-shirts" },
    { name: "Kids' Tops", slug: "kids-tops" },
    { name: "Kids' Bottoms", slug: "kids-bottoms" },
    { name: "Kids' Ethnic Wear", slug: "kids-ethnic-wear", featured: true },
    { name: "Kids' Party Wear", slug: "kids-party-wear", featured: true },
    { name: "Everyday Essentials", slug: "kids-everyday-essentials", featured: true },
  ],
  WOMEN: [
    {
      name: "Western Wear",
      slug: "women-western-wear",
      children: [
        { name: "Dresses", slug: "women-dresses", featured: true },
        { name: "Tops & Shirts", slug: "women-tops-shirts" },
        { name: "T-Shirts", slug: "women-t-shirts" },
        { name: "Trousers", slug: "women-trousers" },
        { name: "Jeans", slug: "women-jeans" },
        { name: "Skirts", slug: "women-skirts" },
      ],
    },
    {
      name: "Ethnic Wear",
      slug: "women-ethnic-wear",
      featured: true,
      children: [
        { name: "Kurtis", slug: "women-kurtis" },
        { name: "Kurtas", slug: "women-kurtas" },
        { name: "Sarees", slug: "women-sarees" },
        { name: "Lehengas", slug: "women-lehengas" },
      ],
    },
    { name: "Co-ord Sets", slug: "women-co-ord-sets", featured: true },
    { name: "Casual Wear", slug: "women-casual-wear" },
    { name: "Occasion Wear", slug: "women-occasion-wear" },
    { name: "Festive Edit", slug: "women-festive-edit", description: "Seasonal collection for the festive months." },
    { name: "Accessories", slug: "women-accessories" },
  ],
};

async function seedReference() {
  for (const { group, labels } of SIZES) {
    for (const [i, label] of labels.entries()) {
      await prisma.size.upsert({ where: { group_label: { group, label } }, create: { group, label, sortOrder: i }, update: { sortOrder: i } });
    }
  }
  for (const [name, hex] of COLORS) await prisma.color.upsert({ where: { name }, create: { name, hex }, update: {} });

  const upsertCategory = async (department: Department, c: CategorySeed, parentId: string | null, sortOrder: number) => {
    const row = await prisma.category.upsert({
      where: { slug: c.slug },
      create: { name: c.name, slug: c.slug, department, parentId, description: c.description ?? null, isFeatured: c.featured ?? false, sortOrder },
      update: {},
    });
    for (const [i, child] of (c.children ?? []).entries()) await upsertCategory(department, child, row.id, i);
  };
  for (const department of [Department.KIDS, Department.WOMEN]) {
    for (const [i, c] of CATEGORIES[department].entries()) await upsertCategory(department, c, null, i);
  }

  // Delivery options are business settings — review fees and timelines in Admin → Delivery before launch.
  const methods = [
    { code: "standard", name: "Standard delivery", description: "Delivered by courier across India.", feePaise: 7900, freeAbovePaise: 99900, minDays: 4, maxDays: 7, codAllowed: true, sortOrder: 0 },
    { code: "express", name: "Express delivery", description: "Priority dispatch for select PIN codes.", feePaise: 14900, freeAbovePaise: null, minDays: 2, maxDays: 3, codAllowed: false, sortOrder: 1 },
  ];
  for (const m of methods) await prisma.shippingMethod.upsert({ where: { code: m.code }, create: m, update: {} });
}

// ───────────── Demo catalogue ─────────────

const img = (id: number) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1200&h=1500`;
const KID_SIZES = (from: string, to: string) => {
  const all = SIZES[1]!.labels;
  return all.slice(all.indexOf(from), all.indexOf(to) + 1);
};
const BABY = (from: string, to: string) => {
  const all = SIZES[0]!.labels;
  return all.slice(all.indexOf(from), all.indexOf(to) + 1);
};
const WOMEN_ALPHA = ["XS", "S", "M", "L", "XL", "XXL"];

interface DemoProduct {
  name: string;
  department: Department;
  categories: string[];
  price: number;
  compareAt?: number;
  colors: string[];
  sizes: { group: SizeGroup; labels: string[] };
  ages?: [number, number];
  image: number;
  alt: string;
  description: string;
  fabric: string;
  care: string;
  specs?: [string, string][];
  featured?: boolean;
}

const D = Department;
const DEMO: DemoProduct[] = [
  // ── Kids ──
  { name: "Ruffle Sleeve Party Frock", department: D.KIDS, categories: ["girls", "kids-dresses", "kids-party-wear"], price: 899, compareAt: 1199, colors: ["Pink"], sizes: { group: SizeGroup.KIDS, labels: KID_SIZES("3–4Y", "7–8Y") }, ages: [36, 96], image: 36893755, alt: "Girl in a pink ruffle-sleeve party frock", description: "A twirl-ready party frock with soft ruffle sleeves and a lined skirt.", fabric: "Polyester net with cotton lining", care: "Gentle hand wash, dry in shade", specs: [["Fit", "Regular"], ["Length", "Knee length"]], featured: true },
  { name: "Ruffled Cotton Day Dress", department: D.KIDS, categories: ["girls", "kids-dresses", "kids-everyday-essentials"], price: 749, colors: ["Red"], sizes: { group: SizeGroup.KIDS, labels: KID_SIZES("4–5Y", "9–10Y") }, ages: [48, 120], image: 18649978, alt: "Girl in a red ruffled cotton dress", description: "Breathable cotton day dress with a ruffled neckline for school-day-to-play-date wear.", fabric: "100% cotton", care: "Machine wash cold, wash dark colours separately" },
  { name: "Tulle Princess Gown", department: D.KIDS, categories: ["girls", "kids-dresses", "kids-party-wear"], price: 1599, compareAt: 1999, colors: ["Sky Blue"], sizes: { group: SizeGroup.KIDS, labels: KID_SIZES("3–4Y", "7–8Y") }, ages: [36, 96], image: 19646913, alt: "Girl in a full-length blue tulle gown", description: "Layered tulle gown with a sparkle bodice for birthdays and celebrations.", fabric: "Tulle with satin lining", care: "Dry clean recommended", featured: true },
  { name: "Boho Maxi Dress", department: D.KIDS, categories: ["girls", "kids-dresses"], price: 999, colors: ["Ivory"], sizes: { group: SizeGroup.KIDS, labels: KID_SIZES("6–7Y", "11–12Y") }, ages: [72, 144], image: 6202160, alt: "Girl in a long ivory boho dress", description: "Flowing ivory maxi with gathered tiers — easy for family events.", fabric: "Viscose crepe", care: "Hand wash cold" },
  { name: "Silk Pavadai Festive Set", department: D.KIDS, categories: ["girls", "kids-ethnic-wear", "kids-party-wear"], price: 1499, colors: ["Red"], sizes: { group: SizeGroup.KIDS, labels: KID_SIZES("2–3Y", "5–6Y") }, ages: [24, 72], image: 20263916, alt: "Child in a red and green silk pavadai set", description: "Traditional pattu pavadai set with a contrast zari border, made for festivals and family functions.", fabric: "Art silk with zari border", care: "Dry clean only", specs: [["Set includes", "Blouse and skirt"]], featured: true },
  { name: "Denim Button Romper", department: D.KIDS, categories: ["toddler", "kids-everyday-essentials"], price: 649, colors: ["Denim Blue"], sizes: { group: SizeGroup.BABY, labels: BABY("12–18M", "18–24M") }, ages: [12, 24], image: 17839400, alt: "Toddler in a denim button-front romper", description: "Soft-washed denim romper with snap buttons for quick changes.", fabric: "Cotton chambray", care: "Machine wash cold" },
  { name: "All-Star Baby Romper", department: D.KIDS, categories: ["baby-clothing", "infant-essentials"], price: 499, colors: ["White"], sizes: { group: SizeGroup.BABY, labels: BABY("3–6M", "12–18M") }, ages: [3, 18], image: 30435354, alt: "Baby in a white and red sports-print romper", description: "Sporty print romper with an easy snap crotch.", fabric: "Cotton jersey", care: "Machine wash cold, tumble dry low" },
  { name: "Soft Cotton Onesie", department: D.KIDS, categories: ["baby-clothing", "infant-essentials", "kids-everyday-essentials"], price: 399, colors: ["Navy"], sizes: { group: SizeGroup.BABY, labels: BABY("0–3M", "6–12M") }, ages: [0, 12], image: 1148600, alt: "Baby in a navy cotton onesie sitting on grass", description: "Everyday onesie in buttery-soft cotton, gentle on new skin.", fabric: "100% combed cotton", care: "Machine wash cold" },
  { name: "Bow Party Dress (Baby)", department: D.KIDS, categories: ["baby-clothing", "kids-party-wear"], price: 799, compareAt: 999, colors: ["Ivory"], sizes: { group: SizeGroup.BABY, labels: BABY("6–12M", "18–24M") }, ages: [6, 24], image: 15579750, alt: "Baby girl in an ivory party dress with a bow", description: "Puffed party dress with a satin bow sash for first birthdays.", fabric: "Polyester with cotton lining", care: "Hand wash cold" },
  { name: "Printed Camp-Collar Shirt", department: D.KIDS, categories: ["boys", "kids-tops"], price: 699, colors: ["Black"], sizes: { group: SizeGroup.KIDS, labels: KID_SIZES("4–5Y", "8–9Y") }, ages: [48, 108], image: 15179150, alt: "Boy in a black printed camp-collar shirt", description: "Relaxed camp-collar shirt with an all-over print, worn open over a tee.", fabric: "Viscose", care: "Machine wash cold" },
  { name: "Checked Flannel Shirt", department: D.KIDS, categories: ["boys", "kids-tops"], price: 749, colors: ["Navy"], sizes: { group: SizeGroup.KIDS, labels: KID_SIZES("5–6Y", "10–11Y") }, ages: [60, 132], image: 15609399, alt: "Boy in a checked flannel shirt", description: "Brushed flannel check shirt for cooler days.", fabric: "Cotton flannel", care: "Machine wash cold" },
  { name: "Everyday Tee & Shorts Set", department: D.KIDS, categories: ["boys", "kids-t-shirts", "kids-bottoms", "kids-everyday-essentials"], price: 549, colors: ["Sky Blue"], sizes: { group: SizeGroup.KIDS, labels: KID_SIZES("3–4Y", "7–8Y") }, ages: [36, 96], image: 3371377, alt: "Boy in a light blue tee and shorts", description: "Easy cotton tee with pull-on shorts — the go-anywhere set.", fabric: "Cotton jersey", care: "Machine wash cold" },
  { name: "Velvet Bow Dress", department: D.KIDS, categories: ["toddler", "girls", "kids-party-wear"], price: 899, colors: ["Black"], sizes: { group: SizeGroup.KIDS, labels: KID_SIZES("2–3Y", "5–6Y") }, ages: [24, 72], image: 34181916, alt: "Toddler in a black velvet dress", description: "Soft velvet dress with long sleeves, made for evening functions.", fabric: "Polyester velvet", care: "Hand wash cold" },
  { name: "Linen-Blend Smock Dress", department: D.KIDS, categories: ["toddler", "girls", "kids-everyday-essentials"], price: 599, colors: ["Grey"], sizes: { group: SizeGroup.BABY, labels: BABY("12–18M", "18–24M") }, ages: [12, 24], image: 2168394, alt: "Toddler in a grey linen-blend smock dress", description: "Loose smock dress that keeps little ones cool on warm days.", fabric: "Linen-cotton blend", care: "Machine wash cold" },
  { name: "Embroidered Sundress", department: D.KIDS, categories: ["toddler", "girls", "kids-dresses"], price: 699, colors: ["Mint"], sizes: { group: SizeGroup.KIDS, labels: KID_SIZES("2–3Y", "4–5Y") }, ages: [24, 60], image: 9264503, alt: "Toddler in a mint embroidered sundress", description: "Sleeveless sundress with delicate floral embroidery.", fabric: "100% cotton", care: "Machine wash cold" },
  { name: "Relaxed Fleece Hoodie", department: D.KIDS, categories: ["teen-girls", "kids-tops", "kids-everyday-essentials"], price: 999, colors: ["Peach"], sizes: { group: SizeGroup.KIDS, labels: KID_SIZES("12–13Y", "15–16Y") }, ages: [144, 192], image: 7303353, alt: "Teen girl in a peach fleece hoodie", description: "Cosy brushed-fleece hoodie with a relaxed fit.", fabric: "Cotton-polyester fleece", care: "Machine wash cold, do not tumble dry" },
  { name: "Cropped Denim Jacket", department: D.KIDS, categories: ["teen-girls", "kids-tops"], price: 1299, compareAt: 1599, colors: ["Denim Blue"], sizes: { group: SizeGroup.KIDS, labels: KID_SIZES("12–13Y", "15–16Y") }, ages: [144, 192], image: 15271673, alt: "Teen girl wearing a light denim jacket", description: "Light-wash denim jacket with a slightly cropped cut.", fabric: "100% cotton denim", care: "Machine wash cold inside out" },

  // ── Women ──
  { name: "Crepe Kurta & Pant Co-ord", department: D.WOMEN, categories: ["women-ethnic-wear", "women-kurtas", "women-co-ord-sets", "women-casual-wear"], price: 1899, compareAt: 2499, colors: ["Red"], sizes: { group: SizeGroup.WOMEN, labels: WOMEN_ALPHA }, image: 20702676, alt: "Woman in a red crepe kurta and pant co-ord", description: "A mandarin-collar kurta with matching straight pants — polished for work and festive days alike.", fabric: "Crepe", care: "Dry clean recommended", specs: [["Set includes", "Kurta and pants"], ["Fit", "Straight"]], featured: true },
  { name: "Embroidered Salwar Suit with Dupatta", department: D.WOMEN, categories: ["women-ethnic-wear", "women-kurtas", "women-occasion-wear"], price: 2499, colors: ["Black"], sizes: { group: SizeGroup.WOMEN, labels: WOMEN_ALPHA }, image: 28213789, alt: "Woman in a black embroidered salwar suit with printed dupatta", description: "Black embroidered kurta with salwar and a printed dupatta.", fabric: "Cotton blend with embroidery", care: "Dry clean only", specs: [["Set includes", "Kurta, salwar and dupatta"]] },
  { name: "Festive Pink Lehenga Set", department: D.WOMEN, categories: ["women-ethnic-wear", "women-lehengas", "women-occasion-wear", "women-festive-edit"], price: 4999, compareAt: 6499, colors: ["Pink"], sizes: { group: SizeGroup.WOMEN, labels: ["S", "M", "L", "XL"] }, image: 16803130, alt: "Woman in a pink embroidered lehenga with dupatta", description: "Embroidered lehenga with a matching blouse and sheer dupatta for weddings and celebrations.", fabric: "Georgette with sequin embroidery", care: "Dry clean only", specs: [["Set includes", "Lehenga, blouse and dupatta"]], featured: true },
  { name: "Ivory Printed Lehenga", department: D.WOMEN, categories: ["women-ethnic-wear", "women-lehengas", "women-occasion-wear"], price: 3999, colors: ["Ivory"], sizes: { group: SizeGroup.WOMEN, labels: ["S", "M", "L", "XL"] }, image: 13156196, alt: "Woman in an ivory printed lehenga", description: "Lightweight printed lehenga with a contrast dupatta.", fabric: "Cotton silk", care: "Dry clean only" },
  { name: "Checked Cotton Saree", department: D.WOMEN, categories: ["women-ethnic-wear", "women-sarees"], price: 1799, colors: ["Multicolour"], sizes: { group: SizeGroup.ONE_SIZE, labels: ["Free Size"] }, image: 2723623, alt: "Woman in a checked cotton saree with a yellow blouse", description: "Handloom-look checked saree with a contrast border. Unstitched blouse piece included.", fabric: "Cotton", care: "Hand wash separately", specs: [["Length", "5.5 m saree + 0.8 m blouse piece"]] },
  { name: "Printed Wrap Midi Dress", department: D.WOMEN, categories: ["women-western-wear", "women-dresses", "women-casual-wear"], price: 1399, colors: ["Multicolour"], sizes: { group: SizeGroup.WOMEN, labels: WOMEN_ALPHA }, image: 4947741, alt: "Woman in a printed wrap midi dress", description: "Bold printed wrap dress with flutter sleeves.", fabric: "Viscose", care: "Hand wash cold" },
  { name: "Gingham Strappy Midi Dress", department: D.WOMEN, categories: ["women-western-wear", "women-dresses", "women-festive-edit"], price: 1199, compareAt: 1599, colors: ["Pink"], sizes: { group: SizeGroup.WOMEN, labels: WOMEN_ALPHA }, image: 17699546, alt: "Woman in a pink gingham strappy midi dress", description: "Summer-ready gingham midi with adjustable straps.", fabric: "Cotton poplin", care: "Machine wash cold" },
  { name: "Puff Sleeve Mini Dress", department: D.WOMEN, categories: ["women-western-wear", "women-dresses"], price: 1299, colors: ["White"], sizes: { group: SizeGroup.WOMEN, labels: WOMEN_ALPHA }, image: 5444971, alt: "Woman in a white puff-sleeve mini dress and straw hat", description: "Crisp white mini dress with puff sleeves and a corset-style bodice.", fabric: "Cotton", care: "Machine wash cold" },
  { name: "Oversized Poplin Shirt", department: D.WOMEN, categories: ["women-western-wear", "women-tops-shirts", "women-casual-wear"], price: 999, colors: ["White"], sizes: { group: SizeGroup.WOMEN, labels: WOMEN_ALPHA }, image: 11380486, alt: "Woman in an oversized white poplin shirt", description: "A boyfriend-fit poplin shirt — tuck it, knot it or wear it open.", fabric: "100% cotton poplin", care: "Machine wash cold" },
  { name: "High-Rise Straight Jeans", department: D.WOMEN, categories: ["women-western-wear", "women-jeans"], price: 1499, colors: ["Denim Blue"], sizes: { group: SizeGroup.WOMEN, labels: ["26", "28", "30", "32", "34"] }, image: 19524041, alt: "Woman in high-rise straight jeans and a white shirt", description: "Classic high-rise straight jeans in a mid-blue wash.", fabric: "Cotton denim with stretch", care: "Machine wash cold inside out" },
  { name: "Everyday Crew Neck Tee", department: D.WOMEN, categories: ["women-western-wear", "women-t-shirts", "women-casual-wear"], price: 499, colors: ["White", "Black"], sizes: { group: SizeGroup.WOMEN, labels: WOMEN_ALPHA }, image: 2535859, alt: "Woman in a white crew neck tee and jeans", description: "Soft, slightly fitted cotton tee — the wardrobe staple.", fabric: "100% cotton jersey", care: "Machine wash cold" },
  { name: "Tiered Mini Skirt", department: D.WOMEN, categories: ["women-western-wear", "women-skirts"], price: 899, colors: ["Ivory"], sizes: { group: SizeGroup.WOMEN, labels: ["XS", "S", "M", "L"] }, image: 16763586, alt: "Woman in a tiered check mini skirt and white top", description: "Flippy tiered mini skirt with an elasticated waist.", fabric: "Cotton blend", care: "Machine wash cold" },
  { name: "Pleated Skater Skirt", department: D.WOMEN, categories: ["women-western-wear", "women-skirts"], price: 999, colors: ["Black"], sizes: { group: SizeGroup.WOMEN, labels: ["XS", "S", "M", "L", "XL"] }, image: 19932178, alt: "Woman in a black pleated skirt and leather jacket", description: "Pleated skater skirt that pairs with sneakers or boots.", fabric: "Polyester", care: "Machine wash cold" },
  { name: "Rib-Knit Wide-Leg Co-ord", department: D.WOMEN, categories: ["women-western-wear", "women-co-ord-sets", "women-trousers"], price: 1699, colors: ["Beige", "White"], sizes: { group: SizeGroup.WOMEN, labels: ["XS", "S", "M", "L", "XL"] }, image: 8484104, alt: "Two women wearing rib-knit tops with wide-leg trousers", description: "Sleeveless rib-knit top with matching wide-leg trousers.", fabric: "Viscose rib knit", care: "Hand wash cold, dry flat" },
  { name: "Studded Structured Handbag", department: D.WOMEN, categories: ["women-accessories"], price: 1299, colors: ["Black"], sizes: { group: SizeGroup.ONE_SIZE, labels: ["One Size"] }, image: 16346895, alt: "Black structured handbag with stud detailing", description: "Structured top-handle bag with stud trim and a detachable strap.", fabric: "PU leather", care: "Wipe clean with a dry cloth", specs: [["Dimensions", "25 × 18 × 9 cm"]] },
];

/** Deterministic pseudo-random stock so demo data is stable across runs. */
function stockFor(seed: string): number {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const r = h % 20;
  if (r === 0) return 0; // some sold-out sizes
  if (r < 4) return 2; // some low stock
  return 6 + (h % 19);
}

async function seedDemoProducts() {
  const categories = new Map((await prisma.category.findMany({ select: { id: true, slug: true } })).map((c) => [c.slug, c.id]));
  const colors = new Map((await prisma.color.findMany()).map((c) => [c.name, c.id]));
  const sizes = await prisma.size.findMany();
  const sizeId = (group: SizeGroup, label: string) => sizes.find((s) => s.group === group && s.label === label)?.id;
  const publishedBase = Date.now() - 45 * 24 * 60 * 60 * 1000;

  for (const [index, p] of DEMO.entries()) {
    const slug = p.name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const pricePaise = p.price * 100;
    const compareAtPaise = p.compareAt ? p.compareAt * 100 : null;
    const existing = await prisma.product.findUnique({ where: { slug }, select: { id: true } });
    if (existing) continue;
    const product = await prisma.product.create({
      data: {
        name: p.name,
        slug,
        description: `${p.description} (Sample product — demo catalogue for layout; replace with real styles and prices.)`,
        fabric: p.fabric,
        care: p.care,
        specs: (p.specs ?? []).map(([label, value]) => ({ label, value })),
        department: p.department,
        status: ProductStatus.ACTIVE,
        pricePaise,
        compareAtPaise,
        discountPercent: discountPercent(pricePaise, compareAtPaise),
        ageMinMonths: p.ages?.[0] ?? null,
        ageMaxMonths: p.ages?.[1] ?? null,
        isFeatured: p.featured ?? false,
        // Staggered publish dates give "New" labels and sorting something realistic to work with.
        publishedAt: new Date(publishedBase + index * 36 * 60 * 60 * 1000),
        categories: { create: p.categories.map((s) => ({ categoryId: categories.get(s)! })).filter((c) => c.categoryId) },
        images: { create: [{ url: img(p.image), alt: p.alt, width: 1200, height: 1500, sortOrder: 0 }] },
      },
    });
    for (const colorName of p.colors) {
      for (const label of p.sizes.labels) {
        const sId = sizeId(p.sizes.group, label);
        const cId = colors.get(colorName);
        if (!sId || !cId) throw new Error(`Unknown size/colour ${label}/${colorName}`);
        const sku = `DEMO-${String(index + 1).padStart(3, "0")}-${colorName.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase()}-${label.replace(/[^A-Za-z0-9]/g, "")}`;
        const onHand = stockFor(sku);
        await prisma.productVariant.create({
          data: {
            productId: product.id,
            sizeId: sId,
            colorId: cId,
            sku,
            inventory: { create: { onHand, lowStockThreshold: 3 } },
            ...(onHand > 0 ? { movements: { create: { type: InventoryMovementType.INITIAL, onHandDelta: onHand, reason: "Demo seed stock" } } } : {}),
          },
        });
      }
    }
  }
}

await seedReference();
console.log("Reference data ready (sizes, colours, categories, delivery options).");
if (seedDemo) {
  await seedDemoProducts();
  console.log(`Demo catalogue ready (${DEMO.length} sample products — replace before launch).`);
} else if (isProduction) {
  console.log("Production: demo products were not seeded.");
}
await prisma.$disconnect();
