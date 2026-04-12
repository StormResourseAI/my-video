import type { ClipEntry } from "./manifest";

const DEFAULT_START_TRIM_SEC = 0.3;
const DEFAULT_END_TRIM_SEC = 0.3;
const MIN_CLIP_SEC = 1.5;
const DEFAULT_MAX_CLIP_SEC = 7;

export type ClipTrim = {
  trimBefore: number;   // frames — absolute start position in source video
  trimAfter: number;    // frames — absolute end position in source video
  durationFrames: number; // trimAfter - trimBefore
};

export function computeClipTrim(clip: ClipEntry, fps: number): ClipTrim {
  const { durationSec, usableStartSec, usableEndSec, maxClipSec } = clip;

  const startSec = usableStartSec ?? DEFAULT_START_TRIM_SEC;
  const rawEndSec = usableEndSec ?? durationSec - DEFAULT_END_TRIM_SEC;
  const maxSec = maxClipSec ?? DEFAULT_MAX_CLIP_SEC;

  // Cap by maxClipSec
  const cappedEndSec = Math.min(rawEndSec, startSec + maxSec);

  let effectiveStart = startSec;
  let effectiveEnd = cappedEndSec;

  // Fall back to full duration if usable range is too short
  if (effectiveEnd - effectiveStart < MIN_CLIP_SEC) {
    effectiveStart = 0;
    effectiveEnd = durationSec;
  }

  // Clamp to actual video bounds
  effectiveStart = Math.max(0, effectiveStart);
  effectiveEnd = Math.min(durationSec, effectiveEnd);

  const trimBefore = Math.round(effectiveStart * fps);
  const trimAfter = Math.round(effectiveEnd * fps);

  return {
    trimBefore,
    trimAfter,
    durationFrames: Math.max(trimAfter - trimBefore, 1),
  };
}
