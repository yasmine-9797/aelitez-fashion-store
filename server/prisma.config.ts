import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Placeholder lets `prisma generate` run without a database (e.g. in CI builds).
    url: process.env["DATABASE_URL"] ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  },
});
