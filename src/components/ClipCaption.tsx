import { useCurrentFrame } from "remotion";
import type { FrameCue } from "../lib/transcript";
import type { CaptionConfig } from "../lib/profile";
import { DEFAULT_PROFILE } from "../lib/profile";

type Props = {
  cues: FrameCue[];
  trimBefore: number;
  captionConfig?: CaptionConfig;
};

export const ClipCaption: React.FC<Props> = ({
  cues,
  trimBefore,
  captionConfig,
}) => {
  const cfg = captionConfig ?? DEFAULT_PROFILE.caption;
  const localFrame = useCurrentFrame();
  const sourceFrame = localFrame + trimBefore;
  const cue = cues.find((c) => sourceFrame >= c.start && sourceFrame <= c.end);

  if (!cue) return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: cfg.bottomOffset,
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
          backgroundColor: cfg.backgroundColor,
          color: cfg.color,
          fontSize: cfg.fontSize,
          fontWeight: cfg.fontWeight,
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
