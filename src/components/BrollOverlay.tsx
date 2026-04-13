import { AbsoluteFill, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Video } from "@remotion/media";
import type { BrollMatch } from "../lib/broll";

type Props = {
  matches: BrollMatch[];
  trimBefore: number; // frames — source offset for this clip
  fps: number;
};

export const BrollOverlay: React.FC<Props> = ({ matches, trimBefore, fps }) => {
  const frame = useCurrentFrame(); // local frame within the Series.Sequence

  if (matches.length === 0) return null;

  // Find the first match whose display window covers the current local frame.
  // localFrame = sourceSec * fps - trimBefore
  const active = matches.find((m) => {
    const localStart = Math.round(m.sourceSec * fps) - trimBefore;
    const localEnd   = localStart + Math.round(m.displaySec * fps);
    return frame >= localStart && frame < localEnd;
  });

  if (!active) return null;

  const localStart = Math.round(active.sourceSec * fps) - trimBefore;
  const localEnd   = localStart + Math.round(active.displaySec * fps);
  const elapsed    = frame - localStart;
  const total      = localEnd - localStart;

  // Fade in over first 6 frames, fade out over last 6 frames
  const fadeIn  = interpolate(elapsed, [0, 6], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(elapsed, [total - 6, total], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut);

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          top: 80,
          right: 40,
          width: "32%",
          aspectRatio: "9/16",
          borderRadius: 16,
          overflow: "hidden",
          opacity,
          boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
        }}
      >
        <Video
          src={staticFile(`clips/broll/${active.brollFile}`)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
    </AbsoluteFill>
  );
};
