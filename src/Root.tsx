import "./index.css";
import { Composition, type CalculateMetadataFunction } from "remotion";
import { MyComposition } from "./Composition";
import { MultiClipComposition } from "./MultiClipComposition";
import { MultiClipVariantComposition } from "./MultiClipVariantComposition";
import rawManifest from "../data/manifest.json";
import rawBeats from "../data/beats.json";
import rawProfile from "../data/style-profile.json";
import rawVariants from "../data/variants.json";
import type { ManifestData } from "./lib/manifest";
import type { BeatsData } from "./lib/beats";
import { resolveProfile } from "./lib/profile";
import { buildBeatTimeline } from "./lib/beatSync";
import type { VariantConfig } from "./lib/variants";
import { applyVariantClips } from "./lib/variants";

const manifest = rawManifest as ManifestData;
const FPS = 30;
const beatsData = (rawBeats as BeatsData).beats.length > 0
  ? (rawBeats as BeatsData)
  : null;
const profile = resolveProfile(rawProfile);
const variants = rawVariants as VariantConfig[];

const calcMultiClipMetadata: CalculateMetadataFunction<
  Record<string, unknown>
> = () => {
  const durations = buildBeatTimeline(
    manifest.clips,
    beatsData,
    FPS,
    profile.beatSync,
    profile.pacing
  );
  const tf = profile.transition.enabled
    ? Math.round(profile.transition.durationSec * FPS)
    : 0;
  const numTransitions = Math.max(0, manifest.clips.length - 1);
  const total = durations.reduce((sum, d) => sum + d, 0) - tf * numTransitions;
  return { durationInFrames: Math.max(total, 1) };
};

const makeVariantMetadata = (
  variantIndex: number
): CalculateMetadataFunction<{ variantIndex: number }> => () => {
  const variant = variants[variantIndex] ?? variants[0];
  const clips = applyVariantClips(manifest.clips, variant);
  const pacing = variant.maxClipSec !== null
    ? { ...profile.pacing, maxClipSec: variant.maxClipSec }
    : profile.pacing;
  const durations = buildBeatTimeline(clips, beatsData, FPS, profile.beatSync, pacing);
  const tf = profile.transition.enabled
    ? Math.round(profile.transition.durationSec * FPS)
    : 0;
  const numTransitions = Math.max(0, clips.length - 1);
  const total = durations.reduce((sum, d) => sum + d, 0) - tf * numTransitions;
  return { durationInFrames: Math.max(total, 1) };
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MyComp"
        component={MyComposition}
        durationInFrames={150}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="MultiClip"
        component={MultiClipComposition}
        durationInFrames={150}
        fps={30}
        width={1080}
        height={1920}
        calculateMetadata={calcMultiClipMetadata}
      />
      {variants.map((v, i) => (
        <Composition
          key={v.id}
          id={`MultiClip-${v.id.toUpperCase()}`}
          component={MultiClipVariantComposition}
          durationInFrames={150}
          fps={30}
          width={1080}
          height={1920}
          defaultProps={{ variantIndex: i }}
          calculateMetadata={makeVariantMetadata(i)}
        />
      ))}
    </>
  );
};
