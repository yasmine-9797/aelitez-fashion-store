import { describe, expect, it } from "vitest";
import { originAllowed } from "../src/config/env.ts";

describe("allowed browser origins", () => {
  const allowlist = ["https://www.aelitez.com"];

  it("allows only the configured storefront in production", () => {
    expect(originAllowed("https://www.aelitez.com", allowlist, "production")).toBe(true);
    expect(originAllowed("https://www.aelitez.com/", allowlist, "production")).toBe(true);
    expect(originAllowed("http://localhost:8081", allowlist, "production")).toBe(false);
    expect(originAllowed("https://evil.example", allowlist, "production")).toBe(false);
  });

  it("allows any localhost port in development, nothing else", () => {
    for (const o of ["http://localhost:8080", "http://localhost:8081", "http://127.0.0.1:5173", "http://localhost"]) expect(originAllowed(o, allowlist, "development")).toBe(true);
    for (const o of ["http://localhost.evil.example", "https://localhost:8080.evil.example", "http://192.168.1.5:8080", "https://evil.example"]) expect(originAllowed(o, allowlist, "development")).toBe(false);
  });

  it("stays strict in the test environment", () => {
    expect(originAllowed("http://localhost:8081", ["http://localhost:8080"], "test")).toBe(false);
  });
});
