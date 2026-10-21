import { useCallback, useEffect, useState } from "react";
import { PRODUCTS, type Product } from "./catalog";

export interface CartLine { key: string; productId: string; size: string; color: string; qty: number }

function usePersisted<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setValue(JSON.parse(raw));
    } catch { /* ignore */ }
    setReady(true);
  }, [key]);
  useEffect(() => {
    if (ready) localStorage.setItem(key, JSON.stringify(value));
  }, [key, value, ready]);
  return [value, setValue] as const;
}

export function useShop() {
  const [cart, setCart] = usePersisted<CartLine[]>("aelitez-cart", []);
  const [wishlist, setWishlist] = usePersisted<string[]>("aelitez-wishlist", []);

  const addToCart = useCallback((p: Product, size: string, color: string, qty = 1) => {
    const key = `${p.id}|${size}|${color}`;
    setCart((c) => {
      const ex = c.find((l) => l.key === key);
      if (ex) return c.map((l) => (l.key === key ? { ...l, qty: Math.min(10, l.qty + qty) } : l));
      return [...c, { key, productId: p.id, size, color, qty }];
    });
  }, [setCart]);

  const setQty = useCallback((key: string, qty: number) =>
    setCart((c) => (qty <= 0 ? c.filter((l) => l.key !== key) : c.map((l) => (l.key === key ? { ...l, qty: Math.min(10, qty) } : l)))), [setCart]);

  const toggleWish = useCallback((id: string) => {
    let added = false;
    setWishlist((w) => {
      added = !w.includes(id);
      return added ? [...w, id] : w.filter((x) => x !== id);
    });
    return added;
  }, [setWishlist]);

  const lines = cart
    .map((l) => ({ ...l, product: PRODUCTS.find((p) => p.id === l.productId) }))
    .filter((l): l is CartLine & { product: Product } => !!l.product);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = lines.reduce((s, l) => s + l.qty * l.product.price, 0);

  return { lines, count, subtotal, addToCart, setQty, wishlist, toggleWish };
}
