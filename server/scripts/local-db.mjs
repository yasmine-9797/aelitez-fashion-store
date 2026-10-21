#!/usr/bin/env node
// Project-local PostgreSQL for development and tests (optional — any PostgreSQL works via DATABASE_URL).
// Uses the PostgreSQL binaries on this machine (PG_BIN, PATH, or the default Windows install dir)
// to run an isolated cluster in server/.pgdata on its own port, so it never touches a system database.
//
//   npm run db:local            # init (first run) + start + create databases + write server/.env
//   npm run db:local -- stop    # stop the cluster
//   npm run db:local -- status
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, ".pgdata");
const envFile = path.join(root, ".env");
const credFile = path.join(dataDir, ".local-credentials.json");
const port = Number(process.env.LOCAL_PG_PORT ?? 54329);
const user = "aelitez";
const databases = ["aelitez_dev", "aelitez_test"];

function findBin(name) {
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  const candidates = [process.env.PG_BIN, ...(process.platform === "win32" ? [18, 17, 16].map((v) => `C:/Program Files/PostgreSQL/${v}/bin`) : [])].filter(Boolean);
  for (const dir of candidates) if (fs.existsSync(path.join(dir, exe))) return path.join(dir, exe);
  const which = spawnSync(process.platform === "win32" ? "where" : "which", [name], { encoding: "utf8" });
  if (which.status === 0) return which.stdout.split(/\r?\n/)[0].trim();
  throw new Error(`Could not find ${name}. Install PostgreSQL or set PG_BIN to its bin directory.`);
}

const run = (bin, args, opts = {}) => execFileSync(findBin(bin), args, { stdio: "inherit", ...opts });
const isRunning = () => spawnSync(findBin("pg_ctl"), ["status", "-D", dataDir], { encoding: "utf8" }).status === 0;

function init() {
  if (fs.existsSync(path.join(dataDir, "PG_VERSION"))) return JSON.parse(fs.readFileSync(credFile, "utf8"));
  fs.mkdirSync(dataDir, { recursive: true });
  const password = randomBytes(18).toString("base64url");
  const pwFile = path.join(dataDir, "..", ".pgpass.tmp");
  fs.writeFileSync(pwFile, password, { mode: 0o600 });
  try {
    run("initdb", ["-D", dataDir, "-U", user, "-A", "scram-sha-256", `--pwfile=${pwFile}`, "-E", "UTF8", "--no-locale"]);
  } finally {
    fs.rmSync(pwFile, { force: true });
  }
  const creds = { user, password, port };
  fs.writeFileSync(credFile, JSON.stringify(creds), { mode: 0o600 });
  return creds;
}

function start() {
  if (isRunning()) return console.log(`PostgreSQL already running (port ${port}).`);
  // stdio "ignore": the detached postgres process would otherwise keep the caller's terminal pipes open.
  const logFile = path.join(dataDir, "server.log");
  const res = spawnSync(findBin("pg_ctl"), ["start", "-w", "-D", dataDir, "-l", logFile, "-o", `-p ${port} -c listen_addresses=localhost`], { stdio: "ignore" });
  if (res.status !== 0) throw new Error(`pg_ctl start failed — see ${logFile}`);
}

function createDatabases(creds) {
  const env = { ...process.env, PGPASSWORD: creds.password };
  for (const db of databases) {
    const exists = execFileSync(findBin("psql"), ["-h", "localhost", "-p", String(port), "-U", user, "-d", "postgres", "-tAc", `SELECT 1 FROM pg_database WHERE datname='${db}'`], { env, encoding: "utf8" }).trim();
    if (!exists) run("createdb", ["-h", "localhost", "-p", String(port), "-U", user, db], { env });
  }
}

function writeEnv(creds) {
  const url = (db) => `postgresql://${user}:${encodeURIComponent(creds.password)}@localhost:${port}/${db}?schema=public`;
  let text = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : fs.readFileSync(path.join(root, ".env.example"), "utf8");
  const set = (key, value) => {
    const line = `${key}="${value}"`;
    text = new RegExp(`^${key}=.*$`, "m").test(text) ? text.replace(new RegExp(`^${key}=.*$`, "m"), line) : `${text.trimEnd()}\n${line}\n`;
  };
  set("DATABASE_URL", url("aelitez_dev"));
  set("TEST_DATABASE_URL", url("aelitez_test"));
  fs.writeFileSync(envFile, text, { mode: 0o600 });
  console.log(`Wrote DATABASE_URL and TEST_DATABASE_URL to ${path.relative(process.cwd(), envFile) || envFile}`);
}

const cmd = process.argv[2] ?? "start";
if (cmd === "stop") {
  if (isRunning()) run("pg_ctl", ["stop", "-w", "-D", dataDir, "-m", "fast"]);
  else console.log("Not running.");
} else if (cmd === "status") {
  console.log(isRunning() ? `Running on port ${port}` : "Not running");
} else {
  const creds = init();
  start();
  createDatabases(creds);
  writeEnv(creds);
  console.log(`Local PostgreSQL ready on localhost:${port} (databases: ${databases.join(", ")}).`);
}
