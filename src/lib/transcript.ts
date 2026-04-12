export type RawCue = {
  start: number; // seconds
  end: number;   // seconds
  text: string;
};

export type RawTranscript = {
  fps: number;
  captions: RawCue[];
};

export type FrameCue = {
  start: number; // frames
  end: number;   // frames
  text: string;
};

export const secToFrame = (seconds: number, fps: number): number =>
  Math.round(seconds * fps);

export const parseCaptions = (raw: RawTranscript): FrameCue[] =>
  raw.captions.map((c) => ({
    start: secToFrame(c.start, raw.fps),
    end: secToFrame(c.end, raw.fps),
    text: c.text,
  }));
