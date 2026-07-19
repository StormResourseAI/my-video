import "@testing-library/jest-dom/vitest";

// Default network stance for UI tests: fetch exists but never resolves, so
// components render their loading states without any real I/O and without
// out-of-act state updates. Tests that need API data override this stub.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<never>(() => {})),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});
