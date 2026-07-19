"use client";

import { useStudioStore } from "@/state/studioStore";
import { Chip } from "./ui";

export default function MediaBrowser() {
  const doc = useStudioStore((s) => s.document);
  const selection = useStudioStore((s) => s.selection);
  const selectAsset = useStudioStore((s) => s.selectAsset);

  return (
    <section aria-label="Media browser" className="flex h-full min-h-0 flex-col border-r border-edge bg-panel">
      <div className="flex items-center justify-between gap-2 border-b border-edge px-3 py-2">
        <h2 className="text-[11px] font-bold tracking-widest text-muted uppercase">Source media</h2>
        <Chip tone="warn">Read-only</Chip>
      </div>
      {doc === null ? (
        <div className="m-3 rounded-md border border-dashed border-edge p-4 text-center text-muted">
          Select a real project to inspect its source media. Studio never modifies source files.
        </div>
      ) : doc.assets.length === 0 ? (
        <div className="m-3 rounded-md border border-dashed border-edge p-4 text-center text-muted">
          This project references no available media. The source remains unchanged.
        </div>
      ) : (
        <ul role="listbox" aria-label="Project source media" className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
          {doc.assets.map((asset) => {
            const selected = selection.kind === "asset" && selection.assetId === asset.assetId;
            return (
              <li key={asset.assetId} role="presentation">
                <button type="button" role="option" aria-selected={selected} aria-label={`Select ${asset.fileName}`}
                  onClick={() => selectAsset(asset.assetId)}
                  className={`w-full rounded-lg border p-2 text-left ${selected ? "border-accent bg-accent-soft" : "border-edge bg-raised hover:border-muted"}`}>
                  <p className="truncate text-[12px] font-medium">{asset.fileName}</p>
                  <div className="mt-1 flex gap-1"><Chip>Video</Chip><Chip tone="warn">Source</Chip></div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
