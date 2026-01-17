import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async rewrites() {
    return [
      {
        source: '/recordings/:path*',
        destination: 'http://localhost:8080/recordings/:path*',
      },
    ]
  },
};

export default nextConfig;
