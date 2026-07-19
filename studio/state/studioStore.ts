import { create } from "zustand";
import { PROJECTS } from "@/fixtures";
import {
  createDraftApi,
  fetchDraft,
  fetchProject,
  fetchProjects,
  saveDraftApi,
} from "@/lib/projectClient";
import { MAX_FRAMES } from "@/lib/projectDocument";
import type { ProjectDocumentV1, ProjectSummaryV1 } from "@/lib/projectDocument";
import type { StudioDraftClipV1, StudioDraftV1 } from "@/lib/draftDocument";
import type {
  AspectRatio,
  InspectorSelection,
  MediaFilter,
  PanelState,
  PanelVisibility,
  ProjectSection,
  RemoteStatus,
  TrackControlState,
} from "@/lib/types";

/** In-memory working copy of a draft's editable fields. Lives only in
 *  browser state until the user explicitly saves. */
export interface DraftWorking {
  draftTitle: string | null;
  backgroundColor: string;
  transitionFrames: number;
  clips: StudioDraftClipV1[];
}

const DRAFT_SESSION_KEY = "myvideoStudioDraft";

function rememberDraftSession(projectId: string, draftId: string): void {
  try {
    window.sessionStorage.setItem(DRAFT_SESSION_KEY, JSON.stringify({ projectId, draftId }));
  } catch {
    // Session persistence is best-effort.
  }
}

function forgetDraftSession(): void {
  try {
    window.sessionStorage.removeItem(DRAFT_SESSION_KEY);
  } catch {
    // ignore
  }
}

export function readDraftSession(): { projectId: string; draftId: string } | null {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_SESSION_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as { projectId?: unknown; draftId?: unknown };
    if (typeof parsed.projectId !== "string" || typeof parsed.draftId !== "string") return null;
    return { projectId: parsed.projectId, draftId: parsed.draftId };
  } catch {
    return null;
  }
}

const workingFrom = (draft: StudioDraftV1): DraftWorking => ({
  draftTitle: draft.draftTitle,
  backgroundColor: draft.backgroundColor,
  transitionFrames: draft.transitionFrames,
  clips: draft.clips.map((c) => ({ ...c })),
});

const CLEARED_DRAFT = {
  draft: null,
  draftWorking: null,
  draftDirty: false,
  draftBusy: "idle" as const,
  draftError: null,
};

interface StudioState {
  // Draft editing (Phase 3) — non-destructive, explicit-save only.
  draft: StudioDraftV1 | null;
  draftWorking: DraftWorking | null;
  draftDirty: boolean;
  draftBusy: "idle" | "creating" | "saving" | "restoring";
  draftError: string | null;
  createDraftFromSource: () => Promise<void>;
  restoreDraftSession: () => Promise<void>;
  saveDraft: () => Promise<void>;
  exitDraft: () => void;
  setDraftTitle: (title: string) => void;
  setDraftBackground: (color: string) => void;
  setDraftTransition: (frames: number) => void;
  moveDraftClip: (index: number, delta: -1 | 1) => void;
  toggleDraftClip: (index: number) => void;
  setDraftTrim: (index: number, field: "trimBefore" | "trimAfter", value: number) => void;

  // Real projects (read-only, via /api/projects)
  realProjects: ProjectSummaryV1[];
  realProjectsStatus: RemoteStatus;
  realProjectsError: string | null;
  activeRealProjectId: string | null;
  document: ProjectDocumentV1 | null;
  documentStatus: RemoteStatus;
  documentError: string | null;
  loadRealProjects: () => Promise<void>;
  selectRealProject: (projectId: string) => Promise<void>;
  clearRealProject: () => void;

  // Real preview playback (mirrored from the Remotion Player)
  playerFrame: number;
  playerPlaying: boolean;
  previewScale: number;
  setPlayerFrame: (frame: number) => void;
  setPlayerPlaying: (playing: boolean) => void;
  setPreviewScale: (scale: number) => void;

  // App rail
  activeNavItem: string;
  setActiveNavItem: (item: string) => void;

  // Project navigation
  activeProjectId: string;
  activeSection: ProjectSection;
  projectPanelState: PanelState;
  selectProject: (id: string) => void;
  selectSection: (section: ProjectSection) => void;
  setProjectPanelState: (s: PanelState) => void;

  // Media browser
  mediaFilter: MediaFilter;
  mediaSearch: string;
  mediaPanelState: PanelState;
  setMediaFilter: (f: MediaFilter) => void;
  setMediaSearch: (q: string) => void;
  setMediaPanelState: (s: PanelState) => void;

  // Inspector selection
  selection: InspectorSelection;
  selectAsset: (assetId: string) => void;
  selectClip: (clipId: string) => void;
  clearSelection: () => void;

  // Preview monitor
  aspectRatio: AspectRatio;
  playing: boolean;
  currentTime: number;
  safeZones: boolean;
  fullscreen: boolean;
  setAspectRatio: (a: AspectRatio) => void;
  togglePlay: () => void;
  tick: (dt: number) => void;
  toggleSafeZones: () => void;
  toggleFullscreen: () => void;

  // Timeline
  zoom: number;
  trackControls: Record<string, TrackControlState>;
  setZoom: (z: number) => void;
  toggleTrackControl: (trackId: string, key: keyof TrackControlState) => void;

  // Panels
  panels: PanelVisibility;
  togglePanel: (panel: keyof PanelVisibility) => void;
}

const DEFAULT_TRACK_CONTROL: TrackControlState = {
  locked: false,
  muted: false,
  hidden: false,
};

export const useStudioStore = create<StudioState>()((set, get) => ({
  ...CLEARED_DRAFT,
  createDraftFromSource: async () => {
    const { activeRealProjectId, draftBusy } = get();
    if (activeRealProjectId === null || draftBusy !== "idle") return;
    set({ draftBusy: "creating", draftError: null });
    const res = await createDraftApi(activeRealProjectId);
    if (get().activeRealProjectId !== activeRealProjectId) return;
    if (res.ok) {
      rememberDraftSession(activeRealProjectId, res.value.draftId);
      set({
        draft: res.value,
        draftWorking: workingFrom(res.value),
        draftDirty: false,
        draftBusy: "idle",
        draftError: null,
        selection: { kind: "none" },
      });
    } else {
      set({ draftBusy: "idle", draftError: res.message });
    }
  },
  restoreDraftSession: async () => {
    const session = readDraftSession();
    if (session === null || get().draft !== null) return;
    set({ draftBusy: "restoring", draftError: null });
    await get().selectRealProject(session.projectId);
    const res = await fetchDraft(session.draftId);
    if (get().activeRealProjectId !== session.projectId) return;
    if (res.ok && res.value.sourceProjectId === session.projectId) {
      set({
        draft: res.value,
        draftWorking: workingFrom(res.value),
        draftDirty: false,
        draftBusy: "idle",
        draftError: null,
      });
    } else {
      forgetDraftSession();
      set({ draftBusy: "idle", draftError: null });
    }
  },
  saveDraft: async () => {
    const { draft, draftWorking, draftBusy } = get();
    if (draft === null || draftWorking === null || draftBusy !== "idle") return;
    set({ draftBusy: "saving", draftError: null });
    const res = await saveDraftApi(draft.draftId, {
      expectedVersion: draft.version,
      draftTitle: draftWorking.draftTitle,
      backgroundColor: draftWorking.backgroundColor,
      transitionFrames: draftWorking.transitionFrames,
      clips: draftWorking.clips.map((c) => ({
        sourceAssetId: c.sourceAssetId,
        trimBefore: c.trimBefore,
        trimAfter: c.trimAfter,
        enabled: c.enabled,
      })),
    });
    if (get().draft?.draftId !== draft.draftId) return;
    if (res.ok) {
      set({
        draft: res.value,
        draftWorking: workingFrom(res.value),
        draftDirty: false,
        draftBusy: "idle",
        draftError: null,
      });
    } else {
      const message =
        res.code === "version_conflict"
          ? "Save conflict: this draft changed elsewhere. Exit and reopen the draft to load the latest version."
          : res.message;
      set({ draftBusy: "idle", draftError: message });
    }
  },
  exitDraft: () => {
    forgetDraftSession();
    set({ ...CLEARED_DRAFT, selection: { kind: "none" }, playerPlaying: false });
  },
  setDraftTitle: (title) =>
    set((s) =>
      s.draftWorking === null
        ? s
        : {
            draftWorking: { ...s.draftWorking, draftTitle: title === "" ? null : title },
            draftDirty: true,
          },
    ),
  setDraftBackground: (color) =>
    set((s) =>
      s.draftWorking === null
        ? s
        : { draftWorking: { ...s.draftWorking, backgroundColor: color }, draftDirty: true },
    ),
  setDraftTransition: (frames) =>
    set((s) => {
      if (s.draftWorking === null || !Number.isFinite(frames)) return s;
      const clamped = Math.min(MAX_FRAMES, Math.max(0, Math.round(frames)));
      return {
        draftWorking: { ...s.draftWorking, transitionFrames: clamped },
        draftDirty: true,
      };
    }),
  moveDraftClip: (index, delta) =>
    set((s) => {
      if (s.draftWorking === null) return s;
      const target = index + delta;
      const clips = s.draftWorking.clips;
      if (index < 0 || index >= clips.length || target < 0 || target >= clips.length) return s;
      const next = clips.map((c) => ({ ...c }));
      [next[index], next[target]] = [next[target], next[index]];
      next.forEach((c, i) => {
        c.order = i;
      });
      return { draftWorking: { ...s.draftWorking, clips: next }, draftDirty: true };
    }),
  toggleDraftClip: (index) =>
    set((s) => {
      if (s.draftWorking === null || s.draftWorking.clips[index] === undefined) return s;
      const next = s.draftWorking.clips.map((c, i) =>
        i === index ? { ...c, enabled: !c.enabled } : c,
      );
      return { draftWorking: { ...s.draftWorking, clips: next }, draftDirty: true };
    }),
  setDraftTrim: (index, field, value) =>
    set((s) => {
      if (s.draftWorking === null || !Number.isFinite(value)) return s;
      const clip = s.draftWorking.clips[index];
      if (clip === undefined) return s;
      const other = field === "trimBefore" ? clip.trimAfter : clip.trimBefore;
      const max = Math.max(0, clip.sourceDurationInFrames - other - 1);
      const clamped = Math.min(max, Math.max(0, Math.round(value)));
      const next = s.draftWorking.clips.map((c, i) =>
        i === index ? { ...c, [field]: clamped } : c,
      );
      return { draftWorking: { ...s.draftWorking, clips: next }, draftDirty: true };
    }),

  realProjects: [],
  realProjectsStatus: "idle",
  realProjectsError: null,
  activeRealProjectId: null,
  document: null,
  documentStatus: "idle",
  documentError: null,
  loadRealProjects: async () => {
    set({ realProjectsStatus: "loading", realProjectsError: null });
    const res = await fetchProjects();
    if (res.ok) {
      set({ realProjects: res.value, realProjectsStatus: "loaded" });
    } else {
      set({ realProjects: [], realProjectsStatus: "error", realProjectsError: res.message });
    }
  },
  selectRealProject: async (projectId) => {
    set({
      ...CLEARED_DRAFT,
      activeRealProjectId: projectId,
      document: null,
      documentStatus: "loading",
      documentError: null,
      selection: { kind: "none" },
      playerFrame: 0,
      playerPlaying: false,
    });
    const res = await fetchProject(projectId);
    // Ignore stale responses after the user switched projects again.
    if (get().activeRealProjectId !== projectId) return;
    if (res.ok) {
      set({ document: res.value, documentStatus: "loaded" });
    } else {
      set({ document: null, documentStatus: "error", documentError: res.message });
    }
  },
  clearRealProject: () =>
    set({
      ...CLEARED_DRAFT,
      activeRealProjectId: null,
      document: null,
      documentStatus: "idle",
      documentError: null,
      selection: { kind: "none" },
      playerPlaying: false,
    }),

  playerFrame: 0,
  playerPlaying: false,
  previewScale: 1,
  setPlayerFrame: (frame) => set({ playerFrame: frame }),
  setPlayerPlaying: (playing) => set({ playerPlaying: playing }),
  setPreviewScale: (scale) => set({ previewScale: Math.min(1, Math.max(0.25, scale)) }),

  activeNavItem: "Studio",
  setActiveNavItem: (item) => set({ activeNavItem: item }),

  activeProjectId: PROJECTS[0].id,
  activeSection: "Overview",
  projectPanelState: "normal",
  selectProject: (id) =>
    set({
      ...CLEARED_DRAFT,
      activeProjectId: id,
      activeSection: "Overview",
      selection: { kind: "none" },
      // Selecting a mock project leaves real-project mode entirely.
      activeRealProjectId: null,
      document: null,
      documentStatus: "idle",
      documentError: null,
      playerPlaying: false,
    }),
  selectSection: (section) => set({ activeSection: section }),
  setProjectPanelState: (s) => set({ projectPanelState: s }),

  mediaFilter: "all",
  mediaSearch: "",
  mediaPanelState: "normal",
  setMediaFilter: (f) => set({ mediaFilter: f }),
  setMediaSearch: (q) => set({ mediaSearch: q }),
  setMediaPanelState: (s) => set({ mediaPanelState: s }),

  selection: { kind: "none" },
  selectAsset: (assetId) => set({ selection: { kind: "asset", assetId } }),
  selectClip: (clipId) => set({ selection: { kind: "clip", clipId } }),
  clearSelection: () => set({ selection: { kind: "none" } }),

  aspectRatio: "16:9",
  playing: false,
  currentTime: 0,
  safeZones: false,
  fullscreen: false,
  setAspectRatio: (a) => set({ aspectRatio: a }),
  togglePlay: () => set((s) => ({ playing: !s.playing })),
  tick: (dt) => set((s) => ({ currentTime: s.currentTime + dt })),
  toggleSafeZones: () => set((s) => ({ safeZones: !s.safeZones })),
  toggleFullscreen: () => set((s) => ({ fullscreen: !s.fullscreen })),

  zoom: 1,
  trackControls: {},
  setZoom: (z) => set({ zoom: Math.min(4, Math.max(0.5, z)) }),
  toggleTrackControl: (trackId, key) =>
    set((s) => {
      const current = s.trackControls[trackId] ?? DEFAULT_TRACK_CONTROL;
      return {
        trackControls: {
          ...s.trackControls,
          [trackId]: { ...current, [key]: !current[key] },
        },
      };
    }),

  panels: { projectNav: true, mediaBrowser: true, inspector: true, timeline: true },
  togglePanel: (panel) =>
    set((s) => ({ panels: { ...s.panels, [panel]: !s.panels[panel] } })),
}));
