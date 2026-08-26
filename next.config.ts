import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // GitHub avatars are the only remote images the app renders.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
