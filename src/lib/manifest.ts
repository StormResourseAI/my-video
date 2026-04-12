import type { RawTranscript } from "./transcript";

export type ClipEntry = {
  file: string;
  durationSec: number;
  durationFrames: number;
  transcript: RawTranscript | null; // inline per-clip transcript data (embedded by build-manifest)
  usableStartSec: number | null;    // override default start trim
  usableEndSec: number | null;      // override default end trim
  maxClipSec: number | null;        // cap usable duration (null = use default)
};

export type ManifestData = {
  fps: number;
  clips: ClipEntry[];
};
