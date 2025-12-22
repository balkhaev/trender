import path from "node:path";
import { defineConfig, env } from "prisma/config";

// Load .env only in development (not in Docker production)
if (process.env.NODE_ENV !== "production") {
  const dotenv = await import("dotenv");
  dotenv.config({
    path: "../../apps/server/.env",
  });
}

export default defineConfig({
  schema: path.join("prisma", "schema"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
