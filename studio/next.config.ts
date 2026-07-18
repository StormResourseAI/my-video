import path from "node:path";
import type { NextConfig } from "next";

const studioDir = import.meta.dirname;
// The real engine composition (../src/VerticalCoreComposition.tsx) compiles
// into the studio bundle, so the workspace root must span the repository.
const repoRoot = path.resolve(studioDir, "..");
const local = (pkg: string) => path.resolve(studioDir, "node_modules", pkg);

const nextConfig: NextConfig = {
  // Single-instance rule (plan §10): ../src would resolve bare
  // remotion/@remotion/media imports to the ROOT node_modules copies by
  // directory walk-up, duplicating the Remotion context against
  // @remotion/player. tsconfig.json `paths` pins both to the studio copies
  // (Turbopack honors the app tsconfig for all compiled source). React is
  // unified by Next's own compiler aliasing and must not be re-aliased.
  turbopack: {
    root: repoRoot,
  },
};

export default nextConfig;
