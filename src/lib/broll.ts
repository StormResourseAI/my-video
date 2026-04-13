export type BrollClip = {
  start: number; // seconds
  end: number;   // seconds
  src: string;   // path relative to public/ or staticFile() key
};

export type BrollData = {
  fps: number;
  clips: BrollClip[];
  matches?: BrollMatch[];
};

/** A keyword-triggered broll overlay match, keyed to a clip's transcript. */
export type BrollMatch = {
  clipFile:   string; // transcript filename (e.g. "clip1.mp4.json" or "clip1.mp4")
  keyword:    string;
  brollFile:  string; // filename in input/broll/
  sourceSec:  number; // timestamp in source clip where keyword appears
  displaySec: number; // how long to show the overlay
};

/** Returns broll matches for a given clip file. */
export function getBrollMatchesForClip(
  clipFile: string,
  data: BrollData
): BrollMatch[] {
  if (!data.matches) return [];
  // clipFile in manifest is e.g. "clip1.mp4"; clipFile in match is transcript file "clip1.mp4.json"
  return data.matches.filter(
    (m) => m.clipFile === clipFile || m.clipFile === `${clipFile}.json`
  );
}

/** Returns the b-roll clip that should be active at the given frame, if any. */
export const activeBrollClip = (
  frame: number,
  data: BrollData
): BrollClip | undefined =>
  data.clips.find(
    (c) =>
      frame >= Math.round(c.start * data.fps) &&
      frame <= Math.round(c.end * data.fps)
  );
