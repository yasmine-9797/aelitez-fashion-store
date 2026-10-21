/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL of the AELITEZ API, e.g. https://api.aelitez.com */
  readonly VITE_API_URL?: string;
  /** Public storefront URL, e.g. https://www.aelitez.com */
  readonly VITE_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
