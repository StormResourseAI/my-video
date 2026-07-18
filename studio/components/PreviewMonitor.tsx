"use client";

import { useEffect } from "react";
import { PROJECTS, TIMELINE_LENGTH } from "@/fixtures";
import { formatTimecode } from "@/lib/format";
import type { AspectRatio } from "@/lib/types";
import { useStudioStore } from "@/state/studioStore";
import { Chip } from "./ui";

const RATIOS: { value: AspectRatio; css: string }[] = [
  { value: "16:9", css: "16 / 9" },
  { value: "9:16", css: "9 / 16" },
  { value: "1:1", css: "1 / 1" },
  { value: "4:5", css: "4 / 5" },
];

export default function PreviewMonitor() {
  const activeProjectId = useStudioStore((s) => s.activeProjectId);
  const aspectRatio = useStudioStore((s) => s.aspectRatio);
  const playing = useStudioStore((s) => s.playing);
  const currentTime = useStudioStore((s) => s.currentTime);
  const safeZones = useStudioStore((s) => s.safeZones);
  const fullscreen = useStudioStore((s) => s.fullscreen);
  const setAspectRatio = useStudioStore((s) => s.setAspectRatio);
  const togglePlay = useStudioStore((s) => s.togglePlay);
  const tick = useStudioStore((s) => s.tick);
  const toggleSafeZones = useStudioStore((s) => s.toggleSafeZones);
  const toggleFullscreen = useStudioStore((s) => s.toggleFullscreen);

  const project = PROJECTS.find((p) => p.id === activeProjectId);
  const ratio = RATIOS.find((r) => r.value === aspectRatio) ?? RATIOS[0];
  const displayTime = currentTime % TIMELINE_LENGTH;

  // Mock playback clock — advances local state only; no media is played.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => tick(0.1), 100);
    return () => clearInterval(id);
  }, [playing, tick]);

  return (
    <section
      aria-label="Preview monitor"
      className="flex h-full min-h-0 flex-col bg-ink"
    >
      <div className="flex items-center justify-between border-b border-edge px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate font-semibold">{project?.name ?? "Untitled"}</h2>
          <span className="shrink-0 font-mono text-[11px] text-muted">
            {project ? `${project.resolution} · ${project.fps} fps · ${project.duration}` : "—"}
          </span>
        </div>
        <Chip tone="warn">Mock preview</Chip>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
        <div
          data-testid="preview-canvas"
          data-aspect={aspectRatio}
          data-fullscreen={fullscreen}
          className="relative rounded-md border border-edge bg-panel shadow-2xl"
          style={{
            // Size one axis; aspect-ratio derives the other so it never distorts.
            aspectRatio: ratio.css,
            ...(aspectRatio === "16:9"
              ? { width: "100%", height: "auto", maxWidth: "calc(88dvh * 16 / 9)" }
              : { height: "100%", width: "auto" }),
          }}
        >
          <div
            className="absolute inset-0 rounded-md"
            style={{
              background:
                "radial-gradient(120% 90% at 50% 20%, #1c2434 0%, #10141d 60%, #0b0d12 100%)",
            }}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted">
            <span className="text-2xl" aria-hidden>▶</span>
            <span className="text-[11px] font-semibold tracking-widest uppercase">
              Mock preview — no media loaded
            </span>
            <span className="font-mono text-[11px]">{aspectRatio}</span>
          </div>
          {safeZones && (
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <div className="absolute inset-[5%] rounded border border-warn/50" />
              <div className="absolute inset-[10%] rounded border border-warn/30" />
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-edge px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={playing ? "Pause" : "Play"}
            aria-pressed={playing}
            onClick={togglePlay}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-accent hover:brightness-125"
          >
            <span aria-hidden>{playing ? "❚❚" : "▶"}</span>
          </button>
          <output
            aria-label="Timecode"
            aria-live="off"
            className="font-mono text-sm tabular-nums"
          >
            {formatTimecode(displayTime)}
          </output>
        </div>

        <div role="radiogroup" aria-label="Aspect ratio" className="flex gap-1">
          {RATIOS.map((r) => (
            <button
              key={r.value}
              type="button"
              role="radio"
              aria-checked={aspectRatio === r.value}
              onClick={() => setAspectRatio(r.value)}
              className={`rounded px-2 py-1 font-mono text-[11px] transition-colors ${
                aspectRatio === r.value
                  ? "bg-accent-soft text-accent"
                  : "bg-raised text-muted hover:text-text"
              }`}
            >
              {r.value}
            </button>
          ))}
        </div>

        <div className="flex gap-1">
          <button
            type="button"
            aria-pressed={safeZones}
            onClick={toggleSafeZones}
            className={`rounded px-2 py-1 text-[11px] ${
              safeZones ? "bg-accent-soft text-accent" : "bg-raised text-muted hover:text-text"
            }`}
          >
            Safe zones
          </button>
          <button
            type="button"
            aria-pressed={fullscreen}
            onClick={toggleFullscreen}
            className={`rounded px-2 py-1 text-[11px] ${
              fullscreen ? "bg-accent-soft text-accent" : "bg-raised text-muted hover:text-text"
            }`}
          >
            Fullscreen
          </button>
        </div>
      </div>
    </section>
  );
}
