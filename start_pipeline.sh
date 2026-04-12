#!/bin/bash
# One-command startup for the local video pipeline.
# Usage: ./start_pipeline.sh

set -e
cd "$(dirname "$0")"

# Activate Python venv if present
if [ -d .venv ]; then
  source .venv/bin/activate
fi

npm run setup
npm run watch
