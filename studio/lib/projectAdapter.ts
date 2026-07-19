// Pure client-safe adapter: ProjectDocumentV1 → Remotion Player config.
// No I/O, no side effects. The composition component itself is imported by
// the preview component, not here, to keep this module trivially testable.

import type { ProjectDocumentV1, VerticalCorePropsV1 } from "./projectDocument";

export interface PlayerConfig {
  inputProps: VerticalCorePropsV1;
  durationInFrames: number;
  fps: number;
  compositionWidth: number;
  compositionHeight: number;
}

/** Returns null unless the document is fully previewable. */
export function toPlayerConfig(doc: ProjectDocumentV1): PlayerConfig | null {
  if (doc.status !== "ready" || doc.props === null || doc.composition === null) {
    return null;
  }
  return {
    inputProps: doc.props,
    durationInFrames: doc.composition.durationInFrames,
    fps: doc.composition.fps,
    compositionWidth: doc.composition.width,
    compositionHeight: doc.composition.height,
  };
}
