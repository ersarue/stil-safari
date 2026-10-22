#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="${1:-}"

if [[ -z "$APP" || ! -d "$APP" ]]; then
  echo "Usage: $0 path/to/Stil.app" >&2
  exit 1
fi

EXT="$(find "$APP/Contents/PlugIns" -name '*.appex' -type d -print -quit)"
if [[ -z "$EXT" || ! -d "$EXT" ]]; then
  echo "No Safari extension found inside $APP" >&2
  exit 1
fi

# Ad-hoc signing is enough for Safari and pluginkit to discover a locally
# installed extension. It is not a Developer ID signature and does not
# satisfy Gatekeeper or notarization.
codesign --force --sign - \
  --entitlements "$ROOT/scripts/entitlements/extension.entitlements" \
  --timestamp=none "$EXT"
codesign --force --sign - \
  --entitlements "$ROOT/scripts/entitlements/app.entitlements" \
  --timestamp=none "$APP"

codesign --verify --deep --strict --verbose=2 "$APP"
echo "Ad-hoc signed: $APP"
