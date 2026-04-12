export type BeatsData = {
  fps: number;
  bpm: number;
  beats: number[]; // seconds
};

/** Returns beat timestamps converted to frame numbers. */
export const beatFrames = (data: BeatsData): number[] =>
  data.beats.map((t) => Math.round(t * data.fps));

/**
 * Returns true if the given frame is within `windowFrames` of any beat.
 * Use this in components to trigger beat-synced effects.
 */
export const isOnBeat = (
  frame: number,
  data: BeatsData,
  windowFrames = 2
): boolean =>
  beatFrames(data).some((b) => Math.abs(frame - b) <= windowFrames);
