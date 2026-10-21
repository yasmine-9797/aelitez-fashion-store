// Typed client for the AELITEZ API. The base URL comes from VITE_API_URL (never hard-coded for
// production). Cookies carry the session; state-changing requests also send the CSRF token.
import type { ApiErrorBody } from "@shared/types";

const DEFAULT_DEV_API = "http://localhost:4000";

export const API_URL = String(import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? DEFAULT_DEV_API : "")).replace(/\/$/, "");
export const apiConfigured = API_URL !== "";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
  }
  /** First message for a form field, e.g. fieldError("address.pincode"). */
  field(path: string): string | undefined {
    return this.details?.[path]?.[0];
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

let csrfToken: string | null = null;
let csrfPromise: Promise<string> | null = null;

async function fetchCsrf(): Promise<string> {
  const res = await fetch(`${API_URL}/api/v1/auth/csrf`, { credentials: "include" });
  const body = (await res.json()) as { data: { csrfToken: string } };
  csrfToken = body.data.csrfToken;
  return csrfToken;
}
const ensureCsrf = () => (csrfToken ? Promise.resolve(csrfToken) : (csrfPromise ??= fetchCsrf().finally(() => (csrfPromise = null))));

type Query = Record<string, string | number | boolean | string[] | null | undefined>;

export function toQueryString(query: Query = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "" || value === false) continue;
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(","));
    } else params.set(key, value === true ? "1" : String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Query;
  /** Raw body (e.g. FormData for uploads) instead of JSON. */
  form?: FormData;
  signal?: AbortSignal;
}

async function request<T>(path: string, opts: RequestOptions = {}, retried = false): Promise<T> {
  if (!apiConfigured) throw new ApiError(0, "API_NOT_CONFIGURED", "The store backend is not configured (VITE_API_URL).");
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = {};
  if (method !== "GET") headers["x-csrf-token"] = await ensureCsrf();
  if (opts.body !== undefined) headers["content-type"] = "application/json";

  let res: Response;
  try {
    const body = opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : null);
    res = await fetch(`${API_URL}/api/v1${path}${toQueryString(opts.query)}`, {
      method,
      headers,
      credentials: "include",
      body,
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError(0, "NETWORK", "We couldn't reach the store. Check your connection and try again.");
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const err = (json as ApiErrorBody | null)?.error;
    // The CSRF cookie can expire or be cleared — fetch a fresh token once and retry.
    if (err?.code === "CSRF_FAILED" && !retried) {
      csrfToken = null;
      return request<T>(path, opts, true);
    }
    throw new ApiError(res.status, err?.code ?? "HTTP_ERROR", err?.message ?? "Something went wrong. Please try again.", err?.details);
  }
  return json as T;
}

/** Calls an endpoint that responds `{ data }` and returns `data`. */
export async function api<T>(path: string, opts?: RequestOptions): Promise<T> {
  return (await request<{ data: T }>(path, opts)).data;
}

/** Calls a list endpoint that responds `{ data, meta }`. */
export function apiPage<T>(path: string, opts?: RequestOptions) {
  return request<{ data: T[]; meta: { page: number; pageSize: number; total: number; totalPages: number } }>(path, opts);
}

/** Absolute URL for links that go straight to the API (none today; kept for uploads previews). */
export const apiUrl = (path: string) => `${API_URL}${path}`;
