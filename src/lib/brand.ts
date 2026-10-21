// Business facts supplied by AELITEZ CLOTHINGS. Marketing claims are the business's own figures.
export const BRAND = {
  name: "AELITEZ CLOTHINGS",
  tagline: "The Trendiest Fashion in India • Premium for Less",
  instagramUrl: "https://www.instagram.com/aelitezclothings/",
  instagramHandle: "@aelitezclothings",
  storeAddress: "No. 49, ABT Road, Karuvampalayam, Tiruppur, Tamil Nadu, India",
  claims: ["1L+ Happy Customers", "4.9★ Customer Rating", "4 Stores Strong", "Premium for Less", "Best Quality & Price", "Next Franchise Loading…"],
} as const;

export const MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(BRAND.storeAddress)}`;
export const DIRECTIONS_URL = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(BRAND.storeAddress)}`;
export const external = { target: "_blank", rel: "noopener noreferrer" } as const;
