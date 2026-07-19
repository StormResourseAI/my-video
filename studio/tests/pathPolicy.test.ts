// @vitest-environment node
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  getRoots,
  isValidFileName,
  isValidSlug,
  resetRootsForTesting,
  resolveUnder,
} from "@/server/pathPolicy";
import { decodeAssetId, parseRange, resolveAsset } from "@/server/assetStream";
import { encodeAssetId } from "@/server/projectRepository";
import { addSymlink, makeFixtureRepo, type FixtureRepo } from "./fixtureRepo";

let repo: FixtureRepo;

beforeEach(() => {
  repo = makeFixtureRepo([
    { slug: "demo", clips: { "01.mp4": 100, "02.mp4": 50 } },
    { slug: "other", clips: { "secret.mp4": 10 } },
  ]);
  process.env.MYVIDEO_REPO_ROOT = repo.root;
  resetRootsForTesting();
});

afterEach(() => {
  repo.cleanup();
  delete process.env.MYVIDEO_REPO_ROOT;
  resetRootsForTesting();
});

describe("repo root anchoring", () => {
  it("rejects a root without the my-video sentinel", async () => {
    process.env.MYVIDEO_REPO_ROOT = path.dirname(repo.root); // parent, no sentinel
    resetRootsForTesting();
    await expect(getRoots()).rejects.toMatchObject({ code: "repo_root_unavailable" });
  });

  it("resolves allowlisted roots under a valid repo", async () => {
    const roots = await getRoots();
    // realpath comparison: macOS tmpdirs live behind the /var symlink.
    expect(roots.media).toBe(realpathSync(path.join(repo.root, "public", "runtime-selects")));
    expect(roots.props).toBe(realpathSync(path.join(repo.root, ".cache", "render-props")));
  });
});

describe("slug and file-name validation", () => {
  it.each(["demo", "test-client-20260422", "A1", "a.b_c-d"])("accepts %s", (s) => {
    expect(isValidSlug(s)).toBe(true);
  });
  it.each(["", "../demo", "a/b", "a\\b", ".hidden", "-lead", "a".repeat(65), "a..b"])(
    "rejects slug %j",
    (s) => {
      expect(isValidSlug(s)).toBe(false);
    },
  );
  it.each(["01.mp4", "clip v2.mp4"])("accepts file name %j", (n) => {
    expect(isValidFileName(n)).toBe(true);
  });
  it.each(["", "a/b.mp4", "a\\b.mp4", "..", ".", "a\0b.mp4", "x".repeat(201)])(
    "rejects file name %j",
    (n) => {
      expect(isValidFileName(n)).toBe(false);
    },
  );
});

describe("resolveUnder traversal defenses", () => {
  it("rejects ../ traversal segments", async () => {
    const roots = await getRoots();
    expect(await resolveUnder(roots.media, "..", "package.json")).toBeNull();
    expect(await resolveUnder(roots.media, "demo", "../../package.json")).toBeNull();
  });

  it("rejects encoded and backslash traversal (treated as literal names)", async () => {
    const roots = await getRoots();
    expect(await resolveUnder(roots.media, "%2e%2e", "x.mp4")).toBeNull(); // no such dir
    expect(await resolveUnder(roots.media, "demo", "..\\..\\pwn.mp4")).toBeNull();
  });

  it("rejects absolute-path segments", async () => {
    const roots = await getRoots();
    expect(await resolveUnder(roots.media, "/etc", "passwd")).toBeNull();
    expect(await resolveUnder(roots.media, path.join(repo.root, "package.json"))).toBeNull();
  });

  it("rejects symlink escape from an allowlisted root", async () => {
    const outside = path.join(repo.root, "outside.mp4");
    writeFileSync(outside, "secret");
    addSymlink(outside, path.join(repo.mediaDir("demo"), "link.mp4"));
    const roots = await getRoots();
    expect(await resolveUnder(roots.media, "demo", "link.mp4")).toBeNull();
  });

  it("rejects symlinked-directory prefix-collision escape", async () => {
    // media/evil -> sibling dir "runtime-selects-evil": realpath shares the
    // "runtime-selects" string prefix but not the path prefix.
    const evilDir = path.join(repo.root, "public", "runtime-selects-evil");
    mkdirSync(evilDir, { recursive: true });
    writeFileSync(path.join(evilDir, "x.mp4"), "evil");
    addSymlink(evilDir, path.join(repo.root, "public", "runtime-selects", "evil"));
    const roots = await getRoots();
    expect(await resolveUnder(roots.media, "evil", "x.mp4")).toBeNull();
  });

  it("resolves a legitimate staged file", async () => {
    const roots = await getRoots();
    expect(await resolveUnder(roots.media, "demo", "01.mp4")).toBe(
      realpathSync(path.join(repo.mediaDir("demo"), "01.mp4")),
    );
  });
});

describe("asset id canonicalization", () => {
  it("round-trips a canonical id", () => {
    const id = encodeAssetId("demo", "01.mp4");
    expect(decodeAssetId(id)).toEqual({ slug: "demo", fileName: "01.mp4" });
  });

  it("rejects padded, alternate-alphabet, and malformed ids", () => {
    const id = encodeAssetId("demo", "01.mp4");
    const b64 = Buffer.from("demo/01.mp4").toString("base64"); // may contain +/=
    for (const bad of [`${id}==`, b64, "not*base64", "", "-", `${id}A`]) {
      expect(decodeAssetId(bad)).toBeNull();
    }
  });

  it("rejects decoded values without exactly one slash", () => {
    for (const raw of ["demo", "demo/a/b.mp4", "/x.mp4", "demo/"]) {
      expect(decodeAssetId(Buffer.from(raw).toString("base64url"))).toBeNull();
    }
  });

  it("rejects traversal hidden inside a valid encoding", () => {
    expect(decodeAssetId(Buffer.from("../01.mp4").toString("base64url"))).toBeNull();
    expect(decodeAssetId(Buffer.from("demo/../x.mp4").toString("base64url"))).toBeNull();
  });
});

describe("asset resolution membership gate", () => {
  it("resolves a clip referenced by the project props", async () => {
    const asset = await resolveAsset(encodeAssetId("demo", "01.mp4"));
    expect(asset).toMatchObject({ size: 100, contentType: "video/mp4" });
  });

  it("rejects cross-project access with a mixed id", async () => {
    expect(await resolveAsset(encodeAssetId("demo", "secret.mp4"))).toBeNull();
  });

  it("rejects files not referenced by the props cache", async () => {
    writeFileSync(path.join(repo.mediaDir("demo"), "extra.mp4"), "x");
    expect(await resolveAsset(encodeAssetId("demo", "extra.mp4"))).toBeNull();
  });

  it("rejects unknown projects and directory targets", async () => {
    expect(await resolveAsset(encodeAssetId("ghost", "01.mp4"))).toBeNull();
    // A directory whose name is referenced as a clip must not be served.
    const dirClip = makeFixtureRepo([{ slug: "d2", clips: { "dir.mp4": null } }]);
    mkdirSync(path.join(dirClip.mediaDir("d2"), "dir.mp4"), { recursive: true });
    process.env.MYVIDEO_REPO_ROOT = dirClip.root;
    resetRootsForTesting();
    expect(await resolveAsset(encodeAssetId("d2", "dir.mp4"))).toBeNull();
    dirClip.cleanup();
  });

  it("rejects unsupported extensions", async () => {
    const repo2 = makeFixtureRepo([{ slug: "t", clips: { "notes.txt": 5 } }]);
    process.env.MYVIDEO_REPO_ROOT = repo2.root;
    resetRootsForTesting();
    expect(await resolveAsset(encodeAssetId("t", "notes.txt"))).toBeNull();
    repo2.cleanup();
  });
});

describe("range parsing", () => {
  const size = 100;
  it("handles absent and malformed headers as full", () => {
    expect(parseRange(null, size)).toEqual({ kind: "full" });
    expect(parseRange("bytes=0-0,50-60", size)).toEqual({ kind: "full" });
    expect(parseRange("frames=0-1", size)).toEqual({ kind: "full" });
    expect(parseRange("bytes=-", size)).toEqual({ kind: "full" });
    expect(parseRange("bytes=5-2", size)).toEqual({ kind: "full" });
  });
  it("handles initial, open-ended, and suffix ranges", () => {
    expect(parseRange("bytes=0-9", size)).toEqual({ kind: "partial", start: 0, end: 9 });
    expect(parseRange("bytes=10-", size)).toEqual({ kind: "partial", start: 10, end: 99 });
    expect(parseRange("bytes=-10", size)).toEqual({ kind: "partial", start: 90, end: 99 });
    expect(parseRange("bytes=0-1000", size)).toEqual({ kind: "partial", start: 0, end: 99 });
  });
  it("flags unsatisfiable ranges", () => {
    expect(parseRange("bytes=100-", size)).toEqual({ kind: "unsatisfiable" });
    expect(parseRange("bytes=-0", size)).toEqual({ kind: "unsatisfiable" });
  });
});
