# my-video — Local Short-Form Video Pipeline

Automated local pipeline: drop footage → transcribe → render branded 9:16 video.

---

## One-Time Setup

```bash
npm i
pip3 install openai-whisper librosa soundfile
npm run setup        # validates dirs + dependencies
```

`npm run setup` will tell you if ffmpeg is missing (`brew install ffmpeg`).

---

## Directory Structure

```
input/       Drop raw video files here
output/      Rendered video lands here (output/video.mp4)
data/        Auto-generated metadata (do not hand-edit during watch mode)
  transcript.json   Caption cues (seconds-based, Whisper output)
  beats.json        Beat timestamps + BPM
  style.json        Brand config (colors, hook text, handle)
  broll.json        B-roll clip trigger points
src/          Remotion components + lib utilities
scripts/      Local automation scripts
```

---

## Workflows

### 1. Preview in Studio
```bash
npm run dev
# Opens http://localhost:3000
# Edit data/style.json or data/transcript.json — hot reloads instantly
```

### 2. Manual Render
```bash
# Transcribe first (requires input/video.mp4)
python3 scripts/transcribe.py

# Optional: extract beats
npm run beats

# Render to output/video.mp4
npm run render
```

### 3. Watch Mode (fully automated)
```bash
npm run watch
# In another terminal:
cp /path/to/clip.mp4 input/clip.mp4
# Pipeline runs: transcribe → render → output/video.mp4
```

---

## Configuration

| File | Key | Default | Description |
|------|-----|---------|-------------|
| `data/style.json` | `brandColor` | `#7C3AED` | Brand accent color |
| `data/style.json` | `hookText` | `"You need to see this."` | Top hook text |
| `data/style.json` | `handle` | `@yourbrand` | Bottom brand bar text |
| `data/broll.json` | `clips[]` | `[]` | B-roll trigger points (start/end seconds, src path) |
| `scripts/transcribe.py` | model | `base` | Whisper model size (`tiny`/`base`/`small`/`medium`) |
| `scripts/watch.mjs` | `POLL_MS` | `2000` | Watch poll interval (ms) |
| `scripts/watch.mjs` | `TIMEOUT_MS` | `300000` | Per-operation timeout (ms) |
| `src/Root.tsx` | fps | `30` | Frames per second |

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `ffmpeg not found` | `brew install ffmpeg` |
| `whisper not installed` | `pip3 install openai-whisper` |
| `librosa not installed` | `pip3 install librosa soundfile` |
| `input file not found` | Verify file is in `input/` and path is correct |
| Whisper hangs on first run | Downloading model (~150MB) — wait, requires internet once |
| Watch mode stuck after error | `transcript.json` is intact; run `npm run render` manually, then restart watch |
| Studio shows blank frame | Check `data/transcript.json` is valid JSON |
| Render output has no captions | Scrub past frame 20 — captions start after fade-in |
