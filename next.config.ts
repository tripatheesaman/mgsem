import type { NextConfig } from "next";
import path from "path";

const isProduction = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  generateEtags: false,
  ...(isProduction && { basePath: "/mgsem" }),
  trailingSlash: true,

  images: {
    unoptimized: true,
  },

  webpack(config) {
    config.resolve.alias["@"] = path.resolve(__dirname);
    return config;
  },
};

export default nextConfig;
