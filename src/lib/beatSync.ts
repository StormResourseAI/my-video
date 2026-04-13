import type { ClipEntry } from "./manifest";
import type { BeatsData } from "./beats";
import type { BeatSyncConfig, PacingConfig } from "./profile";
import { DEFAULT_PROFILE } from "./profile";
import { beatFrames } from "./beats";
import { computeClipTrim } from "./trimming";

function snapToBeat(
  globalOffset: number,
  defaultDuration: number,
  allBeatFrames: number[],
  minDuration: number,
  maxDuration: number
): number {
  const targetFrame = globalOffset + defaultDuration;
  const minFrame = globalOffset + minDuration;
  const maxFrame = globalOffset + maxDuration;

  const candidates = allBeatFrames.filter(
    (b) => b >= minFrame && b <= maxFrame
  );
  if (candidates.length === 0) return defaultDuration;

  return (
    candidates.reduce((best, b) =>
      Math.abs(b - targetFrame) < Math.abs(best - targetFrame) ? b : best
    ) - globalOffset
  );
}

/**
 * Build a beat-snapped duration array for the full clip timeline.
 * Pass beatSyncConfig and pacingConfig from the active style profile.
 * Falls back to defaults if either is omitted.
 * If beatsData is null/empty or beatSync.enabled is false, returns default trimmed durations.
 */
export function buildBeatTimeline(
  clips: ClipEntry[],
  beatsData: BeatsData | null,
  fps: number,
  beatSyncConfig?: BeatSyncConfig,
  pacingConfig?: PacingConfig
): number[] {
  const bsCfg = beatSyncConfig ?? DEFAULT_PROFILE.beatSync;
  const pacing = pacingConfig ?? DEFAULT_PROFILE.pacing;

  const active = bsCfg.enabled && beatsData && beatsData.beats.length > 0;
  const frames = active ? beatFrames(beatsData!) : [];

  const snapWindow = Math.round(bsCfg.snapWindowSec * fps);
  const minClipFrames = Math.round(pacing.minClipSec * fps);

  let offset = 0;

  return clips.map((clip) => {
    const trim = computeClipTrim(clip, fps, pacing);
    const defaultDuration = trim.durationFrames;

    const maxAvailable =
      Math.round(clip.durationSec * fps) - trim.trimBefore;
    const maxDuration = Math.min(defaultDuration + snapWindow, maxAvailable);

    const snapped =
      frames.length > 0
        ? snapToBeat(offset, defaultDuration, frames, minClipFrames, maxDuration)
        : defaultDuration;

    offset += snapped;
    return snapped;
  });
}
