import { AbsoluteFill, Series, staticFile, useVideoConfig } from "remotion";
import { Video } from "@remotion/media";
import rawManifest from "../data/manifest.json";
import rawBeats from "../data/beats.json";
import rawProfile from "../data/style-profile.json";
import rawVariants from "../data/variants.json";
import type { ManifestData } from "./lib/manifest";
import type { BeatsData } from "./lib/beats";
import { resolveProfile } from "./lib/profile";
import { computeClipTrim } from "./lib/trimming";
import { buildBeatTimeline } from "./lib/beatSync";
import { parseCaptions } from "./lib/transcript";
import { ClipCaption } from "./components/ClipCaption";
import { ClipTransition } from "./components/ClipTransition";
import { HookOverlay } from "./components/HookOverlay";
import { MusicTrack } from "./components/MusicTrack";
import type { VariantConfig } from "./lib/variants";
import { applyVariantClips } from "./lib/variants";

const baseManifest = rawManifest as ManifestData;
const beatsData = (rawBeats as BeatsData).beats.length > 0
  ? (rawBeats as BeatsData)
  : null;
const baseProfile = resolveProfile(rawProfile);
const variants = rawVariants as VariantConfig[];

type Props = { variantIndex: number };

export const MultiClipVariantComposition: React.FC<Props> = ({ variantIndex }) => {
  const { fps } = useVideoConfig();
  const variant = variants[variantIndex] ?? variants[0];

  // Apply variant overrides
  const clips = applyVariantClips(baseManifest.clips, variant);
  const manifest: ManifestData = { ...baseManifest, clips };

  const pacing = variant.maxClipSec !== null
    ? { ...baseProfile.pacing, maxClipSec: variant.maxClipSec }
    : baseProfile.pacing;

  const hookConfig = variant.hookText !== null
    ? { ...baseProfile.hook, text: variant.hookText }
    : baseProfile.hook;

  if (clips.length === 0) {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: baseProfile.brand.backgroundColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#555",
          fontFamily: baseProfile.brand.fontFamily,
          fontSize: 36,
        }}
      >
        No clips in input/
        {"\n"}Run: npm run manifest
      </AbsoluteFill>
    );
  }

  const snappedDurations = buildBeatTimeline(
    clips,
    beatsData,
    fps,
    baseProfile.beatSync,
    pacing
  );

  const tf = baseProfile.transition.enabled
    ? Math.round(baseProfile.transition.durationSec * fps)
    : 0;

  const lastIndex = clips.length - 1;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Series>
        {clips.map((clip, i) => {
          const { trimBefore } = computeClipTrim(clip, fps, pacing);
          const durationFrames = snappedDurations[i];
          const trimAfter = Math.min(
            trimBefore + durationFrames,
            Math.round(clip.durationSec * fps)
          );
          const cues = clip.transcript
            ? parseCaptions(clip.transcript)
            : null;

          return (
            <Series.Sequence
              key={clip.file}
              durationInFrames={durationFrames}
              offset={i === 0 ? 0 : -tf}
              premountFor={fps}
            >
              <ClipTransition
                durationFrames={durationFrames}
                transitionFrames={tf}
                isFirst={i === 0}
                isLast={i === lastIndex}
                withScale={baseProfile.transition.scale}
              >
                <Video
                  src={staticFile(`clips/${clip.file}`)}
                  trimBefore={trimBefore}
                  trimAfter={trimAfter}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
                {cues && (
                  <ClipCaption
                    cues={cues}
                    trimBefore={trimBefore}
                    captionConfig={baseProfile.caption}
                  />
                )}
              </ClipTransition>
            </Series.Sequence>
          );
        })}
      </Series>
      <HookOverlay config={hookConfig} fps={fps} />
      <MusicTrack
        manifest={manifest}
        audioConfig={baseProfile.audio}
        pacingConfig={pacing}
        fps={fps}
        snappedDurations={snappedDurations}
        transitionFrames={tf}
      />
    </AbsoluteFill>
  );
};
