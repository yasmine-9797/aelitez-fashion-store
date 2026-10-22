#!/usr/bin/env node
// npm run dev:all — one command for local development:
//   1. starts the project-local PostgreSQL (only if this project uses one, in server/.pgdata),
//   2. starts the API (server/) and the storefront, with labelled output in one terminal,
//   3. keeps them running: anything already running is reused, and anything that stops is restarted.
// Press Ctrl+C to stop what this command started.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = path.join(root, "server");
const isWin = process.platform === "win32";
const COLORS = { db: "\x1b[35m", api: "\x1b[36m", web: "\x1b[33m", dev: "\x1b[32m" };
const log = (name, msg) => process.stdout.write(`${COLORS[name] ?? ""}[${name}]\x1b[0m ${msg}\n`);

const SERVICES = [
  { name: "api", cwd: server, health: "http://localhost:4000/api/v1/health", url: "http://localhost:4000" },
  { name: "web", cwd: root, health: "http://localhost:8080/", url: "http://localhost:8080" },
];

for (const dir of [root, server]) {
  if (!fs.existsSync(path.join(dir, "node_modules"))) {
    log("dev", `Installing dependencies in ${path.relative(root, dir) || "."} …`);
    if (spawnSync("npm install --no-fund", { cwd: dir, stdio: "inherit", shell: true }).status !== 0) process.exit(1);
  }
}
if (!fs.existsSync(path.join(server, ".env"))) {
  log("dev", "server/.env is missing — run `cd server && npm run db:local` (or copy .env.example) first.");
  process.exit(1);
}

// 1. Database — only the project-local cluster is managed; an external DATABASE_URL is left alone.
function ensureDatabase() {
  if (!fs.existsSync(path.join(server, ".pgdata", "PG_VERSION"))) return;
  const r = spawnSync(process.execPath, ["scripts/local-db.mjs"], { cwd: server, encoding: "utf8" });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  if (r.status !== 0) {
    log("db", `Could not start the local database:\n${out}`);
    process.exit(1);
  }
  log("db", out.split("\n").at(-1) ?? "ready");
}
ensureDatabase();

// 2 & 3. API and storefront, supervised.
const up = async (url) => {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
};

const children = new Map();
function start(svc) {
  log(svc.name, `starting (${svc.url}) …`);
  // A single command string (no args array) — the form Node recommends with a shell.
  const child = spawn("npm run dev", { cwd: svc.cwd, shell: true, env: process.env });
  children.set(svc.name, child);
  const pipe = (stream) => {
    let buf = "";
    stream.on("data", (d) => {
      buf += d.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) log(svc.name, line);
    });
  };
  pipe(child.stdout);
  pipe(child.stderr);
  child.on("exit", (code) => {
    children.delete(svc.name);
    if (!stopping) log(svc.name, `stopped (exit ${code}) — will restart if it's needed`);
  });
}

let stopping = false;
const starting = new Set();
async function check() {
  for (const svc of SERVICES) {
    if (children.has(svc.name) || starting.has(svc.name)) continue;
    if (await up(svc.health)) continue; // already running (e.g. in another terminal) — reuse it
    starting.add(svc.name);
    start(svc);
    // Give it time to boot before checking again.
    setTimeout(() => starting.delete(svc.name), 30_000);
  }
}

for (const svc of SERVICES) if (await up(svc.health)) log(svc.name, `already running at ${svc.url} — reusing it`);
await check();
const timer = setInterval(() => void check(), 10_000);
log("dev", "Storefront: http://localhost:8080   Admin: http://localhost:8080/admin   API: http://localhost:4000   (Ctrl+C to stop)");

function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  log("dev", "stopping …");
  for (const child of children.values()) {
    if (isWin && child.pid) spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGINT");
  }
  // The database keeps running in the background; stop it with `cd server && npm run db:local -- stop`.
  setTimeout(() => process.exit(0), 500);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
