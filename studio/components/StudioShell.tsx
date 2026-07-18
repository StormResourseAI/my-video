"use client";

import { useState } from "react";
import type { PanelVisibility } from "@/lib/types";
import { useStudioStore } from "@/state/studioStore";
import AppRail from "./AppRail";
import Inspector from "./Inspector";
import MediaBrowser from "./MediaBrowser";
import PreviewMonitor from "./PreviewMonitor";
import ProjectNav from "./ProjectNav";
import Timeline from "./Timeline";

const PANEL_TOGGLES: { key: keyof PanelVisibility; label: string }[] = [
  { key: "projectNav", label: "Projects panel" },
  { key: "mediaBrowser", label: "Media panel" },
  { key: "inspector", label: "Inspector panel" },
  { key: "timeline", label: "Timeline panel" },
];

/** Narrow-viewport notice — the workspace targets wide desktops. */
function NarrowGuard() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Desktop workspace recommended"
      className="fixed inset-0 z-50 hidden max-lg:flex flex-col items-center justify-center gap-3 bg-ink/95 p-6 text-center"
    >
      <p className="text-lg font-semibold">Desktop workspace recommended</p>
      <p className="max-w-sm text-muted">
        myvideo_ Studio is designed for a wide desktop display. Resize the window or continue
        anyway — some panels may overlap.
      </p>
      <button
        type="button"
        autoFocus
        onClick={() => setDismissed(true)}
        className="rounded-md bg-accent-soft px-3 py-1.5 font-semibold text-accent"
      >
        Continue anyway
      </button>
    </div>
  );
}

export default function StudioShell() {
  const panels = useStudioStore((s) => s.panels);
  const togglePanel = useStudioStore((s) => s.togglePanel);
  const fullscreen = useStudioStore((s) => s.fullscreen);

  const showNav = panels.projectNav;
  const showMedia = panels.mediaBrowser && !fullscreen;
  const showInspector = panels.inspector && !fullscreen;
  const showTimeline = panels.timeline;

  // Single source of truth for the center columns; outer template, inner
  // template, and span counts all derive from this one array.
  const centerCols = [
    ...(showMedia ? ["300px"] : []),
    "minmax(360px, 1fr)",
    ...(showInspector ? ["304px"] : []),
  ];
  const outerCols = ["56px", ...(showNav ? ["236px"] : []), ...centerCols].join(" ");

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-edge bg-panel px-3">
        <p className="font-bold tracking-tight">
          myvideo<span className="text-accent">_</span>{" "}
          <span className="font-normal text-muted">Studio</span>
        </p>
        <div role="group" aria-label="Panel visibility" className="flex gap-1">
          {PANEL_TOGGLES.map((p) => {
            const suppressed =
              fullscreen && (p.key === "mediaBrowser" || p.key === "inspector");
            const effective = panels[p.key] && !suppressed;
            return (
              <button
                key={p.key}
                type="button"
                aria-label={p.label}
                aria-pressed={effective}
                disabled={suppressed}
                title={suppressed ? "Hidden while preview is fullscreen" : undefined}
                onClick={() => togglePanel(p.key)}
                className={`rounded px-2 py-1 text-[11px] transition-colors disabled:opacity-50 ${
                  effective
                    ? "bg-accent-soft text-accent"
                    : "bg-raised text-muted hover:text-text"
                }`}
              >
                {p.label.replace(" panel", "")}
              </button>
            );
          })}
        </div>
      </header>

      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: outerCols }}>
        <AppRail />
        {showNav && <ProjectNav />}
        <div
          className="grid min-h-0 min-w-0"
          style={{
            gridColumn: `span ${centerCols.length}`,
            gridTemplateColumns: centerCols.join(" "),
            gridTemplateRows: showTimeline ? "1fr 264px" : "1fr",
          }}
        >
          {showMedia && <MediaBrowser />}
          <PreviewMonitor />
          {showInspector && <Inspector />}
          {showTimeline && (
            <div style={{ gridColumn: `span ${centerCols.length}` }} className="min-h-0">
              <Timeline />
            </div>
          )}
        </div>
      </div>

      <NarrowGuard />
    </div>
  );
}
