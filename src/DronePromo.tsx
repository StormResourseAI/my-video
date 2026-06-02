import {
  AbsoluteFill,
  Series,
  staticFile,
  useCurrentFrame,
  interpolate,
  useVideoConfig,
} from "remotion";
import { Video } from "@remotion/media";
import { ClipTransition } from "./components/ClipTransition";

// Phase 1: hardcoded proxy clips — Phase 2 will accept props
const PROXY_CLIPS = [
  "drone-clips/sandbox-jun9/DJI_20250609193813_0039_D_proxy.mp4",
  "drone-clips/sandbox-jun9/DJI_20250609194003_0043_D_proxy.mp4",
  "drone-clips/sandbox-jun9/DJI_20250609194014_0044_D_proxy.mp4",
  "drone-clips/sandbox-jun9/DJI_20250609194203_0048_D_proxy.mp4",
  "drone-clips/sandbox-jun9/DJI_20250609194246_0050_D_proxy.mp4",
];

const TRANSITION_FRAMES = 15; // 0.5s crossfade
// 5 clips × 192 frames − 4 transitions × 15 = 900 frames = 30s
const CLIP_FRAMES = 192;
const TOTAL_FRAMES = 900; // 30s at 30fps

// ── Overlay components ──────────────────────────────────────────────────────

const TitleOverlay: React.FC = () => {
  const frame = useCurrentFrame();
  const showUntil = 90; // 3s
  const fadeIn = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [70, 90], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  if (frame >= showUntil) return null;
  const opacity = Math.min(fadeIn, fadeOut);

  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "flex-start",
        padding: "0 80px 120px",
      }}
    >
      <div style={{ opacity }}>
        <div
          style={{
            fontSize: 72,
            fontWeight: 900,
            color: "#ffffff",
            fontFamily: "sans-serif",
            letterSpacing: -2,
            textShadow: "0 4px 24px rgba(0,0,0,0.7)",
            lineHeight: 1.1,
          }}
        >
          TAMPA BAY
          <br />
          AERIAL SHOWCASE
        </div>
        <div
          style={{
            marginTop: 16,
            fontSize: 28,
            fontWeight: 400,
            color: "rgba(255,255,255,0.85)",
            fontFamily: "sans-serif",
            letterSpacing: 1,
            textShadow: "0 2px 12px rgba(0,0,0,0.6)",
          }}
        >
          Drone Promo&nbsp;&nbsp;•&nbsp;&nbsp;Local Business&nbsp;&nbsp;•&nbsp;&nbsp;Real Estate
        </div>
      </div>
    </AbsoluteFill>
  );
};

const OutroOverlay: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const outroStart = durationInFrames - 150; // last 5s
  const fadeIn = interpolate(frame, [outroStart, outroStart + 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 30, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  if (frame < outroStart) return null;
  const opacity = Math.min(fadeIn, fadeOut);

  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 60%)",
      }}
    >
      <div
        style={{
          opacity,
          textAlign: "center",
          position: "absolute",
          bottom: 120,
        }}
      >
        <div
          style={{
            fontSize: 52,
            fontWeight: 800,
            color: "#ffffff",
            fontFamily: "sans-serif",
            letterSpacing: -1,
            textShadow: "0 4px 24px rgba(0,0,0,0.8)",
          }}
        >
          Book a Drone Promo Video
        </div>
        <div
          style={{
            marginTop: 16,
            fontSize: 28,
            color: "rgba(255,255,255,0.75)",
            fontFamily: "sans-serif",
            fontWeight: 300,
          }}
        >
          StormBot AI&nbsp;&nbsp;•&nbsp;&nbsp;Tampa Bay
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── Main composition ─────────────────────────────────────────────────────────

export const DronePromo: React.FC = () => {
  const lastIndex = PROXY_CLIPS.length - 1;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Series>
        {PROXY_CLIPS.map((src, i) => (
          <Series.Sequence
            key={src}
            durationInFrames={CLIP_FRAMES}
            offset={i === 0 ? 0 : -TRANSITION_FRAMES}
          >
            <ClipTransition
              durationFrames={CLIP_FRAMES}
              transitionFrames={TRANSITION_FRAMES}
              isFirst={i === 0}
              isLast={i === lastIndex}
              withScale={false}
            >
              <Video
                src={staticFile(src)}
                trimBefore={0}
                trimAfter={CLIP_FRAMES}
                objectFit="cover"
                style={{ width: "100%", height: "100%" }}
              />
            </ClipTransition>
          </Series.Sequence>
        ))}
      </Series>
      <TitleOverlay />
      <OutroOverlay />
    </AbsoluteFill>
  );
};

export { TOTAL_FRAMES };
