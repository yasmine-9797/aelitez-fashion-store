# AeliteZ Fashion Store

Build a polished, production-quality responsive e-commerce website for the Indian clothing brand “AELITEZ CLOTHINGS”, based in Tiruppur, Tamil Nadu. Brand positioning supplied by the owner: “The Trendiest Fashion in India • Premium for Less”, “Best Quality & Price”, “1L+ Happy Customers”, “4.9★ Rating”, “4 Stores Strong”, “Next Franchise Loading…”. Store address: No. 49, ABT Road, Karuvampalayam, Tiruppur, Tamil Nadu, India. Do not invent phone numbers, exact prices, store branches, product inventory, certifications, or checkout/payment integrations. Treat the supplied customer and rating statements as brand-provided marketing claims.

DESIGN DIRECTION:
Create a world-class contemporary Indian fashion storefront with a premium editorial campaign feel, inspired by high-end fashion e-commerce and modern streetwear. Strong visual hierarchy, oversized confident typography, generous spacing, polished image crops, clean grid, tasteful micro-interactions, smooth scrolling, subtle reveal animations, responsive mobile-first layouts. Use a sophisticated palette of warm ivory, deep near-black, and a restrained electric lime or vivid chartreuse accent for offers/CTAs. Avoid generic SaaS layouts, excessive gradients, glassmorphism, and template-looking cards. Use high-quality fashion photography via reliable remote image URLs/Unsplash source where possible; make sure images render and have graceful fallbacks. Ensure the overall result looks visually rich immediately, not an empty skeleton.

BUILD THESE SECTIONS:
1. Slim announcement bar: “TRENDING NOW • Premium looks, prices you’ll love” and “Visit our Tiruppur store”.
2. Sticky responsive navigation with AELITEZ wordmark, links Shop, New Arrivals, Collections, Our Story, Stores; prominent search icon, account icon if appropriate, cart icon with count, mobile menu.
3. Hero campaign section with large editorial fashion photo(s), eyebrow “THE NEW EVERYDAY”, bold headline “Style that speaks. Prices that make sense.”, concise brand copy, primary “Shop the Collection” CTA and secondary “Explore New Arrivals”. Include decorative season/campaign text and a visually striking composition. Do not use a fake countdown timer.
4. Trust strip with the supplied claims: “1L+ Happy Customers”, “4.9★ Customer Rating”, “4 Stores Strong”, “Premium for Less”.
5. Featured category tiles such as Women, Men, Ethnic & Everyday, Accessories. These are proposed navigation categories; don't claim confirmed inventory. Include tasteful image cards and hover states.
6. “Trending now” / “Popular picks” product grid with 8 clearly labelled demo products across clothing categories. Use believable INR prices and product titles but mark catalogue as sample/demo content that can be edited; do not imply these are actual inventory. Product cards include image, category, product name, price in ₹, optional compare-at price, color dots, wishlist button, quick-add/select size, and badges such as New or Bestseller only where presented as sample merchandising. Product detail modal/drawer with image, size selector, quantity, description and add-to-cart.
7. New-season campaign banner with fashion image and copy “Good style shouldn’t cost more” / “Discover your next favourite fit”.
8. Brand story section explaining accessible trend-led fashion and quality at fair prices, without unsupported historical claims.
9. Social/Instagram section linking to the supplied Instagram profile https://www.instagram.com/aelitezclothings/ with “Follow @aelitezclothings” and visual fashion grid.
10. Store visit section with the exact address: “No. 49, ABT Road, Karuvampalayam, Tiruppur, Tamil Nadu, India”, map link/search to Google Maps using that address, directions CTA, and Instagram contact CTA. Don't invent opening hours or phone number.
11. Newsletter signup UI with clear consent copy. If no backend is configured, make it a client-side demo with helpful feedback; don't falsely claim the subscription was saved remotely.
12. Complete footer: shop links, brand, store address, Instagram link, policies placeholders clearly identified as pages to fill in.

FUNCTIONALITY:
- Search overlay/input filters displayed demo products.
- Category filter buttons and sort (featured, price low-high, price high-low).
- Product detail modal, size selection, quantity, add-to-cart.
- Working cart drawer with line items, quantity adjustment, remove, subtotal in INR, empty state, and clear “Demo checkout — payment/order placement is not connected yet” message. Do not take payment or claim an order was placed.
- Wishlist toggles with localStorage persistence.
- Cart and wishlist persist via localStorage.
- Mobile navigation and accessible dialogs/buttons.
- Toasts or inline feedback for add to cart and other actions.
- Instagram profile links open safely in a new tab.
- SEO title/description, semantic landmarks, keyboard accessibility, visible focus states, reduced-motion support, alt text, and good mobile performance.
- Use React, TypeScript, Tailwind CSS, shadcn/ui if useful, lucide icons. Do not use SCSS.
- Keep code clean, reusable, and type-safe. Ensure all main buttons do something useful, no dead links for in-page sections, no broken layout on mobile or desktop.

Important: deliver the complete attractive storefront UI with functioning frontend interactions now. Make it easy for the business to later replace demo products with real products and connect a real inventory, order management, and payment gateway.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/2a221efb-455f-43bf-b294-782a86bc77bd).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
