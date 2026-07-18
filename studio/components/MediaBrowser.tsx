"use client";

import { MEDIA_ASSETS } from "@/fixtures";
import type { MediaFilter } from "@/lib/types";
import { useStudioStore } from "@/state/studioStore";
import { Chip, PanelStateView, StateSwitcher } from "./ui";

const FILTERS: { value: MediaFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "video", label: "Video" },
  { value: "photo", label: "Photo" },
  { value: "audio", label: "Audio" },
  { value: "generated", label: "Generated" },
];

/** Real read-only assets from the loaded ProjectDocument. */
function RealAssetList() {
  const doc = useStudioStore((s) => s.document);
  const selection = useStudioStore((s) => s.selection);
  const selectAsset = useStudioStore((s) => s.selectAsset);

  if (doc === null || doc.assets.length === 0) {
    return (
      <PanelStateView
        state="empty"
        emptyMessage="No staged media referenced by this project."
        errorMessage=""
      />
    );
  }
  return (
    <ul
      role="listbox"
      aria-label="Project media assets"
      className="flex flex-1 flex-col gap-1 overflow-y-auto p-2"
    >
      {doc.assets.map((a) => {
        const isSelected = selection.kind === "asset" && selection.assetId === a.assetId;
        return (
          <li key={a.assetId} role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={isSelected}
              aria-label={`Select ${a.fileName}`}
              onClick={() => selectAsset(a.assetId)}
              className={`w-full rounded-lg border p-2 text-left transition-colors ${
                isSelected ? "border-accent bg-accent-soft" : "border-edge bg-raised hover:border-muted"
              }`}
            >
              <p className="truncate text-[12px] font-medium">{a.fileName}</p>
              <div className="mt-1 flex items-center gap-1">
                <Chip>{a.kind}</Chip>
                <Chip tone="warn">Read-only</Chip>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default function MediaBrowser() {
  const activeProjectId = useStudioStore((s) => s.activeProjectId);
  const realMode = useStudioStore((s) => s.activeRealProjectId) !== null;
  const filter = useStudioStore((s) => s.mediaFilter);
  const search = useStudioStore((s) => s.mediaSearch);
  const panelState = useStudioStore((s) => s.mediaPanelState);
  const selection = useStudioStore((s) => s.selection);
  const setFilter = useStudioStore((s) => s.setMediaFilter);
  const setSearch = useStudioStore((s) => s.setMediaSearch);
  const setPanelState = useStudioStore((s) => s.setMediaPanelState);
  const selectAsset = useStudioStore((s) => s.selectAsset);

  if (realMode) {
    return (
      <section
        aria-label="Media browser"
        className="flex h-full min-h-0 flex-col border-r border-edge bg-panel"
      >
        <div className="flex items-center justify-between gap-2 border-b border-edge px-3 py-2">
          <h2 className="text-[11px] font-bold tracking-widest text-muted uppercase">Media</h2>
          <Chip tone="warn">Read-only</Chip>
        </div>
        <RealAssetList />
      </section>
    );
  }

  const assets = MEDIA_ASSETS.filter(
    (a) =>
      a.projectId === activeProjectId &&
      (filter === "all" || a.kind === filter) &&
      a.filename.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <section
      aria-label="Media browser"
      className="flex h-full min-h-0 flex-col border-r border-edge bg-panel"
    >
      <div className="flex items-center justify-between gap-2 border-b border-edge px-3 py-2">
        <h2 className="text-[11px] font-bold tracking-widest text-muted uppercase">Media</h2>
        <StateSwitcher label="Media demo state" value={panelState} onChange={setPanelState} />
      </div>

      <div className="flex flex-col gap-2 border-b border-edge p-2">
        <input
          type="search"
          aria-label="Search media"
          placeholder="Search media…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-edge bg-raised px-2.5 py-1.5 placeholder:text-muted"
        />
        <div role="radiogroup" aria-label="Media filters" className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                filter === f.value
                  ? "bg-accent-soft text-accent"
                  : "bg-raised text-muted hover:text-text"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {panelState !== "normal" ? (
        <PanelStateView
          state={panelState}
          emptyMessage="No media in this project yet."
          errorMessage="The media index could not be read."
        />
      ) : assets.length === 0 ? (
        <PanelStateView
          state="empty"
          emptyMessage="No media matches the current search and filters."
          errorMessage=""
        />
      ) : (
        <ul
          role="listbox"
          aria-label="Media assets"
          className="grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto p-2"
        >
          {assets.map((a) => {
            const isSelected = selection.kind === "asset" && selection.assetId === a.id;
            return (
              <li key={a.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  aria-label={`Select ${a.filename}`}
                  onClick={() => selectAsset(a.id)}
                  className={`w-full rounded-lg border p-1.5 text-left transition-colors ${
                    isSelected
                      ? "border-accent bg-accent-soft"
                      : "border-edge bg-raised hover:border-muted"
                  }`}
                >
                  <div
                    className="relative aspect-video w-full rounded-md"
                    style={{ background: a.thumb }}
                  >
                    <span className="absolute right-1 bottom-1 rounded bg-ink/80 px-1 font-mono text-[10px]">
                      {a.duration}
                    </span>
                    {a.used && (
                      <span className="absolute top-1 left-1">
                        <Chip tone="ok">Used</Chip>
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 truncate text-[11px] font-medium">{a.filename}</p>
                  <div className="mt-1 flex items-center justify-between text-[10px] text-muted">
                    <span>{a.resolution}</span>
                    <Chip tone={a.aiScore >= 90 ? "accent" : "neutral"}>AI {a.aiScore}</Chip>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
