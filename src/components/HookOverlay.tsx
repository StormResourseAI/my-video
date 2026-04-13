import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { HookConfig } from "../lib/profile";

type Props = {
  config: HookConfig;
  fps: number;
};

export const HookOverlay: React.FC<Props> = ({ config, fps }) => {
  const frame = useCurrentFrame();

  if (!config.enabled) return null;

  const hookFrames = Math.round(config.durationSec * fps);
  if (frame >= hookFrames) return null;

  const fadeWindow = Math.round(hookFrames * 0.2);

  const fadeIn = interpolate(frame, [0, fadeWindow], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const fadeOut = interpolate(
    frame,
    [hookFrames - fadeWindow - 1, hookFrames - 1],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const opacity = Math.min(fadeIn, fadeOut);

  const positionStyle: React.CSSProperties =
    config.position === "top"
      ? { top: 120, bottom: "auto", transform: "none" }
      : config.position === "bottom"
      ? { bottom: 120, top: "auto", transform: "none" }
      : { top: "50%", transform: "translateY(-50%)" };

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          opacity,
          ...positionStyle,
        }}
      >
        <div
          style={{
            backgroundColor: config.backgroundColor,
            borderRadius: 12,
            paddingTop: 16,
            paddingBottom: 16,
            paddingLeft: 32,
            paddingRight: 32,
            fontSize: config.fontSize,
            fontWeight: 800,
            color: "#ffffff",
            fontFamily: "sans-serif",
            textAlign: "center",
            maxWidth: "85%",
          }}
        >
          {config.text}
        </div>
      </div>
    </AbsoluteFill>
  );
};
