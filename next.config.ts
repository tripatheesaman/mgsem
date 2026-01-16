import type { NextConfig } from "next";
import path from "path";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "/mgsem";

const nextConfig: NextConfig = {
  output: "standalone",
  compress: true,
  poweredByHeader: false,
  generateEtags: false,
  reactStrictMode: true,
  basePath: BASE_PATH,
  assetPrefix: BASE_PATH,
  trailingSlash: true,
  images: {
    unoptimized: true, 
  },

  // Configure static file serving for uploads
  async rewrites() {
    return [
      {
        source: `${BASE_PATH}/uploads/:path*`,
        destination: `${BASE_PATH}/api/uploads/:path*`,
      },
    ];
  },

  webpack(config) {
    // Resolve the @ alias to the root of the project
    config.resolve.alias["@"] = path.resolve(__dirname);
    return config;
  },
};

export default nextConfig;
