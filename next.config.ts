import type { NextConfig } from "next";

const basePath = process.env.BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  distDir: "dist",
  basePath: basePath ? (basePath.startsWith("/") ? basePath : `/${basePath}`) : undefined,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
