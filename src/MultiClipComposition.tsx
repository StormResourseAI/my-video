import { AbsoluteFill, Series, staticFile, useVideoConfig } from "remotion";
import { Video } from "@remotion/media";
import rawManifest from "../data/manifest.json";
import type { ManifestData } from "./lib/manifest";
import { computeClipTrim } from "./lib/trimming";
import { parseCaptions } from "./lib/transcript";
import { ClipCaption } from "./components/ClipCaption";

const manifest = rawManifest as ManifestData;

export const MultiClipComposition = () => {
  const { fps } = useVideoConfig();

  if (manifest.clips.length === 0) {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: "#0f0f0f",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#555",
          fontFamily: "sans-serif",
          fontSize: 36,
        }}
      >
        No clips in input/
        {"\n"}Run: npm run manifest
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Series>
        {manifest.clips.map((clip) => {
          const { trimBefore, trimAfter, durationFrames } = computeClipTrim(
            clip,
            fps
          );
          const cues = clip.transcript
            ? parseCaptions(clip.transcript)
            : null;

          return (
            <Series.Sequence
              key={clip.file}
              durationInFrames={durationFrames}
              premountFor={fps}
            >
              <Video
                src={staticFile(`clips/${clip.file}`)}
                trimBefore={trimBefore}
                trimAfter={trimAfter}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
              {cues && <ClipCaption cues={cues} trimBefore={trimBefore} />}
            </Series.Sequence>
          );
        })}
      </Series>
    </AbsoluteFill>
  );
};
