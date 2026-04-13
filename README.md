# my-video — Local Short-Form Video Pipeline

Automated local pipeline: drop footage → transcribe → score → render branded 9:16 video.

---

## One-Time Setup

```bash
npm i
pip3 install openai-whisper librosa soundfile
npm run setup        # validates dirs + dependencies
```

`npm run setup` will tell you if ffmpeg is missing (`brew install ffmpeg`).

---

## Quick Start

```bash
./start_pipeline.sh
# Drop .mp4/.mov/.mkv/.webm into input/ — pipeline runs automatically
```

1. Transcribes each clip → `data/transcripts/<file>.json`
2. Scores clips (duration fit, speech density, filename)
3. Rebuilds `data/manifest.json`
4. Renders → `output/multi.mp4`
5. Moves source to `input/processed/`
6. Opens output in QuickTime

---

## Preset Usage

Presets live in `data/profiles/` and control all visual + timing settings.

```bash
# Switch preset (copies to data/style-profile.json)
npm run preset -- default
npm run preset -- client-a
npm run preset -- client-b

# Missing preset falls back to default with a warning
```

**Render with a specific preset:**
```bash
npm run preset -- client-a
npm run manifest
npm run render:multi
```

**Create a new preset:**
```bash
cp data/profiles/default.json data/profiles/my-client.json
# Edit my-client.json — all sections optional (missing keys use defaults)
npm run preset -- my-client
```

---

## Batch Workflow

Drop all clips at once — the watcher batches automatically:

```bash
./start_pipeline.sh
# Transcribes each clip in sequence
# Rebuilds manifest once for the full batch
# Renders once → output/multi.mp4
```

Bad files are skipped with a warning; the rest of the batch continues.

**Manual batch:**
```bash
# Transcribe each clip
python3 scripts/transcribe.py input/clip1.mp4 data/transcripts/clip1.mp4.json
# ... repeat for each clip
npm run manifest     # rebuilds once
npm run render:multi
```

**Clip scoring + selection** — keep only the best clips:
```json
// data/style-profile.json
"selection": { "mode": "top", "topN": 6 }
```

Scores: duration fit (±3), transcript presence (+2), speech density (+1/+2), filename penalty (-2 for test/backup/tmp).

---

## Variants

Generate 3 cut variants from one batch:

```bash
npm run render:variants
# → output/multi-a.mp4   (original order)
# → output/multi-b.mp4   (reversed, 5s clip cap)
# → output/multi-c.mp4   (top clips by score, 4s cap)
```

Edit `data/variants.json` to customize each variant's hook text, clip order, clip limit, and pacing cap.

---

## Delivery Workflow

Package rendered outputs into a timestamped delivery folder:

```bash
npm run deliver
# → deliveries/2024-01-15-1430/
#     multi-default.mp4
#     delivery.md

# Tag with client name
npm run deliver -- --client acme
# → deliveries/2024-01-15-1430-acme/
```

`delivery.md` records the preset, timestamp, and exact commands to reproduce.

**Full client delivery workflow:**
```bash
npm run preset -- client-a
npm run manifest
npm run render:multi
npm run render:variants
npm run deliver -- --client acme
# Share the deliveries/2024-01-15-1430-acme/ folder
```

---

## Desktop Shortcuts (optional, macOS)

```bash
ln -s "$(pwd)/input"      ~/Desktop/DROP_CLIPS_HERE
ln -s "$(pwd)/deliveries" ~/Desktop/CLIENT_DELIVERIES
```

---

## Directory Structure

```
input/                  Drop raw video files here
  processed/            Source clips moved here after render
  music.mp3             Optional background music track
output/                 Rendered outputs
  multi.mp4             Latest multi-clip render
  multi-a/b/c.mp4       Variant renders
deliveries/             Packaged client deliveries (timestamped)
  2024-01-15-1430/
    multi-default.mp4
    delivery.md
data/                   Auto-generated metadata
  manifest.json         Clip list, durations, scores, inline transcripts
  style-profile.json    Active style profile (set by npm run preset)
  beats.json            Beat timestamps + BPM
  variants.json         Variant render definitions
  profiles/             Named presets
    default.json
    client-a.json
    client-b.json
  transcripts/          Per-clip Whisper output
src/                    Remotion components + lib
scripts/                Local automation
```

---

## Configuration Reference

| File | Key | Default | Description |
|------|-----|---------|-------------|
| `data/style-profile.json` | `pacing.maxClipSec` | `7` | Max clip duration |
| `data/style-profile.json` | `pacing.minClipSec` | `1.5` | Min clip duration |
| `data/style-profile.json` | `beatSync.enabled` | `true` | Snap cuts to beats |
| `data/style-profile.json` | `transition.durationSec` | `0.3` | Crossfade length |
| `data/style-profile.json` | `hook.enabled` | `true` | Show hook overlay |
| `data/style-profile.json` | `hook.text` | `"You need to see this."` | Hook overlay text |
| `data/style-profile.json` | `audio.musicVolume` | `0.3` | Music track volume |
| `data/style-profile.json` | `audio.duckedVolume` | `0.07` | Volume during speech |
| `data/style-profile.json` | `selection.mode` | `"all"` | `"all"` or `"top"` |
| `data/style-profile.json` | `selection.topN` | `5` | Clips kept in top mode |
| `data/manifest.json` | `usableStartSec` | `null` | Per-clip start trim override |
| `data/manifest.json` | `usableEndSec` | `null` | Per-clip end trim override |
| `data/manifest.json` | `maxClipSec` | `null` | Per-clip duration cap override |
| `scripts/transcribe.py` | model | `base` | Whisper model size |

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `ffmpeg not found` | `brew install ffmpeg` |
| `whisper not installed` | `pip3 install openai-whisper` |
| `librosa not installed` | `pip3 install librosa soundfile` |
| Clip skipped in manifest | ffprobe failed — check file isn't corrupt |
| Watch fails mid-run | Re-copy the file into `input/` to retry |
| Render has no captions | Run `npm run manifest` after transcribing |
| Studio shows blank frame | Check `data/manifest.json` is valid JSON |
| Preset not found | Check `data/profiles/` — falls back to `default` |
| Delivery folder empty | Run `render:multi` before `deliver` |
| Whisper hangs on first run | Downloading model (~150MB) — needs internet once |
