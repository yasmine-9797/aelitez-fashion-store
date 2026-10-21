// Rebuilds the test database from the migrations before the suite runs.
import { execSync } from "node:child_process";
import path from "node:path";
import pg from "pg";

export default async function setup() {
  const url = process.env["TEST_DATABASE_URL"];
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  if (url === process.env["DATABASE_URL"]) throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL — the test database is wiped.");
  const client = new pg.Client({ connectionString: url.replace(/\?schema=\w+/, "") });
  await client.connect();
  await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  await client.end();
  execSync("npx prisma migrate deploy", {
    cwd: path.resolve(import.meta.dirname, ".."),
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
