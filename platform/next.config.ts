import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local demo app: classic dynamic rendering keeps every module simple and predictable.
  cacheComponents: false,
  devIndicators: false,
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
