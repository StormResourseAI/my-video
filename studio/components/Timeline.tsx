"use client";

import { CLIPS, TIMELINE_LENGTH, TRACKS } from "@/fixtures";
import type { TrackControlState } from "@/lib/types";
import { useStudioStore } from "@/state/studioStore";

const BASE_PX_PER_SEC = 26;
const HEADER_WIDTH = 168;

const TRACK_TOGGLES: { key: keyof TrackControlState; label: string; glyph: string }[] = [
  { key: "locked", label: "Lock", glyph: "🔒" },
  { key: "muted", label: "Mute", glyph: "🔇" },
  { key: "hidden", label: "Hide", glyph: "◌" },
];

export default function Timeline() {
  const zoom = useStudioStore((s) => s.zoom);
  const setZoom = useStudioStore((s) => s.setZoom);
  const currentTime = useStudioStore((s) => s.currentTime);
  const selection = useStudioStore((s) => s.selection);
  const selectClip = useStudioStore((s) => s.selectClip);
  const trackControls = useStudioStore((s) => s.trackControls);
  const toggleTrackControl = useStudioStore((s) => s.toggleTrackControl);

  const pxPerSec = BASE_PX_PER_SEC * zoom;
  const laneWidth = TIMELINE_LENGTH * pxPerSec;
  const playheadX = (currentTime % TIMELINE_LENGTH) * pxPerSec;
  const tickCount = Math.floor(TIMELINE_LENGTH / 5);

  return (
    <section
      aria-label="Timeline"
      className="flex h-full min-h-0 flex-col border-t border-edge bg-panel"
    >
      <div className="flex items-center justify-between border-b border-edge px-3 py-1.5">
        <h2 className="text-[11px] font-bold tracking-widest text-muted uppercase">Timeline</h2>
        <div role="group" aria-label="Timeline zoom" className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => setZoom(zoom / 1.25)}
            className="h-6 w-6 rounded bg-raised text-muted hover:text-text"
          >
            −
          </button>
          <span className="w-12 text-center font-mono text-[11px] text-muted">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => setZoom(zoom * 1.25)}
            className="h-6 w-6 rounded bg-raised text-muted hover:text-text"
          >
            +
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="relative" style={{ width: HEADER_WIDTH + laneWidth }}>
          {/* Time ruler */}
          <div
            className="sticky top-0 z-20 flex h-6 border-b border-edge bg-panel"
            aria-hidden
          >
            <div
              className="sticky left-0 z-10 shrink-0 border-r border-edge bg-panel"
              style={{ width: HEADER_WIDTH }}
            />
            <div className="relative" style={{ width: laneWidth }}>
              {Array.from({ length: tickCount + 1 }, (_, i) => (
                <span
                  key={i}
                  className="absolute top-1 border-l border-edge pl-1 font-mono text-[10px] text-muted"
                  style={{ left: i * 5 * pxPerSec }}
                >
                  {String(Math.floor((i * 5) / 60)).padStart(2, "0")}:
                  {String((i * 5) % 60).padStart(2, "0")}
                </span>
              ))}
            </div>
          </div>

          {/* Tracks */}
          {TRACKS.map((track) => {
            const controls = trackControls[track.id] ?? {
              locked: false,
              muted: false,
              hidden: false,
            };
            const dimmed = controls.hidden || controls.muted;
            return (
              <div key={track.id} className="flex h-12 border-b border-edge/60">
                <div
                  className="sticky left-0 z-10 flex shrink-0 items-center justify-between gap-1 border-r border-edge bg-panel px-2"
                  style={{ width: HEADER_WIDTH }}
                >
                  <div className="min-w-0">
                    <span className="mr-1.5 font-mono text-[11px] font-bold text-accent">
                      {track.label}
                    </span>
                    <span className="truncate text-[11px] text-muted">{track.name}</span>
                  </div>
                  <div className="flex gap-0.5">
                    {TRACK_TOGGLES.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        aria-label={`${t.label} ${track.label}`}
                        aria-pressed={controls[t.key]}
                        title={t.label}
                        onClick={() => toggleTrackControl(track.id, t.key)}
                        className={`flex h-5 w-5 items-center justify-center rounded text-[10px] ${
                          controls[t.key]
                            ? "bg-accent-soft text-accent"
                            : "text-muted hover:bg-raised"
                        }`}
                      >
                        <span aria-hidden>{t.glyph}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div
                  className={`relative ${dimmed ? "opacity-40" : ""}`}
                  style={{ width: laneWidth }}
                >
                  {CLIPS.filter((c) => c.trackId === track.id).map((clip) => {
                    const isSelected =
                      selection.kind === "clip" && selection.clipId === clip.id;
                    return (
                      <button
                        key={clip.id}
                        type="button"
                        aria-label={`Select clip ${clip.name}`}
                        aria-current={isSelected ? "true" : undefined}
                        disabled={controls.locked}
                        onClick={() => selectClip(clip.id)}
                        className={`absolute top-1 bottom-1 overflow-hidden rounded-md border px-1.5 text-left ${
                          isSelected ? "border-accent ring-1 ring-accent" : "border-black/30"
                        } disabled:cursor-not-allowed`}
                        style={{
                          left: clip.start * pxPerSec,
                          width: clip.duration * pxPerSec,
                          background: clip.color,
                        }}
                      >
                        {clip.waveform && (
                          <span aria-hidden className="waveform absolute inset-0" />
                        )}
                        <span className="relative block truncate text-[10px] font-semibold text-white/90">
                          {clip.name}
                        </span>
                        {clip.badges.length > 0 && (
                          <span className="relative mt-0.5 flex gap-0.5">
                            {clip.badges.map((b) => (
                              <span
                                key={b}
                                className="truncate rounded-sm bg-black/50 px-1 text-[9px] font-bold tracking-wide text-white/90"
                              >
                                {b}
                              </span>
                            ))}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Playhead */}
          <div
            data-testid="playhead"
            aria-hidden
            className="pointer-events-none absolute top-0 bottom-0 z-30 w-px bg-danger"
            style={{ left: HEADER_WIDTH + playheadX }}
          >
            <div className="-ml-[5px] h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-danger" />
          </div>
        </div>
      </div>
    </section>
  );
}
