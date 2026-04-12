import "./index.css";
import { Composition, type CalculateMetadataFunction } from "remotion";
import { MyComposition } from "./Composition";
import { MultiClipComposition } from "./MultiClipComposition";
import rawManifest from "../data/manifest.json";
import type { ManifestData } from "./lib/manifest";
import { computeClipTrim } from "./lib/trimming";

const manifest = rawManifest as ManifestData;
const FPS = 30;

const calcMultiClipMetadata: CalculateMetadataFunction<
  Record<string, unknown>
> = () => {
  const total = manifest.clips.reduce(
    (sum, c) => sum + computeClipTrim(c, FPS).durationFrames,
    0
  );
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
    </>
  );
};
