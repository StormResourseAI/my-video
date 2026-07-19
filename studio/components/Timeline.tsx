"use client";

import { CLIPS, TIMELINE_LENGTH, TRACKS } from "@/fixtures";
import type { TrackControlState } from "@/lib/types";
import { useStudioStore } from "@/state/studioStore";
import { Chip } from "./ui";

const BASE_PX_PER_SEC = 26;
const HEADER_WIDTH = 168;

/** Read-only sequence view of the real composition: one video lane derived
 *  from the validated props, laid out on the engine's overlap rule. */
function RealTimeline() {
  const doc = useStudioStore((s) => s.document);
  const zoom = useStudioStore((s) => s.zoom);
  const setZoom = useStudioStore((s) => s.setZoom);
  const playerFrame = useStudioStore((s) => s.playerFrame);

  const props = doc?.props ?? null;
  const composition = doc?.composition ?? null;
  const fps = composition?.fps ?? 30;
  const pxPerSec = BASE_PX_PER_SEC * zoom;
  const durationSec = (composition?.durationInFrames ?? 0) / fps;
  const laneWidth = Math.max(1, durationSec * pxPerSec);
  const playheadX = (playerFrame / fps) * pxPerSec;

  let cursor = 0;
  const blocks =
    props?.clips.map((clip, i) => {
      const startFrames = cursor;
      cursor += clip.durationInFrames - (i < props.clips.length - 1 ? props.transitionFrames : 0);
      return { clip, startFrames, index: i };
    }) ?? [];

  return (
    <section
      aria-label="Timeline"
      className="flex h-full min-h-0 flex-col border-t border-edge bg-panel"
    >
      <div className="flex items-center justify-between border-b border-edge px-3 py-1.5">
        <div className="flex items-center gap-2">
          <h2 className="text-[11px] font-bold tracking-widest text-muted uppercase">Timeline</h2>
          <Chip tone="warn">Read-only</Chip>
        </div>
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

      {props === null ? (
        <div className="m-3 rounded-md border border-dashed border-edge p-4 text-center text-muted">
          The clip sequence appears here once a previewable project loads.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="relative" style={{ width: HEADER_WIDTH + laneWidth }}>
            <div className="flex h-12 border-b border-edge/60">
              <div
                className="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 border-r border-edge bg-panel px-2"
                style={{ width: HEADER_WIDTH }}
              >
                <span className="font-mono text-[11px] font-bold text-accent">V1</span>
                <span className="truncate text-[11px] text-muted">Staged clips</span>
              </div>
              <div className="relative" style={{ width: laneWidth }}>
                {blocks.map(({ clip, startFrames, index }) => (
                  <div
                    key={`${clip.file}-${index}`}
                    className="absolute top-1 bottom-1 overflow-hidden rounded-md border border-black/30 bg-accent-soft px-1.5"
                    style={{
                      left: (startFrames / fps) * pxPerSec,
                      width: Math.max(2, (clip.durationInFrames / fps) * pxPerSec),
                    }}
                  >
                    <span className="block truncate text-[10px] font-semibold">{clip.file}</span>
                    <span className="block truncate font-mono text-[9px] text-muted">
                      {clip.durationInFrames}f
                    </span>
                  </div>
                ))}
              </div>
            </div>
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
      )}
    </section>
  );
}

/** Draft-edit lane: explicit move/enable controls per clip, no drag. */
function DraftTimeline() {
  const draftWorking = useStudioStore((s) => s.draftWorking);
  const doc = useStudioStore((s) => s.document);
  const selection = useStudioStore((s) => s.selection);
  const selectClip = useStudioStore((s) => s.selectClip);
  const moveDraftClip = useStudioStore((s) => s.moveDraftClip);
  const toggleDraftClip = useStudioStore((s) => s.toggleDraftClip);

  if (draftWorking === null) return null;
  const fps = doc?.composition?.fps ?? 30;
  const enabled = draftWorking.clips.filter((c) => c.enabled);
  const effective = (c: (typeof draftWorking.clips)[number]) =>
    c.sourceDurationInFrames - c.trimBefore - c.trimAfter;
  const total = Math.max(
    enabled.reduce((sum, c) => sum + effective(c), 0) -
      Math.max(0, enabled.length - 1) * draftWorking.transitionFrames,
    enabled.length > 0 ? 1 : 0,
  );

  return (
    <section
      aria-label="Timeline"
      className="flex h-full min-h-0 flex-col border-t border-edge bg-panel"
    >
      <div className="flex items-center justify-between border-b border-edge px-3 py-1.5">
        <div className="flex items-center gap-2">
          <h2 className="text-[11px] font-bold tracking-widest text-muted uppercase">Timeline</h2>
          <Chip tone="accent">Draft edit</Chip>
        </div>
        <span className="font-mono text-[11px] text-muted">
          {enabled.length}/{draftWorking.clips.length} clips · {total}f ·{" "}
          {(total / fps).toFixed(1)}s
        </span>
      </div>

      <ul className="min-h-0 flex-1 overflow-auto" aria-label="Draft clips">
        {draftWorking.clips.map((clip, index) => {
          const selected = selection.kind === "clip" && selection.clipId === clip.sourceAssetId;
          return (
            <li
              key={clip.sourceAssetId}
              className={`flex items-center gap-2 border-b border-edge/60 px-3 py-2 ${
                clip.enabled ? "" : "opacity-50"
              } ${selected ? "bg-accent-soft/40" : ""}`}
            >
              <button
                type="button"
                onClick={() => selectClip(clip.sourceAssetId)}
                aria-current={selected}
                aria-label={`Select ${clip.fileName}`}
                className="flex min-w-0 flex-1 items-baseline gap-2 text-left hover:text-text"
              >
                <span className="font-mono text-[11px] text-muted">{index + 1}</span>
                <span className="truncate text-[12px] font-semibold">{clip.fileName}</span>
                <span className="shrink-0 font-mono text-[10px] text-muted">
                  {effective(clip)}f{clip.trimBefore > 0 || clip.trimAfter > 0
                    ? ` (−${clip.trimBefore}/−${clip.trimAfter})`
                    : ""}
                </span>
              </button>
              <button
                type="button"
                aria-label={`Move ${clip.fileName} up`}
                disabled={index === 0}
                onClick={() => moveDraftClip(index, -1)}
                className="h-6 w-6 rounded bg-raised text-muted hover:text-text disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move ${clip.fileName} down`}
                disabled={index === draftWorking.clips.length - 1}
                onClick={() => moveDraftClip(index, 1)}
                className="h-6 w-6 rounded bg-raised text-muted hover:text-text disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                aria-pressed={clip.enabled}
                aria-label={`${clip.enabled ? "Disable" : "Enable"} ${clip.fileName}`}
                onClick={() => toggleDraftClip(index)}
                className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                  clip.enabled ? "bg-accent-soft text-accent" : "bg-raised text-muted"
                }`}
              >
                {clip.enabled ? "On" : "Off"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const TRACK_TOGGLES: { key: keyof TrackControlState; label: string; glyph: string }[] = [
  { key: "locked", label: "Lock", glyph: "🔒" },
  { key: "muted", label: "Mute", glyph: "🔇" },
  { key: "hidden", label: "Hide", glyph: "◌" },
];

export default function Timeline() {
  const realMode = useStudioStore((s) => s.activeRealProjectId) !== null;
  const draftMode = useStudioStore((s) => s.draftWorking) !== null;
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

  if (draftMode) return <DraftTimeline />;
  if (realMode) return <RealTimeline />;

  return (
    <section aria-label="Timeline" className="flex h-full items-center justify-center border-t border-edge bg-panel p-4 text-muted">
      Select a real project to view its read-only sequence.
    </section>
  );

  /* Legacy fixture renderer is unreachable in production and retained only while old fixture tests are reconciled. */
  /* c8 ignore start */
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
  /* c8 ignore stop */
}
