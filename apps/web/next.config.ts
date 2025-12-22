import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  reactCompiler: true,
  output: "standalone",
  turbopack: {
    // Monorepo root (so Turbopack can resolve deps outside apps/web/)
    root: path.join(__dirname, "../.."),
  },
};

export default nextConfig;
