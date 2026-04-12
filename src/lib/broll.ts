export type BrollClip = {
  start: number; // seconds
  end: number;   // seconds
  src: string;   // path relative to public/ or staticFile() key
};

export type BrollData = {
  fps: number;
  clips: BrollClip[];
};

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
