"use client";

import type { PanelState } from "@/lib/types";

export function Chip({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "accent" | "ok" | "warn";
}) {
  const tones = {
    neutral: "bg-raised text-muted",
    accent: "bg-accent-soft text-accent",
    ok: "bg-ok/15 text-ok",
    warn: "bg-warn/15 text-warn",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-px text-[10px] font-semibold tracking-wide uppercase ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** Demo-only data-state switcher. Phase 1 has no real data source, so panel
 *  states are driven explicitly to make empty/loading/error reachable. */
export function StateSwitcher({
  label,
  value,
  onChange,
}: {
  label: string;
  value: PanelState;
  onChange: (s: PanelState) => void;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as PanelState)}
      className="rounded border border-edge bg-raised px-1 py-0.5 text-[10px] text-muted"
    >
      <option value="normal">normal</option>
      <option value="empty">empty</option>
      <option value="loading">loading</option>
      <option value="error">error</option>
    </select>
  );
}

export function PanelStateView({
  state,
  emptyMessage,
  errorMessage,
}: {
  state: Exclude<PanelState, "normal">;
  emptyMessage: string;
  errorMessage: string;
}) {
  if (state === "loading") {
    return (
      <div role="status" aria-label="Loading" className="flex flex-col gap-2 p-3">
        <div className="skeleton h-14" />
        <div className="skeleton h-14" />
        <div className="skeleton h-14" />
        <span className="sr-only">Loading</span>
      </div>
    );
  }
  if (state === "error") {
    return (
      <div role="alert" className="m-3 rounded-md border border-danger/40 bg-danger/10 p-3">
        <p className="font-semibold text-danger">Something went wrong</p>
        <p className="mt-1 text-muted">{errorMessage}</p>
        <button
          type="button"
          disabled
          title="Mock only — retry is not wired in Phase 1"
          className="mt-2 rounded border border-edge bg-raised px-2 py-1 text-muted disabled:opacity-60"
        >
          Retry
        </button>
      </div>
    );
  }
  return (
    <div className="m-3 rounded-md border border-dashed border-edge p-4 text-center text-muted">
      {emptyMessage}
    </div>
  );
}
