#!/usr/bin/env python3
"""
Transcribe a local video file to data/transcript.json using OpenAI Whisper.

Usage:
    python3 scripts/transcribe.py                    # uses input/video.mp4
    python3 scripts/transcribe.py input/myclip.mp4   # explicit path

Output: data/transcript.json (seconds-based, matches src/lib/transcript.ts schema)

Install once:
    pip3 install openai-whisper
"""

import sys
import json
import os
import shutil

def main():
    if not shutil.which("ffmpeg"):
        print("ERROR: ffmpeg not found in PATH. Install: brew install ffmpeg")
        sys.exit(1)

    input_path = sys.argv[1] if len(sys.argv) > 1 else "input/video.mp4"

    if not os.path.exists(input_path):
        print(f"ERROR: input file not found: {input_path}")
        sys.exit(1)

    try:
        import whisper
    except ImportError:
        print("ERROR: whisper not installed. Run: pip3 install openai-whisper")
        sys.exit(1)

    print(f"Loading Whisper model (base)...")
    model = whisper.load_model("base")

    print(f"Transcribing: {input_path}")
    result = model.transcribe(input_path, word_timestamps=False)

    captions = [
        {
            "start": round(seg["start"], 3),
            "end": round(seg["end"], 3),
            "text": seg["text"].strip(),
        }
        for seg in result["segments"]
    ]

    transcript = {"fps": 30, "captions": captions}

    os.makedirs("data", exist_ok=True)
    out_path = "data/transcript.json"
    with open(out_path, "w") as f:
        json.dump(transcript, f, indent=2)

    print(f"Done. {len(captions)} captions written to {out_path}")


if __name__ == "__main__":
    main()
