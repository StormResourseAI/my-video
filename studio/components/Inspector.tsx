"use client";

import { useState } from "react";
import { CLIPS, MEDIA_ASSETS } from "@/fixtures";
import { useStudioStore } from "@/state/studioStore";
import { Chip } from "./ui";

const CLIP_TOOLS = [
  "Best Moment",
  "Auto Reframe",
  "Remove Silence",
  "Generate Captions",
  "Replace Clip",
  "Extend Scene",
];

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details open className="border-b border-edge px-3 py-2">
      <summary className="cursor-pointer text-[11px] font-bold tracking-widest text-muted uppercase select-none">
        {title}
      </summary>
      <div className="mt-2 flex flex-col gap-2">{children}</div>
    </details>
  );
}

function MockField({ label, value }: { label: string; value: string }) {
  return (
    <label className="flex items-center justify-between gap-2 text-muted">
      <span>{label}</span>
      <input
        type="text"
        readOnly
        disabled
        value={value}
        aria-label={label}
        title="Mock only — not wired in Phase 1"
        className="w-24 rounded border border-edge bg-raised px-1.5 py-1 text-right font-mono text-[11px] text-muted"
      />
    </label>
  );
}

function MockSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-muted">
      <span>{label}</span>
      <select
        aria-label={label}
        title="Local state only — not wired in Phase 1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-32 rounded border border-edge bg-raised px-1.5 py-1 text-[11px]"
      >
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

/** Project-level creative settings shown when nothing is selected.
 *  Local-state-only: values are kept in component state and drive nothing. */
function ProjectSettings() {
  const [direction, setDirection] = useState("Warm & inviting");
  const [pacing, setPacing] = useState("Relaxed");
  const [energy, setEnergy] = useState(60);
  const [captionStyle, setCaptionStyle] = useState("Clean sans");
  const [brandKit, setBrandKit] = useState("Coastal Stays");
  const [platform, setPlatform] = useState("Instagram Reels");
  const [length, setLength] = useState("30 s");

  return (
    <>
      <div className="border-b border-edge px-3 py-2">
        <p className="font-semibold">Project settings</p>
        <p className="mt-0.5 text-[11px] text-muted">
          Select a clip or media asset to inspect it.
        </p>
      </div>
      <Group title="Creative Direction">
        <MockSelect
          label="Creative Direction"
          options={["Warm & inviting", "Bold & punchy", "Minimal & calm"]}
          value={direction}
          onChange={setDirection}
        />
      </Group>
      <Group title="Pacing">
        <MockSelect
          label="Pacing"
          options={["Relaxed", "Medium", "Fast"]}
          value={pacing}
          onChange={setPacing}
        />
      </Group>
      <Group title="Music Energy">
        <label className="flex items-center justify-between gap-2 text-muted">
          <span>Energy</span>
          <input
            type="range"
            min={0}
            max={100}
            value={energy}
            aria-label="Music Energy"
            title="Local state only — not wired in Phase 1"
            onChange={(e) => setEnergy(Number(e.target.value))}
            className="w-32 accent-(--color-accent)"
          />
        </label>
      </Group>
      <Group title="Caption Style">
        <MockSelect
          label="Caption Style"
          options={["Clean sans", "Bold pop", "Serif editorial"]}
          value={captionStyle}
          onChange={setCaptionStyle}
        />
      </Group>
      <Group title="Brand Kit">
        <MockSelect
          label="Brand Kit"
          options={["Coastal Stays", "Ridgeline Realty", "Maple & Stone"]}
          value={brandKit}
          onChange={setBrandKit}
        />
      </Group>
      <Group title="Target Platform">
        <MockSelect
          label="Target Platform"
          options={["Instagram Reels", "TikTok", "YouTube", "Airbnb listing"]}
          value={platform}
          onChange={setPlatform}
        />
      </Group>
      <Group title="Desired Length">
        <MockSelect
          label="Desired Length"
          options={["15 s", "30 s", "60 s", "90 s"]}
          value={length}
          onChange={setLength}
        />
      </Group>
    </>
  );
}

function ClipDetails({ name, meta }: { name: string; meta: string }) {
  return (
    <>
      <div className="border-b border-edge px-3 py-2">
        <p className="truncate font-semibold" data-testid="inspector-selection-name">
          {name}
        </p>
        <p className="mt-0.5 text-[11px] text-muted">{meta}</p>
      </div>
      <Group title="Transform">
        <MockField label="Position X" value="0" />
        <MockField label="Position Y" value="0" />
        <MockField label="Scale" value="100%" />
        <MockField label="Rotation" value="0°" />
      </Group>
      <Group title="Crop & Reframe">
        <MockField label="Crop" value="None" />
        <MockField label="Reframe" value="Center" />
      </Group>
      <Group title="Speed">
        <MockField label="Speed" value="100%" />
      </Group>
      <Group title="Volume">
        <MockField label="Volume" value="0 dB" />
      </Group>
      <Group title="Color">
        <MockField label="LUT" value="Neutral" />
        <MockField label="Exposure" value="0.0" />
      </Group>
      <Group title="Transitions">
        <MockField label="In" value="Cut" />
        <MockField label="Out" value="Cross 12f" />
      </Group>
      <Group title="AI Tools">
        {CLIP_TOOLS.map((tool) => (
          <button
            key={tool}
            type="button"
            disabled
            title="Mock only — not wired in Phase 1"
            className="rounded-md border border-edge bg-raised px-2 py-1.5 text-left text-muted"
          >
            ✦ {tool}
          </button>
        ))}
      </Group>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2 text-muted">
      <span className="shrink-0">{label}</span>
      <span className="text-right font-mono text-[11px] break-all text-text">{value}</span>
    </div>
  );
}

/** Real project / asset metadata — read-only, no mock editing affordances. */
function RealDetails() {
  const doc = useStudioStore((s) => s.document);
  const selection = useStudioStore((s) => s.selection);

  if (doc === null) {
    return (
      <div className="m-3 rounded-md border border-dashed border-edge p-4 text-center text-muted">
        Project metadata appears here once the project loads.
      </div>
    );
  }

  const asset =
    selection.kind === "asset"
      ? (doc.assets.find((a) => a.assetId === selection.assetId) ?? null)
      : null;

  if (asset !== null) {
    return (
      <>
        <div className="border-b border-edge px-3 py-2">
          <p className="truncate font-semibold" data-testid="inspector-selection-name">
            {asset.fileName}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">Staged clip · read-only</p>
        </div>
        <Group title="Asset">
          <Row label="Kind" value={asset.kind} />
          <Row label="Project" value={doc.projectId} />
          <Row label="Served from" value={asset.previewUrl} />
        </Group>
      </>
    );
  }

  return (
    <>
      <div className="border-b border-edge px-3 py-2">
        <p className="truncate font-semibold">{doc.projectName}</p>
        <p className="mt-0.5 text-[11px] text-muted">Read-only project overview</p>
      </div>
      <Group title="Project">
        <Row label="Id" value={doc.projectId} />
        <Row label="Client" value={doc.clientSlug ?? "—"} />
        <Row label="Status" value={doc.status} />
        <Row label="Source" value="materialized cache" />
        <Row label="Cached" value={doc.cacheTimestamp ?? "—"} />
        <Row label="Freshness" value={doc.freshness} />
        <Row label="Assets" value={String(doc.assets.length)} />
      </Group>
      {doc.composition !== null && (
        <Group title="Composition">
          <Row label="Id" value={doc.composition.compositionId} />
          <Row
            label="Frame"
            value={`${doc.composition.width}×${doc.composition.height} @ ${doc.composition.fps}fps`}
          />
          <Row label="Duration" value={`${doc.composition.durationInFrames} frames`} />
          <Row label="Aspect" value={doc.composition.aspectRatio} />
        </Group>
      )}
      {doc.warnings.length > 0 && (
        <Group title="Warnings">
          {doc.warnings.map((w) => (
            <p key={w} className="text-[11px] text-warn">
              {w}
            </p>
          ))}
        </Group>
      )}
    </>
  );
}

export default function Inspector() {
  const selection = useStudioStore((s) => s.selection);
  const realMode = useStudioStore((s) => s.activeRealProjectId) !== null;

  if (realMode) {
    return (
      <aside
        aria-label="Inspector"
        className="flex h-full min-h-0 flex-col overflow-y-auto border-l border-edge bg-panel"
      >
        <div className="flex items-center justify-between border-b border-edge px-3 py-2">
          <h2 className="text-[11px] font-bold tracking-widest text-muted uppercase">Inspector</h2>
          <Chip tone="warn">Read-only</Chip>
        </div>
        <RealDetails />
      </aside>
    );
  }

  let body: React.ReactNode;
  if (selection.kind === "clip") {
    const clip = CLIPS.find((c) => c.id === selection.clipId);
    body = clip ? (
      <ClipDetails
        name={clip.name}
        meta={`Timeline clip · ${clip.duration}s${clip.badges.length ? ` · ${clip.badges.join(", ")}` : ""}`}
      />
    ) : (
      <ProjectSettings />
    );
  } else if (selection.kind === "asset") {
    const asset = MEDIA_ASSETS.find((a) => a.id === selection.assetId);
    body = asset ? (
      <ClipDetails
        name={asset.filename}
        meta={`${asset.kind} · ${asset.resolution} · AI score ${asset.aiScore}`}
      />
    ) : (
      <ProjectSettings />
    );
  } else {
    body = <ProjectSettings />;
  }

  return (
    <aside
      aria-label="Inspector"
      className="flex h-full min-h-0 flex-col overflow-y-auto border-l border-edge bg-panel"
    >
      <div className="flex items-center justify-between border-b border-edge px-3 py-2">
        <h2 className="text-[11px] font-bold tracking-widest text-muted uppercase">Inspector</h2>
        <Chip>Mock</Chip>
      </div>
      {body}
    </aside>
  );
}
