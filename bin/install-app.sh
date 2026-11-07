#!/usr/bin/env bash
# Compila o TimeTracker.app e instala em /Applications (substitui a versão anterior).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

npm run app:build

APP="$(find release -maxdepth 2 -name 'TimeTracker.app' -type d | head -1)"
if [ -z "$APP" ]; then
  echo "✗ TimeTracker.app não foi gerado em release/" >&2
  exit 1
fi

if pgrep -f "/Applications/TimeTracker.app/Contents/MacOS/" >/dev/null; then
  echo "… fechando o TimeTracker aberto"
  osascript -e 'quit app "TimeTracker"' || true
  sleep 2
fi

rm -rf /Applications/TimeTracker.app
cp -R "$APP" /Applications/
# web build again (app:build wrote the Electron renderer into dist/)
npm run build:web >/dev/null
echo "✓ instalado em /Applications/TimeTracker.app"
