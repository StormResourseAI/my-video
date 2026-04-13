#!/usr/bin/env python3
"""
Extract beat timestamps from a music track or video file.

Convention: place your music track at input/music.mp3 (or .wav/.m4a/.aiff).

Usage:
    python3 scripts/extract_beats.py                         # uses input/music.mp3
    python3 scripts/extract_beats.py input/track.wav         # explicit path

Output: data/beats.json

Install once:
    pip3 install librosa soundfile
"""

import sys
import json
import os
import shutil
import tempfile
import subprocess

def main():
    if not shutil.which("ffmpeg"):
        print("ERROR: ffmpeg not found in PATH. Install: brew install ffmpeg")
        sys.exit(1)

    input_path = sys.argv[1] if len(sys.argv) > 1 else "input/music.mp3"

    if not os.path.exists(input_path):
        print(f"ERROR: input file not found: {input_path}")
        sys.exit(1)

    try:
        import librosa
    except ImportError:
        print("ERROR: librosa not installed. Run: pip3 install librosa soundfile")
        sys.exit(1)

    # Extract audio to temp wav via ffmpeg
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = tmp.name

    print(f"Extracting audio from: {input_path}")
    subprocess.run(
        ["ffmpeg", "-y", "-i", input_path, "-ac", "1", "-ar", "22050", tmp_path],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    print("Detecting beats...")
    y, sr = librosa.load(tmp_path, sr=22050)
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    beat_times = librosa.frames_to_time(beat_frames, sr=sr).tolist()

    os.unlink(tmp_path)

    bpm = float(round(float(tempo) if hasattr(tempo, "__float__") else tempo.item(), 2))

    result = {
        "fps": 30,
        "bpm": bpm,
        "beats": [round(t, 3) for t in beat_times],
    }

    os.makedirs("data", exist_ok=True)
    out_path = "data/beats.json"
    with open(out_path, "w") as f:
        json.dump(result, f, indent=2)

    print(f"Done. {len(beat_times)} beats at {bpm} BPM → {out_path}")


if __name__ == "__main__":
    main()
