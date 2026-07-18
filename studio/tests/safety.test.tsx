import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StudioShell from "@/components/StudioShell";
import { resetStore } from "./helpers";

beforeEach(resetStore);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("phase 1 safety guarantees", () => {
  it("never performs network egress during shell interactions", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    // Any non-fetch egress attempt throws and fails the test immediately.
    for (const api of ["WebSocket", "XMLHttpRequest", "EventSource"]) {
      vi.stubGlobal(
        api,
        class {
          constructor() {
            throw new Error(`${api} egress attempted in Phase 1 shell`);
          }
        },
      );
    }
    const user = userEvent.setup();
    render(<StudioShell />);

    await user.click(screen.getByRole("button", { name: /Drone Property Reveal/ }));
    await user.click(screen.getByRole("radio", { name: "Video" }));
    await user.click(screen.getByRole("option", { name: "Select D001_ridge_flyover.mp4" }));
    await user.click(screen.getByRole("radio", { name: "9:16" }));
    await user.click(screen.getByRole("button", { name: "Play" }));
    await user.click(screen.getByRole("button", { name: "Pause" }));
    await user.click(screen.getByRole("button", { name: "Media panel" }));

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("studio runtime source imports no filesystem, child-process, or network modules", () => {
    const RUNTIME_DIRS = ["app", "components", "state", "lib", "fixtures"];
    // Matches from/require/dynamic-import AND bare side-effect imports.
    const FORBIDDEN =
      /(?:from\s+|require\(|import\(|import\s+)["'](?:node:)?(fs|fs\/promises|child_process|net|http|https|http2|tls|dns|dgram|os|worker_threads)["']/;

    // Browser-side egress tokens the module scan above cannot see.
    const BROWSER_EGRESS = /\b(fetch\s*\(|new\s+(WebSocket|XMLHttpRequest|EventSource)\b)/;

    const offenders: string[] = [];
    const scan = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          scan(full);
        } else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry)) {
          const source = readFileSync(full, "utf8");
          if (FORBIDDEN.test(source) || BROWSER_EGRESS.test(source)) offenders.push(full);
        }
      }
    };
    for (const dir of RUNTIME_DIRS) scan(join(process.cwd(), dir));

    expect(offenders).toEqual([]);
  });
});
