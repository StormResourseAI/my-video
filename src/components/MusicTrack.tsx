import { Audio, staticFile } from "remotion";
import type { ManifestData } from "../lib/manifest";
import type { AudioConfig, PacingConfig } from "../lib/profile";
import { parseCaptions } from "../lib/transcript";
import { computeClipTrim } from "../lib/trimming";

type Props = {
  manifest: ManifestData;
  audioConfig: AudioConfig;
  pacingConfig: PacingConfig;
  fps: number;
  snappedDurations: number[];
  transitionFrames: number;
};

export const MusicTrack: React.FC<Props> = ({
  manifest,
  audioConfig,
  pacingConfig,
  fps,
  snappedDurations,
  transitionFrames,
}) => {
  if (!manifest.musicFile) return null;

  // Build global frame intervals where speech (captions) is active.
  // Clip i's global start = sum(snappedDurations[0..i-1]) - transitionFrames * i
  const speechIntervals: [number, number][] = [];
  let globalStart = 0;

  manifest.clips.forEach((clip, i) => {
    if (clip.transcript) {
      const { trimBefore } = computeClipTrim(clip, fps, pacingConfig);
      const cues = parseCaptions(clip.transcript);
      for (const cue of cues) {
        // cue.start / cue.end are source frames; subtract trimBefore to get local frame
        const localStart = cue.start - trimBefore;
        const localEnd = cue.end - trimBefore;
        const clampedStart = Math.max(0, localStart);
        const clampedEnd = Math.min(snappedDurations[i], localEnd);
        if (clampedEnd > clampedStart) {
          speechIntervals.push([
            globalStart + clampedStart,
            globalStart + clampedEnd,
          ]);
        }
      }
    }

    globalStart += snappedDurations[i];
    if (i < manifest.clips.length - 1) {
      globalStart -= transitionFrames;
    }
  });

  const volume = (frame: number): number => {
    if (!audioConfig.duckingEnabled) return audioConfig.musicVolume;
    const inSpeech = speechIntervals.some(([s, e]) => frame >= s && frame <= e);
    return inSpeech ? audioConfig.duckedVolume : audioConfig.musicVolume;
  };

  return (
    <Audio
      src={staticFile(`clips/${manifest.musicFile}`)}
      volume={volume}
      loop
    />
  );
};
