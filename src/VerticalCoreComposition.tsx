// Browser-safe boundary: this module (and everything it imports) is loaded by
// the Studio web bundle via @remotion/player. It must never import Node
// built-ins, environment variables, data/*.json singletons, or
// renderer/bundler/CLI code. Enforced by `npm run check:browser-safe`.
import { AbsoluteFill, Series, staticFile, useCurrentFrame, interpolate } from "remotion";
import { Video } from "@remotion/media";
import { ClipTransition } from "./components/ClipTransition";

export type VerticalCoreClip = {
  file: string;
  src: string;
  durationInFrames: number;
  trimBefore?: number;
  trimAfter?: number;
};

export type VerticalCoreProps = {
  backgroundColor?: string;
  clips: VerticalCoreClip[];
  title?: string | null;
  titleFrames?: number;
  transitionFrames?: number;
};

const TitleOverlay: React.FC<{
  backgroundColor: string;
  title: string;
  titleFrames: number;
}> = ({ backgroundColor, title, titleFrames }) => {
  const frame = useCurrentFrame();

  if (!title || frame >= titleFrames) {
    return null;
  }

  const fadeWindow = Math.max(6, Math.round(titleFrames * 0.25));
  const fadeIn = interpolate(frame, [0, fadeWindow], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [titleFrames - fadeWindow, titleFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut);

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          top: 88,
          left: 64,
          right: 64,
          display: "flex",
          justifyContent: "center",
          opacity,
        }}
      >
        <div
          style={{
            maxWidth: "100%",
            borderRadius: 28,
            padding: "20px 28px",
            backgroundColor: "rgba(0, 0, 0, 0.68)",
            border: `1px solid ${backgroundColor}`,
            boxShadow: "0 18px 40px rgba(0, 0, 0, 0.28)",
          }}
        >
          <div
            style={{
              fontSize: 56,
              lineHeight: 1.05,
              fontWeight: 800,
              color: "#ffffff",
              textAlign: "center",
              fontFamily: "sans-serif",
              letterSpacing: -1.6,
            }}
          >
            {title}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const VerticalCoreComposition: React.FC<VerticalCoreProps> = ({
  backgroundColor = "#111111",
  clips,
  title,
  titleFrames = 45,
  transitionFrames = 8,
}) => {
  if (clips.length === 0) {
    return (
      <AbsoluteFill
        style={{
          alignItems: "center",
          backgroundColor,
          color: "#f4f4f4",
          display: "flex",
          fontFamily: "sans-serif",
          fontSize: 40,
          justifyContent: "center",
          padding: 80,
          textAlign: "center",
        }}
      >
        No selected clips found.
        {"\n"}
        Put files in input/selects/project-name/ and run npm run render:vertical -- project-name
      </AbsoluteFill>
    );
  }

  const lastIndex = clips.length - 1;

  return (
    <AbsoluteFill style={{ backgroundColor }}>
      <Series>
        {clips.map((clip, index) => (
          <Series.Sequence
            key={`${clip.file}-${index}`}
            durationInFrames={clip.durationInFrames}
            offset={index === 0 ? 0 : -transitionFrames}
          >
            <ClipTransition
              durationFrames={clip.durationInFrames}
              transitionFrames={transitionFrames}
              isFirst={index === 0}
              isLast={index === lastIndex}
              withScale={false}
            >
              <Video
                src={staticFile(clip.src)}
                trimBefore={clip.trimBefore ?? 0}
                trimAfter={clip.trimAfter ?? clip.durationInFrames}
                objectFit="cover"
                style={{
                  height: "100%",
                  width: "100%",
                }}
              />
            </ClipTransition>
          </Series.Sequence>
        ))}
      </Series>
      {title ? (
        <TitleOverlay
          backgroundColor={backgroundColor}
          title={title}
          titleFrames={titleFrames}
        />
      ) : null}
    </AbsoluteFill>
  );
};
