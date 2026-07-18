import { create } from "zustand";
import { PROJECTS } from "@/fixtures";
import type {
  AspectRatio,
  InspectorSelection,
  MediaFilter,
  PanelState,
  PanelVisibility,
  ProjectSection,
  TrackControlState,
} from "@/lib/types";

interface StudioState {
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

export const useStudioStore = create<StudioState>()((set) => ({
  activeNavItem: "Studio",
  setActiveNavItem: (item) => set({ activeNavItem: item }),

  activeProjectId: PROJECTS[0].id,
  activeSection: "Overview",
  projectPanelState: "normal",
  selectProject: (id) =>
    set({ activeProjectId: id, activeSection: "Overview", selection: { kind: "none" } }),
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
