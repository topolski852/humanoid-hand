#!/usr/bin/env bash
# Stage the in-browser hand-tracking assets into app/public/ (served locally so
# the app works offline and within the CSP — no CDN). Run once after `npm install`.
set -e
cd "$(dirname "$0")/.."

mkdir -p public/mediapipe public/models

# MediaPipe Tasks-Vision WASM runtime (from the installed package)
cp -r node_modules/@mediapipe/tasks-vision/wasm public/mediapipe/wasm

# Hand landmark model (~7.5 MB)
if [ ! -f public/models/hand_landmarker.task ]; then
  curl -L -o public/models/hand_landmarker.task \
    https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
fi

echo "Tracking assets ready in app/public/{mediapipe,models}/"
