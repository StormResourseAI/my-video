import type { RawTranscript } from "./transcript";

export type ClipEntry = {
  file: string;
  durationSec: number;
  durationFrames: number;
  transcript: RawTranscript | null; // inline per-clip transcript data (embedded by build-manifest)
  usableStartSec: number | null;    // override default start trim
  usableEndSec: number | null;      // override default end trim
  maxClipSec: number | null;        // cap usable duration (null = use default)
  score?: number;                   // computed by build-manifest; higher = preferred
  hookScore?: number;               // computed by build-manifest; higher = better opening clip
  transcriptWordCount?: number;     // total words in transcript (0 if none)
};

export type ManifestData = {
  fps: number;
  clips: ClipEntry[];
  musicFile?: string | null;
};
