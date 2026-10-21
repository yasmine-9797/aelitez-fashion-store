// Rebuilds the throwaway end-to-end database: migrate, seed the demo catalogue, create a test admin.
// Run automatically by playwright.config.ts before the API starts.
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { config, parse } from "dotenv";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const server = path.resolve(here, "../server");
const envFile = path.join(server, ".env");
config({ path: envFile, quiet: true });
const devDatabaseUrl = fs.existsSync(envFile) ? parse(fs.readFileSync(envFile)).DATABASE_URL : undefined;

export const e2eDatabaseUrl = () => {
  if (process.env.E2E_DATABASE_URL) return process.env.E2E_DATABASE_URL;
  const base = process.env.TEST_DATABASE_URL;
  if (!base) throw new Error("Set E2E_DATABASE_URL (or TEST_DATABASE_URL in server/.env) — this database is wiped.");
  return base.replace(/\/([^/?]+)(\?|$)/, "/aelitez_e2e$2");
};

const url = e2eDatabaseUrl();
if (url === devDatabaseUrl) throw new Error("The e2e database must not be your development database.");
const dbName = new URL(url).pathname.slice(1);
const admin = new pg.Client({ connectionString: url.replace(`/${dbName}`, "/postgres").replace(/\?schema=\w+/, "") });
await admin.connect();
const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
if (!exists.rowCount) await admin.query(`CREATE DATABASE "${dbName}"`);
await admin.end();

const db = new pg.Client({ connectionString: url.replace(/\?schema=\w+/, "") });
await db.connect();
await db.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
await db.end();

const env = { ...process.env, DATABASE_URL: url, NODE_ENV: "development" };
execSync("npx prisma migrate deploy", { cwd: server, env, stdio: "pipe" });
execSync("npx tsx prisma/seed.ts", { cwd: server, env, stdio: "pipe" });
execSync("npx tsx scripts/create-admin.ts", {
  cwd: server,
  env: { ...env, ADMIN_EMAIL: "e2e-admin@example.com", ADMIN_PASSWORD: "E2e-Admin-Passw0rd", ADMIN_NAME: "E2E Admin" },
  stdio: "pipe",
});
console.log(`e2e database ready: ${dbName}`);
