import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Caption } from "./components/Caption";
import styleData from "../data/style.json";
import type { StyleProfile } from "./lib/style";

const style: StyleProfile = styleData;

export const MyComposition = () => {
  const frame = useCurrentFrame();
  const opacity = Math.min(1, frame / 15);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: style.backgroundColor,
        fontFamily: style.fontFamily,
      }}
    >
      {/* Talking-head placeholder */}
      <AbsoluteFill
        style={{
          top: 200,
          bottom: 300,
          left: 0,
          right: 0,
          backgroundColor: "#1a1a1a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 320,
            height: 320,
            borderRadius: "50%",
            backgroundColor: "#2a2a2a",
            border: `4px solid ${style.brandColor}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#555",
            fontSize: 24,
          }}
        >
          TALKING HEAD
        </div>
      </AbsoluteFill>

      {/* Hook text */}
      <AbsoluteFill
        style={{
          top: 0,
          height: 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity,
        }}
      >
        <div
          style={{
            color: "#ffffff",
            fontSize: 56,
            fontWeight: 900,
            textAlign: "center",
            padding: "0 48px",
            lineHeight: 1.1,
            textTransform: "uppercase",
            letterSpacing: -1,
          }}
        >
          {style.hookText}
        </div>
      </AbsoluteFill>

      {/* Captions */}
      <Caption />

      {/* Bottom brand bar */}
      <AbsoluteFill
        style={{
          top: "auto",
          bottom: 0,
          height: 300,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: style.brandColor,
          opacity,
        }}
      >
        <div
          style={{
            color: "#ffffff",
            fontSize: 36,
            fontWeight: 700,
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          {style.handle}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
