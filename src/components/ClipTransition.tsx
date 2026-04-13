import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

type Props = {
  durationFrames: number;
  transitionFrames: number;
  isFirst: boolean;
  isLast: boolean;
  withScale: boolean;
  children: React.ReactNode;
};

export const ClipTransition: React.FC<Props> = ({
  durationFrames,
  transitionFrames,
  isFirst,
  isLast,
  withScale,
  children,
}) => {
  const frame = useCurrentFrame();

  const fadeIn = isFirst
    ? 1
    : interpolate(frame, [0, transitionFrames], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

  const fadeOut = isLast
    ? 1
    : interpolate(
        frame,
        [durationFrames - transitionFrames - 1, durationFrames - 1],
        [1, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
      );

  const opacity = Math.min(fadeIn, fadeOut);
  const scale = withScale ? 1 + 0.03 * (1 - opacity) : 1;

  return (
    <AbsoluteFill
      style={{
        opacity,
        transform: scale !== 1 ? `scale(${scale})` : undefined,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
