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

## Starting the Pipeline

```bash
./start_pipeline.sh
```

This activates `.venv` if present, runs the setup check, then starts the file watcher.

**Drop any `.mp4 / .mov / .mkv / .webm` into `input/` and the pipeline runs automatically:**
1. Transcribes the clip → `data/transcripts/<file>.json`
2. Rebuilds `data/manifest.json` with all clips + transcripts
3. Renders `output/multi.mp4`
4. Moves the source clip to `input/processed/`
5. Opens `output/multi.mp4` in QuickTime automatically

---

## Desktop Shortcuts (optional, macOS)

Create Finder aliases so you can drag clips and grab results without opening a terminal:

```bash
# Drag-and-drop target
ln -s "$(pwd)/input" ~/Desktop/DROP_CLIPS_HERE

# Finished videos
ln -s "$(pwd)/output" ~/Desktop/FINISHED_VIDEOS
```

---

## Directory Structure

```
input/              Drop raw video files here
  processed/        Source clips moved here after successful render
output/             Rendered video lands here
  multi.mp4         Latest assembled multi-clip render
data/               Auto-generated metadata
  manifest.json     Clip order, durations, trim settings, inline transcripts
  transcripts/      Per-clip transcript JSON files (Whisper output)
  style.json        Brand config (colors, hook text, handle)
  beats.json        Beat timestamps + BPM
  broll.json        B-roll clip trigger points
src/                Remotion components + lib utilities
scripts/            Local automation scripts
```

---

## Manual Workflows

### Preview in Studio
```bash
npm run dev
# Opens http://localhost:3000 — hot reloads on data/ changes
```

### Manual Multi-Clip Render
```bash
# Transcribe each clip
python3 scripts/transcribe.py input/clip1.mp4 data/transcripts/clip1.mp4.json

# Rebuild manifest
npm run manifest

# Render → output/multi.mp4
npm run render:multi
```

### Single-Clip Branded Render (MyComp)
```bash
npm run render      # → output/video.mp4
```

---

## Configuration

| File | Key | Default | Description |
|------|-----|---------|-------------|
| `data/style.json` | `brandColor` | `#7C3AED` | Brand accent color |
| `data/style.json` | `hookText` | `"You need to see this."` | Top hook text |
| `data/style.json` | `handle` | `@yourbrand` | Bottom brand bar text |
| `data/manifest.json` | `usableStartSec` | `null` (0.3s default) | Per-clip start trim override |
| `data/manifest.json` | `usableEndSec` | `null` (0.3s default) | Per-clip end trim override |
| `data/manifest.json` | `maxClipSec` | `null` (7s default) | Per-clip duration cap override |
| `scripts/transcribe.py` | model | `base` | Whisper model (`tiny`/`base`/`small`/`medium`) |
| `scripts/watch.mjs` | `POLL_MS` | `2000` | Watch poll interval (ms) |
| `scripts/watch.mjs` | `TIMEOUT_MS` | `300000` | Per-operation timeout (ms) |

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `ffmpeg not found` | `brew install ffmpeg` |
| `whisper not installed` | `pip3 install openai-whisper` |
| `librosa not installed` | `pip3 install librosa soundfile` |
| `input file not found` | Verify file is in `input/` and path is correct |
| Whisper hangs on first run | Downloading model (~150MB) — wait, requires internet once |
| Watch fails mid-run | Source clip stays in `input/processed/` only on success; re-copy to `input/` to retry |
| Studio shows blank frame | Check `data/manifest.json` is valid JSON |
| Render output has no captions | Run `npm run manifest` after transcribing — transcript must be embedded |
