import { useCurrentFrame } from "remotion";
import type { FrameCue } from "../lib/transcript";

type Props = {
  cues: FrameCue[];
  trimBefore: number; // frames — aligns local timeline back to source video position
};

export const ClipCaption: React.FC<Props> = ({ cues, trimBefore }) => {
  const localFrame = useCurrentFrame();
  // Sequence resets frame to 0 at clip start; add trimBefore to get source position
  const sourceFrame = localFrame + trimBefore;
  const cue = cues.find((c) => sourceFrame >= c.start && sourceFrame <= c.end);

  if (!cue) return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 320,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        padding: "0 48px",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          backgroundColor: "rgba(0,0,0,0.75)",
          color: "#ffffff",
          fontSize: 44,
          fontWeight: 700,
          textAlign: "center",
          padding: "12px 24px",
          borderRadius: 8,
          lineHeight: 1.3,
        }}
      >
        {cue.text}
      </div>
    </div>
  );
};
