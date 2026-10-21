import { describe, expect, it } from "vitest";
import { toApiQuery, validateShopSearch } from "./shop-search";

describe("shop search params", () => {
  it("accepts values the router parses as numbers", () => {
    const s = validateShopSearch({ inStock: 1, sizes: 32, q: 2026, minPrice: "500" });
    expect(s).toMatchObject({ inStock: true, sizes: "32", q: "2026", minPrice: 500 });
    expect(toApiQuery(s, "WOMEN")).toMatchObject({ department: "WOMEN", inStock: true, sizes: ["32"], q: "2026", minPrice: 500 });
  });
  it("drops malformed values instead of failing", () => {
    expect(validateShopSearch({ sort: "random", page: -1, category: "<script>", age: "99y" })).toEqual({});
  });
});
