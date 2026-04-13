import type { ClipEntry } from "./manifest";
import type { PacingConfig } from "./profile";
import { DEFAULT_PROFILE } from "./profile";

export type ClipTrim = {
  trimBefore: number;   // frames — absolute start position in source video
  trimAfter: number;    // frames — absolute end position in source video
  durationFrames: number; // trimAfter - trimBefore
};

export function computeClipTrim(
  clip: ClipEntry,
  fps: number,
  pacing?: PacingConfig
): ClipTrim {
  const p = pacing ?? DEFAULT_PROFILE.pacing;
  const { durationSec, usableStartSec, usableEndSec, maxClipSec } = clip;

  const startSec = usableStartSec ?? p.startTrimSec;
  const rawEndSec = usableEndSec ?? durationSec - p.endTrimSec;
  const maxSec = maxClipSec ?? p.maxClipSec;

  const cappedEndSec = Math.min(rawEndSec, startSec + maxSec);

  let effectiveStart = startSec;
  let effectiveEnd = cappedEndSec;

  // Fall back to full duration if usable range is too short
  if (effectiveEnd - effectiveStart < p.minClipSec) {
    effectiveStart = 0;
    effectiveEnd = durationSec;
  }

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
