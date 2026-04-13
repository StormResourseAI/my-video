import type { ClipEntry } from "./manifest";

export type VariantConfig = {
  id: string;
  hookText: string | null;       // null = use profile default
  clipOrder: "original" | "reverse" | "score-desc";
  clipLimit: number | null;      // null = no limit
  maxClipSec: number | null;     // null = use profile pacing default
};

/**
 * Apply variant ordering and limit to a clips array.
 * Returns a new array; does not mutate the input.
 */
export function applyVariantClips(
  clips: ClipEntry[],
  variant: VariantConfig
): ClipEntry[] {
  let result = [...clips];

  if (variant.clipOrder === "reverse") {
    result = result.reverse();
  } else if (variant.clipOrder === "score-desc") {
    result = result.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }

  if (variant.clipLimit !== null) {
    result = result.slice(0, variant.clipLimit);
  }

  return result;
}
