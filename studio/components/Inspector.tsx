"use client";

import { useStudioStore } from "@/state/studioStore";
import { Chip } from "./ui";

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="border-b border-edge px-3 py-2"><h3 className="text-[11px] font-bold tracking-widest text-muted uppercase">{title}</h3><div className="mt-2 flex flex-col gap-2">{children}</div></section>;
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-2 text-muted"><span>{label}</span><span className="text-right font-mono text-[11px] break-all text-text">{value}</span></div>;
}

export default function Inspector() {
  const doc = useStudioStore((s) => s.document);
  const draft = useStudioStore((s) => s.draft);
  const working = useStudioStore((s) => s.draftWorking);
  const selection = useStudioStore((s) => s.selection);
  const setTitle = useStudioStore((s) => s.setDraftTitle);
  const setBackground = useStudioStore((s) => s.setDraftBackground);
  const setTransition = useStudioStore((s) => s.setDraftTransition);
  const setTrim = useStudioStore((s) => s.setDraftTrim);
  const toggleClip = useStudioStore((s) => s.toggleDraftClip);
  const fps = doc?.composition?.fps ?? 30;

  const clipIndex = working && selection.kind === "clip" ? working.clips.findIndex((c) => c.sourceAssetId === selection.clipId) : -1;
  const clip = working && clipIndex >= 0 ? working.clips[clipIndex] : null;
  const asset = doc && selection.kind === "asset" ? doc.assets.find((a) => a.assetId === selection.assetId) : null;
  const colorValid = working ? /^#[0-9a-fA-F]{3,8}$/.test(working.backgroundColor) : true;

  return (
    <aside aria-label="Inspector" className="flex h-full min-h-0 flex-col overflow-y-auto border-l border-edge bg-panel">
      <div className="flex items-center justify-between border-b border-edge px-3 py-2"><h2 className="text-[11px] font-bold tracking-widest text-muted uppercase">Inspector</h2>{working ? <Chip tone="accent">Draft edit</Chip> : <Chip tone="warn">Read-only</Chip>}</div>
      {working && draft ? (
        <>
          <div className="border-b border-edge px-3 py-2"><p className="font-semibold">Editable draft</p><p className="text-[11px] text-muted">Saved v{draft.version}; source remains immutable.</p></div>
          <Group title="Draft settings">
            <label className="flex flex-col gap-1 text-muted">Draft title<input aria-label="Draft title" value={working.draftTitle ?? ""} maxLength={200} onChange={(e) => setTitle(e.target.value)} className="rounded border border-edge bg-raised px-2 py-1 text-text" /></label>
            <label className="flex flex-col gap-1 text-muted">Background color<input aria-label="Background color" value={working.backgroundColor} maxLength={9} aria-invalid={!colorValid} onChange={(e) => setBackground(e.target.value)} className={`rounded border px-2 py-1 font-mono text-text ${colorValid ? "border-edge bg-raised" : "border-danger bg-danger/10"}`} /></label>
            {!colorValid && <p role="alert" className="text-danger">Use a hex color such as #111111.</p>}
            <label className="flex flex-col gap-1 text-muted">Transition length<input type="number" aria-label="Transition frames" min={0} max={108000} step={1} value={working.transitionFrames} onChange={(e) => setTransition(Number(e.target.value))} className="rounded border border-edge bg-raised px-2 py-1 text-text" /><span className="text-[10px]">{working.transitionFrames} frames ≈ {(working.transitionFrames / fps).toFixed(2)} seconds</span></label>
          </Group>
          {clip ? <Group title={`Selected clip · ${clip.fileName}`}>
            <p data-testid="inspector-selection-name" className="font-semibold">{clip.fileName}</p>
            <p className="text-muted">Source window: {clip.sourceDurationInFrames} frames ≈ {(clip.sourceDurationInFrames / fps).toFixed(2)} seconds</p>
            <label className="text-muted">Trim from start (0–{clip.sourceDurationInFrames - clip.trimAfter - 1} frames)<input type="number" aria-label="Trim before" min={0} max={clip.sourceDurationInFrames - clip.trimAfter - 1} value={clip.trimBefore} onChange={(e) => setTrim(clipIndex, "trimBefore", Number(e.target.value))} className="mt-1 w-full rounded border border-edge bg-raised px-2 py-1 text-text" /></label>
            <label className="text-muted">Trim from end (0–{clip.sourceDurationInFrames - clip.trimBefore - 1} frames)<input type="number" aria-label="Trim after" min={0} max={clip.sourceDurationInFrames - clip.trimBefore - 1} value={clip.trimAfter} onChange={(e) => setTrim(clipIndex, "trimAfter", Number(e.target.value))} className="mt-1 w-full rounded border border-edge bg-raised px-2 py-1 text-text" /></label>
            <button type="button" aria-pressed={clip.enabled} onClick={() => toggleClip(clipIndex)} className="rounded bg-raised px-2 py-1 text-left">{clip.enabled ? "Disable clip" : "Enable clip"}</button>
          </Group> : <div className="m-3 rounded border border-dashed border-edge p-4 text-center text-muted">Select a timeline clip to edit trims and enabled state.</div>}
        </>
      ) : doc ? (
        <>{asset ? <><div className="border-b border-edge px-3 py-2"><p data-testid="inspector-selection-name" className="truncate font-semibold">{asset.fileName}</p><p className="text-muted">Source asset · read-only</p></div><Group title="Asset"><Row label="Kind" value={asset.kind} /><Row label="Project" value={doc.projectId} /></Group></> : <><div className="border-b border-edge px-3 py-2"><p className="font-semibold">{doc.projectName}</p><p className="text-muted">Immutable source project</p></div><Group title="Project"><Row label="Status" value={doc.status} /><Row label="Freshness" value={doc.freshness} /><Row label="Assets" value={String(doc.assets.length)} />{doc.composition && <Row label="Duration" value={`${doc.composition.durationInFrames} frames (${(doc.composition.durationInFrames / fps).toFixed(1)}s)`} />}</Group></>}</>
      ) : <div className="m-3 rounded border border-dashed border-edge p-4 text-center text-muted">Select a real project. Draft editing controls appear only after Create Draft.</div>}
    </aside>
  );
}
