import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phase 1 is a local-only mock shell: no images, no rewrites, no server code.
  // Pin the workspace root so Next never infers it from the repo-root lockfile.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
