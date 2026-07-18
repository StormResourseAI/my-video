"use client";

// Real read-only preview: the actual engine composition rendered by
// @remotion/player from a validated ProjectDocumentV1. Strictly playback —
// no rendering, writing, or engine invocation of any kind.

import { useEffect, type RefObject } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { VERSION } from "remotion";
import { VerticalCoreComposition } from "../../src/VerticalCoreComposition";
import type { PlayerConfig } from "@/lib/projectAdapter";
import { useStudioStore } from "@/state/studioStore";

// Boot assertion (plan §10): the Player and the composition must share one
// remotion instance at the exact engine version. A mismatch means module
// resolution regressed (duplicate copies) — fail conspicuously, not subtly.
export const EXPECTED_REMOTION_VERSION = "4.0.445";

export default function RealPreview({
  config,
  playerRef,
}: {
  config: PlayerConfig;
  playerRef: RefObject<PlayerRef | null>;
}) {
  const setPlayerFrame = useStudioStore((s) => s.setPlayerFrame);
  const setPlayerPlaying = useStudioStore((s) => s.setPlayerPlaying);

  // Mirror real Player state into the store (replaces the Phase 1 mock clock).
  useEffect(() => {
    const player = playerRef.current;
    if (player === null) return;
    const onFrame = (e: { detail: { frame: number } }) => setPlayerFrame(e.detail.frame);
    const onPlay = () => setPlayerPlaying(true);
    const onPause = () => setPlayerPlaying(false);
    player.addEventListener("frameupdate", onFrame);
    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    return () => {
      player.removeEventListener("frameupdate", onFrame);
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
    };
  }, [playerRef, setPlayerFrame, setPlayerPlaying]);

  if (VERSION !== EXPECTED_REMOTION_VERSION) {
    return (
      <div role="alert" className="m-3 rounded-md border border-danger/40 bg-danger/10 p-3">
        <p className="font-semibold text-danger">Remotion version mismatch</p>
        <p className="mt-1 text-muted">
          Expected {EXPECTED_REMOTION_VERSION}, resolved {VERSION}. Preview disabled.
        </p>
      </div>
    );
  }

  return (
    <Player
      ref={playerRef}
      component={VerticalCoreComposition}
      inputProps={config.inputProps}
      durationInFrames={config.durationInFrames}
      fps={config.fps}
      compositionWidth={config.compositionWidth}
      compositionHeight={config.compositionHeight}
      acknowledgeRemotionLicense
      controls={false}
      clickToPlay={false}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
