import "server-only";
// The ONLY module in Studio allowed to touch child_process (statically
// enforced by the safety tests). Spawns the fixed render worker script with
// shell interpretation disabled, a fixed executable and cwd, an allowlisted
// environment, and stdout/stderr piped to the render's controlled log file.

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

export interface RenderProcess {
  /** Registers the exit callback (fires once, with the exit code or null). */
  onExit: (cb: (code: number | null) => void) => void;
  kill: () => void;
}

export type RenderRunner = (opts: {
  repoRoot: string;
  dataRoot: string;
  renderId: string;
}) => Promise<RenderProcess>;

export const spawnRenderWorker: RenderRunner = async ({ repoRoot, dataRoot, renderId }) => {
  const workerScript = path.join(repoRoot, "scripts", "studio-render-worker.mjs");
  const logPath = path.join(dataRoot, "renders", renderId, "render.log");
  const logHandle = await fs.open(logPath, "wx", 0o600);

  const child: ChildProcess = spawn(process.execPath, [workerScript, renderId], {
    shell: false,
    cwd: repoRoot,
    // Minimal allowlist — no inherited secrets, no NODE_OPTIONS.
    env: {
      NODE_ENV: "production",
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      TMPDIR: process.env.TMPDIR ?? "",
      MYVIDEO_REPO_ROOT: repoRoot,
      MYVIDEO_STUDIO_DATA_ROOT: dataRoot,
    },
    stdio: ["ignore", logHandle.fd, logHandle.fd],
  });

  let closed = false;
  const closeLog = () => {
    if (!closed) {
      closed = true;
      void logHandle.close();
    }
  };

  return {
    onExit: (cb) => {
      child.once("exit", (code) => {
        closeLog();
        cb(code);
      });
      child.once("error", () => {
        closeLog();
        cb(null);
      });
    },
    kill: () => {
      child.kill("SIGKILL");
    },
  };
};
