import { useCurrentFrame } from "remotion";
import rawTranscript from "../../data/transcript.json";
import { parseCaptions, type FrameCue } from "../lib/transcript";

const cues: FrameCue[] = parseCaptions(rawTranscript);

export const Caption: React.FC = () => {
  const frame = useCurrentFrame();
  const cue = cues.find((c) => frame >= c.start && frame <= c.end);

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
