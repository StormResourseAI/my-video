export type BrandConfig = {
  color: string;
  backgroundColor: string;
  fontFamily: string;
  hookText: string;
  handle: string;
};

export type CaptionConfig = {
  fontSize: number;
  fontWeight: number;
  backgroundColor: string;
  color: string;
  bottomOffset: number;
};

export type PacingConfig = {
  startTrimSec: number;
  endTrimSec: number;
  maxClipSec: number;
  minClipSec: number;
};

export type BeatSyncConfig = {
  enabled: boolean;
  snapWindowSec: number;
};

export type TransitionConfig = {
  enabled: boolean;
  durationSec: number;
  scale: boolean;
};

export type SelectionConfig = {
  mode: "all" | "top";
  topN: number;
  minScore: number;       // clips below this score are dropped (-Infinity = keep all)
  hookEnabled: boolean;   // promote best hook clip to position 0
};

export type AudioConfig = {
  musicVolume: number;
  duckedVolume: number;    // absolute volume level during active speech
  duckingEnabled: boolean;
};

export type HookConfig = {
  enabled: boolean;
  text: string;
  durationSec: number;
  position: "top" | "center" | "bottom";
  fontSize: number;
  backgroundColor: string;
};

export type FullProfile = {
  brand: BrandConfig;
  caption: CaptionConfig;
  pacing: PacingConfig;
  beatSync: BeatSyncConfig;
  transition: TransitionConfig;
  hook: HookConfig;
  audio: AudioConfig;
  selection: SelectionConfig;
};

export const DEFAULT_PROFILE: FullProfile = {
  brand: {
    color: "#7C3AED",
    backgroundColor: "#0f0f0f",
    fontFamily: "sans-serif",
    hookText: "You need to see this.",
    handle: "@yourbrand",
  },
  caption: {
    fontSize: 44,
    fontWeight: 700,
    backgroundColor: "rgba(0,0,0,0.75)",
    color: "#ffffff",
    bottomOffset: 320,
  },
  pacing: {
    startTrimSec: 0.3,
    endTrimSec: 0.3,
    maxClipSec: 7,
    minClipSec: 1.5,
  },
  beatSync: {
    enabled: true,
    snapWindowSec: 1.5,
  },
  transition: {
    enabled: true,
    durationSec: 0.3,
    scale: true,
  },
  hook: {
    enabled: true,
    text: "You need to see this.",
    durationSec: 1.5,
    position: "top",
    fontSize: 56,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  audio: {
    musicVolume: 0.3,
    duckedVolume: 0.07,
    duckingEnabled: true,
  },
  selection: {
    mode: "all",
    topN: 5,
    minScore: -10,
    hookEnabled: false,
  },
};

type DeepPartialProfile = {
  brand?: Partial<BrandConfig>;
  caption?: Partial<CaptionConfig>;
  pacing?: Partial<PacingConfig>;
  beatSync?: Partial<BeatSyncConfig>;
  transition?: Partial<TransitionConfig>;
  hook?: Partial<HookConfig>;
  audio?: Partial<AudioConfig>;
  selection?: Partial<SelectionConfig>;
};

/**
 * Merge a (possibly partial) profile JSON over the defaults.
 * Safe to call with null / undefined — returns full defaults.
 */
export function resolveProfile(raw: unknown): FullProfile {
  const p = (raw ?? {}) as DeepPartialProfile;
  return {
    brand: { ...DEFAULT_PROFILE.brand, ...p.brand },
    caption: { ...DEFAULT_PROFILE.caption, ...p.caption },
    pacing: { ...DEFAULT_PROFILE.pacing, ...p.pacing },
    beatSync: { ...DEFAULT_PROFILE.beatSync, ...p.beatSync },
    transition: { ...DEFAULT_PROFILE.transition, ...p.transition },
    hook: { ...DEFAULT_PROFILE.hook, ...p.hook },
    audio: { ...DEFAULT_PROFILE.audio, ...p.audio },
    selection: { ...DEFAULT_PROFILE.selection, ...p.selection },
  };
}
