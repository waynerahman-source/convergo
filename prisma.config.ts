// C:\Users\Usuario\Projects\convergo\prisma.config.ts
import { config as dotenv } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Prisma CLI does NOT automatically load .env.local like Next.js does.
// Force-load it first, then fall back to .env.
dotenv({ path: ".env.local" });
dotenv({ path: ".env" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
