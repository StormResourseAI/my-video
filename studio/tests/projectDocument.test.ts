// @vitest-environment node
import {
  durationInFramesFor,
  validateDocument,
  validateProjectList,
  validateProps,
} from "@/lib/projectDocument";

const goodProps = {
  backgroundColor: "#112233",
  clips: [
    { file: "a.mp4", src: "api/assets/YQ", durationInFrames: 90, trimBefore: 0, trimAfter: 90 },
    { file: "b.mp4", src: "api/assets/Yg", durationInFrames: 60, trimBefore: 0, trimAfter: 60 },
  ],
  title: "T",
  titleFrames: 45,
  transitionFrames: 8,
};

const goodDoc = {
  schemaVersion: 1,
  projectId: "demo",
  projectName: "Demo",
  clientSlug: null,
  previewReady: true,
  cacheTimestamp: "2026-07-18T00:00:00.000Z",
  status: "ready",
  readOnly: true,
  source: "materialized-cache",
  freshness: "current",
  composition: {
    compositionId: "vertical-core",
    width: 1080,
    height: 1920,
    fps: 30,
    durationInFrames: 142,
    aspectRatio: "9:16",
  },
  props: goodProps,
  assets: [
    { assetId: "YQ", fileName: "a.mp4", kind: "video", previewUrl: "/api/assets/YQ" },
  ],
  captions: null,
  music: null,
  warnings: [],
};

describe("validateProps", () => {
  it("accepts engine-shaped props and computes the engine duration", () => {
    const props = validateProps(goodProps);
    expect(props).not.toBeNull();
    expect(durationInFramesFor(props!)).toBe(90 + 60 - 8);
  });

  it("rejects malformed colors (CSS injection guard)", () => {
    for (const backgroundColor of ["url(x)", "red; background:url(x)", "#11", "#11223344aa", "rgb(0,0,0)"]) {
      expect(validateProps({ ...goodProps, backgroundColor })).toBeNull();
    }
  });

  it("rejects invalid numeric ranges and clip shapes", () => {
    expect(validateProps({ ...goodProps, titleFrames: -1 })).toBeNull();
    expect(validateProps({ ...goodProps, titleFrames: 1.5 })).toBeNull();
    expect(
      validateProps({
        ...goodProps,
        clips: [{ ...goodProps.clips[0], durationInFrames: 0 }],
      }),
    ).toBeNull();
    expect(
      validateProps({
        ...goodProps,
        clips: [{ ...goodProps.clips[0], src: "runtime-selects/demo/a.mp4" }],
      }),
    ).toBeNull();
    expect(
      validateProps({ ...goodProps, clips: [{ ...goodProps.clips[0], src: "/etc/passwd" }] }),
    ).toBeNull();
  });

  it("strips unknown properties", () => {
    const props = validateProps({ ...goodProps, evil: "x", clips: [{ ...goodProps.clips[0], extra: 1 }] });
    expect(props).not.toBeNull();
    expect(props).not.toHaveProperty("evil");
    expect(props!.clips[0]).not.toHaveProperty("extra");
  });

  it("normalizes the engine's empty-string title to null (watcher-produced caches)", () => {
    const props = validateProps({ ...goodProps, title: "" });
    expect(props).not.toBeNull();
    expect(props!.title).toBeNull();
    expect(validateProps({ ...goodProps, title: null })).not.toBeNull();
    expect(validateProps({ ...goodProps, title: 42 })).toBeNull();
  });
});

describe("validateDocument", () => {
  it("accepts a well-formed ready document", () => {
    expect(validateDocument(goodDoc)).not.toBeNull();
  });

  it("rejects wrong schema versions and composition ids", () => {
    expect(validateDocument({ ...goodDoc, schemaVersion: 2 })).toBeNull();
    expect(
      validateDocument({
        ...goodDoc,
        composition: { ...goodDoc.composition, compositionId: "MultiClip" },
      }),
    ).toBeNull();
  });

  it("rejects a duration inconsistent with the engine formula", () => {
    expect(
      validateDocument({
        ...goodDoc,
        composition: { ...goodDoc.composition, durationInFrames: 999 },
      }),
    ).toBeNull();
  });

  it("rejects non-readonly or mutated provenance", () => {
    expect(validateDocument({ ...goodDoc, readOnly: false })).toBeNull();
    expect(validateDocument({ ...goodDoc, source: "live" })).toBeNull();
  });

  it("rejects invalid project ids and asset refs", () => {
    expect(validateDocument({ ...goodDoc, projectId: "../evil" })).toBeNull();
    expect(
      validateDocument({
        ...goodDoc,
        assets: [{ assetId: "YQ==", fileName: "a.mp4", kind: "video", previewUrl: "/api/assets/YQ==" }],
      }),
    ).toBeNull();
    expect(
      validateDocument({
        ...goodDoc,
        assets: [{ assetId: "YQ", fileName: "a.mp4", kind: "video", previewUrl: "https://evil.com/x" }],
      }),
    ).toBeNull();
  });

  it("requires null props/composition for non-ready statuses", () => {
    expect(
      validateDocument({ ...goodDoc, status: "props-missing", props: null, composition: null }),
    ).not.toBeNull();
    expect(validateDocument({ ...goodDoc, status: "props-missing" })).toBeNull();
  });

  it("strips unknown top-level properties", () => {
    const doc = validateDocument({ ...goodDoc, injected: { deep: true } });
    expect(doc).not.toBeNull();
    expect(doc).not.toHaveProperty("injected");
  });
});

describe("validateProjectList", () => {
  it("round-trips a list and rejects malformed entries", () => {
    const list = {
      schemaVersion: 1,
      projects: [
        {
          schemaVersion: 1,
          projectId: "demo",
          projectName: "Demo",
          clientSlug: null,
          previewReady: true,
          cacheTimestamp: null,
        },
      ],
    };
    expect(validateProjectList(list)).not.toBeNull();
    expect(
      validateProjectList({
        ...list,
        projects: [{ ...list.projects[0], projectId: "a/b" }],
      }),
    ).toBeNull();
  });
});
