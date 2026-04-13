#!/usr/bin/env bash
# ingest_media.sh
# Recursively scan ~/Downloads for video + audio files and copy into ~/my-video/input/.
# Skips files already present. Moves originals to ~/Downloads/_INGESTED/ on success.

set -euo pipefail

DOWNLOADS_DIR="$HOME/Downloads"
INPUT_DIR="$HOME/my-video/input"
INGESTED_DIR="$HOME/Downloads/_INGESTED"

VIDEO_COPIED=0
AUDIO_COPIED=0

mkdir -p "$INPUT_DIR"
mkdir -p "$INGESTED_DIR"

# Collect matching files via find (handles spaces in paths safely)
while IFS= read -r -d '' filepath; do
  filename="$(basename "$filepath")"
  dest="$INPUT_DIR/$filename"

  if [ -e "$dest" ]; then
    echo "[ingest] SKIP (exists): $filename"
    continue
  fi

  # Determine type for counter
  ext="${filename##*.}"
  ext_lower="$(echo "$ext" | tr '[:upper:]' '[:lower:]')"

  cp -- "$filepath" "$dest"
  echo "[ingest] COPY: $filename"

  # Move original to _INGESTED
  mv -- "$filepath" "$INGESTED_DIR/$filename"

  case "$ext_lower" in
    mp4|mov|mkv|webm)
      VIDEO_COPIED=$((VIDEO_COPIED + 1))
      ;;
    mp3|wav)
      AUDIO_COPIED=$((AUDIO_COPIED + 1))
      ;;
  esac

done < <(find "$DOWNLOADS_DIR" \
  \( -name "*.mp4" \
     -o -name "*.mov" \
     -o -name "*.MOV" \
     -o -name "*.mkv" \
     -o -name "*.webm" \
     -o -name "*.mp3" \
     -o -name "*.wav" \
  \) \
  -not -path "$INGESTED_DIR/*" \
  -print0)

echo ""
echo "[ingest] ── Summary ──────────────────"
echo "[ingest]   Videos copied : $VIDEO_COPIED"
echo "[ingest]   Audio copied  : $AUDIO_COPIED"
echo "[ingest]   Input folder  : $INPUT_DIR"
if [ $((VIDEO_COPIED + AUDIO_COPIED)) -eq 0 ]; then
  echo "[ingest]   Nothing new to ingest."
fi
