// Production build: generates the Prisma client and bundles the API into dist/index.js.
// Native/runtime packages stay external and are installed from package.json at deploy time.
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
execSync("npx prisma generate", { cwd: root, stdio: "inherit" });

await build({
  entryPoints: [path.join(root, "src/index.ts")],
  outfile: path.join(root, "dist/index.js"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  tsconfig: path.join(root, "tsconfig.json"),
  // Shared code lives outside this package; make sure it uses this package's dependencies.
  alias: { "@shared": path.resolve(root, "../shared"), zod: path.join(root, "node_modules/zod") },
  // Bare package imports stay external; aliased paths above are bundled.
  packages: "external",
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: "info",
});
