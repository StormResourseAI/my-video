"use client";

import { useEffect, useRef } from "react";
import type { PlayerRef } from "@remotion/player";
import { deriveEngineProps, type StudioDraftV1 } from "@/lib/draftDocument";
import { formatTimecode } from "@/lib/format";
import { toPlayerConfig, type PlayerConfig } from "@/lib/projectAdapter";
import type { ProjectDocumentV1 } from "@/lib/projectDocument";
import type { AspectRatio } from "@/lib/types";
import { useStudioStore, type DraftWorking } from "@/state/studioStore";
import RealPreview from "./RealPreview";
import { Chip } from "./ui";

const RATIOS: { value: AspectRatio; css: string }[] = [
  { value: "16:9", css: "16 / 9" },
  { value: "9:16", css: "9 / 16" },
  { value: "1:1", css: "1 / 1" },
  { value: "4:5", css: "4 / 5" },
];

const SCALES = [0.5, 0.75, 1] as const;

function RealHeader({ doc }: { doc: ProjectDocumentV1 }) {
  const meta =
    doc.composition !== null
      ? `${doc.composition.width}×${doc.composition.height} · ${doc.composition.fps} fps · ${doc.composition.durationInFrames}f`
      : "preview unavailable";
  return (
    <div className="flex min-w-0 items-center gap-2">
      <h2 className="truncate font-semibold">{doc.projectName}</h2>
      <span className="shrink-0 font-mono text-[11px] text-muted">{meta}</span>
      <Chip tone="warn">Read-only</Chip>
      <Chip>Cached props</Chip>
      {doc.freshness === "stale" && <Chip tone="warn">Stale</Chip>}
      {doc.freshness === "unknown" && <Chip>Freshness unknown</Chip>}
    </div>
  );
}

function DraftHeader({
  doc,
  draft,
  dirty,
}: {
  doc: ProjectDocumentV1;
  draft: StudioDraftV1;
  dirty: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <h2 className="truncate font-semibold">{draft.draftTitle ?? "Untitled draft"}</h2>
      <span className="shrink-0 font-mono text-[11px] text-muted">
        from {doc.projectName}
      </span>
      <Chip tone="accent">Draft</Chip>
      {dirty ? (
        <Chip tone="warn">Unsaved changes</Chip>
      ) : (
        <Chip tone="ok">Saved v{draft.version}</Chip>
      )}
      {draft.renderEligibility === "source-changed" && <Chip tone="warn">Source changed</Chip>}
      {draft.renderEligibility === "no-enabled-clips" && <Chip tone="warn">No enabled clips</Chip>}
    </div>
  );
}

function RealStatusPanel({
  title,
  messages,
}: {
  title: string;
  messages: string[];
}) {
  return (
    <div role="alert" className="m-4 max-w-md rounded-md border border-danger/40 bg-danger/10 p-4">
      <p className="font-semibold text-danger">{title}</p>
      {messages.map((m) => (
        <p key={m} className="mt-1 text-muted">
          {m}
        </p>
      ))}
    </div>
  );
}

export default function PreviewMonitor() {
  const aspectRatio = useStudioStore((s) => s.aspectRatio);
  const playing = useStudioStore((s) => s.playing);
  const safeZones = useStudioStore((s) => s.safeZones);
  const fullscreen = useStudioStore((s) => s.fullscreen);
  const tick = useStudioStore((s) => s.tick);
  const toggleSafeZones = useStudioStore((s) => s.toggleSafeZones);
  const toggleFullscreen = useStudioStore((s) => s.toggleFullscreen);

  const activeRealProjectId = useStudioStore((s) => s.activeRealProjectId);
  const doc = useStudioStore((s) => s.document);
  const documentStatus = useStudioStore((s) => s.documentStatus);
  const documentError = useStudioStore((s) => s.documentError);
  const playerFrame = useStudioStore((s) => s.playerFrame);
  const playerPlaying = useStudioStore((s) => s.playerPlaying);
  const previewScale = useStudioStore((s) => s.previewScale);
  const setPreviewScale = useStudioStore((s) => s.setPreviewScale);

  const draft = useStudioStore((s) => s.draft);
  const draftWorking = useStudioStore((s) => s.draftWorking);
  const draftDirty = useStudioStore((s) => s.draftDirty);
  const draftBusy = useStudioStore((s) => s.draftBusy);
  const draftError = useStudioStore((s) => s.draftError);
  const createDraftFromSource = useStudioStore((s) => s.createDraftFromSource);
  const saveDraft = useStudioStore((s) => s.saveDraft);
  const exitDraft = useStudioStore((s) => s.exitDraft);
  const renderJob = useStudioStore((s) => s.renderJob);
  const renderBusy = useStudioStore((s) => s.renderBusy);
  const renderError = useStudioStore((s) => s.renderError);
  const startDraftRender = useStudioStore((s) => s.startDraftRender);
  const refreshRenderJob = useStudioStore((s) => s.refreshRenderJob);

  const playerRef = useRef<PlayerRef>(null);

  const realMode = activeRealProjectId !== null;
  const draftMode = draft !== null && draftWorking !== null;
  const draftDerivation =
    draftMode && doc !== null && doc.props !== null
      ? deriveEngineProps(draftWorking as DraftWorking, doc.props, (c) => `api/assets/${c.sourceAssetId}`)
      : null;
  const config: PlayerConfig | null = draftMode
    ? draftDerivation !== null && doc !== null && doc.composition !== null
      ? {
          inputProps: draftDerivation.props,
          durationInFrames: draftDerivation.durationInFrames,
          fps: doc.composition.fps,
          compositionWidth: doc.composition.width,
          compositionHeight: doc.composition.height,
        }
      : null
    : doc !== null
      ? toPlayerConfig(doc)
      : null;
  const ratio = RATIOS.find((r) => r.value === aspectRatio) ?? RATIOS[0];

  // Mock playback clock — mock mode only; real mode mirrors the Player.
  useEffect(() => {
    if (!playing || realMode) return;
    const id = setInterval(() => tick(0.1), 100);
    return () => clearInterval(id);
  }, [playing, realMode, tick]);

  // Poll the active render job until it reaches a terminal state.
  const renderActive =
    renderJob !== null && (renderJob.status === "queued" || renderJob.status === "running");
  useEffect(() => {
    if (!renderActive) return;
    const id = setInterval(() => void refreshRenderJob(), 2000);
    return () => clearInterval(id);
  }, [renderActive, refreshRenderJob]);

  const fps = config?.fps ?? 30;
  const durationInFrames = config?.durationInFrames ?? 0;

  const realTransport = (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={playerPlaying ? "Pause" : "Play"}
          aria-pressed={playerPlaying}
          disabled={config === null}
          onClick={() => {
            const p = playerRef.current;
            if (p === null) return;
            if (p.isPlaying()) p.pause();
            else p.play();
          }}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-accent hover:brightness-125 disabled:opacity-40"
        >
          <span aria-hidden>{playerPlaying ? "❚❚" : "▶"}</span>
        </button>
        <output aria-label="Timecode" aria-live="off" className="font-mono text-sm tabular-nums">
          {formatTimecode(playerFrame / fps, fps)}
        </output>
        <span className="font-mono text-[11px] text-muted">
          {playerFrame}/{durationInFrames}f
        </span>
      </div>

      <input
        type="range"
        aria-label="Seek"
        min={0}
        max={Math.max(0, durationInFrames - 1)}
        value={Math.min(playerFrame, Math.max(0, durationInFrames - 1))}
        disabled={config === null}
        onChange={(e) => playerRef.current?.seekTo(Number(e.target.value))}
        className="min-w-24 flex-1 accent-(--color-accent)"
      />

      <div role="radiogroup" aria-label="Preview scale" className="flex gap-1">
        {SCALES.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={previewScale === s}
            onClick={() => setPreviewScale(s)}
            className={`rounded px-2 py-1 font-mono text-[11px] transition-colors ${
              previewScale === s
                ? "bg-accent-soft text-accent"
                : "bg-raised text-muted hover:text-text"
            }`}
          >
            {Math.round(s * 100)}%
          </button>
        ))}
      </div>
    </>
  );

  return (
    <section
      aria-label="Preview monitor"
      className="flex h-full min-h-0 flex-col bg-ink"
    >
      <div className="flex items-center justify-between gap-2 border-b border-edge px-3 py-2">
        {draftMode && doc !== null ? (
          <DraftHeader doc={doc} draft={draft as StudioDraftV1} dirty={draftDirty} />
        ) : realMode && doc !== null ? (
          <RealHeader doc={doc} />
        ) : (
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate font-semibold">
              {realMode ? activeRealProjectId : "Select a real project"}
            </h2>
          </div>
        )}
        <div className="flex shrink-0 items-center gap-1.5">
          {realMode && !draftMode && doc !== null && doc.status === "ready" && (
            <button
              type="button"
              onClick={() => void createDraftFromSource()}
              disabled={draftBusy !== "idle"}
              className="rounded bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent hover:brightness-125 disabled:opacity-40"
            >
              {draftBusy === "creating" ? "Creating…" : "Create Draft"}
            </button>
          )}
          {draftMode && (
            <>
              <button
                type="button"
                onClick={() => void saveDraft()}
                disabled={!draftDirty || draftBusy !== "idle"}
                title={draftDirty ? undefined : "No unsaved changes"}
                className="rounded bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent hover:brightness-125 disabled:opacity-40"
              >
                {draftBusy === "saving" ? "Saving…" : "Save Draft"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (draftDerivation === null) return;
                  const seconds = (draftDerivation.durationInFrames / (doc?.composition?.fps ?? 30)).toFixed(1);
                  if (
                    window.confirm(
                      `Render draft v${(draft as StudioDraftV1).version} to MP4?\n\n` +
                        `${draftDerivation.props.clips.length} clip(s) · ` +
                        `${draftDerivation.durationInFrames} frames (~${seconds}s) · 1080×1920 H.264`,
                    )
                  ) {
                    void startDraftRender();
                  }
                }}
                disabled={
                  draftDirty ||
                  renderBusy ||
                  renderActive ||
                  draftDerivation === null ||
                  (draft as StudioDraftV1).renderEligibility !== "eligible"
                }
                title={
                  draftDirty
                    ? "Save the draft before rendering"
                    : (draft as StudioDraftV1).renderEligibility === "source-changed"
                      ? "Source changed — create a new draft to render"
                      : renderActive
                        ? "A render is already running"
                        : undefined
                }
                className="rounded bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent hover:brightness-125 disabled:opacity-40"
              >
                Render MP4
              </button>
              <button
                type="button"
                onClick={() => {
                  if (
                    !draftDirty ||
                    window.confirm("Discard unsaved draft changes and return to the source preview?")
                  ) {
                    exitDraft();
                  }
                }}
                className="rounded bg-raised px-2.5 py-1 text-[11px] text-muted hover:text-text"
              >
                Exit draft
              </button>
            </>
          )}
          {realMode && doc === null ? <Chip tone="warn">Read-only</Chip> : null}
        </div>
      </div>
      <div role="status" aria-live="polite" className="border-b border-edge bg-panel px-3 py-2 text-[11px]">
        {!realMode
          ? "1 · SELECT PROJECT — Loading real local projects."
          : !draftMode
            ? "2–3 · PREVIEW SOURCE — Preview the immutable source, then create a protected draft to edit."
            : draftDirty
              ? "4–5 · EDIT DRAFT — Unsaved changes. Save this draft version before rendering."
              : renderJob?.status === "succeeded"
                ? "7 · DOWNLOAD — MP4 ready for download."
                : renderActive
                  ? "6 · RENDER — Rendering locally. Keep Studio open."
                  : "6 · RENDER — Saved draft is ready to render locally."}
      </div>
      {draftError !== null && (
        <p role="alert" className="border-b border-edge bg-danger/10 px-3 py-1.5 text-[11px] text-danger">
          {draftError}
        </p>
      )}
      {renderError !== null && (
        <p role="alert" className="border-b border-edge bg-danger/10 px-3 py-1.5 text-[11px] text-danger">
          {renderError}
        </p>
      )}
      {draftMode && renderJob !== null && (
        <div
          role="status"
          aria-label="Render status"
          className="flex flex-wrap items-center gap-2 border-b border-edge px-3 py-1.5 text-[11px]"
        >
          <span className="font-semibold uppercase tracking-widest text-muted">Render</span>
          <Chip
            tone={
              renderJob.status === "succeeded"
                ? "ok"
                : renderJob.status === "failed" || renderJob.status === "timed-out"
                  ? "warn"
                  : "accent"
            }
          >
            {renderJob.status}
          </Chip>
          <span className="font-mono text-muted">
            {renderJob.durationInFrames}f · draft v{renderJob.draftVersion}
          </span>
          {renderJob.status === "succeeded" && (
            <a
              href={`/api/renders/${renderJob.renderId}/output`}
              download
              className="rounded bg-accent-soft px-2 py-0.5 font-semibold text-accent hover:brightness-125"
            >
              Download MP4
              {renderJob.outputBytes !== null
                ? ` (${(renderJob.outputBytes / (1024 * 1024)).toFixed(1)} MB)`
                : ""}
            </a>
          )}
          {(renderJob.status === "failed" || renderJob.status === "timed-out") && (
            <span role="alert" className="text-danger">
              {renderJob.error ?? "Render did not complete."}
            </span>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
        {!realMode ? (
          <div role="status" className="max-w-md rounded-md border border-dashed border-edge p-4 text-center text-muted">
            Loading real local projects… No demo content is shown in operator mode.
          </div>
        ) : documentStatus === "loading" ? (
          <div role="status" aria-label="Loading project" className="text-muted">
            Loading project…
          </div>
        ) : realMode && documentStatus === "error" ? (
          <RealStatusPanel
            title="Project could not be loaded"
            messages={[documentError ?? "Unknown error."]}
          />
        ) : draftMode && config === null ? (
          <RealStatusPanel
            title="Draft cannot be previewed"
            messages={[
              "Enable at least one clip and keep trims inside each clip's source length.",
            ]}
          />
        ) : realMode && doc !== null && config === null ? (
          <RealStatusPanel
            title={
              doc.status === "props-missing"
                ? "No materialized preview"
                : doc.status === "media-missing"
                  ? "Staged media missing"
                  : "Project cannot be previewed"
            }
            messages={doc.warnings}
          />
        ) : (
          <div
            data-testid="preview-canvas"
            data-aspect={realMode ? "9:16" : aspectRatio}
            data-fullscreen={fullscreen}
            data-real={realMode || undefined}
            className="relative rounded-md border border-edge bg-panel shadow-2xl"
            style={{
              aspectRatio: realMode ? "9 / 16" : ratio.css,
              ...(realMode
                ? { height: `${previewScale * 100}%`, width: "auto" }
                : aspectRatio === "16:9"
                  ? { width: "100%", height: "auto", maxWidth: "calc(88dvh * 16 / 9)" }
                  : { height: "100%", width: "auto" }),
            }}
          >
            {realMode && config !== null ? (
              <div className="absolute inset-0 overflow-hidden rounded-md">
                <RealPreview config={config} playerRef={playerRef} />
              </div>
            ) : (
              <>
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
              </>
            )}
            {safeZones && (
              <div aria-hidden className="pointer-events-none absolute inset-0">
                <div className="absolute inset-[5%] rounded border border-warn/50" />
                <div className="absolute inset-[10%] rounded border border-warn/30" />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-edge px-3 py-2">
        {realMode ? realTransport : <span className="text-muted">Preview controls appear after a real project loads.</span>}

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
