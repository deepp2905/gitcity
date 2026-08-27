import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * `next build` and `next dev` share .next by default, so running a
   * verification build against a running dev server overwrites the dev
   * server's cache and it starts serving stale prerendered HTML. That
   * surfaces as a hydration mismatch: old markup from the server against
   * new markup from the client.
   *
   * Set NEXT_DIST_DIR to build somewhere else while dev is running.
   */
  distDir: process.env.NEXT_DIST_DIR ?? ".next",

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
