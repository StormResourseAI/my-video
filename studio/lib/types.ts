export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:5";

/** Demo-only panel data state. Phase 1 has no real data source. */
export type PanelState = "normal" | "empty" | "loading" | "error";

/** Lifecycle of data fetched from the read-only Studio API. */
export type RemoteStatus = "idle" | "loading" | "loaded" | "error";

export type MediaKind = "video" | "photo" | "audio" | "generated";
export type MediaFilter = "all" | MediaKind;

export type ProjectSection =
  | "Overview"
  | "Source Media"
  | "AI Analysis"
  | "Story Plan"
  | "Timeline"
  | "Deliverables";

export interface Project {
  id: string;
  name: string;
  client: string;
  updated: string;
  /** Mock master format shown in the preview header. */
  resolution: string;
  fps: number;
  duration: string;
}

export interface MediaAsset {
  id: string;
  projectId: string;
  filename: string;
  kind: MediaKind;
  duration: string;
  resolution: string;
  aiScore: number;
  used: boolean;
  /** CSS gradient used as a thumbnail placeholder — no real media in Phase 1. */
  thumb: string;
}

export type TrackKind = "video" | "audio" | "caption";

export interface TimelineTrack {
  id: string;
  label: string;
  name: string;
  kind: TrackKind;
}

export type AiBadge = "AI SELECTED" | "AI TRIM" | "BEAT SYNCED" | "AUTO REFRAMED";

export interface TimelineClip {
  id: string;
  trackId: string;
  name: string;
  /** Start/duration in mock seconds on the timeline ruler. */
  start: number;
  duration: number;
  badges: AiBadge[];
  waveform: boolean;
  color: string;
}

export type InspectorSelection =
  | { kind: "none" }
  | { kind: "clip"; clipId: string }
  | { kind: "asset"; assetId: string };

export interface PanelVisibility {
  projectNav: boolean;
  mediaBrowser: boolean;
  inspector: boolean;
  timeline: boolean;
}

export interface TrackControlState {
  locked: boolean;
  muted: boolean;
  hidden: boolean;
}
